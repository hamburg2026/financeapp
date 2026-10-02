import SwiftUI

// Port von src/components/Dashboard.jsx
//
// Alle Werte werden exakt wie in der Web-App berechnet (eigene fileprivate Berechnungen,
// da sich die Dashboard-Logik von den DataStore-Helfern unterscheidet):
// - Depotwert: Menge × letzter Kurs (0, wenn kein Kurs vorhanden – KEIN Einstandswert-Fallback),
//   nur Positionen mit Menge > 0 oder Erträgen > 0.
// - Immobilien: Feld `current` (ohne Historie), Beteiligungen: Feld `value` (ohne Historie).
// - Versicherungen: alle Verträge außer verrentungTyp "nurVerrentung", Legacy-Flag `nurVerrentung`
//   oder "nichtRelevant" (unabhängig von `active`); Wert = neuester Historienwert, sonst `value`.

// MARK: - Liquiditätsstufen (Texte/Farben wie im Dashboard der Web-App)

private struct DashLiquidityDef {
    let level: Int
    let label: String
    let desc: String
    let color: Color
}

private let dashLiquidityDefs: [DashLiquidityDef] = [
    DashLiquidityDef(level: 1, label: "Stufe 1", desc: "Liquidität", color: Color(hex: 0x16a34a)),
    DashLiquidityDef(level: 2, label: "Stufe 2", desc: "Kurzfristig liquidierbar", color: Color(hex: 0x22c55e)),
    DashLiquidityDef(level: 3, label: "Stufe 3", desc: "Mittelfristig liquidierbar", color: Color(hex: 0xeab308)),
    DashLiquidityDef(level: 5, label: "Stufe 5", desc: "Schwer liquidierbar", color: Color(hex: 0xf97316)),
    DashLiquidityDef(level: 6, label: "Stufe 6", desc: "Theoretisch liquidierbar", color: Color(hex: 0xdc2626)),
]

// MARK: - Formatierung

/// "+ 1.234,00 €" / "− 1.234,00 €" (schmales geschütztes Leerzeichen wie in der Web-App)
private func dashFmtPnl(_ n: Double) -> String {
    (n >= 0 ? "+\u{202F}" : "\u{2212}\u{202F}") + fmt(abs(n))
}

/// "+12,3 %"
private func dashFmtPct(_ n: Double) -> String {
    (n >= 0 ? "+" : "") + fmtNum(n, 1) + " %"
}

private let dashQtyFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = 4
    return f
}()

private func dashFmtQty(_ n: Double) -> String {
    dashQtyFormatter.string(from: NSNumber(value: n)) ?? String(n)
}

// MARK: - Berechnungen

/// Neuester Eintrag nach Datum; bei gleichem Datum der erste in Originalreihenfolge
/// (entspricht `[...h].sort((a,b) => b.date.localeCompare(a.date))[0]`).
private func dashNewest<T>(_ list: [T], date: (T) -> String) -> T? {
    var best: T?
    var bestDate = ""
    for e in list {
        let d = date(e)
        if best == nil || d > bestDate { best = e; bestDate = d }
    }
    return best
}

private struct DashPosition: Identifiable {
    let secId: String
    let name: String
    let qty: Double
    let cost: Double
    let curValue: Double
    let pnl: Double
    let pct: Double?
    var id: String { secId }
}

private struct DashDepotData: Identifiable {
    let depot: Depot
    let positions: [DashPosition]
    let totalValue: Double
    let totalCost: Double
    let totalPnl: Double
    let totalPct: Double?
    var id: EntityID { depot.id }
}

private struct DashAssetItem: Identifiable {
    let key: String
    let name: String
    let type: String
    let value: Double
    var id: String { key }
}

private struct DashInsuranceRow: Identifiable {
    let id: EntityID
    let label: String
    let value: String
    let hint: String?
    let muted: Bool
}

private struct DashPersonPension: Identifiable {
    let person: String
    let jaehrl: Double
    var id: String { person }
}

