import SwiftUI

// Port von `src/components/ExpenseTree.jsx` ("Ausgabenübersicht").
// Drei Ansichten: Daueraufträge (hochgerechnet je Monat/Quartal/Jahr), Kategorienbaum der Umsätze
// und Pivot-Tabelle der Umsätze (Kategorie × Zeitraum) mit Drilldown in die Einzelumsätze.

// MARK: - Konstanten & Hilfstypen

fileprivate enum ExpenseTreeMode: String, CaseIterable, Identifiable {
    case recurring, tree, pivot
    var id: String { rawValue }
    var label: String {
        switch self {
        case .recurring: return "Daueraufträge"
        case .tree: return "Kategorienbaum"
        case .pivot: return "Pivot"
        }
    }
}

/// Zeitraum (Daueraufträge: Hochrechnung; Pivot: Spaltengruppierung).
fileprivate enum ExpenseTreePeriod: String, CaseIterable, Hashable {
    case month, quarter, year

    var label: String {
        switch self {
        case .month: return "Monat"
        case .quarter: return "Quartal"
        case .year: return "Jahr"
        }
    }

    /// "pro Monat", "pro Quartal", "pro Jahr"
    var perLabel: String { "pro " + label }

    /// FREQ_FACTOR der Web-App
    func factor(_ f: Frequency) -> Double {
        switch (self, f) {
        case (.month, .monthly): return 1
        case (.month, .quarterly): return 1.0 / 3
        case (.month, .halfyearly): return 1.0 / 6
        case (.month, .yearly): return 1.0 / 12
        case (.quarter, .monthly): return 3
        case (.quarter, .quarterly): return 1
        case (.quarter, .halfyearly): return 1.0 / 2
        case (.quarter, .yearly): return 1.0 / 4
        case (.year, .monthly): return 12
        case (.year, .quarterly): return 4
        case (.year, .halfyearly): return 2
        case (.year, .yearly): return 1
        }
    }
}

fileprivate enum ExpenseTreeTypeFilter: String, CaseIterable, Hashable {
    case all, expense, income
    var label: String {
        switch self {
        case .all: return "Alle"
        case .expense: return "Ausgaben"
        case .income: return "Einnahmen"
        }
    }
}

fileprivate enum ExpenseTreeGrouping: String, CaseIterable, Hashable {
    case category, frequency
    var label: String { self == .category ? "Kategorie" : "Frequenz" }
}

fileprivate let expenseTreeFreqOptions: [Frequency?] = [nil, .monthly, .quarterly, .halfyearly, .yearly]

fileprivate func expenseTreeFreqFilterLabel(_ f: Frequency?) -> String {
    guard let f else { return "Alle" }
    switch f {
    case .monthly: return "Monatl."
    case .quarterly: return "Quartl."
    case .halfyearly: return "Halbj."
    case .yearly: return "Jährl."
    }
}

/// Farbe wie `clr()` der Web-App: grün > 0, rot < 0, grau = 0.
fileprivate func expenseTreeColor(_ v: Double) -> Color {
    if v > 0 { return .income }
    if v < 0 { return .expense }
    return .mutedText
}

fileprivate func expenseTreeSigned(_ v: Double) -> String { (v > 0 ? "+" : "") + fmt(v) }

fileprivate let expenseTreeGerman = Locale(identifier: "de_DE")

fileprivate func expenseTreeNameLess(_ a: Category, _ b: Category) -> Bool {
    a.name.compare(b.name, locale: expenseTreeGerman) == .orderedAscending
}

// MARK: - Pivot-Helfer

fileprivate enum ExpenseTreePivot {
    /// getPivotKey
    static func key(_ date: String, _ g: ExpenseTreePeriod) -> String {
        let parts = date.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
        let y = parts.count > 0 ? parts[0] : ""
        let m = parts.count > 1 ? parts[1] : ""
        switch g {
        case .month: return "\(y)-\(m)"
        case .quarter:
            let mi = Int(m) ?? 0
            return "\(y)-Q\((mi + 2) / 3)"
        case .year: return y
        }
    }

    /// pivotLabel: "Jan 24", "Q1 24", "2024"
    static func label(_ key: String, _ g: ExpenseTreePeriod) -> String {
        let p = key.split(separator: "-").map(String.init)
        switch g {
        case .month:
            guard p.count == 2, let m = Int(p[1]) else { return key }
            return "\(monthShortName(m)) \(String(p[0].dropFirst(2)))"
        case .quarter:
            guard p.count == 2 else { return key }
            return "\(p[1]) \(String(p[0].dropFirst(2)))"
        case .year:
            return key
        }
    }

    /// genPivotPeriods – schrittweise wie JavaScript-`Date` (inkl. Tagesüberlauf).
    static func periods(from: String, to: String, _ g: ExpenseTreePeriod) -> [String] {
        guard !from.isEmpty, !to.isEmpty, var y = ISODates.year(from), var m = ISODates.month(from) else { return [] }
        var d = from.count >= 10 ? (Int(from.dropFirst(8).prefix(2)) ?? 1) : 1
        let end = String(to.prefix(10))
        var ps: [String] = []
        var guardCount = 0
        while ISODates.make(y, m, d) <= end && guardCount < 5000 {
            guardCount += 1
            let k: String
            switch g {
            case .month: k = String(format: "%d-%02d", y, m)
            case .quarter: k = "\(y)-Q\((m + 2) / 3)"
            case .year: k = "\(y)"
            }
            if ps.last != k { ps.append(k) }
            switch g {
            case .month: m += 1
            case .quarter: m += 3
            case .year: y += 1
            }
            while m > 12 { m -= 12; y += 1 }
            var last = ISODates.lastDay(year: y, month: m)
            while d > last {
                d -= last
                m += 1
                if m > 12 { m = 1; y += 1 }
                last = ISODates.lastDay(year: y, month: m)
            }
        }
        return ps
    }

    /// pivotPeriodToDateRange
    static func dateRange(_ key: String, _ g: ExpenseTreePeriod) -> (from: String, to: String) {
        let p = key.split(separator: "-").map(String.init)
        switch g {
        case .year:
            return ("\(key)-01-01", "\(key)-12-31")
        case .quarter:
            guard p.count == 2, let y = Int(p[0]), let q = Int(p[1].dropFirst()) else { return ("", "") }
            let sm = (q - 1) * 3 + 1, em = sm + 2
            return ("\(p[0])-\(String(format: "%02d", sm))-01",
                    "\(p[0])-\(String(format: "%02d", em))-\(String(format: "%02d", ISODates.lastDay(year: y, month: em)))")
        case .month:
            guard p.count == 2, let y = Int(p[0]), let m = Int(p[1]) else { return ("", "") }
            return ("\(p[0])-\(p[1])-01", "\(p[0])-\(p[1])-\(String(format: "%02d", ISODates.lastDay(year: y, month: m)))")
        }
    }
}

