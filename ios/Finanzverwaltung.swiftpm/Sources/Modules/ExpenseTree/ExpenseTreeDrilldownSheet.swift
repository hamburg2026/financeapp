import SwiftUI

// Port von `PivotDrilldownModal` aus `ExpenseTree.jsx`:
// Umsätze einer Pivot-Zelle, gruppiert nach Kategorie, mit Mehrfachauswahl + Sammelzuordnung,
// Bearbeiten (inkl. Saldo-Korrektur der Konten) und Löschen.

/// Geöffneter Drilldown: Titel + IDs der enthaltenen Umsätze.
struct ExpenseTreeDrilldown: Identifiable {
    let id = UUID()
    let title: String
    let txIds: Set<EntityID>
}

struct ExpenseTreeDrilldownSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTheme) private var theme

    let title: String
    @State private var txIds: Set<EntityID>
    @State private var expandedGroups: Set<String> = []
    @State private var selectedIds: Set<EntityID> = []
    @State private var bulkCat = ""
    @State private var editing: BankTransaction?
    @State private var pendingDelete: BankTransaction?

    init(drilldown: ExpenseTreeDrilldown) {
        self.title = drilldown.title
        self._txIds = State(initialValue: drilldown.txIds)
    }

    private struct TxGroup: Identifiable {
        let key: String
        let name: String?
        var txs: [BankTransaction]
        var total: Double
        var id: String { key }
    }

    private var subset: [BankTransaction] {
        store.transactions.filter { txIds.contains($0.id) }
    }

    private var groups: [TxGroup] {
        var map: [String: TxGroup] = [:]
        var order: [String] = []
        for t in subset {
            let k = t.category
            if map[k] == nil {
                map[k] = TxGroup(key: k, name: k.isEmpty ? nil : k, txs: [], total: 0)
                order.append(k)
            }
            map[k]?.txs.append(t)
            map[k]?.total += t.amount
        }
        var result = order.compactMap { map[$0] }
        for i in result.indices {
            result[i].txs.sort { a, b in
                let r = a.recipient.localizedCompare(b.recipient)
                if r != .orderedSame { return r == .orderedAscending }
                return a.date < b.date
            }
        }
        return result.sorted { abs($0.total) > abs($1.total) }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    summaryHeader
                }
                ForEach(groups) { g in
                    Section {
                        groupHeader(g)
                        if expandedGroups.contains(g.key) {
                            ForEach(g.txs) { t in
                                txRow(t)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if !selectedIds.isEmpty {
                    bulkBar
                }
            }
            .sheet(item: $editing) { t in
                ExpenseTreeTxEditor(tx: t) { updated in
                    saveEdit(updated)
                }
                .environmentObject(store)
                .environment(\.appTheme, theme)
            }
            .confirmDelete(item: $pendingDelete, title: { _ in "Umsatz löschen?" }) { t in
                deleteTx(t)
            }
        }
    }

    // MARK: Kopf & Gruppen

    private var summaryHeader: some View {
        let list = subset
        let totalSum = list.reduce(0.0) { $0 + $1.amount }
        return HStack {
            Text("\(list.count) Umsätze")
                .foregroundStyle(.secondary)
            Spacer()
            Text((totalSum > 0 ? "+" : "") + fmt(totalSum))
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(amountColor(totalSum))
        }
        .font(.subheadline)
    }

    private func amountColor(_ v: Double) -> Color {
        if v > 0 { return .income }
        if v < 0 { return .expense }
        return .mutedText
    }

    private func groupHeader(_ g: TxGroup) -> some View {
        let ids = g.txs.map(\.id)
        let allSelected = ids.allSatisfy { selectedIds.contains($0) }
        let someSelected = ids.contains { selectedIds.contains($0) }
        let isOpen = expandedGroups.contains(g.key)
        let icon = allSelected ? "checkmark.square.fill" : (someSelected ? "minus.square.fill" : "square")
        return HStack(spacing: 10) {
            Button {
                toggleGroupSelect(ids, allSelected: allSelected)
            } label: {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(theme.primary)
            }
            .buttonStyle(.borderless)
            Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 14)
            Text(g.name ?? "Ohne Kategorie")
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            Spacer(minLength: 6)
            Text("\(g.txs.count) \(g.txs.count == 1 ? "Eintrag" : "Einträge")")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text((g.total > 0 ? "+" : "") + fmt(g.total))
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(amountColor(g.total))
        }
        .contentShape(Rectangle())
        .onTapGesture { toggleGroup(g.key) }
        .listRowBackground(Color(.systemGray6))
    }

    private func txRow(_ t: BankTransaction) -> some View {
        let isSelected = selectedIds.contains(t.id)
        return HStack(spacing: 10) {
            Button {
                toggleSelect(t.id)
            } label: {
                Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                    .font(.title3)
                    .foregroundStyle(isSelected ? theme.primary : Color.secondary)
            }
            .buttonStyle(.borderless)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(fmtDate(t.date))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                    Text(t.recipient.isEmpty ? "–" : t.recipient)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .font(.caption)
                Text(t.description)
                    .font(.caption)
                    .lineLimit(2)
            }
            Spacer(minLength: 6)
            Text(fmt(t.amount))
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(amountColor(t.amount))
        }
        .contentShape(Rectangle())
        .onTapGesture { editing = t }
        .listRowBackground(isSelected ? theme.primary.opacity(0.08) : Color(.systemBackground))
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                pendingDelete = t
            } label: {
                Label("Löschen", systemImage: "trash")
            }
            Button {
                editing = t
            } label: {
                Label("Bearbeiten", systemImage: "pencil")
            }
            .tint(.gray)
        }
        .contextMenu {
            Button {
                editing = t
            } label: {
                Label("Bearbeiten", systemImage: "pencil")
            }
            Button(role: .destructive) {
                pendingDelete = t
            } label: {
                Label("Löschen", systemImage: "trash")
            }
        }
    }

    private var bulkBar: some View {
        HStack(spacing: 12) {
            Text("\(selectedIds.count) ausgewählt")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.primary)
            CategoryNamePicker(selection: $bulkCat, placeholder: "Kategorie wählen…")
                .frame(maxWidth: 260)
            Button("Zuordnen") { bulkAssign() }
                .buttonStyle(.borderedProminent)
                .disabled(bulkCat.isEmpty)
            Button("Auswahl aufheben") { selectedIds = [] }
                .buttonStyle(.borderless)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(.bar)
    }

    // MARK: Aktionen

    private func toggleGroup(_ key: String) {
        if expandedGroups.contains(key) { expandedGroups.remove(key) } else { expandedGroups.insert(key) }
    }

    private func toggleSelect(_ id: EntityID) {
        if selectedIds.contains(id) { selectedIds.remove(id) } else { selectedIds.insert(id) }
    }

    private func toggleGroupSelect(_ ids: [EntityID], allSelected: Bool) {
        if allSelected {
            for id in ids { selectedIds.remove(id) }
        } else {
            for id in ids { selectedIds.insert(id) }
        }
    }

    private func bulkAssign() {
        guard !bulkCat.isEmpty, !selectedIds.isEmpty else { return }
        var all = store.transactions
        for i in all.indices where txIds.contains(all[i].id) && selectedIds.contains(all[i].id) {
            all[i].category = bulkCat
        }
        store.transactions = all
        selectedIds = []
        bulkCat = ""
    }

    /// saveEdit: alten Betrag vom alten Konto abziehen, neuen Betrag dem (ggf. neuen) Konto gutschreiben.
    private func saveEdit(_ updated: BankTransaction) {
        guard txIds.contains(updated.id),
              let old = store.transactions.first(where: { $0.id == updated.id }) else { return }
        var accs = store.bankAccounts
        for i in accs.indices where accs[i].id == old.accountId {
            accs[i].balance -= old.amount
        }
        for i in accs.indices where accs[i].id == updated.accountId {
            accs[i].balance += updated.amount
        }
        store.bankAccounts = accs

        var all = store.transactions
        for i in all.indices where all[i].id == updated.id {
            all[i].accountId = updated.accountId
            all[i].date = updated.date
            all[i].description = updated.description
            all[i].recipient = updated.recipient
            all[i].amount = updated.amount
            all[i].category = updated.category
        }
        store.transactions = all
    }

    /// deleteTx: Betrag vom Kontosaldo zurückbuchen und Umsatz entfernen.
    private func deleteTx(_ t: BankTransaction) {
        guard let tx = store.transactions.first(where: { $0.id == t.id && txIds.contains($0.id) }) else { return }
        var accs = store.bankAccounts
        for i in accs.indices where accs[i].id == tx.accountId {
            accs[i].balance -= tx.amount
        }
        store.bankAccounts = accs
        store.transactions.removeAll { $0.id == tx.id }
        txIds.remove(tx.id)
        selectedIds.remove(tx.id)
    }
}

