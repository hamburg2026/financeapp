import SwiftUI

// Port von `src/components/RecurringPayments.jsx`.

// MARK: - Hilfstypen

private enum RecurringPaymentsTypeFilter: String, CaseIterable, Hashable {
    case all, expense, income
    var label: String {
        switch self {
        case .all: return "Alle"
        case .expense: return "Ausgaben"
        case .income: return "Einnahmen"
        }
    }
}

private enum RecurringPaymentsGroupBy: String, CaseIterable, Identifiable {
    case frequency, category, none
    var id: String { rawValue }
    var label: String {
        switch self {
        case .frequency: return "Frequenz"
        case .category: return "Kategorie"
        case .none: return "Keine"
        }
    }
}

private func recurringPaymentsFreqFilterLabel(_ f: Frequency?) -> String {
    guard let f else { return "Alle" }
    switch f {
    case .monthly: return "Monatl."
    case .quarterly: return "Quartl."
    case .halfyearly: return "Halbj."
    case .yearly: return "Jährl."
    }
}

/// Eine Zeile der (abgeflachten) Liste: Gruppenkopf oder Dauerauftrag.
private enum RecurringPaymentsLine: Identifiable {
    case header(key: String, title: String, depth: Int, total: Double, isOpen: Bool, prominent: Bool)
    case item(RecurringPayment, indent: Int)

    var id: String {
        switch self {
        case let .header(key, _, _, _, _, _): return "h_\(key)"
        case let .item(r, _): return "r_\(r.id.key)"
        }
    }
}

private struct RecurringPaymentsNode {
    let cat: Category
    let items: [RecurringPayment]
    let children: [RecurringPaymentsNode]

    var total: Double {
        items.reduce(0) { $0 + $1.amount } + children.reduce(0) { $0 + $1.total }
    }
}

private struct RecurringPaymentsDraft: Identifiable {
    let id = UUID()
    /// nil = neuer Dauerauftrag
    var editId: EntityID?
    var description: String = ""
    var amount: Double? = nil
    var frequency: Frequency = .monthly
    var categoryId: EntityID? = nil
    var type: CategoryType = .expense

    init() {}

    init(editing r: RecurringPayment) {
        editId = r.id
        description = r.description
        amount = r.amount
        frequency = r.frequency
        categoryId = r.categoryId
        type = r.type ?? .expense
    }

    var isEditing: Bool { editId != nil }
    var isValid: Bool { !description.isEmpty && (amount ?? 0) >= 0.01 }
}

// MARK: - Hauptansicht

