import Foundation

// HTML-Erzeugung für den Ausdruck – Port der Print-Ansicht aus `src/components/PrintDialog.jsx`
// (gleiche Abschnitte, Spalten, Berechnungen und kompakte Druckstile).

/// Druckbare Bereiche (PRINT_SECTIONS, gleiche Reihenfolge).
enum PrintReportSection: String, CaseIterable, Identifiable, Hashable {
    case bankAccounts, insuranceContracts, securities, realEstate, companyShares
    case subscriptions, recurringPayments, serviceCosts, categories

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bankAccounts: return "Bankkonten"
        case .insuranceContracts: return "Versicherungen"
        case .securities: return "Wertpapiere & Depots"
        case .realEstate: return "Immobilien"
        case .companyShares: return "Firmenbeteiligungen"
        case .subscriptions: return "Abonnements"
        case .recurringPayments: return "Daueraufträge"
        case .serviceCosts: return "Dienstleistungskosten"
        case .categories: return "Kategorien"
        }
    }

    var icon: String {
        switch self {
        case .bankAccounts: return "🏦"
        case .insuranceContracts: return "🛡️"
        case .securities: return "📈"
        case .realEstate: return "🏠"
        case .companyShares: return "🏢"
        case .subscriptions: return "📱"
        case .recurringPayments: return "🔄"
        case .serviceCosts: return "🧹"
        case .categories: return "🏷️"
        }
    }
}

/// Filter für den Abschnitt Dienstleistungskosten.
struct PrintReportServiceFilter {
    var typeId: EntityID?
    var from: ISODate = ""
    var to: ISODate = ""

    /// Gefilterte Einträge, neueste zuerst (wie PrintServiceCosts).
    func apply(_ entries: [ServiceEntry]) -> [ServiceEntry] {
        entries
            .filter { e in
                if let typeId, e.serviceTypeId.key != typeId.key { return false }
                if !from.isEmpty && e.date < from { return false }
                if !to.isEmpty && e.date > to { return false }
                return true
            }
            .sorted { $0.date > $1.date }
    }
}

// MARK: - Hilfsfunktionen

fileprivate func printEsc(_ s: String) -> String {
    var r = ""
    r.reserveCapacity(s.count)
    for ch in s {
        switch ch {
        case "&": r += "&amp;"
        case "<": r += "&lt;"
        case ">": r += "&gt;"
        case "\"": r += "&quot;"
        case "'": r += "&#39;"
        default: r.append(ch)
        }
    }
    return r
}

/// isoToGerman: "2024-03-15" → "15.03.2024", sonst "–"
fileprivate func printGermanDate(_ iso: String) -> String {
    guard iso.count >= 10 else { return "–" }
    let p = iso.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
    guard p.count >= 3 else { return "–" }
    return "\(p[2]).\(p[1]).\(p[0])"
}

/// toLocaleString('de-DE', { maximumFractionDigits: 1 })
fileprivate let printPctFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = 1
    return f
}()

fileprivate func printOneDecimal(_ v: Double) -> String {
    printPctFormatter.string(from: NSNumber(value: v)) ?? String(v)
}

fileprivate let printStampFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.dateFormat = "dd.MM.yyyy, HH:mm"
    return f
}()

fileprivate func printEmpty(_ text: String) -> String {
    "<p class=\"empty\">\(printEsc(text))</p>"
}

/// PrintTable: kompakte Tabelle, leere Zellen ohne Wert → "–" (bereits von den Aufrufern gesetzt).
fileprivate func printTable(_ headers: [String], _ rows: [[String]], empty: String = "Keine Einträge vorhanden.") -> String {
    if rows.isEmpty { return printEmpty(empty) }
    var h = "<table class=\"pt\"><thead><tr>"
    for x in headers { h += "<th>\(printEsc(x))</th>" }
    h += "</tr></thead><tbody>"
    for r in rows {
        h += "<tr>"
        for c in r { h += "<td>\(printEsc(c))</td>" }
        h += "</tr>"
    }
    h += "</tbody></table>"
    return h
}

