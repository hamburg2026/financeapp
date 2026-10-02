import SwiftUI
import UniformTypeIdentifiers

// Port von src/components/PdfImport.jsx (Oberfläche). Parser: PdfImportParsing.swift.

fileprivate enum PdfImportStep {
    case select, preview, done
}

fileprivate enum PdfImportPickerMode {
    case files, folder
}

fileprivate struct PdfImportPreviewItem: Identifiable {
    let id = UUID()
    var date: ISODate
    var amount: Double
    var description: String
    var recipient: String
    var category: String
    var isDuplicate: Bool
    var include: Bool
    var sourceFile: String
}

fileprivate struct PdfImportParsedFile: Sendable {
    let name: String
    let txs: [PdfImportParsedTx]
}

fileprivate struct PdfImportResult {
    let imported: Int
    let duplicatesSkipped: Int
    let manuallySkipped: Int
}

struct PdfImportView: View {
    @EnvironmentObject private var store: DataStore
    @Environment(\.navigate) private var navigate
    @Environment(\.appTheme) private var theme
    @Environment(\.horizontalSizeClass) private var hSize

    @State private var step: PdfImportStep = .select
    @State private var bankType: PdfImportBankType = .lufthansa
    @State private var selectedAccountId: EntityID?
    @State private var didInitAccount = false
    @State private var files: [PdfImportFile] = []
    @State private var parsing = false
    @State private var parseError = ""
    @State private var previewItems: [PdfImportPreviewItem] = []
    @State private var importResult: PdfImportResult?
    @State private var pickerMode: PdfImportPickerMode = .files
    @State private var showImporter = false

    var body: some View {
        stepContent
            .navigationTitle(navTitle)
            .fileImporter(isPresented: $showImporter, allowedContentTypes: importerTypes,
                          allowsMultipleSelection: true) { result in
                handlePicked(result)
            }
            .onAppear {
                if !didInitAccount {
                    didInitAccount = true
                    selectedAccountId = store.bankAccounts.first?.id
                }
            }
            .moduleBackground()
    }

