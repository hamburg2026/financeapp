import { useState } from 'react'
import { fmt } from '../fmt'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export default function BankAccounts() {
  const [accounts, setAccounts] = useLocalStorage('bankAccounts', [])
  const [transactions, setTransactions] = useLocalStorage('transactions', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [accountName, setAccountName] = useState('')
  const [accountBalance, setAccountBalance] = useState('')

  const [txAccountId, setTxAccountId] = useState('')
  const [txDate, setTxDate] = useState('')
  const [txDescription, setTxDescription] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState('')

  // Filter state
  const [filterAccount, setFilterAccount] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState(firstOfMonth())
  const [filterDateTo, setFilterDateTo] = useState(today())
  const [filterSearch, setFilterSearch] = useState('')

  function addAccount(e) {
    e.preventDefault()
    const newAccounts = [...accounts, { id: Date.now(), name: accountName, balance: parseFloat(accountBalance) }]
    setAccounts(newAccounts)
    setAccountName('')
    setAccountBalance('')
  }

  function removeAccount(id) {
    setAccounts(accounts.filter(a => a.id !== id))
  }

  function addTransaction(e) {
    e.preventDefault()
    const accountId = parseInt(txAccountId || accounts[0]?.id)
    const amount = parseFloat(txAmount)
    const newTx = { id: Date.now(), accountId, date: txDate, description: txDescription, amount, category: txCategory }
    const newTransactions = [...transactions, newTx]
    setTransactions(newTransactions)
    const newAccounts = accounts.map(a => a.id === accountId ? { ...a, balance: a.balance + amount } : a)
    setAccounts(newAccounts)
    setTxDate('')
    setTxDescription('')
    setTxAmount('')
    setTxCategory('')
  }

  function removeTransaction(id) {
    const tx = transactions.find(t => t.id === id)
    if (tx) {
      setAccounts(accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a))
      setTransactions(transactions.filter(t => t.id !== id))
    }
  }

  // Apply filters
  const filtered = transactions.filter(t => {
    if (filterAccount && t.accountId !== parseInt(filterAccount)) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (filterType === 'income' && t.amount <= 0) return false
    if (filterType === 'expense' && t.amount >= 0) return false
    if (filterDateFrom && t.date < filterDateFrom) return false
    if (filterDateTo && t.date > filterDateTo) return false
    if (filterSearch && !t.description.toLowerCase().includes(filterSearch.toLowerCase())) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date))

  const accountName_ = id => accounts.find(a => a.id === id)?.name || '–'

  const compactCell = { padding: '0.3rem 0.5rem', fontSize: '0.8rem' }

  return (
    <div className="module">
      <h2>Bankkonten</h2>
      <form onSubmit={addAccount}>
        <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Kontoname" required />
        <input type="number" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} placeholder="Anfangsstand" step="0.01" required />
        <button type="submit">Konto hinzufügen</button>
      </form>
      <h3>Konten</h3>
      <table>
        <thead><tr><th>Name</th><th>Saldo</th><th>Aktionen</th></tr></thead>
        <tbody>
          {accounts.map(a => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{fmt(a.balance)}</td>
              <td><button onClick={() => removeAccount(a.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Umsätze</h3>
      <form onSubmit={addTransaction}>
        <select value={txAccountId} onChange={e => setTxAccountId(e.target.value)} required>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
        <input value={txDescription} onChange={e => setTxDescription(e.target.value)} placeholder="Beschreibung" required />
        <input type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)} placeholder="Betrag" step="0.01" required />
        <select value={txCategory} onChange={e => setTxCategory(e.target.value)} required>
          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <button type="submit">Umsatz hinzufügen</button>
      </form>

      {/* Filter bar */}
      <div style={{
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '0.75rem',
        marginBottom: '0.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 120 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Konto</label>
          <select
            value={filterAccount}
            onChange={e => setFilterAccount(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}
          >
            <option value="">Alle Konten</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 130 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Kategorie</label>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}
          >
            <option value="">Alle Kategorien</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 110 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Typ</label>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}
          >
            <option value="all">Alle</option>
            <option value="income">Einnahmen</option>
            <option value="expense">Ausgaben</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Von</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: 'auto' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Bis</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: 'auto' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Suche</label>
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Beschreibung..."
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}
          />
        </div>

        <button
          onClick={() => {
            setFilterAccount('')
            setFilterCategory('')
            setFilterType('all')
            setFilterDateFrom(firstOfMonth())
            setFilterDateTo(today())
            setFilterSearch('')
          }}
          style={{
            fontSize: '0.78rem',
            padding: '0.32rem 0.7rem',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            alignSelf: 'flex-end',
          }}
        >
          Zurücksetzen
        </button>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
        {filtered.length} Umsatz{filtered.length !== 1 ? 'ätze' : ''}
      </div>

      {/* Compact transactions table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: '0.82rem', width: '100%' }}>
          <thead>
            <tr>
              <th style={compactCell}>Datum</th>
              <th style={compactCell}>Konto</th>
              <th style={compactCell}>Beschreibung</th>
              <th style={compactCell}>Betrag</th>
              <th style={compactCell}>Kategorie</th>
              <th style={compactCell}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id}>
                <td style={compactCell}>{t.date}</td>
                <td style={compactCell}>{accountName_(t.accountId)}</td>
                <td style={compactCell}>{t.description}</td>
                <td style={{
                  ...compactCell,
                  color: t.amount >= 0 ? '#16a34a' : '#dc2626',
                  fontWeight: 600,
                }}>
                  {fmt(t.amount)}
                </td>
                <td style={compactCell}>{t.category}</td>
                <td style={compactCell}>
                  <button
                    onClick={() => removeTransaction(t.id)}
                    style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem', fontSize: '0.85rem' }}>
                  Keine Umsätze gefunden
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
