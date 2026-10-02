import SwiftUI

// Port von `src/components/Categories.jsx`.

/// Kategorienverwaltung: aufklappbarer Baum mit Typ-Etiketten, Unterkategorien anlegen,
/// bearbeiten (inkl. Oberkategorie) und löschen (inkl. aller Unterkategorien).
struct CategoriesView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var expanded: Set<EntityID> = []
    @State private var editor: CategoriesEditorTarget? = nil
    @State private var pendingDelete: Category? = nil

    var body: some View {
        content
            .navigationTitle("Kategorien")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = CategoriesEditorTarget(editingID: nil, name: "", parent: nil, type: .expense)
                    } label: {
                        Label("Neu", systemImage: "plus")
                    }
                }
            }
            .sheet(item: $editor) { target in
                CategoriesEditorSheet(target: target) { result in
                    save(result)
                }
                .environmentObject(store)
                .environment(\.appTheme, theme)
                .tint(theme.primary)
            }
            .confirmDelete(item: $pendingDelete, title: { c in deleteTitle(for: c) }) { c in
                remove(c)
            }
            .moduleBackground()
    }

    // MARK: - Inhalt

    @ViewBuilder
    private var content: some View {
        if topLevel.isEmpty {
            EmptyStateView(title: "Noch keine Kategorien angelegt", systemImage: "tag")
        } else {
            List {
                Section {
                    HStack(spacing: 8) {
                        Button("Alle aufklappen", action: expandAll)
                            .buttonStyle(.bordered)
                            .tint(theme.primary)
                        Button("Alle zuklappen") { expanded = [] }
                            .buttonStyle(.bordered)
                            .tint(.secondary)
                        Spacer()
                    }
                    .font(.footnote)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }
                Section {
                    ForEach(rows) { row in
                        CategoriesTreeRow(
                            row: row,
                            isOpen: expanded.contains(row.category.id),
                            onToggle: { toggle(row.category.id) },
                            onAddChild: { openAddChild(row.category) },
                            onEdit: { openEdit(row.category) },
                            onDelete: { pendingDelete = row.category }
                        )
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    // MARK: - Baum

    /// Kategorien der obersten Ebene (inkl. verwaister Kategorien, deren Oberkategorie fehlt).
    private var topLevel: [Category] {
        store.categories.filter { c in
            guard let p = c.parent else { return true }
            return !store.categories.contains { $0.id == p }
        }
    }

    private var rows: [CategoriesTreeRowData] {
        flatten(sortedByName(topLevel), level: 0)
    }

    private func sortedByName(_ list: [Category]) -> [Category] {
        list.sorted { $0.name.compare($1.name, locale: Locale(identifier: "de_DE")) == .orderedAscending }
    }

    private func children(of id: EntityID) -> [Category] {
        sortedByName(store.categories.filter { $0.parent == id })
    }

    private func flatten(_ list: [Category], level: Int) -> [CategoriesTreeRowData] {
        var result: [CategoriesTreeRowData] = []
        for (idx, c) in list.enumerated() {
            let kids = children(of: c.id)
            result.append(CategoriesTreeRowData(category: c, level: level,
                                                isLast: idx == list.count - 1,
                                                hasChildren: !kids.isEmpty))
            if !kids.isEmpty && expanded.contains(c.id) {
                result.append(contentsOf: flatten(kids, level: level + 1))
            }
        }
        return result
    }

    private func toggle(_ id: EntityID) {
        if expanded.contains(id) { expanded.remove(id) } else { expanded.insert(id) }
    }

    private func expandAll() {
        let cats = store.categories
        expanded = Set(cats.filter { c in cats.contains { $0.parent == c.id } }.map(\.id))
    }

    // MARK: - Aktionen

    private func openAddChild(_ c: Category) {
        editor = CategoriesEditorTarget(editingID: nil, name: "", parent: c.id, type: c.type)
    }

    private func openEdit(_ c: Category) {
        editor = CategoriesEditorTarget(editingID: c.id, name: c.name, parent: c.parent, type: c.type)
    }

    private func save(_ t: CategoriesEditorTarget) {
        if let id = t.editingID {
            if let idx = store.categories.firstIndex(where: { $0.id == id }) {
                store.categories[idx].name = t.name
                store.categories[idx].parent = t.parent
                store.categories[idx].type = t.type
            }
        } else {
            store.categories.append(Category(name: t.name, parent: t.parent, type: t.type))
            // Oberkategorie aufklappen, damit die neue Unterkategorie sichtbar ist
            if let p = t.parent { expanded.insert(p) }
        }
        editor = nil
    }

    private func deleteTitle(for c: Category) -> String {
        let hasChildren = store.categories.contains { $0.parent == c.id }
        return hasChildren
            ? "Kategorie „\(c.name)“ und alle Unterkategorien löschen?"
            : "Kategorie „\(c.name)“ löschen?"
    }

    private func remove(_ c: Category) {
        let toRemove = store.categoryDescendantIDs(c.id)
        store.categories.removeAll { toRemove.contains($0.id) }
        expanded.subtract(toRemove)
    }
}

// MARK: - Zeile

private struct CategoriesTreeRowData: Identifiable {
    let category: Category
    let level: Int
    let isLast: Bool
    let hasChildren: Bool
    var id: EntityID { category.id }
}

private struct CategoriesTreeRow: View {
    let row: CategoriesTreeRowData
    let isOpen: Bool
    let onToggle: () -> Void
    let onAddChild: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void

    private var typeColor: Color { row.category.type == .income ? Color.income : Color.expense }

    var body: some View {
        HStack(spacing: 6) {
            if row.level > 0 {
                Text(row.isLast ? "└─" : "├─")
                    .font(.footnote)
                    .foregroundStyle(Color(hex: 0xd1d5db))
            }
            toggleButton
            Text(row.category.name)
                .font(row.level == 0 ? .body.weight(.semibold) : .subheadline)
                .lineLimit(2)
            Spacer(minLength: 6)
            Badge(text: row.category.type.label, color: typeColor)
            actionButtons
        }
        .padding(.leading, CGFloat(row.level) * 20)
        .contentShape(Rectangle())
        .onTapGesture { if row.hasChildren { onToggle() } }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive, action: onDelete) { Label("Löschen", systemImage: "trash") }
            Button(action: onEdit) { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
        }
        .swipeActions(edge: .leading) {
            Button(action: onAddChild) { Label("Unterkategorie", systemImage: "plus") }.tint(Color.income)
        }
        .contextMenu {
            Button(action: onAddChild) { Label("Unterkategorie hinzufügen", systemImage: "plus") }
            Button(action: onEdit) { Label("Bearbeiten", systemImage: "pencil") }
            Button(role: .destructive, action: onDelete) { Label("Löschen", systemImage: "trash") }
        }
    }

    @ViewBuilder
    private var toggleButton: some View {
        if row.hasChildren {
            Button(action: onToggle) {
                Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
            }
            .buttonStyle(.borderless)
        } else {
            Color.clear.frame(width: 22, height: 22)
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 4) {
            Button(action: onAddChild) {
                Image(systemName: "plus")
                    .font(.caption.weight(.bold))
                    .frame(width: 26, height: 24)
                    .background(Color(hex: 0xdcfce7))
                    .foregroundStyle(Color.income)
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .accessibilityLabel("Unterkategorie hinzufügen")
            Button(action: onEdit) {
                Image(systemName: "pencil")
                    .font(.caption.weight(.bold))
                    .frame(width: 26, height: 24)
                    .background(Color(hex: 0xe5e7eb))
                    .foregroundStyle(Color(hex: 0x374151))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .accessibilityLabel("Bearbeiten")
            Button(action: onDelete) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .frame(width: 26, height: 24)
                    .background(Color(hex: 0xfee2e2))
                    .foregroundStyle(Color.expense)
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .accessibilityLabel("Löschen")
        }
        .buttonStyle(.borderless)
    }
}

// MARK: - Formular

private struct CategoriesEditorTarget: Identifiable {
    let id = UUID()
    var editingID: EntityID?
    var name: String
    var parent: EntityID?
    var type: CategoryType
}

private struct CategoriesEditorSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    @State private var target: CategoriesEditorTarget
    let onSave: (CategoriesEditorTarget) -> Void

    init(target: CategoriesEditorTarget, onSave: @escaping (CategoriesEditorTarget) -> Void) {
        self._target = State(initialValue: target)
        self.onSave = onSave
    }

    private var isEditing: Bool { target.editingID != nil }

    private var title: String {
        if let id = target.editingID {
            return "Kategorie bearbeiten: \(store.category(id)?.name ?? "")"
        }
        return "Neue Kategorie"
    }

    private var canSave: Bool { !target.name.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name *") {
                    TextField("Kategoriename", text: $target.name)
                }
                Section("Oberkategorie") {
                    CategoryPicker(selection: $target.parent,
                                   placeholder: "– Hauptkategorie (keine Oberkategorie) –",
                                   selectParents: true,
                                   excluding: target.editingID)
                }
                Section("Typ") {
                    Picker("Typ", selection: $target.type) {
                        Text("Ausgabe").tag(CategoryType.expense)
                        Text("Einnahme").tag(CategoryType.income)
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Änderungen speichern" : "Kategorie hinzufügen") {
                        onSave(target)
                    }
                    .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
