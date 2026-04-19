import { useState } from 'react'
import { fmt } from '../fmt'
import { buildCategoryOptions } from '../categoryOptions'
import Modal from './Modal'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = v => { localStorage.setItem(key, JSON.stringify(v)); setValue(v) }
  return [value, set]
}

function today() { return new Date().toISOString().slice(0, 10) }

function latestBalance(account) {
  const h = account.balanceHistory
  if (h?.length) return [...h].sort((a, b) => b.date.localeCompare(a.date))[0].value
  return account.balance ?? 0
}

const btnSm = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4 }
const lbl = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', display: 'block', fontWeight: 500 }

// ── Date dimension helpers ─────────────────────────────────────────────

const DATE_DIMS = [
  { key: 'thisMonth',  label: 'Dieser Monat' },
  { key: 'lastMonth',  label: 'Letzter Monat' },
  { key: 'thisQ',      label: 'Dieses Quartal' },
  { key: 'lastQ',      label: 'Letztes Quartal' },
  { key: 'thisYear',   label: 'Dieses Jahr' },
  { key: 'lastYear',   label: 'Letztes Jahr' },
  { key: 'all',        label: 'Alles' },
]

function getDateRange(key) {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth() + 1
  const q = Math.ceil(m / 3)
  const p = s => String(s).padStart(2, '0')
  switch (key) {
    case 'thisMonth': return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-31` }
    case 'lastMonth': {
      const lm = m === 1 ? 12 : m - 1
      const ly = m === 1 ? y - 1 : y
      return { from: `${ly}-${p(lm)}-01`, to: `${ly}-${p(lm)}-31` }
    }
    case 'thisQ': return { from: `${y}-${p((q - 1) * 3 + 1)}-01`, to: `${y}-${p(q * 3)}-31` }
    case 'lastQ': {
      const lq = q === 1 ? 4 : q - 1
      const lqy = q === 1 ? y - 1 : y
      return { from: `${lqy}-${p((lq - 1) * 3 + 1)}-01`, to: `${lqy}-${p(lq * 3)}-31` }
    }
    case 'thisYear':  return { from: `${y}-01-01`,     to: `${y}-12-31` }
    case 'lastYear':  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    default:          return { from: '', to: '' }
  }
}

// ── Transaction modal ──────────────────────────────────────────────────

function TransactionModal({ accountId, accounts, transactions, categories, onClose, onUpdateAccounts, onUpdateTransactions }) {
  const init = getDateRange('thisMonth')
  const [dateDim,  setDateDim]  = useState('thisMonth')
  const [dateFrom, setDateFrom] = useState(init.from)
  const [dateTo,   setDateTo]   = useState(init.to)

  const [filterAcc,       setFilterAcc]       = useState(accountId ? String(accountId) : '')
  const [filterCat,       setFilterCat]       = useState('')
  const [filterType,      setFilterType]      = useState('all')
  const [filterRecipient, setFilterRecipient] = useState('')
  const [filterSearch,    setFilterSearch]    = useState('')

  const [editId,    setEditId]    = useState(null)
  const [editAccId, setEditAccId] = useState('')
  const [editDate,  setEditDate]  = useState('')
  const [editDesc,  setEditDesc]  = useState('')
  const [editRecip, setEditRecip] = useState('')
  const [editAmt,   setEditAmt]   = useState('')
  const [editCat,   setEditCat]   = useState('')

  const [addAccId, setAddAccId] = useState(accountId ? String(accountId) : (accounts[0]?.id ? String(accounts[0].id) : ''))
  const [addDate,  setAddDate]  = useState(today())
  const [addDesc,  setAddDesc]  = useState('')
  const [addRecip, setAddRecip] = useState('')
  const [addAmt,   setAddAmt]   = useState('')
  const [addCat,   setAddCat]   = useState('')

  const catType  = name => categories.find(c => c.name === name)?.type || null
  const accLabel = id   => accounts.find(a => a.id === id)?.name || '–'

  function applySign(amount, catName) {
    const abs  = Math.abs(parseFloat(amount) || 0)
    const type = catType(catName)
    if (type === 'Ausgabe')  return -abs
    if (type === 'Einnahme') return  abs
    return parseFloat(amount) || 0
  }

  function selectDim(key) {
    setDateDim(key)
    const r = getDateRange(key)
    setDateFrom(r.from)
    setDateTo(r.to)
  }

  const base = accountId
    ? transactions.filter(t => t.accountId === accountId)
    : transactions

  const filtered = base.filter(t => {
    if (filterAcc && t.accountId !== parseInt(filterAcc)) return false
    if (dateFrom && t.date < dateFrom) return false
    if (dateTo   && t.date > dateTo)   return false
    if (filterCat && t.category !== filterCat) return false
    if (filterType === 'income'  && t.amount <= 0) return false
    if (filterType === 'expense' && t.amount >= 0) return false
    if (filterRecipient && !(t.recipient || '').toLowerCase().includes(filterRecipient.toLowerCase())) return false
    if (filterSearch    && !t.description.toLowerCase().includes(filterSearch.toLowerCase())) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date))

  const totalIn  = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalOut = filtered.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)

  function startEdit(t) {
    setEditId(t.id); setEditAccId(String(t.accountId)); setEditDate(t.date)
    setEditDesc(t.description); setEditRecip(t.recipient || '')
    setEditAmt(String(Math.abs(t.amount))); setEditCat(t.category || '')
  }

  function saveEdit() {
    const old    = transactions.find(t => t.id === editId)
    const newAmt = applySign(editAmt, editCat)
    const newAcc = parseInt(editAccId)
    let accs = accounts.map(a => a.id === old.accountId ? { ...a, balance: a.balance - old.amount } : a)
    accs     = accs.map(a => a.id === newAcc ? { ...a, balance: a.balance + newAmt } : a)
    onUpdateAccounts(accs)
    onUpdateTransactions(transactions.map(t =>
      t.id === editId
        ? { ...t, accountId: newAcc, date: editDate, description: editDesc, recipient: editRecip, amount: newAmt, category: editCat }
        : t
    ))
    setEditId(null)
  }

  function deleteTx(id) {
    const tx = transactions.find(t => t.id === id)
    if (!tx) return
    onUpdateAccounts(accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a))
    onUpdateTransactions(transactions.filter(t => t.id !== id))
  }

  function addTx(e) {
    e.preventDefault()
    const aId = parseInt(addAccId)
    const amt = applySign(addAmt, addCat)
    onUpdateAccounts(accounts.map(a => a.id === aId ? { ...a, balance: a.balance + amt } : a))
    onUpdateTransactions([...transactions, { id: Date.now(), accountId: aId, date: addDate, description: addDesc, recipient: addRecip, amount: amt, category: addCat }])
    setAddDate(today()); setAddDesc(''); setAddRecip(''); setAddAmt(''); setAddCat('')
  }

  const title = accountId ? `Umsätze – ${accLabel(accountId)}` : 'Alle Umsätze'
  const c = { padding: '0.28rem 0.5rem', fontSize: '0.79rem', verticalAlign: 'middle' }
  const fl = { fontSize: '0.69rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '1.5rem', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-surface)', borderRadius: 12, width: '100%', maxWidth: 1100,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 3rem)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {filtered.length} Einträge
              {totalIn  > 0 && <span style={{ color: '#16a34a', marginLeft: 8 }}>+{fmt(totalIn)}</span>}
              {totalOut < 0 && <span style={{ color: '#dc2626', marginLeft: 6 }}>{fmt(totalOut)}</span>}
              <span style={{ marginLeft: 6 }}>Saldo: <b style={{ color: (totalIn + totalOut) >= 0 ? '#2563eb' : '#9f1239' }}>{fmt(totalIn + totalOut)}</b></span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', lineHeight: 1, color: 'var(--color-text-muted)', padding: '0.2rem 0.5rem' }}>✕</button>
        </div>

        {/* Date dimensions */}
        <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg)' }}>
          <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
            {DATE_DIMS.map(({ key, label }) => {
              const active = dateDim === key
              return (
                <button key={key} onClick={() => selectDim(key)} style={{
                  padding: '0.22rem 0.7rem', borderRadius: 20, cursor: 'pointer', fontSize: '0.77rem',
                  fontWeight: active ? 600 : 400, transition: 'all 0.1s',
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--color-text-muted)',
                }}>{label}</button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.71rem', color: 'var(--color-text-muted)' }}>Von</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateDim('custom') }}
              style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
            <span style={{ fontSize: '0.71rem', color: 'var(--color-text-muted)' }}>Bis</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateDim('custom') }}
              style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '0.55rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
          display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {!accountId && (
            <div>
              <div style={fl}>Konto</div>
              <select value={filterAcc} onChange={e => setFilterAcc(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem' }}>
                <option value="">Alle</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={fl}>Kategorie</div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem' }}>
              <option value="">Alle</option>
              {buildCategoryOptions(categories, 'name')}
            </select>
          </div>
          <div>
            <div style={fl}>Typ</div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem' }}>
              <option value="all">Alle</option>
              <option value="income">Einnahmen</option>
              <option value="expense">Ausgaben</option>
            </select>
          </div>
          <div>
            <div style={fl}>Empfänger</div>
            <input value={filterRecipient} onChange={e => setFilterRecipient(e.target.value)} placeholder="..." style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', width: 100 }} />
          </div>
          <div>
            <div style={fl}>Suche</div>
            <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Beschreibung…" style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', width: 140 }} />
          </div>
          <button onClick={() => { setFilterCat(''); setFilterType('all'); setFilterRecipient(''); setFilterSearch('') }}
            style={{ ...btnSm, background: '#e5e7eb', color: '#374151', padding: '0.23rem 0.6rem', alignSelf: 'flex-end' }}>
            Zurücksetzen
          </button>
        </div>

        {/* Scrollable table */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)' }}>
                {['Datum', 'Beschreibung', 'Empfänger', 'Betrag', 'Kategorie', ''].map((h, i) => (
                  <th key={i} style={{ ...c, fontWeight: 700, textAlign: i === 3 ? 'right' : 'left',
                    whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem', fontSize: '0.85rem' }}>
                  Keine Umsätze im gewählten Zeitraum
                </td></tr>
              )}
              {filtered.map(t => {
                if (editId === t.id) return (
                  <tr key={t.id} style={{ background: '#fefce8', borderBottom: '1px solid var(--color-border)' }}>
                    <td style={c}><input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ fontSize: '0.76rem', padding: '0.13rem 0.3rem', width: 120 }} /></td>
                    <td style={c}><input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ fontSize: '0.76rem', padding: '0.13rem 0.3rem', width: '100%', minWidth: 140 }} /></td>
                    <td style={c}><input value={editRecip} onChange={e => setEditRecip(e.target.value)} style={{ fontSize: '0.76rem', padding: '0.13rem 0.3rem', width: 90 }} /></td>
                    <td style={c}>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)} step="0.01" min="0" style={{ fontSize: '0.76rem', padding: '0.13rem 0.3rem', width: 80, textAlign: 'right' }} />
                        {catType(editCat) && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: catType(editCat) === 'Ausgabe' ? '#dc2626' : '#16a34a' }}>{catType(editCat) === 'Ausgabe' ? '−' : '+'}</span>}
                      </div>
                    </td>
                    <td style={c}><select value={editCat} onChange={e => setEditCat(e.target.value)} style={{ fontSize: '0.76rem', padding: '0.13rem 0.3rem', maxWidth: 160 }}>
                      <option value="">–</option>{buildCategoryOptions(categories, 'name')}
                    </select></td>
                    <td style={{ ...c, whiteSpace: 'nowrap' }}>
                      <button onClick={saveEdit} style={{ ...btnSm, background: 'var(--color-primary)', color: '#fff', marginRight: 3 }}>✓</button>
                      <button onClick={() => setEditId(null)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                    </td>
                  </tr>
                )
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ ...c, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{t.date}</td>
                    <td style={{ ...c, maxWidth: 260 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.description}</span></td>
                    <td style={{ ...c, color: 'var(--color-text-muted)', maxWidth: 130 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{t.recipient || '–'}</span></td>
                    <td style={{ ...c, fontWeight: 700, color: t.amount >= 0 ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(t.amount)}</td>
                    <td style={{ ...c, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t.category || '–'}</td>
                    <td style={{ ...c, whiteSpace: 'nowrap' }}>
                      <button onClick={() => startEdit(t)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', marginRight: 3 }}>✎</button>
                      <button onClick={() => deleteTx(t.id)} style={{ ...btnSm, background: '#fee2e2', color: '#dc2626' }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Add form */}
        <div style={{ padding: '0.65rem 1.25rem', borderTop: '2px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg)' }}>
          <div style={{ fontSize: '0.69rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '0.45rem' }}>
            Umsatz erfassen
          </div>
          <form onSubmit={addTx} style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <select value={addAccId} onChange={e => setAddAccId(e.target.value)} required style={{ fontSize: '0.79rem', padding: '0.22rem 0.4rem' }}>
              <option value="">Konto</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} required style={{ fontSize: '0.79rem', padding: '0.22rem 0.4rem' }} />
            <input value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="Beschreibung" required style={{ fontSize: '0.79rem', padding: '0.22rem 0.4rem', flex: '1 1 140px', minWidth: 100 }} />
            <input value={addRecip} onChange={e => setAddRecip(e.target.value)} placeholder="Empfänger" style={{ fontSize: '0.79rem', padding: '0.22rem 0.4rem', width: 110 }} />
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
              <input type="number" value={addAmt} onChange={e => setAddAmt(e.target.value)} placeholder="Betrag" step="0.01" min="0" required style={{ fontSize: '0.79rem', padding: '0.22rem 0.4rem', width: 90 }} />
              {catType(addCat) && <span style={{ fontSize: '0.71rem', fontWeight: 700, padding: '0.13rem 0.35rem', borderRadius: 4, background: catType(addCat) === 'Ausgabe' ? '#fee2e2' : '#dcfce7', color: catType(addCat) === 'Ausgabe' ? '#dc2626' : '#16a34a' }}>
                {catType(addCat) === 'Ausgabe' ? '− Ausgabe' : '+ Einnahme'}
              </span>}
            </div>
            <select value={addCat} onChange={e => setAddCat(e.target.value)} style={{ fontSize: '0.79rem', padding: '0.22rem 0.4rem' }}>
              <option value="">Kategorie</option>
              {buildCategoryOptions(categories, 'name')}
            </select>
            <button type="submit" style={{ padding: '0.24rem 0.85rem', borderRadius: 6, border: 'none', background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
              Erfassen
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export default function BankAccounts() {
  const [accounts,     setAccounts]     = useLocalStorage('bankAccounts', [])
  const [transactions, setTransactions] = useLocalStorage('transactions', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [editAccId,      setEditAccId]      = useState(null)
  const [editAccName,    setEditAccName]    = useState('')
  const [editAccBalance, setEditAccBalance] = useState('')
  const [txModal,        setTxModal]        = useState(null)
  const [showAddModal,   setShowAddModal]   = useState(false)
  const [accountName,    setAccountName]    = useState('')
  const [accountBalance, setAccountBalance] = useState('')

  function addAccount(e) {
    e.preventDefault()
    setAccounts([...accounts, { id: Date.now(), name: accountName, balance: parseFloat(accountBalance) }])
    setAccountName(''); setAccountBalance('')
    setShowAddModal(false)
  }

  function startEditAcc(a) {
    setEditAccId(a.id); setEditAccName(a.name); setEditAccBalance(String(latestBalance(a)))
  }

  function saveEditAcc() {
    setAccounts(accounts.map(a => a.id === editAccId ? { ...a, name: editAccName, balance: parseFloat(editAccBalance) } : a))
    setEditAccId(null)
  }

  const txCount = id => transactions.filter(t => t.accountId === id).length
  const c = { padding: '0.35rem 0.6rem', fontSize: '0.82rem' }

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Bankkonten</h2>
        <button onClick={() => { setAccountName(''); setAccountBalance(''); setShowAddModal(true) }} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          + Konto
        </button>
      </div>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '1rem' }}>
        {accounts.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', fontSize: '0.875rem', margin: 0 }}>
            Noch keine Konten angelegt
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ ...c, textAlign: 'left' }}>Konto</th>
                <th style={{ ...c, textAlign: 'right' }}>Saldo</th>
                <th style={{ ...c, textAlign: 'right', color: 'var(--color-text-muted)' }}>Umsätze</th>
                <th style={c}></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => {
                if (editAccId === a.id) return (
                  <tr key={a.id} style={{ background: '#fefce8', borderBottom: '1px solid var(--color-border)' }}>
                    <td style={c}><input value={editAccName} onChange={e => setEditAccName(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.2rem 0.4rem', width: '100%' }} /></td>
                    <td style={c} colSpan={2}><input type="number" value={editAccBalance} onChange={e => setEditAccBalance(e.target.value)} step="0.01" style={{ fontSize: '0.82rem', padding: '0.2rem 0.4rem', width: 120 }} /></td>
                    <td style={{ ...c, whiteSpace: 'nowrap' }}>
                      <button onClick={saveEditAcc} style={{ ...btnSm, background: 'var(--color-primary)', color: '#fff', marginRight: 4 }}>Speichern</button>
                      <button onClick={() => setEditAccId(null)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                    </td>
                  </tr>
                )
                const bal = latestBalance(a)
                const cnt = txCount(a.id)
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ ...c, fontWeight: 500 }}>{a.name}</td>
                    <td style={{ ...c, textAlign: 'right', fontWeight: 700, color: bal >= 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(bal)}</td>
                    <td style={{ ...c, textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{cnt > 0 ? cnt : '–'}</td>
                    <td style={{ ...c, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => setTxModal(a.id)} style={{ ...btnSm, background: 'var(--color-primary)', color: '#fff', marginRight: 4 }}>Umsätze</button>
                      <button onClick={() => startEditAcc(a)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', marginRight: 4 }}>✎</button>
                      <button onClick={() => setAccounts(accounts.filter(x => x.id !== a.id))} style={{ ...btnSm, background: '#fee2e2', color: '#dc2626' }}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {accounts.length > 1 && (
        <button onClick={() => setTxModal('all')} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', padding: '0.3rem 0.85rem', fontSize: '0.82rem' }}>
          Alle Umsätze ({transactions.length})
        </button>
      )}

      {showAddModal && (
        <Modal title="Konto hinzufügen" onClose={() => setShowAddModal(false)} maxWidth={440}>
          <form onSubmit={addAccount} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={lbl}>Kontoname *</label>
              <input value={accountName} onChange={e => setAccountName(e.target.value)} placeholder="z. B. Girokonto" required style={{ width: '100%' }} />
            </div>
            <div>
              <label style={lbl}>Anfangsstand (€) *</label>
              <input type="number" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} placeholder="0.00" step="0.01" required style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="submit" style={{ flex: 1 }}>Konto hinzufügen</button>
              <button type="button" onClick={() => setShowAddModal(false)} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}

      {txModal !== null && (
        <TransactionModal
          accountId={txModal === 'all' ? null : txModal}
          accounts={accounts}
          transactions={transactions}
          categories={categories}
          onClose={() => setTxModal(null)}
          onUpdateAccounts={setAccounts}
          onUpdateTransactions={setTransactions}
        />
      )}
    </div>
  )
}
