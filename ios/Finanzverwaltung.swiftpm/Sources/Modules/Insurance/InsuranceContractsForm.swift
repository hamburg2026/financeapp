import SwiftUI

// Formular "Neuer Vertrag" / "Vertrag bearbeiten" (Port des Modals aus InsuranceContracts.jsx).

struct InsuranceContractsDraft: Identifiable {
    let id = UUID()
    /// nil = neuer Vertrag
    var editId: EntityID?
    var name: String = ""
    var provider: String = ""
    var vertragsnummer: String = ""
    var categoryId: EntityID? = nil
    var value: Double? = nil
    var premium: Double? = nil
    var premiumFrequency: Frequency = .monthly
    var start: ISODate = ""
    var end: ISODate = ""
    var notes: String = ""
    var comment: String = ""
    var active: Bool = true
    var renteNachTodesfall: Bool = false
    var verrentungTyp: VerrentungTyp = .none
    var person: String = ""
    var annuityDate: ISODate = ISODates.today()
    var multiplikator: Double? = nil
    var garantierteJaehrlicheRente: Double? = nil

    init() {}

    /// Entspricht `startEdit(c)` der Web-App.
    init(editing c: InsuranceContract) {
        let latestE: InsuranceValueEntry? = c.isAnnuity ? c.latestValueEntry : nil
        editId = c.id
        name = c.name
        provider = c.provider
        vertragsnummer = c.vertragsnummer
        categoryId = c.categoryId
        value = latestE?.value ?? c.value
        premium = c.premium != 0 ? c.premium : nil
        premiumFrequency = c.premiumFrequency
        start = c.start
        end = c.end
        notes = c.notes
        comment = c.comment
        active = c.active
        renteNachTodesfall = c.renteNachTodesfall
        verrentungTyp = c.effectiveVerrentung
        person = c.person
        annuityDate = latestE?.date ?? ISODates.today()
        multiplikator = latestE?.multiplikator
        garantierteJaehrlicheRente = latestE?.garantierteJaehrlicheRente
    }

    var isEditing: Bool { editId != nil }
    var isValid: Bool { !name.isEmpty }
    /// Verrentungsblock (Stichtag, Multiplikator, Rente) anzeigen
    var showsAnnuityBlock: Bool { verrentungTyp != .none && verrentungTyp != .nichtRelevant }
}

private func insuranceContractsVerrentungLabel(_ t: VerrentungTyp) -> String {
    switch t {
    case .none: return "– keine –"
    case .verrentung: return "Verrentung (Vermögenswert)"
    case .nurVerrentung: return "Nur Verrentung (kein Vermögenswert)"
    case .nichtRelevant: return "Nicht relevant (kein Vermögenswert)"
    }
}

private let insuranceContractsPurple = Color(hex: 0x7c3aed)

