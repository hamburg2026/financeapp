import SwiftUI
import Charts

// Port von src/components/PortfolioPerformance.jsx – "Wertentwicklung".

// MARK: - Farben

private let ppLineHex: [UInt32] = [0x4ade80, 0x60a5fa, 0xfb923c, 0xf472b6, 0xa78bfa, 0x34d399, 0xfbbf24]
private let ppGlowHex: [UInt32] = [0x16a34a, 0x2563eb, 0xea580c, 0xdb2777, 0x7c3aed, 0x059669, 0xd97706]
private let ppLineColors: [Color] = ppLineHex.map { (h: UInt32) -> Color in Color(hex: h) }
private let ppGlowColors: [Color] = ppGlowHex.map { (h: UInt32) -> Color in Color(hex: h) }
private let ppLabelColors: [Color] = ppGlowColors
private let ppDark = Color(hex: 0x0f172a)
private let ppAxisText = Color(hex: 0x64748b)

private func ppColor(_ list: [Color], _ idx: Int) -> Color {
    let n = list.count
    return list[((idx % n) + n) % n]
}

// MARK: - Formatierung

/// Kurzformat der Y-Achse (fmtShort der Web-App).
private func ppFmtShort(_ n: Double) -> String {
    let a = abs(n)
    func num(_ v: Double, _ maxDigits: Int) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "de_DE")
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = maxDigits
        return f.string(from: NSNumber(value: v)) ?? String(v)
    }
    if a >= 1_000_000 { return num(n / 1_000_000, 2) + " Mio." }
    if a >= 10_000 { return num(n / 1_000, 1) + "k" }
    if a >= 1_000 { return num(n / 1_000, 2) + "k" }
    return num(n, 0)
}

/// "+3,45 %" (fmtPct der Web-App, immer mit Vorzeichen).
private func ppFmtPct(_ n: Double, _ decimals: Int = 2) -> String {
    (n >= 0 ? "+" : "") + fmtNum(n, decimals) + " %"
}

// MARK: - Datenmodell

private struct PPPoint: Hashable {
    let date: ISODate
    let value: Double
}

private struct PPSeries: Identifiable {
    let label: String
    let colorIdx: Int
    var dashed: Bool = false
    var points: [PPPoint]
    /// eindeutiger Schlüssel (für Charts-Serien)
    var key: String { "\(colorIdx)|" + (dashed ? "c|" : "v|") + label }
    var id: String { key }
}

private enum PPTab: String, CaseIterable, Identifiable {
    case depots, securities, insurance
    var id: String { rawValue }
    var label: String {
        switch self {
        case .depots: return "Depots"
        case .securities: return "Einzeltitel"
        case .insurance: return "Versicherungen"
        }
    }
}

private enum PPPeriod: String, CaseIterable, Identifiable {
    case m1 = "1M", m3 = "3M", m6 = "6M", y1 = "1J", y3 = "3J", y5 = "5J", max = "MAX", ind = "IND"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .m1: return "1 M"
        case .m3: return "3 M"
        case .m6: return "6 M"
        case .y1: return "1 J"
        case .y3: return "3 J"
        case .y5: return "5 J"
        case .max: return "MAX"
        case .ind: return "Individuell"
        }
    }

    /// Startdatum des Zeitraums (nil bei MAX / Individuell).
    var fromDate: ISODate? {
        let today = ISODates.today()
        switch self {
        case .m1: return ISODates.adding(months: -1, to: today)
        case .m3: return ISODates.adding(months: -3, to: today)
        case .m6: return ISODates.adding(months: -6, to: today)
        case .y1: return ISODates.adding(years: -1, to: today)
        case .y3: return ISODates.adding(years: -3, to: today)
        case .y5: return ISODates.adding(years: -5, to: today)
        case .max, .ind: return nil
        }
    }
}

private enum PPChartMode: String, CaseIterable, Identifiable {
    case abs, pct
    var id: String { rawValue }
    var label: String { self == .abs ? "Absolut" : "Prozentual" }
}

