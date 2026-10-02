import SwiftUI

// Gemeinsamer Werthistorie-Editor (Port von `ValueHistory` aus RealEstate.jsx / CompanyShares.jsx).
// Wird auch vom Modul Firmenbeteiligungen verwendet.

/// Bearbeitbare Liste von Stichtagswerten (`{id, date, value}`), neuester Eintrag zuerst
/// und als „aktuell“ markiert.
struct RealEstateHistoryEditor: View {
    let label: String
    let history: [HistoryEntry]
    /// Nur nicht-negative Werte zulassen (Firmenbeteiligungen: `min="0"`).
    var nonNegative: Bool = false
    let onChange: ([HistoryEntry]) -> Void

    @Environment(\.appTheme) private var theme
    @State private var adding = false
    @State private var newDate: ISODate = ISODates.today()
    @State private var newValue: Double? = nil
    @State private var pendingDelete: HistoryEntry? = nil

    init(label: String, history: [HistoryEntry], nonNegative: Bool = false,
         onChange: @escaping ([HistoryEntry]) -> Void) {
        self.label = label
        self.history = history
        self.nonNegative = nonNegative
        self.onChange = onChange
    }

    private var sorted: [HistoryEntry] { history.sortedNewestFirst }

    private var canAdd: Bool {
        guard !newDate.isEmpty, let v = newValue else { return false }
        return !nonNegative || v >= 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            if sorted.isEmpty {
                Text("Noch keine Einträge")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            ForEach(Array(sorted.enumerated()), id: \.element.id) { pair in
                entryRow(pair.element, isCurrent: pair.offset == 0)
                if pair.offset < sorted.count - 1 { Divider() }
            }
            addArea
        }
        .padding(.vertical, 4)
        .confirmDelete(item: $pendingDelete, title: { _ in "Eintrag löschen?" }) { entry in
            onChange(history.filter { $0.id != entry.id })
        }
    }

    private func entryRow(_ e: HistoryEntry, isCurrent: Bool) -> some View {
        HStack(spacing: 8) {
            Text(fmtDate(e.date))
                .font(.footnote.monospaced())
                .foregroundStyle(.secondary)
                .frame(minWidth: 90, alignment: .leading)
            Text(fmt(e.value))
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
            Spacer()
            if isCurrent {
                Badge(text: "aktuell", color: Color.income, background: Color(hex: 0xdcfce7))
            }
            Button {
                pendingDelete = e
            } label: {
                Image(systemName: "xmark").font(.caption.weight(.bold)).foregroundStyle(Color.expense)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Eintrag löschen")
        }
    }

    @ViewBuilder
    private var addArea: some View {
        if adding {
            VStack(alignment: .leading, spacing: 8) {
                ISODatePicker("Stichtag", date: $newDate)
                LabeledContent("Wert (€)") {
                    DecimalField("Wert (€)", value: $newValue, maxDecimals: 2)
                        .frame(maxWidth: 180)
                }
                HStack {
                    Button("Speichern", action: add)
                        .buttonStyle(.borderedProminent)
                        .tint(theme.primary)
                        .disabled(!canAdd)
                    Button("Abbrechen") { adding = false }
                        .buttonStyle(.bordered)
                        .tint(.gray)
                }
            }
            .padding(.top, 4)
        } else {
            Button {
                newDate = ISODates.today()
                newValue = nil
                adding = true
            } label: {
                Label("Stichtag hinzufügen", systemImage: "plus")
                    .font(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
                    .padding(.horizontal, 8)
                    .overlay(RoundedRectangle(cornerRadius: 5)
                        .stroke(style: StrokeStyle(lineWidth: 1, dash: [4]))
                        .foregroundStyle(Color.borderGray))
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.secondary)
            .padding(.top, 4)
        }
    }

    private func add() {
        guard canAdd, let v = newValue else { return }
        onChange(history + [HistoryEntry(date: newDate, value: v)])
        newValue = nil
        adding = false
    }
}

extension Array where Element == HistoryEntry {
    /// Wert des neuesten Eintrags, sonst `fallback` (wie `latestHistoryValue` der Web-App).
    func realEstateLatestValue(fallback: Double) -> Double {
        latest?.value ?? fallback
    }
}