fileprivate func printSectionTitle(_ s: PrintReportSection) -> String {
    "<div class=\"st\"><h2>\(s.icon) \(printEsc(s.label))</h2></div>"
}

fileprivate func printOr(_ s: String, _ fallback: String = "–") -> String { s.isEmpty ? fallback : s }

// MARK: - Builder

@MainActor
enum PrintReportBuilder {
    static let css = """
    html { font-size: 12px; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; font-size: 0.72rem; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111827; padding-bottom: 0.25rem; margin-bottom: 0.2rem; }
    .hdr .t { font-size: 0.95rem; font-weight: 700; }
    .hdr .d { font-size: 0.65rem; color: #6b7280; }
    .inc { font-size: 0.63rem; color: #6b7280; margin-bottom: 0.35rem; }
    .st { display: flex; align-items: center; gap: 0.3rem; border-bottom: 1.5px solid #374151; padding-bottom: 0.18rem; margin-top: 0.9rem; margin-bottom: 0.3rem; page-break-after: avoid; break-after: avoid; }
    .st h2 { margin: 0; font-size: 0.82rem; font-weight: 700; color: #111827; }
    table.pt { width: 100%; border-collapse: collapse; font-size: 0.72rem; table-layout: auto; }
    table.fixed { table-layout: fixed; }
    th { padding: 0.15rem 0.35rem; background: #f3f4f6; border-bottom: 1px solid #d1d5db; border-right: 1px solid #e5e7eb; text-align: left; font-weight: 600; font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em; color: #4b5563; white-space: nowrap; }
    td { padding: 0.15rem 0.35rem; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #f3f4f6; font-size: 0.72rem; vertical-align: top; }
    th:last-child, td:last-child { border-right: none; }
    tbody tr:nth-child(odd) { background: #fff; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    td.ell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    td.b { font-weight: 600; }
    td.mono { font-family: Menlo, monospace; font-size: 0.68rem; }
    td.nw { white-space: nowrap; }
    .empty { font-size: 0.72rem; color: #6b7280; margin: 0.15rem 0 0.4rem; }
    .sub { font-size: 0.64rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin: 0.3rem 0 0.15rem; }
    .sub.dep { display: flex; justify-content: space-between; align-items: baseline; }
    .sub.dep .v { font-size: 0.7rem; font-weight: 700; color: #111827; text-transform: none; letter-spacing: 0; }
    .total { text-align: right; font-size: 0.77rem; font-weight: 700; padding: 0.2rem 0.5rem; border-top: 1px solid #d1d5db; }
    .cats { border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.4rem 0.65rem; }
    .cn .cn { margin-left: 12px; }
    .cl { padding: 0.12rem 0; font-size: 0.77rem; }
    .cl .arr { color: #9ca3af; font-size: 0.68rem; margin-right: 0.35rem; }
    .cl .ty { font-size: 0.65rem; color: #6b7280; font-style: italic; margin-left: 0.35rem; }
    """

    /// Vollständiges HTML-Dokument für die gewählten Bereiche.
    static func html(store: DataStore, selected: Set<PrintReportSection>,
                     serviceFilter: PrintReportServiceFilter, now: Date = Date()) -> String {
        let included = PrintReportSection.allCases.filter { selected.contains($0) }
        var body = ""
        body += "<div class=\"hdr\"><div class=\"t\">Finanzverwaltung – Ausdruck</div>"
        body += "<div class=\"d\">Stand: \(printEsc(printStampFormatter.string(from: now)))</div></div>"
        body += "<div class=\"inc\">Enthält: \(printEsc(included.map(\.label).joined(separator: " · ")))</div>"

        for s in included {
            body += printSectionTitle(s)
            switch s {
            case .bankAccounts: body += bankAccounts(store)
            case .insuranceContracts: body += insurances(store)
            case .securities: body += securities(store)
            case .realEstate: body += realEstate(store)
            case .companyShares: body += companyShares(store)
            case .subscriptions: body += subscriptions(store)
            case .recurringPayments: body += recurringPayments(store)
            case .serviceCosts: body += serviceCosts(store, serviceFilter)
            case .categories: body += categories(store)
            }
        }

        return """
        <!DOCTYPE html>
        <html lang="de"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Finanzverwaltung – Ausdruck</title>
        <style>\(css)</style></head>
        <body>\(body)</body></html>
        """
    }

