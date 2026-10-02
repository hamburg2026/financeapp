import Foundation

// Datenmodelle – 1:1 kompatibel zum JSON-Format der Web-App (localStorage / Sicherungsdatei).
// Datumswerte werden wie in der Web-App als ISO-Strings "YYYY-MM-DD" gespeichert ("" = leer).

typealias ISODate = String

// MARK: - Gemeinsame Typen

enum Frequency: String, Codable, CaseIterable, Identifiable, Sendable {
    case monthly, quarterly, halfyearly, yearly

    var id: String { rawValue }

    /// "Monatlich", "Vierteljährlich", …
    var label: String {
        switch self {
        case .monthly: return "Monatlich"
        case .quarterly: return "Vierteljährlich"
        case .halfyearly: return "Halbjährlich"
        case .yearly: return "Jährlich"
        }
    }

    /// "mtl.", "quartl.", …
    var shortLabel: String {
        switch self {
        case .monthly: return "mtl."
        case .quarterly: return "quartl."
        case .halfyearly: return "halbj."
        case .yearly: return "jährl."
        }
    }

    var sortOrder: Int { Frequency.allCases.firstIndex(of: self) ?? 0 }

    /// Umrechnungsfaktor auf einen Monat (monthly 1, quarterly 1/3, …).
    var monthlyFactor: Double {
        switch self {
        case .monthly: return 1
        case .quarterly: return 1.0 / 3
        case .halfyearly: return 1.0 / 6
        case .yearly: return 1.0 / 12
        }
    }

    var quarterlyFactor: Double { monthlyFactor * 3 }
    var yearlyFactor: Double { monthlyFactor * 12 }

    static func from(_ raw: String?) -> Frequency { Frequency(rawValue: raw ?? "") ?? .monthly }
}

enum CategoryType: String, Codable, CaseIterable, Identifiable, Sendable {
    case expense = "Ausgabe"
    case income = "Einnahme"
    var id: String { rawValue }
    var label: String { rawValue }
    static func from(_ raw: String?) -> CategoryType { CategoryType(rawValue: raw ?? "") ?? .expense }
}

/// Eintrag einer Wertehistorie (`{id, date, value}`).
struct HistoryEntry: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var date: ISODate
    var value: Double

    init(id: EntityID = .new(), date: ISODate, value: Double) {
        self.id = id; self.date = date; self.value = value
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        date = c.string("date")
        value = c.double("value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(date, "date"); try c.put(value, "value")
    }
}

/// Kurs-/Saldo-Eintrag ohne ID (`{date, value}`) – securityPrices, fxRates, balanceHistory.
struct DatedValue: Codable, Hashable, Sendable {
    var date: ISODate
    var value: Double

    init(date: ISODate, value: Double) { self.date = date; self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        date = c.string("date")
        value = c.double("value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(date, "date"); try c.put(value, "value")
    }
}

extension Array where Element == HistoryEntry {
    /// Neuester Eintrag (nach Datum).
    var latest: HistoryEntry? { self.max { $0.date < $1.date } }
    var sortedNewestFirst: [HistoryEntry] { sorted { $0.date > $1.date } }
}

extension Array where Element == DatedValue {
    var latest: DatedValue? { self.max { $0.date < $1.date } }
    var sortedNewestFirst: [DatedValue] { sorted { $0.date > $1.date } }
}

// MARK: - Bankkonten  (key: bankAccounts)

struct BankAccount: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var balance: Double
    var zinssatz: Double?          // % p.a.
    var laufzeitBis: ISODate?
    var person: String?
    var bank: String?
    var balanceHistory: [DatedValue]?   // wird von der Web-App nur gelesen

    init(id: EntityID = .new(), name: String, balance: Double, zinssatz: Double? = nil,
         laufzeitBis: ISODate? = nil, person: String? = nil, bank: String? = nil) {
        self.id = id; self.name = name; self.balance = balance; self.zinssatz = zinssatz
        self.laufzeitBis = laufzeitBis; self.person = person; self.bank = bank
    }

    /// Aktueller Saldo: neuester Eintrag aus `balanceHistory`, sonst `balance`.
    var latestBalance: Double {
        if let h = balanceHistory, let last = h.latest { return last.value }
        return balance
    }