private struct DashboardData {
    let accounts: [BankAccount]
    let insurance: [InsuranceContract]
    let realEstate: [RealEstateProperty]
    let shares: [CompanyShare]
    let subscriptions: [SubscriptionItem]

    let depotData: [DashDepotData]
    let totalBank: Double
    let totalSecurities: Double
    let totalRealEstate: Double
    let totalShares: Double
    let totalInsurance: Double
    let totalAssets: Double
    let allAssetItems: [DashAssetItem]

    static func latestBankBalance(_ a: BankAccount) -> Double {
        if let h = a.balanceHistory, let e = dashNewest(h, date: { $0.date }) { return e.value }
        return a.balance
    }

    static func latestInsuranceEntry(_ c: InsuranceContract) -> InsuranceValueEntry? {
        dashNewest(c.valueHistory, date: { $0.date })
    }

    static func latestInsuranceVal(_ c: InsuranceContract) -> Double {
        if let e = latestInsuranceEntry(c) { return e.value }
        return c.value ?? 0
    }

    /// Zählt zum Vermögen: nicht "nurVerrentung", kein Legacy-Flag, nicht "nichtRelevant".
    static func countsAsAsset(_ c: InsuranceContract) -> Bool {
        c.verrentungTyp != .nurVerrentung && !c.nurVerrentung && c.verrentungTyp != .nichtRelevant
    }

    /// "Nur Verrentung" für die Anzeige (Legacy-Flag nur, wenn kein Typ gesetzt ist).
    static func isNurVerrentung(_ c: InsuranceContract) -> Bool {
        c.verrentungTyp == .nurVerrentung || (c.nurVerrentung && c.verrentungTyp == .none)
    }

    /// Jahresrente aus dem neuesten Historieneintrag (Multiplikator und garantierte Rente ≠ 0).
    static func jaehrlicheRente(_ c: InsuranceContract) -> Double? {
        guard let h = latestInsuranceEntry(c),
              let m = h.multiplikator, m != 0,
              let g = h.garantierteJaehrlicheRente, g != 0 else { return nil }
        return h.value / m * g
    }

    static func insuranceName(_ c: InsuranceContract) -> String {
        if !c.name.isEmpty { return c.name }
        if let co = c.company, !co.isEmpty { return co }
        return "–"
    }

