import SwiftUI

// Gemeinsame Helfer des Wertpapiermoduls (alle mit Präfix "Securities").

/// Stückzahl wie `toLocaleString('de-DE', { maximumFractionDigits: 4 })`.
func securitiesQty(_ n: Double) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = 4
    return f.string(from: NSNumber(value: n.isFinite ? n : 0)) ?? String(n)
}

/// "+12,3 %" / "−4,0 %" (eine Nachkommastelle wie `toFixed(1)`).
func securitiesPct1(_ n: Double) -> String {
    (n >= 0 ? "+" : "") + fmtNum(n, 1) + " %"
}

/// "+1.234,00 €" für n ≥ 0 (wie `${n >= 0 ? '+' : ''}${fmt(n)}`).
func securitiesSignedMoney(_ n: Double) -> String {
    (n >= 0 ? "+" : "") + fmt(n)
}

/// Farben je Transaktionsart (TX_COLORS / TX_BG der Web-App).
enum SecuritiesTxStyle {
    static func color(_ t: DepotTxType) -> Color {
        switch t {
        case .buy: return Color(hex: 0x16a34a)
        case .sell: return Color(hex: 0xdc2626)
        case .dividend: return Color(hex: 0x2563eb)
        case .interest: return Color(hex: 0x7c3aed)
        }
    }

    static func background(_ t: DepotTxType) -> Color {
        switch t {
        case .buy: return Color(hex: 0xdcfce7)
        case .sell: return Color(hex: 0xfee2e2)
        case .dividend: return Color(hex: 0xdbeafe)
        case .interest: return Color(hex: 0xede9fe)
        }
    }

    /// Gesamtbetrag einer Transaktion wie in der Transaktionsliste der Web-App.
    static func total(_ t: DepotTransaction) -> Double {
        if t.type.isIncome { return t.price - t.fees }
        return t.quantity * t.price + (t.type == .buy ? t.fees : -t.fees)
    }
}

/// Aufbereitete Depotposition (wie `getDepotPositions` in Securities.jsx).
struct SecuritiesPositionRow: Identifiable {
    let securityId: EntityID
    let security: SecurityAsset?
    let quantity: Double
    let cost: Double
    let curPrice: Double?
    let curValue: Double
    let pnl: Double
    let pct: Double?
    let income: Double
    var id: EntityID { securityId }

    var name: String { security?.name ?? securityId.key }
    var avgPrice: Double { quantity > 0 ? cost / quantity : 0 }
}

enum SecuritiesCalc {
    /// Neuester Kurs (nach Datum) oder nil.
    static func currentPrice(_ prices: SecurityPrices, _ securityId: EntityID) -> Double? {
        guard let list = prices[securityId.key], !list.isEmpty else { return nil }
        return list.latest?.value
    }

    /// Positionen eines Depots – Filter (Menge > 0,0001 oder Erträge > 0), Sortierung nach Name (de).
    static func depotPositions(depotId: EntityID, transactions: [DepotTransaction],
                               securities: [SecurityAsset], prices: SecurityPrices) -> [SecuritiesPositionRow] {
        let raw = Portfolio.positions(transactions: transactions.filter { $0.depotId == depotId })
        let rows: [SecuritiesPositionRow] = raw
            .filter { $0.quantity > 0.0001 || $0.income > 0 }
            .map { p in
                let sec = securities.first { $0.id == p.securityId }
                let cur = currentPrice(prices, p.securityId)
                let curValue = p.quantity * (cur ?? 0)
                let pnl = curValue - p.cost + p.income
                let pct: Double? = p.cost > 0 ? pnl / p.cost * 100 : nil
                return SecuritiesPositionRow(securityId: p.securityId, security: sec, quantity: p.quantity,
                                             cost: p.cost, curPrice: cur, curValue: curValue, pnl: pnl,
                                             pct: pct, income: p.income)
            }
        return rows.sorted { a, b in
            a.name.compare(b.name, options: [.caseInsensitive], range: nil, locale: Locale(identifier: "de_DE")) == .orderedAscending
        }
    }

    /// Liste absteigend nach Datum sortieren (wie `.sort((a,b) => new Date(b.date) - new Date(a.date))`).
    static func sortedDesc(_ list: [DatedValue]) -> [DatedValue] {
        list.sorted { $0.date > $1.date }
    }
}
