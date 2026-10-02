import SwiftUI

/// Hierarchische Kategorieauswahl (Ersatz für `CategorySelect.jsx`).
///
/// Zwei Varianten, je nachdem worauf die Daten verweisen:
/// - `CategoryPicker(selection: $categoryId)` – speichert die Kategorie-ID (Daueraufträge, Abos, Versicherungen)
/// - `CategoryNamePicker(selection: $categoryName)` – speichert den Namen (Bankumsätze)
struct CategoryPicker: View {
    @EnvironmentObject private var store: DataStore
    @Binding var selection: EntityID?
    var placeholder: String = "– Kategorie wählen –"
    /// Auch Oberkategorien (mit Unterkategorien) auswählbar
    var selectParents: Bool = false
    /// Nur Kategorien dieses Typs anzeigen
    var typeFilter: CategoryType? = nil
    /// Diese Kategorie (inkl. Unterkategorien) ausblenden – z. B. beim Bearbeiten der Oberkategorie
    var excluding: EntityID? = nil

    @State private var showSheet = false

    init(selection: Binding<EntityID?>, placeholder: String = "– Kategorie wählen –",
         selectParents: Bool = false, typeFilter: CategoryType? = nil, excluding: EntityID? = nil) {
        self._selection = selection
        self.placeholder = placeholder
        self.selectParents = selectParents
        self.typeFilter = typeFilter
        self.excluding = excluding
    }

