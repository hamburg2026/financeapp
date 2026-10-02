import Foundation
import CryptoKit
import CommonCrypto
import Security

/// Alle Schlüssel, die die Web-App sichert (`BACKUP_KEYS`).
enum BackupKey: String, CaseIterable, Codable, Hashable {
    case bankAccounts, transactions, categories, recurringPayments
    case depots, depotTransactions, securityPrices, securities, fxRates
    case insuranceContracts, insurancePersons, realEstate, companyShares, subscriptions
    case serviceEntries, serviceTypes
    case banks, liquidityLevels
}

/// Abschnitte für die Auswahl beim Sichern/Wiederherstellen (`BACKUP_SECTIONS`).
struct BackupSection: Identifiable, Hashable {
    let label: String
    let keys: [BackupKey]
    var id: String { label }

    static let all: [BackupSection] = [
        BackupSection(label: "Bankkonten & Umsätze", keys: [.bankAccounts, .transactions, .banks]),
        BackupSection(label: "Kategorien", keys: [.categories]),
        BackupSection(label: "Daueraufträge", keys: [.recurringPayments]),
        BackupSection(label: "Wertpapiere & Depots", keys: [.securities, .securityPrices, .depots, .depotTransactions, .fxRates]),
        BackupSection(label: "Versicherungen", keys: [.insuranceContracts, .insurancePersons]),
        BackupSection(label: "Abonnements", keys: [.subscriptions]),
        BackupSection(label: "Immobilien", keys: [.realEstate]),
        BackupSection(label: "Firmenbeteiligungen", keys: [.companyShares]),
        BackupSection(label: "Dienstleistungskosten", keys: [.serviceEntries, .serviceTypes]),
        BackupSection(label: "Einstellungen", keys: [.liquidityLevels]),
    ]
}

/// Inhalt einer Sicherung. `nil` = Schlüssel nicht enthalten.
struct BackupSnapshot: Codable {
    var bankAccounts: [BankAccount]?
    var transactions: [BankTransaction]?
    var categories: [Category]?
    var recurringPayments: [RecurringPayment]?
    var depots: [Depot]?
    var depotTransactions: [DepotTransaction]?
    var securityPrices: SecurityPrices?
    var securities: [SecurityAsset]?
    var fxRates: FxRates?
    var insuranceContracts: [InsuranceContract]?
    var insurancePersons: [String]?
    var realEstate: [RealEstateProperty]?
    var companyShares: [CompanyShare]?
    var subscriptions: [SubscriptionItem]?
    var serviceEntries: [ServiceEntry]?
    var serviceTypes: [ServiceType]?
    var banks: [String]?
    var liquidityLevels: LiquidityLevels?

    init() {}

    /// Welche Schlüssel enthalten sind.
    var presentKeys: Set<BackupKey> {
        var k = Set<BackupKey>()
        if bankAccounts != nil { k.insert(.bankAccounts) }
        if transactions != nil { k.insert(.transactions) }
        if categories != nil { k.insert(.categories) }
        if recurringPayments != nil { k.insert(.recurringPayments) }
        if depots != nil { k.insert(.depots) }
        if depotTransactions != nil { k.insert(.depotTransactions) }
        if securityPrices != nil { k.insert(.securityPrices) }
        if securities != nil { k.insert(.securities) }
        if fxRates != nil { k.insert(.fxRates) }
        if insuranceContracts != nil { k.insert(.insuranceContracts) }
        if insurancePersons != nil { k.insert(.insurancePersons) }
        if realEstate != nil { k.insert(.realEstate) }
        if companyShares != nil { k.insert(.companyShares) }
        if subscriptions != nil { k.insert(.subscriptions) }
        if serviceEntries != nil { k.insert(.serviceEntries) }
        if serviceTypes != nil { k.insert(.serviceTypes) }
        if banks != nil { k.insert(.banks) }
        if liquidityLevels != nil { k.insert(.liquidityLevels) }
        return k
    }

