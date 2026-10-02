import SwiftUI

// Port von `TransactionModal` aus src/components/BankAccounts.jsx.
// Umsätze eines Kontos (accountId != nil) oder aller Konten (accountId == nil).

/// Navigationsziel für die Umsatzansicht.
struct BankAccountsTxTarget: Identifiable, Hashable {
    let accountId: EntityID?
    var id: String { accountId?.key ?? "__all" }
}

// MARK: - Hilfstypen

fileprivate enum BankAccountsTxTypeFilter: String, CaseIterable, Identifiable {
    case all, income, expense
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all: return "Alle"
        case .income: return "Einnahmen"
        case .expense: return "Ausgaben"
        }
    }
}

fileprivate enum BankAccountsTxSortCol: String, CaseIterable, Identifiable {
    case date, recipient, description, amount, category
    var id: String { rawValue }

    var label: String {
        switch self {
        case .date: return "Datum"
        case .recipient: return "Empfänger"
        case .description: return "Buchungstext"
        case .amount: return "Betrag"
        case .category: return "Kategorie"
        }
    }

    func comparator(_ order: SortOrder) -> KeyPathComparator<BankTransaction> {
        switch self {
        case .date: return KeyPathComparator(\BankTransaction.date, order: order)
        case .recipient: return KeyPathComparator(\BankTransaction.recipient, order: order)
        case .description: return KeyPathComparator(\BankTransaction.description, order: order)
        case .amount: return KeyPathComparator(\BankTransaction.amount, order: order)
        case .category: return KeyPathComparator(\BankTransaction.category, order: order)
        }
    }

    static func from(_ c: KeyPathComparator<BankTransaction>) -> BankAccountsTxSortCol {
        let kp: PartialKeyPath<BankTransaction> = c.keyPath
        if kp == (\BankTransaction.recipient as PartialKeyPath<BankTransaction>) { return .recipient }
        if kp == (\BankTransaction.description as PartialKeyPath<BankTransaction>) { return .description }
        if kp == (\BankTransaction.amount as PartialKeyPath<BankTransaction>) { return .amount }
        if kp == (\BankTransaction.category as PartialKeyPath<BankTransaction>) { return .category }
        return .date
    }

    /// Sortierschlüssel wie in der Web-App (Texte kleingeschrieben).
    func textKey(_ t: BankTransaction) -> String {
        switch self {
        case .date: return t.date
        case .recipient: return t.recipient.lowercased()
        case .description: return t.description.lowercased()
        case .category: return t.category.lowercased()
        case .amount: return ""
        }
    }
}

fileprivate enum BankAccountsTxEditorMode: Identifiable {
    case add
    case edit(BankTransaction)
    var id: String {
        switch self {
        case .add: return "add"
        case .edit(let t): return "edit-\(t.id.key)"
        }
    }
}

fileprivate struct BankAccountsSecTxDraft: Identifiable {
    let bankTx: BankTransaction
    var secId: EntityID
    var depotId: EntityID
    var txType: DepotTxType
    var date: ISODate
    var qty: String
    var price: String
    var fees: String
    var id: EntityID { bankTx.id }
}

/// JS `toFixed` mit deutschem Dezimalkomma.
fileprivate func bankAccountsFixed(_ v: Double, _ decimals: Int) -> String {
    let n = v.isFinite ? v : 0
    return String(format: "%.\(decimals)f", n).replacingOccurrences(of: ".", with: ",")
}

/// JS `parseFloat(x) || 1`
fileprivate func bankAccountsOrOne(_ v: Double?) -> Double {
    if let v, v != 0, v.isFinite { return v }
    return 1
}

fileprivate let bankAccountsTxLocale = Locale(identifier: "de_DE")

// MARK: - Umsatzansicht

struct BankAccountsTransactionsView: View {
    let accountId: EntityID?

    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme
    @Environment(\.horizontalSizeClass) private var hSize

