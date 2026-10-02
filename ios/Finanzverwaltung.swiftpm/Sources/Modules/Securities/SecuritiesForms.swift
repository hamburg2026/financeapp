import SwiftUI

// Formulare (Sheets) des Wertpapiermoduls.

// MARK: - Wertpapier anlegen / bearbeiten

struct SecuritiesSecurityForm: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    let existingId: EntityID?

    @State private var name: String
    @State private var symbol: String
    @State private var isin: String
    @State private var kind: SecurityKind
    @State private var currency: String

    init(existing: SecurityAsset?) {
        existingId = existing?.id
        _name = State(initialValue: existing?.name ?? "")
        _symbol = State(initialValue: existing?.symbol ?? "")
        _isin = State(initialValue: existing?.isin ?? "")
        _kind = State(initialValue: existing?.type ?? .aktie)
        _currency = State(initialValue: existing?.currency ?? "EUR")
    }

    private var isNew: Bool { existingId == nil }

    private var canSave: Bool {
        let n = name.trimmingCharacters(in: .whitespaces)
        if n.isEmpty { return false }
        if isNew && symbol.trimmingCharacters(in: .whitespaces).isEmpty { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name *", text: $name, prompt: Text("z. B. Apple Inc."))
                    LabeledContent("Ticker / Symbol *") {
                        TextField("Ticker", text: $symbol, prompt: Text("AAPL"))
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("ISIN (optional)") {
                        TextField("ISIN", text: $isin, prompt: Text("US0378331005"))
                            .textInputAutocapitalization(.characters)
                            .autocorrectionDisabled()
                            .multilineTextAlignment(.trailing)
                            .font(.body.monospaced())
                            .onChange(of: isin) { _, new in
                                if new.count > 12 { isin = String(new.prefix(12)) }
                            }
                    }
                } footer: {
                    Text("Symbolformat: US-Aktien AAPL, Deutsche Aktien DTE.DE, ETFs VWCE.DE, Krypto BTC-EUR.")
                }
                Section {
                    Picker("Typ", selection: $kind) {
                        ForEach(SecurityKind.allCases) { k in Text(k.rawValue).tag(k) }
                    }
                    Picker("Währung", selection: $currency) {
                        ForEach(supportedCurrencies, id: \.self) { c in Text(c).tag(c) }
                    }
                }
            }
            .navigationTitle(isNew ? "Wertpapier hinzufügen" : "Wertpapier bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Hinzufügen" : "Speichern") { save() }.disabled(!canSave)
                }
            }
        }
    }

    private func save() {
        let n = name.trimmingCharacters(in: .whitespaces)
        let sym = symbol.trimmingCharacters(in: .whitespaces)
        let i = isin.trimmingCharacters(in: .whitespaces)
        if let id = existingId {
            if let idx = store.securities.firstIndex(where: { $0.id == id }) {
                store.securities[idx].name = n
                store.securities[idx].symbol = sym
                store.securities[idx].isin = i
                store.securities[idx].type = kind
                store.securities[idx].currency = currency
            }
        } else {
            store.securities.append(SecurityAsset(name: n, symbol: sym, isin: i, type: kind, currency: currency))
        }
        dismiss()
    }
}

// MARK: - Kurs anlegen / bearbeiten

struct SecuritiesPriceForm: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    /// Index im gespeicherten Array (nil = neuer Kurs).
    let editIndex: Int?

    @State private var securityId: EntityID?
    @State private var date: ISODate
    @State private var value: Double?

    init(securityId: EntityID?, editIndex: Int? = nil, date: ISODate = ISODates.today(), value: Double? = nil) {
        self.editIndex = editIndex
        _securityId = State(initialValue: securityId)
        _date = State(initialValue: date)
        _value = State(initialValue: value)
    }

    private var isNew: Bool { editIndex == nil }

    private var canSave: Bool {
        guard securityId != nil, let v = value else { return false }
        return v >= 0 && !date.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if isNew {
                    Picker("Wertpapier *", selection: $securityId) {
                        ForEach(store.securities) { s in
                            Text("\(s.name) (\(s.symbol))").tag(Optional(s.id))
                        }
                    }
                } else if let s = store.security(securityId) {
                    LabeledContent("Wertpapier", value: s.name)
                }
                ISODatePicker("Datum *", date: $date)
                LabeledDecimalField(label: "Kurs *", value: $value, suffix: currencyCode, maxDecimals: 4)
            }
            .navigationTitle(isNew ? "Neuer Kurs" : "Kurs bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Kurs speichern" : "Speichern") { save() }.disabled(!canSave)
                }
            }
        }
    }

    private var currencyCode: String { store.security(securityId)?.currency ?? "" }

    private func save() {
        guard let sid = securityId, let v = value else { return }
        let key = sid.key
        var list = store.securityPrices[key] ?? []
        if let idx = editIndex {
            guard idx >= 0 && idx < list.count else { dismiss(); return }
            list[idx] = DatedValue(date: date, value: v)
        } else {
            list.append(DatedValue(date: date, value: v))
        }
        store.securityPrices[key] = SecuritiesCalc.sortedDesc(list)
        dismiss()
    }
}

