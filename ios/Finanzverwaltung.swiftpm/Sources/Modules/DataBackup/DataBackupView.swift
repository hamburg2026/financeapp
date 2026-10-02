import SwiftUI
import UniformTypeIdentifiers

// Port von `src/components/DataBackup.jsx` (+ Einstellung für Face ID / Touch ID).

/// Datensicherung: Export (Bereichsauswahl, optional AES-256-verschlüsselt), Wiederherstellung
/// (auch verschlüsselter Web-App-Sicherungen), Löschen aller Daten und Sicherheitseinstellungen.
struct DataBackupView: View {
    @EnvironmentObject private var store: DataStore
    @EnvironmentObject private var lock: AppLock
    @Environment(\.appTheme) private var theme

    // Export
    @State private var selectedSections: Set<String> = Set(BackupSection.all.map(\.id))
    @State private var password = ""
    @State private var showPassword = false
    @State private var isExporting = false
    @State private var exportDocument: DataBackupFileDocument? = nil
    @State private var exportFilename = ""
    @State private var exportURL: URL? = nil
    @State private var showExporter = false

    // Wiederherstellung
    @State private var showImporter = false
    @State private var pendingRestore: DataBackupPendingFile? = nil

    // Sonstiges
    @State private var showResetConfirm = false
    @State private var alertMessage: String? = nil
    @State private var statusMessage: String? = nil

    var body: some View {
        Form {
            if let statusMessage {
                Section {
                    Label(statusMessage, systemImage: "checkmark.circle.fill")
                        .foregroundStyle(Color.income)
                }
            }
            exportSectionPicker
            exportSection
            restoreSection
            statsSection
            securitySection
            resetSection
        }
        .navigationTitle("Datensicherung")
        .moduleBackground()
        .sheet(item: $pendingRestore) { file in
            DataBackupRestoreSheet(file: file) { snapshot, keys in
                performRestore(snapshot, keys: keys)
            }
            .environment(\.appTheme, theme)
            .tint(theme.primary)
        }
        .confirmationDialog("Alle lokalen Daten unwiderruflich löschen? Vorher bitte sichern!",
                            isPresented: $showResetConfirm, titleVisibility: .visible) {
            Button("Alle Daten löschen", role: .destructive, action: resetAll)
            Button("Abbrechen", role: .cancel) {}
        }
        .alert("Datensicherung", isPresented: alertBinding) {
            Button("OK", role: .cancel) { alertMessage = nil }
        } message: {
            Text(alertMessage ?? "")
        }
    }

    private var alertBinding: Binding<Bool> {
        Binding(get: { alertMessage != nil }, set: { if !$0 { alertMessage = nil } })
    }

    // MARK: - Export

    private var exportSectionPicker: some View {
        Section {
            ForEach(BackupSection.all) { sec in
                DataBackupCheckRow(label: sec.label, checked: selectedSections.contains(sec.id)) {
                    if selectedSections.contains(sec.id) { selectedSections.remove(sec.id) } else { selectedSections.insert(sec.id) }
                }
            }
        } header: {
            HStack {
                Text("Bereiche für Export auswählen")
                Spacer()
                DataBackupAllNoneButtons(
                    onAll: { selectedSections = Set(BackupSection.all.map(\.id)) },
                    onNone: { selectedSections = [] }
                )
            }
        }
    }

    private var exportButtonTitle: String {
        let n = selectedSections.count
        let total = BackupSection.all.count
        return "Sicherung exportieren " + (n < total ? "(\(n)/\(total))" : "(alles)")
    }