    var availableSections: [BackupSection] {
        let present = presentKeys
        return BackupSection.all.filter { $0.keys.contains(where: present.contains) }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        func list<T: Decodable>(_ key: BackupKey, _ t: T.Type) -> [T]? {
            (try? c.decodeIfPresent(LenientArray<T>.self, forKey: AnyKey(key.rawValue)))?.items
        }
        bankAccounts = list(.bankAccounts, BankAccount.self)
        transactions = list(.transactions, BankTransaction.self)
        categories = list(.categories, Category.self)
        recurringPayments = list(.recurringPayments, RecurringPayment.self)
        depots = list(.depots, Depot.self)
        depotTransactions = list(.depotTransactions, DepotTransaction.self)
        securityPrices = BackupSnapshot.datedMap(c, .securityPrices)
        securities = list(.securities, SecurityAsset.self)
        fxRates = BackupSnapshot.datedMap(c, .fxRates)
        insuranceContracts = list(.insuranceContracts, InsuranceContract.self)
        insurancePersons = list(.insurancePersons, String.self)
        realEstate = list(.realEstate, RealEstateProperty.self)
        companyShares = list(.companyShares, CompanyShare.self)
        subscriptions = list(.subscriptions, SubscriptionItem.self)
        serviceEntries = list(.serviceEntries, ServiceEntry.self)
        serviceTypes = list(.serviceTypes, ServiceType.self)
        banks = list(.banks, String.self)
        if let raw = try? c.decodeIfPresent([String: Double].self, forKey: AnyKey(BackupKey.liquidityLevels.rawValue)) {
            liquidityLevels = raw.mapValues { Int($0) }
        }
    }

    private static func datedMap(_ c: KeyedDecodingContainer<AnyKey>, _ key: BackupKey) -> [String: [DatedValue]]? {
        guard let raw = try? c.decodeIfPresent([String: LenientArray<DatedValue>].self, forKey: AnyKey(key.rawValue)) else { return nil }
        return raw.mapValues(\.items)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.putIfPresent(bankAccounts, BackupKey.bankAccounts.rawValue)
        try c.putIfPresent(transactions, BackupKey.transactions.rawValue)
        try c.putIfPresent(categories, BackupKey.categories.rawValue)
        try c.putIfPresent(recurringPayments, BackupKey.recurringPayments.rawValue)
        try c.putIfPresent(depots, BackupKey.depots.rawValue)
        try c.putIfPresent(depotTransactions, BackupKey.depotTransactions.rawValue)
        try c.putIfPresent(securityPrices, BackupKey.securityPrices.rawValue)
        try c.putIfPresent(securities, BackupKey.securities.rawValue)
        try c.putIfPresent(fxRates, BackupKey.fxRates.rawValue)
        try c.putIfPresent(insuranceContracts, BackupKey.insuranceContracts.rawValue)
        try c.putIfPresent(insurancePersons, BackupKey.insurancePersons.rawValue)
        try c.putIfPresent(realEstate, BackupKey.realEstate.rawValue)
        try c.putIfPresent(companyShares, BackupKey.companyShares.rawValue)
        try c.putIfPresent(subscriptions, BackupKey.subscriptions.rawValue)
        try c.putIfPresent(serviceEntries, BackupKey.serviceEntries.rawValue)
        try c.putIfPresent(serviceTypes, BackupKey.serviceTypes.rawValue)
        try c.putIfPresent(banks, BackupKey.banks.rawValue)
        try c.putIfPresent(liquidityLevels, BackupKey.liquidityLevels.rawValue)
    }

    // MARK: Dateiformat

    /// Unverschlüsselte Sicherungsdatei: `{version: 2, exportedAt, data}`.
    func encodedFile() throws -> Data {
        let wrapper = BackupFile(version: 2, exportedAt: ISO8601DateFormatter.backup.string(from: Date()), data: self)
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return try enc.encode(wrapper)
    }

    /// Liest eine unverschlüsselte Sicherung (`{data: {...}}` oder direkt `{bankAccounts: …}`).
    static func decode(from data: Data) throws -> BackupSnapshot {
        let dec = JSONDecoder()
        if let wrapper = try? dec.decode(BackupFileProbe.self, from: data), wrapper.hasData {
            return try dec.decode(BackupFile.self, from: data).data
        }
        return try dec.decode(BackupSnapshot.self, from: data)
    }
}

