import SwiftUI

// Port von src/components/BankAccounts.jsx (Hauptkomponente: Kontenliste).
// Die Umsatzansicht (TransactionModal) liegt in BankAccountsTransactionsView.swift.

// MARK: - Hilfsfunktionen

/// Tagesnummer eines ISO-Datums (für schnelle Abstandsberechnung ohne DateFormatter).
fileprivate func bankAccountsDayNumber(_ iso: String) -> Int? {
    let p = iso.prefix(10).split(separator: "-")
    guard p.count == 3, let y = Int(p[0]), let m = Int(p[1]), let d = Int(p[2]) else { return nil }
    let yy = m <= 2 ? y - 1 : y
    let era = (yy >= 0 ? yy : yy - 399) / 400
    let yoe = yy - era * 400
    let mp = (m + 9) % 12
    let doy = (153 * mp + 2) / 5 + d - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097 + doe - 719468
}

/// Kennzahlen je Konto: Anzahl Umsätze und "Importstand" (Umsatzdatum, das heute am nächsten liegt).
fileprivate struct BankAccountsStats {
    var count = 0
    var importDate: ISODate?
    var bestDistance = Int.max
}

fileprivate func bankAccountsComputeStats(_ transactions: [BankTransaction]) -> [EntityID: BankAccountsStats] {
    let today = bankAccountsDayNumber(ISODates.today()) ?? 0
    var map: [EntityID: BankAccountsStats] = [:]
    for t in transactions {
        var s = map[t.accountId] ?? BankAccountsStats()
        s.count += 1
        let dist = bankAccountsDayNumber(t.date).map { abs($0 - today) } ?? Int.max
        if s.importDate == nil {
            s.importDate = t.date
            s.bestDistance = dist
        } else if dist < s.bestDistance {
            s.importDate = t.date
            s.bestDistance = dist
        }
        map[t.accountId] = s
    }
    return map
}

fileprivate let bankAccountsGermanLocale = Locale(identifier: "de_DE")

// MARK: - Typen

fileprivate enum BankAccountsGroupBy: String, CaseIterable, Identifiable {
    case none, person, bank
    var id: String { rawValue }
    var label: String {
        switch self {
        case .none: return "– keine –"
        case .person: return "Person"
        case .bank: return "Kreditinstitut"
        }
    }
}

fileprivate enum BankAccountsSortKey: String, CaseIterable, Identifiable {
    case name, balance, person, bank
    var id: String { rawValue }
    var label: String {
        switch self {
        case .name: return "Name"
        case .balance: return "Saldo"
        case .person: return "Person"
        case .bank: return "Kreditinstitut"
        }
    }
}

fileprivate struct BankAccountsGroup: Identifiable {
    let label: String?
    let items: [BankAccount]
    var id: String { label ?? "__all" }
}

fileprivate enum BankAccountsFormMode: Identifiable {
    case add
    case edit(BankAccount)
    var id: String {
        switch self {
        case .add: return "add"
        case .edit(let a): return "edit-\(a.id.key)"
        }
    }
}

// MARK: - Hauptansicht

