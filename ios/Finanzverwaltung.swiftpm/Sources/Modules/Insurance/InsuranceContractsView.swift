import SwiftUI

// Port von `src/components/InsuranceContracts.jsx`.

// MARK: - Hilfstypen

private enum InsuranceGroupBy: String, CaseIterable, Identifiable {
    case none, person, provider, category
    var id: String { rawValue }
    var label: String {
        switch self {
        case .none: return "– keine –"
        case .person: return "Person"
        case .provider: return "Anbieter"
        case .category: return "Kategorie"
        }
    }
}

private enum InsuranceSortKey: String, CaseIterable, Identifiable {
    case name, provider, value, premium
    var id: String { rawValue }
    var label: String {
        switch self {
        case .name: return "Name"
        case .provider: return "Anbieter"
        case .value: return "Wert"
        case .premium: return "Beitrag"
        }
    }
}

private struct InsuranceGroup: Identifiable {
    let label: String?
    let items: [InsuranceContract]
    var id: String { label ?? "__all" }
}

private let insuranceGermanLocale = Locale(identifier: "de_DE")

/// Anzeigewert: neuester Historienwert, sonst `value` (nil = "–").
private func insuranceDisplayValue(_ c: InsuranceContract) -> Double? {
    c.latestValueEntry?.value ?? c.value
}

// MARK: - Hauptansicht

