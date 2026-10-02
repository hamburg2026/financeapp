import SwiftUI
import Charts

// Port von src/components/WealthChart.jsx
//
// Die Web-Komponente zeigt die aktuelle Vermögensverteilung nach Anlageklassen
// (Hero-Banner mit animiertem Gesamtwert, Donut, Kacheln mit Fortschrittsbalken).
// Berechnung exakt wie in der Web-App:
// - Bank: neuester Saldo aus balanceHistory, sonst balance
// - Wertpapiere: Menge (nur Kauf/Verkauf) × letzter Kurs (0 ohne Kurs), nur Menge > 0
// - Versicherungen: alle außer verrentungTyp "nurVerrentung" bzw. Legacy-Flag `nurVerrentung`
//   ("nichtRelevant" zählt hier – wie in der Web-App – mit)
// - Immobilien/Beteiligungen: neuester Historienwert, sonst current/value

private struct WealthAssetDef: Identifiable {
    let key: String
    let label: String
    let icon: String
    let color: Color
    let colorDark: Color
    var id: String { key }
}

private let wealthAssetDefs: [WealthAssetDef] = [
    WealthAssetDef(key: "bank", label: "Bankkonten", icon: "building.columns.fill",
                   color: Color(hex: 0x3b82f6), colorDark: Color(hex: 0x1d4ed8)),
    WealthAssetDef(key: "securities", label: "Wertpapiere", icon: "chart.line.uptrend.xyaxis",
                   color: Color(hex: 0x8b5cf6), colorDark: Color(hex: 0x6d28d9)),
    WealthAssetDef(key: "insurance", label: "Versicherungen", icon: "shield.lefthalf.filled",
                   color: Color(hex: 0x14b8a6), colorDark: Color(hex: 0x0f766e)),
    WealthAssetDef(key: "realEstate", label: "Immobilien", icon: "house.fill",
                   color: Color(hex: 0xf59e0b), colorDark: Color(hex: 0xb45309)),
    WealthAssetDef(key: "shares", label: "Firmenbeteil.", icon: "building.2.fill",
                   color: Color(hex: 0xec4899), colorDark: Color(hex: 0xbe185d)),
]

/// Neuester Eintrag (bei gleichem Datum der erste in Originalreihenfolge).
private func wealthNewest<T>(_ list: [T], date: (T) -> String) -> T? {
    var best: T?
    var bestDate = ""
    for e in list {
        let d = date(e)
        if best == nil || d > bestDate { best = e; bestDate = d }
    }
    return best
}

private struct WealthSegment: Identifiable {
    let def: WealthAssetDef
    let value: Double
    let pct: Double
    var id: String { def.key }
}

@MainActor
private func wealthValues(_ store: DataStore) -> [String: Double] {
    let totalBank = store.bankAccounts.reduce(0.0) { s, a in
        if let h = a.balanceHistory, let e = wealthNewest(h, date: { $0.date }) { return s + e.value }
        return s + a.balance
    }

    let prices = store.securityPrices
    func currentPrice(_ secId: String) -> Double {
        guard let list = prices[secId], let e = wealthNewest(list, date: { $0.date }) else { return 0 }
        return e.value
    }
    var totalSecurities = 0.0
    for depot in store.depots {
        var qty: [String: Double] = [:]
        for t in store.depotTransactions where t.depotId == depot.id {
            let k = t.securityId.key
            if qty[k] == nil { qty[k] = 0 }
            if t.type == .buy { qty[k, default: 0] += t.quantity }
            if t.type == .sell { qty[k, default: 0] -= t.quantity }
        }
        for (secId, q) in qty where q > 0 {
            totalSecurities += q * currentPrice(secId)
        }
    }

    let totalInsurance = store.insuranceContracts
        .filter { $0.verrentungTyp != .nurVerrentung && !$0.nurVerrentung }
        .reduce(0.0) { s, c in
            if let e = wealthNewest(c.valueHistory, date: { $0.date }) { return s + e.value }
            return s + (c.value ?? 0)
        }
    let totalRealEstate = store.realEstate.reduce(0.0) { s, p in
        if let e = wealthNewest(p.currentHistory, date: { $0.date }) { return s + e.value }
        return s + p.current
    }
    let totalShares = store.companyShares.reduce(0.0) { s, sh in
        if let e = wealthNewest(sh.valueHistory, date: { $0.date }) { return s + e.value }
        return s + sh.value
    }
    return ["bank": totalBank, "securities": totalSecurities, "insurance": totalInsurance,
            "realEstate": totalRealEstate, "shares": totalShares]
}

