import SwiftUI

// Port von `src/components/RealEstate.jsx`.

/// Immobilien: Anschaffungswert, Zeitwert (inkl. Zeitwert-Verlauf) und Gewinn/Verlust.
struct RealEstateView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var editor: RealEstateEditorTarget? = nil
    @State private var pendingDelete: RealEstateProperty? = nil
    @State private var expandedHistory: Set<EntityID> = []

    var body: some View {
        content
            .navigationTitle("Immobilien")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = RealEstateEditorTarget(editingID: nil, name: "", purchase: nil, current: nil, notes: "")
                    } label: {
                        Label("Neu", systemImage: "plus")
                    }
                }
            }
            .sheet(item: $editor) { target in
                RealEstateEditorSheet(target: target) { result in save(result) }
                    .environment(\.appTheme, theme)
                    .tint(theme.primary)
            }
            .confirmDelete(item: $pendingDelete, title: { p in "Immobilie „\(p.name)“ löschen?" }) { p in
                store.realEstate.removeAll { $0.id == p.id }
            }
            .moduleBackground()
    }

    @ViewBuilder
    private var content: some View {
        if store.realEstate.isEmpty {
            EmptyStateView(title: "Noch keine Immobilien angelegt.", systemImage: "house")
        } else {
            List {
                summarySection
                ForEach(store.realEstate) { p in
                    propertySection(p)
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    // MARK: - Summen

    private var totalPurchase: Double { store.realEstate.reduce(0) { $0 + $1.purchase } }
    private var totalCurrent: Double { store.realEstate.reduce(0) { $0 + displayCurrent($1) } }

    private var summarySection: some View {
        let pnl = totalCurrent - totalPurchase
        return Section {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 10)], spacing: 10) {
                StatTile(title: "Anschaffung gesamt", value: fmt(totalPurchase), systemImage: "cart")
                StatTile(title: "Zeitwert gesamt", value: fmt(totalCurrent), color: theme.primary, systemImage: "house")
                StatTile(title: "Gewinn / Verlust", value: fmtSigned(pnl),
                         subtitle: realEstatePctText(pnl, base: totalPurchase),
                         color: Color.signed(pnl), systemImage: "chart.line.uptrend.xyaxis")
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())
        }
    }

    // MARK: - Immobilie

    private func displayCurrent(_ p: RealEstateProperty) -> Double {
        p.currentHistory.realEstateLatestValue(fallback: p.current)
    }

    private func propertySection(_ p: RealEstateProperty) -> some View {
        Section {
            header(p)
            details(p)
            if !p.notes.isEmpty {
                Text(p.notes)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            DisclosureGroup(isExpanded: historyBinding(p.id)) {
                RealEstateHistoryEditor(label: "Zeitwert-Verlauf", history: p.currentHistory) { h in
                    updateHistory(p.id, h)
                }
            } label: {
                Label("Zeitwert-Verlauf", systemImage: "clock.arrow.circlepath")
                    .font(.subheadline)
            }
        }
    }

    private func header(_ p: RealEstateProperty) -> some View {
        HStack(spacing: 8) {
            Text(p.name).font(.headline)
            Spacer()
            Button {
                openEdit(p)
            } label: {
                Image(systemName: "pencil")
            }
            .buttonStyle(.bordered)
            .tint(.gray)
            .accessibilityLabel("Bearbeiten")
            Button {
                pendingDelete = p
            } label: {
                Image(systemName: "xmark")
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Color.expense)
            .accessibilityLabel("Löschen")
        }
        .contextMenu {
            Button { openEdit(p) } label: { Label("Bearbeiten", systemImage: "pencil") }
            Button(role: .destructive) { pendingDelete = p } label: { Label("Löschen", systemImage: "trash") }
        }
    }

    private func details(_ p: RealEstateProperty) -> some View {
        let current = displayCurrent(p)
        let pnl = current - p.purchase
        return ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 24) {
                detailItems(p, current: current, pnl: pnl)
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 8) {
                detailItems(p, current: current, pnl: pnl)
            }
        }
    }

    @ViewBuilder
    private func detailItems(_ p: RealEstateProperty, current: Double, pnl: Double) -> some View {
        RealEstateDetailItem(title: "Anschaffung") {
            Text(fmt(p.purchase)).fontWeight(.semibold).monospacedDigit()
        }
        RealEstateDetailItem(title: "Zeitwert") {
            VStack(alignment: .leading, spacing: 1) {
                Text(fmt(current)).fontWeight(.bold).monospacedDigit()
                if !p.currentHistory.isEmpty {
                    Text("\(p.currentHistory.count) Einträge").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        RealEstateDetailItem(title: "Gewinn / Verlust") {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text((pnl >= 0 ? "+" : "") + fmt(pnl)).fontWeight(.bold).monospacedDigit()
                if let pct = realEstatePctText(pnl, base: p.purchase) {
                    Text("(\(pct))").font(.caption)
                }
            }
            .foregroundStyle(pnl >= 0 ? Color.income : Color.expense)
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

    private func openEdit(_ p: RealEstateProperty) {
        editor = RealEstateEditorTarget(editingID: p.id, name: p.name, purchase: p.purchase,
                                        current: p.current, notes: p.notes)
    }

    private func save(_ t: RealEstateEditorTarget) {
        let purchase = t.purchase ?? 0
        let current = t.current ?? 0
        if let id = t.editingID, let idx = store.realEstate.firstIndex(where: { $0.id == id }) {
            var p = store.realEstate[idx]
            p.name = t.name
            p.purchase = purchase
            p.current = current
            p.notes = t.notes
            store.realEstate[idx] = p
        } else {
            store.realEstate.append(RealEstateProperty(name: t.name, purchase: purchase, current: current,
                                                       notes: t.notes, currentHistory: []))
        }
        editor = nil
    }

    /// Neue Historie übernehmen; `current` = neuester Eintrag (bzw. unverändert, wenn leer).
    private func updateHistory(_ id: EntityID, _ history: [HistoryEntry]) {
        guard let idx = store.realEstate.firstIndex(where: { $0.id == id }) else { return }
        var p = store.realEstate[idx]
        p.currentHistory = history
        if let latest = history.latest { p.current = latest.value }
        store.realEstate[idx] = p
    }
}

/// "+12,3 %" (max. 1 Nachkommastelle), nil wenn Basis ≤ 0.
private func realEstatePctText(_ pnl: Double, base: Double) -> String? {
    guard base > 0 else { return nil }
    let pct = pnl / base * 100
    return (pct >= 0 ? "+" : "") + editString(pct, maxDecimals: 1) + " %"
}

private struct RealEstateDetailItem<Content: View>: View {
    let title: String
    let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption2).foregroundStyle(.secondary)
            content.font(.subheadline)
        }
    }
}

