import SwiftUI

// Port von `src/components/Subscriptions.jsx`.

// MARK: - Sortierung

private enum SubscriptionsSortKey: String, CaseIterable, Identifiable {
    case name, cost, frequency
    var id: String { rawValue }
    var label: String {
        switch self {
        case .name: return "Name"
        case .cost: return "Kosten"
        case .frequency: return "Frequenz"
        }
    }
}

// MARK: - Formularzustand

private struct SubscriptionsDraft: Identifiable {
    let id = UUID()
    /// nil = neues Abonnement
    var editId: EntityID?
    var name: String = ""
    var cost: Double? = nil
    var frequency: Frequency = .monthly
    var cancel: String = ""
    var cancelDate: ISODate = ""
    var aktiv: Bool = true
    var gekuendigt: Bool = false
    var categoryId: EntityID? = nil
    var type: CategoryType = .expense

    init() {}

    init(editing s: SubscriptionItem) {
        editId = s.id
        name = s.name
        cost = s.cost
        frequency = s.frequency
        cancel = s.cancel
        cancelDate = s.cancelDate
        aktiv = s.aktiv
        gekuendigt = s.gekuendigt
        categoryId = s.categoryId
        type = s.type
    }

    var isEditing: Bool { editId != nil }
    var isValid: Bool { !name.isEmpty && cost != nil }
}

// MARK: - Hauptansicht

