import Foundation

/// Fehlertolerantes Dekodieren: Die Daten stammen aus `localStorage` der Web-App,
/// in der Felder fehlen, `null` sein oder als String statt Zahl vorliegen können.
/// Statt beim ersten Abweichen die ganze Sicherung zu verwerfen, werden Standardwerte genutzt.
struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(_ s: String) { stringValue = s; intValue = nil }
    init?(stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(intValue: Int) { stringValue = String(intValue); self.intValue = intValue }
}

extension KeyedDecodingContainer where Key == AnyKey {
    func string(_ key: String, _ fallback: String = "") -> String {
        let k = AnyKey(key)
        if let s = try? decodeIfPresent(String.self, forKey: k) { return s }
        if let d = try? decodeIfPresent(Double.self, forKey: k) {
            return d.rounded() == d ? String(Int64(d)) : String(d)
        }
        return fallback
    }

    func optString(_ key: String) -> String? {
        let k = AnyKey(key)
        if let s = try? decodeIfPresent(String.self, forKey: k) { return s }
        return nil
    }

    func double(_ key: String, _ fallback: Double = 0) -> Double {
        optDouble(key) ?? fallback
    }

    func optDouble(_ key: String) -> Double? {
        let k = AnyKey(key)
        if let d = try? decodeIfPresent(Double.self, forKey: k) { return d.isFinite ? d : nil }
        if let s = try? decodeIfPresent(String.self, forKey: k) {
            return Double(s.replacingOccurrences(of: ",", with: "."))
        }
        return nil
    }

    func bool(_ key: String, _ fallback: Bool = false) -> Bool {
        optBool(key) ?? fallback
    }

    func optBool(_ key: String) -> Bool? {
        let k = AnyKey(key)
        if let b = try? decodeIfPresent(Bool.self, forKey: k) { return b }
        if let d = try? decodeIfPresent(Double.self, forKey: k) { return d != 0 }
        if let s = try? decodeIfPresent(String.self, forKey: k) { return s == "true" || s == "1" }
        return nil
    }

    func id(_ key: String = "id") -> EntityID {
        (try? decodeIfPresent(EntityID.self, forKey: AnyKey(key))) ?? EntityID.new()
    }

    func optID(_ key: String) -> EntityID? {
        guard let v = try? decodeIfPresent(EntityID.self, forKey: AnyKey(key)) else { return nil }
        if case .string(let s) = v.raw, s.isEmpty { return nil }
        return v
    }

    /// Array, bei dem einzelne defekte Elemente übersprungen werden.
    func array<T: Decodable>(_ key: String, of type: T.Type = T.self) -> [T] {
        guard var nested = try? nestedUnkeyedContainer(forKey: AnyKey(key)) else { return [] }
        var result: [T] = []
        while !nested.isAtEnd {
            if let v = try? nested.decode(T.self) {
                result.append(v)
            } else {
                _ = try? nested.decode(Discard.self)
            }
        }
        return result
    }

    func value<T: Decodable>(_ key: String, as type: T.Type = T.self) -> T? {
        try? decodeIfPresent(T.self, forKey: AnyKey(key))
    }
}

extension KeyedEncodingContainer where Key == AnyKey {
    mutating func put<T: Encodable>(_ value: T, _ key: String) throws {
        try encode(value, forKey: AnyKey(key))
    }

    /// Schreibt nur, wenn ein Wert vorhanden ist (entspricht `delete obj.feld` in JS).
    mutating func putIfPresent<T: Encodable>(_ value: T?, _ key: String) throws {
        if let value { try encode(value, forKey: AnyKey(key)) }
    }

    /// Schreibt `null`, wenn kein Wert vorhanden ist (entspricht `feld: null` in JS).
    mutating func putOrNull<T: Encodable>(_ value: T?, _ key: String) throws {
        if let value { try encode(value, forKey: AnyKey(key)) } else { try encodeNil(forKey: AnyKey(key)) }
    }
}

/// Platzhalter zum Überspringen beliebiger JSON-Werte.
struct Discard: Decodable {
    init(from decoder: Decoder) throws {}
}

/// Dekodiert ein Top-Level-Array tolerant (defekte Elemente werden übersprungen).
struct LenientArray<T: Decodable>: Decodable {
    var items: [T]
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var result: [T] = []
        while !c.isAtEnd {
            if let v = try? c.decode(T.self) { result.append(v) } else { _ = try? c.decode(Discard.self) }
        }
        items = result
    }
}