    private var exportSection: some View {
        Section {
            HStack {
                Group {
                    if showPassword {
                        TextField("Passwort (optional)", text: $password)
                    } else {
                        SecureField("Passwort (optional)", text: $password)
                    }
                }
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                Button {
                    showPassword.toggle()
                } label: {
                    Image(systemName: showPassword ? "eye.slash" : "eye").foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel(showPassword ? "Verbergen" : "Anzeigen")
            }
            Button(action: startExport) {
                HStack {
                    Label(exportButtonTitle, systemImage: "square.and.arrow.up")
                    Spacer()
                    if isExporting { ProgressView() }
                }
            }
            .disabled(isExporting)
            // Datei-Dialoge an unterschiedlichen Views (mehrere an derselben View stören sich)
            .fileExporter(isPresented: $showExporter, document: exportDocument, contentType: .json,
                          defaultFilename: exportFilename) { result in
                switch result {
                case .success:
                    statusMessage = "Sicherung gespeichert."
                case .failure(let error):
                    if (error as? CocoaError)?.code == .userCancelled { return }
                    alertMessage = "Sicherung konnte nicht gespeichert werden: \(error.localizedDescription)"
                }
            }
            if let url = exportURL {
                ShareLink(item: url) {
                    Label("„\(url.lastPathComponent)“ teilen …", systemImage: "square.and.arrow.up.on.square")
                }
            }
        } header: {
            Text("Sicherung erstellen")
        } footer: {
            Text("Mit Passwort wird die Sicherung verschlüsselt (AES-256). Ohne Passwort wird unverschlüsselt gespeichert. Die Sicherungsdatei ist mit der Web-App kompatibel.")
        }
    }

    private func startExport() {
        let keys = Set(BackupSection.all.filter { selectedSections.contains($0.id) }.flatMap(\.keys))
        guard !keys.isEmpty else {
            alertMessage = "Bitte mindestens einen Bereich auswählen."
            return
        }
        let plaintext: Data
        do {
            plaintext = try store.snapshot(keys: keys).encodedFile()
        } catch {
            alertMessage = "Sicherung fehlgeschlagen: \(error.localizedDescription)"
            return
        }
        let pw = password
        let encrypted = !pw.isEmpty
        let filename = "financeapp-sicherung-\(ISODates.today())" + (encrypted ? ".enc.json" : ".json")
        isExporting = true
        statusMessage = nil
        Task {
            let result: Result<Data, Error> = await Task.detached(priority: .userInitiated) { () -> Result<Data, Error> in
                if pw.isEmpty { return .success(plaintext) }
                do {
                    return .success(try BackupCrypto.encrypt(plaintext, password: pw))
                } catch {
                    return .failure(error)
                }
            }.value
            isExporting = false
            switch result {
            case .success(let data):
                finishExport(data, filename: filename)
            case .failure(let error):
                alertMessage = "Verschlüsselung fehlgeschlagen: \(error.localizedDescription)"
            }
        }
    }

    private func finishExport(_ data: Data, filename: String) {
        // Kopie im temporären Ordner für „Teilen“ (AirDrop, Mail, …)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            exportURL = nil
        }
        exportFilename = filename
        exportDocument = DataBackupFileDocument(data: data)
        showExporter = true
    }

    // MARK: - Wiederherstellung