// MARK: - Datenmodelle

fileprivate enum ExpenseTreeKey: Hashable {
    case cat(EntityID)
    case orphan(String)
    case uncat
}

/// Aufbereitete Umsatzdaten (Baum + Pivot) für den aktuellen Filter.
fileprivate struct ExpenseTreeTxModel {
    let txs: [BankTransaction]
    let roots: [Category]
    let children: [EntityID: [Category]]
    let byKey: [ExpenseTreeKey: [BankTransaction]]
    let cells: [ExpenseTreeKey: [String: Double]]
    let subtreeTotal: [EntityID: Double]
    let subtreeCells: [EntityID: [String: Double]]
    let orphanNames: [String]
    let periods: [String]
    let grandByPeriod: [String: Double]
    let totalExpense: Double
    let totalIncome: Double

    init(categories: [Category], txs: [BankTransaction], periods: [String], groupBy: ExpenseTreePeriod) {
        var nameToId: [String: EntityID] = [:]
        var roots: [Category] = []
        var children: [EntityID: [Category]] = [:]
        for c in categories {
            nameToId[c.name] = c.id          // wie Object.fromEntries: letzter gewinnt
            if let p = c.parent { children[p, default: []].append(c) } else { roots.append(c) }
        }

        var totals: [ExpenseTreeKey: Double] = [:]
        var byKey: [ExpenseTreeKey: [BankTransaction]] = [:]
        var cells: [ExpenseTreeKey: [String: Double]] = [:]
        var orphanNames: [String] = []
        var orphanSeen = Set<String>()
        var grand: [String: Double] = [:]
        var exp = 0.0, inc = 0.0

        for tx in txs {
            let key: ExpenseTreeKey
            if tx.category.isEmpty {
                key = .uncat
            } else if let id = nameToId[tx.category] {
                key = .cat(id)
            } else {
                key = .orphan(tx.category)
                if !orphanSeen.contains(tx.category) {
                    orphanSeen.insert(tx.category)
                    orphanNames.append(tx.category)
                }
            }
            totals[key, default: 0] += tx.amount
            byKey[key, default: []].append(tx)
            let pk = ExpenseTreePivot.key(tx.date, groupBy)
            cells[key, default: [:]][pk, default: 0] += tx.amount
            grand[pk, default: 0] += tx.amount
            if tx.amount < 0 { exp += Swift.abs(tx.amount) } else if tx.amount > 0 { inc += tx.amount }
        }

        var memoTotal: [EntityID: Double] = [:]
        var memoCells: [EntityID: [String: Double]] = [:]
        func visit(_ id: EntityID, _ depth: Int) {
            if memoTotal[id] != nil || depth > 64 { return }
            var t = totals[.cat(id)] ?? 0
            var cs = cells[.cat(id)] ?? [:]
            for ch in children[id] ?? [] {
                visit(ch.id, depth + 1)
                t += memoTotal[ch.id] ?? 0
                for (k, v) in memoCells[ch.id] ?? [:] { cs[k, default: 0] += v }
            }
            memoTotal[id] = t
            memoCells[id] = cs
        }
        for c in categories { visit(c.id, 0) }

        self.txs = txs
        self.roots = roots
        self.children = children
        self.byKey = byKey
        self.cells = cells
        self.subtreeTotal = memoTotal
        self.subtreeCells = memoCells
        self.orphanNames = orphanNames
        self.periods = periods
        self.grandByPeriod = grand
        self.totalExpense = exp
        self.totalIncome = inc
    }

    func total(_ id: EntityID) -> Double { subtreeTotal[id] ?? 0 }

    func value(_ id: EntityID, _ period: String) -> Double { subtreeCells[id]?[period] ?? 0 }

    func hasData(_ id: EntityID) -> Bool { periods.contains { value(id, $0) != 0 } }

    func kids(_ parent: EntityID?) -> [Category] {
        guard let parent else { return roots }
        return children[parent] ?? []
    }
}