    /// Zinsertrag p.a. (nil, wenn kein Zinssatz).
    var yearlyInterest: Double? {
        guard let z = zinssatz, z != 0 else { return nil }
        return latestBalance * z / 100
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        name = c.string("name")
        balance = c.double("balance")
        zinssatz = c.optDouble("zinssatz")
        laufzeitBis = c.optString("laufzeitBis").flatMap { $0.isEmpty ? nil : $0 }
        person = c.optString("person").flatMap { $0.isEmpty ? nil : $0 }
        bank = c.optString("bank").flatMap { $0.isEmpty ? nil : $0 }
        let h: [DatedValue] = c.array("balanceHistory")
        balanceHistory = h.isEmpty ? nil : h
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name"); try c.put(balance, "balance")
        try c.putIfPresent(zinssatz, "zinssatz")
        try c.putIfPresent(laufzeitBis, "laufzeitBis")
        try c.putIfPresent(person, "person")
        try c.putIfPresent(bank, "bank")
        try c.putIfPresent(balanceHistory, "balanceHistory")
    }
}

// MARK: - Umsätze  (key: transactions)

struct BankTransaction: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var accountId: EntityID
    var date: ISODate
    var description: String
    var recipient: String
    var amount: Double             // < 0 Ausgabe, > 0 Einnahme
    var category: String           // Kategorie-NAME ("" = keine)
    var depotTxId: EntityID?

    init(id: EntityID = .new(), accountId: EntityID, date: ISODate, description: String,
         recipient: String = "", amount: Double, category: String = "", depotTxId: EntityID? = nil) {
        self.id = id; self.accountId = accountId; self.date = date; self.description = description
        self.recipient = recipient; self.amount = amount; self.category = category; self.depotTxId = depotTxId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        accountId = c.optID("accountId") ?? EntityID(0)
        date = c.string("date")
        description = c.string("description")
        recipient = c.string("recipient")
        amount = c.double("amount")
        category = c.string("category")
        depotTxId = c.optID("depotTxId")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(accountId, "accountId"); try c.put(date, "date")
        try c.put(description, "description"); try c.put(recipient, "recipient")
        try c.put(amount, "amount"); try c.put(category, "category")
        try c.putIfPresent(depotTxId, "depotTxId")
    }
}

// MARK: - Kategorien  (key: categories)

struct Category: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var parent: EntityID?
    var type: CategoryType

    init(id: EntityID = .new(), name: String, parent: EntityID? = nil, type: CategoryType = .expense) {
        self.id = id; self.name = name; self.parent = parent; self.type = type
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        name = c.string("name")
        parent = c.optID("parent")
        type = CategoryType.from(c.optString("type"))
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name")
        try c.putOrNull(parent, "parent")
        try c.put(type, "type")
    }
}

// MARK: - Daueraufträge  (key: recurringPayments)

struct RecurringPayment: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID               // Zahl oder "ins_<versicherungsId>"
    var description: String
    var amount: Double             // immer positiv; Vorzeichen über `type`
    var frequency: Frequency
    var categoryId: EntityID?
    var type: CategoryType?        // ältere Einträge haben keinen Typ
    var insuranceId: EntityID?
    var subscriptionId: EntityID?

    init(id: EntityID = .new(), description: String, amount: Double, frequency: Frequency,
         categoryId: EntityID?, type: CategoryType?, insuranceId: EntityID? = nil, subscriptionId: EntityID? = nil) {
        self.id = id; self.description = description; self.amount = amount; self.frequency = frequency
        self.categoryId = categoryId; self.type = type; self.insuranceId = insuranceId; self.subscriptionId = subscriptionId
    }

    /// Aus Versicherung/Abo generiert → in der UI nur lesbar.
    var isGenerated: Bool { insuranceId != nil || subscriptionId != nil }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        description = c.string("description", c.string("name"))
        amount = c.double("amount")
        frequency = Frequency.from(c.optString("frequency"))
        categoryId = c.optID("categoryId")
        type = c.optString("type").flatMap { CategoryType(rawValue: $0) }
        insuranceId = c.optID("insuranceId")
        subscriptionId = c.optID("subscriptionId")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(description, "description"); try c.put(amount, "amount")
        try c.put(frequency, "frequency"); try c.putOrNull(categoryId, "categoryId")
        try c.putIfPresent(type, "type")
        try c.putIfPresent(insuranceId, "insuranceId")
        try c.putIfPresent(subscriptionId, "subscriptionId")
    }
}

// MARK: - Depots  (key: depots)

struct Depot: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String

    init(id: EntityID = .new(), name: String) { self.id = id; self.name = name }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id(); name = c.string("name")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name")
    }
}

