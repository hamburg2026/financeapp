import Foundation

// Netzwerkzugriffe des Wertpapiermoduls:
// - Yahoo Finance (Kurse, kein API-Key; auf iOS direkt ohne CORS-Proxy)
// - Frankfurter.app (Devisenkurse)
// - Yahoo-Finance-RSS (News, direkt per XMLParser statt rss2json)

struct SecuritiesNetworkError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct SecuritiesQuote: Sendable {
    let price: Double
    let date: ISODate
}

struct SecuritiesFxQuote: Sendable {
    let rate: Double
    let date: ISODate
}

struct SecuritiesNewsItem: Identifiable, Sendable {
    let id = UUID()
    let title: String
    let url: String
    let date: String
    let source: String
    let summary: String
}

// MARK: - Yahoo-JSON

private struct YahooChartResponse: Decodable {
    struct Chart: Decodable { let result: [ChartResult]? }
    struct ChartResult: Decodable {
        let timestamp: [Double]?
        let indicators: Indicators?
    }
    struct Indicators: Decodable {
        let adjclose: [AdjClose]?
        let quote: [Quote]?
    }
    struct AdjClose: Decodable { let adjclose: [Double?]? }
    struct Quote: Decodable { let close: [Double?]? }
    let chart: Chart?
}

private struct FrankfurterResponse: Decodable {
    let date: String?
    let rates: [String: Double]?
}