/// Aufbereitete Daueraufträge (gefiltert, Teilbaum-Summen).
fileprivate struct ExpenseTreeRecModel {
    let filtered: [RecurringPayment]
    let roots: [Category]
    let children: [EntityID: [Category]]
    let direct: [EntityID: [RecurringPayment]]
    let netTotal: [EntityID: Double]
    let absTotal: [EntityID: Double]

    init(categories: [Category], filtered: [RecurringPayment],
         proj: (RecurringPayment) -> Double, signed: (RecurringPayment) -> Double) {
        var roots: [Category] = []
        var children: [EntityID: [Category]] = [:]
        for c in categories {
            if let p = c.parent { children[p, default: []].append(c) } else { roots.append(c) }
        }
        var direct: [EntityID: [RecurringPayment]] = [:]
        var ownNet: [EntityID: Double] = [:]
        var ownAbs: [EntityID: Double] = [:]
        for r in filtered {
            guard let cid = r.categoryId else { continue }
            direct[cid, default: []].append(r)
            ownNet[cid, default: 0] += signed(r)
            ownAbs[cid, default: 0] += proj(r)
        }
        var memoNet: [EntityID: Double] = [:]
        var memoAbs: [EntityID: Double] = [:]
        func visit(_ id: EntityID, _ depth: Int) {
            if memoNet[id] != nil || depth > 64 { return }
            var n = ownNet[id] ?? 0
            var a = ownAbs[id] ?? 0
            for ch in children[id] ?? [] {
                visit(ch.id, depth + 1)
                n += memoNet[ch.id] ?? 0
                a += memoAbs[ch.id] ?? 0
            }
            memoNet[id] = n
            memoAbs[id] = a
        }
        for c in categories { visit(c.id, 0) }

        self.filtered = filtered
        self.roots = roots
        self.children = children
        self.direct = direct
        self.netTotal = memoNet
        self.absTotal = memoAbs
    }

    func kids(_ parent: EntityID?) -> [Category] {
        guard let parent else { return roots }
        return children[parent] ?? []
    }
}

/// Zeile im Baum (Daueraufträge oder Umsätze).
fileprivate enum ExpenseTreeRow {
    case category(Category, level: Int, value: Double, hasContent: Bool, isOpen: Bool)
    case recurring(RecurringPayment, projected: Double, income: Bool, indent: Int, catName: String?)
    case transaction(BankTransaction, indent: Int)
    case frequency(Frequency, net: Double, isOpen: Bool)
    case uncategorized(Double)
}

/// Zeile der Pivot-Tabelle.
fileprivate enum ExpenseTreePivotRow {
    case header(String)
    case category(Category, level: Int, hasChildren: Bool, isOpen: Bool, vals: [Double], total: Double)
    case orphan(String, vals: [Double], total: Double)
    case uncategorized(vals: [Double], total: Double)
}

fileprivate enum ExpenseTreeLayout {
    static let rowHeight: CGFloat = 32
    static let nameWidth: CGFloat = 220
    static let valueWidth: CGFloat = 104
    static let totalWidth: CGFloat = 116
}

// MARK: - Hauptansicht