// MARK: - Depot-Transaktionen  (key: depotTransactions)

enum DepotTxType: String, Codable, CaseIterable, Identifiable, Sendable {
    case buy, sell, dividend, interest
    var id: String { rawValue }
    var label: String {
        switch self {
        case .buy: return "Kauf"
        case .sell: return "Verkauf"
        case .dividend: return "Dividende"
        case .interest: return "Zinsen"
        }
    }
    var isIncome: Bool { self == .dividend || self == .interest }
    var isTrade: Bool { !isIncome }
}

struct DepotTransaction: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var depotId: EntityID
    var securityId: EntityID
    var type: DepotTxType
    var quantity: Double           // Ertragsarten: immer 1
    var price: Double              // pro Stück; bei Erträgen: Gesamtbetrag
    var fees: Double
    var date: ISODate
    var fromBankTx: Bool

    init(id: EntityID = .new(), depotId: EntityID, securityId: EntityID, type: DepotTxType,
         quantity: Double, price: Double, fees: Double = 0, date: ISODate, fromBankTx: Bool = false) {
        self.id = id; self.depotId = depotId; self.securityId = securityId; self.type = type
        self.quantity = quantity; self.price = price; self.fees = fees; self.date = date; self.fromBankTx = fromBankTx
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        depotId = c.optID("depotId") ?? EntityID(0)
        securityId = c.optID("securityId") ?? EntityID(0)
        type = DepotTxType(rawValue: c.string("type")) ?? .buy
        quantity = c.double("quantity")
        price = c.double("price")
        fees = c.double("fees")
        date = c.string("date")
        fromBankTx = c.bool("fromBankTx")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(depotId, "depotId"); try c.put(securityId, "securityId")
        try c.put(type, "type"); try c.put(quantity, "quantity"); try c.put(price, "price")
        try c.put(fees, "fees"); try c.put(date, "date")
        if fromBankTx { try c.put(true, "fromBankTx") }
    }
}

// MARK: - Wertpapiere  (key: securities)

enum SecurityKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case aktie = "Aktie", etf = "ETF", fonds = "Fonds", anleihe = "Anleihe"
    case rohstoff = "Rohstoff", krypto = "Kryptowährung", sonstiges = "Sonstiges"
    var id: String { rawValue }
}

let supportedCurrencies = ["EUR", "USD", "GBP", "CHF", "JPY", "SEK", "NOK", "DKK", "CAD", "AUD"]

struct SecurityAsset: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var symbol: String             // Yahoo-Ticker, z. B. "AAPL", "DTE.DE"
    var isin: String
    var type: SecurityKind
    var currency: String

    init(id: EntityID = .new(), name: String, symbol: String, isin: String = "",
         type: SecurityKind = .aktie, currency: String = "EUR") {
        self.id = id; self.name = name; self.symbol = symbol; self.isin = isin; self.type = type; self.currency = currency
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        name = c.string("name")
        symbol = c.string("symbol")
        isin = c.string("isin")
        type = SecurityKind(rawValue: c.string("type")) ?? .aktie
        let cur = c.string("currency")
        currency = cur.isEmpty ? "EUR" : cur
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name"); try c.put(symbol, "symbol")
        try c.put(isin, "isin"); try c.put(type, "type"); try c.put(currency, "currency")
    }
}

/// `securityPrices`: { "<securityId>": [{date, value}] } (Wert in Wertpapierwährung).
typealias SecurityPrices = [String: [DatedValue]]
/// `fxRates`: { "USD": [{date, value}] } (value = EUR je 1 Einheit Fremdwährung).
typealias FxRates = [String: [DatedValue]]

// MARK: - Versicherungen  (key: insuranceContracts)

enum VerrentungTyp: String, Codable, CaseIterable, Identifiable, Sendable {
    case none = ""
    case verrentung
    case nurVerrentung
    case nichtRelevant
    var id: String { rawValue }
    var label: String {
        switch self {
        case .none: return "– keine –"
        case .verrentung: return "Verrentung"
        case .nurVerrentung: return "Nur Verrentung"
        case .nichtRelevant: return "Nicht relevant"
        }
    }
}

