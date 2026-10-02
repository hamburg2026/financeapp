import SwiftUI

// Port von `src/components/ServiceCostCalculator.jsx`.

/// Dienstleistungskosten: Einträge (Datum, Art, Menge × Preis, Status offen/bezahlt) mit Filtern
/// und Summen sowie Verwaltung der Dienstleistungsarten (Einheit, Standardpreis).
struct ServiceCostsView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.appTheme) private var theme
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var tab: ServiceCostsTab = .entries

    // Filter
    @State private var filterType: EntityID?
    @State private var filterFrom: ISODate = ""
    @State private var filterTo: ISODate = ""
    @State private var filterStatus: ServiceStatus?

    @State private var entryEditor: ServiceCostsEntryTarget?
    @State private var typeEditor: ServiceCostsTypeTarget?
    @State private var pendingEntryDelete: ServiceEntry?
    @State private var pendingTypeDelete: ServiceType?
    @State private var selection = Set<EntityID>()

    var body: some View {
        VStack(spacing: 0) {
            Picker("Ansicht", selection: $tab) {
                ForEach(ServiceCostsTab.allCases) { t in
                    Text(t.label).tag(t)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            switch tab {
            case .entries: entriesTab
            case .types: typesTab
            }
        }
        .navigationTitle("Dienstleistungskosten")
        .toolbar { toolbarContent }
        .sheet(item: $entryEditor) { target in
            ServiceCostsEntrySheet(target: target) { result in saveEntry(result) }
                .environmentObject(store)
                .environment(\.appTheme, theme)
                .tint(theme.primary)
        }
        .sheet(item: $typeEditor) { target in
            ServiceCostsTypeSheet(target: target) { type in
                saveType(type)
                typeEditor = nil
            }
            .environment(\.appTheme, theme)
            .tint(theme.primary)
        }
        .moduleBackground()
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            if tab == .entries {
                Button(action: openAddEntry) {
                    Label("Eintrag", systemImage: "plus")
                        .labelStyle(.titleAndIcon)
                }
            } else {
                Button {
                    typeEditor = ServiceCostsTypeTarget(editingID: nil, name: "", unit: "Stück", defaultPrice: nil, fromEntry: false)
                } label: {
                    Label("Dienstleistung", systemImage: "plus")
                        .labelStyle(.titleAndIcon)
                }
            }
        }
    }

    // MARK: - Daten

    private var filtered: [ServiceEntry] {
        store.serviceEntries
            .filter { e in
                if let t = filterType, e.serviceTypeId != t { return false }
                if !filterFrom.isEmpty && e.date < filterFrom { return false }
                if !filterTo.isEmpty && e.date > filterTo { return false }
                if let s = filterStatus, e.status != s { return false }
                return true
            }
            .sorted { $0.date > $1.date }
    }

    private var hasFilter: Bool {
        filterType != nil || !filterFrom.isEmpty || !filterTo.isEmpty || filterStatus != nil
    }

    private func typeName(_ id: EntityID) -> String { store.serviceType(id)?.name ?? "–" }
    private func typeUnit(_ id: EntityID) -> String { store.serviceType(id)?.unit ?? "" }

    // MARK: - Tab: Einträge

    private var entriesTab: some View {
        let list = filtered
        let total = list.reduce(0) { $0 + $1.total }
        return VStack(alignment: .leading, spacing: 8) {
            filterBar
                .padding(.horizontal)
            if !list.isEmpty {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Spacer()
                    Text("\(list.count) Einträge · Gesamt:")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Text(fmt(total))
                        .font(.headline)
                        .monospacedDigit()
                        .foregroundStyle(theme.primary)
                }
                .padding(.horizontal)
            }
            entriesContent(list, total: total)
        }
        .confirmDelete(item: $pendingEntryDelete, title: { _ in "Eintrag löschen?" }) { e in
            store.serviceEntries.removeAll { $0.id == e.id }
            selection.remove(e.id)
        }
    }

    @ViewBuilder
    private func entriesContent(_ list: [ServiceEntry], total: Double) -> some View {
        if list.isEmpty {
            ContentUnavailableView {
                Label("Keine Einträge", systemImage: "list.bullet.rectangle")
            } description: {
                Text(store.serviceEntries.isEmpty
                     ? "Noch keine Einträge. Klicken Sie auf \"+ Eintrag\" um zu beginnen."
                     : "Keine Einträge für den gewählten Filter.")
            }
            .frame(maxHeight: .infinity)
        } else if sizeClass == .compact {
            compactList(list, total: total)
        } else {
            VStack(spacing: 0) {
                entriesTable(list)
                Divider()
                HStack {
                    Text("Gesamt (\(list.count) Einträge)")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(fmt(total))
                        .fontWeight(.bold)
                        .monospacedDigit()
                        .foregroundStyle(theme.primary)
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
                .background(Color(.secondarySystemGroupedBackground))
            }
        }
    }

    private var filterBar: some View {
        let layout: AnyLayout = sizeClass == .compact
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .bottom, spacing: 16))
        return layout {
            ServiceCostsFilterField(label: "Dienstleistung") {
                Picker("Dienstleistung", selection: $filterType) {
                    Text("Alle").tag(EntityID?.none)
                    ForEach(store.serviceTypes) { t in
                        Text(t.name).tag(EntityID?.some(t.id))
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
            ServiceCostsFilterField(label: "Von") {
                ServiceCostsOptionalDate(date: $filterFrom)
            }
            ServiceCostsFilterField(label: "Bis") {
                ServiceCostsOptionalDate(date: $filterTo)
            }
            ServiceCostsFilterField(label: "Status") {
                Picker("Status", selection: $filterStatus) {
                    Text("Alle").tag(ServiceStatus?.none)
                    Text("offen").tag(ServiceStatus?.some(.offen))
                    Text("bezahlt").tag(ServiceStatus?.some(.bezahlt))
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
            if hasFilter {
                Button("Zurücksetzen") {
                    filterType = nil
                    filterFrom = ""
                    filterTo = ""
                    filterStatus = nil
                }
                .buttonStyle(.bordered)
                .tint(Color.expense)
                .font(.footnote)
            }
            if sizeClass != .compact { Spacer(minLength: 0) }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
    }

    // MARK: Tabelle (iPad)

    private func entriesTable(_ list: [ServiceEntry]) -> some View {
        Table(list, selection: $selection) {
            TableColumn("Datum") { (e: ServiceEntry) in
                Text(fmtDate(e.date)).monospacedDigit()
            }
            .width(min: 80, ideal: 95)
            TableColumn("Art der Dienstleistung") { (e: ServiceEntry) in
                Text(typeName(e.serviceTypeId)).fontWeight(.medium)
            }
            .width(min: 120, ideal: 180)
            TableColumn("Einheit") { (e: ServiceEntry) in
                Text(typeUnit(e.serviceTypeId)).font(.caption).foregroundStyle(.secondary)
            }
            .width(min: 50, ideal: 70)
            TableColumn("Menge") { (e: ServiceEntry) in
                ServiceCostsTrailingText(text: fmtNum(e.quantity, 2))
            }
            .width(min: 60, ideal: 75)
            TableColumn("Preis/Einheit") { (e: ServiceEntry) in
                ServiceCostsTrailingText(text: fmt(e.pricePerUnit))
            }
            .width(min: 80, ideal: 100)
            TableColumn("Summe") { (e: ServiceEntry) in
                ServiceCostsTrailingText(text: fmt(e.total), bold: true)
            }
            .width(min: 80, ideal: 105)
            TableColumn("Notizen") { (e: ServiceEntry) in
                Text(e.notes.isEmpty ? "–" : e.notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .width(min: 80, ideal: 140)
            TableColumn("Status") { (e: ServiceEntry) in
                ServiceCostsStatusBadge(status: e.status)
            }
            .width(min: 70, ideal: 80)
            TableColumn("") { (e: ServiceEntry) in
                entryActionButtons(e)
            }
            .width(min: 64, ideal: 70)
        }
        .contextMenu(forSelectionType: EntityID.self) { ids in
            if ids.count == 1, let id = ids.first, let e = store.serviceEntries.first(where: { $0.id == id }) {
                Button { openEditEntry(e) } label: { Label("Bearbeiten", systemImage: "pencil") }
                Button { toggleStatus(e) } label: {
                    Label(e.status == .offen ? "Als bezahlt markieren" : "Als offen markieren",
                          systemImage: e.status == .offen ? "checkmark.circle" : "circle")
                }
                Button(role: .destructive) { pendingEntryDelete = e } label: { Label("Löschen", systemImage: "trash") }
            }
        } primaryAction: { ids in
            if ids.count == 1, let id = ids.first, let e = store.serviceEntries.first(where: { $0.id == id }) {
                openEditEntry(e)
            }
        }
    }

    private func entryActionButtons(_ e: ServiceEntry) -> some View {
        HStack(spacing: 6) {
            Button {
                openEditEntry(e)
            } label: {
                Image(systemName: "pencil")
                    .font(.caption.weight(.bold))
                    .frame(width: 24, height: 22)
                    .background(Color(hex: 0xe5e7eb))
                    .foregroundStyle(Color(hex: 0x374151))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .accessibilityLabel("Bearbeiten")
            Button {
                pendingEntryDelete = e
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.expense)
            }
            .accessibilityLabel("Löschen")
        }
        .buttonStyle(.borderless)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    // MARK: Liste (iPhone)

    private func compactList(_ list: [ServiceEntry], total: Double) -> some View {
        List {
            Section {
                ForEach(list) { e in
                    ServiceCostsEntryRow(entry: e, typeName: typeName(e.serviceTypeId), unit: typeUnit(e.serviceTypeId))
                        .contentShape(Rectangle())
                        .onTapGesture { openEditEntry(e) }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) { pendingEntryDelete = e } label: { Label("Löschen", systemImage: "trash") }
                            Button { openEditEntry(e) } label: { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
                        }
                        .swipeActions(edge: .leading) {
                            Button { toggleStatus(e) } label: {
                                Label(e.status == .offen ? "bezahlt" : "offen",
                                      systemImage: e.status == .offen ? "checkmark.circle" : "circle")
                            }
                            .tint(e.status == .offen ? Color.income : Color.warning)
                        }
                        .contextMenu {
                            Button { openEditEntry(e) } label: { Label("Bearbeiten", systemImage: "pencil") }
                            Button(role: .destructive) { pendingEntryDelete = e } label: { Label("Löschen", systemImage: "trash") }
                        }
                }
            } footer: {
                HStack {
                    Text("Gesamt (\(list.count) Einträge)")
                    Spacer()
                    Text(fmt(total)).fontWeight(.bold).monospacedDigit().foregroundStyle(theme.primary)
                }
                .font(.footnote)
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Tab: Dienstleistungen verwalten

    private var typesTab: some View {
        List {
            Section {
                Text("Hier können Sie eigene Dienstleistungsarten mit Einheit und Standardpreis definieren. Diese stehen dann beim Erfassen von Einträgen zur Auswahl.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
            }
            Section {
                if store.serviceTypes.isEmpty {
                    Text("Noch keine Dienstleistungsarten definiert. Klicken Sie auf \"+ Dienstleistung\".")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 20)
                } else {
                    ForEach(store.serviceTypes) { t in
                        typeRow(t)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .confirmDelete(item: $pendingTypeDelete, title: { t in "Dienstleistungsart „\(t.name)“ löschen?" }) { t in
            store.serviceTypes.removeAll { $0.id == t.id }
        }
    }

    private func typeRow(_ t: ServiceType) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t.name).fontWeight(.semibold)
                Text("Einheit: \(t.unit)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(fmt(t.defaultPrice)) / \(t.unit)")
                .fontWeight(.semibold)
                .monospacedDigit()
                .foregroundStyle(theme.primary)
            Button {
                openEditType(t)
            } label: {
                Image(systemName: "pencil")
                    .font(.caption.weight(.bold))
                    .frame(width: 26, height: 24)
                    .background(Color(hex: 0xe5e7eb))
                    .foregroundStyle(Color(hex: 0x374151))
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Bearbeiten")
            Button {
                pendingTypeDelete = t
            } label: {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.expense)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Löschen")
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) { pendingTypeDelete = t } label: { Label("Löschen", systemImage: "trash") }
            Button { openEditType(t) } label: { Label("Bearbeiten", systemImage: "pencil") }.tint(.gray)
        }
        .contextMenu {
            Button { openEditType(t) } label: { Label("Bearbeiten", systemImage: "pencil") }
            Button(role: .destructive) { pendingTypeDelete = t } label: { Label("Löschen", systemImage: "trash") }
        }
    }

    // MARK: - Aktionen

    private func openAddEntry() {
        entryEditor = ServiceCostsEntryTarget(editingID: nil, date: ISODates.today(), serviceTypeId: nil,
                                              quantity: nil, pricePerUnit: nil, notes: "", status: .offen)
    }

    private func openEditEntry(_ e: ServiceEntry) {
        entryEditor = ServiceCostsEntryTarget(editingID: e.id, date: e.date, serviceTypeId: e.serviceTypeId,
                                              quantity: e.quantity, pricePerUnit: e.pricePerUnit,
                                              notes: e.notes, status: e.status)
    }

    private func saveEntry(_ t: ServiceCostsEntryTarget) {
        guard let typeId = t.serviceTypeId else { return }
        let entry = ServiceEntry(id: t.editingID ?? .new(), date: t.date, serviceTypeId: typeId,
                                 quantity: t.quantity ?? 0, pricePerUnit: t.pricePerUnit ?? 0,
                                 notes: t.notes, status: t.status)
        if let idx = store.serviceEntries.firstIndex(where: { $0.id == entry.id }) {
            store.serviceEntries[idx] = entry
        } else {
            store.serviceEntries.append(entry)
        }
        entryEditor = nil
    }

    private func toggleStatus(_ e: ServiceEntry) {
        guard let idx = store.serviceEntries.firstIndex(where: { $0.id == e.id }) else { return }
        store.serviceEntries[idx].status = e.status == .offen ? .bezahlt : .offen
    }

    private func openEditType(_ t: ServiceType) {
        typeEditor = ServiceCostsTypeTarget(editingID: t.id, name: t.name, unit: t.unit,
                                            defaultPrice: t.defaultPrice, fromEntry: false)
    }

    private func saveType(_ type: ServiceType) {
        if let idx = store.serviceTypes.firstIndex(where: { $0.id == type.id }) {
            store.serviceTypes[idx] = type
        } else {
            store.serviceTypes.append(type)
        }
    }
}

// MARK: - Hilfstypen

private enum ServiceCostsTab: String, CaseIterable, Identifiable {
    case entries, types
    var id: String { rawValue }
    var label: String {
        switch self {
        case .entries: return "Einträge"
        case .types: return "Dienstleistungen verwalten"
        }
    }
}

private struct ServiceCostsFilterField<Content: View>: View {
    let label: String
    let content: Content

    init(label: String, @ViewBuilder content: () -> Content) {
        self.label = label
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption.weight(.medium)).foregroundStyle(.secondary)
            content
        }
    }
}

/// Kompakte optionale Datumsauswahl für die Filterleiste ("" = kein Filter).
private struct ServiceCostsOptionalDate: View {
    @Binding var date: ISODate

    var body: some View {
        if date.isEmpty {
            Button("Datum wählen") { date = ISODates.today() }
                .buttonStyle(.bordered)
                .font(.subheadline)
        } else {
            HStack(spacing: 4) {
                DatePicker("", selection: Binding(
                    get: { ISODates.date(from: date) ?? Date() },
                    set: { date = ISODates.string(from: $0) }
                ), displayedComponents: .date)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "de_DE"))
                Button {
                    date = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
            }
        }
    }
}

private struct ServiceCostsTrailingText: View {
    let text: String
    var bold: Bool = false

    var body: some View {
        Text(text)
            .fontWeight(bold ? .semibold : .regular)
            .monospacedDigit()
            .frame(maxWidth: .infinity, alignment: .trailing)
    }
}

private struct ServiceCostsStatusBadge: View {
    let status: ServiceStatus

    var body: some View {
        let paid = status == .bezahlt
        Text(paid ? "bezahlt" : "offen")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(paid ? Color(hex: 0xdcfce7) : Color(hex: 0xfef3c7))
            .foregroundStyle(paid ? Color.income : Color.warning)
            .clipShape(Capsule())
    }
}

private struct ServiceCostsEntryRow: View {
    let entry: ServiceEntry
    let typeName: String
    let unit: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(typeName).fontWeight(.medium)
                Spacer()
                Text(fmt(entry.total)).fontWeight(.semibold).monospacedDigit()
            }
            HStack(spacing: 6) {
                Text(fmtDate(entry.date)).monospacedDigit()
                Text("·")
                Text("\(fmtNum(entry.quantity, 2)) \(unit) × \(fmt(entry.pricePerUnit))").monospacedDigit()
                Spacer()
                ServiceCostsStatusBadge(status: entry.status)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            if !entry.notes.isEmpty {
                Text(entry.notes).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Eintrag-Formular

private struct ServiceCostsEntryTarget: Identifiable {
    let id = UUID()
    var editingID: EntityID?
    var date: ISODate
    var serviceTypeId: EntityID?
    var quantity: Double?
    var pricePerUnit: Double?
    var notes: String
    var status: ServiceStatus
}

private struct ServiceCostsEntrySheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTheme) private var theme

    @State private var target: ServiceCostsEntryTarget
    @State private var newType: ServiceCostsTypeTarget?
    let onSave: (ServiceCostsEntryTarget) -> Void

    init(target: ServiceCostsEntryTarget, onSave: @escaping (ServiceCostsEntryTarget) -> Void) {
        self._target = State(initialValue: target)
        self.onSave = onSave
    }

    private var isEditing: Bool { target.editingID != nil }

    private var selectedUnit: String { store.serviceType(target.serviceTypeId)?.unit ?? "" }

    private var computedTotal: Double { (target.quantity ?? 0) * (target.pricePerUnit ?? 0) }

    private var canSave: Bool {
        guard !target.date.isEmpty, target.serviceTypeId != nil,
              let q = target.quantity, let p = target.pricePerUnit else { return false }
        return q >= 0 && p >= 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ISODatePicker("Datum *", date: $target.date)
                    typePickerRow
                }
                Section {
                    LabeledContent(selectedUnit.isEmpty ? "Menge *" : "Menge (\(selectedUnit)) *") {
                        DecimalField("Menge", value: $target.quantity, prompt: "1", maxDecimals: 2)
                    }
                    LabeledContent("Preis je Einheit (€) *") {
                        DecimalField("Preis", value: $target.pricePerUnit, prompt: "0,00", maxDecimals: 2)
                    }
                    LabeledContent("Berechnete Summe:") {
                        Text(fmt(computedTotal))
                            .font(.title3.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(theme.primary)
                    }
                }
                Section {
                    Picker("Status *", selection: $target.status) {
                        Text("offen").tag(ServiceStatus.offen)
                        Text("bezahlt").tag(ServiceStatus.bezahlt)
                    }
                    .pickerStyle(.segmented)
                    TextField("Optionale Notizen...", text: $target.notes)
                } header: {
                    Text("Status & Notizen")
                }
            }
            .navigationTitle(isEditing ? "Eintrag bearbeiten" : "Neuer Eintrag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Änderungen speichern" : "Eintrag hinzufügen") { onSave(target) }
                        .disabled(!canSave)
                }
            }
            .onChange(of: target.serviceTypeId) { _, newID in
                // Beim Wechsel der Art den Standardpreis übernehmen
                if let t = store.serviceType(newID) { target.pricePerUnit = t.defaultPrice }
            }
            .sheet(item: $newType) { t in
                ServiceCostsTypeSheet(target: t) { type in
                    store.serviceTypes.append(type)
                    target.serviceTypeId = type.id
                    target.pricePerUnit = type.defaultPrice
                    newType = nil
                }
                .environment(\.appTheme, theme)
                .tint(theme.primary)
            }
        }
    }

    private var typePickerRow: some View {
        HStack(spacing: 8) {
            Picker("Art der Dienstleistung *", selection: $target.serviceTypeId) {
                Text("– bitte wählen –").tag(EntityID?.none)
                ForEach(store.serviceTypes) { t in
                    Text(t.name).tag(EntityID?.some(t.id))
                }
            }
            Button {
                newType = ServiceCostsTypeTarget(editingID: nil, name: "", unit: "Stück", defaultPrice: nil, fromEntry: true)
            } label: {
                Image(systemName: "plus")
                    .font(.subheadline.weight(.bold))
                    .frame(width: 28, height: 26)
                    .background(theme.primary)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 5))
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Neue Dienstleistungsart anlegen")
        }
    }
}

// MARK: - Dienstleistungsart-Formular

private struct ServiceCostsTypeTarget: Identifiable {
    let id = UUID()
    var editingID: EntityID?
    var name: String
    var unit: String
    var defaultPrice: Double?
    /// Aus dem Eintragsformular heraus angelegt → wird danach automatisch ausgewählt.
    var fromEntry: Bool
}

private struct ServiceCostsTypeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var target: ServiceCostsTypeTarget
    let onSave: (ServiceType) -> Void

    init(target: ServiceCostsTypeTarget, onSave: @escaping (ServiceType) -> Void) {
        self._target = State(initialValue: target)
        self.onSave = onSave
    }

    private var isEditing: Bool { target.editingID != nil }

    private var canSave: Bool {
        !target.name.trimmingCharacters(in: .whitespaces).isEmpty
            && !target.unit.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Bezeichnung *") {
                    TextField("z. B. Fenster putzen", text: $target.name)
                }
                Section {
                    LabeledContent("Einheit *") {
                        HStack(spacing: 6) {
                            TextField("z. B. Stück", text: $target.unit)
                                .multilineTextAlignment(.trailing)
                            Menu {
                                ForEach(ServiceType.unitSuggestions, id: \.self) { u in
                                    Button(u) { target.unit = u }
                                }
                            } label: {
                                Image(systemName: "chevron.down.circle")
                            }
                            .accessibilityLabel("Einheit vorschlagen")
                        }
                    }
                    LabeledContent("Standardpreis (€)") {
                        DecimalField("Standardpreis", value: $target.defaultPrice, prompt: "0,00", maxDecimals: 2)
                    }
                } footer: {
                    if !isEditing && target.fromEntry {
                        Text("Nach dem Speichern wird die neue Art automatisch im Eintrag ausgewählt.").italic()
                    }
                }
            }
            .navigationTitle(isEditing ? "Dienstleistung bearbeiten" : "Neue Dienstleistungsart")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Änderungen speichern" : "Dienstleistung anlegen") {
                        onSave(ServiceType(id: target.editingID ?? .new(), name: target.name,
                                           unit: target.unit, defaultPrice: target.defaultPrice ?? 0))
                    }
                    .disabled(!canSave)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