// MARK: - Devisenkurs anlegen / bearbeiten

struct SecuritiesFxForm: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    let editIndex: Int?

    @State private var pair: String
    @State private var date: ISODate
    @State private var value: Double?

    init(pair: String = "USD", editIndex: Int? = nil, date: ISODate = ISODates.today(), value: Double? = nil) {
        self.editIndex = editIndex
        _pair = State(initialValue: pair)
        _date = State(initialValue: date)
        _value = State(initialValue: value)
    }

    private var isNew: Bool { editIndex == nil }

    private var canSave: Bool {
        guard let v = value else { return false }
        return v >= 0 && !date.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if isNew {
                    Picker("Währung", selection: $pair) {
                        ForEach(supportedCurrencies.filter { $0 != "EUR" }, id: \.self) { c in Text(c).tag(c) }
                    }
                } else {
                    LabeledContent("Währung", value: pair)
                }
                ISODatePicker("Datum", date: $date)
                Section {
                    LabeledDecimalField(label: "Kurs", value: $value, suffix: "EUR", maxDecimals: 6)
                } footer: {
                    Text("Kurs je 1 Fremdwährung in EUR, z. B. 0,9200")
                }
            }
            .navigationTitle(isNew ? "Devisenkurs hinzufügen" : "Devisenkurs bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Kurs hinzufügen" : "Speichern") { save() }.disabled(!canSave)
                }
            }
        }
    }

    private func save() {
        guard let v = value else { return }
        var list = store.fxRates[pair] ?? []
        if let idx = editIndex {
            guard idx >= 0 && idx < list.count else { dismiss(); return }
            list[idx] = DatedValue(date: date, value: v)
        } else {
            list.append(DatedValue(date: date, value: v))
        }
        store.fxRates[pair] = SecuritiesCalc.sortedDesc(list)
        dismiss()
    }
}

// MARK: - Depot-Transaktion anlegen / bearbeiten

enum SecuritiesPriceMode: String, CaseIterable, Identifiable {
    case price, total
    var id: String { rawValue }
    var label: String { self == .price ? "Kurs" : "Einstand" }
}

