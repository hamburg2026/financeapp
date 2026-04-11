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

function today() { return new Date().toISOString().slice(0, 10) }
function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

const btnSm = {
  border: 'none', borderRadius: 5, cursor: 'pointer',
  fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4,
}

function todayIso() { return new Date().toISOString().slice(0, 10) }

function isoToParts(iso) {
  if (!iso || iso.length < 10) return { d: '', m: '', y: '' }
  const [y, m, d] = iso.split('-')
  return { d: d || '', m: m || '', y: y || '' }
}
function partsToIso(d, m, y) {
  if (!d && !m && !y) return ''
  return y && m && d ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : ''
}

function DateInputSmall({ value, onChange }) {
  const { d, m, y } = isoToParts(value)
  const st = { fontSize: '0.78rem', padding: '0.2rem 0.3rem', border: '1px solid var(--color-border)', borderRadius: 4, textAlign: 'center', width: 40, background: 'var(--color-surface)' }
  const upd = (nd, nm, ny) => onChange(partsToIso(nd, nm, ny))
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      <input type="number" value={d} min="1" max="31" placeholder="TT" style={st} onChange={e => upd(e.target.value, m, y)} />
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>.</span>
      <input type="number" value={m} min="1" max="12" placeholder="MM" style={st} onChange={e => upd(d, e.target.value, y)} />
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>.</span>
      <input type="number" value={y} min="1900" max="2100" placeholder="JJJJ" style={{ ...st, width: 58 }} onChange={e => upd(d, m, e.target.value)} />
    </span>
  )
}