struct RecurringPaymentsView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var draft: RecurringPaymentsDraft?
    @State private var pendingDelete: RecurringPayment?

    @State private var filterType: RecurringPaymentsTypeFilter = .all
    @State private var filterCategoryId: EntityID? = nil
    @State private var filterFrequency: Frequency? = nil
    @State private var filterSearch = ""

    @State private var groupBy: RecurringPaymentsGroupBy = .category
    @State private var expandedGroups: Set<String> = Set(Frequency.allCases.map { $0.rawValue })

    var body: some View {
        List {
            filterSection
            listSection
        }
        .listStyle(.insetGrouped)
        .moduleBackground()
        .searchable(text: $filterSearch, prompt: "Beschreibung suchen…")
        .navigationTitle("Daueraufträge")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    draft = RecurringPaymentsDraft()
                } label: {
                    Label("Neu", systemImage: "plus")
                }
            }
        }
        .sheet(item: $draft) { d in
            RecurringPaymentsFormSheet(draft: d) { saved in
                save(saved)
            }
            .environmentObject(store)
            .environment(\.appTheme, theme)
            .tint(theme.primary)
        }
        .confirmDelete(item: $pendingDelete, title: { "Dauerauftrag „\($0.description)“ löschen?" }) { r in
            store.recurringPayments.removeAll { $0.id == r.id }
        }
    }

    // MARK: Filter

    private var filterSection: some View {
        Section {
            LabeledContent("Typ") {
                PillPicker(options: RecurringPaymentsTypeFilter.allCases, selection: $filterType) { $0.label }
            }
            LabeledContent("Frequenz") {
                PillPicker(options: frequencyOptions, selection: $filterFrequency) { recurringPaymentsFreqFilterLabel($0) }
            }
            LabeledContent("Kategorie") {
                CategoryPicker(selection: $filterCategoryId, placeholder: "– Alle Kategorien –", selectParents: true)
            }
            LabeledContent("Gruppieren") {
                Picker("Gruppieren", selection: groupByBinding) {
                    ForEach(RecurringPaymentsGroupBy.allCases) { g in
                        Text(g.label).tag(g)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 320)
            }
            if hasActiveFilter {
                HStack {
                    Text("\(filteredRecurrings.count) von \(store.recurringPayments.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Filter zurücksetzen", action: resetFilters)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }
        }
    }

    private var frequencyOptions: [Frequency?] {
        var opts: [Frequency?] = [nil]
        for f in Frequency.allCases { opts.append(f) }
        return opts
    }

    private var groupByBinding: Binding<RecurringPaymentsGroupBy> {
        Binding(
            get: { groupBy },
            set: { v in
                groupBy = v
                if v == .category {
                    var keys = Set(store.categories.map { "cat_\($0.id.key)" })
                    keys.insert("cat_none")
                    expandedGroups = keys
                }
                if v == .frequency {
                    expandedGroups = Set(Frequency.allCases.map { $0.rawValue })
                }
            }
        )
    }

    private var hasActiveFilter: Bool {
        filterType != .all || filterCategoryId != nil || filterFrequency != nil || !filterSearch.isEmpty
    }

    private func resetFilters() {
        filterType = .all
        filterCategoryId = nil
        filterFrequency = nil
        filterSearch = ""
    }

    // MARK: Liste

    @ViewBuilder
    private var listSection: some View {
        let filtered = filteredRecurrings
        if filtered.isEmpty {
            Section {
                Text(store.recurringPayments.isEmpty
                     ? "Noch keine Daueraufträge angelegt."
                     : "Keine Einträge entsprechen den Filterkriterien.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 24)
            }
        } else {
            Section {
                ForEach(lines(for: filtered)) { line in
                    lineView(line)
                }
            }
        }
    }

    @ViewBuilder
    private func lineView(_ line: RecurringPaymentsLine) -> some View {
        switch line {
        case let .header(key, title, depth, total, isOpen, prominent):
            RecurringPaymentsHeaderRow(title: title, depth: depth, total: total, isOpen: isOpen, prominent: prominent)
                .contentShape(Rectangle())
                .onTapGesture { toggleGroup(key) }
                .listRowBackground(prominent ? theme.background.opacity(0.8) : Color(.secondarySystemGroupedBackground))
        case let .item(r, indent):
            itemRow(r, indent: indent)
        }
    }

    @ViewBuilder
    private func itemRow(_ r: RecurringPayment, indent: Int) -> some View {
        let row = RecurringPaymentsItemRow(
            payment: r,
            indent: indent,
            categoryText: groupBy == .category ? nil : categoryLabel(r.categoryId),
            showFrequency: groupBy != .frequency,
            longGeneratedText: groupBy == .category
        )
        .listRowBackground(rowBackground(r))

        if r.isGenerated {
            row
        } else {
            row
                .contentShape(Rectangle())
                .onTapGesture { draft = RecurringPaymentsDraft(editing: r) }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) { pendingDelete = r } label: {
                        Label("Löschen", systemImage: "trash")
                    }
                    Button { draft = RecurringPaymentsDraft(editing: r) } label: {
                        Label("Bearbeiten", systemImage: "pencil")
                    }
                    .tint(.gray)
                }
                .contextMenu {
                    Button { draft = RecurringPaymentsDraft(editing: r) } label: {
                        Label("Bearbeiten", systemImage: "pencil")
                    }
                    Button(role: .destructive) { pendingDelete = r } label: {
                        Label("Löschen", systemImage: "trash")
                    }
                }
        }
    }

    private func rowBackground(_ r: RecurringPayment) -> Color {
        if r.insuranceId != nil { return Color(hex: 0xf0fdf4) }
        if r.subscriptionId != nil { return Color(hex: 0xf5f3ff) }
        return Color(.secondarySystemGroupedBackground)
    }

    private func toggleGroup(_ key: String) {
        if expandedGroups.contains(key) { expandedGroups.remove(key) } else { expandedGroups.insert(key) }
    }

    // MARK: Abgeleitete Daten

    private func isIncome(_ r: RecurringPayment) -> Bool {
        store.effectiveType(of: r) == .income
    }

    private var filteredRecurrings: [RecurringPayment] {
        let descendants: Set<EntityID>? = filterCategoryId.map { store.categoryDescendantIDs($0) }
        let search = filterSearch.lowercased()
        return store.recurringPayments.filter { r in
            if filterType == .expense && isIncome(r) { return false }
            if filterType == .income && !isIncome(r) { return false }
            if let descendants {
                guard let cid = r.categoryId, descendants.contains(cid) else { return false }
            }
            if let ff = filterFrequency, r.frequency != ff { return false }
            if !search.isEmpty && !r.description.lowercased().contains(search) { return false }
            return true
        }
    }

    /// "Oberkategorie → Kategorie" bzw. "–"
    private func categoryLabel(_ id: EntityID?) -> String {
        guard let cat = store.category(id) else { return "–" }
        if let parent = store.category(cat.parent) { return "\(parent.name) → \(cat.name)" }
        return cat.name
    }

    private func buildCategoryTree(parent: EntityID?, from list: [RecurringPayment], depth: Int = 0) -> [RecurringPaymentsNode] {
        guard depth < 32 else { return [] }
        return store.categories.filter { $0.parent == parent }.compactMap { (cat: Category) -> RecurringPaymentsNode? in
            let items = list.filter { $0.categoryId == cat.id }
            let children = buildCategoryTree(parent: cat.id, from: list, depth: depth + 1)
            if items.isEmpty && children.isEmpty { return nil }
            return RecurringPaymentsNode(cat: cat, items: items, children: children)
        }
    }

    private func nodeLines(_ node: RecurringPaymentsNode, depth: Int) -> [RecurringPaymentsLine] {
        let key = "cat_\(node.cat.id.key)"
        let open = expandedGroups.contains(key)
        var result: [RecurringPaymentsLine] = [
            .header(key: key, title: node.cat.name, depth: depth, total: node.total, isOpen: open, prominent: depth == 0)
        ]
        if open {
            for child in node.children {
                result.append(contentsOf: nodeLines(child, depth: depth + 1))
            }
            for r in node.items {
                result.append(.item(r, indent: depth + 1))
            }
        }
        return result
    }

    private func lines(for list: [RecurringPayment]) -> [RecurringPaymentsLine] {
        var result: [RecurringPaymentsLine] = []
        switch groupBy {
        case .category:
            for node in buildCategoryTree(parent: nil, from: list) {
                result.append(contentsOf: nodeLines(node, depth: 0))
            }
            let uncategorized = list.filter { $0.categoryId == nil }
            if !uncategorized.isEmpty {
                let open = expandedGroups.contains("cat_none")
                let total = uncategorized.reduce(0) { $0 + $1.amount }
                result.append(.header(key: "cat_none", title: "Ohne Kategorie", depth: 0, total: total, isOpen: open, prominent: true))
                if open {
                    for r in uncategorized { result.append(.item(r, indent: 1)) }
                }
            }
        case .frequency:
            for f in Frequency.allCases {
                let items = list.filter { $0.frequency == f }
                guard !items.isEmpty else { continue }
                let open = expandedGroups.contains(f.rawValue)
                let total = items.reduce(0) { $0 + $1.amount }
                result.append(.header(key: f.rawValue, title: f.label, depth: 0, total: total, isOpen: open, prominent: false))
                if open {
                    for r in items { result.append(.item(r, indent: 1)) }
                }
            }
        case .none:
            for r in list { result.append(.item(r, indent: 0)) }
        }
        return result
    }

    // MARK: Aktionen

    private func save(_ d: RecurringPaymentsDraft) {
        let amount = d.amount ?? 0
        if let editId = d.editId {
            store.recurringPayments = store.recurringPayments.map { r in
                guard r.id == editId else { return r }
                var u = r
                u.description = d.description
                u.amount = amount
                u.frequency = d.frequency
                u.categoryId = d.categoryId
                u.type = d.type
                return u
            }
        } else {
            store.recurringPayments.append(RecurringPayment(description: d.description, amount: amount,
                                                            frequency: d.frequency, categoryId: d.categoryId,
                                                            type: d.type))
        }
    }
}