// MARK: - Berechnungen

private enum PPCalc {
    static func applyPeriod(_ points: [PPPoint], _ period: PPPeriod, _ customFrom: ISODate, _ customTo: ISODate) -> [PPPoint] {
        var pts = points
        if period == .ind {
            if !customFrom.isEmpty { pts = pts.filter { $0.date >= customFrom } }
            if !customTo.isEmpty { pts = pts.filter { $0.date <= customTo } }
            return pts
        }
        if let from = period.fromDate { return pts.filter { $0.date >= from } }
        return pts
    }

    /// Letzter Kurs am oder vor `date`.
    static func priceOn(_ history: [DatedValue], _ date: ISODate) -> Double? {
        var best: DatedValue?
        for p in history where p.date <= date {
            if best == nil || p.date > best!.date { best = p }
        }
        return best?.value
    }

    /// Depotwert und Einstand zu einem Stichtag (nur Käufe/Verkäufe).
    static func depotValueAt(_ txs: [DepotTransaction], _ date: ISODate, _ prices: SecurityPrices) -> (value: Double, cost: Double) {
        var qty: [EntityID: Double] = [:]
        var cost: [EntityID: Double] = [:]
        for t in txs where t.date <= date {
            switch t.type {
            case .buy:
                qty[t.securityId, default: 0] += t.quantity
                cost[t.securityId, default: 0] += t.quantity * t.price + t.fees
            case .sell:
                qty[t.securityId, default: 0] -= t.quantity
                cost[t.securityId, default: 0] -= t.quantity * t.price - t.fees
            case .dividend, .interest:
                break
            }
        }
        var value = 0.0, totalCost = 0.0
        for (secId, q) in qty {
            if q <= 0.0001 { continue }
            let c = cost[secId] ?? 0
            if let price = priceOn(prices[secId.key] ?? [], date) {
                value += q * price
                totalCost += c
            } else {
                totalCost += c
            }
        }
        return (value, totalCost)
    }

    static func buildDepotSeries(_ depot: Depot, _ transactions: [DepotTransaction], _ prices: SecurityPrices,
                                 colorIdx: Int, showCost: Bool) -> [PPSeries] {
        let txs = transactions.filter { $0.depotId == depot.id && ($0.type == .buy || $0.type == .sell) }
        let allTxs = transactions.filter { $0.depotId == depot.id }
        var secKeys = Set<String>()
        for t in allTxs { secKeys.insert(t.securityId.key) }
        var dateSet = Set<ISODate>()
        for k in secKeys { for p in prices[k] ?? [] { dateSet.insert(p.date) } }
        let dates = dateSet.sorted()
        var valuePts: [PPPoint] = []
        var costPts: [PPPoint] = []
        for d in dates {
            let r = depotValueAt(txs, d, prices)
            if r.value > 0 {
                valuePts.append(PPPoint(date: d, value: r.value))
                costPts.append(PPPoint(date: d, value: r.cost))
            }
        }
        var result = [PPSeries(label: depot.name, colorIdx: colorIdx, points: valuePts)]
        if showCost && !costPts.isEmpty {
            result.append(PPSeries(label: "\(depot.name) (Einstand)", colorIdx: colorIdx, dashed: true, points: costPts))
        }
        return result
    }

    static func toPct(_ series: [PPSeries]) -> [PPSeries] {
        series.map { s in
            guard let base = s.points.first?.value, base != 0 else { return s }
            var copy = s
            copy.points = s.points.map { PPPoint(date: $0.date, value: ($0.value - base) / abs(base) * 100) }
            return copy
        }
    }
}

// MARK: - Hauptansicht