    @State private var dateDim: DateDimension
    @State private var dateFrom: ISODate
    @State private var dateTo: ISODate
    @State private var filterAcc: EntityID?
    @State private var filterCat: String
    @State private var filterType: BankAccountsTxTypeFilter = .all
    @State private var filterRecipient = ""
    @State private var filterSearch = ""
    @State private var filterAmtMin = ""
    @State private var filterAmtMax = ""

    @State private var sortOrder: [KeyPathComparator<BankTransaction>] =
        [KeyPathComparator(\BankTransaction.date, order: .reverse)]

    @State private var selectedIds: Set<EntityID> = []
    @State private var bulkCat = ""
    @State private var editMode: EditMode = .inactive

    @State private var editor: BankAccountsTxEditorMode?
    @State private var secTxDraft: BankAccountsSecTxDraft?
    @State private var pendingDelete: BankTransaction?
    @State private var showFilters = false
    @State private var showMissingSecAlert = false

    init(accountId: EntityID?, initialDateDim: DateDimension = .thisMonth, initialCategory: String = "") {
        self.accountId = accountId
        let r = initialDateDim.range
        _dateDim = State(initialValue: initialDateDim)
        _dateFrom = State(initialValue: r.from)
        _dateTo = State(initialValue: r.to)
        _filterAcc = State(initialValue: accountId)
        _filterCat = State(initialValue: initialCategory)
    }

    // MARK: Abgeleitete Daten

    private var title: String {
        if let accountId {
            return "Umsätze – \(store.account(accountId)?.name ?? "–")"
        }
        return "Alle Umsätze"
    }

    private var sortCol: BankAccountsTxSortCol {
        guard let first = sortOrder.first else { return .date }
        return BankAccountsTxSortCol.from(first)
    }

    private var sortAsc: Bool { (sortOrder.first?.order ?? .reverse) == .forward }

    private var filtered: [BankTransaction] {
        let minV = parseDecimal(filterAmtMin)
        let maxV = parseDecimal(filterAmtMax)
        let rq = filterRecipient.lowercased()
        let sq = filterSearch.lowercased()
        let list = store.transactions.filter { t in
            if let a = accountId, t.accountId != a { return false }
            if let fa = filterAcc, t.accountId != fa { return false }
            if !dateFrom.isEmpty && t.date < dateFrom { return false }
            if !dateTo.isEmpty && t.date > dateTo { return false }
            if !filterCat.isEmpty && t.category != filterCat { return false }
            if filterType == .income && t.amount <= 0 { return false }
            if filterType == .expense && t.amount >= 0 { return false }
            if !rq.isEmpty && !t.recipient.lowercased().contains(rq) { return false }
            if !sq.isEmpty && !t.description.lowercased().contains(sq) { return false }
            if let m = minV, t.amount < m { return false }
            if let m = maxV, t.amount > m { return false }
            return true
        }
        return sortTransactions(list)
    }

    private func sortTransactions(_ list: [BankTransaction]) -> [BankTransaction] {
        let col = sortCol
        let asc = sortAsc
        if col == .amount {
            return list.sorted { a, b in asc ? a.amount < b.amount : a.amount > b.amount }
        }
        let keyed = list.map { (key: col.textKey($0), tx: $0) }
        return keyed.sorted { a, b in asc ? a.key < b.key : a.key > b.key }.map { $0.tx }
    }

    private var filtersActive: Bool {
        !filterCat.isEmpty || filterType != .all || !filterRecipient.isEmpty || !filterSearch.isEmpty
            || !filterAmtMin.isEmpty || !filterAmtMax.isEmpty || (accountId == nil && filterAcc != nil)
            || dateDim == .custom
    }

    // MARK: Body

