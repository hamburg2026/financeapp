import SwiftUI
import CryptoKit
import LocalAuthentication

/// PIN-Sperre (wie `PinScreen` der Web-App), zusätzlich mit Face ID / Touch ID.
///
/// Der PIN wird nur als gesalzener SHA-256-Hash in den UserDefaults abgelegt.
@MainActor
final class AppLock: ObservableObject {
    @Published private(set) var isUnlocked = false

    private let pinKey = "app_pin_hash_sha256"
    private let biometricsKey = "app_biometrics_enabled"

    var hasPin: Bool { UserDefaults.standard.string(forKey: pinKey) != nil }

    var biometricsEnabled: Bool {
        get { (UserDefaults.standard.object(forKey: biometricsKey) as? Bool) ?? true }
        set { UserDefaults.standard.set(newValue, forKey: biometricsKey); objectWillChange.send() }
    }

    var biometryAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
    }

    var biometryLabel: String {
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch ctx.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Biometrie"
        }
    }

    private func hash(_ pin: String) -> String {
        let digest = SHA256.hash(data: Data((pin + "::financeapp::2026").utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    func verify(_ pin: String) -> Bool {
        guard hash(pin) == UserDefaults.standard.string(forKey: pinKey) else { return false }
        isUnlocked = true
        return true
    }

    func setPin(_ pin: String) {
        UserDefaults.standard.set(hash(pin), forKey: pinKey)
        isUnlocked = true
    }

    func lock() { isUnlocked = false }

    func unlockWithBiometrics() {
        guard hasPin, biometricsEnabled else { return }
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "PIN eingeben"
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return }
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                           localizedReason: "Finanzverwaltung entsperren") { success, _ in
            Task { @MainActor in
                if success { self.isUnlocked = true }
            }
        }
    }
}

/// Sperrbildschirm: PIN eingeben bzw. beim ersten Start festlegen.
struct PinScreen: View {
    @EnvironmentObject private var lock: AppLock
    @AppStorage(AppTheme.storageKey) private var themeID = "blue"

    private enum Step { case enter, set1, set2 }

    @State private var step: Step = .enter
    @State private var pin1 = ""
    @State private var pin2 = ""
    @State private var error = ""
    @FocusState private var focused: Bool

    private var theme: AppTheme { AppTheme.named(themeID) }

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            VStack(spacing: 14) {
                Image(systemName: step == .enter ? "lock.fill" : "lock.badge.plus")
                    .font(.system(size: 44))
                    .foregroundStyle(theme.primary)
                Text(step == .enter ? "Finanzverwaltung" : "PIN einrichten")
                    .font(.title2.bold())
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                SecureField("••••", text: step == .set2 ? $pin2 : $pin1)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .font(.system(size: 28, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .padding(10)
                    .background(Color(.systemBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.borderGray))
                    .focused($focused)
                    .onSubmit(submit)
                    .onChange(of: pin1) { _, _ in error = "" }
                    .onChange(of: pin2) { _, _ in error = "" }

                if !error.isEmpty {
                    Text(error).font(.footnote).foregroundStyle(Color.expense)
                }

                Button(action: submit) {
                    Text(buttonTitle)
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .tint(theme.primary)

                if step == .enter && lock.biometricsEnabled && lock.biometryAvailable {
                    Button {
                        lock.unlockWithBiometrics()
                    } label: {
                        Label("Mit \(lock.biometryLabel) entsperren", systemImage: "faceid")
                    }
                    .padding(.top, 4)
                }
            }
            .padding(32)
            .frame(maxWidth: 380)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(0.1), radius: 16, y: 8)
            .padding()
        }
        .onAppear {
            step = lock.hasPin ? .enter : .set1
            focused = true
            if lock.hasPin { lock.unlockWithBiometrics() }
        }
    }

    private var subtitle: String {
        switch step {
        case .enter: return "PIN eingeben"
        case .set1: return "Wähle einen PIN (mind. 4 Stellen)"
        case .set2: return "PIN zur Bestätigung wiederholen"
        }
    }

    private var buttonTitle: String {
        switch step {
        case .enter: return "Entsperren"
        case .set1: return "Weiter"
        case .set2: return "PIN speichern"
        }
    }

    private func submit() {
        switch step {
        case .enter:
            if !lock.verify(pin1) {
                error = "Falscher PIN. Bitte erneut versuchen."
                pin1 = ""
            }
        case .set1:
            guard pin1.count >= 4 else { error = "Mindestens 4 Stellen."; return }
            step = .set2
            error = ""
        case .set2:
            guard pin1 == pin2 else { error = "PINs stimmen nicht überein."; pin2 = ""; return }
            lock.setPin(pin1)
        }
    }
}
