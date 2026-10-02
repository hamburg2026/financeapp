import Foundation

// Formatierung wie in der Web-App (de-DE, EUR).

private let deLocale = Locale(identifier: "de_DE")

private let currencyFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = deLocale
    f.numberStyle = .currency
    f.currencyCode = "EUR"
    return f
}()

private var numberFormatters: [Int: NumberFormatter] = [:]

/// 1234.5 → "1.234,50 €"  (entspricht `fmt()` der Web-App)
func fmt(_ n: Double) -> String {
    currencyFormatter.string(from: NSNumber(value: n.isFinite ? n : 0)) ?? "\(n) €"
}

/// Betrag in beliebiger Währung, z. B. fmtCurrency(12.3, "USD") → "12,30 $"
func fmtCurrency(_ n: Double, _ code: String, decimals: Int = 2) -> String {
    let f = NumberFormatter()
    f.locale = deLocale
    f.numberStyle = .currency
    f.currencyCode = code
    f.minimumFractionDigits = decimals
    f.maximumFractionDigits = decimals
    return f.string(from: NSNumber(value: n)) ?? "\(n) \(code)"
}

/// 1234.5 → "1.234,50"  (entspricht `fmtNum()` der Web-App)
func fmtNum(_ n: Double, _ decimals: Int = 2) -> String {
    let f: NumberFormatter
    if let cached = numberFormatters[decimals] {
        f = cached
    } else {
        f = NumberFormatter()
        f.locale = deLocale
        f.numberStyle = .decimal
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        numberFormatters[decimals] = f
    }
    return f.string(from: NSNumber(value: n.isFinite ? n : 0)) ?? String(n)
}

/// Prozent: 3.456 → "3,46 %"
func fmtPct(_ n: Double, _ decimals: Int = 2) -> String { "\(fmtNum(n, decimals)) %" }

/// Mit Vorzeichen: +1.234,50 € / −12,00 €
func fmtSigned(_ n: Double) -> String { (n > 0 ? "+" : "") + fmt(n) }

/// Kompakt für Diagrammachsen: 1250000 → "1,3 Mio. €", 12500 → "12,5 Tsd. €"
func fmtCompact(_ n: Double) -> String {
    let a = abs(n)
    if a >= 1_000_000 { return "\(fmtNum(n / 1_000_000, 1)) Mio. €" }
    if a >= 10_000 { return "\(fmtNum(n / 1_000, 0)) Tsd. €" }
    return fmtNum(n, 0) + " €"
}

/// Liest eine Zahl aus Benutzereingaben ("1.234,56", "1234.56", "12,5").
func parseDecimal(_ s: String) -> Double? {
    var t = s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "€", with: "")
        .replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\u{00A0}", with: "")
    guard !t.isEmpty else { return nil }
    if t.contains(",") {
        t = t.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
    }
    return Double(t)
}

/// Zahl für Eingabefelder (deutsches Komma, ohne Tausenderpunkte, ohne überflüssige Nullen).
func editString(_ n: Double?, maxDecimals: Int = 4) -> String {
    guard let n, n.isFinite else { return "" }
    let f = NumberFormatter()
    f.locale = deLocale
    f.numberStyle = .decimal
    f.usesGroupingSeparator = false
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = maxDecimals
    return f.string(from: NSNumber(value: n)) ?? String(n)
}

// MARK: - Datum (ISO-Strings "YYYY-MM-DD" wie in der Web-App)