    @MainActor
    init(store: DataStore) {
        accounts = store.bankAccounts
        insurance = store.insuranceContracts
        realEstate = store.realEstate
        shares = store.companyShares
        subscriptions = store.subscriptions

        totalBank = accounts.reduce(0) { $0 + DashboardData.latestBankBalance($1) }

        // Depots
        let prices = store.securityPrices
        let securities = store.securities
        func currentPrice(_ secId: String) -> Double {
            guard let list = prices[secId], let e = dashNewest(list, date: { $0.date }) else { return 0 }
            return e.value
        }
        var dd: [DashDepotData] = []
        for depot in store.depots {
            var order: [String] = []
            var pos: [String: (qty: Double, cost: Double, income: Double)] = [:]
            for t in store.depotTransactions where t.depotId == depot.id {
                let k = t.securityId.key
                if pos[k] == nil { pos[k] = (qty: 0, cost: 0, income: 0); order.append(k) }
                var p = pos[k]!
                switch t.type {
                case .buy:
                    p.qty += t.quantity
                    p.cost += t.quantity * t.price + t.fees
                case .sell:
                    p.qty -= t.quantity
                    p.cost -= t.quantity * t.price - t.fees
                case .dividend, .interest:
                    p.income += t.quantity * t.price - t.fees
                }
                pos[k] = p
            }
            var positions: [DashPosition] = []
            for k in order {
                guard let p = pos[k], p.qty > 0 || p.income > 0 else { continue }
                let sec = securities.first { $0.id.key == k }
                let name = (sec?.name).flatMap { $0.isEmpty ? nil : $0 } ?? k
                let curValue = p.qty * currentPrice(k)
                let pnl = curValue - p.cost + p.income
                let pct: Double? = p.cost > 0 ? pnl / p.cost * 100 : nil
                positions.append(DashPosition(secId: k, name: name, qty: p.qty, cost: p.cost,
                                              curValue: curValue, pnl: pnl, pct: pct))
            }
            positions.sort { $0.name.compare($1.name, locale: Locale(identifier: "de_DE")) == .orderedAscending }
            let tv = positions.reduce(0) { $0 + $1.curValue }
            let tc = positions.reduce(0) { $0 + $1.cost }
            let tp = positions.reduce(0) { $0 + $1.pnl }
            let tpct: Double? = tc > 0 ? tp / tc * 100 : nil
            dd.append(DashDepotData(depot: depot, positions: positions, totalValue: tv,
                                    totalCost: tc, totalPnl: tp, totalPct: tpct))
        }
        depotData = dd
        totalSecurities = dd.reduce(0) { $0 + $1.totalValue }

        totalRealEstate = realEstate.reduce(0) { $0 + $1.current }
        totalShares = shares.reduce(0) { $0 + $1.value }
        totalInsurance = insurance.filter(DashboardData.countsAsAsset)
            .reduce(0) { $0 + DashboardData.latestInsuranceVal($1) }
        totalAssets = totalBank + totalSecurities + totalInsurance + totalRealEstate + totalShares

        var items: [DashAssetItem] = []
        for a in accounts {
            items.append(DashAssetItem(key: LiquidityKey.bank(a.id), name: a.name, type: "Bankkonto",
                                       value: DashboardData.latestBankBalance(a)))
        }
        for d in dd {
            items.append(DashAssetItem(key: LiquidityKey.depot(d.depot.id), name: d.depot.name, type: "Depot",
                                       value: d.totalValue))
        }
        for c in insurance where DashboardData.countsAsAsset(c) {
            items.append(DashAssetItem(key: LiquidityKey.insurance(c.id), name: DashboardData.insuranceName(c),
                                       type: "Versicherung", value: DashboardData.latestInsuranceVal(c)))
        }
        for p in realEstate {
            items.append(DashAssetItem(key: LiquidityKey.realEstate(p.id), name: p.name, type: "Immobilie",
                                       value: p.current))
        }
        for s in shares {
            items.append(DashAssetItem(key: LiquidityKey.shares(s.id), name: s.company, type: "Beteiligung",
                                       value: s.value))
        }
        allAssetItems = items
    }

    var insuranceAssetCount: Int { insurance.filter(DashboardData.countsAsAsset).count }

    var totalZins: Double {
        accounts.reduce(0) { s, a in
            guard let z = a.zinssatz, z != 0 else { return s }
            return s + DashboardData.latestBankBalance(a) * z / 100
        }
    }

    var insuranceRows: [DashInsuranceRow] {
        insurance.filter { $0.verrentungTyp != .nichtRelevant }.map { c in
            let isNurV = DashboardData.isNurVerrentung(c)
            let jaehrl = DashboardData.jaehrlicheRente(c)
            let name = DashboardData.insuranceName(c)
            let label = c.person.isEmpty ? name : "\(name) (\(c.person))"
            var hint: String? = nil
            if let j = jaehrl {
                hint = "Rente: \(fmt(j))/J · \(fmt(j / 12))/M"
            } else if isNurV {
                hint = "Nur Verrentung"
            }
            let value: String
            if isNurV {
                value = jaehrl.map { fmt($0) } ?? "–"
            } else {
                value = fmt(DashboardData.latestInsuranceVal(c))
            }
            return DashInsuranceRow(id: c.id, label: label, value: value, hint: hint, muted: isNurV)
        }
    }