struct SecuritiesTxForm: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss

    let editId: EntityID?

    @State private var securityId: EntityID?
    @State private var depotId: EntityID?
    @State private var date: ISODate
    @State private var type: DepotTxType
    @State private var quantity: Double?
    @State private var priceMode: SecuritiesPriceMode = .price
    @State private var price: Double?
    @State private var total: Double?
    @State private var fees: Double?

    /// Neue Transaktion.
    init(securityId: EntityID?, depotId: EntityID?) {
        editId = nil
        _securityId = State(initialValue: securityId)
        _depotId = State(initialValue: depotId)
        _date = State(initialValue: ISODates.today())
        _type = State(initialValue: .buy)
        _quantity = State(initialValue: nil)
        _price = State(initialValue: nil)
        _total = State(initialValue: nil)
        _fees = State(initialValue: nil)
    }

    /// Bestehende Transaktion bearbeiten.
    init(editing t: DepotTransaction) {
        editId = t.id
        _securityId = State(initialValue: t.securityId)
        _depotId = State(initialValue: t.depotId)
        _date = State(initialValue: t.date)
        _type = State(initialValue: t.type)
        _quantity = State(initialValue: t.type.isIncome ? nil : t.quantity)
        _price = State(initialValue: t.price)
        _total = State(initialValue: t.type.isIncome ? nil : (t.quantity * t.price * 100).rounded() / 100)
        _fees = State(initialValue: t.fees == 0 ? nil : t.fees)
    }

    private var isNew: Bool { editId == nil }
    private var isIncome: Bool { type.isIncome }

    /// Aufgelöster Stückpreis (bzw. Betrag bei Erträgen) oder nil bei ungültiger Eingabe.
    private var resolvedPrice: Double? {
        if isIncome {
            guard let p = price, p >= 0 else { return nil }
            return p
        }
        if priceMode == .total {
            guard let q = quantity, q > 0, let t = total, t >= 0 else { return nil }
            return t / q
        }
        guard let p = price, p >= 0 else { return nil }
        return p
    }

    private var canSave: Bool {
        guard securityId != nil, depotId != nil, !date.isEmpty else { return false }
        if !isIncome {
            guard let q = quantity, q > 0 else { return false }
        }
        return resolvedPrice != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    if isNew {
                        Picker("Wertpapier *", selection: $securityId) {
                            ForEach(store.securities) { s in
                                Text("\(s.name) (\(s.symbol))").tag(Optional(s.id))
                            }
                        }
                    } else {
                        LabeledContent("Wertpapier", value: store.security(securityId)?.name ?? (securityId?.key ?? "–"))
                    }
                    Picker("Depot *", selection: $depotId) {
                        ForEach(store.depots) { d in Text(d.name).tag(Optional(d.id)) }
                    }
                    ISODatePicker("Datum *", date: $date)
                    Picker("Art", selection: $type) {
                        ForEach(DepotTxType.allCases) { t in Text(t.label).tag(t) }
                    }
                }
                amountSection
                Section {
                    LabeledDecimalField(label: "Gebühren", value: $fees, suffix: "€", maxDecimals: 2)
                }
                if let p = resolvedPrice {
                    Section("Gesamt") {
                        LabeledContent("Betrag", value: fmt(previewTotal(price: p)))
                    }
                }
            }
            .navigationTitle(isNew ? "Neue Wertpapiertransaktion" : "Transaktion bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isNew ? "Transaktion speichern" : "Speichern") { save() }.disabled(!canSave)
                }
            }
        }
    }

    @ViewBuilder
    private var amountSection: some View {
        if isIncome {
            Section {
                LabeledDecimalField(label: "Betrag *", value: $price, suffix: "€", maxDecimals: 4)
            }
        } else {
            Section {
                LabeledDecimalField(label: "Anzahl *", value: $quantity, maxDecimals: 4)
                Picker("Eingabe", selection: $priceMode) {
                    ForEach(SecuritiesPriceMode.allCases) { m in Text(m.label).tag(m) }
                }
                .pickerStyle(.segmented)
                if priceMode == .price {
                    LabeledDecimalField(label: "Kurs/Stk. *", value: $price, maxDecimals: 4)
                    if let q = quantity, let p = price {
                        LabeledContent("Einstandswert", value: fmt(q * p)).foregroundStyle(.secondary)
                    }
                } else {
                    LabeledDecimalField(label: "Einstandswert *", value: $total, maxDecimals: 2)
                    if let q = quantity, q > 0, let t = total {
                        LabeledContent("Kurs/Stk.", value: fmtNum(t / q, 4)).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private func previewTotal(price p: Double) -> Double {
        let f = fees ?? 0
        if isIncome { return p - f }
        let q = quantity ?? 0
        return q * p + (type == .buy ? f : -f)
    }

    private func save() {
        guard let sid = securityId, let did = depotId, let p = resolvedPrice else { return }
        let qty: Double = isIncome ? 1 : (quantity ?? 0)
        let f = fees ?? 0
        if let id = editId {
            if let idx = store.depotTransactions.firstIndex(where: { $0.id == id }) {
                store.depotTransactions[idx].date = date
                store.depotTransactions[idx].depotId = did
                store.depotTransactions[idx].type = type
                store.depotTransactions[idx].quantity = qty
                store.depotTransactions[idx].price = p
                store.depotTransactions[idx].fees = f
            }
        } else {
            store.depotTransactions.append(DepotTransaction(depotId: did, securityId: sid, type: type,
                                                            quantity: qty, price: p, fees: f, date: date))
        }
        dismiss()
    }
}
