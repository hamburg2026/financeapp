import SwiftUI

// Wiederverwendbare Bausteine für alle Module.

// MARK: - Eingabefelder

/// Zahlenfeld mit deutschem Dezimalkomma, gebunden an `Double?`.
struct DecimalField: View {
    let title: String
    @Binding var value: Double?
    var prompt: String = ""
    var maxDecimals: Int = 4

    @State private var text: String = ""
    @FocusState private var focused: Bool

    init(_ title: String, value: Binding<Double?>, prompt: String = "", maxDecimals: Int = 4) {
        self.title = title
        self._value = value
        self.prompt = prompt
        self.maxDecimals = maxDecimals
    }

    var body: some View {
        TextField(title, text: $text, prompt: Text(prompt.isEmpty ? title : prompt))
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .monospacedDigit()
            .focused($focused)
            .onAppear { text = editString(value, maxDecimals: maxDecimals) }
            .onChange(of: text) { _, new in
                value = parseDecimal(new)
            }
            .onChange(of: value) { _, new in
                if !focused, parseDecimal(text) != new { text = editString(new, maxDecimals: maxDecimals) }
            }
    }
}

/// Zahlenfeld, gebunden an ein nicht-optionales `Double` (leer = 0).
struct AmountField: View {
    let title: String
    @Binding var value: Double
    var maxDecimals: Int = 2

    init(_ title: String, value: Binding<Double>, maxDecimals: Int = 2) {
        self.title = title
        self._value = value
        self.maxDecimals = maxDecimals
    }

    var body: some View {
        DecimalField(title, value: Binding(get: { value == 0 ? nil : value }, set: { value = $0 ?? 0 }),
                     maxDecimals: maxDecimals)
    }
}

/// Zeile "Bezeichnung …… [Zahlenfeld]" für Formulare.
struct LabeledDecimalField: View {
    let label: String
    @Binding var value: Double?
    var suffix: String = ""
    var maxDecimals: Int = 4

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 4) {
                DecimalField(label, value: $value, maxDecimals: maxDecimals)
                if !suffix.isEmpty { Text(suffix).foregroundStyle(.secondary) }
            }
        }
    }
}

/// Datumsauswahl, gebunden an einen ISO-String "YYYY-MM-DD".
struct ISODatePicker: View {
    let title: String
    @Binding var date: ISODate

    init(_ title: String, date: Binding<ISODate>) {
        self.title = title
        self._date = date
    }

    var body: some View {
        DatePicker(title, selection: Binding(
            get: { ISODates.date(from: date) ?? Date() },
            set: { date = ISODates.string(from: $0) }
        ), displayedComponents: .date)
        .environment(\.locale, Locale(identifier: "de_DE"))
    }
}

/// Optionales Datum (leer = ""), mit Schalter zum Setzen/Entfernen.
struct OptionalISODatePicker: View {
    let title: String
    @Binding var date: ISODate

    init(_ title: String, date: Binding<ISODate>) {
        self.title = title
        self._date = date
    }

    var body: some View {
        if date.isEmpty {
            LabeledContent(title) {
                Button("Datum setzen") { date = ISODates.today() }
            }
        } else {
            HStack {
                ISODatePicker(title, date: $date)
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

/// Vorzeichen-Umschalter (+/−) wie in der Web-App.
struct SignToggle: View {
    @Binding var sign: Double   // +1 oder -1

    var body: some View {
        Button {
            sign = -sign
        } label: {
            Text(sign < 0 ? "−" : "+")
                .font(.title3.bold())
                .frame(width: 40, height: 32)
                .background(sign < 0 ? Color(hex: 0xfee2e2) : Color(hex: 0xdcfce7))
                .foregroundStyle(sign < 0 ? Color.expense : Color.income)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Anzeige

/// Kennzahl-Kachel (Dashboard, Zusammenfassungen).
struct StatTile: View {
    let title: String
    let value: String
    var subtitle: String? = nil
    var color: Color = .primary
    var systemImage: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage).foregroundStyle(.secondary) }
                Text(title).font(.caption).foregroundStyle(.secondary).textCase(.uppercase)
            }
            Text(value)
                .font(.title3.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let subtitle {
                Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.borderGray.opacity(0.6)))
    }
}

/// Karte mit Titel für Abschnitte in Übersichten.
struct Card<Content: View>: View {
    let title: String?
    var trailing: AnyView? = nil
    @ViewBuilder var content: Content

    init(_ title: String? = nil, trailing: AnyView? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.trailing = trailing
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if title != nil || trailing != nil {
                HStack {
                    if let title { Text(title).font(.headline) }
                    Spacer()
                    if let trailing { trailing }
                }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.borderGray.opacity(0.6)))
    }
}

/// Kleines farbiges Etikett (Typ, Person, Status …).
struct Badge: View {
    let text: String
    var color: Color = .mutedText
    var background: Color? = nil

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(color)
            .background(background ?? color.opacity(0.12))
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(color.opacity(0.25)))
    }
}