// MARK: - Umsatz bearbeiten

struct ExpenseTreeTxEditor: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    let tx: BankTransaction
    let onSave: (BankTransaction) -> Void

    @State private var accountId: EntityID
    @State private var date: ISODate
    @State private var descriptionText: String
    @State private var recipient: String
    @State private var amount: Double
    @State private var sign: Double
    @State private var category: String

    init(tx: BankTransaction, onSave: @escaping (BankTransaction) -> Void) {
        self.tx = tx
        self.onSave = onSave
        self._accountId = State(initialValue: tx.accountId)
        self._date = State(initialValue: tx.date)
        self._descriptionText = State(initialValue: tx.description)
        self._recipient = State(initialValue: tx.recipient)
        self._amount = State(initialValue: abs(tx.amount))
        self._sign = State(initialValue: tx.amount >= 0 ? 1 : -1)
        self._category = State(initialValue: tx.category)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ISODatePicker("Datum", date: $date)
                    TextField("Empfänger", text: $recipient)
                    TextField("Buchungstext", text: $descriptionText, axis: .vertical)
                    LabeledContent("Betrag (€)") {
                        HStack(spacing: 8) {
                            SignToggle(sign: $sign)
                            AmountField("Betrag", value: $amount)
                        }
                    }
                    LabeledContent("Kategorie") {
                        CategoryNamePicker(selection: $category, placeholder: "– keine –")
                    }
                    if store.bankAccounts.count > 1 {
                        Picker("Konto", selection: $accountId) {
                            ForEach(store.bankAccounts) { a in
                                Text(a.name).tag(a.id)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Umsatz bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") { save() }
                }
            }
        }
    }

    private func save() {
        var t = tx
        t.accountId = accountId
        t.date = date
        t.description = descriptionText
        t.recipient = recipient
        t.amount = sign * abs(amount)
        t.category = category
        onSave(t)
        dismiss()
    }
}
