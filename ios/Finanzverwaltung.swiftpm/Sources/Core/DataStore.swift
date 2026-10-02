import Foundation
import Combine

/// Zentraler Datenspeicher (ersetzt `localStorage` der Web-App).
///
/// Alle Daten liegen in einer JSON-Datei im Dokumentenordner der App
/// (`financeapp-daten.json`). Das Format entspricht exakt einer unverschlüsselten
/// Sicherungsdatei der Web-App (`{version: 2, exportedAt, data: {...}}`), d. h. die Datei
/// kann direkt in der Web-App wiederhergestellt werden und umgekehrt.
///
/// Jede Änderung an einer `@Published`-Eigenschaft wird automatisch (leicht verzögert) gespeichert.
@MainActor
final class DataStore: ObservableObject {
    @Published var bankAccounts: [BankAccount] = []
    @Published var transactions: [BankTransaction] = []
    @Published var categories: [Category] = []
    @Published var recurringPayments: [RecurringPayment] = []
    @Published var depots: [Depot] = []
    @Published var depotTransactions: [DepotTransaction] = []
    @Published var securityPrices: SecurityPrices = [:]
    @Published var securities: [SecurityAsset] = []
    @Published var fxRates: FxRates = [:]
    @Published var insuranceContracts: [InsuranceContract] = []
    @Published var insurancePersons: [String] = DataStore.defaultPersons
    @Published var realEstate: [RealEstateProperty] = []
    @Published var companyShares: [CompanyShare] = []
    @Published var subscriptions: [SubscriptionItem] = []
    @Published var serviceEntries: [ServiceEntry] = []
    @Published var serviceTypes: [ServiceType] = ServiceType.defaults
    @Published var banks: [String] = []
    @Published var liquidityLevels: LiquidityLevels = [:]

    /// Letzter Speicherfehler (wird in der Oberfläche angezeigt).
    @Published var lastError: String?

    static let defaultPersons = ["Karin", "Jürgen"]

    private var cancellables = Set<AnyCancellable>()
    private var isLoading = false
    private let fileURL: URL

    init(fileURL: URL? = nil) {
        self.fileURL = fileURL ?? DataStore.defaultFileURL
        load()
        objectWillChange
            .debounce(for: .milliseconds(400), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                guard let self, !self.isLoading else { return }
                self.save()
            }
            .store(in: &cancellables)
    }

    static var defaultFileURL: URL {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("financeapp-daten.json")
    }

    /// Vorschau-/Testinstanz ohne Dateizugriff auf die echten Daten.
    static func preview() -> DataStore {
        DataStore(fileURL: FileManager.default.temporaryDirectory.appendingPathComponent("preview-\(UUID().uuidString).json"))
    }

    // MARK: - Laden / Speichern

