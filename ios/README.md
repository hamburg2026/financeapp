# Finanzverwaltung – native iPad-App (SwiftUI)

Native Umsetzung der Web-App (`../src`) für iPadOS 17+ (läuft auch auf dem iPhone).
Die App ist vollständig in Swift/SwiftUI geschrieben und braucht keine Fremdbibliotheken.

## Öffnen & Starten

Das Projekt ist ein **App-Paket** (`Finanzverwaltung.swiftpm`) und lässt sich auf zwei Wegen öffnen:

| Weg | Voraussetzung | Vorgehen |
|---|---|---|
| **Xcode (Mac)** | Xcode 15 oder neuer | `Finanzverwaltung.swiftpm` doppelklicken → Ziel „iPad“ (Simulator oder Gerät) wählen → ▶︎ |
| **Swift Playgrounds (iPad)** | Swift Playgrounds 4.4+ | Ordner `Finanzverwaltung.swiftpm` per AirDrop/iCloud Drive aufs iPad → in Playgrounds öffnen → ▶︎ (oder „App Store Connect“ zum Veröffentlichen) |

Für die Installation auf einem echten Gerät in Xcode unter *Signing & Capabilities* das eigene Team auswählen
(oder in `Package.swift` `teamIdentifier` setzen). Die Bundle-ID ist `de.ponturo.financeapp`.

## Funktionsumfang

Alle Module der Web-App wurden übernommen:

- **Stammdaten:** Bankkonten (inkl. Umsätze, Filter, Sammelaktionen, Umwandeln in Wertpapiertransaktionen),
  Wertpapiere & Depots (Kurse von Yahoo Finance, Devisenkurse, News), Immobilien, Firmenbeteiligungen, Versicherungen
- **Allgemeines:** Kategorien (hierarchisch), PDF-Import von Kontoauszügen (PDFKit), Daueraufträge, Abonnements,
  Dienstleistungskosten
- **Auswertungen:** Dashboard (inkl. Liquiditätsstufen), Vermögensverlauf, Ausgaben-Grafik, Wertentwicklung, Ausgaben-Baum
- **Datensicherung**, **Drucken / PDF**, **PIN-Sperre mit Face ID**, **Farbthemen**

## Daten & Kompatibilität mit der Web-App

- Alle Daten liegen lokal in `Dokumente/financeapp-daten.json` (Dateischutz: *complete file protection*).
- Das Dateiformat ist **identisch mit einer Sicherungsdatei der Web-App**. Daher:
  - **Web → iPad:** In der Web-App unter *Datensicherung* eine Sicherung (optional mit Passwort) erstellen,
    Datei aufs iPad bringen, in der App unter *Datensicherung → Wiederherstellen* auswählen.
  - **iPad → Web:** In der App eine Sicherung erstellen und in der Web-App wiederherstellen.
  - Verschlüsselte Sicherungen (PBKDF2-SHA256, 200.000 Runden + AES-256-GCM) sind in beide Richtungen kompatibel.
- Der PIN wird nicht übernommen. Beim ersten Start legt man einen neuen PIN fest.

## Projektstruktur

```
Finanzverwaltung.swiftpm/
├── Package.swift                 App-Definition (Bundle-ID, Icon, Face-ID-Berechtigung)
└── Sources/
    ├── App/                      Einstieg, Seitenleiste/Navigation, PIN- & Face-ID-Sperre
    ├── Core/                     Datenmodelle, DataStore (Persistenz), Sicherung/Verschlüsselung,
    │                             Formatierung (de-DE), Farbthemen
    ├── UI/                       Gemeinsame Bausteine (Kategorieauswahl, Eingabefelder, Kacheln …)
    ├── Modules/                  Ein Ordner je Modul (entspricht src/components/*.jsx)
    └── Resources/                App-Icon, Akzentfarbe
```

| Web-App (`src/components`) | iPad-App (`Sources/Modules`) |
|---|---|
| `BankAccounts.jsx` | `BankAccounts/` |
| `PdfImport.jsx` | `PdfImport/` |
| `Securities.jsx` | `Securities/` |
| `PortfolioPerformance.jsx` | `PortfolioPerformance/` |
| `InsuranceContracts.jsx` | `Insurance/` |
| `RecurringPayments.jsx` | `RecurringPayments/` |
| `Subscriptions.jsx` | `Subscriptions/` |
| `Categories.jsx` / `CategorySelect.jsx` | `Categories/` / `UI/CategoryPicker.swift` |
| `RealEstate.jsx` | `RealEstate/` |
| `CompanyShares.jsx` | `CompanyShares/` |
| `ServiceCostCalculator.jsx` | `ServiceCosts/` |
| `DataBackup.jsx` | `DataBackup/` |
| `Dashboard.jsx` | `Dashboard/` |
| `WealthChart.jsx` | `WealthChart/` |
| `ExpenseChart.jsx` | `ExpenseChart/` |
| `ExpenseTree.jsx` | `ExpenseTree/` |
| `PrintDialog.jsx` | `Print/` |

`Depots.jsx`, `TransactionAnalytics.jsx` und `TransactionPivot.jsx` werden in der Web-App nirgends eingebunden
und wurden deshalb nicht portiert.

## Technik

- SwiftUI, Swift Charts, PDFKit, CryptoKit, LocalAuthentication; Mindestversion iOS/iPadOS 17
- `DataStore` (`ObservableObject`) hält alle Daten und speichert jede Änderung automatisch (verzögert um 0,4 s,
  außerdem beim Wechsel in den Hintergrund)
- Die Modelle lesen Daten fehlertolerant ein (fehlende Felder, `null`, Zahlen als Strings, String-IDs wie `ins_123`),
  damit beliebige ältere Sicherungen der Web-App funktionieren
