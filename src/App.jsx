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

const VIEWS = {
  dashboard: Dashboard,
  bankAccounts: BankAccounts,
  categories: Categories,
  recurringPayments: RecurringPayments,
  insuranceContracts: InsuranceContracts,
  securities: Securities,
  depots: Depots,
  subscriptions: Subscriptions,
  realEstate: RealEstate,
  companyShares: CompanyShares,
}

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard')
  const CurrentComponent = VIEWS[currentView]

  return (
    <>
      <header>
        <h1>Finanzverwaltung</h1>
        <nav>
          <button onClick={() => setCurrentView('dashboard')}>Dashboard</button>
          <button onClick={() => setCurrentView('bankAccounts')}>Bankkonten</button>
          <button onClick={() => setCurrentView('categories')}>Kategorien</button>
          <button onClick={() => setCurrentView('recurringPayments')}>Daueraufträge</button>
          <button onClick={() => setCurrentView('insuranceContracts')}>Versicherungen</button>
          <button onClick={() => setCurrentView('securities')}>Wertpapiere</button>
          <button onClick={() => setCurrentView('depots')}>Depots</button>
          <button onClick={() => setCurrentView('subscriptions')}>Abonnements</button>
          <button onClick={() => setCurrentView('realEstate')}>Immobilien</button>
          <button onClick={() => setCurrentView('companyShares')}>Firmenbeteiligungen</button>
        </nav>
      </header>
      <main>
        <CurrentComponent />
      </main>
    </>
  )
}
