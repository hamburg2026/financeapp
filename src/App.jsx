import { useState } from 'react'
import Dashboard from './components/Dashboard'
import BankAccounts from './components/BankAccounts'
import Categories from './components/Categories'
import RecurringPayments from './components/RecurringPayments'
import InsuranceContracts from './components/InsuranceContracts'
import Securities from './components/Securities'
import Subscriptions from './components/Subscriptions'
import RealEstate from './components/RealEstate'
import CompanyShares from './components/CompanyShares'
import ExpenseTree from './components/ExpenseTree'
import WealthChart from './components/WealthChart'
import ExpenseChart from './components/ExpenseChart'
import PortfolioPerformance from './components/PortfolioPerformance'
import PrintDialog from './components/PrintDialog'
import PdfImport from './components/PdfImport'
import TransactionPivot from './components/TransactionPivot'
import { THEMES, applyTheme, loadTheme } from './theme'

const NAV_GROUPS = [
  {
    label: 'Stammdaten',
    items: [
      { id: 'bankAccounts',       label: 'Bankkonten',           icon: '🏦', component: BankAccounts },
      { id: 'securities',         label: 'Wertpapiere & Depots', icon: '📈', component: Securities },
      { id: 'subscriptions',      label: 'Abonnements',          icon: '📱', component: Subscriptions },
      { id: 'realEstate',         label: 'Immobilien',           icon: '🏠', component: RealEstate },
      { id: 'companyShares',      label: 'Firmenbeteiligungen',  icon: '🏢', component: CompanyShares },
      { id: 'insuranceContracts', label: 'Versicherungen',       icon: '🛡️', component: InsuranceContracts },
    ],
  },
  {
    label: 'Allgemeines',
    items: [
      { id: 'categories',        label: 'Kategorien',    icon: '🏷️', component: Categories },
      { id: 'pdfImport',         label: 'PDF-Import',    icon: '📥', component: PdfImport },
      { id: 'recurringPayments', label: 'Daueraufträge', icon: '🔄', component: RecurringPayments },
    ],
  },
  {
    label: 'Auswertungen',
    items: [
      { id: 'dashboard',    label: 'Dashboard',       icon: '📊', component: Dashboard },
      { id: 'wealthChart',  label: 'Vermögen',        icon: '💰', component: WealthChart },
      { id: 'expenseChart', label: 'Ausgaben-Grafik', icon: '🎯', component: ExpenseChart },
      { id: 'portfolioPerf',label: 'Wertentwicklung', icon: '💹', component: PortfolioPerformance },
      { id: 'expenseTree',    label: 'Ausgaben',          icon: '📉', component: ExpenseTree },
      { id: 'txPivot',        label: 'Pivot-Auswertung',  icon: '⊞',  component: TransactionPivot },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard')
  const [showPrint, setShowPrint] = useState(false)
  const [theme, setTheme] = useState(() => loadTheme())
  const current = ALL_ITEMS.find(item => item.id === currentView) || ALL_ITEMS[0]
  const CurrentComponent = current.component

  function handleTheme(id) {
    applyTheme(id)
    setTheme(id)
  }

  return (
    <>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1 className="sidebar-title">Finanzverwaltung</h1>
            <p className="sidebar-subtitle">Persönliche Finanzen</p>
          </div>
          <nav className="sidebar-nav">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="nav-group">
                <div className="nav-group-label">{group.label}</div>
                {group.items.map(item => (
                  <button
                    key={item.id}
                    className={`nav-item${currentView === item.id ? ' active' : ''}`}
                    onClick={() => setCurrentView(item.id)}
                    aria-current={currentView === item.id ? 'page' : undefined}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-theme-picker">
              <span className="sidebar-theme-label">Farbe</span>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleTheme(t.id)}
                  title={t.label}
                  className={`theme-dot${theme === t.id ? ' active' : ''}`}
                  style={{ background: t.primary }}
                />
              ))}
            </div>
            <button className="print-btn" onClick={() => setShowPrint(true)}>
              <span className="nav-icon">🖨</span>
              Drucken
            </button>
          </div>
        </aside>

        <div className="main-content">
          <div className="content-area">
            <CurrentComponent onNavigate={setCurrentView} />
          </div>
        </div>
      </div>

      {showPrint && <PrintDialog onClose={() => setShowPrint(false)} />}
    </>
  )
}