    /// Renten je Person (wie in der Web-App fest für "Karin" und "Jürgen").
    var personPensions: [DashPersonPension] {
        let annuities = insurance.filter { c in
            c.verrentungTyp != .nichtRelevant &&
            (c.verrentungTyp == .verrentung || c.verrentungTyp == .nurVerrentung ||
             (c.nurVerrentung && c.verrentungTyp == .none))
        }
        guard !annuities.isEmpty else { return [] }
        return ["Karin", "Jürgen"].map { p in
            DashPersonPension(person: p, jaehrl: annuities.filter { $0.person == p }
                .reduce(0) { $0 + (DashboardData.jaehrlicheRente($1) ?? 0) })
        }.filter { $0.jaehrl > 0 }
    }

    var notRelevant: [InsuranceContract] { insurance.filter { $0.verrentungTyp == .nichtRelevant } }
}

// MARK: - Bausteine

/// Zeile wie `MiniRow` der Web-App: Bezeichnung (+Hinweis) · Wert · Prozent · Veränderung.
private struct DashMiniRow: View {
    let label: String
    let value: String
    var sub: Double? = nil
    var pct: Double? = nil
    var hint: String? = nil
    var muted: Bool = false

    var body: some View {
        let showRight = sub != nil || pct != nil
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(label)
                        .foregroundStyle(muted ? Color.secondary : Color.primary)
                    if let hint {
                        Text(hint).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(value)
                    .fontWeight(.medium)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .frame(minWidth: 90, alignment: .trailing)
                if showRight {
                    Text(pct.map { dashFmtPct($0) } ?? "")
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.signed(pct ?? 0))
                        .frame(width: 62, alignment: .trailing)
                    Text(sub.map { dashFmtPnl($0) } ?? "")
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .foregroundStyle(Color.signed(sub ?? 0))
                        .frame(minWidth: 96, alignment: .trailing)
                }
            }
            .font(.subheadline)
            .padding(.vertical, 5)
            Divider()
        }
    }
}

private struct DashSectionHeader: View {
    let text: String
    var color: Color = .secondary
    var body: some View {
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(0.5)
            .foregroundStyle(color)
            .padding(.top, 8)
            .padding(.bottom, 2)
    }
}

private func dashPositionCount(_ n: Int) -> String { "\(n) Position\(n > 1 ? "en" : "")" }

// MARK: - Dashboard