struct InsuranceContractsFormSheet: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    @State private var draft: InsuranceContractsDraft
    @State private var showAddPerson = false
    @State private var newPersonInput = ""
    let onSave: (InsuranceContractsDraft) -> Void

    init(draft: InsuranceContractsDraft, onSave: @escaping (InsuranceContractsDraft) -> Void) {
        self._draft = State(initialValue: draft)
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                contractSection
                categorySection
                personSection
                valueSection
                premiumSection
                termSection
                notesSection
            }
            .navigationTitle(draft.isEditing ? "Vertrag bearbeiten" : "Neuer Vertrag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(draft.isEditing ? "Änderungen speichern" : "Vertrag hinzufügen") {
                        onSave(draft)
                        dismiss()
                    }
                    .disabled(!draft.isValid)
                }
            }
        }
    }

    // MARK: Abschnitte

    private var contractSection: some View {
        Section("Vertrag") {
            TextField("Vertragsname *", text: $draft.name, prompt: Text("Vertragsname * (z. B. Haftpflicht)"))
            TextField("Anbieter", text: $draft.provider, prompt: Text("Anbieter (z. B. Allianz)"))
            TextField("Vertragsnummer", text: $draft.vertragsnummer, prompt: Text("Vertragsnummer (z. B. VN-123456)"))
        }
    }

    private var categorySection: some View {
        Section {
            LabeledContent("Kategorie") {
                CategoryPicker(selection: $draft.categoryId, placeholder: "– keine –", typeFilter: .expense)
            }
            Toggle("Aktiv (erzeugt Dauerauftrag)", isOn: $draft.active)
        }
    }

    private var personSection: some View {
        Section {
            HStack {
                Picker("Person", selection: $draft.person) {
                    Text("– keine –").tag("")
                    ForEach(store.insurancePersons, id: \.self) { p in
                        Text(p).tag(p)
                    }
                    if !draft.person.isEmpty && !store.insurancePersons.contains(draft.person) {
                        Text(draft.person).tag(draft.person)
                    }
                }
                Button {
                    showAddPerson.toggle()
                } label: {
                    Image(systemName: showAddPerson ? "plus.circle.fill" : "plus.circle")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Person hinzufügen")
            }
            if showAddPerson {
                HStack {
                    TextField("Neuer Name…", text: $newPersonInput)
                        .onSubmit(addPerson)
                        .submitLabel(.done)
                    Button("OK", action: addPerson)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                    Button {
                        newPersonInput = ""
                        showAddPerson = false
                    } label: {
                        Image(systemName: "xmark")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            Picker("Verrentung / Relevanz", selection: $draft.verrentungTyp) {
                ForEach(VerrentungTyp.allCases) { t in
                    Text(insuranceContractsVerrentungLabel(t)).tag(t)
                }
            }
            Toggle("Rente nach Todesfall", isOn: $draft.renteNachTodesfall)
        }
    }

    @ViewBuilder
    private var valueSection: some View {
        if draft.showsAnnuityBlock {
            Section {
                OptionalISODatePicker("Stichtag", date: $draft.annuityDate)
                LabeledDecimalField(label: "Wert (€)", value: $draft.value, maxDecimals: 2)
                LabeledDecimalField(label: "Multiplikator", value: $draft.multiplikator)
                LabeledDecimalField(label: "Garantierte jährliche Rente (€)", value: $draft.garantierteJaehrlicheRente, maxDecimals: 2)
                if let mult = draft.multiplikator, mult > 0,
                   let v = draft.value, let g = draft.garantierteJaehrlicheRente {
                    pensionPreview(v / mult * g)
                }
            } header: {
                Text("Verrentungswert je Stichtag")
                    .foregroundStyle(insuranceContractsPurple)
            }
        } else {
            Section {
                LabeledDecimalField(label: "Aktueller Wert (€) – optional", value: $draft.value, maxDecimals: 2)
            }
        }
    }

    private func pensionPreview(_ jaehrl: Double) -> some View {
        HStack(spacing: 20) {
            HStack(spacing: 4) {
                Text("Jährliche Rente:").foregroundStyle(.secondary)
                Text(fmt(jaehrl)).fontWeight(.bold).foregroundStyle(insuranceContractsPurple)
            }
            HStack(spacing: 4) {
                Text("Monatliche Rente:").foregroundStyle(.secondary)
                Text(fmt(jaehrl / 12)).fontWeight(.bold).foregroundStyle(insuranceContractsPurple)
            }
        }
        .font(.subheadline)
        .monospacedDigit()
        .listRowBackground(Color(hex: 0xede9fe))
    }

    private var premiumSection: some View {
        Section("Beitrag") {
            LabeledDecimalField(label: "Betrag (€)", value: $draft.premium, maxDecimals: 2)
            Picker("Periodizität", selection: $draft.premiumFrequency) {
                ForEach(Frequency.allCases) { f in
                    Text(f.label).tag(f)
                }
            }
            if draft.active && (draft.premium ?? 0) > 0 {
                Text("Wird als Dauerauftrag „\(draft.name.isEmpty ? "…" : draft.name)“ angelegt")
                    .font(.caption)
                    .foregroundStyle(Color.income)
                    .listRowBackground(Color(hex: 0xdcfce7))
            }
        }
    }

    private var termSection: some View {
        Section("Laufzeit") {
            OptionalISODatePicker("Vertragsbeginn", date: $draft.start)
            OptionalISODatePicker("Vertragsende", date: $draft.end)
        }
    }

    private var notesSection: some View {
        Section {
            TextField("Notizen", text: $draft.notes, prompt: Text("Allgemeine Notizen zum Vertrag…"), axis: .vertical)
                .lineLimit(2...6)
            TextField("Kommentar", text: $draft.comment, prompt: Text("Weitere Anmerkungen, Bedingungen, Kontakte…"), axis: .vertical)
                .lineLimit(2...6)
        } header: {
            Text("Notizen / Kommentar")
        }
    }

    // MARK: Aktionen

    private func addPerson() {
        let n = newPersonInput.trimmingCharacters(in: .whitespaces)
        if !n.isEmpty && !store.insurancePersons.contains(n) {
            store.insurancePersons.append(n)
            draft.person = n
        }
        newPersonInput = ""
        showAddPerson = false
    }
}
