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

const NAV_ITEMS = [
  { id: 'dashboard',          label: 'Dashboard',           icon: '📊', component: Dashboard },
  { id: 'bankAccounts',       label: 'Bankkonten',           icon: '🏦', component: BankAccounts },
  { id: 'categories',        label: 'Kategorien',           icon: '🏷️', component: Categories },
  { id: 'recurringPayments',  label: 'Daueraufträge',        icon: '🔄', component: RecurringPayments },
  { id: 'insuranceContracts', label: 'Versicherungen',       icon: '🛡️', component: InsuranceContracts },
  { id: 'securities',         label: 'Wertpapiere',          icon: '📈', component: Securities },
  { id: 'depots',             label: 'Depots',               icon: '💼', component: Depots },
  { id: 'subscriptions',      label: 'Abonnements',          icon: '📱', component: Subscriptions },
  { id: 'realEstate',         label: 'Immobilien',           icon: '🏠', component: RealEstate },
  { id: 'companyShares',      label: 'Firmenbeteiligungen',  icon: '🏢', component: CompanyShares },
  { id: 'expenseTree',        label: 'Ausgaben',             icon: '📉', component: ExpenseTree },
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
          <CurrentComponent />
        </div>
      </div>
    </div>
  )
}