@MainActor
struct PortfolioPerformanceView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var tab: PPTab = .depots
    @State private var period: PPPeriod = .max
    @State private var customFrom: ISODate = ""
    @State private var customTo: ISODate = ISODates.today()
    @State private var chartMode: PPChartMode = .abs
    @State private var scaleMin: Double?
    @State private var scaleMax: Double?

    @State private var selDepotIds: Set<EntityID> = []
    @State private var selSecIds: Set<EntityID> = []
    @State private var selInsIds: Set<EntityID> = []
    @State private var didInit = false

    private let kpiColumns = [GridItem(.adaptive(minimum: 170), spacing: 10)]

    private var insWithHistory: [InsuranceContract] {
        store.insuranceContracts.filter { $0.valueHistory.count >= 2 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Picker("Ansicht", selection: $tab) {
                    ForEach(PPTab.allCases) { t in Text(t.label).tag(t) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 480)

                periodBar
                modeBar
                tabContent
            }
            .padding()
        }
        .moduleBackground()
        .navigationTitle("Wertentwicklung")
        .onAppear { initSelection() }
    }

    private func initSelection() {
        guard !didInit else { return }
        didInit = true
        selDepotIds = Set(store.depots.map { $0.id })
        selSecIds = Set(store.securities.prefix(3).map { $0.id })
        selInsIds = Set(insWithHistory.prefix(5).map { $0.id })
    }

    // MARK: Steuerleisten

    private var periodBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            PillPicker(options: PPPeriod.allCases, selection: $period) { $0.label }
            if period == .ind {
                HStack(spacing: 12) {
                    OptionalISODatePicker("Von", date: $customFrom)
                    OptionalISODatePicker("Bis", date: $customTo)
                }
                .frame(maxWidth: 620)
            }
        }
    }

    private var modeBar: some View {
        HStack(spacing: 10) {
            Picker("Darstellung", selection: Binding(get: { chartMode }, set: { m in
                chartMode = m
                scaleMin = nil
                scaleMax = nil
            })) {
                ForEach(PPChartMode.allCases) { m in Text(m.label).tag(m) }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 240)

            Text("Skala:").font(.caption).foregroundStyle(.secondary)
            DecimalField("Min", value: $scaleMin, maxDecimals: 2)
                .textFieldStyle(.roundedBorder)
                .frame(width: 90)
            Text("–").foregroundStyle(.secondary)
            DecimalField("Max", value: $scaleMax, maxDecimals: 2)
                .textFieldStyle(.roundedBorder)
                .frame(width: 90)
            if scaleMin != nil || scaleMax != nil {
                Button("Auto") {
                    scaleMin = nil
                    scaleMax = nil
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: Inhalte

    @ViewBuilder
    private var tabContent: some View {
        switch tab {
        case .depots: depotsTab
        case .securities: securitiesTab
        case .insurance: insuranceTab
        }
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
    }

    private func chartBlock(_ series: [PPSeries]) -> some View {
        let shown = chartMode == .pct ? PPCalc.toPct(series) : series
        return VStack(spacing: 10) {
            PPChart(series: shown, mode: chartMode, yMinOverride: scaleMin, yMaxOverride: scaleMax)
            if !series.isEmpty { PPLegend(series: series) }
        }
    }

    // ── Depots ──

    private var depotSeries: [PPSeries] {
        let selected = store.depots.filter { selDepotIds.contains($0.id) }
        let single = selected.count == 1
        var raw: [PPSeries] = []
        for depot in selected {
            let colorIdx = store.depots.firstIndex(where: { $0.id == depot.id }) ?? 0
            raw.append(contentsOf: PPCalc.buildDepotSeries(depot, store.depotTransactions, store.securityPrices,
                                                          colorIdx: colorIdx, showCost: single))
        }
        return raw.map { s in
            var c = s
            c.points = PPCalc.applyPeriod(s.points, period, customFrom, customTo)
            return c
        }.filter { !$0.points.isEmpty }
    }

    @ViewBuilder
    private var depotsTab: some View {
        if store.depots.isEmpty {
            emptyText("Noch keine Depots angelegt. Bitte zuerst Depots und Transaktionen in „Wertpapiere & Depots“ erfassen.")
        } else {
            let series = depotSeries
            let single = store.depots.filter { selDepotIds.contains($0.id) }.count == 1
            PPMultiSelect(items: store.depots.enumerated().map { PPSelectItem(id: $0.element.id, name: $0.element.name, colorIdx: $0.offset) },
                          selected: $selDepotIds, label: "Depots auswählen")
            chartBlock(series)
            depotKpis(series, single: single)
        }
    }

    @ViewBuilder
    private func depotKpis(_ series: [PPSeries], single: Bool) -> some View {
        let main = series.filter { !$0.dashed }
        let costs = series.filter { $0.dashed }
        let totalCur = main.reduce(0.0) { $0 + ($1.points.last?.value ?? 0) }
        let totalCost = costs.reduce(0.0) { $0 + ($1.points.last?.value ?? 0) }
        let pnl: Double? = (single && !costs.isEmpty) ? totalCur - totalCost : nil
        let pct: Double? = (pnl != nil && totalCost > 0) ? pnl! / totalCost * 100 : nil
        if totalCur > 0 {
            LazyVGrid(columns: kpiColumns, alignment: .leading, spacing: 10) {
                StatTile(title: "Aktueller Wert", value: fmt(totalCur))
                if single && totalCost > 0 {
                    StatTile(title: "Einstand", value: fmt(totalCost))
                }
                if let pnl {
                    StatTile(title: "Gewinn / Verlust", value: (pnl >= 0 ? "+" : "") + fmt(pnl), color: Color.signed(pnl))
                }
                if let pct {
                    StatTile(title: "Rendite", value: ppFmtPct(pct), color: Color.signed(pct))
                }
            }
        }
    }

    // ── Einzeltitel ──

    private func securityLabel(_ s: SecurityAsset) -> String {
        s.name + (s.symbol.isEmpty ? "" : " (\(s.symbol))")
    }

    private func history(_ s: SecurityAsset) -> [PPPoint] {
        store.prices(for: s.id)
            .sorted { $0.date < $1.date }
            .map { PPPoint(date: $0.date, value: $0.value) }
    }

    private var securitySeries: [PPSeries] {
        let selected = store.securities.filter { selSecIds.contains($0.id) }
        return selected.map { sec -> PPSeries in
            let colorIdx = store.securities.firstIndex(where: { $0.id == sec.id }) ?? 0
            let pts = PPCalc.applyPeriod(history(sec), period, customFrom, customTo)
            return PPSeries(label: securityLabel(sec), colorIdx: colorIdx, points: pts)
        }.filter { !$0.points.isEmpty }
    }

    @ViewBuilder
    private var securitiesTab: some View {
        if store.securities.isEmpty {
            emptyText("Noch keine Wertpapiere erfasst.")
        } else {
            PPMultiSelect(items: store.securities.enumerated().map { PPSelectItem(id: $0.element.id, name: securityLabel($0.element), colorIdx: $0.offset) },
                          selected: $selSecIds, label: "Wertpapiere auswählen")
            chartBlock(securitySeries)
            securityKpis
        }
    }

    @ViewBuilder
    private var securityKpis: some View {
        let selected = store.securities.filter { selSecIds.contains($0.id) }
        if selected.count == 1 {
            let hist = PPCalc.applyPeriod(history(selected[0]), period, customFrom, customTo)
            if let first = hist.first, let last = hist.last {
                let change = last.value - first.value
                let pct: Double? = first.value > 0 ? change / first.value * 100 : nil
                LazyVGrid(columns: kpiColumns, alignment: .leading, spacing: 10) {
                    StatTile(title: "Kurs (\(fmtDate(last.date)))", value: fmt(last.value))
                    if first.date != last.date {
                        StatTile(title: "Kurs (\(fmtDate(first.date)))", value: fmt(first.value))
                    }
                    StatTile(title: "Kursentwicklung", value: (change >= 0 ? "+" : "") + fmt(change), color: Color.signed(change))
                    if let pct {
                        StatTile(title: "Rendite (Kurs)", value: ppFmtPct(pct), color: Color.signed(pct))
                    }
                }
            }
        }
    }

    // ── Versicherungen ──

    private func insuranceLabel(_ c: InsuranceContract) -> String {
        c.displayName + (c.provider.isEmpty ? "" : " (\(c.provider))")
    }

    private var insuranceSeries: [PPSeries] {
        let all = insWithHistory
        return all.filter { selInsIds.contains($0.id) }.map { c -> PPSeries in
            let colorIdx = all.firstIndex(where: { $0.id == c.id }) ?? 0
            let hist = c.valueHistory.sorted { $0.date < $1.date }.map { PPPoint(date: $0.date, value: $0.value) }
            return PPSeries(label: insuranceLabel(c), colorIdx: colorIdx,
                            points: PPCalc.applyPeriod(hist, period, customFrom, customTo))
        }.filter { !$0.points.isEmpty }
    }

    @ViewBuilder
    private var insuranceTab: some View {
        let all = insWithHistory
        if all.isEmpty {
            emptyText("Keine Versicherungsverträge mit Werthistorie vorhanden. Bitte in „Versicherungen“ Zeitwerte erfassen.")
        } else {
            let series = insuranceSeries
            let total = series.reduce(0.0) { $0 + ($1.points.last?.value ?? 0) }
            PPMultiSelect(items: all.enumerated().map { PPSelectItem(id: $0.element.id, name: insuranceLabel($0.element), colorIdx: $0.offset) },
                          selected: $selInsIds, label: "Versicherungen auswählen")
            chartBlock(series)
            if total > 0 {
                LazyVGrid(columns: kpiColumns, alignment: .leading, spacing: 10) {
                    StatTile(title: "Aktueller Gesamtwert", value: fmt(total))
                }
            }
        }
    }
}

// MARK: - Mehrfachauswahl

private struct PPSelectItem: Identifiable {
    let id: EntityID
    let name: String
    let colorIdx: Int
}

private struct PPMultiSelect: View {
    let items: [PPSelectItem]
    @Binding var selected: Set<EntityID>
    let label: String

    private var allSelected: Bool { items.allSatisfy { selected.contains($0.id) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            PPFlowLayout(spacing: 6) {
                if items.count > 1 {
                    Button {
                        if allSelected {
                            for it in items { selected.remove(it.id) }
                        } else {
                            for it in items { selected.insert(it.id) }
                        }
                    } label: {
                        Text(allSelected ? "Alle ab" : "Alle")
                            .font(.subheadline)
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .foregroundStyle(.secondary)
                            .background(allSelected ? Color.borderGray : Color.clear)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Color.borderGray))
                    }
                    .buttonStyle(.plain)
                }
                ForEach(items) { it in chip(it) }
            }
        }
    }

    private func chip(_ it: PPSelectItem) -> some View {
        let sel = selected.contains(it.id)
        let c = ppColor(ppLineColors, it.colorIdx)
        let lc = ppColor(ppLabelColors, it.colorIdx)
        return Button {
            if sel { selected.remove(it.id) } else { selected.insert(it.id) }
        } label: {
            HStack(spacing: 5) {
                if sel { Circle().fill(c).frame(width: 8, height: 8) }
                Text(it.name)
                    .font(.subheadline.weight(sel ? .semibold : .regular))
                    .lineLimit(1)
            }
            .padding(.horizontal, 10).padding(.vertical, 4)
            .foregroundStyle(sel ? lc : Color.secondary)
            .background(sel ? c.opacity(0.13) : Color.clear)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(sel ? lc : Color.borderGray, lineWidth: sel ? 2 : 1))
        }
        .buttonStyle(.plain)
    }
}