// MARK: - Animierter Zähler

private struct WealthCountingText: View, Animatable {
    var value: Double
    var animatableData: Double {
        get { value }
        set { value = newValue }
    }
    var body: some View {
        Text(fmt(value))
    }
}

// MARK: - View

@MainActor
struct WealthChartView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var animated = false
    @State private var displayedTotal: Double = 0
    @State private var selectedAngle: Double?

    var body: some View {
        let values = wealthValues(store)
        let total = wealthAssetDefs.reduce(0.0) { $0 + (values[$1.key] ?? 0) }
        Group {
            if total == 0 {
                EmptyStateView(title: "Noch keine Vermögenswerte erfasst.", systemImage: "eurosign.circle")
            } else {
                content(values: values, total: total)
            }
        }
        .moduleBackground()
        .navigationTitle("Vermögen")
    }

    private func segments(values: [String: Double], total: Double) -> [WealthSegment] {
        wealthAssetDefs
            .filter { (values[$0.key] ?? 0) > 0 }
            .map { WealthSegment(def: $0, value: values[$0.key] ?? 0, pct: (values[$0.key] ?? 0) / total * 100) }
    }

    private func content(values: [String: Double], total: Double) -> some View {
        let segs = segments(values: values, total: total)
        return ScrollView {
            VStack(spacing: 0) {
                hero(segs: segs, total: total)
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 24) {
                        donutColumn(segs: segs, total: total)
                        cards(segs: segs)
                    }
                    VStack(spacing: 20) {
                        donutColumn(segs: segs, total: total)
                        cards(segs: segs)
                    }
                }
                .padding(20)
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.borderGray.opacity(0.6)))
            .padding()
        }
        .onAppear {
            animated = false
            displayedTotal = 0
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) {
                animated = true
                withAnimation(.easeOut(duration: 1.4)) { displayedTotal = total }
            }
        }
        .onChange(of: total) { _, newTotal in
            withAnimation(.easeOut(duration: 1.4)) { displayedTotal = newTotal }
        }
    }

    // MARK: Hero

    private func hero(segs: [WealthSegment], total: Double) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("GESAMTVERMÖGEN")
                .font(.caption2)
                .tracking(1.6)
                .opacity(0.65)
                .padding(.bottom, 10)
            WealthCountingText(value: displayedTotal)
                .font(.system(size: 42, weight: .heavy))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.bottom, 14)
            legend(segs: segs)
        }
        .padding(.horizontal, 28)
        .padding(.top, 28)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(.white)
        .background { heroBackground }
        .clipped()
    }

    private var heroBackground: some View {
        ZStack {
            LinearGradient(colors: [theme.dark, theme.primary, theme.primary],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            LinearGradient(colors: [Color.clear, Color.clear, Color(hex: 0x5b21b6).opacity(0.45)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            GeometryReader { geo in
                Circle().fill(Color.white.opacity(0.05)).frame(width: 220, height: 220)
                    .position(x: geo.size.width - 60, y: 60)
                Circle().fill(Color.white.opacity(0.04)).frame(width: 160, height: 160)
                    .position(x: geo.size.width - 110, y: geo.size.height + 10)
                Circle().fill(Color.white.opacity(0.03)).frame(width: 130, height: 130)
                    .position(x: 35, y: geo.size.height + 25)
            }
        }
    }

    private func legend(segs: [WealthSegment]) -> some View {
        FlowLayoutWealth(spacing: 18, lineSpacing: 8) {
            ForEach(segs) { s in
                HStack(spacing: 6) {
                    Circle().fill(s.def.color).frame(width: 9, height: 9)
                        .shadow(color: s.def.color.opacity(0.7), radius: 3)
                    Text(s.def.label).font(.caption).opacity(0.8)
                    Text("\(fmtNum(s.pct, 1)) %").font(.caption).opacity(0.55)
                }
            }
        }
    }

    // MARK: Donut

    private func selectedSegment(_ segs: [WealthSegment]) -> WealthSegment? {
        guard let a = selectedAngle else { return nil }
        var acc = 0.0
        for s in segs {
            acc += s.value
            if a <= acc { return s }
        }
        return nil
    }

    private func donutColumn(segs: [WealthSegment], total: Double) -> some View {
        let selected = selectedSegment(segs)
        let top = segs.enumerated().max { l, r in
            l.element.value != r.element.value ? l.element.value < r.element.value : l.offset > r.offset
        }?.element
        return VStack(spacing: 12) {
            Chart(segs) { (s: WealthSegment) in
                SectorMark(angle: .value("Wert", s.value), innerRadius: .ratio(0.63), angularInset: 0.5)
                    .foregroundStyle(s.def.color)
                    .opacity(selected == nil || selected?.id == s.id ? 1 : 0.45)
            }
            .chartLegend(.hidden)
            .chartAngleSelection(value: $selectedAngle)
            .chartBackground { proxy in
                GeometryReader { geo in
                    if let anchor = proxy.plotFrame {
                        let frame = geo[anchor]
                        donutCenter(selected: selected, total: total)
                            .frame(width: frame.width * 0.56)
                            .position(x: frame.midX, y: frame.midY)
                    }
                }
            }
            .frame(width: 230, height: 230)
            .shadow(color: .black.opacity(0.15), radius: 18, y: 10)
            if let top {
                (Text("Größte Position: ") + Text(top.def.label).bold().foregroundColor(top.def.color))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 260)
    }

    private func donutCenter(selected: WealthSegment?, total: Double) -> some View {
        VStack(spacing: 2) {
            Text((selected?.def.label ?? "Gesamt").uppercased())
                .font(.system(size: 10))
                .tracking(0.8)
                .foregroundStyle(.secondary)
            Text(fmt(selected?.value ?? total))
                .font(.headline.weight(.heavy))
                .foregroundStyle(selected?.def.color ?? theme.primary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            if let s = selected {
                Text("\(fmtNum(s.pct, 1)) %").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Kacheln

    private func cards(segs: [WealthSegment]) -> some View {
        VStack(spacing: 9) {
            ForEach(Array(segs.enumerated()), id: \.element.id) { i, s in
                WealthAssetCard(segment: s, index: i, animated: animated)
            }
        }
        .frame(minWidth: 280, maxWidth: .infinity)
    }
}

private struct WealthAssetCard: View {
    let segment: WealthSegment
    let index: Int
    let animated: Bool

    var body: some View {
        let def = segment.def
        VStack(spacing: 7) {
            HStack {
                Image(systemName: def.icon)
                    .font(.title3)
                    .foregroundStyle(def.color)
                    .frame(width: 28)
                Text(def.label).font(.subheadline.weight(.semibold))
                Spacer()
                VStack(alignment: .trailing, spacing: 1) {
                    Text(fmt(segment.value))
                        .font(.subheadline.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(def.color)
                    Text("\(fmtNum(segment.pct, 1)) %")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.borderGray)
                    Capsule()
                        .fill(LinearGradient(colors: [def.color, def.colorDark], startPoint: .leading, endPoint: .trailing))
                        .frame(width: animated ? geo.size.width * CGFloat(min(segment.pct, 100) / 100) : 0)
                        .animation(.timingCurve(0.4, 0, 0.2, 1, duration: 1).delay(Double(index) * 0.08), value: animated)
                }
            }
            .frame(height: 5)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(def.color.opacity(0.055))
        .overlay(alignment: .leading) {
            Rectangle().fill(def.color).frame(width: 3)
        }
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(def.color.opacity(0.13)))
    }
}

// MARK: - Einfaches Fließlayout für die Legende

private struct FlowLayoutWealth: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, widest: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: proposal.width ?? widest, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            sv.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