struct InsuranceValueEntry: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var date: ISODate
    var value: Double
    var multiplikator: Double?
    var garantierteJaehrlicheRente: Double?

    init(id: EntityID = .new(), date: ISODate, value: Double,
         multiplikator: Double? = nil, garantierteJaehrlicheRente: Double? = nil) {
        self.id = id; self.date = date; self.value = value
        self.multiplikator = multiplikator; self.garantierteJaehrlicheRente = garantierteJaehrlicheRente
    }

    /// Jahresrente = value / multiplikator * garantierteJaehrlicheRente
    var annualPension: Double? {
        guard let m = multiplikator, m != 0, let g = garantierteJaehrlicheRente else { return nil }
        return value / m * g
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        date = c.string("date")
        value = c.double("value")
        multiplikator = c.optDouble("multiplikator")
        garantierteJaehrlicheRente = c.optDouble("garantierteJaehrlicheRente")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(date, "date"); try c.put(value, "value")
        try c.putIfPresent(multiplikator, "multiplikator")
        try c.putIfPresent(garantierteJaehrlicheRente, "garantierteJaehrlicheRente")
    }
}

struct InsuranceContract: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var provider: String
    var vertragsnummer: String
    var categoryId: EntityID?
    var value: Double?
    var premium: Double
    var premiumFrequency: Frequency
    var start: ISODate
    var end: ISODate
    var notes: String
    var comment: String
    var active: Bool
    var renteNachTodesfall: Bool
    var verrentungTyp: VerrentungTyp
    var nurVerrentung: Bool        // Legacy-Flag, wird zur Kompatibilität mitgeschrieben
    var person: String
    var valueHistory: [InsuranceValueEntry]
    var company: String?           // nur gelesen (Altdaten)

    init(id: EntityID = .new(), name: String = "", provider: String = "", vertragsnummer: String = "",
         categoryId: EntityID? = nil, value: Double? = nil, premium: Double = 0,
         premiumFrequency: Frequency = .monthly, start: ISODate = "", end: ISODate = "",
         notes: String = "", comment: String = "", active: Bool = true, renteNachTodesfall: Bool = false,
         verrentungTyp: VerrentungTyp = .none, person: String = "", valueHistory: [InsuranceValueEntry] = []) {
        self.id = id; self.name = name; self.provider = provider; self.vertragsnummer = vertragsnummer
        self.categoryId = categoryId; self.value = value; self.premium = premium
        self.premiumFrequency = premiumFrequency; self.start = start; self.end = end
        self.notes = notes; self.comment = comment; self.active = active
        self.renteNachTodesfall = renteNachTodesfall; self.verrentungTyp = verrentungTyp
        self.nurVerrentung = verrentungTyp == .nurVerrentung
        self.person = person; self.valueHistory = valueHistory; self.company = nil
    }

    /// Effektiver Verrentungstyp (berücksichtigt das Legacy-Flag `nurVerrentung`).
    var effectiveVerrentung: VerrentungTyp {
        if verrentungTyp == .none && nurVerrentung { return .nurVerrentung }
        return verrentungTyp
    }

    var isOnlyAnnuity: Bool { effectiveVerrentung == .nurVerrentung }
    /// Rentenvertrag: Verrentung oder nur Verrentung.
    var isAnnuity: Bool { effectiveVerrentung == .verrentung || effectiveVerrentung == .nurVerrentung }
    /// Zählt zum Gesamtvermögen (nicht "nur Verrentung" und nicht "nicht relevant").
    var countsTowardWealth: Bool { effectiveVerrentung != .nurVerrentung && effectiveVerrentung != .nichtRelevant }

    var displayName: String { name.isEmpty ? (company ?? "") : name }

    /// Aktueller Wert: neuester Historieneintrag, sonst `value`.
    var currentValue: Double {
        if let last = valueHistory.max(by: { $0.date < $1.date }) { return last.value }
        return value ?? 0
    }

    var latestValueEntry: InsuranceValueEntry? { valueHistory.max(by: { $0.date < $1.date }) }

    var monthlyPremium: Double { premium * premiumFrequency.monthlyFactor }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id()
        name = c.string("name")
        provider = c.string("provider")
        vertragsnummer = c.string("vertragsnummer")
        categoryId = c.optID("categoryId")
        value = c.optDouble("value")
        premium = c.double("premium")
        premiumFrequency = Frequency.from(c.optString("premiumFrequency"))
        start = c.string("start")
        end = c.string("end")
        notes = c.string("notes")
        comment = c.string("comment")
        active = c.bool("active", true)
        renteNachTodesfall = c.bool("renteNachTodesfall")
        verrentungTyp = VerrentungTyp(rawValue: c.string("verrentungTyp")) ?? .none
        nurVerrentung = c.bool("nurVerrentung")
        person = c.string("person")
        valueHistory = c.array("valueHistory")
        company = c.optString("company")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name"); try c.put(provider, "provider")
        try c.put(vertragsnummer, "vertragsnummer"); try c.putOrNull(categoryId, "categoryId")
        try c.putOrNull(value, "value"); try c.put(premium, "premium")
        try c.put(premiumFrequency, "premiumFrequency"); try c.put(start, "start"); try c.put(end, "end")
        try c.put(notes, "notes"); try c.put(comment, "comment"); try c.put(active, "active")
        try c.put(renteNachTodesfall, "renteNachTodesfall"); try c.put(verrentungTyp, "verrentungTyp")
        try c.put(verrentungTyp == .nurVerrentung || (verrentungTyp == .none && nurVerrentung), "nurVerrentung")
        try c.put(person, "person"); try c.put(valueHistory, "valueHistory")
        try c.putIfPresent(company, "company")
    }
}