    private var restoreSection: some View {
        Section {
            Button {
                showImporter = true
            } label: {
                Label("Sicherung wiederherstellen", systemImage: "square.and.arrow.down")
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json],
                          allowsMultipleSelection: false) { result in
                handleImport(result)
            }
        } header: {
            Text("Wiederherstellen")
        } footer: {
            Text("Unterstützt unverschlüsselte und verschlüsselte Sicherungen der Web-App und dieser App. Vor dem Wiederherstellen können einzelne Bereiche ausgewählt werden.")
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure(let error):
            alertMessage = "Datei konnte nicht geöffnet werden: \(error.localizedDescription)"
        case .success(let urls):
            guard let url = urls.first else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else {
                alertMessage = "Sicherungsdatei konnte nicht gelesen werden."
                return
            }
            if BackupCrypto.isEncrypted(data) {
                pendingRestore = DataBackupPendingFile(data: data, snapshot: nil, exportedAt: nil)
            } else {
                do {
                    let snapshot = try BackupSnapshot.decode(from: data)
                    pendingRestore = DataBackupPendingFile(data: data, snapshot: snapshot,
                                                           exportedAt: dataBackupExportedAt(data))
                } catch {
                    alertMessage = "Sicherungsdatei konnte nicht gelesen werden."
                }
            }
        }
    }

    private func performRestore(_ snapshot: BackupSnapshot, keys: Set<BackupKey>) {
        let effective = keys.intersection(snapshot.presentKeys)
        guard !effective.isEmpty else {
            alertMessage = "Keine Daten zum Wiederherstellen ausgewählt."
            return
        }
        store.restore(snapshot, keys: effective)
        pendingRestore = nil
        statusMessage = "Sicherung wurde wiederhergestellt."
    }

    // MARK: - Gespeicherte Daten

    private var statsSection: some View {
        Section {
            DataBackupStatRow(label: "Bankkonten", count: store.bankAccounts.count)
            DataBackupStatRow(label: "Umsätze", count: store.transactions.count)
            DataBackupStatRow(label: "Kategorien", count: store.categories.count)
            DataBackupStatRow(label: "Daueraufträge", count: store.recurringPayments.count)
            DataBackupStatRow(label: "Depots", count: store.depots.count)
            DataBackupStatRow(label: "Wertpapiere", count: store.securities.count)
            DataBackupStatRow(label: "Depot-Transaktionen", count: store.depotTransactions.count)
            DataBackupStatRow(label: "Versicherungen", count: store.insuranceContracts.count)
            DataBackupStatRow(label: "Abonnements", count: store.subscriptions.count)
            DataBackupStatRow(label: "Immobilien", count: store.realEstate.count)
            DataBackupStatRow(label: "Firmenbeteiligungen", count: store.companyShares.count)
            DataBackupStatRow(label: "Dienstleistungseinträge", count: store.serviceEntries.count)
        } header: {
            Text("Gespeicherte Daten")
        } footer: {
            Text("Alle Daten werden ausschließlich lokal auf diesem Gerät gespeichert (\(DataStore.defaultFileURL.lastPathComponent)).")
        }
    }

    // MARK: - Sicherheit

    private var biometricsBinding: Binding<Bool> {
        Binding(get: { lock.biometricsEnabled }, set: { lock.biometricsEnabled = $0 })
    }

    private var securitySection: some View {
        Section {
            Toggle(isOn: biometricsBinding) {
                Label("Mit \(lock.biometryLabel) entsperren", systemImage: "faceid")
            }
            .disabled(!lock.biometryAvailable)
        } header: {
            Text("Sicherheit")
        } footer: {
            if lock.biometryAvailable {
                Text("Die App ist zusätzlich immer mit dem PIN entsperrbar.")
            } else {
                Text("Auf diesem Gerät ist keine biometrische Entsperrung verfügbar oder eingerichtet. Die App wird mit dem PIN entsperrt.")
            }
        }
    }

    // MARK: - Alle Daten löschen

    private var resetSection: some View {
        Section {
            Button(role: .destructive) {
                showResetConfirm = true
            } label: {
                Label("Alle Daten löschen", systemImage: "trash")
            }
        } footer: {
            Text("„Alle Daten löschen“ löscht alle Daten dauerhaft. Vorher bitte sichern!")
        }
    }

    private func resetAll() {
        var s = BackupSnapshot()
        s.bankAccounts = []
        s.transactions = []
        s.categories = []
        s.recurringPayments = []
        s.depots = []
        s.depotTransactions = []
        s.securityPrices = [:]
        s.securities = []
        s.fxRates = [:]
        s.insuranceContracts = []
        s.insurancePersons = DataStore.defaultPersons
        s.realEstate = []
        s.companyShares = []
        s.subscriptions = []
        s.serviceEntries = []
        s.serviceTypes = ServiceType.defaults
        s.banks = []
        s.liquidityLevels = [:]
        store.restore(s, keys: Set(BackupKey.allCases))
        exportURL = nil
        statusMessage = "Alle Daten wurden gelöscht."
    }
}

// MARK: - Hilfsfunktionen

/// `exportedAt` aus einer (entschlüsselten) Sicherungsdatei lesen.
private func dataBackupExportedAt(_ data: Data) -> String? {
    guard let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let raw = obj["exportedAt"] as? String, !raw.isEmpty else { return nil }
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    guard let date = withFraction.date(from: raw) ?? plain.date(from: raw) else { return raw }
    let f = DateFormatter()
    f.locale = Locale(identifier: "de_DE")
    f.dateStyle = .medium
    f.timeStyle = .medium
    return f.string(from: date)
}

private struct DataBackupFileDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

private struct DataBackupPendingFile: Identifiable {
    let id = UUID()
    let data: Data
    /// Bereits gelesener Inhalt (nil = verschlüsselt, Passwort erforderlich).
    let snapshot: BackupSnapshot?
    let exportedAt: String?
}

private struct DataBackupCheckRow: View {
    let label: String
    let checked: Bool
    let action: () -> Void
    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: checked ? "checkmark.square.fill" : "square")
                    .foregroundStyle(checked ? theme.primary : Color.secondary)
                    .font(.title3)
                Text(label).foregroundStyle(.primary)
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct DataBackupAllNoneButtons: View {
    let onAll: () -> Void
    let onNone: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Button("Alle", action: onAll)
            Button("Keine", action: onNone)
        }
        .buttonStyle(.bordered)
        .controlSize(.mini)
        .textCase(nil)
    }
}

private struct DataBackupStatRow: View {
    let label: String
    let count: Int

    var body: some View {
        LabeledContent(label) {
            Text("\(count)").monospacedDigit()
        }
    }
}