    var body: some View {
        let rows = filtered
        VStack(spacing: 0) {
            headerBar(rows)
            Divider()
            if !selectedIds.isEmpty {
                bulkBar
                Divider()
            }
            listContent(rows)
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent(rows) }
        .environment(\.editMode, $editMode)
        .sheet(item: $editor) { mode in
            BankAccountsTxEditor(mode: mode, fixedAccountId: accountId,
                                 defaultAccountId: accountId ?? store.bankAccounts.first?.id)
                .environmentObject(store)
        }
        .sheet(item: $secTxDraft) { draft in
            BankAccountsSecTxSheet(draft: draft)
                .environmentObject(store)
        }
        .confirmDelete(item: $pendingDelete, title: { _ in "Umsatz löschen?" }) { tx in
            deleteTx(tx)
        }
        .alert("Hinweis", isPresented: $showMissingSecAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Bitte zuerst Wertpapiere und Depots in „Wertpapiere & Depots“ anlegen.")
        }
        .background(Color(.systemBackground))
    }

    @ToolbarContentBuilder
    private func toolbarContent(_ rows: [BankTransaction]) -> some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                editor = .add
            } label: {
                Label("Umsatz", systemImage: "plus")
            }
            Button {
                showFilters = true
            } label: {
                Label("Filter", systemImage: filtersActive
                      ? "line.3.horizontal.decrease.circle.fill"
                      : "line.3.horizontal.decrease.circle")
            }
            .popover(isPresented: $showFilters) {
                filterForm
            }
            if hSize != .regular {
                sortMenu
            }
        }
        ToolbarItemGroup(placement: .secondaryAction) {
            Button {
                withAnimation {
                    if editMode == .active {
                        editMode = .inactive
                        selectedIds = []
                    } else {
                        editMode = .active
                    }
                }
            } label: {
                Label(editMode == .active ? "Auswahl beenden" : "Auswählen",
                      systemImage: "checkmark.circle")
            }
            Button {
                toggleSelectAll(rows)
            } label: {
                Label(!rows.isEmpty && selectedIds.count == rows.count ? "Keine auswählen" : "Alle auswählen",
                      systemImage: "checklist")
            }
        }
    }

    private var sortMenu: some View {
        Menu {
            ForEach(BankAccountsTxSortCol.allCases) { col in
                Button {
                    if sortCol == col {
                        sortOrder = [col.comparator(sortAsc ? .reverse : .forward)]
                    } else {
                        sortOrder = [col.comparator(.forward)]
                    }
                } label: {
                    if sortCol == col {
                        Label(col.label, systemImage: sortAsc ? "chevron.up" : "chevron.down")
                    } else {
                        Text(col.label)
                    }
                }
            }
        } label: {
            Label("Sortieren", systemImage: "arrow.up.arrow.down")
        }
    }

    // MARK: Kopfbereich

    private func headerBar(_ rows: [BankTransaction]) -> some View {
        let totalIn = rows.filter { $0.amount > 0 }.reduce(0.0) { $0 + $1.amount }
        let totalOut = rows.filter { $0.amount < 0 }.reduce(0.0) { $0 + $1.amount }
        let saldo = totalIn + totalOut
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("\(rows.count) Einträge").foregroundStyle(.secondary)
                if totalIn > 0 {
                    Text("+" + fmt(totalIn)).foregroundStyle(Color.income)
                }
                if totalOut < 0 {
                    Text(fmt(totalOut)).foregroundStyle(Color.expense)
                }
                (Text("Saldo: ").foregroundColor(.secondary)
                    + Text(fmt(saldo)).bold().foregroundColor(saldo >= 0 ? Color.positiveBlue : Color.negativeRose))
                Spacer(minLength: 0)
            }
            .font(.caption)
            .monospacedDigit()

            PillPicker(options: DateDimension.selectable,
                       selection: Binding(get: { dateDim }, set: { selectDim($0) }),
                       label: { $0.label })

            if dateDim == .custom {
                Text("Zeitraum: \(dateFrom.isEmpty ? "–" : fmtDate(dateFrom)) bis \(dateTo.isEmpty ? "–" : fmtDate(dateTo))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(theme.background.opacity(0.6))
    }

    private var bulkBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                Text("\(selectedIds.count) ausgewählt")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.primary)
                CategoryNamePicker(selection: $bulkCat, placeholder: "Kategorie wählen…")
                    .frame(width: 210)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                Button("Zuordnen") { bulkAssign() }
                    .buttonStyle(.borderedProminent)
                    .tint(theme.primary)
                    .disabled(bulkCat.isEmpty)
                Button("+/− Vorzeichen wechseln") { bulkFlipSign() }
                    .buttonStyle(.bordered)
                    .tint(Color(hex: 0x92400e))
                Button("Auswahl aufheben") { selectedIds = [] }
                    .buttonStyle(.borderless)
                    .foregroundStyle(.secondary)
            }
            .controlSize(.small)
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
        }
        .background(theme.primary.opacity(0.08))
    }

    // MARK: Filter

    private var fromBinding: Binding<ISODate> {
        Binding(get: { dateFrom }, set: { dateFrom = $0; dateDim = .custom })
    }

    private var toBinding: Binding<ISODate> {
        Binding(get: { dateTo }, set: { dateTo = $0; dateDim = .custom })
    }

    private var filterForm: some View {
        NavigationStack {
            Form {
                if accountId == nil {
                    Picker("Konto", selection: $filterAcc) {
                        Text("Alle Konten").tag(nil as EntityID?)
                        ForEach(store.bankAccounts) { a in
                            Text(a.name).tag(a.id as EntityID?)
                        }
                    }
                }
                Section("Zeitraum") {
                    OptionalISODatePicker("Von", date: fromBinding)
                    OptionalISODatePicker("Bis", date: toBinding)
                }
                Section {
                    LabeledContent("Kategorie") {
                        CategoryNamePicker(selection: $filterCat, placeholder: "Alle")
                    }
                    Picker("Typ", selection: $filterType) {
                        ForEach(BankAccountsTxTypeFilter.allCases) { f in
                            Text(f.label).tag(f)
                        }
                    }
                    LabeledContent("Empfänger") {
                        TextField("Empfänger", text: $filterRecipient, prompt: Text("…"))
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Suche") {
                        TextField("Suche", text: $filterSearch, prompt: Text("Buchungstext…"))
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Betrag von") {
                        TextField("Min", text: $filterAmtMin, prompt: Text("Min"))
                            .keyboardType(.numbersAndPunctuation)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Betrag bis") {
                        TextField("Max", text: $filterAmtMax, prompt: Text("Max"))
                            .keyboardType(.numbersAndPunctuation)
                            .multilineTextAlignment(.trailing)
                    }
                }
                Section {
                    Button("Zurücksetzen", role: .destructive) { resetFilters() }
                }
            }
            .navigationTitle("Filter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { showFilters = false }
                }
            }
        }
        .frame(minWidth: 360, idealWidth: 420, minHeight: 540, idealHeight: 620)
        .environmentObject(store)
    }

    private func selectDim(_ dim: DateDimension) {
        dateDim = dim
        let r = dim.range
        dateFrom = r.from
        dateTo = r.to
    }

    /// Wie in der Web-App: Konto und Zeitraum bleiben erhalten.
    private func resetFilters() {
        filterCat = ""
        filterType = .all
        filterRecipient = ""
        filterSearch = ""
        filterAmtMin = ""
        filterAmtMax = ""
    }

    // MARK: Liste / Tabelle

    @ViewBuilder
    private func listContent(_ rows: [BankTransaction]) -> some View {
        Group {
            if hSize == .regular {
                transactionTable(rows)
            } else {
                compactList(rows)
            }
        }
        .overlay {
            if rows.isEmpty {
                ContentUnavailableView("Keine Umsätze im gewählten Zeitraum", systemImage: "tray")
            }
        }
    }

    private func transactionTable(_ rows: [BankTransaction]) -> some View {
        let linked = Set(store.depotTransactions.map { $0.id })
        return Table(rows, selection: $selectedIds, sortOrder: $sortOrder) {
            TableColumn("Datum", value: \BankTransaction.date) { (t: BankTransaction) in
                Text(fmtDate(t.date))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .width(min: 80, ideal: 92, max: 110)

            TableColumn("Empfänger", value: \BankTransaction.recipient) { (t: BankTransaction) in
                Text(t.recipient.isEmpty ? "–" : t.recipient)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .help(t.recipient)
            }
            .width(min: 90, ideal: 150)

            TableColumn("Buchungstext", value: \BankTransaction.description) { (t: BankTransaction) in
                Text(t.description)
                    .font(.callout)
                    .lineLimit(3)
            }
            .width(min: 160, ideal: 340)

            TableColumn("Betrag", value: \BankTransaction.amount) { (t: BankTransaction) in
                Text(fmt(t.amount))
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .foregroundStyle(Color.signed(t.amount))
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 90, ideal: 115, max: 150)

            TableColumn("Kategorie", value: \BankTransaction.category) { (t: BankTransaction) in
                Text(t.category.isEmpty ? "–" : t.category)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .width(min: 80, ideal: 140)

            TableColumn("") { (t: BankTransaction) in
                actionCell(t, linked: linked)
            }
            .width(min: 112, ideal: 120, max: 130)
        }
        .contextMenu(forSelectionType: EntityID.self) { ids in
            contextMenuItems(ids)
        } primaryAction: { ids in
            openEditor(for: ids)
        }
    }

    private func compactList(_ rows: [BankTransaction]) -> some View {
        let linked = Set(store.depotTransactions.map { $0.id })
        return List(selection: $selectedIds) {
            ForEach(rows) { t in
                compactRow(t, linked: linked)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            pendingDelete = t
                        } label: {
                            Label("Löschen", systemImage: "trash")
                        }
                        Button {
                            startEdit(t)
                        } label: {
                            Label("Bearbeiten", systemImage: "pencil")
                        }
                        .tint(.gray)
                    }
                    .swipeActions(edge: .leading) {
                        Button {
                            openSecTx(t)
                        } label: {
                            Label("Wertpapier", systemImage: "chart.line.uptrend.xyaxis")
                        }
                        .tint(Color.income)
                    }
            }
        }
        .listStyle(.plain)
        .contextMenu(forSelectionType: EntityID.self) { ids in
            contextMenuItems(ids)
        } primaryAction: { ids in
            openEditor(for: ids)
        }
    }

    private func compactRow(_ t: BankTransaction, linked: Set<EntityID>) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(t.recipient.isEmpty ? "–" : t.recipient)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer()
                Text(fmt(t.amount))
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .foregroundStyle(Color.signed(t.amount))
            }
            if !t.description.isEmpty {
                Text(t.description)
                    .font(.caption)
                    .lineLimit(2)
            }
            HStack(spacing: 6) {
                Text(fmtDate(t.date)).monospacedDigit()
                if accountId == nil {
                    Text(store.account(t.accountId)?.name ?? "–")
                }
                Spacer()
                Text(t.category.isEmpty ? "–" : t.category)
                if let d = t.depotTxId, linked.contains(d) {
                    linkedDot
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
    }

    private var linkedDot: some View {
        Circle()
            .fill(Color.income)
            .frame(width: 8, height: 8)
            .shadow(color: Color.income, radius: 3)
            .help("Mit Wertpapiertransaktion verknüpft")
            .accessibilityLabel("Mit Wertpapiertransaktion verknüpft")
    }

    private func actionCell(_ t: BankTransaction, linked: Set<EntityID>) -> some View {
        HStack(spacing: 8) {
            if let d = t.depotTxId, linked.contains(d) {
                linkedDot
            } else {
                Color.clear.frame(width: 8, height: 8)
            }
            Button {
                openSecTx(t)
            } label: {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .foregroundStyle(Color(hex: 0x166534))
            }
            .buttonStyle(.borderless)
            .help("Als Wertpapiertransaktion anlegen")
            .accessibilityLabel("Als Wertpapiertransaktion anlegen")
            Button {
                startEdit(t)
            } label: {
                Image(systemName: "pencil")
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Bearbeiten")
            Button {
                pendingDelete = t
            } label: {
                Image(systemName: "xmark")
                    .foregroundStyle(Color.expense)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Löschen")
        }
    }

    @ViewBuilder
    private func contextMenuItems(_ ids: Set<EntityID>) -> some View {
        if ids.count == 1, let id = ids.first, let t = store.transactions.first(where: { $0.id == id }) {
            Button {
                openSecTx(t)
            } label: {
                Label("Als Wertpapiertransaktion anlegen", systemImage: "chart.line.uptrend.xyaxis")
            }
            Button {
                startEdit(t)
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

    // MARK: Aktionen

    private func openEditor(for ids: Set<EntityID>) {
        guard editMode != .active, ids.count == 1, let id = ids.first,
              let t = store.transactions.first(where: { $0.id == id }) else { return }
        startEdit(t)
    }

    private func startEdit(_ t: BankTransaction) {
        editor = .edit(t)
    }

    private func deleteTx(_ tx: BankTransaction) {
        guard let current = store.transactions.first(where: { $0.id == tx.id }) else { return }
        if let i = store.bankAccounts.firstIndex(where: { $0.id == current.accountId }) {
            store.bankAccounts[i].balance -= current.amount
        }
        store.transactions.removeAll { $0.id == current.id }
        selectedIds.remove(current.id)
    }

    private func toggleSelectAll(_ rows: [BankTransaction]) {
        if !rows.isEmpty && selectedIds.count == rows.count {
            selectedIds = []
        } else {
            selectedIds = Set(rows.map { $0.id })
            if editMode != .active { editMode = .active }
        }
    }

    private func bulkAssign() {
        guard !bulkCat.isEmpty, !selectedIds.isEmpty else { return }
        let ids = selectedIds
        let cat = bulkCat
        for i in store.transactions.indices where ids.contains(store.transactions[i].id) {
            store.transactions[i].category = cat
        }
        selectedIds = []
        bulkCat = ""
    }

    /// Wie in der Web-App: kehrt nur das Vorzeichen um (ohne Saldoanpassung).
    private func bulkFlipSign() {
        guard !selectedIds.isEmpty else { return }
        let ids = selectedIds
        for i in store.transactions.indices where ids.contains(store.transactions[i].id) {
            store.transactions[i].amount = -store.transactions[i].amount
        }
        selectedIds = []
    }

    private func openSecTx(_ bankTx: BankTransaction) {
        guard !store.securities.isEmpty, let firstDepot = store.depots.first else {
            showMissingSecAlert = true
            return
        }
        let sortedSecs = store.securities.sorted {
            $0.name.compare($1.name, locale: bankAccountsTxLocale) == .orderedAscending
        }
        guard let firstSec = sortedSecs.first else { return }
        let absAmt = abs(bankTx.amount)
        secTxDraft = BankAccountsSecTxDraft(
            bankTx: bankTx,
            secId: firstSec.id,
            depotId: firstDepot.id,
            txType: bankTx.amount < 0 ? .buy : .dividend,
            date: bankTx.date,
            qty: "1",
            price: bankAccountsFixed(absAmt, 4),
            fees: "0"
        )
    }
}

// MARK: - Umsatz anlegen / bearbeiten

fileprivate struct BankAccountsTxEditor: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    let mode: BankAccountsTxEditorMode
    let fixedAccountId: EntityID?

    @State private var accId: EntityID?
    @State private var date: ISODate
    @State private var desc: String
    @State private var recip: String
    @State private var amount: Double?
    @State private var sign: Double
    @State private var cat: String

    init(mode: BankAccountsTxEditorMode, fixedAccountId: EntityID?, defaultAccountId: EntityID?) {
        self.mode = mode
        self.fixedAccountId = fixedAccountId
        switch mode {
        case .add:
            _accId = State(initialValue: fixedAccountId ?? defaultAccountId)
            _date = State(initialValue: ISODates.today())
            _desc = State(initialValue: "")
            _recip = State(initialValue: "")
            _amount = State(initialValue: nil)
            _sign = State(initialValue: -1)
            _cat = State(initialValue: "")
        case .edit(let t):
            _accId = State(initialValue: t.accountId)
            _date = State(initialValue: t.date)
            _desc = State(initialValue: t.description)
            _recip = State(initialValue: t.recipient)
            _amount = State(initialValue: abs(t.amount))
            _sign = State(initialValue: t.amount >= 0 ? 1 : -1)
            _cat = State(initialValue: t.category)
        }
    }

    private var isEdit: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var showAccountPicker: Bool {
        isEdit ? fixedAccountId == nil : store.bankAccounts.count > 1
    }

    private var canSave: Bool {
        isEdit || (amount != nil && accId != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                if showAccountPicker {
                    Picker("Konto", selection: $accId) {
                        ForEach(store.bankAccounts) { a in
                            Text(a.name).tag(a.id as EntityID?)
                        }
                    }
                }
                ISODatePicker("Datum", date: $date)
                LabeledContent("Empfänger") {
                    TextField("Empfänger", text: $recip)
                        .multilineTextAlignment(.trailing)
                }
                Section("Buchungstext") {
                    TextField("Buchungstext", text: $desc, axis: .vertical)
                        .lineLimit(3...8)
                }
                Section {
                    LabeledContent("Betrag (€)") {
                        HStack(spacing: 8) {
                            SignToggle(sign: $sign)
                            DecimalField("Betrag", value: $amount, maxDecimals: 2)
                        }
                    }
                    LabeledContent("Kategorie") {
                        CategoryNamePicker(selection: $cat, placeholder: "– keine –")
                    }
                }
            }
            .navigationTitle(isEdit ? "Umsatz bearbeiten" : "Umsatz anlegen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEdit ? "Speichern" : "Anlegen") { save() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private func save() {
        let newAmt = sign * abs(amount ?? 0)
        switch mode {
        case .add:
            guard let aid = accId else { return }
            if let i = store.bankAccounts.firstIndex(where: { $0.id == aid }) {
                store.bankAccounts[i].balance += newAmt
            }
            store.transactions.append(BankTransaction(accountId: aid, date: date, description: desc,
                                                      recipient: recip, amount: newAmt, category: cat))
        case .edit(let original):
            guard let old = store.transactions.first(where: { $0.id == original.id }) else {
                dismiss()
                return
            }
            let newAcc = accId ?? old.accountId
            if let i = store.bankAccounts.firstIndex(where: { $0.id == old.accountId }) {
                store.bankAccounts[i].balance -= old.amount
            }
            if let j = store.bankAccounts.firstIndex(where: { $0.id == newAcc }) {
                store.bankAccounts[j].balance += newAmt
            }
            if let k = store.transactions.firstIndex(where: { $0.id == old.id }) {
                store.transactions[k].accountId = newAcc
                store.transactions[k].date = date
                store.transactions[k].description = desc
                store.transactions[k].recipient = recip
                store.transactions[k].amount = newAmt
                store.transactions[k].category = cat
            }
        }
        dismiss()
    }
}

// MARK: - Als Wertpapiertransaktion anlegen

fileprivate struct BankAccountsSecTxSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTheme) private var theme

    @State private var draft: BankAccountsSecTxDraft

    init(draft: BankAccountsSecTxDraft) {
        _draft = State(initialValue: draft)
    }

    private var isTrade: Bool { draft.txType.isTrade }
    private var absAmt: Double { abs(draft.bankTx.amount) }

    private var sortedSecurities: [SecurityAsset] {
        store.securities.sorted { $0.name.compare($1.name, locale: bankAccountsTxLocale) == .orderedAscending }
    }

    // Bindings mit den Neuberechnungen der Web-App

    private var typeBinding: Binding<DepotTxType> {
        Binding(get: { draft.txType }, set: { newType in
            let fees = parseDecimal(draft.fees) ?? 0
            let q = bankAccountsOrOne(parseDecimal(draft.qty))
            draft.txType = newType
            if newType.isIncome {
                draft.qty = "1"
                draft.price = bankAccountsFixed(absAmt, 2)
            } else {
                draft.price = bankAccountsFixed((absAmt - fees) / q, 4)
            }
        })
    }

    private var qtyBinding: Binding<String> {
        Binding(get: { draft.qty }, set: { q in
            let fees = parseDecimal(draft.fees) ?? 0
            if let qv = parseDecimal(q), qv > 0 {
                draft.price = bankAccountsFixed((absAmt - fees) / qv, 4)
            }
            draft.qty = q
        })
    }

    private var feesBinding: Binding<String> {
        Binding(get: { draft.fees }, set: { f in
            if isTrade {
                let q = bankAccountsOrOne(parseDecimal(draft.qty))
                draft.price = bankAccountsFixed((absAmt - (parseDecimal(f) ?? 0)) / q, 4)
            }
            draft.fees = f
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    summary
                }
                Section {
                    Picker("Wertpapier", selection: $draft.secId) {
                        ForEach(sortedSecurities) { s in
                            Text(s.symbol.isEmpty ? s.name : "\(s.name) (\(s.symbol))").tag(s.id)
                        }
                    }
                    Picker("Depot", selection: $draft.depotId) {
                        ForEach(store.depots) { d in
                            Text(d.name).tag(d.id)
                        }
                    }
                    Picker("Art", selection: typeBinding) {
                        ForEach(DepotTxType.allCases) { t in
                            Text(t.label).tag(t)
                        }
                    }
                    ISODatePicker("Datum", date: $draft.date)
                }
                Section {
                    if isTrade {
                        numberRow("Anzahl (Stück)", text: qtyBinding)
                    }
                    numberRow(isTrade ? "Kurs (€)" : "Betrag (€)", text: $draft.price)
                    numberRow("Gebühren (€)", text: feesBinding)
                }
            }
            .navigationTitle("Als Wertpapiertransaktion anlegen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Transaktion anlegen") { confirm() }
                }
            }
        }
    }

    private var summary: some View {
        let tx = draft.bankTx
        return VStack(alignment: .leading, spacing: 4) {
            (Text(fmt(tx.amount)).bold().foregroundColor(Color.signed(tx.amount))
                + Text(" am \(fmtDate(tx.date))").foregroundColor(.secondary))
            if !tx.description.isEmpty {
                Text(String(tx.description.prefix(60)))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .font(.subheadline)
    }

    private func numberRow(_ label: String, text: Binding<String>) -> some View {
        LabeledContent(label) {
            TextField(label, text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
        }
    }

    private func confirm() {
        let quantity = draft.txType.isIncome ? 1 : bankAccountsOrOne(parseDecimal(draft.qty))
        let priceVal = parseDecimal(draft.price) ?? 0
        let feesVal = parseDecimal(draft.fees) ?? 0
        let newTx = DepotTransaction(depotId: draft.depotId, securityId: draft.secId, type: draft.txType,
                                     quantity: quantity, price: priceVal, fees: feesVal,
                                     date: draft.date, fromBankTx: true)
        store.depotTransactions.append(newTx)
        if let i = store.transactions.firstIndex(where: { $0.id == draft.bankTx.id }) {
            store.transactions[i].depotTxId = newTx.id
        }
        dismiss()
    }
}
