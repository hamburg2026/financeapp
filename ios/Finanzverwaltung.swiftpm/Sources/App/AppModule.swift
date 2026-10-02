import SwiftUI

/// Alle Module der App (entspricht `NAV_GROUPS` + `FOOTER_ITEMS` der Web-App).
enum AppModule: String, CaseIterable, Identifiable, Hashable {
    // Stammdaten
    case bankAccounts, securities, realEstate, companyShares, insuranceContracts
    // Allgemeines
    case categories, pdfImport, recurringPayments, subscriptions, serviceCosts
    // Auswertungen
    case dashboard, wealthChart, expenseChart, portfolioPerf, expenseTree
    // Fußbereich
    case dataBackup

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bankAccounts: return "Bankkonten"
        case .securities: return "Wertpapiere & Depots"
        case .realEstate: return "Immobilien"
        case .companyShares: return "Firmenbeteiligungen"
        case .insuranceContracts: return "Versicherungen"
        case .categories: return "Kategorien"
        case .pdfImport: return "PDF-Import"
        case .recurringPayments: return "Daueraufträge"
        case .subscriptions: return "Abonnements"
        case .serviceCosts: return "Dienstleistungskosten"
        case .dashboard: return "Dashboard"
        case .wealthChart: return "Vermögen"
        case .expenseChart: return "Ausgaben-Grafik"
        case .portfolioPerf: return "Wertentwicklung"
        case .expenseTree: return "Ausgaben"
        case .dataBackup: return "Datensicherung"
        }
    }

    var systemImage: String {
        switch self {
        case .bankAccounts: return "building.columns"
        case .securities: return "chart.line.uptrend.xyaxis"
        case .realEstate: return "house"
        case .companyShares: return "building.2"
        case .insuranceContracts: return "shield.lefthalf.filled"
        case .categories: return "tag"
        case .pdfImport: return "square.and.arrow.down"
        case .recurringPayments: return "arrow.triangle.2.circlepath"
        case .subscriptions: return "iphone"
        case .serviceCosts: return "sparkles"
        case .dashboard: return "chart.bar.xaxis"
        case .wealthChart: return "eurosign.circle"
        case .expenseChart: return "chart.pie"
        case .portfolioPerf: return "chart.xyaxis.line"
        case .expenseTree: return "list.bullet.indent"
        case .dataBackup: return "externaldrive"
        }
    }

    struct Group: Identifiable {
        let label: String
        let items: [AppModule]
        var id: String { label }
    }

    static let groups: [Group] = [
        Group(label: "Stammdaten", items: [.bankAccounts, .securities, .realEstate, .companyShares, .insuranceContracts]),
        Group(label: "Allgemeines", items: [.categories, .pdfImport, .recurringPayments, .subscriptions, .serviceCosts]),
        Group(label: "Auswertungen", items: [.dashboard, .wealthChart, .expenseChart, .portfolioPerf, .expenseTree]),
    ]

    /// Inhaltsansicht des Moduls.
    @MainActor @ViewBuilder
    var view: some View {
        switch self {
        case .bankAccounts: BankAccountsView()
        case .securities: SecuritiesView()
        case .realEstate: RealEstateView()
        case .companyShares: CompanySharesView()
        case .insuranceContracts: InsuranceContractsView()
        case .categories: CategoriesView()
        case .pdfImport: PdfImportView()
        case .recurringPayments: RecurringPaymentsView()
        case .subscriptions: SubscriptionsView()
        case .serviceCosts: ServiceCostsView()
        case .dashboard: DashboardView()
        case .wealthChart: WealthChartView()
        case .expenseChart: ExpenseChartView()
        case .portfolioPerf: PortfolioPerformanceView()
        case .expenseTree: ExpenseTreeView()
        case .dataBackup: DataBackupView()
        }
    }
}
