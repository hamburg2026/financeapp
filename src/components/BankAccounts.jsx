import { useState } from 'react'
import { fmt } from '../fmt'
import CategorySelect from './CategorySelect'
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

function closestImportDate(accountId, transactions) {
  const txs = transactions.filter(t => t.accountId === accountId)
  if (!txs.length) return null
  const todayMs = new Date(today()).getTime()
  return txs.reduce((best, t) => {
    if (!best) return t.date
    return Math.abs(new Date(t.date) - todayMs) < Math.abs(new Date(best) - todayMs) ? t.date : best
  }, null)
}

function fmtDate(iso) {
  if (!iso) return '–'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
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
  const y = n.getFullYear(), m = n.getMonth()   // m is 0-indexed
  const p   = s  => String(s).padStart(2, '0')
  const iso = (yr, mo, day) => `${yr}-${p(mo + 1)}-${p(day)}`  // mo is 0-indexed
  const end = (yr, mo)      => new Date(yr, mo + 1, 0).getDate()
  const q = Math.floor(m / 3)  // 0-indexed quarter
  switch (key) {
    case 'thisMonth': return { from: iso(y, m, 1), to: iso(y, m, end(y, m)) }
    case 'lastMonth': {
      const lm = m === 0 ? 11 : m - 1, ly = m === 0 ? y - 1 : y
      return { from: iso(ly, lm, 1), to: iso(ly, lm, end(ly, lm)) }
    }
    case 'thisQ': return { from: iso(y, q * 3, 1), to: iso(y, q * 3 + 2, end(y, q * 3 + 2)) }
    case 'lastQ': {
      const lq = q === 0 ? 3 : q - 1, lqy = q === 0 ? y - 1 : y
      return { from: iso(lqy, lq * 3, 1), to: iso(lqy, lq * 3 + 2, end(lqy, lq * 3 + 2)) }
    }
    case 'thisYear': return { from: `${y}-01-01`,     to: `${y}-12-31` }
    case 'lastYear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    default:         return { from: '', to: '' }
  }
}

// ── Transaction modal ──────────────────────────────────────────────────