function BalanceHistory({ history = [], onChange }) {
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState(todayIso())
  const [newVal, setNewVal] = useState('')
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))
  function add() {
    if (!newDate || newVal === '') return
    onChange([...history, { id: Date.now(), date: newDate, value: parseFloat(newVal) }])
    setNewVal('')
    setAdding(false)
  }
  function remove(id) { onChange(history.filter(e => e.id !== id)) }
  return (
    <div style={{ padding: '0.6rem 0.75rem', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        Saldenhistorie
      </div>
      {sorted.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>Noch keine Einträge</div>}
      {sorted.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.18rem 0', borderBottom: i < sorted.length - 1 ? '1px solid var(--color-border)' : 'none', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--color-text-muted)', fontFamily: 'monospace', fontSize: '0.75rem', minWidth: 88 }}>{e.date}</span>
          <span style={{ fontWeight: 700, flex: 1, color: e.value >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(e.value)}</span>
          {i === 0 && <span style={{ fontSize: '0.62rem', background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '0.05rem 0.3rem', fontWeight: 600 }}>aktuell</span>}
          <button onClick={() => remove(e.id)} style={{ ...btnSm, background: 'none', color: '#dc2626', padding: '0.1rem 0.25rem' }}>✕</button>
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.45rem', flexWrap: 'wrap' }}>
          <DateInputSmall value={newDate} onChange={setNewDate} />
          <input type="number" value={newVal} onChange={e => setNewVal(e.target.value)}
            placeholder="Saldo (€)" step="0.01"
            style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem', width: 100, border: '1px solid var(--color-border)', borderRadius: 4 }} />
          <button onClick={add} style={{ ...btnSm, background: 'var(--color-primary)', color: '#fff', padding: '0.2rem 0.5rem' }}>Speichern</button>
          <button onClick={() => setAdding(false)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', padding: '0.2rem 0.5rem' }}>Abbrechen</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: '0.35rem', background: 'none', border: '1px dashed var(--color-border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', padding: '0.15rem 0.5rem', color: 'var(--color-text-muted)', width: '100%', textAlign: 'left' }}>
          + Stichtag hinzufügen
        </button>
      )}
    </div>
  )
}

export default function BankAccounts() {
  const [accounts, setAccounts] = useLocalStorage('bankAccounts', [])
  const [transactions, setTransactions] = useLocalStorage('transactions', [])
  const [categories, setCategories_] = useState(() => JSON.parse(localStorage.getItem('categories')) || [])

  const [tab, setTab] = useState('accounts')
  const [expandedAccHistory, setExpandedAccHistory] = useState(new Set())

  // --- Accounts form ---
  const [accountName, setAccountName] = useState('')
  const [accountBalance, setAccountBalance] = useState('')

  // --- Account inline edit ---
  const [editAccId, setEditAccId] = useState(null)
  const [editAccName, setEditAccName] = useState('')
  const [editAccBalance, setEditAccBalance] = useState('')

  // --- Transaction form ---
  const [txAccountId, setTxAccountId] = useState('')
  const [txDate, setTxDate] = useState(today())
  const [txDescription, setTxDescription] = useState('')
  const [txRecipient, setTxRecipient] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txCategory, setTxCategory] = useState('')

  // --- Transaction inline edit ---
  const [editTxId, setEditTxId] = useState(null)
  const [editTxAccountId, setEditTxAccountId] = useState('')
  const [editTxDate, setEditTxDate] = useState('')
  const [editTxDescription, setEditTxDescription] = useState('')
  const [editTxRecipient, setEditTxRecipient] = useState('')
  const [editTxAmount, setEditTxAmount] = useState('')
  const [editTxCategory, setEditTxCategory] = useState('')

  // --- Transaction filters ---
  const [filterAccount, setFilterAccount] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState(firstOfMonth())
  const [filterDateTo, setFilterDateTo] = useState(today())
  const [filterRecipient, setFilterRecipient] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // Derive category type (Ausgabe/Einnahme) for a given category name
  function catType(catName) {
    const cat = categories.find(c => c.name === catName)
    return cat?.type || null
  }

  // Apply sign based on category type: Ausgabe → negative, Einnahme → positive
  function applySign(amount, catName) {
    const type = catType(catName)
    const abs = Math.abs(parseFloat(amount))
    if (type === 'Ausgabe') return -abs
    if (type === 'Einnahme') return abs
    return parseFloat(amount) // fallback: use as entered
  }

  // --- Accounts CRUD ---
  function addAccount(e) {
    e.preventDefault()
    setAccounts([...accounts, { id: Date.now(), name: accountName, balance: parseFloat(accountBalance) }])
    setAccountName('')
    setAccountBalance('')
  }

  function startEditAcc(a) {
    setEditAccId(a.id)
    setEditAccName(a.name)
    setEditAccBalance(String(a.balance))
  }

  function saveEditAcc() {
    setAccounts(accounts.map(a =>
      a.id === editAccId ? { ...a, name: editAccName, balance: parseFloat(editAccBalance) } : a
    ))
    setEditAccId(null)
  }

  function removeAccount(id) {
    setAccounts(accounts.filter(a => a.id !== id))
  }

  function toggleAccHistory(id) {
    setExpandedAccHistory(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function updateAccountHistory(accountId, newHistory) {
    setAccounts(accounts.map(a => a.id !== accountId ? a : { ...a, balanceHistory: newHistory }))
  }

  // --- Transactions CRUD ---
  function addTransaction(e) {
    e.preventDefault()
    const accountId = parseInt(txAccountId || accounts[0]?.id)
    const amount = applySign(txAmount, txCategory)
    const newTx = { id: Date.now(), accountId, date: txDate, description: txDescription, recipient: txRecipient, amount, category: txCategory }
    setTransactions([...transactions, newTx])
    setAccounts(accounts.map(a => a.id === accountId ? { ...a, balance: a.balance + amount } : a))
    setTxDate(today())
    setTxDescription('')
    setTxRecipient('')
    setTxAmount('')
    setTxCategory('')
  }

  function startEditTx(t) {
    setEditTxId(t.id)
    setEditTxAccountId(String(t.accountId))
    setEditTxDate(t.date)
    setEditTxDescription(t.description)
    setEditTxRecipient(t.recipient || '')
    setEditTxAmount(String(Math.abs(t.amount)))
    setEditTxCategory(t.category)
  }

  function saveEditTx() {
    const oldTx = transactions.find(t => t.id === editTxId)
    const newAmount = applySign(editTxAmount, editTxCategory)
    const newAccountId = parseInt(editTxAccountId)

    // Reverse old amount, apply new amount
    let newAccounts = accounts.map(a => {
      if (a.id === oldTx.accountId) return { ...a, balance: a.balance - oldTx.amount }
      return a
    })
    newAccounts = newAccounts.map(a => {
      if (a.id === newAccountId) return { ...a, balance: a.balance + newAmount }
      return a
    })
    setAccounts(newAccounts)
    setTransactions(transactions.map(t =>
      t.id === editTxId
        ? { ...t, accountId: newAccountId, date: editTxDate, description: editTxDescription, recipient: editTxRecipient, amount: newAmount, category: editTxCategory }
        : t
    ))
    setEditTxId(null)
  }

  function removeTransaction(id) {
    const tx = transactions.find(t => t.id === id)
    if (tx) {
      setAccounts(accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a))
      setTransactions(transactions.filter(t => t.id !== id))
    }
  }

  // --- Filtered & sorted transactions ---
  const filtered = transactions.filter(t => {
    if (filterAccount && t.accountId !== parseInt(filterAccount)) return false
    if (filterCategory && t.category !== filterCategory) return false
    if (filterType === 'income' && t.amount <= 0) return false
    if (filterType === 'expense' && t.amount >= 0) return false
    if (filterDateFrom && t.date < filterDateFrom) return false
    if (filterDateTo && t.date > filterDateTo) return false
    if (filterRecipient && !(t.recipient || '').toLowerCase().includes(filterRecipient.toLowerCase())) return false
    if (filterSearch && !t.description.toLowerCase().includes(filterSearch.toLowerCase())) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date))

  function resetFilters() {
    setFilterAccount(''); setFilterCategory(''); setFilterType('all')
    setFilterDateFrom(firstOfMonth()); setFilterDateTo(today())
    setFilterRecipient(''); setFilterSearch('')
  }

  const accountName_ = id => accounts.find(a => a.id === id)?.name || '–'
  const cell = { padding: '0.3rem 0.5rem', fontSize: '0.8rem' }

  // Selected category type hint for new transaction form
  const newTxCatType = catType(txCategory)

  return (
    <div className="module">
      <h2>Bankkonten</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '2px solid var(--color-border)' }}>
        {[['accounts', 'Konten'], ['transactions', 'Umsätze']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.5rem 1.2rem', fontSize: '0.9rem', fontWeight: tab === id ? 700 : 400,
              color: tab === id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              borderBottom: tab === id ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── KONTEN TAB ── */}
      {tab === 'accounts' && (
        <>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {accounts.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', fontSize: '0.875rem' }}>
                Noch keine Konten angelegt
              </p>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)' }}>
                    <th style={cell}>Name</th>
                    <th style={cell}>Saldo</th>
                    <th style={cell}>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => {
                    const histOpen = expandedAccHistory.has(a.id)
                    if (editAccId === a.id) return (
                      <tr key={a.id} style={{ background: '#fefce8' }}>
                        <td style={cell}>
                          <input value={editAccName} onChange={e => setEditAccName(e.target.value)}
                            style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', width: '100%' }} />
                        </td>
                        <td style={cell}>
                          <input type="number" value={editAccBalance} onChange={e => setEditAccBalance(e.target.value)}
                            step="0.01" style={{ fontSize: '0.8rem', padding: '0.2rem 0.4rem', width: 90 }} />
                        </td>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                          <button onClick={saveEditAcc} style={{ ...btnSm, background: '#16a34a', color: '#fff', marginRight: 4 }}>Speichern</button>
                          <button onClick={() => setEditAccId(null)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                        </td>
                      </tr>
                    )
                    return (
                      <>
                        <tr key={a.id} style={{ borderBottom: histOpen ? 'none' : undefined }}>
                          <td style={cell}>{a.name}</td>
                          <td style={{ ...cell, fontWeight: 600, color: a.balance >= 0 ? '#16a34a' : '#dc2626' }}>
                            {fmt(a.balance)}
                            {a.balanceHistory?.length > 0 && (
                              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 4 }}>({a.balanceHistory.length})</span>
                            )}
                          </td>
                          <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                            <button onClick={() => startEditAcc(a)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', marginRight: 4 }}>✎</button>
                            <button onClick={() => removeAccount(a.id)} style={{ ...btnSm, background: '#fee2e2', color: '#dc2626', marginRight: 4 }}>✕</button>
                            <button onClick={() => toggleAccHistory(a.id)} style={{ ...btnSm, background: histOpen ? 'var(--color-primary)' : '#e5e7eb', color: histOpen ? '#fff' : '#374151' }} title="Saldenhistorie">
                              {histOpen ? '▾' : '▸'} Verlauf
                            </button>
                          </td>
                        </tr>
                        {histOpen && (
                          <tr key={`${a.id}-hist`}>
                            <td colSpan={3} style={{ padding: 0 }}>
                              <BalanceHistory
                                history={a.balanceHistory || []}
                                onChange={h => updateAccountHistory(a.id, h)}
                              />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Konto hinzufügen</h3>
          <form onSubmit={addAccount}>
            <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="Kontoname" required />
            <input type="number" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} placeholder="Anfangsstand" step="0.01" required />
            <button type="submit">Konto hinzufügen</button>
          </form>
        </>
      )}

      {/* ── UMSÄTZE TAB ── */}
      {tab === 'transactions' && (
        <>
          {/* Filter bar */}
          <div style={{
            background: 'var(--color-bg)', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem',
            display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end',
          }}>
            {[
              ['Konto', <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}>
                <option value="">Alle</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>],
              ['Kategorie', <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}>
                <option value="">Alle</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>],
              ['Typ', <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem' }}>
                <option value="all">Alle</option>
                <option value="income">Einnahmen</option>
                <option value="expense">Ausgaben</option>
              </select>],
              ['Von', <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: 'auto' }} />],
              ['Bis', <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: 'auto' }} />],
              ['Empfänger', <input value={filterRecipient} onChange={e => setFilterRecipient(e.target.value)} placeholder="..." style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: 110 }} />],
              ['Suche', <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Beschreibung..." style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: 130 }} />],
            ].map(([label, input]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <label style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{label}</label>
                {input}
              </div>
            ))}
            <button onClick={resetFilters} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', alignSelf: 'flex-end', padding: '0.32rem 0.7rem' }}>
              Zurücksetzen
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
            {filtered.length} Umsatz{filtered.length !== 1 ? 'ätze' : ''}
          </div>

          {/* Transactions table */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ fontSize: '0.8rem', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)' }}>
                  {['Datum', 'Konto', 'Beschreibung', 'Empfänger', 'Betrag', 'Kategorie', 'Aktionen'].map(h => (
                    <th key={h} style={cell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem', fontSize: '0.85rem' }}>
                      Keine Umsätze gefunden
                    </td>
                  </tr>
                )}
                {filtered.map(t => {
                  if (editTxId === t.id) {
                    const editCatType = catType(editTxCategory)
                    return (
                      <tr key={t.id} style={{ background: '#fefce8' }}>
                        <td style={cell}>
                          <input type="date" value={editTxDate} onChange={e => setEditTxDate(e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.3rem', width: 115 }} />
                        </td>
                        <td style={cell}>
                          <select value={editTxAccountId} onChange={e => setEditTxAccountId(e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.3rem' }}>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </td>
                        <td style={cell}>
                          <input value={editTxDescription} onChange={e => setEditTxDescription(e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.3rem', width: 130 }} />
                        </td>
                        <td style={cell}>
                          <input value={editTxRecipient} onChange={e => setEditTxRecipient(e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.3rem', width: 100 }} />
                        </td>
                        <td style={cell}>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input type="number" value={editTxAmount} onChange={e => setEditTxAmount(e.target.value)}
                              step="0.01" min="0" style={{ fontSize: '0.78rem', padding: '0.2rem 0.3rem', width: 80 }} />
                            {editCatType && (
                              <span style={{ fontSize: '0.68rem', color: editCatType === 'Ausgabe' ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                                {editCatType === 'Ausgabe' ? '−' : '+'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={cell}>
                          <select value={editTxCategory} onChange={e => setEditTxCategory(e.target.value)}
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.3rem' }}>
                            <option value="">–</option>
                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                          </select>
                        </td>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                          <button onClick={saveEditTx} style={{ ...btnSm, background: '#16a34a', color: '#fff', marginRight: 3 }}>Speichern</button>
                          <button onClick={() => setEditTxId(null)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={cell}>{t.date}</td>
                      <td style={cell}>{accountName_(t.accountId)}</td>
                      <td style={cell}>{t.description}</td>
                      <td style={{ ...cell, color: 'var(--color-text-muted)' }}>{t.recipient || '–'}</td>
                      <td style={{ ...cell, fontWeight: 600, color: t.amount >= 0 ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>
                        {fmt(t.amount)}
                      </td>
                      <td style={cell}>{t.category}</td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                        <button onClick={() => startEditTx(t)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', marginRight: 3 }}>✎</button>
                        <button onClick={() => removeTransaction(t.id)} style={{ ...btnSm, background: '#fee2e2', color: '#dc2626' }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Add transaction form (unterhalb der Liste) */}
          <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>Umsatz hinzufügen</h3>
          <form onSubmit={addTransaction}>
            <select value={txAccountId} onChange={e => setTxAccountId(e.target.value)} required>
              <option value="">Konto wählen</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
            <input value={txDescription} onChange={e => setTxDescription(e.target.value)} placeholder="Beschreibung" required />
            <input value={txRecipient} onChange={e => setTxRecipient(e.target.value)} placeholder="Empfänger" />
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="number" value={txAmount} onChange={e => setTxAmount(e.target.value)}
                placeholder="Betrag (positiv)" step="0.01" min="0" required
                style={{ flex: 1 }}
              />
              {newTxCatType && (
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 5,
                  background: newTxCatType === 'Ausgabe' ? '#fee2e2' : '#dcfce7',
                  color: newTxCatType === 'Ausgabe' ? '#dc2626' : '#16a34a',
                }}>
                  {newTxCatType === 'Ausgabe' ? '− Ausgabe' : '+ Einnahme'}
                </span>
              )}
            </div>
            <select value={txCategory} onChange={e => setTxCategory(e.target.value)} required>
              <option value="">Kategorie wählen</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name} ({c.type || '–'})</option>)}
            </select>
            <button type="submit">Umsatz hinzufügen</button>
          </form>
        </>
      )}
    </div>
  )
}
