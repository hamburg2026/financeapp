import SwiftUI
import UIKit

// Port von `src/components/PrintDialog.jsx`: Bereichsauswahl + Ausdruck.
// Der Ausdruck wird als HTML (gleiches Layout wie die Print-Ansicht der Web-App) erzeugt und über
// `UIPrintInteractionController` gedruckt bzw. als PDF geteilt.

struct PrintDialogView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appTheme) private var theme

    @State private var selected: Set<PrintReportSection> = Set(PrintReportSection.allCases)
    @State private var svcFilterType: EntityID? = nil
    @State private var svcFilterFrom: ISODate = ""
    @State private var svcFilterTo: ISODate = ""
    @State private var shareItem: PrintShareItem?
    @State private var errorMessage: String?

    private var anySelected: Bool { !selected.isEmpty }

    private var serviceFilter: PrintReportServiceFilter {
        PrintReportServiceFilter(typeId: svcFilterType, from: svcFilterFrom, to: svcFilterTo)
    }

    var body: some View {
        NavigationStack {
            Form {
                selectionSection
                if selected.contains(.serviceCosts) {
                    serviceFilterSection
                }
                previewSection
                actionSection
            }
            .navigationTitle("Ausdruck erstellen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Drucken") { printReport() }
                        .disabled(!anySelected)
                }
            }
            .sheet(item: $shareItem) { item in
                PrintActivitySheet(items: [item.url])
                    .ignoresSafeArea()
            }
            .alert("Fehler", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK", role: .cancel) { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: Abschnitte

    private var selectionSection: some View {
        Section {
            ForEach(PrintReportSection.allCases) { s in
                Toggle(isOn: binding(for: s)) {
                    HStack(spacing: 10) {
                        Text(s.icon)
                        Text(s.label)
                    }
                }
            }
        } header: {
            Text("Bereiche auswählen, die im Ausdruck enthalten sein sollen:")
                .textCase(nil)
        } footer: {
            HStack(spacing: 10) {
                Button("Alle auswählen") { selected = Set(PrintReportSection.allCases) }
                Button("Alle abwählen") { selected = [] }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .padding(.top, 4)
        }
    }

    private var serviceFilterSection: some View {
        Section("🧹 Filter Dienstleistungskosten") {
            Picker("Art", selection: $svcFilterType) {
                Text("Alle").tag(EntityID?.none)
                ForEach(store.serviceTypes) { t in
                    Text(t.name).tag(EntityID?.some(t.id))
                }
            }
            OptionalISODatePicker("Von", date: $svcFilterFrom)
            OptionalISODatePicker("Bis", date: $svcFilterTo)
        }
    }

    private var previewSection: some View {
        Section {
            if anySelected {
                ForEach(PrintReportSection.allCases.filter { selected.contains($0) }) { s in
                    LabeledContent {
                        Text(summary(for: s))
                            .multilineTextAlignment(.trailing)
                    } label: {
                        HStack(spacing: 10) {
                            Text(s.icon)
                            Text(s.label)
                        }
                    }
                }
            } else {
                Text("Kein Bereich ausgewählt.")
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Inhalt des Ausdrucks")
        }
    }

    private var actionSection: some View {
        Section {
            Button {
                printReport()
            } label: {
                Label("Drucken", systemImage: "printer")
                    .frame(maxWidth: .infinity)
                    .fontWeight(.semibold)
            }
            .disabled(!anySelected)
            Button {
                sharePDF()
            } label: {
                Label("Als PDF teilen", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .disabled(!anySelected)
        }
    }

    private func binding(for s: PrintReportSection) -> Binding<Bool> {
        Binding(
            get: { selected.contains(s) },
            set: { on in
                if on { selected.insert(s) } else { selected.remove(s) }
            }
        )
    }

    // MARK: Vorschau-Zusammenfassung

    private func summary(for s: PrintReportSection) -> String {
        switch s {
        case .bankAccounts:
            let n = store.bankAccounts.count
            return n == 0 ? "Keine Einträge" : "\(n) \(n == 1 ? "Konto" : "Konten") · \(fmt(store.bankAccounts.reduce(0.0) { $0 + $1.latestBalance }))"
        case .insuranceContracts:
            let n = store.insuranceContracts.count
            return n == 0 ? "Keine Versicherungen" : "\(n) \(n == 1 ? "Vertrag" : "Verträge")"
        case .securities:
            if store.securities.isEmpty && store.depots.isEmpty { return "Keine Wertpapiere oder Depots" }
            return "\(store.securities.count) Wertpapiere · \(store.depots.count) Depots"
        case .realEstate:
            let n = store.realEstate.count
            return n == 0 ? "Keine Einträge" : "\(n) \(n == 1 ? "Objekt" : "Objekte")"
        case .companyShares:
            let n = store.companyShares.count
            return n == 0 ? "Keine Einträge" : "\(n) \(n == 1 ? "Beteiligung" : "Beteiligungen") · \(fmt(store.companyShares.reduce(0.0) { $0 + $1.currentValue }))"
        case .subscriptions:
            let n = store.subscriptions.count
            return n == 0 ? "Keine Einträge" : "\(n) \(n == 1 ? "Abonnement" : "Abonnements")"
        case .recurringPayments:
            let n = store.recurringPayments.count
            return n == 0 ? "Keine Einträge" : "\(n) \(n == 1 ? "Dauerauftrag" : "Daueraufträge")"
        case .serviceCosts:
            let list = serviceFilter.apply(store.serviceEntries)
            return list.isEmpty ? "Keine Einträge" : "\(list.count) Einträge · \(fmt(list.reduce(0.0) { $0 + $1.total }))"
        case .categories:
            let n = store.categories.count
            return n == 0 ? "Keine Kategorien" : "\(n) Kategorien"
        }
    }

    // MARK: Drucken / PDF

    private func makeHTML() -> String {
        PrintReportBuilder.html(store: store, selected: selected, serviceFilter: serviceFilter)
    }

    private func printReport() {
        guard anySelected else { return }
        PrintOutput.print(html: makeHTML())
    }

    private func sharePDF() {
        guard anySelected else { return }
        let data = PrintOutput.pdfData(html: makeHTML())
        let name = "Finanzverwaltung-Ausdruck-\(ISODates.today()).pdf"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try data.write(to: url, options: .atomic)
            shareItem = PrintShareItem(url: url)
        } catch {
            errorMessage = "PDF konnte nicht erstellt werden: \(error.localizedDescription)"
        }
    }
}

// MARK: - Druck-Ausgabe (UIKit)

fileprivate struct PrintShareItem: Identifiable {
    let id = UUID()
    let url: URL
}

@MainActor
fileprivate enum PrintOutput {
    /// DIN A4 in Punkt.
    static let paper = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
    /// @page { margin: 0.9cm 1.0cm 1.0cm }
    static let insets = UIEdgeInsets(top: 25.5, left: 28.35, bottom: 28.35, right: 28.35)
    static let jobName = "Finanzverwaltung – Ausdruck"

    static func print(html: String) {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = jobName
        info.orientation = .portrait
        controller.printInfo = info
        let formatter = UIMarkupTextPrintFormatter(markupText: html)
        formatter.perPageContentInsets = insets
        controller.printFormatter = formatter
        controller.present(animated: true, completionHandler: nil)
    }

    static func pdfData(html: String) -> Data {
        let formatter = UIMarkupTextPrintFormatter(markupText: html)
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(formatter, startingAtPageAt: 0)
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: paper.inset(by: insets)), forKey: "printableRect")

        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, [kCGPDFContextTitle as String: jobName])
        let pages = renderer.numberOfPages
        if pages > 0 {
            renderer.prepare(forDrawingPages: NSRange(location: 0, length: pages))
            let bounds = UIGraphicsGetPDFContextBounds()
            for i in 0..<pages {
                UIGraphicsBeginPDFPage()
                renderer.drawPage(at: i, in: bounds)
            }
        } else {
            UIGraphicsBeginPDFPage()
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }
}

/// Teilen-Dialog (UIActivityViewController) für die PDF-Datei.
fileprivate struct PrintActivitySheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
