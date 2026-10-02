import SwiftUI
import Charts

// Port von src/components/ExpenseChart.jsx
// Daueraufträge hochgerechnet auf Monat/Quartal/Jahr, gruppiert nach Oberkategorien:
// Kennzahlen, Donut (Top 8 Ausgabenkategorien + "Sonstige") mit Legende und
// horizontaler Balkenvergleich Ausgaben/Einnahmen je Oberkategorie.

private enum ExpenseChartPeriod: String, CaseIterable, Identifiable {
    case month, quarter, year
    var id: String { rawValue }

    var label: String {
        switch self {
        case .month: return "Monat"
        case .quarter: return "Quartal"
        case .year: return "Jahr"
        }
    }

    var short: String {
        switch self {
        case .month: return "pro Monat"
        case .quarter: return "pro Quartal"
        case .year: return "pro Jahr"
        }
    }

    /// Faktortabelle `FREQ_FACTOR` der Web-App.
    func factor(_ f: Frequency) -> Double {
        switch self {
        case .month:
            switch f {
            case .monthly: return 1
            case .quarterly: return 1.0 / 3
            case .halfyearly: return 1.0 / 6
            case .yearly: return 1.0 / 12
            }
        case .quarter:
            switch f {
            case .monthly: return 3
            case .quarterly: return 1
            case .halfyearly: return 1.0 / 2
            case .yearly: return 1.0 / 4
            }
        case .year:
            switch f {
            case .monthly: return 12
            case .quarterly: return 4
            case .halfyearly: return 2
            case .yearly: return 1
            }
        }
    }
}

private let expenseChartPalette: [Color] = [
    Color(hex: 0xef4444), Color(hex: 0xf97316), Color(hex: 0xeab308), Color(hex: 0x22c55e),
    Color(hex: 0x06b6d4), Color(hex: 0x3b82f6), Color(hex: 0x8b5cf6), Color(hex: 0xec4899),
    Color(hex: 0x14b8a6), Color(hex: 0x84cc16),
]

private struct ExpenseChartCatTotal: Identifiable {
    let id: String
    let name: String
    let expense: Double
    let income: Double
}

private struct ExpenseChartSegment: Identifiable {
    let id: String
    let name: String
    let expense: Double
    let color: Color
    let pct: Double
}

private struct ExpenseChartModel {
    var totalExpense: Double = 0
    var totalIncome: Double = 0
    var rootData: [ExpenseChartCatTotal] = []
    var segments: [ExpenseChartSegment] = []
    var donutTotal: Double = 0
    var maxBarValue: Double = 1

    var totalBalance: Double { totalIncome - totalExpense }