// MARK: - Immobilien  (key: realEstate)

struct RealEstateProperty: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var purchase: Double
    var current: Double
    var notes: String
    var currentHistory: [HistoryEntry]

    init(id: EntityID = .new(), name: String = "", purchase: Double = 0, current: Double = 0,
         notes: String = "", currentHistory: [HistoryEntry] = []) {
        self.id = id; self.name = name; self.purchase = purchase; self.current = current
        self.notes = notes; self.currentHistory = currentHistory
    }

    var currentValue: Double { currentHistory.latest?.value ?? current }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id(); name = c.string("name"); purchase = c.double("purchase")
        current = c.double("current"); notes = c.string("notes"); currentHistory = c.array("currentHistory")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name"); try c.put(purchase, "purchase")
        try c.put(current, "current"); try c.put(notes, "notes"); try c.put(currentHistory, "currentHistory")
    }
}

// MARK: - Firmenbeteiligungen  (key: companyShares)

struct CompanyShare: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var company: String
    var percentage: Double         // 0–100
    var value: Double
    var notes: String
    var valueHistory: [HistoryEntry]

    init(id: EntityID = .new(), company: String = "", percentage: Double = 0, value: Double = 0,
         notes: String = "", valueHistory: [HistoryEntry] = []) {
        self.id = id; self.company = company; self.percentage = percentage; self.value = value
        self.notes = notes; self.valueHistory = valueHistory
    }

    var currentValue: Double { valueHistory.latest?.value ?? value }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id(); company = c.string("company", c.string("name")); percentage = c.double("percentage")
        value = c.double("value"); notes = c.string("notes"); valueHistory = c.array("valueHistory")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(company, "company"); try c.put(percentage, "percentage")
        try c.put(value, "value"); try c.put(notes, "notes"); try c.put(valueHistory, "valueHistory")
    }
}

// MARK: - Abonnements  (key: subscriptions)

let cancellationPeriodSuggestions = ["1 Monat", "2 Monate", "3 Monate", "6 Monate", "12 Monate",
                                     "quartalsweise", "halbjährlich", "jährlich", "individuell"]

struct SubscriptionItem: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var cost: Double
    var frequency: Frequency
    var cancel: String             // Kündigungsfrist (Freitext)
    var cancelDate: ISODate
    var aktiv: Bool
    var gekuendigt: Bool
    var categoryId: EntityID?
    var type: CategoryType

    init(id: EntityID = .new(), name: String = "", cost: Double = 0, frequency: Frequency = .monthly,
         cancel: String = "", cancelDate: ISODate = "", aktiv: Bool = true, gekuendigt: Bool = false,
         categoryId: EntityID? = nil, type: CategoryType = .expense) {
        self.id = id; self.name = name; self.cost = cost; self.frequency = frequency; self.cancel = cancel
        self.cancelDate = cancelDate; self.aktiv = aktiv; self.gekuendigt = gekuendigt
        self.categoryId = categoryId; self.type = type
    }

    var monthlyCost: Double { cost * frequency.monthlyFactor }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id(); name = c.string("name"); cost = c.double("cost")
        frequency = Frequency.from(c.optString("frequency")); cancel = c.string("cancel")
        cancelDate = c.string("cancelDate"); aktiv = c.bool("aktiv", true); gekuendigt = c.bool("gekuendigt")
        categoryId = c.optID("categoryId"); type = CategoryType.from(c.optString("type"))
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name"); try c.put(cost, "cost"); try c.put(frequency, "frequency")
        try c.put(cancel, "cancel"); try c.put(cancelDate, "cancelDate"); try c.put(aktiv, "aktiv")
        try c.put(gekuendigt, "gekuendigt"); try c.putOrNull(categoryId, "categoryId"); try c.put(type, "type")
    }
}