struct BankAccountsView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme
    @Environment(\.horizontalSizeClass) private var hSize

    @State private var groupBy: BankAccountsGroupBy = .none
    @State private var sortBy: BankAccountsSortKey = .name
    @State private var sortAsc = true
    @State private var collapsedGroups: Set<String> = []
    @State private var formMode: BankAccountsFormMode?
    @State private var pendingDelete: BankAccount?
    @State private var txTarget: BankAccountsTxTarget?

    var body: some View {
        content
            .navigationTitle("Bankkonten")
            .toolbar { toolbarContent }
            .sheet(item: $formMode) { mode in
                BankAccountsAccountForm(mode: mode)
                    .environmentObject(store)
            }
            .confirmDelete(item: $pendingDelete, title: { acc in "Konto „\(acc.name)“ löschen?" }) { acc in
                store.bankAccounts.removeAll { $0.id == acc.id }
            }
            .navigationDestination(item: $txTarget) { target in
                BankAccountsTransactionsView(accountId: target.accountId)
            }
            .moduleBackground()
    }

    // MARK: Inhalt

    @ViewBuilder
    private var content: some View {
        if store.bankAccounts.isEmpty {
            EmptyStateView(title: "Noch keine Konten angelegt", systemImage: "building.columns",
                           message: "Über „+ Konto“ ein neues Konto anlegen.")
        } else {
            let stats = bankAccountsComputeStats(store.transactions)
            List {
                ForEach(groups) { g in
                    groupSection(g, stats: stats)
                }
                footerSection
            }
            .listStyle(.insetGrouped)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button {
                formMode = .add
            } label: {
                Label("Konto", systemImage: "plus")
            }
        }
        ToolbarItem(placement: .secondaryAction) {
            if store.bankAccounts.count > 1 {
                Menu {
                    Picker("Gruppieren", selection: $groupBy) {
                        ForEach(BankAccountsGroupBy.allCases) { g in
                            Text(g.label).tag(g)
                        }
                    }
                    .pickerStyle(.menu)
                    Picker("Sortieren", selection: $sortBy) {
                        ForEach(BankAccountsSortKey.allCases) { s in
                            Text(s.label).tag(s)
                        }
                    }
                    .pickerStyle(.menu)
                    Button {
                        sortAsc.toggle()
                    } label: {
                        Label(sortAsc ? "Aufsteigend" : "Absteigend",
                              systemImage: sortAsc ? "arrow.up" : "arrow.down")
                    }
                } label: {
                    Label("Gruppieren & Sortieren", systemImage: "line.3.horizontal.decrease.circle")
                }
            }
        }
    }

    // MARK: Gruppierung / Sortierung

    private func sortedAccounts(_ list: [BankAccount]) -> [BankAccount] {
        let asc = sortAsc
        let key = sortBy
        return list.sorted { a, b in
            switch key {
            case .balance:
                let va = a.latestBalance, vb = b.latestBalance
                return asc ? va < vb : va > vb
            case .name, .person, .bank:
                let va = textKey(a, key), vb = textKey(b, key)
                return asc ? va < vb : va > vb
            }
        }
    }

    private func textKey(_ a: BankAccount, _ key: BankAccountsSortKey) -> String {
        switch key {
        case .person: return (a.person ?? "").lowercased()
        case .bank: return (a.bank ?? "").lowercased()
        default: return a.name.lowercased()
        }
    }

    private var groups: [BankAccountsGroup] {
        let sorted = sortedAccounts(store.bankAccounts)
        if groupBy == .none { return [BankAccountsGroup(label: nil, items: sorted)] }
        var order: [String] = []
        var map: [String: [BankAccount]] = [:]
        for a in sorted {
            let key: String
            if groupBy == .person {
                key = a.person ?? "(Keine Person)"
            } else {
                key = a.bank ?? "(Kein Institut)"
            }
            if map[key] == nil { order.append(key); map[key] = [] }
            map[key]?.append(a)
        }
        return order
            .sorted { $0.compare($1, locale: bankAccountsGermanLocale) == .orderedAscending }
            .map { BankAccountsGroup(label: $0, items: map[$0] ?? []) }
    }

    private func toggleGroup(_ label: String) {
        if collapsedGroups.contains(label) { collapsedGroups.remove(label) } else { collapsedGroups.insert(label) }
    }

    private func personColor(_ name: String?) -> (border: Color, badgeBg: Color, badgeText: Color)? {
        guard let name, let idx = store.insurancePersons.firstIndex(of: name) else { return nil }
        return Palette.persons[idx % Palette.persons.count]
    }

    // MARK: Abschnitte

    @ViewBuilder
    private func groupSection(_ g: BankAccountsGroup, stats: [EntityID: BankAccountsStats]) -> some View {
        let isGrouped = groupBy != .none && g.label != nil
        let isCollapsed = isGrouped && collapsedGroups.contains(g.label ?? "")
        Section {
            if !isCollapsed {
                if hSize == .regular {
                    columnHeader
                }
                ForEach(g.items) { a in
                    accountRow(a, stats: stats[a.id] ?? BankAccountsStats())
                }
            }
        } header: {
            if isGrouped, let label = g.label {
                groupHeader(label, items: g.items, collapsed: isCollapsed)
            }
        }
    }

    private func groupHeader(_ label: String, items: [BankAccount], collapsed: Bool) -> some View {
        let total = items.reduce(0.0) { $0 + $1.latestBalance }
        let pColor = (groupBy == .person && label != "(Keine Person)") ? personColor(label) : nil
        return Button {
            withAnimation { toggleGroup(label) }
        } label: {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(pColor?.border ?? theme.primary)
                    .frame(width: 4, height: 22)
                Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                    .font(.caption.weight(.semibold))
                    .frame(width: 12)
                if let pColor {
                    Text(label)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(pColor.badgeBg)
                        .foregroundStyle(pColor.badgeText)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                } else {
                    Text(label).font(.subheadline.weight(.bold)).foregroundStyle(.primary)
                }
                Spacer()
                Text("\(items.count) \(items.count == 1 ? "Konto" : "Konten")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(fmt(total))
                    .font(.subheadline.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(Color.signed(total))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .textCase(nil)
    }

    private var columnHeader: some View {
        HStack(spacing: 10) {
            Text("Konto").frame(maxWidth: .infinity, alignment: .leading)
            Text("Saldo").frame(width: 120, alignment: .trailing)
            Text("Zinssatz").frame(width: 66, alignment: .trailing)
            Text("Laufzeit bis").frame(width: 84, alignment: .trailing)
            Text("Zins p.a.").frame(width: 92, alignment: .trailing).foregroundStyle(Color.income)
            Text("Umsätze").frame(width: 58, alignment: .trailing)
            Text("Importstand").frame(width: 84, alignment: .trailing)
            Color.clear.frame(width: 84, height: 1)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .listRowBackground(Color(.tertiarySystemGroupedBackground))
    }

    @ViewBuilder
    private func accountRow(_ a: BankAccount, stats: BankAccountsStats) -> some View {
        Group {
            if hSize == .regular {
                regularRow(a, stats: stats)
            } else {
                compactRow(a, stats: stats)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { txTarget = BankAccountsTxTarget(accountId: a.id) }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                pendingDelete = a
            } label: {
                Label("Löschen", systemImage: "trash")
            }
            Button {
                formMode = .edit(a)
            } label: {
                Label("Bearbeiten", systemImage: "pencil")
            }
            .tint(.gray)
        }
        .contextMenu {
            Button {
                txTarget = BankAccountsTxTarget(accountId: a.id)
            } label: {
                Label("Umsätze", systemImage: "list.bullet.rectangle")
            }
            Button {
                formMode = .edit(a)
            } label: {
                Label("Bearbeiten", systemImage: "pencil")
            }
            Button(role: .destructive) {
                pendingDelete = a
            } label: {
                Label("Löschen", systemImage: "trash")
            }
        }
    }

    private func nameCell(_ a: BankAccount) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(a.name).fontWeight(.medium)
            if a.person != nil || a.bank != nil {
                HStack(spacing: 5) {
                    if let person = a.person {
                        if let pColor = personColor(person) {
                            Text(person)
                                .font(.caption2.weight(.semibold))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(pColor.badgeBg)
                                .foregroundStyle(pColor.badgeText)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                        } else {
                            Text(person).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    if let bank = a.bank {
                        Text(bank).font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func zinssatzText(_ a: BankAccount) -> String {
        guard let z = a.zinssatz else { return "–" }
        return fmtPct(z)
    }

    private func zinsPaText(_ a: BankAccount) -> String {
        guard let z = a.yearlyInterest else { return "–" }
        return fmt(z)
    }

    private func regularRow(_ a: BankAccount, stats: BankAccountsStats) -> some View {
        let bal = a.latestBalance
        return HStack(spacing: 10) {
            nameCell(a).frame(maxWidth: .infinity, alignment: .leading)
            Text(fmt(bal))
                .fontWeight(.bold)
                .monospacedDigit()
                .foregroundStyle(Color.signed(bal))
                .frame(width: 120, alignment: .trailing)
            Text(zinssatzText(a))
                .font(.caption).foregroundStyle(.secondary)
                .frame(width: 66, alignment: .trailing)
            Text(fmtDate(a.laufzeitBis))
                .font(.caption).foregroundStyle(.secondary)
                .frame(width: 84, alignment: .trailing)
            Text(zinsPaText(a))
                .font(.caption.weight(.semibold)).monospacedDigit()
                .foregroundStyle(Color.income)
                .frame(width: 92, alignment: .trailing)
            Text(stats.count > 0 ? "\(stats.count)" : "–")
                .font(.caption).foregroundStyle(.secondary)
                .frame(width: 58, alignment: .trailing)
            Text(fmtDate(stats.importDate))
                .font(.caption).foregroundStyle(.secondary)
                .frame(width: 84, alignment: .trailing)
            Button("Umsätze") {
                txTarget = BankAccountsTxTarget(accountId: a.id)
            }
            .buttonStyle(.borderedProminent)
            .tint(theme.primary)
            .controlSize(.small)
            .frame(width: 84, alignment: .trailing)
        }
    }

    private func compactRow(_ a: BankAccount, stats: BankAccountsStats) -> some View {
        let bal = a.latestBalance
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                nameCell(a)
                Spacer()
                Text(fmt(bal))
                    .fontWeight(.bold)
                    .monospacedDigit()
                    .foregroundStyle(Color.signed(bal))
            }
            HStack(spacing: 10) {
                if a.zinssatz != nil {
                    Text("Zins: \(zinssatzText(a))")
                }
                if a.yearlyInterest != nil {
                    Text("p.a. \(zinsPaText(a))").foregroundStyle(Color.income)
                }
                if a.laufzeitBis != nil {
                    Text("bis \(fmtDate(a.laufzeitBis))")
                }
                Spacer()
                Text(stats.count > 0 ? "\(stats.count) Umsätze" : "– Umsätze")
                Text("Stand \(fmtDate(stats.importDate))")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var footerSection: some View {
        let totalZins = store.bankAccounts.reduce(0.0) { s, a in s + (a.yearlyInterest ?? 0) }
        if totalZins > 0 || store.bankAccounts.count > 1 {
            Section {
                if totalZins > 0 {
                    HStack {
                        Text("Gesamter Zinsertrag p.a.:").foregroundStyle(.secondary)
                        Spacer()
                        Text(fmt(totalZins)).fontWeight(.bold).monospacedDigit().foregroundStyle(Color.income)
                    }
                }
                if store.bankAccounts.count > 1 {
                    Button {
                        txTarget = BankAccountsTxTarget(accountId: nil)
                    } label: {
                        Label("Alle Umsätze (\(store.transactions.count))", systemImage: "list.bullet.rectangle")
                    }
                }
            }
        }
    }
}

// MARK: - Konto anlegen / bearbeiten

/// Zahlenfeld mit Minus-Taste (Salden können negativ sein).
fileprivate struct BankAccountsSignedField: View {
    let title: String
    @Binding var value: Double?
    var prompt: String = ""
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(title, text: $text, prompt: Text(prompt.isEmpty ? title : prompt))
            .keyboardType(.numbersAndPunctuation)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .focused($focused)
            .onAppear { text = editString(value, maxDecimals: 2) }
            .onChange(of: text) { _, new in value = parseDecimal(new) }
            .onChange(of: value) { _, new in
                if !focused, parseDecimal(text) != new { text = editString(new, maxDecimals: 2) }
            }
    }
}

fileprivate struct BankAccountsAccountForm: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    let mode: BankAccountsFormMode

    @State private var name: String
    @State private var balance: Double?
    @State private var zinssatz: Double?
    @State private var laufzeit: ISODate
    @State private var person: String
    @State private var bank: String
    @State private var newPerson = ""
    @State private var newBank = ""

    init(mode: BankAccountsFormMode) {
        self.mode = mode
        switch mode {
        case .add:
            _name = State(initialValue: "")
            _balance = State(initialValue: nil)
            _zinssatz = State(initialValue: nil)
            _laufzeit = State(initialValue: "")
            _person = State(initialValue: "")
            _bank = State(initialValue: "")
        case .edit(let a):
            _name = State(initialValue: a.name)
            _balance = State(initialValue: a.latestBalance)
            _zinssatz = State(initialValue: a.zinssatz)
            _laufzeit = State(initialValue: a.laufzeitBis ?? "")
            _person = State(initialValue: a.person ?? "")
            _bank = State(initialValue: a.bank ?? "")
        }
    }

    private var isEdit: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var canSave: Bool { !name.isEmpty && balance != nil }

    private var personOptions: [String] {
        var list = store.insurancePersons
        if !person.isEmpty && !list.contains(person) { list.append(person) }
        return list
    }

    private var bankOptions: [String] {
        var list = store.banks
        if !bank.isEmpty && !list.contains(bank) { list.append(bank) }
        return list
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Kontoname *") {
                        TextField("Kontoname", text: $name, prompt: Text("z. B. Girokonto"))
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent(isEdit ? "Saldo (€) *" : "Anfangsstand (€) *") {
                        BankAccountsSignedField(title: "Betrag", value: $balance, prompt: "0,00")
                    }
                }
                personSection
                bankSection
                Section {
                    LabeledContent("Zinssatz (% p.a.)") {
                        DecimalField("Zinssatz", value: $zinssatz, prompt: "z. B. 3,50", maxDecimals: 4)
                    }
                    OptionalISODatePicker("Laufzeit bis", date: $laufzeit)
                }
            }
            .navigationTitle(isEdit ? "Konto bearbeiten" : "Konto hinzufügen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEdit ? "Speichern" : "Konto hinzufügen") { save() }
                        .disabled(!canSave)
                }
            }
        }
    }

    private var personSection: some View {
        Section("Person") {
            Picker("Person", selection: $person) {
                Text("– keine –").tag("")
                ForEach(personOptions, id: \.self) { p in
                    Text(p).tag(p)
                }
            }
            HStack {
                TextField("Neue Person…", text: $newPerson)
                    .onSubmit(addPerson)
                Button(action: addPerson) {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(newPerson.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private var bankSection: some View {
        Section("Kreditinstitut") {
            Picker("Kreditinstitut", selection: $bank) {
                Text("– keins –").tag("")
                ForEach(bankOptions, id: \.self) { b in
                    Text(b).tag(b)
                }
            }
            HStack {
                TextField("Neues Institut…", text: $newBank)
                    .onSubmit(addBank)
                Button(action: addBank) {
                    Image(systemName: "plus.circle.fill")
                }
                .buttonStyle(.borderless)
                .disabled(newBank.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func addPerson() {
        let n = newPerson.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return }
        if !store.insurancePersons.contains(n) { store.insurancePersons.append(n) }
        person = n
        newPerson = ""
    }

    private func addBank() {
        let n = newBank.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { return }
        if !store.banks.contains(n) { store.banks.append(n) }
        bank = n
        newBank = ""
    }

    private func save() {
        guard let bal = balance else { return }
        switch mode {
        case .add:
            var acc = BankAccount(name: name, balance: bal)
            acc.zinssatz = zinssatz
            acc.laufzeitBis = laufzeit.isEmpty ? nil : laufzeit
            acc.person = person.isEmpty ? nil : person
            acc.bank = bank.isEmpty ? nil : bank
            store.bankAccounts.append(acc)
        case .edit(let original):
            if let i = store.bankAccounts.firstIndex(where: { $0.id == original.id }) {
                store.bankAccounts[i].name = name
                store.bankAccounts[i].balance = bal
                store.bankAccounts[i].zinssatz = zinssatz
                store.bankAccounts[i].laufzeitBis = laufzeit.isEmpty ? nil : laufzeit
                store.bankAccounts[i].person = person.isEmpty ? nil : person
                store.bankAccounts[i].bank = bank.isEmpty ? nil : bank
            }
        }
        dismiss()
    }
}
