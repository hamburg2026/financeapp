import Foundation

/// ID eines Datensatzes – kompatibel zum Web-App-Format.
///
/// Die Web-App verwendet überwiegend `Date.now()` (ganze Zahl), in Ausnahmefällen
/// aber auch Strings (`"ins_<id>"` bei aus Versicherungen erzeugten Daueraufträgen)
/// oder Gleitkommazahlen. `EntityID` liest alle drei Varianten und schreibt sie
/// unverändert zurück, damit Sicherungen zwischen Web-App und iPad austauschbar bleiben.
struct EntityID: Hashable, Codable, Comparable, CustomStringConvertible, Sendable {
    enum Raw: Hashable, Sendable {
        case int(Int64)
        case double(Double)
        case string(String)
    }

    let raw: Raw

    init(_ value: Int64) { raw = .int(value) }
    init(_ value: Int) { raw = .int(Int64(value)) }
    init(string: String) { raw = .string(string) }

    /// Kanonische Schlüsseldarstellung (entspricht `String(id)` in JavaScript),
    /// z. B. für die Schlüssel von `securityPrices` oder `liquidityLevels`.
    var key: String {
        switch raw {
        case .int(let v): return String(v)
        case .double(let v):
            if v.rounded() == v, abs(v) < 9.0e15 { return String(Int64(v)) }
            return String(v)
        case .string(let s): return s
        }
    }

    var description: String { key }

    /// Numerischer Wert, falls vorhanden (für Sortierung nach Anlagezeitpunkt).
    var numericValue: Double? {
        switch raw {
        case .int(let v): return Double(v)
        case .double(let v): return v
        case .string(let s): return Double(s)
        }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int64.self) {
            raw = .int(i)
        } else if let d = try? c.decode(Double.self) {
            raw = d.rounded() == d && abs(d) < 9.0e15 ? .int(Int64(d)) : .double(d)
        } else if let s = try? c.decode(String.self) {
            // Rein numerische Strings (z. B. aus <select>-Werten) als Zahl behandeln.
            if let i = Int64(s) { raw = .int(i) } else { raw = .string(s) }
        } else {
            throw DecodingError.typeMismatch(EntityID.self, .init(codingPath: c.codingPath, debugDescription: "ID ist weder Zahl noch String"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch raw {
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .string(let s): try c.encode(s)
        }
    }

    static func < (lhs: EntityID, rhs: EntityID) -> Bool {
        switch (lhs.numericValue, rhs.numericValue) {
        case let (l?, r?): return l < r
        default: return lhs.key < rhs.key
        }
    }

    // MARK: Neue IDs

    private static var lastIssued: Int64 = 0
    private static let lock = NSLock()

    /// Erzeugt eine neue, eindeutige ID im Stil von `Date.now()` (Millisekunden).
    static func new() -> EntityID {
        lock.lock(); defer { lock.unlock() }
        var ms = Int64(Date().timeIntervalSince1970 * 1000)
        if ms <= lastIssued { ms = lastIssued + 1 }
        lastIssued = ms
        return EntityID(ms)
    }
}

extension EntityID: ExpressibleByIntegerLiteral {
    init(integerLiteral value: Int64) { raw = .int(value) }
}