/// Geldbetrag, grün/rot eingefärbt.
struct MoneyText: View {
    let value: Double
    var colored: Bool = true
    var signed: Bool = false
    var bold: Bool = false

    init(_ value: Double, colored: Bool = true, signed: Bool = false, bold: Bool = false) {
        self.value = value; self.colored = colored; self.signed = signed; self.bold = bold
    }

    var body: some View {
        Text(signed ? fmtSigned(value) : fmt(value))
            .monospacedDigit()
            .fontWeight(bold ? .bold : .regular)
            .foregroundStyle(colored ? Color.signed(value) : Color.primary)
    }
}

/// Leerer Zustand ("Noch keine … angelegt").
struct EmptyStateView: View {
    let title: String
    var systemImage: String = "tray"
    var message: String? = nil

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            if let message { Text(message) }
        }
    }
}

/// Auswahl-Pillen (z. B. Zeiträume).
struct PillPicker<T: Hashable>: View {
    let options: [T]
    @Binding var selection: T
    let label: (T) -> String
    @Environment(\.appTheme) private var theme

    init(options: [T], selection: Binding<T>, label: @escaping (T) -> String) {
        self.options = options
        self._selection = selection
        self.label = label
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(options, id: \.self) { opt in
                    let active = opt == selection
                    Button {
                        selection = opt
                    } label: {
                        Text(label(opt))
                            .font(.subheadline.weight(active ? .semibold : .regular))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 5)
                            .background(active ? theme.primary : Color.clear)
                            .foregroundStyle(active ? Color.white : Color.secondary)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(active ? theme.primary : Color.borderGray))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 2)
        }
    }
}

// MARK: - Löschbestätigung

/// Bestätigungsdialog vor dem Löschen (wie `window.confirm` in der Web-App).
///
/// Verwendung:
/// ```
/// @State private var pendingDelete: BankAccount?
/// .confirmDelete(item: $pendingDelete, title: { "Konto „\($0.name)“ löschen?" }) { acc in … }
/// ```
extension View {
    func confirmDelete<Item>(item: Binding<Item?>, title: @escaping (Item) -> String,
                             message: String? = nil, perform: @escaping (Item) -> Void) -> some View {
        let isPresented = Binding<Bool>(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
        return confirmationDialog(item.wrappedValue.map(title) ?? "", isPresented: isPresented, titleVisibility: .visible) {
            Button("Löschen", role: .destructive) {
                if let v = item.wrappedValue { perform(v) }
                item.wrappedValue = nil
            }
            Button("Abbrechen", role: .cancel) { item.wrappedValue = nil }
        } message: {
            if let message { Text(message) }
        }
    }
}

// MARK: - Modul-Gerüst

/// Einheitlicher Seitenrahmen für Module (Hintergrund im Themenstil).
struct ModuleBackground: ViewModifier {
    @Environment(\.appTheme) private var theme
    func body(content: Content) -> some View {
        content
            .scrollContentBackground(.hidden)
            .background(theme.background.opacity(0.6).ignoresSafeArea())
    }
}

extension View {
    func moduleBackground() -> some View { modifier(ModuleBackground()) }
}

// MARK: - Navigation zwischen Modulen

private struct NavigateKey: EnvironmentKey {
    static let defaultValue: (AppModule) -> Void = { _ in }
}

extension EnvironmentValues {
    /// Zu einem anderen Modul wechseln (entspricht `onNavigate` in der Web-App).
    var navigate: (AppModule) -> Void {
        get { self[NavigateKey.self] }
        set { self[NavigateKey.self] = newValue }
    }
}