struct ExpenseTreeView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var mode: ExpenseTreeMode = .pivot
    @State private var period: ExpenseTreePeriod = .month
    @State private var rangeKey: DateDimension = .thisYear
    @State private var txFrom: ISODate = DateDimension.thisYear.range.from
    @State private var txTo: ISODate = DateDimension.thisYear.range.to
    @State private var filterAccount: EntityID? = nil
    @State private var groupBy: ExpenseTreeGrouping = .category
    @State private var expandedCats: Set<EntityID> = []
    @State private var expandedFreqs: Set<Frequency> = Set(Frequency.allCases)

    @State private var filterType: ExpenseTreeTypeFilter = .all
    @State private var filterFrequency: Frequency? = nil
    @State private var filterSearch = ""

    @State private var txFilterType: ExpenseTreeTypeFilter = .all
    @State private var pivotGroupBy: ExpenseTreePeriod = .quarter
    @State private var pivotExpanded: Set<EntityID> = []
    @State private var drilldown: ExpenseTreeDrilldown?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                modePicker
                if mode == .recurring {
                    recurringContent(recModel)
                } else {
                    transactionContent(txModel)
                }
            }
            .padding()
        }
        .moduleBackground()
        .navigationTitle("Ausgabenübersicht")
        .sheet(item: $drilldown) { d in
            ExpenseTreeDrilldownSheet(drilldown: d)
                .environmentObject(store)
                .environment(\.appTheme, theme)
        }
    }

    private var modePicker: some View {
        Picker("Ansicht", selection: $mode) {
            ForEach(ExpenseTreeMode.allCases) { m in
                Text(m.label).tag(m)
            }
        }
        .pickerStyle(.segmented)
        .frame(maxWidth: 520)
    }

    // MARK: Daueraufträge – Berechnung

    private func isIncome(_ r: RecurringPayment) -> Bool { store.effectiveType(of: r) == .income }
    private func proj(_ r: RecurringPayment) -> Double { r.amount * period.factor(r.frequency) }
    private func projSigned(_ r: RecurringPayment) -> Double { isIncome(r) ? proj(r) : -proj(r) }

    private var filteredRecurrings: [RecurringPayment] {
        let q = filterSearch.lowercased()
        return store.recurringPayments.filter { r in
            if filterType == .income && !isIncome(r) { return false }
            if filterType == .expense && isIncome(r) { return false }
            if let f = filterFrequency, r.frequency != f { return false }
            if !q.isEmpty && !r.description.lowercased().contains(q) { return false }
            return true
        }
    }

    private var hasActiveFilter: Bool { filterType != .all || filterFrequency != nil || !filterSearch.isEmpty }

    private var recModel: ExpenseTreeRecModel {
        ExpenseTreeRecModel(categories: store.categories, filtered: filteredRecurrings,
                            proj: { proj($0) }, signed: { projSigned($0) })
    }

    private func resetFilters() {
        filterType = .all
        filterFrequency = nil
        filterSearch = ""
    }

    private func toggleCat(_ id: EntityID) {
        if expandedCats.contains(id) { expandedCats.remove(id) } else { expandedCats.insert(id) }
    }

    private func toggleFreq(_ f: Frequency) {
        if expandedFreqs.contains(f) { expandedFreqs.remove(f) } else { expandedFreqs.insert(f) }
    }

    private func expandAll() {
        expandedCats = Set(store.categories.map(\.id))
        expandedFreqs = Set(Frequency.allCases)
    }

    private func collapseAll() {
        expandedCats = []
        expandedFreqs = []
    }

    // MARK: Daueraufträge – Ansicht

    @ViewBuilder
    private func recurringContent(_ m: ExpenseTreeRecModel) -> some View {
        PillPicker(options: ExpenseTreePeriod.allCases, selection: $period, label: { $0.label })
        recurringSummary
        recurringFilters
        recurringGroupingBar(m)
        if store.recurringPayments.isEmpty {
            emptyText("Noch keine Daueraufträge angelegt.")
        } else if m.filtered.isEmpty {
            emptyText("Keine Einträge entsprechen den Filterkriterien.")
        } else if groupBy == .category {
            treeBox(recurringTreeRows(m))
        } else {
            treeBox(frequencyRows(m))
        }
    }

    private var recurringSummary: some View {
        let recs = store.recurringPayments
        let inc = recs.filter { isIncome($0) }.reduce(0.0) { $0 + proj($1) }
        let exp = recs.filter { !isIncome($0) }.reduce(0.0) { $0 + proj($1) }
        let bal = inc - exp
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 170), spacing: 8)], spacing: 8) {
            StatTile(title: "Ausgaben " + period.perLabel, value: "–" + fmt(Swift.abs(exp)), color: .expense)
            if inc > 0 {
                StatTile(title: "Einnahmen " + period.perLabel, value: "+" + fmt(Swift.abs(inc)), color: .income)
            }
            StatTile(title: "Saldo " + period.perLabel, value: (bal >= 0 ? "+" : "") + fmt(Swift.abs(bal)),
                     color: bal >= 0 ? .positiveBlue : .negativeRose)
        }
    }

    private var recurringFilters: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                filterLabel("Typ:")
                PillPicker(options: ExpenseTreeTypeFilter.allCases, selection: $filterType, label: { $0.label })
            }
            HStack(spacing: 8) {
                filterLabel("Frequenz:")
                PillPicker(options: expenseTreeFreqOptions, selection: $filterFrequency,
                           label: { expenseTreeFreqFilterLabel($0) })
            }
            HStack(spacing: 8) {
                filterLabel("Suche:")
                TextField("Beschreibung suchen…", text: $filterSearch)
                    .textFieldStyle(.roundedBorder)
                if hasActiveFilter {
                    Button("Filter zurücksetzen") { resetFilters() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func recurringGroupingBar(_ m: ExpenseTreeRecModel) -> some View {
        HStack(spacing: 8) {
            filterLabel("Gruppieren:")
            PillPicker(options: ExpenseTreeGrouping.allCases, selection: $groupBy, label: { $0.label })
                .fixedSize(horizontal: true, vertical: false)
            Button("Alle aufklappen") { expandAll() }
                .buttonStyle(.bordered).controlSize(.small)
            Button("Alle zuklappen") { collapseAll() }
                .buttonStyle(.bordered).controlSize(.small)
            if hasActiveFilter {
                Text("(\(m.filtered.count) von \(store.recurringPayments.count))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }

    private func recurringTreeRows(_ m: ExpenseTreeRecModel) -> [ExpenseTreeRow] {
        var rows = recurringRows(m, parent: nil, level: 0)
        let uncat = m.filtered.filter { $0.categoryId == nil }
        if !uncat.isEmpty {
            rows.append(.uncategorized(uncat.reduce(0.0) { $0 + projSigned($1) }))
        }
        return rows
    }

    private func recurringRows(_ m: ExpenseTreeRecModel, parent: EntityID?, level: Int) -> [ExpenseTreeRow] {
        let nodes = m.kids(parent)
            .filter { (m.absTotal[$0.id] ?? 0) > 0 }
            .sorted { Swift.abs(m.netTotal[$0.id] ?? 0) > Swift.abs(m.netTotal[$1.id] ?? 0) }
        var rows: [ExpenseTreeRow] = []
        for c in nodes {
            let direct = m.direct[c.id] ?? []
            let hasChildren = m.kids(c.id).contains { (m.absTotal[$0.id] ?? 0) > 0 }
            let isOpen = expandedCats.contains(c.id)
            rows.append(.category(c, level: level, value: m.netTotal[c.id] ?? 0,
                                  hasContent: !direct.isEmpty || hasChildren, isOpen: isOpen))
            if isOpen {
                for r in direct {
                    rows.append(.recurring(r, projected: proj(r), income: isIncome(r), indent: level + 1, catName: nil))
                }
                if level < 64 { rows += recurringRows(m, parent: c.id, level: level + 1) }
            }
        }
        return rows
    }

    private func frequencyRows(_ m: ExpenseTreeRecModel) -> [ExpenseTreeRow] {
        var rows: [ExpenseTreeRow] = []
        for f in Frequency.allCases {
            let items = m.filtered.filter { $0.frequency == f }
            if items.isEmpty { continue }
            let net = items.reduce(0.0) { $0 + projSigned($1) }
            let isOpen = expandedFreqs.contains(f)
            rows.append(.frequency(f, net: net, isOpen: isOpen))
            if isOpen {
                for r in items {
                    let catName: String? = r.categoryId == nil ? nil : store.category(r.categoryId)?.name
                    rows.append(.recurring(r, projected: proj(r), income: isIncome(r), indent: 1, catName: catName))
                }
            }
        }
        return rows
    }

    // MARK: Umsätze – Berechnung

    private var filteredTxs: [BankTransaction] {
        store.transactions.filter { t in
            if let acc = filterAccount, t.accountId != acc { return false }
            if !txFrom.isEmpty && t.date < txFrom { return false }
            if !txTo.isEmpty && t.date > txTo { return false }
            return true
        }
    }

    private var typedTxs: [BankTransaction] {
        let base = filteredTxs
        switch txFilterType {
        case .expense: return base.filter { $0.amount < 0 }
        case .income: return base.filter { $0.amount > 0 }
        case .all: return base
        }
    }

    private var txModel: ExpenseTreeTxModel {
        ExpenseTreeTxModel(categories: store.categories, txs: typedTxs,
                           periods: ExpenseTreePivot.periods(from: txFrom, to: txTo, pivotGroupBy),
                           groupBy: pivotGroupBy)
    }

    private var rangeBinding: Binding<DateDimension> {
        Binding(get: { rangeKey }, set: { selectTxRange($0) })
    }

    private var fromBinding: Binding<ISODate> {
        Binding(get: { txFrom }, set: { txFrom = $0; rangeKey = .custom })
    }

    private var toBinding: Binding<ISODate> {
        Binding(get: { txTo }, set: { txTo = $0; rangeKey = .custom })
    }

    private func selectTxRange(_ key: DateDimension) {
        rangeKey = key
        let currentYear = ISODates.year(ISODates.today()) ?? 2000
        if key == .all {
            let dates = store.transactions.map(\.date).filter { !$0.isEmpty }.sorted()
            let firstYear = dates.first.flatMap { ISODates.year($0) } ?? currentYear
            txFrom = "\(firstYear)-01-01"
            txTo = "\(currentYear)-12-31"
        } else {
            let r = key.range
            txFrom = r.from
            txTo = r.to
        }
    }

    // MARK: Umsätze – Ansicht

    @ViewBuilder
    private func transactionContent(_ m: ExpenseTreeTxModel) -> some View {
        txFilterBar
        txSummary(m)
        if store.transactions.isEmpty {
            emptyText("Noch keine Umsätze vorhanden. Importieren Sie Kontoauszüge über den PDF-Import.")
        } else if m.txs.isEmpty {
            emptyText("Keine Umsätze im gewählten Zeitraum.")
        } else if mode == .tree {
            treeBox(txTreeRows(m))
        } else {
            pivotTable(m)
        }
    }

    private var txFilterBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                filterLabel("Zeitraum:")
                PillPicker(options: DateDimension.selectable, selection: rangeBinding,
                           label: { $0 == .all ? "Alle" : $0.label })
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 14, alignment: .leading)],
                      alignment: .leading, spacing: 10) {
                if !store.bankAccounts.isEmpty {
                    accountPicker
                }
                ISODatePicker("Von", date: fromBinding)
                ISODatePicker("Bis", date: toBinding)
                HStack(spacing: 6) {
                    filterLabel("Typ")
                    PillPicker(options: ExpenseTreeTypeFilter.allCases, selection: $txFilterType, label: { $0.label })
                }
                if mode == .tree {
                    HStack(spacing: 8) {
                        Button("Aufklappen") { expandAll() }
                        Button("Zuklappen") { collapseAll() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                } else {
                    PillPicker(options: ExpenseTreePeriod.allCases, selection: $pivotGroupBy, label: { $0.label })
                }
            }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var accountPicker: some View {
        HStack(spacing: 6) {
            filterLabel("Konto")
            Picker("Konto", selection: $filterAccount) {
                Text("Alle Konten").tag(EntityID?.none)
                ForEach(store.bankAccounts) { a in
                    Text(a.name).tag(EntityID?.some(a.id))
                }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            Spacer(minLength: 0)
        }
    }

    private func txSummary(_ m: ExpenseTreeTxModel) -> some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], spacing: 8) {
            if txFilterType != .income {
                StatTile(title: "Ausgaben", value: fmt(m.totalExpense), color: .expense)
            }
            if txFilterType != .expense && m.totalIncome > 0 {
                StatTile(title: "Einnahmen", value: "+" + fmt(m.totalIncome), color: .income)
            }
            StatTile(title: "Umsätze", value: "\(m.txs.count)")
        }
    }

    private func txTreeRows(_ m: ExpenseTreeTxModel) -> [ExpenseTreeRow] {
        var rows = txRows(m, parent: nil, level: 0)
        let uncat = m.byKey[.uncat] ?? []
        if !uncat.isEmpty {
            rows.append(.uncategorized(uncat.reduce(0.0) { $0 + $1.amount }))
        }
        return rows
    }

    private func txRows(_ m: ExpenseTreeTxModel, parent: EntityID?, level: Int) -> [ExpenseTreeRow] {
        let nodes = m.kids(parent)
            .filter { m.total($0.id) != 0 }
            .sorted { Swift.abs(m.total($0.id)) > Swift.abs(m.total($1.id)) }
        var rows: [ExpenseTreeRow] = []
        for c in nodes {
            let direct = m.byKey[.cat(c.id)] ?? []
            let hasChildren = m.kids(c.id).contains { m.total($0.id) != 0 }
            let isOpen = expandedCats.contains(c.id)
            rows.append(.category(c, level: level, value: m.total(c.id),
                                  hasContent: !direct.isEmpty || hasChildren, isOpen: isOpen))
            if isOpen {
                for tx in direct.sorted(by: { $0.date > $1.date }) {
                    rows.append(.transaction(tx, indent: level + 1))
                }
                if level < 64 { rows += txRows(m, parent: c.id, level: level + 1) }
            }
        }
        return rows
    }

    // MARK: Baum-Darstellung

    private func treeBox(_ rows: [ExpenseTreeRow]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { pair in
                rowView(pair.element)
                if pair.offset < rows.count - 1 {
                    Divider()
                }
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
    }

    @ViewBuilder
    private func rowView(_ row: ExpenseTreeRow) -> some View {
        switch row {
        case let .category(c, level, value, hasContent, isOpen):
            categoryRow(c, level: level, value: value, hasContent: hasContent, isOpen: isOpen)
        case let .recurring(r, projected, income, indent, catName):
            recurringRow(r, projected: projected, income: income, indent: indent, catName: catName)
        case let .transaction(tx, indent):
            transactionRow(tx, indent: indent)
        case let .frequency(f, net, isOpen):
            frequencyRow(f, net: net, isOpen: isOpen)
        case let .uncategorized(value):
            uncategorizedRow(value)
        }
    }

    private func disclosureIcon(_ visible: Bool, open: Bool) -> some View {
        Image(systemName: open ? "chevron.down" : "chevron.right")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .frame(width: 18)
            .opacity(visible ? 1 : 0)
    }

    private func categoryRow(_ c: Category, level: Int, value: Double, hasContent: Bool, isOpen: Bool) -> some View {
        HStack(spacing: 8) {
            disclosureIcon(hasContent, open: isOpen)
            Text(c.name)
                .font(level == 0 ? .subheadline.weight(.semibold) : .subheadline)
            Spacer(minLength: 8)
            Text(expenseTreeSigned(value))
                .font(.subheadline.weight(level == 0 ? .bold : .regular))
                .monospacedDigit()
                .foregroundStyle(value >= 0 ? Color.income : Color.expense)
        }
        .padding(.vertical, 7)
        .padding(.trailing, 12)
        .padding(.leading, 12 + CGFloat(level) * 18)
        .background(level == 0 ? Color(.systemGray6) : Color(.systemBackground))
        .contentShape(Rectangle())
        .onTapGesture { if hasContent { toggleCat(c.id) } }
        .contextMenu {
            if mode == .tree {
                Button {
                    openCatDrilldown(c)
                } label: {
                    Label("Umsätze anzeigen", systemImage: "list.bullet")
                }
            }
        }
    }

    private func recurringRow(_ r: RecurringPayment, projected: Double, income: Bool, indent: Int, catName: String?) -> some View {
        HStack(spacing: 8) {
            Text(r.description)
                .foregroundStyle(income ? Color.income : Color.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: 8)
            if let catName {
                Text(catName).font(.caption2).foregroundStyle(.secondary)
            }
            Text(r.frequency.shortLabel).font(.caption2).foregroundStyle(.secondary)
            Text((income ? "+" : "") + fmt(projected))
                .fontWeight(.medium)
                .monospacedDigit()
                .foregroundStyle(income ? Color.income : Color.primary)
        }
        .font(.caption)
        .padding(.vertical, 5)
        .padding(.trailing, 12)
        .padding(.leading, 12 + CGFloat(indent) * 18)
    }

    private func transactionRow(_ tx: BankTransaction, indent: Int) -> some View {
        HStack(spacing: 8) {
            Text(fmtDate(tx.date))
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(.secondary)
            Text(tx.recipient.isEmpty ? "–" : tx.recipient)
                .lineLimit(1)
                .frame(maxWidth: 140, alignment: .leading)
            Text(tx.description)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(fmt(tx.amount))
                .fontWeight(.medium)
                .monospacedDigit()
                .foregroundStyle(tx.amount < 0 ? Color.expense : Color.income)
        }
        .font(.caption)
        .padding(.vertical, 5)
        .padding(.trailing, 12)
        .padding(.leading, 12 + CGFloat(indent) * 18)
    }

    private func frequencyRow(_ f: Frequency, net: Double, isOpen: Bool) -> some View {
        HStack(spacing: 8) {
            disclosureIcon(true, open: isOpen)
            Text(f.label).font(.subheadline.weight(.semibold))
            Spacer(minLength: 8)
            Text(expenseTreeSigned(net))
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(net >= 0 ? Color.income : Color.expense)
        }
        .padding(.vertical, 7)
        .padding(.horizontal, 12)
        .background(Color(.systemGray6))
        .contentShape(Rectangle())
        .onTapGesture { toggleFreq(f) }
    }

    private func uncategorizedRow(_ value: Double) -> some View {
        HStack {
            Text("Ohne Kategorie")
            Spacer()
            Text(expenseTreeSigned(value))
                .monospacedDigit()
                .foregroundStyle(value >= 0 ? Color.income : Color.expense)
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .padding(.vertical, 7)
        .padding(.trailing, 12)
        .padding(.leading, 38)
    }

    // MARK: Pivot-Tabelle

    private func pivotRows(_ m: ExpenseTreeTxModel) -> [ExpenseTreePivotRow] {
        let top = m.roots.filter { m.hasData($0.id) }
        let income = top.filter { $0.type == .income }.sorted(by: expenseTreeNameLess)
        let other = top.filter { $0.type != .income }.sorted(by: expenseTreeNameLess)
        var rows: [ExpenseTreePivotRow] = []
        if !income.isEmpty {
            rows.append(.header("Einnahmen"))
            for c in income { rows += pivotCatRows(m, c, level: 0) }
        }
        if !other.isEmpty {
            rows.append(.header("Ausgaben"))
            for c in other { rows += pivotCatRows(m, c, level: 0) }
        }
        for name in m.orphanNames {
            let vals = m.periods.map { m.cells[.orphan(name)]?[$0] ?? 0 }
            let total = vals.reduce(0, +)
            if total != 0 { rows.append(.orphan(name, vals: vals, total: total)) }
        }
        let uncatVals = m.periods.map { m.cells[.uncat]?[$0] ?? 0 }
        let uncatTotal = uncatVals.reduce(0, +)
        if uncatTotal != 0 { rows.append(.uncategorized(vals: uncatVals, total: uncatTotal)) }
        return rows
    }

    private func pivotCatRows(_ m: ExpenseTreeTxModel, _ cat: Category, level: Int) -> [ExpenseTreePivotRow] {
        let kids = m.kids(cat.id).filter { m.hasData($0.id) }
        let isOpen = pivotExpanded.contains(cat.id)
        let vals = m.periods.map { m.value(cat.id, $0) }
        let total = vals.reduce(0, +)
        var rows: [ExpenseTreePivotRow] = [.category(cat, level: level, hasChildren: !kids.isEmpty,
                                                     isOpen: isOpen, vals: vals, total: total)]
        if isOpen && level < 64 {
            for child in kids.sorted(by: expenseTreeNameLess) {
                rows += pivotCatRows(m, child, level: level + 1)
            }
        }
        return rows
    }

    private func pivotTable(_ m: ExpenseTreeTxModel) -> some View {
        let rows = pivotRows(m)
        return HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                pivotNameCell("Kategorie", bold: true, background: Color(.systemGray6))
                ForEach(Array(rows.enumerated()), id: \.offset) { pair in
                    pivotNameView(pair.element)
                }
                pivotNameCell("Gesamt", bold: true, background: Color(.systemGray6))
            }
            .frame(width: ExpenseTreeLayout.nameWidth)
            Rectangle().fill(Color.borderGray).frame(width: 1)
            ScrollView(.horizontal, showsIndicators: true) {
                VStack(spacing: 0) {
                    pivotHeaderValues(m.periods)
                    ForEach(Array(rows.enumerated()), id: \.offset) { pair in
                        pivotValuesView(pair.element, periods: m.periods)
                    }
                    pivotFooterValues(m)
                }
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
    }

    private var bottomBorder: some View {
        Rectangle().fill(Color.borderGray).frame(height: 1)
    }

    private func pivotNameCell(_ text: String, bold: Bool, background: Color) -> some View {
        Text(text)
            .font(.caption.weight(bold ? .bold : .regular))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: ExpenseTreeLayout.rowHeight)
            .background(background)
            .overlay(alignment: .bottom) { bottomBorder }
    }

    @ViewBuilder
    private func pivotNameView(_ row: ExpenseTreePivotRow) -> some View {
        switch row {
        case .header(let h):
            let hc: Color = h == "Einnahmen" ? .income : .expense
            Text(h.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(hc)
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: ExpenseTreeLayout.rowHeight)
                .background(hc.opacity(0.06))
                .overlay(alignment: .bottom) { bottomBorder }
        case let .category(cat, level, hasChildren, isOpen, _, _):
            HStack(spacing: 4) {
                Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 14)
                    .opacity(hasChildren ? 1 : 0)
                Text(cat.name)
                    .font(.caption.weight(level == 0 ? .semibold : .regular))
                    .lineLimit(1)
            }
            .padding(.leading, 8 + CGFloat(level) * 16)
            .padding(.trailing, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: ExpenseTreeLayout.rowHeight)
            .background(level == 0 ? Color(.systemGray6) : Color(.systemBackground))
            .overlay(alignment: .bottom) { bottomBorder }
            .contentShape(Rectangle())
            .onTapGesture {
                if hasChildren {
                    if pivotExpanded.contains(cat.id) { pivotExpanded.remove(cat.id) } else { pivotExpanded.insert(cat.id) }
                }
            }
        case let .orphan(name, _, _):
            Text("⚠ \(name)")
                .font(.caption.italic())
                .foregroundStyle(Color(hex: 0x92400e))
                .lineLimit(1)
                .padding(.leading, 22)
                .padding(.trailing, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: ExpenseTreeLayout.rowHeight)
                .background(Color(hex: 0xfffbeb))
                .overlay(alignment: .bottom) { bottomBorder }
                .help("Kategorie existiert nicht mehr – bitte neu zuordnen")
        case .uncategorized:
            Text("ohne Kategorie")
                .font(.caption.italic())
                .foregroundStyle(.secondary)
                .padding(.leading, 22)
                .frame(maxWidth: .infinity, alignment: .leading)
                .frame(height: ExpenseTreeLayout.rowHeight)
                .overlay(alignment: .bottom) { bottomBorder }
        }
    }

    private func pivotHeaderValues(_ periods: [String]) -> some View {
        HStack(spacing: 0) {
            ForEach(periods, id: \.self) { p in
                Text(ExpenseTreePivot.label(p, pivotGroupBy))
                    .font(.caption.weight(.bold))
                    .padding(.horizontal, 8)
                    .frame(width: ExpenseTreeLayout.valueWidth, height: ExpenseTreeLayout.rowHeight, alignment: .trailing)
            }
            Text("Gesamt")
                .font(.caption.weight(.bold))
                .padding(.horizontal, 8)
                .frame(width: ExpenseTreeLayout.totalWidth, height: ExpenseTreeLayout.rowHeight, alignment: .trailing)
                .overlay(alignment: .leading) { Rectangle().fill(Color.borderGray).frame(width: 2) }
        }
        .background(Color(.systemGray6))
        .overlay(alignment: .bottom) { bottomBorder }
    }

    /// Einzelne Wertzelle; Tippen öffnet den Drilldown (nur bei Wert ≠ 0).
    private func pivotCell(_ v: Double, width: CGFloat, bold: Bool = false, color: Color? = nil,
                           zeroText: String = "–", totalColumn: Bool = false,
                           action: (() -> Void)? = nil) -> some View {
        let text = v != 0 ? fmt(v) : zeroText
        let col: Color = v != 0 ? (color ?? expenseTreeColor(v)) : Color.secondary.opacity(0.4)
        return Text(text)
            .font(.caption.weight(bold ? .bold : .regular))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundStyle(col)
            .padding(.horizontal, 8)
            .frame(width: width, height: ExpenseTreeLayout.rowHeight, alignment: .trailing)
            .overlay(alignment: .leading) {
                if totalColumn { Rectangle().fill(Color.borderGray).frame(width: 2) }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if v != 0, let action { action() }
            }
    }

    @ViewBuilder
    private func pivotValuesView(_ row: ExpenseTreePivotRow, periods: [String]) -> some View {
        switch row {
        case .header(let h):
            let hc: Color = h == "Einnahmen" ? .income : .expense
            HStack(spacing: 0) {
                Color.clear.frame(width: CGFloat(periods.count) * ExpenseTreeLayout.valueWidth + ExpenseTreeLayout.totalWidth,
                                  height: ExpenseTreeLayout.rowHeight)
            }
            .background(hc.opacity(0.06))
            .overlay(alignment: .bottom) { bottomBorder }
        case let .category(cat, level, _, _, vals, total):
            HStack(spacing: 0) {
                ForEach(Array(vals.enumerated()), id: \.offset) { pair in
                    pivotCell(pair.element, width: ExpenseTreeLayout.valueWidth) {
                        openDrilldown(cat, periods[pair.offset])
                    }
                }
                pivotCell(total, width: ExpenseTreeLayout.totalWidth, bold: true, zeroText: "", totalColumn: true) {
                    openCatDrilldown(cat)
                }
            }
            .background(level == 0 ? Color(.systemGray6) : Color(.systemBackground))
            .overlay(alignment: .bottom) { bottomBorder }
        case let .orphan(name, vals, total):
            HStack(spacing: 0) {
                ForEach(Array(vals.enumerated()), id: \.offset) { pair in
                    pivotCell(pair.element, width: ExpenseTreeLayout.valueWidth) {
                        openOrphanDrilldown(name, periods[pair.offset])
                    }
                }
                pivotCell(total, width: ExpenseTreeLayout.totalWidth, bold: true, color: Color(hex: 0x92400e),
                          zeroText: "", totalColumn: true) {
                    openOrphanCatDrilldown(name)
                }
            }
            .background(Color(hex: 0xfffbeb))
            .overlay(alignment: .bottom) { bottomBorder }
        case let .uncategorized(vals, total):
            HStack(spacing: 0) {
                ForEach(Array(vals.enumerated()), id: \.offset) { pair in
                    pivotCell(pair.element, width: ExpenseTreeLayout.valueWidth) {
                        openUncatDrilldown(periods[pair.offset])
                    }
                }
                pivotCell(total, width: ExpenseTreeLayout.totalWidth, bold: true, totalColumn: true)
            }
            .overlay(alignment: .bottom) { bottomBorder }
        }
    }

    private func pivotFooterValues(_ m: ExpenseTreeTxModel) -> some View {
        let vals = m.periods.map { m.grandByPeriod[$0] ?? 0 }
        let grand = vals.reduce(0, +)
        return HStack(spacing: 0) {
            ForEach(Array(vals.enumerated()), id: \.offset) { pair in
                pivotCell(pair.element, width: ExpenseTreeLayout.valueWidth, bold: true, zeroText: "")
            }
            pivotCell(grand, width: ExpenseTreeLayout.totalWidth, bold: true, zeroText: "", totalColumn: true)
        }
        .background(Color(.systemGray6))
        .overlay(alignment: .top) { Rectangle().fill(Color.borderGray).frame(height: 2) }
        .overlay(alignment: .bottom) { bottomBorder }
    }

    // MARK: Drilldown

    private func descendantNames(_ id: EntityID) -> Set<String> {
        let ids = store.categoryDescendantIDs(id)
        return Set(store.categories.filter { ids.contains($0.id) }.map(\.name))
    }

    private func categoryExists(named name: String) -> Bool {
        store.categories.contains { $0.name == name }
    }

    private func presentDrilldown(_ title: String, _ subset: [BankTransaction]) {
        drilldown = ExpenseTreeDrilldown(title: title, txIds: Set(subset.map(\.id)))
    }

    private func openDrilldown(_ cat: Category, _ periodKey: String) {
        let names = descendantNames(cat.id)
        let r = ExpenseTreePivot.dateRange(periodKey, pivotGroupBy)
        let subset = typedTxs.filter { $0.date >= r.from && $0.date <= r.to && names.contains($0.category) }
        presentDrilldown("\(cat.name) – \(ExpenseTreePivot.label(periodKey, pivotGroupBy))", subset)
    }

    private func openCatDrilldown(_ cat: Category) {
        let names = descendantNames(cat.id)
        presentDrilldown(cat.name, typedTxs.filter { names.contains($0.category) })
    }

    private func openUncatDrilldown(_ periodKey: String) {
        let r = ExpenseTreePivot.dateRange(periodKey, pivotGroupBy)
        let subset = typedTxs.filter { $0.date >= r.from && $0.date <= r.to && $0.category.isEmpty }
        presentDrilldown("Ohne Kategorie – \(ExpenseTreePivot.label(periodKey, pivotGroupBy))", subset)
    }

    private func openOrphanDrilldown(_ name: String, _ periodKey: String) {
        let r = ExpenseTreePivot.dateRange(periodKey, pivotGroupBy)
        let exists = categoryExists(named: name)
        let subset = typedTxs.filter { $0.date >= r.from && $0.date <= r.to && $0.category == name && !exists }
        presentDrilldown("⚠ \(name) – \(ExpenseTreePivot.label(periodKey, pivotGroupBy))", subset)
    }

    private func openOrphanCatDrilldown(_ name: String) {
        let exists = categoryExists(named: name)
        let subset = typedTxs.filter { $0.category == name && !exists }
        presentDrilldown("⚠ \(name) (Kategorie nicht mehr vorhanden)", subset)
    }

    // MARK: Kleinteile

    private func filterLabel(_ text: String) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .fixedSize()
    }

    private func emptyText(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
    }
}
