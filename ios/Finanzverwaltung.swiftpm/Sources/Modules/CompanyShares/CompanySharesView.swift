import SwiftUI

// Port von `src/components/CompanyShares.jsx`.

/// Firmenbeteiligungen: Beteiligungsquote, Wert (inkl. Werthistorie) und Gesamtsumme.
struct CompanySharesView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var editor: CompanySharesEditorTarget?
    @State private var pendingDelete: CompanyShare?
    @State private var expandedHistory: Set<EntityID> = []

    var body: some View {
        content
            .navigationTitle("Firmenbeteiligungen")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = CompanySharesEditorTarget(editingID: nil, company: "", percentage: nil, value: nil, notes: "")
                    } label: {
                        Label("Neu", systemImage: "plus")
                    }
                }
            }
            .sheet(item: $editor) { target in
                CompanySharesEditorSheet(target: target) { result in save(result) }
                    .environment(\.appTheme, theme)
                    .tint(theme.primary)
            }
            // Web-App las hier fälschlich `s.name` – korrekt ist der Firmenname (`company`).
            .confirmDelete(item: $pendingDelete, title: { s in "Firmenbeteiligung „\(s.company)“ löschen?" }) { s in
                store.companyShares.removeAll { $0.id == s.id }
            }
            .moduleBackground()
    }

    @ViewBuilder
    private var content: some View {
        if store.companyShares.isEmpty {
            EmptyStateView(title: "Noch keine Firmenbeteiligungen angelegt.", systemImage: "building.2")
        } else {
            List {
                ForEach(store.companyShares) { s in
                    shareSection(s)
                }
                if store.companyShares.count > 1 {
                    Section {
                        HStack {
                            Text("Gesamt").foregroundStyle(.secondary)
                            Spacer()
                            Text(fmt(total)).fontWeight(.bold).monospacedDigit()
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    private func displayValue(_ s: CompanyShare) -> Double {
        s.valueHistory.realEstateLatestValue(fallback: s.value)
    }

    private var total: Double { store.companyShares.reduce(0) { $0 + displayValue($1) } }

    // MARK: - Beteiligung

    private func shareSection(_ s: CompanyShare) -> some View {
        Section {
            header(s)
            HStack(alignment: .top, spacing: 24) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Wert").font(.caption2).foregroundStyle(.secondary)
                    Text(fmt(displayValue(s))).font(.title3.weight(.bold)).monospacedDigit()
                    if !s.valueHistory.isEmpty {
                        Text("\(s.valueHistory.count) Einträge").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if !s.notes.isEmpty {
                    Text(s.notes)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Spacer(minLength: 0)
            }
            DisclosureGroup(isExpanded: historyBinding(s.id)) {
                RealEstateHistoryEditor(label: "Werthistorie", history: s.valueHistory, nonNegative: true) { h in
                    updateHistory(s.id, h)
                }
            } label: {
                Label("Werthistorie", systemImage: "clock.arrow.circlepath")
                    .font(.subheadline)
            }
        }
    }

    private func header(_ s: CompanyShare) -> some View {
        HStack(spacing: 8) {
            Text(s.company).font(.headline)
            Spacer()
            Badge(text: "\(fmtNum(s.percentage)) %", color: Color(hex: 0x0369a1), background: Color(hex: 0xe0f2fe))
            Button {
                openEdit(s)
            } label: {
                Image(systemName: "pencil")
            }
            .buttonStyle(.bordered)
            .tint(.gray)
            .accessibilityLabel("Bearbeiten")
            Button {
                pendingDelete = s
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Color.expense)
            .accessibilityLabel("Löschen")
        }
        .contextMenu {
            Button { openEdit(s) } label: { Label("Bearbeiten", systemImage: "pencil") }
            Button(role: .destructive) { pendingDelete = s } label: { Label("Löschen", systemImage: "trash") }
        }
    }

    private func historyBinding(_ id: EntityID) -> Binding<Bool> {
        Binding(
            get: { expandedHistory.contains(id) },
            set: { open in
                if open { expandedHistory.insert(id) } else { expandedHistory.remove(id) }
            }
        )
    }

    // MARK: - Aktionen

    private func openEdit(_ s: CompanyShare) {
        editor = CompanySharesEditorTarget(editingID: s.id, company: s.company, percentage: s.percentage,
                                           value: s.value, notes: s.notes)
    }

    private func save(_ t: CompanySharesEditorTarget) {
        let percentage = t.percentage ?? 0
        let value = t.value ?? 0
        if let id = t.editingID, let idx = store.companyShares.firstIndex(where: { $0.id == id }) {
            var s = store.companyShares[idx]
            s.company = t.company
            s.percentage = percentage
            s.value = value
            s.notes = t.notes
            store.companyShares[idx] = s
        } else {
            store.companyShares.append(CompanyShare(company: t.company, percentage: percentage, value: value,
                                                    notes: t.notes, valueHistory: []))
        }
        editor = nil
    }

    /// Neue Historie übernehmen; `value` = neuester Eintrag (bzw. unverändert, wenn leer).
    private func updateHistory(_ id: EntityID, _ history: [HistoryEntry]) {
        guard let idx = store.companyShares.firstIndex(where: { $0.id == id }) else { return }
        var s = store.companyShares[idx]
        s.valueHistory = history
        if let latest = history.latest { s.value = latest.value }
        store.companyShares[idx] = s
    }
}

// MARK: - Formular

private struct CompanySharesEditorTarget: Identifiable {
    let id = UUID()
    var editingID: EntityID?
    var company: String
    var percentage: Double?
    var value: Double?
    var notes: String
}

private struct CompanySharesEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var target: CompanySharesEditorTarget
    let onSave: (CompanySharesEditorTarget) -> Void

    init(target: CompanySharesEditorTarget, onSave: @escaping (CompanySharesEditorTarget) -> Void) {
        self._target = State(initialValue: target)
        self.onSave = onSave
    }

    private var isEditing: Bool { target.editingID != nil }

    private var percentageValid: Bool {
        guard let p = target.percentage else { return false }
        return p >= 0 && p <= 100
    }

    private var canSave: Bool {
        guard !target.company.trimmingCharacters(in: .whitespaces).isEmpty,
              percentageValid, let v = target.value else { return false }
        return v >= 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Firmenname *") {
                        TextField("z. B. Muster GmbH", text: $target.company)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Beteiligung (%)") {
                        DecimalField("Beteiligung", value: $target.percentage, prompt: "z. B. 25", maxDecimals: 2)
                    }
                    LabeledContent("Aktueller Wert (€)") {
                        DecimalField("Wert", value: $target.value, prompt: "z. B. 50000", maxDecimals: 2)
                    }
                } footer: {
                    if target.percentage != nil && !percentageValid {
                        Text("Die Beteiligung muss zwischen 0 und 100 % liegen.").foregroundStyle(Color.expense)
                    }
                }
                Section("Notizen") {
                    TextField("Anmerkungen zur Beteiligung…", text: $target.notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(isEditing ? "Beteiligung bearbeiten" : "Neue Beteiligung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Änderungen speichern" : "Beteiligung hinzufügen") { onSave(target) }
                        .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