enum ISODates {
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.locale = deLocale
        c.firstWeekday = 2
        return c
    }

    /// Heutiges Datum als "YYYY-MM-DD".
    static func today() -> ISODate { formatter.string(from: Date()) }

    static func string(from date: Date) -> ISODate { formatter.string(from: date) }

    static func date(from iso: ISODate) -> Date? {
        guard iso.count >= 10 else { return nil }
        return formatter.date(from: String(iso.prefix(10)))
    }

    /// Jahr/Monat/Tag → ISO
    static func make(_ year: Int, _ month: Int, _ day: Int) -> ISODate {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    /// Letzter Tag eines Monats (month 1–12).
    static func lastDay(year: Int, month: Int) -> Int {
        let comps = DateComponents(year: year, month: month)
        guard let d = calendar.date(from: comps), let r = calendar.range(of: .day, in: .month, for: d) else { return 28 }
        return r.count
    }

    static func year(_ iso: ISODate) -> Int? { Int(iso.prefix(4)) }
    static func month(_ iso: ISODate) -> Int? { iso.count >= 7 ? Int(iso.dropFirst(5).prefix(2)) : nil }
    /// "YYYY-MM"
    static func monthKey(_ iso: ISODate) -> String { String(iso.prefix(7)) }

    /// Tage zwischen zwei ISO-Daten (b - a).
    static func daysBetween(_ a: ISODate, _ b: ISODate) -> Int? {
        guard let da = date(from: a), let db = date(from: b) else { return nil }
        return calendar.dateComponents([.day], from: da, to: db).day
    }

    static func adding(days: Int = 0, months: Int = 0, years: Int = 0, to iso: ISODate) -> ISODate {
        guard let d = date(from: iso) else { return iso }
        var comps = DateComponents()
        comps.day = days; comps.month = months; comps.year = years
        return string(from: calendar.date(byAdding: comps, to: d) ?? d)
    }
}

/// "2024-03-15" → "15.03.2024" ("–" bei leerem Wert)
func fmtDate(_ iso: ISODate?) -> String {
    guard let iso, iso.count >= 10 else { return "–" }
    let p = iso.prefix(10).split(separator: "-")
    guard p.count == 3 else { return iso }
    return "\(p[2]).\(p[1]).\(p[0])"
}

private let monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni",
                          "Juli", "August", "September", "Oktober", "November", "Dezember"]
private let monthShort = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

/// 3 → "März"
func monthName(_ month: Int) -> String { (1...12).contains(month) ? monthNames[month - 1] : "" }
/// 3 → "Mär"
func monthShortName(_ month: Int) -> String { (1...12).contains(month) ? monthShort[month - 1] : "" }

// MARK: - Zeiträume (Datumsdimensionen der Umsatzansicht)

enum DateDimension: String, CaseIterable, Identifiable {
    case thisMonth, lastMonth, thisQ, lastQ, thisYear, lastYear, all, custom

    var id: String { rawValue }

    static var selectable: [DateDimension] { allCases.filter { $0 != .custom } }

    var label: String {
        switch self {
        case .thisMonth: return "Dieser Monat"
        case .lastMonth: return "Letzter Monat"
        case .thisQ: return "Dieses Quartal"
        case .lastQ: return "Letztes Quartal"
        case .thisYear: return "Dieses Jahr"
        case .lastYear: return "Letztes Jahr"
        case .all: return "Alles"
        case .custom: return "Benutzerdefiniert"
        }
    }

    /// (von, bis) als ISO-Strings; ("", "") für "Alles".
    var range: (from: ISODate, to: ISODate) {
        let now = ISODates.calendar.dateComponents([.year, .month], from: Date())
        let y = now.year!, m = now.month! // m: 1–12
        let q = (m - 1) / 3               // 0–3
        func iso(_ yr: Int, _ mo: Int, _ d: Int) -> ISODate { ISODates.make(yr, mo, d) }
        func end(_ yr: Int, _ mo: Int) -> Int { ISODates.lastDay(year: yr, month: mo) }
        switch self {
        case .thisMonth:
            return (iso(y, m, 1), iso(y, m, end(y, m)))
        case .lastMonth:
            let lm = m == 1 ? 12 : m - 1, ly = m == 1 ? y - 1 : y
            return (iso(ly, lm, 1), iso(ly, lm, end(ly, lm)))
        case .thisQ:
            return (iso(y, q * 3 + 1, 1), iso(y, q * 3 + 3, end(y, q * 3 + 3)))
        case .lastQ:
            let lq = q == 0 ? 3 : q - 1, lqy = q == 0 ? y - 1 : y
            return (iso(lqy, lq * 3 + 1, 1), iso(lqy, lq * 3 + 3, end(lqy, lq * 3 + 3)))
        case .thisYear:
            return ("\(y)-01-01", "\(y)-12-31")
        case .lastYear:
            return ("\(y - 1)-01-01", "\(y - 1)-12-31")
        case .all, .custom:
            return ("", "")
        }
    }
}