// MARK: - Zeilen

private struct RecurringPaymentsHeaderRow: View {
    let title: String
    let depth: Int
    let total: Double
    let isOpen: Bool
    let prominent: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 14)
            titleText
            Spacer(minLength: 8)
            Text(fmt(total))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
        }
        .padding(.leading, CGFloat(depth) * 18)
    }

    @ViewBuilder
    private var titleText: some View {
        if prominent {
            Text(title.uppercased())
                .font(.subheadline.weight(.bold))
                .tracking(0.5)
        } else {
            Text(depth == 0 ? title.uppercased() : title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct RecurringPaymentsItemRow: View {
    let payment: RecurringPayment
    let indent: Int
    let categoryText: String?
    let showFrequency: Bool
    let longGeneratedText: Bool

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                titleLine
                subLine
            }
            Spacer(minLength: 8)
            Text(fmt(payment.amount))
                .fontWeight(.semibold)
                .monospacedDigit()
            if payment.isGenerated {
                Image(systemName: "lock")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.leading, CGFloat(indent) * 18)
    }

    private var titleLine: some View {
        HStack(spacing: 6) {
            Text(payment.description)
                .fontWeight(.medium)
                .lineLimit(1)
            if payment.insuranceId != nil {
                Badge(text: "Versicherung", color: Color(hex: 0x15803d), background: Color(hex: 0xdcfce7))
            }
            if payment.subscriptionId != nil {
                Badge(text: "Abonnement", color: Color(hex: 0x6d28d9), background: Color(hex: 0xede9fe))
            }
        }
    }

    private var subLine: some View {
        HStack(spacing: 6) {
            if let categoryText {
                Text(categoryText)
            }
            if let t = payment.type {
                Text(t == .income ? "+ Einnahme" : "− Ausgabe")
                    .fontWeight(.semibold)
                    .foregroundStyle(t == .income ? Color.income : Color.expense)
            }
            if showFrequency {
                Text(payment.frequency.label).opacity(0.7)
            }
            if payment.isGenerated {
                Text(generatedText).opacity(0.6).lineLimit(1)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private var generatedText: String {
        let isIns = payment.insuranceId != nil
        if longGeneratedText {
            return "– wird von \(isIns ? "Versicherungsvertrag" : "Abonnement") gesteuert"
        }
        return "– von \(isIns ? "Versicherung" : "Abonnement") gesteuert"
    }
}

// MARK: - Formular

private struct RecurringPaymentsFormSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    @State var draft: RecurringPaymentsDraft
    let onSave: (RecurringPaymentsDraft) -> Void

    init(draft: RecurringPaymentsDraft, onSave: @escaping (RecurringPaymentsDraft) -> Void) {
        self._draft = State(initialValue: draft)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Beschreibung *", text: $draft.description, prompt: Text("z. B. Miete"))
                    LabeledContent("Betrag (€) *") {
                        DecimalField("Betrag (€)", value: $draft.amount, prompt: "0,00", maxDecimals: 2)
                    }
                    Picker("Frequenz", selection: $draft.frequency) {
                        ForEach(Frequency.allCases) { f in
                            Text(f.label).tag(f)
                        }
                    }
                }
                Section {
                    LabeledContent("Kategorie") {
                        CategoryPicker(selection: $draft.categoryId)
                    }
                    Picker("Typ", selection: $draft.type) {
                        ForEach(CategoryType.allCases) { t in
                            Text(t.label).tag(t)
                        }
                    }
                }
            }
            .navigationTitle(draft.isEditing ? "Dauerauftrag bearbeiten" : "Neuer Dauerauftrag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(draft.isEditing ? "Änderungen speichern" : "Hinzufügen") {
                        onSave(draft)
                        dismiss()
                    }
                    .disabled(!draft.isValid)
                }
            }
            .onChange(of: draft.categoryId) { _, newValue in
                if let cat = store.category(newValue) { draft.type = cat.type }
            }
        }
    }
}