/// Einfaches Fließlayout (Zeilenumbruch) für Auswahl-Chips.
private struct PPFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                y += rowHeight + spacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: maxWidth.isFinite ? maxWidth : widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += rowHeight + spacing
                x = bounds.minX
                rowHeight = 0
            }
            sv.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Legende

private struct PPLegend: View {
    let series: [PPSeries]

    var body: some View {
        PPFlowLayout(spacing: 14) {
            ForEach(series) { s in
                HStack(spacing: 6) {
                    PPLegendLine(dashed: s.dashed)
                        .stroke(ppColor(ppLineColors, s.colorIdx),
                                style: StrokeStyle(lineWidth: s.dashed ? 1.8 : 2.5, dash: s.dashed ? [5, 3] : []))
                        .frame(width: 22, height: 10)
                    Text(s.label)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(ppColor(ppLabelColors, s.colorIdx))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .center)
    }
}

private struct PPLegendLine: Shape {
    let dashed: Bool
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.midY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return p
    }
}

// MARK: - Diagramm

private struct PPChartPoint: Identifiable {
    let id: String
    let seriesKey: String
    let label: String
    let colorIdx: Int
    let dashed: Bool
    let date: Date
    let iso: ISODate
    let value: Double
}

private struct PPChart: View {
    let series: [PPSeries]
    let mode: PPChartMode
    let yMinOverride: Double?
    let yMaxOverride: Double?