    @MainActor
    init(store: DataStore, period: ExpenseChartPeriod) {
        let recurrings = store.recurringPayments
        let categories = store.categories
        var catTypes: [EntityID: CategoryType] = [:]
        for c in categories { catTypes[c.id] = c.type }

        func isIncome(_ r: RecurringPayment) -> Bool {
            let t: CategoryType? = r.type ?? r.categoryId.flatMap { catTypes[$0] }
            return t == .income
        }
        func proj(_ r: RecurringPayment) -> Double { r.amount * period.factor(r.frequency) }

        totalExpense = recurrings.filter { !isIncome($0) }.reduce(0) { $0 + proj($1) }
        totalIncome = recurrings.filter { isIncome($0) }.reduce(0) { $0 + proj($1) }

        // Oberkategorien inkl. aller Nachfahren
        var roots: [ExpenseChartCatTotal] = []
        for c in categories where c.parent == nil {
            let ids = store.categoryDescendantIDs(c.id)
            var expense = 0.0
            var income = 0.0
            for r in recurrings {
                guard let cid = r.categoryId, ids.contains(cid) else { continue }
                if isIncome(r) { income += proj(r) } else { expense += proj(r) }
            }
            if expense > 0 || income > 0 {
                roots.append(ExpenseChartCatTotal(id: c.id.key, name: c.name, expense: expense, income: income))
            }
        }

        let uncatExpense = recurrings.filter { $0.categoryId == nil && !isIncome($0) }.reduce(0) { $0 + proj($1) }
        let uncatIncome = recurrings.filter { $0.categoryId == nil && isIncome($0) }.reduce(0) { $0 + proj($1) }
        if uncatExpense > 0 || uncatIncome > 0 {
            roots.append(ExpenseChartCatTotal(id: "__uncat__", name: "Ohne Kategorie",
                                              expense: uncatExpense, income: uncatIncome))
        }

        // Stabile Sortierung nach |Ausgaben − Einnahmen| absteigend
        rootData = roots.enumerated().sorted { l, r in
            let a = abs(l.element.expense - l.element.income)
            let b = abs(r.element.expense - r.element.income)
            return a != b ? a > b : l.offset < r.offset
        }.map { $0.element }

        // Donut: Top 8 Ausgabenkategorien, Rest = "Sonstige"
        let expenseCats = rootData.enumerated()
            .filter { $0.element.expense > 0 }
            .sorted { l, r in
                l.element.expense != r.element.expense ? l.element.expense > r.element.expense : l.offset < r.offset
            }
            .map { $0.element }

        if !expenseCats.isEmpty {
            let maxSegs = 8
            var items: [(id: String, name: String, expense: Double)] =
                expenseCats.prefix(maxSegs).map { (id: $0.id, name: $0.name, expense: $0.expense) }
            let restTotal = expenseCats.dropFirst(maxSegs).reduce(0) { $0 + $1.expense }
            if restTotal > 0 { items.append((id: "__other__", name: "Sonstige", expense: restTotal)) }
            let total = items.reduce(0) { $0 + $1.expense }
            segments = items.enumerated().map { i, c in
                ExpenseChartSegment(id: c.id, name: c.name, expense: c.expense,
                                    color: expenseChartPalette[i % expenseChartPalette.count],
                                    pct: total > 0 ? c.expense / total * 100 : 0)
            }
        }
        donutTotal = segments.reduce(0) { $0 + $1.expense }
        maxBarValue = rootData.reduce(1) { m, c in max(m, c.expense, c.income) }
    }
}

// MARK: - View