// MARK: - Dienstleistungskosten  (keys: serviceTypes, serviceEntries)

struct ServiceType: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var name: String
    var unit: String
    var defaultPrice: Double

    init(id: EntityID = .new(), name: String, unit: String, defaultPrice: Double) {
        self.id = id; self.name = name; self.unit = unit; self.defaultPrice = defaultPrice
    }

    static let defaults: [ServiceType] = [
        ServiceType(id: 1, name: "Hemden bügeln", unit: "Stück", defaultPrice: 1.50),
        ServiceType(id: 2, name: "Putzen", unit: "Stunden", defaultPrice: 15.00),
        ServiceType(id: 3, name: "Kochen", unit: "Stunden", defaultPrice: 12.00),
    ]

    static let unitSuggestions = ["Stunden", "Stück", "Menge", "Pauschal", "kg", "m²", "Tag", "Woche"]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id(); name = c.string("name"); unit = c.string("unit"); defaultPrice = c.double("defaultPrice")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(name, "name"); try c.put(unit, "unit"); try c.put(defaultPrice, "defaultPrice")
    }
}

enum ServiceStatus: String, Codable, CaseIterable, Identifiable, Sendable {
    case offen, bezahlt
    var id: String { rawValue }
    var label: String { self == .offen ? "Offen" : "Bezahlt" }
}

struct ServiceEntry: Codable, Hashable, Identifiable, Sendable {
    var id: EntityID
    var date: ISODate
    var serviceTypeId: EntityID
    var quantity: Double
    var pricePerUnit: Double
    var total: Double
    var notes: String
    var status: ServiceStatus

    init(id: EntityID = .new(), date: ISODate, serviceTypeId: EntityID, quantity: Double,
         pricePerUnit: Double, notes: String = "", status: ServiceStatus = .offen) {
        self.id = id; self.date = date; self.serviceTypeId = serviceTypeId; self.quantity = quantity
        self.pricePerUnit = pricePerUnit; self.total = quantity * pricePerUnit; self.notes = notes; self.status = status
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.id(); date = c.string("date"); serviceTypeId = c.optID("serviceTypeId") ?? EntityID(0)
        quantity = c.double("quantity"); pricePerUnit = c.double("pricePerUnit")
        total = c.optDouble("total") ?? quantity * pricePerUnit
        notes = c.string("notes"); status = ServiceStatus(rawValue: c.string("status")) ?? .offen
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.put(id, "id"); try c.put(date, "date"); try c.put(serviceTypeId, "serviceTypeId")
        try c.put(quantity, "quantity"); try c.put(pricePerUnit, "pricePerUnit"); try c.put(total, "total")
        try c.put(notes, "notes"); try c.put(status, "status")
    }
}

// MARK: - Liquiditätsstufen  (key: liquidityLevels)

/// { "bank_<id>" | "depot_<id>" | "insurance_<id>" | "realestate_<id>" | "shares_<id>": 1|2|3|5|6 }
typealias LiquidityLevels = [String: Int]

enum LiquidityLevel: Int, CaseIterable, Identifiable, Sendable {
    case l1 = 1, l2 = 2, l3 = 3, l5 = 5, l6 = 6
    var id: Int { rawValue }
    var label: String { "Stufe \(rawValue)" }
    var description: String {
        switch self {
        case .l1: return "Liquidität"
        case .l2: return "Kurzfristig"
        case .l3: return "Mittelfristig"
        case .l5: return "Schwer"
        case .l6: return "Theoretisch liquidierbar"
        }
    }
}

enum LiquidityKey {
    static func bank(_ id: EntityID) -> String { "bank_\(id.key)" }
    static func depot(_ id: EntityID) -> String { "depot_\(id.key)" }
    static func insurance(_ id: EntityID) -> String { "insurance_\(id.key)" }
    static func realEstate(_ id: EntityID) -> String { "realestate_\(id.key)" }
    static func shares(_ id: EntityID) -> String { "shares_\(id.key)" }
}
