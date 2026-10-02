import SwiftUI

// Werthistorie / Zeitwerte je Stichtag (Port von `ValueHistory` in InsuranceContracts.jsx).

/// Jahresrente = Wert / Multiplikator × garantierte jährliche Rente (nil, wenn Multiplikator oder Rente fehlt bzw. 0 ist).
func insuranceContractsCalcRente(_ value: Double?, _ mult: Double?, _ gar: Double?) -> Double? {
    guard let value, let mult, mult != 0, let gar, gar != 0 else { return nil }
    return value / mult * gar
}

/// Zahl wie `toLocaleString('de-DE')` (max. 3 Nachkommastellen, Tausenderpunkte).
func insuranceContractsFmtPlain(_ n: Double) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.numberStyle = .decimal
    f.minimumFractionDigits = 0
    f.maximumFractionDigits = 3
    return f.string(from: NSNumber(value: n)) ?? String(n)
}

struct InsuranceContractsHistoryEditor: View {
    let history: [InsuranceValueEntry]
    let annuity: Bool
    let onChange: ([InsuranceValueEntry]) -> Void

    @Environment(\.appTheme) private var theme

    @State private var adding = false
    @State private var newDate: ISODate = ISODates.today()
    @State private var newVal: Double? = nil
    @State private var newMult: Double? = nil
    @State private var newGar: Double? = nil

    @State private var editingId: EntityID? = nil
    @State private var editDate: ISODate = ""
    @State private var editVal: Double? = nil
    @State private var editMult: Double? = nil
    @State private var editGar: Double? = nil

    @State private var pendingDelete: InsuranceValueEntry?