    @State private var selectedDate: Date?

    private var hasEnough: Bool { series.contains { $0.points.count >= 2 } }

    var body: some View {
        if hasEnough {
            chartView
                .padding(14)
                .background(ppDark)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(0.35), radius: 18, y: 10)
        } else {
            Text("Zu wenig Kursdaten – bitte mehr Kurse oder Transaktionen erfassen.")
                .font(.subheadline)
                .foregroundStyle(ppAxisText)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 48)
                .padding(.horizontal, 16)
                .background(ppDark)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(0.35), radius: 18, y: 10)
        }
    }

    private func fmtY(_ v: Double) -> String {
        if mode == .pct { return (v >= 0 ? "+" : "") + fmtNum(v, 1) + " %" }
        return ppFmtShort(v)
    }

    private func fmtValue(_ v: Double) -> String {
        if mode == .pct { return (v >= 0 ? "+" : "") + fmtNum(v, 2) + " %" }
        return fmt(v)
    }

    private var chartPoints: [PPChartPoint] {
        var result: [PPChartPoint] = []
        for s in series {
            for p in s.points {
                guard let d = ISODates.date(from: p.date) else { continue }
                result.append(PPChartPoint(id: s.key + "#" + p.date, seriesKey: s.key, label: s.label,
                                           colorIdx: s.colorIdx, dashed: s.dashed, date: d, iso: p.date, value: p.value))
            }
        }
        return result
    }

    private var yDomain: ClosedRange<Double> {
        let vals = series.flatMap { $0.points.map { $0.value } }
        let rawMin = vals.min() ?? 0
        let rawMax = vals.max() ?? 1
        let rng = (rawMax - rawMin) == 0 ? 1 : (rawMax - rawMin)
        var lo = yMinOverride ?? (rawMin - rng * 0.1)
        var hi = yMaxOverride ?? (rawMax + rng * 0.1)
        if !(lo < hi) {
            lo = min(lo, hi) - 1
            hi = lo + 2
        }
        return lo...hi
    }

    /// Sortierte, eindeutige Datumswerte aller Serien.
    private var allDates: [ISODate] {
        Array(Set(series.flatMap { $0.points.map { $0.date } })).sorted()
    }

    private var hoverISO: ISODate? {
        guard let sel = selectedDate else { return nil }
        var best: ISODate?
        var bestDist = Double.infinity
        for iso in allDates {
            guard let d = ISODates.date(from: iso) else { continue }
            let dist = abs(d.timeIntervalSince(sel))
            if dist < bestDist { bestDist = dist; best = iso }
        }
        return best
    }

    private var chartView: some View {
        let pts = chartPoints
        let domain = yDomain
        let hd = hoverISO
        let hoverPts: [PPChartPoint] = hd == nil ? [] : pts.filter { $0.iso == hd! }
        let hoverDate: Date? = hd.flatMap { ISODates.date(from: $0) }
        return Chart {
            ForEach(series) { (s: PPSeries) in
                PPSeriesMarks(series: s, lower: domain.lowerBound)
            }
            if let hoverDate {
                RuleMark(x: .value("Datum", hoverDate))
                    .foregroundStyle(Color.white.opacity(0.25))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .annotation(position: .top, alignment: .center, spacing: 0,
                                overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        tooltip(hd ?? "", hoverPts)
                    }
                ForEach(hoverPts) { (p: PPChartPoint) in
                    PointMark(x: .value("Datum", p.date), y: .value("Wert", p.value))
                        .foregroundStyle(ppColor(ppLineColors, p.colorIdx))
                        .symbolSize(60)
                }
            }
        }
        .chartYScale(domain: domain)
        .chartXSelection(value: $selectedDate)
        .chartPlotStyle { plot in plot.clipped() }
        .chartYAxis {
            AxisMarks(position: .leading, values: .automatic(desiredCount: 6)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.75))
                    .foregroundStyle(Color(red: 148 / 255, green: 163 / 255, blue: 184 / 255).opacity(0.12))
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(fmtY(v)).font(.caption2).foregroundStyle(ppAxisText)
                    }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 8)) { value in
                AxisValueLabel {
                    if let d = value.as(Date.self) {
                        Text(String(ISODates.string(from: d).prefix(7))).font(.caption2).foregroundStyle(ppAxisText)
                    }
                }
            }
        }
        .frame(height: 300)
    }

    private func tooltip(_ date: ISODate, _ pts: [PPChartPoint]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(fmtDate(date)).font(.caption2.weight(.semibold)).foregroundStyle(Color(hex: 0x94a3b8))
            ForEach(pts) { (p: PPChartPoint) in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: p.dashed ? 2 : 4)
                        .fill(ppColor(ppLineColors, p.colorIdx))
                        .frame(width: 8, height: 8)
                    Text(p.label).font(.caption2).foregroundStyle(Color(hex: 0x94a3b8))
                    Spacer(minLength: 8)
                    Text(fmtValue(p.value)).font(.caption.weight(.bold)).foregroundStyle(Color(hex: 0xf1f5f9))
                }
            }
        }
        .padding(8)
        .frame(minWidth: 160)
        .background(Color(hex: 0x0f172a, opacity: 0.95))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: 0x94a3b8, opacity: 0.2)))
    }
}

