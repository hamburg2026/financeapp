import Foundation
import PDFKit

// Port der Parser aus src/components/PdfImport.jsx.
// Alle Regex-Muster entsprechen den JavaScript-Originalen. JavaScripts `\b` ist ASCII-basiert
// (Umlaute gelten nicht als Wortzeichen); ICU behandelt Umlaute als Wortzeichen. Damit das
// Verhalten identisch bleibt, wird `\b` durch `pdfImportWB` nachgebildet.

// MARK: - Datentypen

struct PdfImportParsedTx: Sendable {
    var date: ISODate
    var amount: Double
    var description: String
    var recipient: String
}

struct PdfImportFile: Identifiable, Sendable {
    let id = UUID()
    let name: String
    let data: Data
    var size: Int { data.count }
}

enum PdfImportBankType: String, CaseIterable, Identifiable, Sendable {
    case lufthansa, commerzbank, postbank
    var id: String { rawValue }
    var label: String {
        switch self {
        case .lufthansa: return "Lufthansa / Allgemein"
        case .commerzbank: return "Commerzbank"
        case .postbank: return "Postbank"
        }
    }
    var hint: String {
        switch self {
        case .commerzbank: return "PDF-Kontoauszüge und CSV-Exporte aus dem Commerzbank Online-Banking."
        case .postbank: return "CSV-Export aus dem Postbank Online-Banking (Umsatzübersicht, Semikolon-getrennt)."
        case .lufthansa: return "Universeller Parser: erkennt Datum und Betrag in mehrzeiligen Blöcken."
        }
    }
}

struct PdfImportError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: - Regex-Hilfen

fileprivate final class PdfImportRegex: @unchecked Sendable {
    let re: NSRegularExpression

    init(_ pattern: String, caseInsensitive: Bool = false) {
        // Muster sind fest codiert und getestet – ein Fehler wäre ein Programmierfehler.
        re = try! NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : [])
    }

    private func groups(_ m: NSTextCheckingResult, _ ns: NSString) -> [String?] {
        (0..<m.numberOfRanges).map { i -> String? in
            let r = m.range(at: i)
            return r.location == NSNotFound ? nil : ns.substring(with: r)
        }
    }

    func firstMatch(_ s: String) -> [String?]? {
        let ns = s as NSString
        guard let m = re.firstMatch(in: s, options: [], range: NSRange(location: 0, length: ns.length)) else { return nil }
        return groups(m, ns)
    }

    func allMatches(_ s: String) -> [[String?]] {
        let ns = s as NSString
        return re.matches(in: s, options: [], range: NSRange(location: 0, length: ns.length)).map { groups($0, ns) }
    }

    func test(_ s: String) -> Bool { firstMatch(s) != nil }

    func replaceAll(_ s: String, with replacement: String) -> String {
        let ns = s as NSString
        return re.stringByReplacingMatches(in: s, options: [], range: NSRange(location: 0, length: ns.length),
                                           withTemplate: NSRegularExpression.escapedTemplate(for: replacement))
    }
}

/// JavaScript-`\b` (ASCII-Wortgrenze).
fileprivate let pdfImportWB = #"(?:(?<=[A-Za-z0-9_])(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?=[A-Za-z0-9_]))"#