// MARK: - Formular

private struct RealEstateEditorTarget: Identifiable {
    let id = UUID()
    var editingID: EntityID?
    var name: String
    var purchase: Double?
    var current: Double?
    var notes: String
}

private struct RealEstateEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var target: RealEstateEditorTarget
    let onSave: (RealEstateEditorTarget) -> Void

    init(target: RealEstateEditorTarget, onSave: @escaping (RealEstateEditorTarget) -> Void) {
        self._target = State(initialValue: target)
        self.onSave = onSave
    }

    private var isEditing: Bool { target.editingID != nil }

    private var canSave: Bool {
        guard !target.name.trimmingCharacters(in: .whitespaces).isEmpty,
              let purchase = target.purchase, target.current != nil else { return false }
        return purchase >= 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Name / Bezeichnung *") {
                    TextField("z. B. Einfamilienhaus München", text: $target.name)
                }
                Section {
                    LabeledContent("Anschaffungswert (€) *") {
                        DecimalField("Anschaffungswert", value: $target.purchase, prompt: "z. B. 350000", maxDecimals: 2)
                    }
                    LabeledContent("Aktueller Zeitwert (€) *") {
                        DecimalField("Zeitwert", value: $target.current, prompt: "z. B. 420000", maxDecimals: 2)
                    }
                }
                Section("Notizen") {
                    TextField("Adresse, Besonderheiten…", text: $target.notes, axis: .vertical)
                        .lineLimit(2...5)
                }
            }
            .navigationTitle(isEditing ? "Immobilie bearbeiten" : "Neue Immobilie")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Änderungen speichern" : "Immobilie hinzufügen") { onSave(target) }
                        .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