    // MARK: Abschnitte

    private static func categoryName(_ store: DataStore, _ id: EntityID?) -> String {
        guard let id, let c = store.categories.first(where: { $0.id == id }) else { return "–" }
        return printOr(c.name)
    }

    static func bankAccounts(_ store: DataStore) -> String {
        printTable(["Kontoname", "Aktueller Saldo"],
                   store.bankAccounts.map { [$0.name, fmt($0.latestBalance)] })
    }

    private static let insuranceColumns: [(label: String, width: String)] = [
        ("Name", "19%"), ("Anbieter", "13%"), ("Vertrags-Nr.", "11%"), ("Prämie", "8%"), ("Rhythmus", "9%"),
        ("Status", "6%"), ("Verrentung", "10%"), ("Personen", "14%"), ("Kategorie", "10%"),
    ]

    static func insurances(_ store: DataStore) -> String {
        let contracts = store.insuranceContracts
        if contracts.isEmpty { return printEmpty("Keine Versicherungen vorhanden.") }
        var h = "<table class=\"pt fixed\"><colgroup>"
        for col in insuranceColumns { h += "<col style=\"width:\(col.width)\">" }
        h += "</colgroup><thead><tr>"
        for col in insuranceColumns { h += "<th>\(printEsc(col.label))</th>" }
        h += "</tr></thead><tbody>"
        for c in contracts {
            let annuity = c.isAnnuity
            let nurVer = c.isOnlyAnnuity
            let verLabel: String
            if c.verrentungTyp == .nichtRelevant { verLabel = "Nein" }
            else if nurVer { verLabel = "Nur Verr." }
            else if annuity { verLabel = "Ja" }
            else { verLabel = "–" }
            var rentInfo: String? = nil
            if annuity, let latest = c.latestValueEntry,
               let mult = latest.multiplikator, mult != 0,
               let rente = latest.garantierteJaehrlicheRente, rente != 0 {
                rentInfo = "\(fmt((latest.value / mult) * rente))/J."
            }
            // Web-App liest `c.persons` (existiert im Datenmodell nicht) – hier die gespeicherte Person.
            let personStr = printOr(c.person)
            let freq = c.premium > 0 ? c.premiumFrequency.label : "–"
            h += "<tr>"
            h += "<td class=\"b ell\">\(printEsc(c.displayName))</td>"
            h += "<td class=\"ell\">\(printEsc(printOr(c.provider)))</td>"
            h += "<td class=\"mono ell\">\(printEsc(printOr(c.vertragsnummer)))</td>"
            h += "<td class=\"nw\">\(c.premium > 0 ? printEsc(fmt(c.premium)) : "–")</td>"
            h += "<td>\(printEsc(freq))</td>"
            h += "<td>\(c.active ? "Aktiv" : "Inaktiv")</td>"
            h += "<td>\(printEsc(rentInfo.map { "\(verLabel) · \($0)" } ?? verLabel))</td>"
            h += "<td class=\"ell\">\(printEsc(personStr))</td>"
            h += "<td class=\"ell\">\(printEsc(categoryName(store, c.categoryId)))</td>"
            h += "</tr>"
        }
        h += "</tbody></table>"
        return h
    }

    private struct DepotRow {
        let secKey: String
        let sec: SecurityAsset?
        let quantity: Double
        let price: Double
        let curValue: Double
        let income: Double
    }