fileprivate let reGermanDate = PdfImportRegex(#"(\d{2})\.(\d{2})\.(\d{2,4})"#)
fileprivate let reThousandDot = PdfImportRegex(#"\.(?=\d{3}[,\d])"#)
fileprivate let reFloat = PdfImportRegex(#"^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?"#)
fileprivate let reCsvRecipient = PdfImportRegex(
    #"^(.*?)(?:\s+End-to-End-Ref\.|\s+Mandatsref|\s+Gläubiger-ID|\s+Kundenreferenz:|\s+SEPA-|\s+WPKNR:|\s+ISIN:|\s+NENNWERT:|\s+GESCH\.TG)"#)
fileprivate let reDateAnywhere = PdfImportRegex(pdfImportWB + #"(\d{2}\.\d{2}\.(?:20|19)?\d{2})"# + pdfImportWB)
fileprivate let reAmount = PdfImportRegex(#"(-?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*[-+SH]?)"#)
fileprivate let reDateLineStart = PdfImportRegex(#"^\s*\d{2}\.\d{2}\.\d{2,4}"#)
fileprivate let reWhitespaceRun = PdfImportRegex(#"\s+"#)
fileprivate let reLabeledRecipient = PdfImportRegex(
    #"(?:Auftraggeber|Zahlungsempfänger|Begünstigter|Empfänger)\s*[:/]\s*([^\n]+?)(?:\s{2,}|\s+(?:IBAN|BIC|Kto\.|Verwendungszweck|Mandats|Ref\.))"#,
    caseInsensitive: true)
fileprivate let reVisa = PdfImportRegex(
    pdfImportWB + #"VISA\s+([A-Z][A-Z0-9\s&\-.]{2,40}?)(?:\s+[A-Z]{2}"# + pdfImportWB + #"|\s{3,}|$)"#,
    caseInsensitive: true)
fileprivate let reCaps = PdfImportRegex(
    pdfImportWB + #"([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\-&.]{2,}(?:\s+[A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\-&.]{1,}){0,3})"# + pdfImportWB)
fileprivate let reDigits = PdfImportRegex(#"\d+"#)
fileprivate let reNonLetters = PdfImportRegex(#"[^a-zäöüß\s]"#)
fileprivate let rePostbankHeader = PdfImportRegex(#"^"?Buchungstag"?;"#)
fileprivate let rePostbankDate = PdfImportRegex(#"^(\d{1,2})\.(\d{1,2})\.(\d{4})$"#)
fileprivate let reYear = PdfImportRegex(pdfImportWB + #"(20\d{2})"# + pdfImportWB)
fileprivate let reCommerzbankTx = PdfImportRegex(
    #"^(.+)\s+(\d{2}\.\d{2})(?!\.\d)\s+(\d{1,3}(?:\.\d{3})*,\d{2}\s*-?)$"#)

// MARK: - JS-Nachbildungen

/// `String.prototype.trim()` (inkl. BOM).
fileprivate func pdfImportTrim(_ s: String) -> String {
    s.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}")))
}

/// `parseFloat()`: liest das längste gültige Zahlpräfix, sonst nil (NaN).
fileprivate func pdfImportParseFloat(_ str: String) -> Double? {
    let s = String(str.drop(while: { $0.isWhitespace }))
    guard let m = reFloat.firstMatch(s) else { return nil }
    let sign = m[1] ?? ""
    let intPart = m[2] ?? ""
    let fracPart = m[3] ?? ""
    guard !intPart.isEmpty || !fracPart.isEmpty else { return nil }
    let exp = m[4] ?? "0"
    let normalized = "\(sign == "-" ? "-" : "")\(intPart.isEmpty ? "0" : intPart).\(fracPart.isEmpty ? "0" : fracPart)e\(exp)"
    return Double(normalized)
}

/// `str.slice(0, n)`
fileprivate func pdfImportSlice(_ s: String, _ n: Int) -> String { String(s.prefix(n)) }

/// `text.split(/\r?\n/)`
fileprivate func pdfImportSplitLines(_ text: String) -> [String] {
    text.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
}

fileprivate func pdfImportRemoveWhitespace(_ s: String) -> String {
    String(s.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) }.map(Character.init))
}

fileprivate func pdfImportReplaceFirstComma(_ s: String) -> String {
    var t = s
    if let r = t.range(of: ",") { t.replaceSubrange(r, with: ".") }
    return t
}

fileprivate func pdfImportCell(_ cells: [String], _ idx: Int) -> String? {
    (idx >= 0 && idx < cells.count) ? cells[idx] : nil
}

// MARK: - Grundfunktionen (1:1 aus der Web-App)

fileprivate func pdfImportParseGermanDate(_ str: String) -> ISODate? {
    guard let m = reGermanDate.firstMatch(str), let d = m[1], let mo = m[2], var y = m[3] else { return nil }
    if y.count == 2 { y = (Int(y) ?? 0) >= 50 ? "19" + y : "20" + y }
    return "\(y)-\(mo)-\(d)"
}

fileprivate func pdfImportParseGermanAmount(_ str: String?) -> Double? {
    guard let str, !str.isEmpty else { return nil }
    var s = pdfImportRemoveWhitespace(str)
    // S = Soll (negativ), H = Haben (positiv), nachgestelltes "-" = negativ
    if let last = s.last {
        if last == "-" || last == "S" {
            s = "-" + String(s.dropLast())
        } else if last == "H" || last == "+" {
            s = String(s.dropLast())
        }
    }
    // Tausenderpunkte entfernen: "1.234,56" → "1234.56"
    s = reThousandDot.replaceAll(s, with: "")
    s = pdfImportReplaceFirstComma(s)
    return pdfImportParseFloat(s)
}

fileprivate func pdfImportSplitCsvLine(_ line: String, sep: Character = ";") -> [String] {
    var fields: [String] = []
    var cur = ""
    var inQ = false
    for ch in line {
        if ch == "\"" {
            inQ.toggle()
        } else if ch == sep && !inQ {
            fields.append(cur)
            cur = ""
        } else {
            cur.append(ch)
        }
    }
    fields.append(cur)
    return fields.map { f -> String in
        var t = pdfImportTrim(f)
        if t.hasPrefix("\"") { t.removeFirst() }
        if t.hasSuffix("\"") { t.removeLast() }
        return t
    }
}

fileprivate func pdfImportExtractCsvRecipient(_ buchungstext: String) -> String {
    let base: String
    if let m = reCsvRecipient.firstMatch(buchungstext), let g = m[1] {
        base = g
    } else {
        base = buchungstext
    }
    return pdfImportSlice(pdfImportTrim(base), 80)
}

// MARK: - CSV-Parser

fileprivate func pdfImportParseCsvCommerzbank(_ text: String) -> [PdfImportParsedTx] {
    let lines = pdfImportSplitLines(text)
    guard let headerIdx = lines.firstIndex(where: { $0.contains("Buchungstag") && $0.contains("Buchungstext") }) else {
        return []
    }
    let header = pdfImportSplitCsvLine(lines[headerIdx])
    func col(_ name: String) -> Int { header.firstIndex(where: { $0.contains(name) }) ?? -1 }
    let colDate = col("Buchungstag"), colText = col("Buchungstext"), colAmt = col("Betrag")
    if colDate == -1 || colText == -1 || colAmt == -1 { return [] }
    var results: [PdfImportParsedTx] = []
    var i = headerIdx + 1
    while i < lines.count {
        defer { i += 1 }
        let cells = pdfImportSplitCsvLine(lines[i])
        if cells.count <= colAmt { continue }
        guard let rawDate = pdfImportCell(cells, colDate), let date = pdfImportParseGermanDate(rawDate) else { continue }
        guard let amount = pdfImportParseGermanAmount(cells[colAmt]) else { continue }
        let buchungstext = pdfImportCell(cells, colText) ?? ""
        let desc = pdfImportSlice(buchungstext, 250)
        results.append(PdfImportParsedTx(date: date, amount: amount,
                                         description: desc.isEmpty ? "–" : desc,
                                         recipient: pdfImportExtractCsvRecipient(buchungstext)))
    }
    return results
}

fileprivate func pdfImportParsePostbankAmount(_ str: String?) -> Double? {
    guard let str, !str.isEmpty else { return nil }
    var s = pdfImportRemoveWhitespace(str)
    if s.isEmpty || s == "-" { return nil }
    if s.hasSuffix("-") { s = "-" + String(s.dropLast()) }
    // Deutsches Format: Komma = Dezimaltrenner, Punkt = Tausender
    if s.contains(",") {
        s = pdfImportReplaceFirstComma(s.replacingOccurrences(of: ".", with: ""))
    } else {
        s = s.replacingOccurrences(of: ".", with: "")
    }
    return pdfImportParseFloat(s)
}

fileprivate func pdfImportParseCsvPostbank(_ text: String) -> [PdfImportParsedTx] {
    let lines = pdfImportSplitLines(text)
    guard let headerIdx = lines.firstIndex(where: { rePostbankHeader.test($0) }) else { return [] }
    let header = pdfImportSplitCsvLine(lines[headerIdx])
    func col(_ name: String) -> Int {
        header.firstIndex(where: { h in
            var t = h
            if t.hasPrefix("\"") { t.removeFirst() }
            if t.hasSuffix("\"") { t.removeLast() }
            return pdfImportTrim(t) == name
        }) ?? -1
    }
    let colDate = col("Buchungstag")
    let colRecip = col("Begünstigter / Auftraggeber")
    let colDesc = col("Verwendungszweck")
    let colBetrag = col("Betrag")
    if colDate == -1 { return [] }

    var results: [PdfImportParsedTx] = []
    var i = headerIdx + 1
    while i < lines.count {
        defer { i += 1 }
        let line = pdfImportTrim(lines[i])
        if line.isEmpty { continue }
        let cells = pdfImportSplitCsvLine(line)
        if cells.count <= colDate { continue }
        guard let dm = rePostbankDate.firstMatch(cells[colDate]),
              let d = dm[1], let mo = dm[2], let y = dm[3] else { continue }
        let date = "\(y)-\(mo.count < 2 ? "0" + mo : mo)-\(d.count < 2 ? "0" + d : d)"
        let rawAmt = colBetrag != -1 ? pdfImportCell(cells, colBetrag) : ""
        guard let amount = pdfImportParsePostbankAmount(rawAmt), amount != 0 else { continue }
        let recipient = pdfImportSlice(colRecip != -1 ? (pdfImportCell(cells, colRecip) ?? "") : "", 80)
        let descRaw = pdfImportSlice(colDesc != -1 ? (pdfImportCell(cells, colDesc) ?? "") : "", 250)
        results.append(PdfImportParsedTx(date: date, amount: amount,
                                         description: descRaw.isEmpty ? "–" : descRaw,
                                         recipient: recipient))
    }
    return results
}

// MARK: - Empfänger-Heuristik

fileprivate func pdfImportSuggestRecipient(_ blockText: String) -> String {
    // "Auftraggeber: Name" / "Zahlungsempfänger: Name" …
    if let m = reLabeledRecipient.firstMatch(blockText), let g = m[1] {
        return pdfImportSlice(pdfImportTrim(g), 60)
    }
    // Kreditkarte: "VISA HÄNDLERNAME ORT"
    if let m = reVisa.firstMatch(blockText), let g = m[1] {
        return pdfImportSlice(pdfImportTrim(g), 60)
    }
    // Fallback: erste Folge von Großbuchstaben-/Title-Case-Wörtern
    if let m = reCaps.firstMatch(blockText), let g = m[1], g.utf16.count >= 4 {
        return pdfImportSlice(pdfImportTrim(g), 60)
    }
    return ""
}

// MARK: - PDF-Parser

/// Universeller Parser (Lufthansa / Allgemein): Datum + Betrag in mehrzeiligen Blöcken.
fileprivate func pdfImportParseTransactions(_ lines: [String]) -> [PdfImportParsedTx] {
    var results: [PdfImportParsedTx] = []
    var i = 0
    while i < lines.count {
        let line = lines[i]
        guard let dm = reDateAnywhere.firstMatch(line), let ds = dm[1],
              let date = pdfImportParseGermanDate(ds) else {
            i += 1
            continue
        }

        // Diese Zeile + bis zu 6 Folgezeilen als Block
        var blockLines = [line]
        var j = i + 1
        while j < lines.count && j < i + 7 {
            let next = lines[j]
            if reDateLineStart.test(next) { break }
            blockLines.append(next)
            j += 1
        }
        let blockText = blockLines.joined(separator: " ")

        // Erster Betrag = Umsatzbetrag (zweiter ist oft der laufende Saldo)
        guard let am = reAmount.firstMatch(blockText),
              let amount = pdfImportParseGermanAmount(am[1]), amount != 0 else {
            i += 1
            continue
        }

        var desc = reDateAnywhere.replaceAll(blockText, with: "")
        desc = reAmount.replaceAll(desc, with: "")
        desc = pdfImportSlice(pdfImportTrim(reWhitespaceRun.replaceAll(desc, with: " ")), 250)

        results.append(PdfImportParsedTx(date: date, amount: amount,
                                         description: desc.isEmpty ? "–" : desc,
                                         recipient: pdfImportSuggestRecipient(blockText)))
        i += 1
    }
    return results
}

/// Commerzbank: erste Zeile eines Blocks = "Empfänger TT.MM Betrag", Folgezeilen = Buchungstext.
fileprivate func pdfImportParseCommerzbank(_ lines: [String]) -> [PdfImportParsedTx] {
    var year = String(Calendar(identifier: .gregorian).component(.year, from: Date()))
    for line in lines {
        if let m = reYear.firstMatch(line), let y = m[1] {
            year = y
            break
        }
    }

    struct TxLine { let lineIdx: Int; let date: ISODate; let amount: Double; let recipient: String }
    var txLines: [TxLine] = []
    for (i, line) in lines.enumerated() {
        guard let m = reCommerzbankTx.firstMatch(line), let recip = m[1], let dm = m[2], let amt = m[3] else { continue }
        guard let amount = pdfImportParseGermanAmount(pdfImportTrim(amt)), amount != 0 else { continue }
        let parts = dm.split(separator: ".")
        guard parts.count == 2 else { continue }
        txLines.append(TxLine(lineIdx: i, date: "\(year)-\(parts[1])-\(parts[0])", amount: amount,
                              recipient: pdfImportSlice(pdfImportTrim(recip), 80)))
    }

    var results: [PdfImportParsedTx] = []
    for (ti, tx) in txLines.enumerated() {
        let nextLineIdx = ti + 1 < txLines.count ? txLines[ti + 1].lineIdx : lines.count
        var contLines: [String] = []
        var j = tx.lineIdx + 1
        while j < nextLineIdx {
            let txt = pdfImportTrim(lines[j])
            if !txt.isEmpty && !txt.hasPrefix("Buchungsdatum:") && !txt.hasPrefix("Angaben zu den") {
                contLines.append(txt)
            }
            j += 1
        }
        var description = pdfImportSlice(pdfImportTrim(reWhitespaceRun.replaceAll(contLines.joined(separator: " "), with: " ")), 250)
        if description.isEmpty { description = tx.recipient }
        results.append(PdfImportParsedTx(date: tx.date, amount: tx.amount,
                                         description: description.isEmpty ? "–" : description,
                                         recipient: tx.recipient))
    }
    return results
}

// MARK: - PDF-Textextraktion (PDFKit statt pdf.js)

fileprivate struct PdfImportGlyph {
    let x: CGFloat
    let maxX: CGFloat
    let y: CGFloat
    let height: CGFloat
    let text: String
}

/// Rekonstruiert Textzeilen wie die Web-App: Zeichen werden nach ihrer y-Position zu Zeilen
/// gruppiert (oben → unten) und innerhalb einer Zeile nach x sortiert (links → rechts).
/// pdf.js liefert Textstücke mit Positionen; PDFKit liefert den Seitentext, dessen Zeichenpositionen
/// über `characterBounds(at:)` ermittelt werden. Zwischen Zeichen mit sichtbarem Abstand wird ein
/// Leerzeichen eingefügt (entspricht dem `join(' ')` der Textstücke in der Web-App).
fileprivate func pdfImportPageLines(_ page: PDFPage) -> [String] {
    guard let str = page.string, !str.isEmpty else { return [] }
    let ns = str as NSString
    var glyphs: [PdfImportGlyph] = []
    glyphs.reserveCapacity(ns.length)
    var idx = 0
    while idx < ns.length {
        let r = ns.rangeOfComposedCharacterSequence(at: idx)
        idx = r.location + r.length
        let ch = ns.substring(with: r)
        if ch.rangeOfCharacter(from: .newlines) != nil { continue }
        let isSpace = ch.rangeOfCharacter(from: CharacterSet.whitespaces.inverted) == nil
        let b = page.characterBounds(at: r.location)
        if b.isNull || b.isInfinite || b.height <= 0 { continue }
        if isSpace && b.width <= 0 { continue }
        glyphs.append(PdfImportGlyph(x: b.minX, maxX: b.maxX, y: b.minY, height: b.height,
                                     text: isSpace ? " " : ch))
    }

    // Fallback: keine Positionsdaten → Zeilen des Seitentexts verwenden
    if glyphs.isEmpty {
        return str.components(separatedBy: .newlines).map(pdfImportTrim).filter { !$0.isEmpty }
    }

    // Zeilen bilden (PDF-Koordinaten: größeres y = weiter oben). Toleranz 2 pt statt exakter
    // Rundung, da Glyphenrahmen je nach Schriftgröße leicht unterschiedliche Unterkanten haben.
    let sorted = glyphs.enumerated().sorted { a, b in
        a.element.y != b.element.y ? a.element.y > b.element.y : a.offset < b.offset
    }.map { $0.element }
    var rows: [[PdfImportGlyph]] = []
    var rowY: CGFloat = 0
    for g in sorted {
        if !rows.isEmpty && abs(g.y - rowY) <= 2.0 {
            rows[rows.count - 1].append(g)
        } else {
            rows.append([g])
            rowY = g.y
        }
    }

    var lines: [String] = []
    for row in rows {
        let ordered = row.enumerated().sorted { a, b in
            a.element.x != b.element.x ? a.element.x < b.element.x : a.offset < b.offset
        }.map { $0.element }
        var text = ""
        var prev: PdfImportGlyph?
        for g in ordered {
            if let p = prev {
                let gap = g.x - p.maxX
                let threshold = max(0.8, min(p.height, g.height) * 0.12)
                if gap > threshold && p.text != " " && g.text != " " { text += " " }
            }
            text += g.text
            prev = g
        }
        let line = pdfImportTrim(text).precomposedStringWithCanonicalMapping
        if !line.isEmpty { lines.append(line) }
    }
    return lines
}

fileprivate func pdfImportExtractPdfLines(_ data: Data, fileName: String) throws -> [String] {
    guard let doc = PDFDocument(data: data) else {
        throw PdfImportError(message: "„\(fileName)“ ist keine gültige PDF-Datei.")
    }
    if doc.isLocked {
        throw PdfImportError(message: "„\(fileName)“ ist passwortgeschützt.")
    }
    var all: [String] = []
    for p in 0..<doc.pageCount {
        guard let page = doc.page(at: p) else { continue }
        all.append(contentsOf: pdfImportPageLines(page))
    }
    return all
}

fileprivate func pdfImportDecodeText(_ data: Data) -> String {
    var text = String(data: data, encoding: .utf8)
        ?? String(data: data, encoding: .windowsCP1252)
        ?? String(decoding: data, as: UTF8.self)
    if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
    return text
}

/// Liest eine Datei (CSV oder PDF) mit dem zum Format passenden Parser.
func pdfImportParseFile(_ file: PdfImportFile, bankType: PdfImportBankType) throws -> [PdfImportParsedTx] {
    if file.name.lowercased().hasSuffix(".csv") {
        let text = pdfImportDecodeText(file.data)
        return bankType == .postbank ? pdfImportParseCsvPostbank(text) : pdfImportParseCsvCommerzbank(text)
    }
    let lines = try pdfImportExtractPdfLines(file.data, fileName: file.name)
    return bankType == .commerzbank ? pdfImportParseCommerzbank(lines) : pdfImportParseTransactions(lines)
}

// MARK: - Duplikate

func pdfImportIsDuplicate(_ tx: PdfImportParsedTx, date: ISODate, amount: Double) -> Bool {
    tx.date == date && abs(tx.amount - amount) < 0.005
}

// MARK: - Automatische Kategorisierung

fileprivate func pdfImportNormalize(_ text: String) -> String {
    var s = text.lowercased()
    s = reDigits.replaceAll(s, with: "")
    s = reNonLetters.replaceAll(s, with: " ")
    s = reWhitespaceRun.replaceAll(s, with: " ")
    return pdfImportTrim(s)
}

fileprivate func pdfImportWordSet(_ s: String) -> Set<String> {
    Set(s.split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { $0.count >= 3 })
}

/// Zähler mit Einfügereihenfolge (wie JS-Objekte), damit Gleichstände identisch aufgelöst werden.
fileprivate struct PdfImportOrderedCounts {
    var keys: [String] = []
    var values: [String: Double] = [:]

    mutating func add(_ key: String, _ value: Double) {
        if let v = values[key] {
            values[key] = v + value
        } else {
            keys.append(key)
            values[key] = value
        }
    }
}

struct PdfImportCategoryLookup {
    fileprivate struct Entry {
        let words: Set<String>
        var cats = PdfImportOrderedCounts()
    }

    fileprivate var recipientEntries: [Entry] = []
    fileprivate var textEntries: [Entry] = []

    init(transactions: [BankTransaction]) {
        var recIndex: [String: Int] = [:]
        var txtIndex: [String: Int] = [:]
        for tx in transactions where !tx.category.isEmpty {
            let recNorm = pdfImportNormalize(tx.recipient)
            if recNorm.utf16.count >= 4 {
                let idx: Int
                if let existing = recIndex[recNorm] {
                    idx = existing
                } else {
                    idx = recipientEntries.count
                    recIndex[recNorm] = idx
                    recipientEntries.append(Entry(words: pdfImportWordSet(recNorm)))
                }
                recipientEntries[idx].cats.add(tx.category, 1)
            }
            let txtNorm = pdfImportNormalize(tx.description + " " + tx.recipient)
            if !txtNorm.isEmpty {
                let idx: Int
                if let existing = txtIndex[txtNorm] {
                    idx = existing
                } else {
                    idx = textEntries.count
                    txtIndex[txtNorm] = idx
                    textEntries.append(Entry(words: pdfImportWordSet(txtNorm)))
                }
                textEntries[idx].cats.add(tx.category, 1)
            }
        }
    }

    /// Vorschlag wie `suggestCategory()`: Empfänger-Treffer 3-fach, Text-Treffer 1-fach gewichtet.
    func suggest(description: String, recipient: String) -> String {
        var scores = PdfImportOrderedCounts()
        let normRecip = pdfImportNormalize(recipient)
        if normRecip.utf16.count >= 4 {
            let rWords = pdfImportWordSet(normRecip)
            for e in recipientEntries {
                if e.words.isEmpty || rWords.isEmpty { continue }
                let common = rWords.filter { e.words.contains($0) }.count
                if common == 0 { continue }
                let sim = Double(common) / Double(max(rWords.count, e.words.count))
                for cat in e.cats.keys {
                    scores.add(cat, sim * (e.cats.values[cat] ?? 0) * 3)
                }
            }
        }
        let query = pdfImportNormalize(description + " " + recipient)
        let qWords = pdfImportWordSet(query)
        if !qWords.isEmpty {
            for e in textEntries {
                let common = qWords.filter { e.words.contains($0) }.count
                if common == 0 { continue }
                let sim = Double(common) / Double(max(qWords.count, e.words.count))
                for cat in e.cats.keys {
                    scores.add(cat, sim * (e.cats.values[cat] ?? 0))
                }
            }
        }
        var best = ""
        var bestScore = -Double.infinity
        for key in scores.keys {
            let v = scores.values[key] ?? 0
            if v > bestScore {
                best = key
                bestScore = v
            }
        }
        return best
    }
}