    func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        do {
            let snapshot = try BackupSnapshot.decode(from: data)
            apply(snapshot, keys: Set(BackupKey.allCases))
        } catch {
            lastError = "Daten konnten nicht geladen werden: \(error.localizedDescription)"
        }
    }

    func save() {
        do {
            let data = try snapshot().encodedFile()
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            lastError = nil
        } catch {
            lastError = "Speichern fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    /// Aktueller Zustand als Sicherungs-Snapshot (optional nur ausgewählte Schlüssel).
    func snapshot(keys: Set<BackupKey> = Set(BackupKey.allCases)) -> BackupSnapshot {
        var s = BackupSnapshot()
        if keys.contains(.bankAccounts) { s.bankAccounts = bankAccounts }
        if keys.contains(.transactions) { s.transactions = transactions }
        if keys.contains(.categories) { s.categories = categories }
        if keys.contains(.recurringPayments) { s.recurringPayments = recurringPayments }
        if keys.contains(.depots) { s.depots = depots }
        if keys.contains(.depotTransactions) { s.depotTransactions = depotTransactions }
        if keys.contains(.securityPrices) { s.securityPrices = securityPrices }
        if keys.contains(.securities) { s.securities = securities }
        if keys.contains(.fxRates) { s.fxRates = fxRates }
        if keys.contains(.insuranceContracts) { s.insuranceContracts = insuranceContracts }
        if keys.contains(.insurancePersons) { s.insurancePersons = insurancePersons }
        if keys.contains(.realEstate) { s.realEstate = realEstate }
        if keys.contains(.companyShares) { s.companyShares = companyShares }
        if keys.contains(.subscriptions) { s.subscriptions = subscriptions }
        if keys.contains(.serviceEntries) { s.serviceEntries = serviceEntries }
        if keys.contains(.serviceTypes) { s.serviceTypes = serviceTypes }
        if keys.contains(.banks) { s.banks = banks }
        if keys.contains(.liquidityLevels) { s.liquidityLevels = liquidityLevels }
        return s
    }

    /// Übernimmt die im Snapshot vorhandenen Werte für die angegebenen Schlüssel.
    func apply(_ s: BackupSnapshot, keys: Set<BackupKey>) {
        isLoading = true
        defer { isLoading = false }
        if keys.contains(.bankAccounts), let v = s.bankAccounts { bankAccounts = v }
        if keys.contains(.transactions), let v = s.transactions { transactions = v }
        if keys.contains(.categories), let v = s.categories { categories = v }
        if keys.contains(.recurringPayments), let v = s.recurringPayments { recurringPayments = v }
        if keys.contains(.depots), let v = s.depots { depots = v }
        if keys.contains(.depotTransactions), let v = s.depotTransactions { depotTransactions = v }
        if keys.contains(.securityPrices), let v = s.securityPrices { securityPrices = v }
        if keys.contains(.securities), let v = s.securities { securities = v }
        if keys.contains(.fxRates), let v = s.fxRates { fxRates = v }
        if keys.contains(.insuranceContracts), let v = s.insuranceContracts { insuranceContracts = v }
        if keys.contains(.insurancePersons), let v = s.insurancePersons { insurancePersons = v }
        if keys.contains(.realEstate), let v = s.realEstate { realEstate = v }
        if keys.contains(.companyShares), let v = s.companyShares { companyShares = v }
        if keys.contains(.subscriptions), let v = s.subscriptions { subscriptions = v }
        if keys.contains(.serviceEntries), let v = s.serviceEntries { serviceEntries = v }
        if keys.contains(.serviceTypes), let v = s.serviceTypes { serviceTypes = v }
        if keys.contains(.banks), let v = s.banks { banks = v }
        if keys.contains(.liquidityLevels), let v = s.liquidityLevels { liquidityLevels = v }
    }

    /// Wiederherstellung aus einer Sicherung: übernimmt die Werte und speichert sofort.
    func restore(_ s: BackupSnapshot, keys: Set<BackupKey>) {
        apply(s, keys: keys)
        save()
    }

    // MARK: - Nachschlagen

    func account(_ id: EntityID?) -> BankAccount? { id.flatMap { i in bankAccounts.first { $0.id == i } } }
    func category(_ id: EntityID?) -> Category? { id.flatMap { i in categories.first { $0.id == i } } }
    func category(named name: String) -> Category? { categories.first { $0.name == name } }
    func security(_ id: EntityID?) -> SecurityAsset? { id.flatMap { i in securities.first { $0.id == i } } }
    func depot(_ id: EntityID?) -> Depot? { id.flatMap { i in depots.first { $0.id == i } } }
    func serviceType(_ id: EntityID?) -> ServiceType? { id.flatMap { i in serviceTypes.first { $0.id == i } } }

    /// Kurshistorie eines Wertpapiers.
    func prices(for securityId: EntityID) -> [DatedValue] { securityPrices[securityId.key] ?? [] }

    /// Letzter bekannter Kurs eines Wertpapiers (in Wertpapierwährung).
    func latestPrice(for securityId: EntityID) -> DatedValue? { prices(for: securityId).latest }

    // MARK: - Abgeleitete Werte (gemeinsam genutzt von Dashboard, Vermögen, Druck …)

    /// Bestände eines Depots (oder aller Depots, wenn `depotId == nil`).
    func positions(depotId: EntityID? = nil, upTo date: ISODate? = nil) -> [DepotPosition] {
        Portfolio.positions(transactions: depotTransactions.filter {
            (depotId == nil || $0.depotId == depotId) && (date == nil || $0.date <= date!)
        })
    }

    /// Marktwert eines Depots zum aktuellen Kurs (Fallback: Einstandswert, wenn kein Kurs vorhanden).
    func depotValue(_ depotId: EntityID) -> Double {
        positions(depotId: depotId).reduce(0) { sum, p in
            guard p.quantity > 0.000001 else { return sum }
            if let price = latestPrice(for: p.securityId)?.value { return sum + p.quantity * price }
            return sum + p.cost
        }
    }

    var totalBankBalance: Double { bankAccounts.reduce(0) { $0 + $1.latestBalance } }
    var totalDepotValue: Double { depots.reduce(0) { $0 + depotValue($1.id) } }
    var totalInsuranceValue: Double {
        insuranceContracts.filter { $0.active && $0.countsTowardWealth }.reduce(0) { $0 + $1.currentValue }
    }
    var totalRealEstateValue: Double { realEstate.reduce(0) { $0 + $1.currentValue } }
    var totalCompanySharesValue: Double { companyShares.reduce(0) { $0 + $1.currentValue } }
    var totalWealth: Double {
        totalBankBalance + totalDepotValue + totalInsuranceValue + totalRealEstateValue + totalCompanySharesValue
    }

    // MARK: - Kategorien

    /// Alle Nachfahren-IDs einer Kategorie (inkl. der Kategorie selbst).
    func categoryDescendantIDs(_ id: EntityID) -> Set<EntityID> {
        var result: Set<EntityID> = [id]
        var queue = [id]
        while let current = queue.popLast() {
            for c in categories where c.parent == current && !result.contains(c.id) {
                result.insert(c.id); queue.append(c.id)
            }
        }
        return result
    }

    /// "Oberkategorie › Kategorie"
    func categoryLabel(_ c: Category) -> String {
        if let p = category(c.parent) { return "\(p.name) › \(c.name)" }
        return c.name
    }

    /// Effektiver Typ eines Dauerauftrags (eigener Typ, sonst Kategorietyp, sonst Ausgabe).
    func effectiveType(of r: RecurringPayment) -> CategoryType {
        r.type ?? category(r.categoryId)?.type ?? .expense
    }

    // MARK: - Synchronisation generierter Daueraufträge

    /// Versicherung → Dauerauftrag `ins_<id>` (aktiv und Prämie > 0), sonst entfernen.
    func syncRecurring(for contract: InsuranceContract) {
        let rid = EntityID(string: "ins_\(contract.id.key)")
        var list = recurringPayments.filter { $0.id != rid && $0.insuranceId != contract.id }
        if contract.active && contract.premium > 0 {
            let desc = contract.name + (contract.provider.isEmpty ? "" : " (\(contract.provider))")
            list.append(RecurringPayment(id: rid, description: desc, amount: contract.premium,
                                         frequency: contract.premiumFrequency, categoryId: contract.categoryId,
                                         type: .expense, insuranceId: contract.id))
        }
        recurringPayments = list
    }

    func removeRecurring(forInsurance id: EntityID) {
        let rid = EntityID(string: "ins_\(id.key)")
        recurringPayments.removeAll { $0.id == rid || $0.insuranceId == id }
    }

    /// Abo → Dauerauftrag (wenn aktiv), sonst entfernen.
    func syncRecurring(for sub: SubscriptionItem) {
        if sub.aktiv {
            if let idx = recurringPayments.firstIndex(where: { $0.subscriptionId == sub.id }) {
                recurringPayments[idx].description = sub.name
                recurringPayments[idx].amount = sub.cost
                recurringPayments[idx].frequency = sub.frequency
                recurringPayments[idx].categoryId = sub.categoryId
                recurringPayments[idx].type = sub.type
            } else {
                recurringPayments.append(RecurringPayment(description: sub.name, amount: sub.cost,
                                                          frequency: sub.frequency, categoryId: sub.categoryId,
                                                          type: sub.type, subscriptionId: sub.id))
            }
        } else {
            recurringPayments.removeAll { $0.subscriptionId == sub.id }
        }
    }
}

// MARK: - Depotbestände

struct DepotPosition: Identifiable, Hashable {
    var securityId: EntityID
    var quantity: Double = 0
    /// Einstandswert (Käufe inkl. Gebühren, abzgl. Verkäufe).
    var cost: Double = 0
    /// Erträge (Dividenden/Zinsen abzgl. Gebühren).
    var income: Double = 0
    var id: EntityID { securityId }
}

enum Portfolio {
    /// Positionsberechnung wie in der Web-App:
    /// buy: qty += q, cost += q*p + fees · sell: qty -= q, cost -= q*p - fees · Ertrag: income += q*p - fees
    static func positions(transactions: [DepotTransaction]) -> [DepotPosition] {
        var map: [EntityID: DepotPosition] = [:]
        for t in transactions.sorted(by: { $0.date < $1.date }) {
            var p = map[t.securityId] ?? DepotPosition(securityId: t.securityId)
            switch t.type {
            case .buy:
                p.quantity += t.quantity
                p.cost += t.quantity * t.price + t.fees
            case .sell:
                p.quantity -= t.quantity
                p.cost -= t.quantity * t.price - t.fees
            case .dividend, .interest:
                p.income += t.quantity * t.price - t.fees
            }
            map[t.securityId] = p
        }
        return Array(map.values)
    }
}