    /// getPositions aus PrintSecurities (Erträge: price − fees).
    private static func depotRows(_ store: DataStore, _ depot: Depot) -> [DepotRow] {
        var order: [String] = []
        var qty: [String: Double] = [:]
        var cost: [String: Double] = [:]
        var income: [String: Double] = [:]
        for t in store.depotTransactions where t.depotId.key == depot.id.key {
            let k = t.securityId.key
            if qty[k] == nil {
                order.append(k)
                qty[k] = 0; cost[k] = 0; income[k] = 0
            }
            switch t.type {
            case .buy:
                qty[k, default: 0] += t.quantity
                cost[k, default: 0] += t.quantity * t.price + t.fees
            case .sell:
                qty[k, default: 0] -= t.quantity
                cost[k, default: 0] -= t.quantity * t.price - t.fees
            case .dividend, .interest:
                income[k, default: 0] += t.price - t.fees
            }
        }
        return order.compactMap { k -> DepotRow? in
            let q = qty[k] ?? 0
            let inc = income[k] ?? 0
            guard q > 0.0001 || inc > 0 else { return nil }
            let sec = store.securities.first { $0.id.key == k }
            let price = store.securityPrices[k]?.latest?.value ?? 0
            return DepotRow(secKey: k, sec: sec, quantity: q, price: price, curValue: q * price, income: inc)
        }
    }

    static func securities(_ store: DataStore) -> String {
        let secs = store.securities
        let depots = store.depots
        if secs.isEmpty && depots.isEmpty { return printEmpty("Keine Wertpapiere oder Depots vorhanden.") }
        var h = ""
        if !secs.isEmpty {
            h += "<div class=\"sub\">Wertpapiere</div>"
            let rows: [[String]] = secs.map { s in
                let cur = printOr(s.currency, "EUR")
                let latest = store.prices(for: s.id).latest
                return [
                    s.name,
                    printOr(s.symbol),
                    printOr(s.isin),
                    printOr(s.type.rawValue),
                    cur,
                    latest.map { "\(fmtNum($0.value)) \(cur)" } ?? "–",
                    latest.map { printGermanDate($0.date) } ?? "–",
                ]
            }
            h += printTable(["Name", "Symbol", "ISIN", "Typ", "Währung", "Letzter Kurs", "Stand"], rows)
        }
        for d in depots {
            let positions = depotRows(store, d)
            let totalValue = positions.reduce(0.0) { $0 + $1.curValue }
            let totalIncome = positions.reduce(0.0) { $0 + $1.income }
            let marginTop = secs.isEmpty ? "0.3rem" : "0.55rem"
            var value = "Bestand: \(fmt(totalValue))"
            if totalIncome > 0 { value += " · Erträge: +\(fmt(totalIncome))" }
            h += "<div class=\"sub dep\" style=\"margin-top:\(marginTop)\"><span>Depot: \(printEsc(d.name))</span>"
            h += "<span class=\"v\">\(printEsc(value))</span></div>"
            let rows: [[String]] = positions.map { p in
                [
                    p.sec.map { printOr($0.name, p.secKey) } ?? p.secKey,
                    p.sec.map { printOr($0.isin) } ?? "–",
                    fmtNum(p.quantity, 4),
                    p.price > 0 ? fmt(p.price) : "–",
                    p.curValue > 0 ? fmt(p.curValue) : "–",
                ]
            }
            h += printTable(["Wertpapier", "ISIN", "Anzahl", "Kurs", "Bestand"], rows, empty: "Keine offenen Positionen.")
        }
        return h
    }

    static func realEstate(_ store: DataStore) -> String {
        let rows: [[String]] = store.realEstate.map { p in
            let current = p.currentValue
            let pnl = current - p.purchase
            var pnlStr = (pnl >= 0 ? "+" : "") + fmt(pnl)
            if p.purchase > 0 {
                let pct = pnl / p.purchase * 100
                pnlStr += " (\(pct >= 0 ? "+" : "")\(printOneDecimal(pct)) %)"
            }
            return [p.name, fmt(p.purchase), fmt(current), pnlStr, printOr(p.notes)]
        }
        return printTable(["Bezeichnung", "Anschaffungswert", "Aktueller Zeitwert", "G / V", "Notizen"], rows)
    }