@MainActor
struct ExpenseChartView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var period: ExpenseChartPeriod = .month
    @State private var selectedAngle: Double?

    var body: some View {
        Group {
            if store.recurringPayments.isEmpty {
                EmptyStateView(title: "Keine Daueraufträge vorhanden", systemImage: "chart.pie",
                               message: "Die Grafik wird aus den Daueraufträgen berechnet.")
            } else {
                content(ExpenseChartModel(store: store, period: period))
            }
        }
        .moduleBackground()
        .navigationTitle("Ausgaben & Einnahmen – Grafik")
    }

    private func content(_ m: ExpenseChartModel) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PillPicker(options: ExpenseChartPeriod.allCases, selection: $period) { $0.label }
                summaryCards(m)
                if !m.segments.isEmpty { donutSection(m) }
                if !m.rootData.isEmpty { barsSection(m) }
            }
            .padding()
        }
    }

    // MARK: Kennzahlen

    private func summaryCards(_ m: ExpenseChartModel) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 8)], spacing: 8) {
            summaryCard(title: "Ausgaben \(period.short)", value: fmt(m.totalExpense), color: Color.expense)
            if m.totalIncome > 0 {
                summaryCard(title: "Einnahmen \(period.short)", value: "+" + fmt(m.totalIncome), color: Color.income)
            }
            summaryCard(title: "Saldo \(period.short)",
                        value: (m.totalBalance >= 0 ? "+" : "") + fmt(m.totalBalance),
                        color: m.totalBalance >= 0 ? theme.primary : Color.negativeRose)
        }
    }

    private func summaryCard(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).opacity(0.85)
            Text(value).font(.title3.weight(.bold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(color)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: Donut + Legende

    private func selectedSegment(_ segs: [ExpenseChartSegment]) -> ExpenseChartSegment? {
        guard let a = selectedAngle else { return nil }
        var acc = 0.0
        for s in segs {
            acc += s.expense
            if a <= acc { return s }
        }
        return nil
    }

    private func donutSection(_ m: ExpenseChartModel) -> some View {
        Card("AUSGABEN NACH KATEGORIE") {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 24) {
                    donut(m)
                    legend(m).frame(minWidth: 280)
                }
                VStack(spacing: 16) {
                    donut(m)
                    legend(m)
                }
            }
        }
    }

    private func donut(_ m: ExpenseChartModel) -> some View {
        let selected = selectedSegment(m.segments)
        return Chart(m.segments) { (s: ExpenseChartSegment) in
            SectorMark(angle: .value("Betrag", s.expense), innerRadius: .ratio(0.62), angularInset: 0.5)
                .foregroundStyle(s.color)
                .opacity(selected == nil || selected?.id == s.id ? 1 : 0.4)
        }
        .chartLegend(.hidden)
        .chartAngleSelection(value: $selectedAngle)
        .chartBackground { proxy in
            GeometryReader { geo in
                if let anchor = proxy.plotFrame {
                    let frame = geo[anchor]
                    donutCenter(selected: selected, m: m)
                        .frame(width: frame.width * 0.56)
                        .position(x: frame.midX, y: frame.midY)
                }
            }
        }
        .frame(width: 220, height: 220)
    }

    private func donutCenter(selected: ExpenseChartSegment?, m: ExpenseChartModel) -> some View {
        VStack(spacing: 2) {
            if let s = selected {
                Text(s.name).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            }
            Text(fmt(selected?.expense ?? m.donutTotal))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(selected?.color ?? Color.expense)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(period.short).font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func legend(_ m: ExpenseChartModel) -> some View {
        let selected = selectedSegment(m.segments)
        return VStack(alignment: .leading, spacing: 8) {
            ForEach(m.segments) { s in
                HStack(spacing: 6) {
                    Circle().fill(s.color).frame(width: 10, height: 10)
                    Text(s.name)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(fmt(s.expense)).fontWeight(.semibold).monospacedDigit()
                    Text("\(m.donutTotal > 0 ? fmtNum(s.expense / m.donutTotal * 100, 1) : "0") %")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .frame(minWidth: 48, alignment: .trailing)
                }
                .font(.subheadline)
                .opacity(selected == nil || selected?.id == s.id ? 1 : 0.5)
            }
        }
    }

    // MARK: Balkenvergleich

    private func barsSection(_ m: ExpenseChartModel) -> some View {
        Card("KATEGORIEN IM VERGLEICH") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 360), spacing: 24, alignment: .top)],
                      alignment: .leading, spacing: 14) {
                ForEach(m.rootData) { c in
                    ExpenseChartCategoryBars(cat: c, maxBarValue: m.maxBarValue)
                }
            }
        }
    }
}

private struct ExpenseChartCategoryBars: View {
    let cat: ExpenseChartCatTotal
    let maxBarValue: Double

    var body: some View {
        let net = cat.income - cat.expense
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(cat.name).font(.subheadline.weight(.medium))
                Spacer()
                Text((net >= 0 ? "+" : "") + fmt(net))
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Color.signed(net))
            }
            if cat.expense > 0 {
                barRow(label: "Ausg.", value: cat.expense, color: Color(hex: 0xef4444))
            }
            if cat.income > 0 {
                barRow(label: "Einnh.", value: cat.income, color: Color(hex: 0x22c55e))
            }
        }
    }

    private func barRow(label: String, value: Double, color: Color) -> some View {
        let pct = maxBarValue > 0 ? value / maxBarValue : 0
        return HStack(spacing: 6) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(width: 44, alignment: .trailing)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.borderGray)
                    Capsule().fill(color)
                        .frame(width: geo.size.width * CGFloat(min(max(pct, 0), 1)))
                        .animation(.easeOut(duration: 0.4), value: pct)
                }
            }
            .frame(height: 10)
            Text(fmt(value))
                .font(.caption2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(color)
                .frame(width: 96, alignment: .leading)
        }
    }
}
