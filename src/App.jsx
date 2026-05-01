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
import ServiceCostCalculator from './components/ServiceCostCalculator'
import { THEMES, applyTheme, loadTheme } from './theme'

const PIN_KEY = 'app_pin_hash'

function hashPin(pin) {
  let h = 5381
  const s = pin + '::financeapp::2026'
  for (let i = 0; i < s.length; i++) h = (Math.imul(33, h) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

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
      { id: 'categories',        label: 'Kategorien',           icon: '🏷️', component: Categories },
      { id: 'pdfImport',         label: 'PDF-Import',           icon: '📥', component: PdfImport },
      { id: 'recurringPayments', label: 'Daueraufträge',        icon: '🔄', component: RecurringPayments },
      { id: 'serviceCosts',      label: 'Dienstleistungskosten', icon: '🧹', component: ServiceCostCalculator },
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
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

function PinScreen({ onUnlocked }) {
  const hasPin = !!localStorage.getItem(PIN_KEY)
  const [step,    setStep]    = useState(hasPin ? 'enter' : 'set1')
  const [pin1,    setPin1]    = useState('')
  const [pin2,    setPin2]    = useState('')
  const [error,   setError]   = useState('')

  function handleEnter(e) {
    e.preventDefault()
    if (hashPin(pin1) === localStorage.getItem(PIN_KEY)) {
      sessionStorage.setItem('pin_ok', '1')
      onUnlocked()
    } else {
      setError('Falscher PIN. Bitte erneut versuchen.')
      setPin1('')
    }
  }

  function handleSet(e) {
    e.preventDefault()
    if (pin1.length < 4) { setError('Mindestens 4 Stellen.'); return }
    if (step === 'set1') { setStep('set2'); setError(''); return }
    if (pin1 !== pin2)   { setError('PINs stimmen nicht überein.'); setPin2(''); return }
    localStorage.setItem(PIN_KEY, hashPin(pin1))
    sessionStorage.setItem('pin_ok', '1')
    onUnlocked()
  }

  const screenStyle = {
    position: 'fixed', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--color-bg)',
  }
  const cardStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 16,
    padding: '2.5rem 2rem',
    width: '100%', maxWidth: 360,
    boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
    textAlign: 'center',
  }
  const inputStyle = {
    width: '100%', fontSize: '1.4rem', letterSpacing: '0.3em',
    textAlign: 'center', padding: '0.6rem 0.5rem',
    border: '1px solid var(--color-border)', borderRadius: 8,
    marginTop: '1rem', fontFamily: 'monospace',
  }
  const btnStyle = {
    marginTop: '1rem', width: '100%', padding: '0.7rem',
    fontSize: '1rem', fontWeight: 600, borderRadius: 8,
    border: 'none', cursor: 'pointer',
    background: 'var(--color-primary)', color: '#fff',
  }

  if (step === 'enter') return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔒</div>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>Finanzverwaltung</h2>
        <p style={{ margin: '0 0 0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>PIN eingeben</p>
        <form onSubmit={handleEnter}>
          <input
            type="password" inputMode="numeric" pattern="[0-9]*" autoFocus
            value={pin1} onChange={e => { setPin1(e.target.value); setError('') }}
            placeholder="••••" style={inputStyle}
          />
          {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{error}</p>}
          <button type="submit" style={btnStyle}>Entsperren</button>
        </form>
      </div>
    </div>
  )

  return (
    <div style={screenStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔐</div>
        <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.2rem' }}>PIN einrichten</h2>
        <p style={{ margin: '0 0 0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          {step === 'set1' ? 'Wähle einen PIN (mind. 4 Stellen)' : 'PIN zur Bestätigung wiederholen'}
        </p>
        <form onSubmit={handleSet}>
          <input
            type="password" inputMode="numeric" pattern="[0-9]*" autoFocus
            value={step === 'set1' ? pin1 : pin2}
            onChange={e => { step === 'set1' ? setPin1(e.target.value) : setPin2(e.target.value); setError('') }}
            placeholder="••••" style={inputStyle}
          />
          {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.5rem 0 0' }}>{error}</p>}
          <button type="submit" style={btnStyle}>
            {step === 'set1' ? 'Weiter' : 'PIN speichern'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [unlocked, setUnlocked]   = useState(() => sessionStorage.getItem('pin_ok') === '1')
  const [currentView, setCurrentView] = useState('dashboard')
  const [showPrint, setShowPrint] = useState(false)
  const [theme, setTheme] = useState(() => loadTheme())
  const current = ALL_ITEMS.find(item => item.id === currentView) || ALL_ITEMS[0]
  const CurrentComponent = current.component

  function handleTheme(id) {
    applyTheme(id)
    setTheme(id)
  }

  function handleLock() {
    sessionStorage.removeItem('pin_ok')
    setUnlocked(false)
  }

  if (!unlocked) return <PinScreen onUnlocked={() => setUnlocked(true)} />

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
            <button className="print-btn" onClick={handleLock} style={{ marginTop: '0.4rem', opacity: 0.75 }}>
              <span className="nav-icon">🔒</span>
              Sperren
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