private struct BackupFile: Codable {
    var version: Int
    var exportedAt: String
    var data: BackupSnapshot

    init(version: Int, exportedAt: String, data: BackupSnapshot) {
        self.version = version; self.exportedAt = exportedAt; self.data = data
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        version = Int(c.double("version", 2))
        exportedAt = c.string("exportedAt")
        data = try c.decode(BackupSnapshot.self, forKey: AnyKey("data"))
    }
}

private struct BackupFileProbe: Decodable {
    var hasData: Bool
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        hasData = c.contains(AnyKey("data")) && ((try? c.decodeNil(forKey: AnyKey("data"))) == false)
    }
}

extension ISO8601DateFormatter {
    static let backup: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

// MARK: - Verschlüsselung (kompatibel zur Web-App: PBKDF2-SHA256 200.000 Runden + AES-256-GCM)

enum BackupCrypto {
    enum CryptoError: LocalizedError {
        case invalidFile, wrongPassword, keyDerivationFailed
        var errorDescription: String? {
            switch self {
            case .invalidFile: return "Sicherungsdatei konnte nicht gelesen werden."
            case .wrongPassword: return "Falsches Passwort oder beschädigte Datei."
            case .keyDerivationFailed: return "Schlüsselableitung fehlgeschlagen."
            }
        }
    }

    private struct EncryptedFile: Codable {
        var version: Int
        var encrypted: Bool
        var salt: String
        var iv: String
        var payload: String
    }

    static let iterations: UInt32 = 200_000

    /// Prüft, ob es sich um eine verschlüsselte Sicherung handelt.
    static func isEncrypted(_ data: Data) -> Bool {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return (obj["encrypted"] as? Bool) == true
    }

    static func deriveKey(password: String, salt: Data) throws -> SymmetricKey {
        var derived = [UInt8](repeating: 0, count: 32)
        let pw = Array(password.utf8)
        let status = salt.withUnsafeBytes { saltPtr -> Int32 in
            pw.withUnsafeBufferPointer { pwPtr -> Int32 in
                pwPtr.baseAddress!.withMemoryRebound(to: Int8.self, capacity: pw.count) { pwBase in
                    CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
                                         pwBase, pw.count,
                                         saltPtr.bindMemory(to: UInt8.self).baseAddress, salt.count,
                                         CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), iterations,
                                         &derived, derived.count)
                }
            }
        }
        guard status == kCCSuccess else { throw CryptoError.keyDerivationFailed }
        return SymmetricKey(data: derived)
    }

    /// Verschlüsselt eine Klartext-Sicherung im Format der Web-App.
    static func encrypt(_ plaintext: Data, password: String) throws -> Data {
        var salt = Data(count: 16)
        _ = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!) }
        let nonce = AES.GCM.Nonce()
        let key = try deriveKey(password: password, salt: salt)
        let box = try AES.GCM.seal(plaintext, using: key, nonce: nonce)
        // WebCrypto liefert Ciphertext || Tag (16 Byte)
        let payload = box.ciphertext + box.tag
        let file = EncryptedFile(version: 2, encrypted: true,
                                 salt: salt.base64EncodedString(),
                                 iv: Data(nonce).base64EncodedString(),
                                 payload: payload.base64EncodedString())
        return try JSONEncoder().encode(file)
    }

    /// Entschlüsselt eine Sicherung der Web-App bzw. dieser App.
    static func decrypt(_ data: Data, password: String) throws -> Data {
        guard let file = try? JSONDecoder().decode(EncryptedFile.self, from: data),
              let salt = Data(base64Encoded: file.salt),
              let iv = Data(base64Encoded: file.iv),
              let payload = Data(base64Encoded: file.payload),
              payload.count > 16 else { throw CryptoError.invalidFile }
        do {
            let key = try deriveKey(password: password, salt: salt)
            let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                            ciphertext: payload.prefix(payload.count - 16),
                                            tag: payload.suffix(16))
            return try AES.GCM.open(box, using: key)
        } catch {
            throw CryptoError.wrongPassword
        }
    }
}
