import { useState } from 'react'
import Dashboard from './components/Dashboard'
import BankAccounts from './components/BankAccounts'
import Categories from './components/Categories'
import RecurringPayments from './components/RecurringPayments'
import InsuranceContracts from './components/InsuranceContracts'
import Securities from './components/Securities'
import Depots from './components/Depots'
import Subscriptions from './components/Subscriptions'
import RealEstate from './components/RealEstate'
import CompanyShares from './components/CompanyShares'
import ExpenseTree from './components/ExpenseTree'
import WealthChart from './components/WealthChart'
import ExpenseChart from './components/ExpenseChart'
import PortfolioPerformance from './components/PortfolioPerformance'

const NAV_ITEMS = [
  { id: 'dashboard',          label: 'Dashboard',           icon: '📊', component: Dashboard },
  { id: 'wealthChart',        label: 'Vermögen',            icon: '💰', component: WealthChart },
  { id: 'expenseChart',       label: 'Ausgaben-Grafik',     icon: '🎯', component: ExpenseChart },
  { id: 'bankAccounts',       label: 'Bankkonten',          icon: '🏦', component: BankAccounts },
  { id: 'categories',         label: 'Kategorien',          icon: '🏷️', component: Categories },
  { id: 'recurringPayments',  label: 'Daueraufträge',       icon: '🔄', component: RecurringPayments },
  { id: 'insuranceContracts', label: 'Versicherungen',      icon: '🛡️', component: InsuranceContracts },
  { id: 'securities',         label: 'Wertpapiere & Depots', icon: '📈', component: Securities },
  { id: 'portfolioPerf',      label: 'Wertentwicklung',      icon: '💹', component: PortfolioPerformance },
  { id: 'subscriptions',      label: 'Abonnements',         icon: '📱', component: Subscriptions },
  { id: 'realEstate',         label: 'Immobilien',          icon: '🏠', component: RealEstate },
  { id: 'companyShares',      label: 'Firmenbeteiligungen', icon: '🏢', component: CompanyShares },
  { id: 'expenseTree',        label: 'Ausgaben',            icon: '📉', component: ExpenseTree },
]

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard')
  const current = NAV_ITEMS.find(item => item.id === currentView)
  const CurrentComponent = current.component

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">Finanzverwaltung</h1>
          <p className="sidebar-subtitle">Persönliche Finanzen</p>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
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
        </nav>
      </aside>

      <div className="main-content">
        <div className="content-area">
          <CurrentComponent onNavigate={setCurrentView} />
        </div>
      </div>
    </div>
  )
}