    private var navTitle: String {
        switch step {
        case .select: return "PDF-Umsatzimport"
        case .preview: return "Umsätze prüfen & importieren"
        case .done: return "Import abgeschlossen"
        }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .select:
            selectStep
        case .preview:
            previewStep
        case .done:
            doneStep
        }
    }

    private var importerTypes: [UTType] {
        if pickerMode == .folder { return [.folder] }
        switch bankType {
        case .postbank: return [.commaSeparatedText]
        case .commerzbank: return [.pdf, .commaSeparatedText]
        case .lufthansa: return [.pdf]
        }
    }

    // MARK: - Schritt 1: Auswahl

    private var selectStep: some View {
        Form {
            Section {
                Text("Kontoauszüge und Kreditkartenabrechnungen als PDF importieren. Alle PDF-Dateien eines Ordners können auf einmal ausgewählt werden.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                Picker("Zielkonto *", selection: $selectedAccountId) {
                    Text("– Konto wählen –").tag(nil as EntityID?)
                    ForEach(store.bankAccounts) { a in
                        Text(a.name).tag(a.id as EntityID?)
                    }
                }
                if store.bankAccounts.isEmpty {
                    Text("Noch keine Konten vorhanden – bitte zuerst unter „Bankkonten“ anlegen.")
                        .font(.caption)
                        .foregroundStyle(Color.expense)
                    Button("Zu den Bankkonten") { navigate(.bankAccounts) }
                }
            }

            Section {
                Picker("Kontoauszug-Format", selection: $bankType) {
                    ForEach(PdfImportBankType.allCases) { t in
                        Text(t.label).tag(t)
                    }
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Kontoauszug-Format")
            } footer: {
                Text(bankType.hint)
            }

            filesSection

            if !parseError.isEmpty {
                Section {
                    Label(parseError, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.expense)
                        .font(.subheadline)
                }
            }

            Section {
                Button(action: handleParse) {
                    HStack(spacing: 8) {
                        if parsing {
                            ProgressView()
                            Text("Dateien werden gelesen…")
                        } else {
                            Image(systemName: "doc.text.magnifyingglass")
                            Text("\(files.count) Datei\(files.count != 1 ? "en" : "") analysieren")
                        }
                    }
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(theme.primary)
                .controlSize(.large)
                .disabled(parsing || files.isEmpty || selectedAccountId == nil)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
        }
        .frame(maxWidth: 720)
        .frame(maxWidth: .infinity)
    }

    private var filesSection: some View {
        Section {
            HStack(spacing: 10) {
                Button {
                    pickerMode = .files
                    showImporter = true
                } label: {
                    Label("Dateien wählen", systemImage: "doc.badge.plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(theme.primary)
                Button {
                    pickerMode = .folder
                    showImporter = true
                } label: {
                    Label("Ordner wählen", systemImage: "folder.badge.plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color.mutedText)
            }
            ForEach(files) { f in
                HStack(spacing: 8) {
                    Image(systemName: "doc.fill").foregroundStyle(Color.expense)
                    Text(f.name)
                        .font(.subheadline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                    Text("\(String(format: "%.0f", Double(f.size) / 1024)) KB")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button {
                        files.removeAll { $0.id == f.id }
                    } label: {
                        Image(systemName: "xmark").foregroundStyle(Color.expense)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Entfernen")
                }
            }
            .onDelete { offsets in files.remove(atOffsets: offsets) }
            if !files.isEmpty {
                Button("Alle entfernen", role: .destructive) { files = [] }
            }
        } header: {
            Text(bankType == .postbank ? "CSV-Datei" : "PDF-Dateien")
        }
    }

    // MARK: Dateiauswahl

    private func handlePicked(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            parseError = "Fehler beim Lesen der Datei: \(error.localizedDescription)"
        case .success(let urls):
            var newFiles: [PdfImportFile] = []
            var failed: [String] = []
            for url in urls {
                let access = url.startAccessingSecurityScopedResource()
                defer { if access { url.stopAccessingSecurityScopedResource() } }
                if pickerMode == .folder {
                    newFiles.append(contentsOf: collectPdfs(in: url))
                } else if let data = try? Data(contentsOf: url) {
                    newFiles.append(PdfImportFile(name: url.lastPathComponent, data: data))
                } else {
                    failed.append(url.lastPathComponent)
                }
            }
            let names = Set(files.map { $0.name })
            files.append(contentsOf: newFiles.filter { !names.contains($0.name) })
            if !failed.isEmpty {
                parseError = "Fehler beim Lesen der Datei: \(failed.joined(separator: ", "))"
            }
        }
    }

    /// Alle PDF-Dateien eines Ordners (inkl. Unterordner, wie `webkitdirectory`).
    private func collectPdfs(in folder: URL) -> [PdfImportFile] {
        guard let enumerator = FileManager.default.enumerator(
            at: folder, includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]) else { return [] }
        var urls: [URL] = []
        for case let fileURL as URL in enumerator where fileURL.pathExtension.lowercased() == "pdf" {
            urls.append(fileURL)
        }
        urls.sort { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
        var result: [PdfImportFile] = []
        for u in urls {
            if let data = try? Data(contentsOf: u) {
                result.append(PdfImportFile(name: u.lastPathComponent, data: data))
            }
        }
        return result
    }

    // MARK: Analyse

    private func handleParse() {
        guard let accId = selectedAccountId else {
            parseError = "Bitte zuerst ein Konto auswählen."
            return
        }
        guard !files.isEmpty else {
            parseError = "Bitte mindestens eine PDF-Datei auswählen."
            return
        }
        parseError = ""
        parsing = true
        let filesCopy = files
        let type = bankType
        let allTransactions = store.transactions
        Task {
            do {
                let parsed: [PdfImportParsedFile] = try await Task.detached(priority: .userInitiated) { () throws -> [PdfImportParsedFile] in
                    var out: [PdfImportParsedFile] = []
                    for f in filesCopy {
                        out.append(PdfImportParsedFile(name: f.name, txs: try pdfImportParseFile(f, bankType: type)))
                    }
                    return out
                }.value
                previewItems = buildPreview(parsed, accountId: accId, transactions: allTransactions)
                step = .preview
            } catch {
                parseError = "Fehler beim Lesen der Datei: \(error.localizedDescription)"
            }
            parsing = false
        }
    }

    private func buildPreview(_ parsed: [PdfImportParsedFile], accountId: EntityID,
                              transactions: [BankTransaction]) -> [PdfImportPreviewItem] {
        let lookup = PdfImportCategoryLookup(transactions: transactions)
        let existing = transactions.filter { $0.accountId == accountId }
        var all: [PdfImportPreviewItem] = []
        for file in parsed {
            for tx in file.txs {
                let dupExisting = existing.contains { pdfImportIsDuplicate(tx, date: $0.date, amount: $0.amount) }
                let dupParsed = all.contains { pdfImportIsDuplicate(tx, date: $0.date, amount: $0.amount) }
                let dup = dupExisting || dupParsed
                let cat = lookup.suggest(description: tx.description, recipient: tx.recipient)
                all.append(PdfImportPreviewItem(date: tx.date, amount: tx.amount, description: tx.description,
                                                recipient: tx.recipient, category: cat, isDuplicate: dup,
                                                include: !dup, sourceFile: file.name))
            }
        }
        // stabile Sortierung nach Datum
        return all.enumerated()
            .sorted { a, b in a.element.date != b.element.date ? a.element.date < b.element.date : a.offset < b.offset }
            .map { $0.element }
    }

    // MARK: - Schritt 2: Vorschau

    private var previewStep: some View {
        let toImportCount = previewItems.filter { $0.include }.count
        let dupCount = previewItems.filter { $0.isDuplicate }.count
        return VStack(spacing: 0) {
            HStack(spacing: 8) {
                PdfImportCountBadge(label: "Gefunden", value: previewItems.count, color: Color(hex: 0x3b82f6))
                PdfImportCountBadge(label: "Importieren", value: toImportCount, color: Color(hex: 0x16a34a))
                PdfImportCountBadge(label: "Duplikate", value: dupCount, color: Color(hex: 0xf59e0b))
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            if previewItems.isEmpty {
                ContentUnavailableView("Keine Umsätze erkannt", systemImage: "doc.questionmark",
                                       description: Text("Keine Umsätze erkannt. Bitte prüfen Sie das PDF-Format."))
            } else {
                previewList
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 10) {
                Button {
                    handleImport()
                } label: {
                    Text("\(toImportCount) \(toImportCount == 1 ? "Umsatz" : "Umsätze") importieren")
                        .fontWeight(.bold)
                }
                .buttonStyle(.borderedProminent)
                .tint(theme.primary)
                .disabled(toImportCount == 0)
                Button("Zurück") { reset() }
                    .buttonStyle(.bordered)
                Spacer()
            }
            .controlSize(.large)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.bar)
        }
    }

    private var allIncluded: Bool { previewItems.allSatisfy { $0.include } }

    private var previewList: some View {
        List {
            Section {
                ForEach($previewItems) { $item in
                    PdfImportPreviewRow(item: $item, regular: hSize == .regular)
                        .listRowBackground(rowBackground(item))
                }
            } header: {
                HStack(spacing: 10) {
                    Button {
                        let newValue = !allIncluded
                        for i in previewItems.indices {
                            previewItems[i].include = previewItems[i].isDuplicate ? false : newValue
                        }
                    } label: {
                        Image(systemName: allIncluded ? "checkmark.square.fill" : "square")
                            .font(.title3)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Alle auswählen")
                    if hSize == .regular {
                        previewColumnHeader
                    } else {
                        Text("Alle auswählen")
                    }
                }
                .textCase(nil)
            }
        }
        .listStyle(.plain)
    }

    private var previewColumnHeader: some View {
        HStack(spacing: 10) {
            Text("Datum").frame(width: 120, alignment: .leading)
            Text("Beschreibung").frame(maxWidth: .infinity, alignment: .leading)
            Text("Empfänger").frame(width: 140, alignment: .leading)
            Text("Betrag").frame(width: 150, alignment: .leading)
            Text("Kategorie").frame(width: 210, alignment: .leading)
            Text("Status").frame(width: 96, alignment: .leading)
        }
        .font(.caption.weight(.bold))
        .foregroundStyle(.secondary)
    }

    private func rowBackground(_ item: PdfImportPreviewItem) -> Color {
        if item.isDuplicate { return Color(hex: 0xfef3c7).opacity(0.7) }
        if !item.include { return Color(.secondarySystemBackground) }
        return Color(.systemBackground)
    }

    // MARK: Import

    private func handleImport() {
        let toImport = previewItems.filter { $0.include }
        guard !toImport.isEmpty, let accountId = selectedAccountId else { return }
        let newTxs = toImport.map { p in
            BankTransaction(accountId: accountId, date: p.date, description: p.description,
                            recipient: p.recipient, amount: p.amount, category: p.category)
        }
        let totalDelta = newTxs.reduce(0.0) { $0 + $1.amount }
        store.transactions.append(contentsOf: newTxs)
        if let i = store.bankAccounts.firstIndex(where: { $0.id == accountId }) {
            store.bankAccounts[i].balance += totalDelta
        }
        importResult = PdfImportResult(
            imported: newTxs.count,
            duplicatesSkipped: previewItems.filter { $0.isDuplicate }.count,
            manuallySkipped: previewItems.filter { !$0.include && !$0.isDuplicate }.count
        )
        step = .done
    }

    private func reset() {
        step = .select
        files = []
        previewItems = []
        importResult = nil
        parseError = ""
    }

    // MARK: - Schritt 3: Ergebnis

    @ViewBuilder
    private var doneStep: some View {
        if let r = importResult {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    PdfImportResultRow(icon: "checkmark", label: "Importiert", value: r.imported,
                                       color: Color(hex: 0x16a34a))
                    PdfImportResultRow(icon: "exclamationmark.triangle", label: "Duplikate übersprungen",
                                       value: r.duplicatesSkipped, color: Color(hex: 0xf59e0b))
                    PdfImportResultRow(icon: "minus", label: "Manuell übersprungen", value: r.manuallySkipped,
                                       color: Color(hex: 0x6b7280))
                    VStack(alignment: .leading, spacing: 10) {
                        Button {
                            reset()
                        } label: {
                            Label("Weitere PDFs importieren", systemImage: "arrow.counterclockwise")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(theme.primary)
                        HStack(spacing: 10) {
                            Button("Zu den Umsätzen") { navigate(.bankAccounts) }
                                .buttonStyle(.bordered)
                            Button("Zur Auswertung") { navigate(.expenseTree) }
                                .buttonStyle(.bordered)
                        }
                    }
                    .controlSize(.large)
                    .padding(.top, 14)
                }
                .frame(maxWidth: 420, alignment: .leading)
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            EmptyView()
        }
    }
}

// MARK: - Bausteine

fileprivate struct PdfImportCountBadge: View {
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Text("\(value)").fontWeight(.semibold).foregroundStyle(color)
            Text(label).foregroundStyle(.secondary)
        }
        .font(.subheadline)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(color.opacity(0.25)))
    }
}

fileprivate struct PdfImportResultRow: View {
    let icon: String
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
            Spacer()
            Text("\(value)").font(.title3.weight(.bold)).foregroundStyle(color)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(color.opacity(0.2)))
    }
}

fileprivate struct PdfImportPreviewRow: View {
    @EnvironmentObject private var store: DataStore
    @Binding var item: PdfImportPreviewItem
    let regular: Bool

    /// Betragsfeld zeigt den Absolutwert; Vorzeichen bleibt erhalten (wie in der Web-App).
    private var absAmount: Binding<Double?> {
        Binding(get: { abs(item.amount) }, set: { v in
            let a = abs(v ?? 0)
            item.amount = item.amount < 0 ? -a : a
        })
    }

    private var signBinding: Binding<Double> {
        Binding(get: { item.amount < 0 ? -1 : 1 }, set: { _ in item.amount = -item.amount })
    }

    var body: some View {
        Group {
            if regular {
                regularBody
            } else {
                compactBody
            }
        }
        .opacity(item.include ? 1 : 0.6)
    }

    private var includeToggle: some View {
        Button {
            item.include.toggle()
        } label: {
            Image(systemName: item.include ? "checkmark.square.fill" : "square")
                .font(.title3)
        }
        .buttonStyle(.borderless)
        .accessibilityLabel("Importieren")
    }

    private var amountField: some View {
        HStack(spacing: 6) {
            DecimalField("Betrag", value: absAmount, maxDecimals: 2)
            SignToggle(sign: signBinding)
        }
    }

    private var categoryField: some View {
        HStack(spacing: 4) {
            CategoryNamePicker(selection: $item.category, placeholder: "– keine –")
            if let ct = store.category(named: item.category)?.type {
                Badge(text: ct == .expense ? "Ausg." : "Einnh.",
                      color: ct == .expense ? Color.expense : Color.income)
            }
        }
    }

    @ViewBuilder
    private var statusBadge: some View {
        if item.isDuplicate {
            Badge(text: "Duplikat", color: Color(hex: 0x92400e), background: Color(hex: 0xfef3c7))
        } else if item.include {
            Badge(text: "Importieren", color: Color(hex: 0x15803d), background: Color(hex: 0xdcfce7))
        } else {
            Badge(text: "Überspringen", color: Color.mutedText, background: Color(hex: 0xf3f4f6))
        }
    }

    private var regularBody: some View {
        HStack(spacing: 10) {
            includeToggle
            ISODatePicker("Datum", date: $item.date)
                .labelsHidden()
                .frame(width: 120, alignment: .leading)
            TextField("Beschreibung", text: $item.description)
                .font(.callout)
                .frame(maxWidth: .infinity)
            TextField("Empfänger", text: $item.recipient, prompt: Text("–"))
                .font(.callout)
                .frame(width: 140)
            amountField
                .frame(width: 150)
            categoryField
                .font(.callout)
                .frame(width: 210)
            statusBadge
                .frame(width: 96, alignment: .leading)
        }
    }

    private var compactBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                includeToggle
                ISODatePicker("Datum", date: $item.date)
                    .labelsHidden()
                Spacer()
                statusBadge
            }
            TextField("Beschreibung", text: $item.description, axis: .vertical)
                .font(.callout)
                .lineLimit(1...3)
            HStack(spacing: 8) {
                TextField("Empfänger", text: $item.recipient, prompt: Text("Empfänger –"))
                    .font(.callout)
                amountField
                    .frame(width: 150)
            }
            categoryField
                .font(.callout)
        }
        .padding(.vertical, 4)
    }
}