struct SubscriptionsView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var draft: SubscriptionsDraft?
    @State private var pendingDelete: SubscriptionItem?
    @State private var sortBy: SubscriptionsSortKey = .name
    @State private var sortAscending = true

    var body: some View {
        content
            .navigationTitle("Abonnements")
            .toolbar { toolbarContent }
            .sheet(item: $draft) { d in
                SubscriptionsFormSheet(draft: d) { saved in
                    save(saved)
                }
                .environmentObject(store)
                .environment(\.appTheme, theme)
                .tint(theme.primary)
            }
            .confirmDelete(item: $pendingDelete, title: { "Abonnement „\($0.name)“ löschen?" }) { sub in
                remove(sub)
            }
    }

    @ViewBuilder
    private var content: some View {
        if store.subscriptions.isEmpty {
            EmptyStateView(title: "Noch keine Abonnements angelegt", systemImage: "iphone")
                .moduleBackground()
        } else {
            List {
                Section {
                    ForEach(sortedSubs) { s in
                        SubscriptionsRow(sub: s,
                                         categoryLabel: categoryLabel(s.categoryId),
                                         onToggle: { toggleAktiv(s) })
                            .contentShape(Rectangle())
                            .onTapGesture { draft = SubscriptionsDraft(editing: s) }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) { pendingDelete = s } label: {
                                    Label("Löschen", systemImage: "trash")
                                }
                                Button { draft = SubscriptionsDraft(editing: s) } label: {
                                    Label("Bearbeiten", systemImage: "pencil")
                                }
                                .tint(.gray)
                            }
                            .swipeActions(edge: .leading) {
                                Button { toggleAktiv(s) } label: {
                                    Label(s.aktiv ? "Deaktivieren" : "Aktivieren",
                                          systemImage: s.aktiv ? "pause.circle" : "play.circle")
                                }
                                .tint(theme.primary)
                            }
                            .contextMenu {
                                Button { draft = SubscriptionsDraft(editing: s) } label: {
                                    Label("Bearbeiten", systemImage: "pencil")
                                }
                                Button { toggleAktiv(s) } label: {
                                    Label(s.aktiv ? "Deaktivieren" : "Aktivieren",
                                          systemImage: s.aktiv ? "pause.circle" : "play.circle")
                                }
                                Divider()
                                Button(role: .destructive) { pendingDelete = s } label: {
                                    Label("Löschen", systemImage: "trash")
                                }
                            }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .moduleBackground()
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        if !store.subscriptions.isEmpty {
            ToolbarItem(placement: .secondaryAction) {
                Menu {
                    Picker("Sortieren", selection: $sortBy) {
                        ForEach(SubscriptionsSortKey.allCases) { k in
                            Text(k.label).tag(k)
                        }
                    }
                    Divider()
                    Button {
                        sortAscending.toggle()
                    } label: {
                        Label(sortAscending ? "Aufsteigend" : "Absteigend",
                              systemImage: sortAscending ? "arrow.up" : "arrow.down")
                    }
                } label: {
                    Label("Sortieren", systemImage: "arrow.up.arrow.down")
                }
            }
        }
        ToolbarItem(placement: .primaryAction) {
            Button {
                draft = SubscriptionsDraft()
            } label: {
                Label("Neu", systemImage: "plus")
            }
        }
    }

    // MARK: Abgeleitete Daten

    /// Stabile Sortierung wie `Array.prototype.sort` in der Web-App.
    private var sortedSubs: [SubscriptionItem] {
        let indexed = Array(store.subscriptions.enumerated())
        let key = sortBy
        let asc = sortAscending
        let sorted = indexed.sorted { a, b in
            let cmp = Self.compare(a.element, b.element, by: key)
            if cmp != 0 { return asc ? cmp < 0 : cmp > 0 }
            return a.offset < b.offset
        }
        return sorted.map { $0.element }
    }

    private static func compare(_ a: SubscriptionItem, _ b: SubscriptionItem, by key: SubscriptionsSortKey) -> Int {
        switch key {
        case .name:
            let va = a.name.lowercased(), vb = b.name.lowercased()
            return va < vb ? -1 : (va > vb ? 1 : 0)
        case .cost:
            return a.cost < b.cost ? -1 : (a.cost > b.cost ? 1 : 0)
        case .frequency:
            let va = a.frequency.sortOrder, vb = b.frequency.sortOrder
            return va < vb ? -1 : (va > vb ? 1 : 0)
        }
    }

    /// "Oberkategorie → Kategorie" (nil, wenn keine/unbekannte Kategorie)
    private func categoryLabel(_ id: EntityID?) -> String? {
        guard let cat = store.category(id) else { return nil }
        if let parent = store.category(cat.parent) { return "\(parent.name) → \(cat.name)" }
        return cat.name
    }

    // MARK: Aktionen

    private func save(_ d: SubscriptionsDraft) {
        let sub = SubscriptionItem(id: d.editId ?? EntityID.new(),
                                   name: d.name,
                                   cost: d.cost ?? 0,
                                   frequency: d.frequency,
                                   cancel: d.cancel,
                                   cancelDate: d.cancelDate,
                                   aktiv: d.aktiv,
                                   gekuendigt: d.gekuendigt,
                                   categoryId: d.categoryId,
                                   type: d.type)
        if let editId = d.editId {
            store.subscriptions = store.subscriptions.map { $0.id == editId ? sub : $0 }
        } else {
            store.subscriptions.append(sub)
        }
        store.syncRecurring(for: sub)
    }

    private func toggleAktiv(_ sub: SubscriptionItem) {
        var updated = sub
        updated.aktiv.toggle()
        store.subscriptions = store.subscriptions.map { $0.id == sub.id ? updated : $0 }
        store.syncRecurring(for: updated)
    }

    private func remove(_ sub: SubscriptionItem) {
        store.recurringPayments.removeAll { $0.subscriptionId == sub.id }
        store.subscriptions.removeAll { $0.id == sub.id }
    }
}

// MARK: - Zeile

private struct SubscriptionsRow: View {
    let sub: SubscriptionItem
    let categoryLabel: String?
    let onToggle: () -> Void
    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(sub.name)
                        .fontWeight(.medium)
                        .lineLimit(1)
                    if sub.gekuendigt {
                        Badge(text: "Gekündigt", color: Color(hex: 0xb45309), background: Color(hex: 0xfef3c7))
                    }
                }
                Text(detailLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(fmt(sub.cost))
                .fontWeight(.semibold)
                .monospacedDigit()
            Button(action: onToggle) {
                Text(sub.aktiv ? "Aktiv" : "Inaktiv")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(sub.aktiv ? theme.primary : Color.borderGray)
                    .foregroundStyle(sub.aktiv ? Color.white : Color(hex: 0x374151))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(sub.aktiv ? "Deaktivieren" : "Aktivieren")
        }
        .padding(.vertical, 2)
        .opacity(sub.aktiv ? 1 : 0.55)
    }

    private var detailLine: String {
        var parts: [String] = [sub.frequency.label]
        if let categoryLabel { parts.append(categoryLabel) }
        if !sub.cancel.isEmpty { parts.append("Frist: \(sub.cancel)") }
        if !sub.cancelDate.isEmpty { parts.append("Kündigung bis: \(fmtDate(sub.cancelDate))") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Formular

private struct SubscriptionsFormSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    @State var draft: SubscriptionsDraft
    let onSave: (SubscriptionsDraft) -> Void

    init(draft: SubscriptionsDraft, onSave: @escaping (SubscriptionsDraft) -> Void) {
        self._draft = State(initialValue: draft)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name *", text: $draft.name, prompt: Text("z. B. Netflix"))
                    LabeledContent("Kosten (€) *") {
                        DecimalField("Kosten (€)", value: $draft.cost, prompt: "9,99", maxDecimals: 2)
                    }
                    Picker("Frequenz", selection: $draft.frequency) {
                        ForEach(Frequency.allCases) { f in
                            Text(f.label).tag(f)
                        }
                    }
                }
                Section {
                    LabeledContent("Kategorie") {
                        CategoryPicker(selection: $draft.categoryId, placeholder: "– keine –")
                    }
                    Picker("Typ", selection: $draft.type) {
                        ForEach(CategoryType.allCases) { t in
                            Text(t.label).tag(t)
                        }
                    }
                }
                Section("Kündigung") {
                    cancelField
                    OptionalISODatePicker("Kündigungsdatum", date: $draft.cancelDate)
                }
                Section {
                    Toggle("Aktiv (als Dauerauftrag übernehmen)", isOn: $draft.aktiv)
                    Toggle("Gekündigt", isOn: $draft.gekuendigt)
                }
            }
            .navigationTitle(draft.isEditing ? "Abonnement bearbeiten" : "Abonnement hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(draft.isEditing ? "Änderungen speichern" : "Abonnement hinzufügen") {
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

    private var cancelField: some View {
        HStack {
            TextField("Kündigungsfrist", text: $draft.cancel, prompt: Text("z. B. 1 Monat"))
            Menu {
                ForEach(cancellationPeriodSuggestions, id: \.self) { s in
                    Button(s) { draft.cancel = s }
                }
            } label: {
                Image(systemName: "chevron.down.circle")
            }
            .accessibilityLabel("Vorschläge")
        }
    }
}