/// Fläche + Leuchtlinie + Hauptlinie einer Serie.
private struct PPSeriesMarks: ChartContent {
    let series: PPSeries
    let lower: Double

    private struct Pt: Identifiable {
        let id: Int
        let date: Date
        let value: Double
    }

    private var pts: [Pt] {
        var result: [Pt] = []
        for (i, p) in series.points.enumerated() {
            if let d = ISODates.date(from: p.date) { result.append(Pt(id: i, date: d, value: p.value)) }
        }
        return result
    }

    var body: some ChartContent {
        let line = ppColor(ppLineColors, series.colorIdx)
        let glow = ppColor(ppGlowColors, series.colorIdx)
        let areaGradient = LinearGradient(colors: [line.opacity(series.dashed ? 0.0 : 0.28), line.opacity(0.01)],
                                          startPoint: .top, endPoint: .bottom)
        let data = pts
        let showArea = !series.dashed && data.count >= 2
        ForEach(showArea ? data : []) { (p: Pt) in
            AreaMark(x: .value("Datum", p.date),
                     yStart: .value("Basis", lower),
                     yEnd: .value("Wert", p.value),
                     series: .value("Serie", series.key + "-area"))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(areaGradient)
        }
        ForEach(data) { (p: Pt) in
            LineMark(x: .value("Datum", p.date), y: .value("Wert", p.value),
                     series: .value("Serie", series.key + "-glow"))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(glow.opacity(0.18))
                .lineStyle(StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round))
        }
        ForEach(data) { (p: Pt) in
            LineMark(x: .value("Datum", p.date), y: .value("Wert", p.value),
                     series: .value("Serie", series.key))
                .interpolationMethod(.catmullRom)
                .foregroundStyle(line)
                .lineStyle(StrokeStyle(lineWidth: series.dashed ? 1.8 : 2.5, lineCap: .round, lineJoin: .round,
                                       dash: series.dashed ? [7, 5] : []))
        }
    }
}