// MARK: - Wiederherstellen-Dialog

@MainActor
private struct DataBackupRestoreSheet: View {
    let file: DataBackupPendingFile
    let onRestore: (BackupSnapshot, Set<BackupKey>) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var snapshot: BackupSnapshot? = nil
    @State private var exportedAt: String? = nil
    @State private var restorePassword = ""
    @State private var error: String? = nil
    @State private var isDecrypting = false
    @State private var selected: Set<String> = []
    @State private var confirm = false
    @FocusState private var passwordFocused: Bool

    init(file: DataBackupPendingFile, onRestore: @escaping (BackupSnapshot, Set<BackupKey>) -> Void) {
        self.file = file
        self.onRestore = onRestore
        self._snapshot = State(initialValue: file.snapshot)
        self._exportedAt = State(initialValue: file.exportedAt)
        self._selected = State(initialValue: Set((file.snapshot?.availableSections ?? []).map(\.id)))
    }

    private var available: [BackupSection] { snapshot?.availableSections ?? [] }

    private var selectedKeys: Set<BackupKey> {
        Set(available.filter { selected.contains($0.id) }.flatMap(\.keys))
    }

    var body: some View {
        NavigationStack {
            Form {
                if let exportedAt {
                    Section {
                        LabeledContent("Exportiert am:", value: exportedAt)
                    }
                }
                if snapshot == nil {
                    passwordSection
                } else if available.isEmpty {
                    Section {
                        Text("Keine bekannten Daten in der Sicherungsdatei gefunden.")
                            .foregroundStyle(Color.expense)
                    }
                } else {
                    sectionsSection
                }
            }
            .navigationTitle("Sicherung wiederherstellen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if snapshot != nil {
                        Button("Wiederherstellen (\(selected.count))") { confirm = true }
                            .disabled(selected.isEmpty)
                    }
                }
            }
            .confirmationDialog("Ausgewählte Bereiche wiederherstellen?", isPresented: $confirm, titleVisibility: .visible) {
                Button("Wiederherstellen", role: .destructive) {
                    if let snapshot { onRestore(snapshot, selectedKeys) }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Die vorhandenen Daten der ausgewählten Bereiche werden durch die Sicherung ersetzt.")
            }
        }
        .interactiveDismissDisabled(isDecrypting)
    }

    private var passwordSection: some View {
        Section {
            SecureField("Passwort", text: $restorePassword)
                .focused($passwordFocused)
                .onSubmit(decrypt)
                .textContentType(.password)
            Button(action: decrypt) {
                HStack {
                    Text("Entschlüsseln")
                    Spacer()
                    if isDecrypting { ProgressView() }
                }
            }
            .disabled(isDecrypting || restorePassword.isEmpty)
        } header: {
            Text("Diese Datei ist verschlüsselt. Bitte Passwort eingeben:")
                .textCase(nil)
        } footer: {
            if let error {
                Text(error).foregroundStyle(Color.expense)
            }
        }
        .onAppear { passwordFocused = true }
    }

    private var sectionsSection: some View {
        Section {
            ForEach(available) { sec in
                DataBackupCheckRow(label: sec.label, checked: selected.contains(sec.id)) {
                    if selected.contains(sec.id) { selected.remove(sec.id) } else { selected.insert(sec.id) }
                }
            }
        } header: {
            HStack {
                Text("Bereiche wiederherstellen")
                Spacer()
                DataBackupAllNoneButtons(
                    onAll: { selected = Set(available.map(\.id)) },
                    onNone: { selected = [] }
                )
            }
        }
    }

    private func decrypt() {
        guard !isDecrypting, !restorePassword.isEmpty else { return }
        let data = file.data
        let pw = restorePassword
        isDecrypting = true
        error = nil
        Task {
            let result: Result<Data, Error> = await Task.detached(priority: .userInitiated) { () -> Result<Data, Error> in
                do {
                    return .success(try BackupCrypto.decrypt(data, password: pw))
                } catch {
                    return .failure(error)
                }
            }.value
            isDecrypting = false
            switch result {
            case .success(let plain):
                do {
                    let decoded = try BackupSnapshot.decode(from: plain)
                    snapshot = decoded
                    exportedAt = dataBackupExportedAt(plain)
                    selected = Set(decoded.availableSections.map(\.id))
                } catch {
                    self.error = "Falsches Passwort oder beschädigte Datei."
                }
            case .failure:
                error = "Falsches Passwort oder beschädigte Datei."
            }
        }
    }
}
