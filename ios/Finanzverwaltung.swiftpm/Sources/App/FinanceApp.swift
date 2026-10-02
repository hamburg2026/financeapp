import SwiftUI

@main
struct FinanceApp: App {
    @StateObject private var store = DataStore()
    @StateObject private var lock = AppLock()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                if lock.isUnlocked {
                    RootView()
                } else {
                    PinScreen()
                }
            }
            .environmentObject(store)
            .environmentObject(lock)
            .onChange(of: scenePhase) { _, phase in
                switch phase {
                case .background:
                    store.save()
                    lock.lock()
                case .inactive:
                    store.save()
                default:
                    break
                }
            }
        }
    }
}

/// Hauptlayout: Seitenleiste mit Modulen (wie die Sidebar der Web-App) + Inhaltsbereich.
struct RootView: View {
    @EnvironmentObject private var store: DataStore
    @EnvironmentObject private var lock: AppLock
    @AppStorage(AppTheme.storageKey) private var themeID = "blue"
    @SceneStorage("currentModule") private var currentRaw = AppModule.dashboard.rawValue
    @State private var showPrint = false
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    private var theme: AppTheme { AppTheme.named(themeID) }

    private var selection: Binding<AppModule?> {
        Binding(
            get: { AppModule(rawValue: currentRaw) ?? .dashboard },
            set: { if let m = $0 { currentRaw = m.rawValue } }
        )
    }

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            sidebar
        } detail: {
            NavigationStack {
                (selection.wrappedValue ?? .dashboard).view
                    .id(currentRaw)
            }
        }
        .navigationSplitViewStyle(.balanced)
        .tint(theme.primary)
        .environment(\.appTheme, theme)
        .environment(\.navigate) { module in currentRaw = module.rawValue }
        .sheet(isPresented: $showPrint) {
            PrintDialogView()
                .environmentObject(store)
                .environment(\.appTheme, theme)
                .tint(theme.primary)
        }
        .overlay(alignment: .bottom) {
            if let err = store.lastError {
                Text(err)
                    .font(.footnote)
                    .padding(10)
                    .background(Color.expense.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding()
                    .onTapGesture { store.lastError = nil }
            }
        }
    }

    private var sidebar: some View {
        List(selection: selection) {
            ForEach(AppModule.groups) { group in
                Section(group.label) {
                    ForEach(group.items) { item in
                        Label(item.label, systemImage: item.systemImage)
                            .tag(Optional(item))
                    }
                }
            }

            Section {
                Label(AppModule.dataBackup.label, systemImage: AppModule.dataBackup.systemImage)
                    .tag(Optional(AppModule.dataBackup))
                Button {
                    showPrint = true
                } label: {
                    Label("Drucken", systemImage: "printer")
                }
                Button {
                    lock.lock()
                } label: {
                    Label("Sperren", systemImage: "lock")
                }
            }

            Section("Farbe") {
                HStack(spacing: 10) {
                    ForEach(AppTheme.all) { t in
                        Button {
                            themeID = t.id
                        } label: {
                            Circle()
                                .fill(t.primary)
                                .frame(width: 24, height: 24)
                                .overlay(Circle().stroke(Color.primary.opacity(themeID == t.id ? 0.8 : 0), lineWidth: 2).padding(-3))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(t.label)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Finanzverwaltung")
        .listStyle(.sidebar)
    }
}