struct InsuranceContractsView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme

    @State private var draft: InsuranceContractsDraft?
    @State private var pendingDelete: InsuranceContract?

    @State private var expandedHistory: Set<EntityID> = []
    @State private var expandedContracts: Set<EntityID> = []
    @State private var expandedGroups: Set<String> = []

    @State private var filterPerson: String = ""
    @State private var filterProvider: String = ""
    @State private var filterCategory: EntityID? = nil
    @State private var groupBy: InsuranceGroupBy = .person
    @State private var sortBy: InsuranceSortKey = .name
    @State private var sortAscending = true

    var body: some View {
        content
            .navigationTitle("Versicherungsverträge")
            .toolbar { toolbarContent }
            .sheet(item: $draft) { d in
                InsuranceContractsFormSheet(draft: d) { saved in
                    saveContract(saved)
                }
                .environmentObject(store)
                .environment(\.appTheme, theme)
                .tint(theme.primary)
            }
            .confirmDelete(item: $pendingDelete, title: { "Versicherung „\($0.name)“ löschen?" }) { c in
                removeContract(c)
            }
    }

    @ViewBuilder
    private var content: some View {
        if store.insuranceContracts.isEmpty {
            EmptyStateView(title: "Noch keine Versicherungsverträge angelegt.", systemImage: "shield.lefthalf.filled")
                .moduleBackground()
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    filterBar
                    contractList
                }
                .padding()
            }
            .moduleBackground()
        }
    }

    // MARK: Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button {
                draft = InsuranceContractsDraft()
            } label: {
                Label("Neu", systemImage: "plus")
            }
        }
    }

    // MARK: Filterleiste

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                personFilterMenu
                providerFilterMenu
                CategoryPicker(selection: $filterCategory, placeholder: "Alle Kategorien", typeFilter: .expense)
                    .font(.subheadline)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
                    .frame(minWidth: 160)
                if hasActiveFilter {
                    Button {
                        filterPerson = ""
                        filterProvider = ""
                        filterCategory = nil
                    } label: {
                        Label("Filter", systemImage: "xmark")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                Divider().frame(height: 20)
                groupSortMenus
            }
            .padding(.vertical, 2)
        }
    }

    private var personFilterMenu: some View {
        Menu {
            Picker("Person", selection: $filterPerson) {
                Text("Alle Personen").tag("")
                ForEach(store.insurancePersons, id: \.self) { p in
                    Text(p).tag(p)
                }
            }
        } label: {
            insuranceFilterLabel(filterPerson.isEmpty ? "Alle Personen" : filterPerson, active: !filterPerson.isEmpty)
        }
    }

    private var providerFilterMenu: some View {
        Menu {
            Picker("Anbieter", selection: $filterProvider) {
                Text("Alle Anbieter").tag("")
                ForEach(providers, id: \.self) { p in
                    Text(p).tag(p)
                }
            }
        } label: {
            insuranceFilterLabel(filterProvider.isEmpty ? "Alle Anbieter" : filterProvider, active: !filterProvider.isEmpty)
        }
    }

    private var groupSortMenus: some View {
        HStack(spacing: 8) {
            Menu {
                Picker("Gruppieren", selection: $groupBy) {
                    ForEach(InsuranceGroupBy.allCases) { g in
                        Text(g.label).tag(g)
                    }
                }
            } label: {
                insuranceFilterLabel("Gruppieren: \(groupBy.label)", active: false)
            }
            Menu {
                Picker("Sortieren", selection: $sortBy) {
                    ForEach(InsuranceSortKey.allCases) { k in
                        Text(k.label).tag(k)
                    }
                }
            } label: {
                insuranceFilterLabel("Sortieren: \(sortBy.label)", active: false)
            }
            Button {
                sortAscending.toggle()
            } label: {
                Image(systemName: sortAscending ? "arrow.up" : "arrow.down")
                    .font(.subheadline)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(sortAscending ? "Aufsteigend" : "Absteigend")
        }
    }

    private func insuranceFilterLabel(_ text: String, active: Bool) -> some View {
        HStack(spacing: 4) {
            Text(text).lineLimit(1)
            Image(systemName: "chevron.up.chevron.down").font(.caption2)
        }
        .font(.subheadline)
        .foregroundStyle(active ? Color.white : Color.primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(active ? theme.primary : Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(active ? theme.primary : Color.borderGray))
    }

    // MARK: Liste

    @ViewBuilder
    private var contractList: some View {
        let list = filtered
        if list.isEmpty {
            Text("Keine Verträge entsprechen dem Filter.")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 16)
        } else {
            LazyVStack(alignment: .leading, spacing: 12) {
                ForEach(groups(list)) { group in
                    groupView(group)
                }
            }
            totalFooter(list)
        }
    }

    @ViewBuilder
    private func groupView(_ group: InsuranceGroup) -> some View {
        let isGrouped = groupBy != .none && group.label != nil
        let isCollapsed = isGrouped && !expandedGroups.contains(group.label ?? "")
        VStack(alignment: .leading, spacing: 0) {
            if isGrouped, let label = group.label {
                groupHeader(label: label, items: group.items, collapsed: isCollapsed)
            }
            if !isCollapsed {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(group.items) { c in
                        contractCard(c)
                    }
                }
                .padding(isGrouped ? 10 : 0)
                .background(isGrouped ? Color(.systemBackground).opacity(0.5) : Color.clear)
                .overlay {
                    if isGrouped {
                        UnevenRoundedRectangle(bottomLeadingRadius: 8, bottomTrailingRadius: 8)
                            .stroke(Color.borderGray)
                    }
                }
            }
        }
    }

    private func groupHeader(label: String, items: [InsuranceContract], collapsed: Bool) -> some View {
        let monthlyTotal = groupMonthlyPremium(items)
        let shape = UnevenRoundedRectangle(topLeadingRadius: 8,
                                           bottomLeadingRadius: collapsed ? 8 : 0,
                                           bottomTrailingRadius: collapsed ? 8 : 0,
                                           topTrailingRadius: 8)
        return Button {
            if expandedGroups.contains(label) { expandedGroups.remove(label) } else { expandedGroups.insert(label) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 12)
                Text(label)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Spacer()
                Text("\(items.count) \(items.count == 1 ? "Vertrag" : "Verträge")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if monthlyTotal > 0 {
                    Text("\(fmt(monthlyTotal)) mtl.")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.expense)
                        .monospacedDigit()
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(theme.background)
            .overlay(alignment: .leading) {
                Rectangle().fill(theme.primary).frame(width: 4)
            }
            .clipShape(shape)
            .overlay(shape.stroke(Color.borderGray))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func contractCard(_ c: InsuranceContract) -> some View {
        InsuranceContractsCard(
            contract: c,
            personColor: personColor(c.person),
            categoryName: store.category(c.categoryId)?.name,
            isOpen: expandedContracts.contains(c.id),
            historyOpen: expandedHistory.contains(c.id),
            onToggleOpen: {
                if expandedContracts.contains(c.id) { expandedContracts.remove(c.id) } else { expandedContracts.insert(c.id) }
            },
            onToggleHistory: {
                if expandedHistory.contains(c.id) { expandedHistory.remove(c.id) } else { expandedHistory.insert(c.id) }
            },
            onEdit: { draft = InsuranceContractsDraft(editing: c) },
            onDelete: { pendingDelete = c },
            onHistoryChange: { h in updateHistory(c.id, h) }
        )
    }

    @ViewBuilder
    private func totalFooter(_ list: [InsuranceContract]) -> some View {
        let wealthItems = list.filter { $0.countsTowardWealth }
        if wealthItems.count > 1 {
            HStack {
                Text(hasActiveFilter ? "Gesamt Wert (gefiltert)" : "Gesamt Wert")
                    .foregroundStyle(.secondary)
                Spacer()
                Text(fmt(wealthItems.reduce(0) { $0 + (insuranceDisplayValue($1) ?? 0) }))
                    .fontWeight(.bold)
                    .monospacedDigit()
            }
            .font(.subheadline)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(theme.background)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }

    // MARK: Abgeleitete Daten

    private func personColor(_ name: String) -> (border: Color, badgeBg: Color, badgeText: Color)? {
        guard let idx = store.insurancePersons.firstIndex(of: name) else { return nil }
        return Palette.persons[idx % Palette.persons.count]
    }

    private var providers: [String] {
        Array(Set(store.insuranceContracts.map { $0.provider }.filter { !$0.isEmpty })).sorted()
    }

    private var hasActiveFilter: Bool {
        !filterPerson.isEmpty || !filterProvider.isEmpty || filterCategory != nil
    }

    private var filtered: [InsuranceContract] {
        store.insuranceContracts.filter { c in
            if !filterPerson.isEmpty && c.person != filterPerson { return false }
            if !filterProvider.isEmpty && c.provider != filterProvider { return false }
            if let fc = filterCategory, c.categoryId != fc { return false }
            return true
        }
    }

    private func groupMonthlyPremium(_ items: [InsuranceContract]) -> Double {
        items.filter { $0.active && $0.premium > 0 }.reduce(0) { $0 + $1.monthlyPremium }
    }

    /// -1 / 0 / 1 (aufsteigend)
    private func compare(_ a: InsuranceContract, _ b: InsuranceContract) -> Int {
        switch sortBy {
        case .name:
            let va = a.name.lowercased(), vb = b.name.lowercased()
            return va < vb ? -1 : (va > vb ? 1 : 0)
        case .provider:
            let va = a.provider.lowercased(), vb = b.provider.lowercased()
            return va < vb ? -1 : (va > vb ? 1 : 0)
        case .value:
            let va = insuranceDisplayValue(a) ?? -Double.infinity
            let vb = insuranceDisplayValue(b) ?? -Double.infinity
            return va < vb ? -1 : (va > vb ? 1 : 0)
        case .premium:
            return a.premium < b.premium ? -1 : (a.premium > b.premium ? 1 : 0)
        }
    }

    /// Stabile Sortierung wie in der Web-App.
    private func sortedItems(_ list: [InsuranceContract]) -> [InsuranceContract] {
        let asc = sortAscending
        return Array(list.enumerated())
            .sorted { a, b in
                let cmp = compare(a.element, b.element)
                if cmp != 0 { return asc ? cmp < 0 : cmp > 0 }
                return a.offset < b.offset
            }
            .map { $0.element }
    }

    private func groupKey(_ c: InsuranceContract) -> String {
        switch groupBy {
        case .none: return ""
        case .person: return c.person.isEmpty ? "(Keine Person)" : c.person
        case .provider: return c.provider.isEmpty ? "(Kein Anbieter)" : c.provider
        case .category: return store.category(c.categoryId)?.name ?? "(Keine Kategorie)"
        }
    }

    private func groups(_ list: [InsuranceContract]) -> [InsuranceGroup] {
        let sorted = sortedItems(list)
        if groupBy == .none { return [InsuranceGroup(label: nil, items: sorted)] }
        var order: [String] = []
        var map: [String: [InsuranceContract]] = [:]
        for c in sorted {
            let key = groupKey(c)
            if map[key] == nil { order.append(key); map[key] = [] }
            map[key]?.append(c)
        }
        let labels = order.sorted { $0.compare($1, locale: insuranceGermanLocale) == .orderedAscending }
        return labels.map { InsuranceGroup(label: $0, items: sortedItems(map[$0] ?? [])) }
    }

    // MARK: Aktionen

    private func saveContract(_ d: InsuranceContractsDraft) {
        let existing = store.insuranceContracts.first { $0.id == d.editId }
        var valueHistory: [InsuranceValueEntry] = existing?.valueHistory ?? []

        if d.verrentungTyp != .none, let wert = d.value, !d.annuityDate.isEmpty {
            if let idx = valueHistory.firstIndex(where: { $0.date == d.annuityDate }) {
                valueHistory[idx].value = wert
                valueHistory[idx].multiplikator = d.multiplikator
                valueHistory[idx].garantierteJaehrlicheRente = d.garantierteJaehrlicheRente
            } else {
                valueHistory.append(InsuranceValueEntry(date: d.annuityDate, value: wert,
                                                        multiplikator: d.multiplikator,
                                                        garantierteJaehrlicheRente: d.garantierteJaehrlicheRente))
            }
        }

        let contract = InsuranceContract(
            id: d.editId ?? EntityID.new(),
            name: d.name,
            provider: d.provider,
            vertragsnummer: d.vertragsnummer,
            categoryId: d.categoryId,
            value: d.value,
            premium: d.premium ?? 0,
            premiumFrequency: d.premiumFrequency,
            start: d.start,
            end: d.end,
            notes: d.notes,
            comment: d.comment,
            active: d.active,
            renteNachTodesfall: d.renteNachTodesfall,
            verrentungTyp: d.verrentungTyp,
            person: d.person,
            valueHistory: valueHistory
        )

        if let editId = d.editId {
            store.insuranceContracts = store.insuranceContracts.map { $0.id == editId ? contract : $0 }
        } else {
            store.insuranceContracts.append(contract)
        }
        store.syncRecurring(for: contract)
    }

    private func removeContract(_ c: InsuranceContract) {
        store.insuranceContracts.removeAll { $0.id == c.id }
        store.removeRecurring(forInsurance: c.id)
    }

    private func updateHistory(_ contractId: EntityID, _ newHistory: [InsuranceValueEntry]) {
        guard let idx = store.insuranceContracts.firstIndex(where: { $0.id == contractId }) else { return }
        var updated = store.insuranceContracts[idx]
        updated.valueHistory = newHistory
        if let latest = newHistory.max(by: { $0.date < $1.date }) {
            updated.value = latest.value
        }
        store.insuranceContracts[idx] = updated
        store.syncRecurring(for: updated)
    }
}

// MARK: - Vertragskarte

private struct InsuranceContractsCard: View {
    let contract: InsuranceContract
    let personColor: (border: Color, badgeBg: Color, badgeText: Color)?
    let categoryName: String?
    let isOpen: Bool
    let historyOpen: Bool
    let onToggleOpen: () -> Void
    let onToggleHistory: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onHistoryChange: ([InsuranceValueEntry]) -> Void

    @Environment(\.appTheme) private var theme

    private var c: InsuranceContract { contract }
    private var annuity: Bool { c.isAnnuity }
    private var nurV: Bool { c.isOnlyAnnuity }

    private var monatlicheRente: Double? {
        guard annuity, let e = c.latestValueEntry,
              let jaehrl = insuranceContractsCalcRente(e.value, e.multiplikator, e.garantierteJaehrlicheRente)
        else { return nil }
        return jaehrl / 12
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            summary
            if isOpen {
                Divider()
                details
                if historyOpen {
                    Divider()
                    InsuranceContractsHistoryEditor(history: c.valueHistory, annuity: annuity, onChange: onHistoryChange)
                }
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .overlay(alignment: .leading) {
            if let pc = personColor {
                Rectangle().fill(pc.border).frame(width: 3)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
        .opacity(c.active ? 1 : 0.6)
    }

    // MARK: Kopfzeile

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Circle()
                    .fill(c.active ? Color.income : Color(hex: 0x9ca3af))
                    .frame(width: 8, height: 8)
                Text(c.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2)
                Spacer(minLength: 4)
                Button(action: onToggleOpen) {
                    Image(systemName: isOpen ? "chevron.down" : "chevron.right")
                        .foregroundStyle(.secondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(isOpen ? "Details ausblenden" : "Details anzeigen")
                Button(action: onEdit) {
                    Image(systemName: "pencil")
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Bearbeiten")
                Button(action: onDelete) {
                    Image(systemName: "xmark")
                        .foregroundStyle(Color.expense)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Löschen")
            }
            if hasBadges {
                ScrollView(.horizontal, showsIndicators: false) {
                    badges
                }
                .padding(.leading, 16)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(theme.background.opacity(0.6))
        .contentShape(Rectangle())
        .onTapGesture(perform: onToggleOpen)
        .contextMenu {
            Button(action: onEdit) { Label("Bearbeiten", systemImage: "pencil") }
            Button(action: onToggleOpen) {
                Label(isOpen ? "Details ausblenden" : "Details anzeigen", systemImage: "info.circle")
            }
            Divider()
            Button(role: .destructive, action: onDelete) { Label("Löschen", systemImage: "trash") }
        }
    }

    private var hasBadges: Bool {
        (!c.person.isEmpty && personColor != nil) || annuity || c.effectiveVerrentung == .nichtRelevant
            || c.renteNachTodesfall || monatlicheRente != nil || categoryName != nil
    }

    private var badges: some View {
        HStack(spacing: 6) {
            if !c.person.isEmpty, let pc = personColor {
                Badge(text: c.person, color: pc.badgeText, background: pc.badgeBg)
            }
            if annuity {
                Badge(text: nurV ? "Nur Verrentung" : "Verrentung", color: Color(hex: 0x7c3aed), background: Color(hex: 0xede9fe))
            }
            if c.effectiveVerrentung == .nichtRelevant {
                Badge(text: "Nicht relevant", color: Color.mutedText, background: Color(hex: 0xf3f4f6))
            }
            if c.renteNachTodesfall {
                Badge(text: "Rente nach Todesfall", color: Color(hex: 0xb45309), background: Color(hex: 0xfef3c7))
            }
            if let mr = monatlicheRente {
                Badge(text: "\(fmt(mr))/Monat", color: Color(hex: 0x065f46), background: Color(hex: 0xd1fae5))
            }
            if let categoryName {
                Badge(text: categoryName, color: Color(hex: 0x0369a1), background: Color(hex: 0xe0f2fe))
            }
        }
    }

    // MARK: Zusammenfassung

    private var summary: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 0, alignment: .topLeading)],
                  alignment: .leading, spacing: 0) {
            summaryCell("Vertragsnr.") {
                Text(c.vertragsnummer.isEmpty ? "–" : c.vertragsnummer)
                    .font(.subheadline.monospaced())
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            summaryCell(nurV ? "Zeitwert" : "Wert") {
                VStack(alignment: .leading, spacing: 1) {
                    Text(insuranceDisplayValue(c).map { fmt($0) } ?? "–")
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                    if !c.valueHistory.isEmpty {
                        Text("\(c.valueHistory.count) Einträge")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            summaryCell("Beitrag") { premiumText }
            summaryCell("Laufzeit") {
                Text(termText)
                    .font(.subheadline)
                    .lineLimit(1)
            }
        }
    }

    @ViewBuilder
    private var premiumText: some View {
        if c.premium > 0 {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(fmt(c.premium))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.expense)
                    .monospacedDigit()
                Text(c.premiumFrequency.shortLabel)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                if c.active {
                    Text("✓ DA")
                        .font(.caption2)
                        .foregroundStyle(Color.income)
                }
            }
        } else {
            Text("–").font(.subheadline).foregroundStyle(.secondary)
        }
    }

    private var termText: String {
        guard !c.start.isEmpty || !c.end.isEmpty else { return "–" }
        let s = c.start.count >= 10 ? fmtDate(c.start) : "–"
        let e = c.end.count >= 10 ? fmtDate(c.end) : "∞"
        return "\(s) → \(e)"
    }

    private func summaryCell<V: View>(_ title: String, @ViewBuilder content: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
    }

    // MARK: Details

    private var details: some View {
        VStack(alignment: .leading, spacing: 0) {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 0, alignment: .topLeading)],
                      alignment: .leading, spacing: 0) {
                summaryCell("Anbieter") {
                    Text(c.provider.isEmpty ? "–" : c.provider)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(theme.primary)
                        .lineLimit(1)
                }
                summaryCell("Notizen") {
                    Text(c.notes.isEmpty ? "–" : c.notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                summaryCell("Kommentar") {
                    Text(c.comment.isEmpty ? "–" : c.comment)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            HStack {
                Button(action: onToggleHistory) {
                    HStack(spacing: 4) {
                        Image(systemName: historyOpen ? "chevron.down" : "chevron.right")
                        Text(annuity ? "Zeitwerte" : "Werthistorie")
                    }
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(historyOpen ? theme.primary : Color.borderGray)
                    .foregroundStyle(historyOpen ? Color.white : Color(hex: 0x374151))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
                }
                .buttonStyle(.borderless)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .padding(.top, 2)
        }
    }
}