    var body: some View {
        Button {
            showSheet = true
        } label: {
            HStack(spacing: 6) {
                Text(label ?? placeholder)
                    .foregroundStyle(label == nil ? .secondary : .primary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSheet) {
            CategoryTreeSheet(
                title: placeholder,
                selectedID: selection,
                selectParents: selectParents,
                typeFilter: typeFilter,
                excluding: excluding,
                placeholder: placeholder
            ) { picked in
                selection = picked?.id
                showSheet = false
            }
            .environmentObject(store)
        }
    }

    private var label: String? {
        guard let c = store.category(selection) else { return nil }
        return store.categoryLabel(c)
    }
}

/// Variante, die den Kategorienamen speichert (`transactions.category`).
struct CategoryNamePicker: View {
    @EnvironmentObject private var store: DataStore
    @Binding var selection: String
    var placeholder: String = "– keine –"
    var selectParents: Bool = false
    var typeFilter: CategoryType? = nil

    @State private var showSheet = false

    init(selection: Binding<String>, placeholder: String = "– keine –",
         selectParents: Bool = false, typeFilter: CategoryType? = nil) {
        self._selection = selection
        self.placeholder = placeholder
        self.selectParents = selectParents
        self.typeFilter = typeFilter
    }

    var body: some View {
        Button {
            showSheet = true
        } label: {
            HStack(spacing: 6) {
                Text(label ?? placeholder)
                    .foregroundStyle(label == nil ? .secondary : .primary)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showSheet) {
            CategoryTreeSheet(
                title: placeholder,
                selectedID: store.category(named: selection)?.id,
                selectParents: selectParents,
                typeFilter: typeFilter,
                excluding: nil,
                placeholder: placeholder
            ) { picked in
                selection = picked?.name ?? ""
                showSheet = false
            }
            .environmentObject(store)
        }
    }

    private var label: String? {
        guard !selection.isEmpty else { return nil }
        guard let c = store.category(named: selection) else { return selection }
        return store.categoryLabel(c)
    }
}

/// Auswahlblatt mit aufklappbarem Kategoriebaum und Suche.
struct CategoryTreeSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTheme) private var theme

    let title: String
    let selectedID: EntityID?
    let selectParents: Bool
    let typeFilter: CategoryType?
    let excluding: EntityID?
    let placeholder: String
    let onPick: (Category?) -> Void

    @State private var expanded: Set<EntityID> = []
    @State private var search = ""

    init(title: String, selectedID: EntityID?, selectParents: Bool, typeFilter: CategoryType?,
         excluding: EntityID?, placeholder: String, onPick: @escaping (Category?) -> Void) {
        self.title = title
        self.selectedID = selectedID
        self.selectParents = selectParents
        self.typeFilter = typeFilter
        self.excluding = excluding
        self.placeholder = placeholder
        self.onPick = onPick
    }

    private var available: [Category] {
        var list = store.categories
        if let typeFilter { list = list.filter { $0.type == typeFilter } }
        if let excluding {
            let hidden = store.categoryDescendantIDs(excluding)
            list = list.filter { !hidden.contains($0.id) }
        }
        return list
    }

    var body: some View {
        NavigationStack {
            List {
                Button {
                    onPick(nil)
                } label: {
                    HStack {
                        Text(placeholder).foregroundStyle(.secondary)
                        Spacer()
                        if selectedID == nil { Image(systemName: "checkmark").foregroundStyle(theme.primary) }
                    }
                }

                if search.isEmpty {
                    ForEach(rows(parent: nil, depth: 0), id: \.category.id) { row in
                        rowView(row)
                    }
                } else {
                    let q = search.lowercased()
                    ForEach(available.filter { $0.name.lowercased().contains(q) }
                        .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }) { c in
                        Button { onPick(c) } label: {
                            HStack {
                                Text(store.categoryLabel(c)).foregroundStyle(.primary)
                                Spacer()
                                if c.id == selectedID { Image(systemName: "checkmark").foregroundStyle(theme.primary) }
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .searchable(text: $search, prompt: "Kategorie suchen")
            .navigationTitle("Kategorie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button(expanded.isEmpty ? "Alle aufklappen" : "Alle zuklappen") {
                        if expanded.isEmpty {
                            expanded = Set(available.filter { c in available.contains { $0.parent == c.id } }.map(\.id))
                        } else {
                            expanded = []
                        }
                    }
                }
            }
            .onAppear(perform: expandToSelection)
        }
        .presentationDetents([.medium, .large])
    }

    private struct Row {
        let category: Category
        let depth: Int
        let hasChildren: Bool
    }

    private func rows(parent: EntityID?, depth: Int) -> [Row] {
        available
            .filter { c in
                if c.parent == parent { return true }
                // Verwaiste Kategorien (Oberkategorie ausgeblendet/gelöscht) auf oberster Ebene zeigen
                guard parent == nil, let p = c.parent else { return false }
                return !available.contains { $0.id == p }
            }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
            .flatMap { c -> [Row] in
                let hasKids = available.contains { $0.parent == c.id }
                var result = [Row(category: c, depth: depth, hasChildren: hasKids)]
                if hasKids && expanded.contains(c.id) {
                    result += rows(parent: c.id, depth: depth + 1)
                }
                return result
            }
    }

    @ViewBuilder
    private func rowView(_ row: Row) -> some View {
        let c = row.category
        let isSelected = c.id == selectedID
        HStack(spacing: 6) {
            if row.hasChildren {
                Button {
                    toggle(c.id)
                } label: {
                    Image(systemName: expanded.contains(c.id) ? "chevron.down" : "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 22, height: 22)
                }
                .buttonStyle(.borderless)
            } else {
                Color.clear.frame(width: 22, height: 22)
            }
            Text(c.name)
                .fontWeight(row.depth == 0 ? .semibold : .regular)
            Spacer()
            if isSelected { Image(systemName: "checkmark").foregroundStyle(theme.primary) }
        }
        .padding(.leading, CGFloat(row.depth) * 18)
        .contentShape(Rectangle())
        .onTapGesture {
            if row.hasChildren && !selectParents { toggle(c.id) } else { onPick(c) }
        }
        .listRowBackground(isSelected ? theme.primary.opacity(0.12) : Color.clear)
    }

    private func toggle(_ id: EntityID) {
        if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
    }

    private func expandToSelection() {
        var current = store.category(selectedID)?.parent
        while let p = current {
            expanded.insert(p)
            current = store.category(p)?.parent
        }
    }
}