    private var sorted: [InsuranceValueEntry] {
        // stabile Sortierung absteigend nach Datum
        Array(history.enumerated())
            .sorted { a, b in
                if a.element.date != b.element.date { return a.element.date > b.element.date }
                return a.offset < b.offset
            }
            .map { $0.element }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(annuity ? "ZEITWERTE JE STICHTAG" : "WERTHISTORIE")
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(.secondary)

            let entries = sorted
            if entries.isEmpty && !adding {
                Text("Noch keine Einträge")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(Array(entries.enumerated()), id: \.element.id) { pair in
                entryView(pair.element, isLatest: pair.offset == 0)
                if pair.offset < entries.count - 1 { Divider() }
            }

            if adding {
                addForm
            } else {
                Button {
                    adding = true
                } label: {
                    Text("+ Stichtag hinzufügen")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .overlay(RoundedRectangle(cornerRadius: 5)
                            .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                            .foregroundStyle(Color.borderGray))
                }
                .buttonStyle(.borderless)
                .padding(.top, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.background.opacity(0.6))
        .confirmDelete(item: $pendingDelete, title: { _ in "Eintrag löschen?" }) { entry in
            onChange(history.filter { $0.id != entry.id })
        }
    }

    // MARK: Eintrag

    @ViewBuilder
    private func entryView(_ e: InsuranceValueEntry, isLatest: Bool) -> some View {
        if editingId == e.id {
            editForm(e)
        } else {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(fmtDate(e.date))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .frame(minWidth: 80, alignment: .leading)
                    Text(fmt(e.value))
                        .font(.subheadline.weight(.bold))
                        .monospacedDigit()
                    Spacer(minLength: 4)
                    if annuity, let m = e.multiplikator {
                        Text("Mult.: \(insuranceContractsFmtPlain(m))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if annuity, let g = e.garantierteJaehrlicheRente {
                        Text("Gar.: \(fmt(g))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if isLatest {
                        Badge(text: "aktuell", color: Color.income, background: Color(hex: 0xdcfce7))
                    }
                    Button {
                        startEdit(e)
                    } label: {
                        Image(systemName: "pencil")
                    }
                    .buttonStyle(.borderless)
                    Button {
                        pendingDelete = e
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(Color.expense)
                    }
                    .buttonStyle(.borderless)
                }
                if annuity, let jaehrl = insuranceContractsCalcRente(e.value, e.multiplikator, e.garantierteJaehrlicheRente) {
                    renteLine(jaehrl, long: true)
                        .padding(.leading, 88)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func renteLine(_ jaehrl: Double, long: Bool) -> some View {
        HStack(spacing: 16) {
            HStack(spacing: 4) {
                Text(long ? "Jährl. Rente:" : "Jährl.:").foregroundStyle(.secondary)
                Text(fmt(jaehrl)).fontWeight(.bold)
            }
            HStack(spacing: 4) {
                Text(long ? "Monatl. Rente:" : "Monatl.:").foregroundStyle(.secondary)
                Text(fmt(jaehrl / 12)).fontWeight(.bold)
            }
        }
        .font(.caption)
        .monospacedDigit()
    }

    // MARK: Bearbeiten

    private func editForm(_ e: InsuranceValueEntry) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            InsuranceContractsEntryFields(date: $editDate, value: $editVal, mult: $editMult, gar: $editGar, annuity: annuity)
            HStack {
                Button {
                    saveEdit(e.id)
                } label: {
                    Label("Übernehmen", systemImage: "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(editDate.isEmpty || editVal == nil)
                Button("Abbrechen") { editingId = nil }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            if annuity, let mult = editMult, mult > 0,
               let r = insuranceContractsCalcRente(editVal, editMult, editGar) {
                renteLine(r, long: false)
            }
        }
        .padding(.vertical, 4)
    }

    private func startEdit(_ e: InsuranceValueEntry) {
        editingId = e.id
        editDate = e.date
        editVal = e.value
        editMult = e.multiplikator
        editGar = e.garantierteJaehrlicheRente
    }

    private func saveEdit(_ id: EntityID) {
        guard !editDate.isEmpty, let v = editVal else { return }
        let updated: [InsuranceValueEntry] = history.map { e in
            guard e.id == id else { return e }
            var u = e
            u.date = editDate
            u.value = v
            if annuity {
                u.multiplikator = editMult
                u.garantierteJaehrlicheRente = editGar
            }
            return u
        }
        onChange(updated)
        editingId = nil
    }

    // MARK: Hinzufügen

    private var addForm: some View {
        VStack(alignment: .leading, spacing: 6) {
            InsuranceContractsEntryFields(date: $newDate, value: $newVal, mult: $newMult, gar: $newGar, annuity: annuity)
            HStack {
                Button("Speichern", action: add)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(newDate.isEmpty || newVal == nil)
                Button("Abbrechen") { adding = false }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            if annuity, let mult = newMult, mult > 0,
               let r = insuranceContractsCalcRente(newVal, newMult, newGar) {
                renteLine(r, long: false)
            }
        }
        .padding(.top, 6)
    }

    private func add() {
        guard !newDate.isEmpty, let v = newVal else { return }
        var entry = InsuranceValueEntry(date: newDate, value: v)
        if annuity {
            entry.multiplikator = newMult
            entry.garantierteJaehrlicheRente = newGar
        }
        onChange(history + [entry])
        newVal = nil
        newMult = nil
        newGar = nil
        adding = false
    }
}

/// Eingabezeile Datum / Wert / (Multiplikator / garantierte Rente).
private struct InsuranceContractsEntryFields: View {
    @Binding var date: ISODate
    @Binding var value: Double?
    @Binding var mult: Double?
    @Binding var gar: Double?
    let annuity: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ISODatePicker("Stichtag", date: $date)
                .font(.subheadline)
            fieldRow("Wert (€)", $value, decimals: 2)
            if annuity {
                fieldRow("Multiplikator", $mult, decimals: 4)
                fieldRow("Gar. jährl. Rente (€)", $gar, decimals: 2)
            }
        }
    }

    private func fieldRow(_ label: String, _ binding: Binding<Double?>, decimals: Int) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            Spacer()
            DecimalField(label, value: binding, maxDecimals: decimals)
                .frame(maxWidth: 160)
                .textFieldStyle(.roundedBorder)
        }
    }
}