    static func companyShares(_ store: DataStore) -> String {
        let shares = store.companyShares
        let total = shares.reduce(0.0) { $0 + $1.currentValue }
        var h = printTable(["Firma", "Beteiligung", "Aktueller Wert", "Notizen"],
                           shares.map { s in [s.company, "\(fmtNum(s.percentage)) %", fmt(s.currentValue), printOr(s.notes)] })
        if shares.count > 1 {
            h += "<div class=\"total\">Gesamt: \(printEsc(fmt(total)))</div>"
        }
        return h
    }

    static func subscriptions(_ store: DataStore) -> String {
        let rows: [[String]] = store.subscriptions.map { s in
            let cancel: String
            if !s.cancel.isEmpty {
                cancel = s.cancelDate.isEmpty ? "Ja" : "bis \(printGermanDate(s.cancelDate))"
            } else {
                cancel = "–"
            }
            return [s.name, fmt(s.cost), s.frequency.label, s.type.rawValue,
                    s.aktiv ? "Aktiv" : "Inaktiv", cancel, categoryName(store, s.categoryId)]
        }
        return printTable(["Name", "Betrag", "Häufigkeit", "Typ", "Status", "Kündigung", "Kategorie"], rows)
    }

    static func recurringPayments(_ store: DataStore) -> String {
        let rows: [[String]] = store.recurringPayments.map { r in
            let source = r.insuranceId != nil ? "Versicherung" : (r.subscriptionId != nil ? "Abonnement" : "Manuell")
            return [r.description, fmt(r.amount), r.frequency.label, r.type?.rawValue ?? "–",
                    categoryName(store, r.categoryId), source]
        }
        return printTable(["Beschreibung", "Betrag", "Häufigkeit", "Typ", "Kategorie", "Quelle"], rows)
    }

    static func serviceCosts(_ store: DataStore, _ filter: PrintReportServiceFilter) -> String {
        let filtered = filter.apply(store.serviceEntries)
        let total = filtered.reduce(0.0) { $0 + $1.total }
        let rows: [[String]] = filtered.map { e in
            let type = store.serviceTypes.first { $0.id == e.serviceTypeId }
            return [
                printGermanDate(e.date),
                type.map { printOr($0.name) } ?? "–",
                type?.unit ?? "",
                fmtNum(e.quantity, 2),
                fmt(e.pricePerUnit),
                fmt(e.total),
                e.status.rawValue,
                printOr(e.notes),
            ]
        }
        var h = printTable(["Datum", "Art der Dienstleistung", "Einheit", "Menge", "Preis/Einheit", "Summe", "Status", "Notizen"], rows)
        if !filtered.isEmpty {
            h += "<div class=\"total\">Gesamt (\(filtered.count) Einträge): \(printEsc(fmt(total)))</div>"
        }
        return h
    }

    static func categories(_ store: DataStore) -> String {
        let cats = store.categories
        if cats.isEmpty { return printEmpty("Keine Kategorien vorhanden.") }
        func tree(_ parent: EntityID?, _ depth: Int) -> String {
            guard depth < 64 else { return "" }
            var h = ""
            for c in cats where c.parent == parent {
                h += "<div class=\"cn\"><div class=\"cl\">"
                if depth > 0 { h += "<span class=\"arr\">└</span>" }
                h += "<span style=\"font-weight:\(depth == 0 ? 700 : 400)\">\(printEsc(c.name))</span>"
                h += "<span class=\"ty\">\(printEsc(c.type.rawValue))</span></div>"
                h += tree(c.id, depth + 1)
                h += "</div>"
            }
            return h
        }
        return "<div class=\"cats\">\(tree(nil, 0))</div>"
    }
}