@MainActor
struct DashboardView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme
    @Environment(\.navigate) private var navigate
    @State private var showLiqConfig = false

    private let gridColumns = [GridItem(.adaptive(minimum: 380), spacing: 16, alignment: .top)]

    var body: some View {
        let data = DashboardData(store: store)
        ScrollView {
            VStack(spacing: 16) {
                DashHeroCard(data: data, levels: store.liquidityLevels, theme: theme, navigate: navigate)
                liquidityCard(data)
                LazyVGrid(columns: gridColumns, alignment: .leading, spacing: 16) {
                    if !data.accounts.isEmpty { bankCard(data) }
                    if !data.insurance.isEmpty { insuranceCard(data) }
                    if !data.depotData.isEmpty { depotCard(data) }
                    if !data.realEstate.isEmpty { realEstateCard(data) }
                    if !data.shares.isEmpty { sharesCard(data) }
                    if !data.subscriptions.isEmpty { subscriptionsCard(data) }
                }
            }
            .padding()
        }
        .moduleBackground()
        .navigationTitle("Dashboard")
    }

    // MARK: Liquiditätsübersicht

    private func levelBinding(_ key: String) -> Binding<Int?> {
        Binding<Int?>(
            get: { store.liquidityLevels[key] },
            set: { newValue in
                var next = store.liquidityLevels
                if let v = newValue { next[key] = v } else { next.removeValue(forKey: key) }
                store.liquidityLevels = next
            }
        )
    }

    @ViewBuilder
    private func liquidityCard(_ data: DashboardData) -> some View {
        let levels = store.liquidityLevels
        let assigned = data.allAssetItems.filter { levels[$0.key] != nil }
        let unassigned = data.allAssetItems.filter { levels[$0.key] == nil }
        Card("Liquiditätsübersicht", trailing: AnyView(
            Button(showLiqConfig ? "Konfiguration schließen" : "Stufen konfigurieren") {
                withAnimation { showLiqConfig.toggle() }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        )) {
            if showLiqConfig { liquidityConfig(data) }
            ForEach(dashLiquidityDefs, id: \.level) { def in
                let items = assigned.filter { levels[$0.key] == def.level }
                if !items.isEmpty {
                    DashLiquidityLevelBlock(def: def, items: items, totalAssets: data.totalAssets)
                }
            }
            if !unassigned.isEmpty {
                Text("\(dashPositionCount(unassigned.count)) noch keiner Liquiditätsstufe zugeordnet (\(unassigned.map { $0.name }.joined(separator: ", ")))")
                    .font(.caption)
                    .foregroundStyle(Color(hex: 0x854d0e))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(hex: 0xfef9c3))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            if data.allAssetItems.isEmpty {
                Text("Noch keine Vermögenswerte vorhanden.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func liquidityConfig(_ data: DashboardData) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("LIQUIDITÄTSSTUFE JE POSITION FESTLEGEN")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            ForEach(data.allAssetItems) { item in
                HStack(spacing: 8) {
                    (Text(item.type + " ").font(.caption).foregroundColor(.secondary) + Text(item.name))
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(fmt(item.value))
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                    Picker("Stufe", selection: levelBinding(item.key)) {
                        Text("– nicht zugeordnet –").tag(Int?.none)
                        ForEach(dashLiquidityDefs, id: \.level) { def in
                            Text("\(def.label) – \(def.desc)").tag(Optional(def.level))
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                }
                .font(.subheadline)
                Divider()
            }
        }
        .padding(12)
        .background(theme.background)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: Bankkonten

    private func bankCard(_ data: DashboardData) -> some View {
        Card("Bankkonten") {
            VStack(spacing: 0) {
                ForEach(data.accounts) { a in
                    DashMiniRow(label: a.name, value: fmt(DashboardData.latestBankBalance(a)), hint: bankHint(a))
                }
                if data.totalZins > 0 {
                    DashMiniRow(label: "Zinsertrag gesamt p.a.", value: fmt(data.totalZins),
                                hint: "alle verzinsten Konten", muted: true)
                }
                if data.accounts.count > 1 {
                    DashMiniRow(label: "Gesamt", value: fmt(data.totalBank), muted: true)
                }
            }
        }
    }

    private func bankHint(_ a: BankAccount) -> String? {
        let bal = DashboardData.latestBankBalance(a)
        var parts: [String] = []
        if let z = a.zinssatz { parts.append("\(fmtNum(z, 2)) % p.a.") }
        if let bis = a.laufzeitBis, !bis.isEmpty { parts.append("bis \(fmtDate(bis))") }
        if let z = a.zinssatz, z > 0 { parts.append("Zinsertrag: \(fmt(bal * z / 100))/Jahr") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: Versicherungen

    private func insuranceCard(_ data: DashboardData) -> some View {
        Card("Versicherungen") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(data.insuranceRows) { r in
                    DashMiniRow(label: r.label, value: r.value, hint: r.hint, muted: r.muted)
                }
                pensionsBlock(data)
                if data.insuranceAssetCount > 1 {
                    DashMiniRow(label: "Gesamt Vermögenswert", value: fmt(data.totalInsurance), muted: true)
                }
                if !data.notRelevant.isEmpty {
                    DashSectionHeader(text: "Nicht relevant")
                    ForEach(data.notRelevant) { c in
                        DashMiniRow(label: DashboardData.insuranceName(c), value: "–", muted: true)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func pensionsBlock(_ data: DashboardData) -> some View {
        let persons = data.personPensions
        let totalRente = persons.reduce(0) { $0 + $1.jaehrl }
        if totalRente != 0 {
            DashSectionHeader(text: "Renten je Person", color: Color(hex: 0x7c3aed))
            ForEach(persons) { p in
                DashMiniRow(label: p.person, value: fmt(p.jaehrl), hint: "\(fmt(p.jaehrl / 12))/Monat")
            }
            if persons.count > 1 {
                DashMiniRow(label: "Rente gesamt", value: fmt(totalRente),
                            hint: "\(fmt(totalRente / 12))/Monat", muted: true)
            }
        }
    }

    // MARK: Depots

    private func depotCard(_ data: DashboardData) -> some View {
        Card("Depots") {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(data.depotData) { d in
                    DashDepotBlock(data: d)
                }
            }
        }
    }

    // MARK: Immobilien

    private func realEstateCard(_ data: DashboardData) -> some View {
        Card("Immobilien") {
            VStack(spacing: 0) {
                ForEach(data.realEstate) { p in
                    let diff = p.current - p.purchase
                    let pct: Double? = p.purchase > 0 ? diff / p.purchase * 100 : nil
                    DashMiniRow(label: p.name, value: fmt(p.current), sub: diff, pct: pct)
                }
                if data.realEstate.count > 1 {
                    DashMiniRow(label: "Gesamt", value: fmt(data.totalRealEstate), muted: true)
                }
            }
        }
    }

    // MARK: Firmenbeteiligungen

    private func sharesCard(_ data: DashboardData) -> some View {
        Card("Firmenbeteiligungen") {
            VStack(spacing: 0) {
                ForEach(data.shares) { s in
                    DashMiniRow(label: "\(s.company) (\(fmtNum(s.percentage, 2)) %)", value: fmt(s.value))
                }
                if data.shares.count > 1 {
                    DashMiniRow(label: "Gesamt", value: fmt(data.totalShares), muted: true)
                }
            }
        }
    }

    // MARK: Abonnements

    private func subscriptionsCard(_ data: DashboardData) -> some View {
        Card("Abonnements") {
            VStack(spacing: 0) {
                ForEach(data.subscriptions) { s in
                    DashMiniRow(label: "\(s.name) (\(s.frequency.shortLabel))", value: fmt(s.cost),
                                hint: subscriptionHint(s), muted: !s.aktiv)
                }
            }
        }
    }

    private func subscriptionHint(_ s: SubscriptionItem) -> String? {
        var parts: [String] = []
        if !s.cancel.isEmpty { parts.append("Frist: \(s.cancel)") }
        if !s.cancelDate.isEmpty { parts.append("Kündigung bis: \(s.cancelDate)") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - Gesamtvermögen (Kopfkarte)

private struct DashClassTile {
    let label: String
    let value: Double
    let module: AppModule
}

private struct DashHeroCard: View {
    let data: DashboardData
    let levels: LiquidityLevels
    let theme: AppTheme
    let navigate: (AppModule) -> Void

    let tileColumns = [GridItem(.adaptive(minimum: 150), spacing: 8)]

    private var classTiles: [DashClassTile] {
        [
            DashClassTile(label: "Bankkonten", value: data.totalBank, module: .bankAccounts),
            DashClassTile(label: "Wertpapiere", value: data.totalSecurities, module: .securities),
            DashClassTile(label: "Versicherungen", value: data.totalInsurance, module: .insuranceContracts),
            DashClassTile(label: "Immobilien", value: data.totalRealEstate, module: .realEstate),
            DashClassTile(label: "Beteiligungen", value: data.totalShares, module: .companyShares),
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("GESAMTVERMÖGEN")
                .font(.caption)
                .tracking(0.6)
                .opacity(0.75)
            Text(fmt(data.totalAssets))
                .font(.system(size: 36, weight: .bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.bottom, 8)
            LazyVGrid(columns: tileColumns, spacing: 8) {
                ForEach(classTiles, id: \.label) { tile in
                    Button {
                        navigate(tile.module)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(tile.label).font(.caption).opacity(0.8)
                            Text(fmt(tile.value)).fontWeight(.semibold).monospacedDigit()
                                .lineLimit(1).minimumScaleFactor(0.6)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Zu \(tile.label) wechseln")
                }
            }
            liquiditySummary
        }
        .foregroundStyle(.white)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.primary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private var liquiditySummary: some View {
        let assigned = data.allAssetItems.filter { levels[$0.key] != nil }
        let unassigned = data.allAssetItems.filter { levels[$0.key] == nil }
        if !assigned.isEmpty {
            Rectangle().fill(Color.white.opacity(0.25)).frame(height: 1).padding(.vertical, 10)
            Text("LIQUIDITÄT").font(.caption2).tracking(0.6).opacity(0.75).padding(.bottom, 4)
            LazyVGrid(columns: tileColumns, spacing: 8) {
                ForEach(dashLiquidityDefs, id: \.level) { def in
                    let items = assigned.filter { levels[$0.key] == def.level }
                    if !items.isEmpty {
                        let total = items.reduce(0) { $0 + $1.value }
                        let pct = data.totalAssets > 0 ? total / data.totalAssets * 100 : 0
                        liquidityTile(title: "\(def.label) · \(def.desc)", value: fmt(total),
                                      footer: "\(fmtNum(pct, 1)) %", accent: def.color, background: 0.12)
                    }
                }
                if !unassigned.isEmpty {
                    liquidityTile(title: "Nicht zugeordnet", value: fmt(unassigned.reduce(0) { $0 + $1.value }),
                                  footer: dashPositionCount(unassigned.count),
                                  accent: Color.white.opacity(0.3), background: 0.08)
                }
            }
        }
    }

    private func liquidityTile(title: String, value: String, footer: String, accent: Color, background: Double) -> some View {
        HStack(spacing: 0) {
            Rectangle().fill(accent).frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.caption2).opacity(0.8).lineLimit(2)
                Text(value).fontWeight(.bold).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                Text(footer).font(.caption2).opacity(0.65)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(background))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Liquiditätsstufe (Block in der Übersicht)

private struct DashLiquidityLevelBlock: View {
    let def: DashLiquidityDef
    let items: [DashAssetItem]
    let totalAssets: Double

    var body: some View {
        let total = items.reduce(0) { $0 + $1.value }
        let pct = totalAssets > 0 ? total / totalAssets * 100 : 0
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Circle().fill(def.color).frame(width: 10, height: 10)
                Text(def.label).font(.subheadline.weight(.semibold))
                Text(def.desc).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text("\(fmtNum(pct, 1)) %").font(.caption).foregroundStyle(.secondary)
                Text(fmt(total)).font(.subheadline.weight(.bold)).monospacedDigit()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.borderGray)
                    Capsule().fill(def.color)
                        .frame(width: geo.size.width * CGFloat(min(max(pct, 0), 100) / 100))
                }
            }
            .frame(height: 4)
            VStack(spacing: 0) {
                ForEach(items) { a in
                    DashMiniRow(label: a.name, value: fmt(a.value), hint: a.type, muted: true)
                }
            }
        }
        .padding(.bottom, 8)
    }
}

// MARK: - Depot-Block

private struct DashDepotBlock: View {
    let data: DashDepotData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(data.depot.name)
                Spacer()
                Text(fmt(data.totalValue)).monospacedDigit()
                if let p = data.totalPct {
                    Text(dashFmtPct(p))
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Color.signed(p))
                }
                Text(dashFmtPnl(data.totalPnl))
                    .foregroundStyle(Color.signed(data.totalPnl))
                    .monospacedDigit()
            }
            .font(.subheadline.weight(.semibold))
            .padding(.vertical, 5)
            Rectangle().fill(Color.borderGray).frame(height: 2)
            ForEach(data.positions) { p in
                DashMiniRow(label: "\(p.name) (\(dashFmtQty(p.qty)) Stk.)", value: fmt(p.curValue),
                            sub: p.pnl, pct: p.pct)
            }
            if data.positions.isEmpty {
                Text("Keine Positionen")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 4)
            }
        }
    }
}