enum SecuritiesNetwork {
    /// Datum im UTC-Format wie `new Date(ts*1000).toISOString().slice(0,10)`.
    private static let utcDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func encode(_ s: String) -> String {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=?+/#")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }

    private static func fetchData(_ urlString: String, accept: String) async throws -> Data {
        guard let url = URL(string: urlString) else { throw SecuritiesNetworkError("Ungültige URL") }
        var req = URLRequest(url: url)
        req.timeoutInterval = 20
        req.setValue(accept, forHTTPHeaderField: "Accept")
        req.setValue("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                     forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw SecuritiesNetworkError("HTTP \(http.statusCode)")
        }
        return data
    }

    /// Letzter gültiger Schlusskurs von Yahoo Finance.
    /// Symbolformat: US-Aktien = "AAPL", Deutsche Aktien = "DTE.DE", ETFs = "VWCE.DE"
    static func fetchYahooPrice(symbol: String) async throws -> SecuritiesQuote {
        let url = "https://query1.finance.yahoo.com/v8/finance/chart/\(encode(symbol))?interval=1d&range=5d"
        let data = try await fetchData(url, accept: "application/json")
        let decoded: YahooChartResponse
        do {
            decoded = try JSONDecoder().decode(YahooChartResponse.self, from: data)
        } catch {
            throw SecuritiesNetworkError("Antwort von Yahoo Finance konnte nicht gelesen werden.")
        }
        guard let result = decoded.chart?.result?.first else {
            throw SecuritiesNetworkError("Keine Daten für „\(symbol)\" gefunden. Tipp: Deutsche Aktien = „DTE.DE\", ETFs = „VWCE.DE\"")
        }
        let timestamps = result.timestamp ?? []
        // wie in der Web-App: adjclose, sonst quote.close
        let closes: [Double?] = result.indicators?.adjclose?.first?.adjclose
            ?? result.indicators?.quote?.first?.close
            ?? []
        if timestamps.isEmpty || closes.isEmpty { throw SecuritiesNetworkError("Kursdaten leer.") }
        var i = timestamps.count - 1
        while i >= 0 {
            if i < closes.count, let c = closes[i] {
                let date = utcDateFormatter.string(from: Date(timeIntervalSince1970: timestamps[i]))
                return SecuritiesQuote(price: c, date: date)
            }
            i -= 1
        }
        throw SecuritiesNetworkError("Kein gültiger Schlusskurs in den Daten.")
    }

    /// Devisenkurs von Frankfurter.app: EUR je 1 Einheit Fremdwährung.
    static func fetchFrankfurterFx(pair: String) async throws -> SecuritiesFxQuote {
        let url = "https://api.frankfurter.app/latest?base=\(encode(pair))&symbols=EUR"
        let data = try await fetchData(url, accept: "application/json")
        let decoded = try? JSONDecoder().decode(FrankfurterResponse.self, from: data)
        guard let rate = decoded?.rates?["EUR"] else { throw SecuritiesNetworkError("Kurs nicht verfügbar") }
        let date = decoded?.date ?? ISODates.today()
        return SecuritiesFxQuote(rate: rate, date: date.isEmpty ? ISODates.today() : date)
    }

    /// Yahoo-Finance-RSS-Feed direkt laden und parsen (max. 8 Einträge).
    static func fetchNews(symbol: String) async throws -> [SecuritiesNewsItem] {
        let url = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=\(encode(symbol))&region=DE&lang=de-DE"
        let data = try await fetchData(url, accept: "application/rss+xml, application/xml, text/xml")
        let parser = SecuritiesRSSParser()
        let items = parser.parse(data)
        if items.isEmpty { throw SecuritiesNetworkError("Keine News gefunden.") }
        return Array(items.prefix(8)).map { raw in
            let summary = stripTags(raw.description)
            return SecuritiesNewsItem(
                title: raw.title.trimmingCharacters(in: .whitespacesAndNewlines),
                url: raw.link.trimmingCharacters(in: .whitespacesAndNewlines),
                date: isoDate(fromRSS: raw.pubDate),
                source: raw.author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? "Yahoo Finance" : raw.author.trimmingCharacters(in: .whitespacesAndNewlines),
                summary: String(summary.prefix(220))
            )
        }
    }

    private static func stripTags(_ s: String) -> String {
        let noTags = s.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        return noTags
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func isoDate(fromRSS s: String) -> String {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        for format in ["EEE, dd MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm:ss Z", "EEE, dd MMM yyyy HH:mm:ss zzz",
                       "dd MMM yyyy HH:mm:ss Z", "yyyy-MM-dd'T'HH:mm:ssZ", "yyyy-MM-dd HH:mm:ss"] {
            f.dateFormat = format
            if let d = f.date(from: t) { return utcDateFormatter.string(from: d) }
        }
        // ISO-artige Zeichenkette: ersten 10 Zeichen
        if t.count >= 10, t.prefix(4).allSatisfy({ $0.isNumber }) { return String(t.prefix(10)) }
        return ""
    }
}

// MARK: - RSS-Parser

private struct SecuritiesRawRSSItem {
    var title = ""
    var link = ""
    var pubDate = ""
    var description = ""
    var author = ""
}

private final class SecuritiesRSSParser: NSObject, XMLParserDelegate {
    private var items: [SecuritiesRawRSSItem] = []
    private var current: SecuritiesRawRSSItem?
    private var text = ""

    func parse(_ data: Data) -> [SecuritiesRawRSSItem] {
        let parser = XMLParser(data: data)
        parser.delegate = self
        parser.parse()
        return items
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        if elementName == "item" || elementName == "entry" { current = SecuritiesRawRSSItem() }
        if elementName == "link", current != nil, let href = attributeDict["href"] {
            current?.link = href
        }
        text = ""
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        text += string
    }

    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) {
        if let s = String(data: CDATABlock, encoding: .utf8) { text += s }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
                qualifiedName qName: String?) {
        guard current != nil else { return }
        let value = text
        switch elementName {
        case "title": current?.title = value
        case "link": if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { current?.link = value }
        case "pubDate", "published", "updated":
            if current?.pubDate.isEmpty ?? true { current?.pubDate = value }
        case "description", "summary": current?.description = value
        case "author", "dc:creator", "creator", "source":
            if current?.author.isEmpty ?? true { current?.author = value }
        case "item", "entry":
            if let c = current { items.append(c) }
            current = nil
        default: break
        }
        text = ""
    }
}