export function TransactionModal({ accountId, accounts, transactions, categories, onClose, onUpdateAccounts, onUpdateTransactions,
  initialDateDim = 'thisMonth', initialCategory = '' }) {
  const init = getDateRange(initialDateDim)
  const [dateDim,  setDateDim]  = useState(initialDateDim)
  const [dateFrom, setDateFrom] = useState(init.from)
  const [dateTo,   setDateTo]   = useState(init.to)

  const [filterAcc,       setFilterAcc]       = useState(accountId ? String(accountId) : '')
  const [filterCat,       setFilterCat]       = useState(initialCategory)
  const [filterType,      setFilterType]      = useState('all')
  const [filterRecipient, setFilterRecipient] = useState('')
  const [filterSearch,    setFilterSearch]    = useState('')
  const [filterAmtMin,    setFilterAmtMin]    = useState('')
  const [filterAmtMax,    setFilterAmtMax]    = useState('')

  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  const [editId,    setEditId]    = useState(null)
  const [editAccId, setEditAccId] = useState('')
  const [editDate,  setEditDate]  = useState('')
  const [editDesc,  setEditDesc]  = useState('')
  const [editRecip, setEditRecip] = useState('')
  const [editAmt,   setEditAmt]   = useState('')
  const [editSign,  setEditSign]  = useState(-1)
  const [editCat,   setEditCat]   = useState('')

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkCat,     setBulkCat]     = useState('')

  const catType  = name => categories.find(c => c.name === name)?.type || null
  const accLabel = id   => accounts.find(a => a.id === id)?.name || '–'

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
    if (filterAmtMin !== '' && t.amount < parseFloat(filterAmtMin)) return false
    if (filterAmtMax !== '' && t.amount > parseFloat(filterAmtMax)) return false
    return true
  }).sort((a, b) => {
    let av, bv
    switch (sortCol) {
      case 'date':        av = a.date;                              bv = b.date;                              break
      case 'recipient':   av = (a.recipient   || '').toLowerCase(); bv = (b.recipient   || '').toLowerCase(); break
      case 'description': av = (a.description || '').toLowerCase(); bv = (b.description || '').toLowerCase(); break
      case 'amount':      av = a.amount;                            bv = b.amount;                            break
      case 'category':    av = (a.category    || '').toLowerCase(); bv = (b.category    || '').toLowerCase(); break
      default:            av = a.date;                              bv = b.date
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  })

  const totalIn  = filtered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const totalOut = filtered.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)

  function startEdit(t) {
    setEditId(t.id); setEditAccId(String(t.accountId)); setEditDate(t.date)
    setEditDesc(t.description); setEditRecip(t.recipient || '')
    setEditAmt(String(Math.abs(t.amount))); setEditSign(t.amount >= 0 ? 1 : -1)
    setEditCat(t.category || '')
  }

  function saveEdit() {
    const old    = transactions.find(t => t.id === editId)
    const newAmt = editSign * (Math.abs(parseFloat(editAmt)) || 0)
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

  function toggleSelect(id) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)))
  }

  function bulkAssign() {
    if (!bulkCat || selectedIds.size === 0) return
    onUpdateTransactions(transactions.map(t => selectedIds.has(t.id) ? { ...t, category: bulkCat } : t))
    setSelectedIds(new Set())
    setBulkCat('')
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

        {/* Date dimension pills */}
        <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg)' }}>
          <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap' }}>
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
        </div>

        {/* Filters + date inputs */}
        <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
          display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {!accountId && (
            <div>
              <div style={fl}>Konto</div>
              <select value={filterAcc} onChange={e => setFilterAcc(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem' }}>
                <option value="">Alle Konten</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={fl}>Von</div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateDim('custom') }}
              style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
          </div>
          <div>
            <div style={fl}>Bis</div>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateDim('custom') }}
              style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
          </div>
          <div>
            <div style={fl}>Kategorie</div>
            <CategorySelect value={filterCat} onChange={e => setFilterCat(e.target.value)} categories={categories} valueKey="name" placeholder="Alle" style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem' }} />
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
            <input value={filterRecipient} onChange={e => setFilterRecipient(e.target.value)} placeholder="…" style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', width: 100 }} />
          </div>
          <div>
            <div style={fl}>Suche</div>
            <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Buchungstext…" style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', width: 130 }} />
          </div>
          <div>
            <div style={fl}>Betrag von</div>
            <input type="number" value={filterAmtMin} onChange={e => setFilterAmtMin(e.target.value)} placeholder="Min" step="0.01" style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', width: 75, border: '1px solid var(--color-border)', borderRadius: 4 }} />
          </div>
          <div>
            <div style={fl}>Betrag bis</div>
            <input type="number" value={filterAmtMax} onChange={e => setFilterAmtMax(e.target.value)} placeholder="Max" step="0.01" style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', width: 75, border: '1px solid var(--color-border)', borderRadius: 4 }} />
          </div>
          <button onClick={() => { setFilterCat(''); setFilterType('all'); setFilterRecipient(''); setFilterSearch(''); setFilterAmtMin(''); setFilterAmtMax('') }}
            style={{ ...btnSm, background: '#e5e7eb', color: '#374151', padding: '0.23rem 0.6rem', alignSelf: 'flex-end' }}>
            Zurücksetzen
          </button>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{ padding: '0.45rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
            background: '#eff6ff', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              {selectedIds.size} ausgewählt
            </span>
            <CategorySelect value={bulkCat} onChange={e => setBulkCat(e.target.value)} categories={categories} valueKey="name" placeholder="Kategorie wählen…" style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem' }} />
            <button onClick={bulkAssign} disabled={!bulkCat}
              style={{ ...btnSm, background: bulkCat ? 'var(--color-primary)' : '#e5e7eb', color: bulkCat ? '#fff' : '#9ca3af', padding: '0.23rem 0.7rem' }}>
              Zuordnen
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              style={{ ...btnSm, background: 'none', color: 'var(--color-text-muted)', padding: '0.23rem 0.5rem' }}>
              Auswahl aufheben
            </button>
          </div>
        )}

        {/* Edit transaction modal */}
        {editId !== null && (
          <Modal title="Umsatz bearbeiten" onClose={() => setEditId(null)} maxWidth={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {!accountId && (
                <div>
                  <label style={lbl}>Konto</label>
                  <select value={editAccId} onChange={e => setEditAccId(e.target.value)} style={{ width: '100%', fontSize: '0.9rem', padding: '0.4rem 0.5rem' }}>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>Datum</label>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ width: '100%', fontSize: '0.9rem', padding: '0.4rem 0.5rem' }} />
              </div>
              <div>
                <label style={lbl}>Empfänger</label>
                <input value={editRecip} onChange={e => setEditRecip(e.target.value)} style={{ width: '100%', fontSize: '0.9rem', padding: '0.4rem 0.5rem' }} />
              </div>
              <div>
                <label style={lbl}>Buchungstext</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                  style={{ width: '100%', fontSize: '0.9rem', padding: '0.4rem 0.5rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={lbl}>Betrag (€)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button onClick={() => setEditSign(s => -s)} style={{
                    padding: '0.4rem 0.8rem', border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontWeight: 700, fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
                    background: editSign < 0 ? '#fee2e2' : '#dcfce7',
                    color: editSign < 0 ? '#dc2626' : '#16a34a',
                  }}>{editSign < 0 ? '−' : '+'}</button>
                  <input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)} step="0.01" min="0"
                    style={{ flex: 1, fontSize: '0.9rem', padding: '0.4rem 0.5rem' }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Kategorie</label>
                <CategorySelect value={editCat}
                  onChange={e => setEditCat(e.target.value)}
                  categories={categories}
                  valueKey="name" placeholder="– keine –" style={{ width: '100%', fontSize: '0.9rem', padding: '0.4rem 0.5rem' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button onClick={saveEdit} style={{ flex: 1, padding: '0.6rem', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Speichern</button>
                <button onClick={() => setEditId(null)} style={{ padding: '0.6rem 1rem', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Abbrechen</button>
              </div>
            </div>
          </Modal>
        )}

        {/* Scrollable table */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ ...c, width: 32, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }} />
                </th>
                {[
                  { key: 'date',        label: 'Datum',        align: 'left'  },
                  { key: 'recipient',   label: 'Empfänger',    align: 'left'  },
                  { key: 'description', label: 'Buchungstext', align: 'left'  },
                  { key: 'amount',      label: 'Betrag',       align: 'right' },
                  { key: 'category',    label: 'Kategorie',    align: 'left'  },
                ].map(col => {
                  const active = sortCol === col.key
                  return (
                    <th key={col.key} onClick={() => {
                      if (sortCol === col.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                      else { setSortCol(col.key); setSortDir('asc') }
                    }} style={{ ...c, fontWeight: 700, textAlign: col.align,
                      whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1,
                      cursor: 'pointer', userSelect: 'none',
                      color: active ? 'var(--color-primary)' : undefined,
                    }}>
                      {col.label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                    </th>
                  )
                })}
                <th style={{ ...c, position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2.5rem', fontSize: '0.85rem' }}>
                  Keine Umsätze im gewählten Zeitraum
                </td></tr>
              )}
              {filtered.map(t => {
                const isSelected = selectedIds.has(t.id)
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)', background: isSelected ? '#eff6ff' : undefined }}>
                    <td style={{ ...c, width: 32 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ ...c, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{t.date}</td>
                    <td style={{ ...c, color: 'var(--color-text-muted)', maxWidth: 130 }}><span title={t.recipient || ''} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'default' }}>{t.recipient || '–'}</span></td>
                    <td style={{ ...c, maxWidth: 340 }}><span style={{ display: 'block', wordBreak: 'break-word', lineHeight: 1.35, fontSize: '0.77rem' }}>{t.description}</span></td>
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
                <th style={{ ...c, textAlign: 'right', color: 'var(--color-text-muted)' }}>Importstand</th>
                <th style={c}></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => {
                if (editAccId === a.id) return (
                  <tr key={a.id} style={{ background: '#fefce8', borderBottom: '1px solid var(--color-border)' }}>
                    <td style={c}><input value={editAccName} onChange={e => setEditAccName(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.2rem 0.4rem', width: '100%' }} /></td>
                    <td style={c} colSpan={3}><input type="number" value={editAccBalance} onChange={e => setEditAccBalance(e.target.value)} step="0.01" style={{ fontSize: '0.82rem', padding: '0.2rem 0.4rem', width: 120 }} /></td>
                    <td style={{ ...c, whiteSpace: 'nowrap' }}>
                      <button onClick={saveEditAcc} style={{ ...btnSm, background: 'var(--color-primary)', color: '#fff', marginRight: 4 }}>Speichern</button>
                      <button onClick={() => setEditAccId(null)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                    </td>
                  </tr>
                )
                const bal = latestBalance(a)
                const cnt = txCount(a.id)
                const importDate = closestImportDate(a.id, transactions)
                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ ...c, fontWeight: 500 }}>{a.name}</td>
                    <td style={{ ...c, textAlign: 'right', fontWeight: 700, color: bal >= 0 ? '#16a34a' : '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmt(bal)}</td>
                    <td style={{ ...c, textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{cnt > 0 ? cnt : '–'}</td>
                    <td style={{ ...c, textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{fmtDate(importDate)}</td>
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
