import { useState, useMemo } from 'react'
import { fmt } from '../fmt'
import CategorySelect from './CategorySelect'

const FREQ_FACTOR = {
  month:   { monthly: 1,  quarterly: 1/3, halfyearly: 1/6,  yearly: 1/12 },
  quarter: { monthly: 3,  quarterly: 1,   halfyearly: 1/2,  yearly: 1/4  },
  year:    { monthly: 12, quarterly: 4,   halfyearly: 2,    yearly: 1    },
}

const FREQ_SHORT = { monthly: 'mtl.', quarterly: 'quartl.', halfyearly: 'halbj.', yearly: 'jährl.' }
const FREQ_FULL  = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', halfyearly: 'Halbjährlich', yearly: 'Jährlich' }
const FREQ_ORDER = ['monthly', 'quarterly', 'halfyearly', 'yearly']

const RANGE_PRESETS = [
  { key: 'thisMonth', label: 'Dieser Monat' },
  { key: 'lastMonth', label: 'Letzter Monat' },
  { key: 'thisQ',     label: 'Dieses Quartal' },
  { key: 'lastQ',     label: 'Letztes Quartal' },
  { key: 'thisYear',  label: 'Dieses Jahr' },
  { key: 'lastYear',  label: 'Letztes Jahr' },
  { key: 'all',       label: 'Alle' },
]

function getDateRange(key) {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const pad = n => String(n).padStart(2, '0')
  const iso = (yr, mo, day) => `${yr}-${pad(mo + 1)}-${pad(day)}`
  if (key === 'all')       return { from: '1900-01-01', to: '2999-12-31' }
  if (key === 'thisMonth') return { from: iso(y, m, 1), to: iso(y, m, new Date(y, m + 1, 0).getDate()) }
  if (key === 'lastMonth') {
    const lm = m === 0 ? 11 : m - 1, ly = m === 0 ? y - 1 : y
    return { from: iso(ly, lm, 1), to: iso(ly, lm, new Date(ly, lm + 1, 0).getDate()) }
  }
  if (key === 'thisQ') {
    const q = Math.floor(m / 3)
    return { from: iso(y, q * 3, 1), to: iso(y, q * 3 + 2, new Date(y, q * 3 + 3, 0).getDate()) }
  }
  if (key === 'lastQ') {
    const q = Math.floor(m / 3)
    const lq = q === 0 ? 3 : q - 1, ly = q === 0 ? y - 1 : y
    return { from: iso(ly, lq * 3, 1), to: iso(ly, lq * 3 + 2, new Date(ly, lq * 3 + 3, 0).getDate()) }
  }
  if (key === 'thisYear')  return { from: `${y}-01-01`, to: `${y}-12-31` }
  if (key === 'lastYear')  return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
  return { from: '1900-01-01', to: '2999-12-31' }
}

function recIsIncome(r, catById) {
  const type = r.type || catById[r.categoryId]?.type
  return type === 'Einnahme'
}

function RecurringRow({ r, projected, indent, showCat, catById, last }) {
  const inc = recIsIncome(r, catById)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.26rem 0.75rem',
      paddingLeft: `${0.75 + indent * 1.2}rem`,
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      fontSize: '0.78rem',
    }}>
      <span style={{ flex: 1, color: inc ? '#16a34a' : 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.description}
      </span>
      {showCat && r.categoryId && (
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{catById[r.categoryId]?.name}</span>
      )}
      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0, marginRight: '0.25rem' }}>{FREQ_SHORT[r.frequency]}</span>
      <span style={{ fontWeight: 500, flexShrink: 0, color: inc ? '#16a34a' : 'inherit' }}>
        {inc ? '+' : ''}{fmt(projected)}
      </span>
    </div>
  )
}

// ── Pivot helpers ────────────────────────────────────────────────────

function getPivotKey(dateStr, gby) {
  const [y, m] = dateStr.split('-')
  if (gby === 'month')   return `${y}-${m}`
  if (gby === 'quarter') return `${y}-Q${Math.ceil(parseInt(m) / 3)}`
  return y
}

function pivotLabel(key, gby) {
  if (gby === 'month') {
    const [y, m] = key.split('-')
    const mo = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
    return `${mo[parseInt(m)-1]} ${y.slice(2)}`
  }
  if (gby === 'quarter') { const [y, q] = key.split('-'); return `${q} ${y.slice(2)}` }
  return key
}

function genPivotPeriods(from, to, gby) {
  if (!from || !to) return []
  const ps = [], cur = new Date(from + 'T00:00:00'), end = new Date(to + 'T00:00:00')
  while (cur <= end) {
    const y = cur.getFullYear(), m = cur.getMonth() + 1
    const p = n => String(n).padStart(2, '0')
    const key = gby === 'month' ? `${y}-${p(m)}` : gby === 'quarter' ? `${y}-Q${Math.ceil(m/3)}` : String(y)
    if (!ps.length || ps[ps.length-1] !== key) ps.push(key)
    if (gby === 'month') cur.setMonth(cur.getMonth()+1)
    else if (gby === 'quarter') cur.setMonth(cur.getMonth()+3)
    else cur.setFullYear(cur.getFullYear()+1)
  }
  return ps
}

function PivotDrilldownModal({ txSubset, categories, accounts, title, onClose, onUpdateAccounts, onUpdateTransactions }) {
  const [expandedGroups, setExpandedGroups] = useState(new Set())
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

  const groups = useMemo(() => {
    const map = {}
    for (const t of txSubset) {
      const key = t.category || ''
      if (!map[key]) map[key] = { name: key || null, txs: [], total: 0 }
      map[key].txs.push(t)
      map[key].total += t.amount
    }
    for (const g of Object.values(map)) {
      g.txs.sort((a, b) => {
        const r = (a.recipient || '').localeCompare(b.recipient || '')
        return r !== 0 ? r : a.date.localeCompare(b.date)
      })
    }
    return Object.values(map).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  }, [txSubset])

  function toggleGroup(key) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function toggleSelect(id, e) {
    e.stopPropagation()
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleGroupSelect(ids, e) {
    e.stopPropagation()
    const allSelected = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => {
      const n = new Set(prev)
      allSelected ? ids.forEach(id => n.delete(id)) : ids.forEach(id => n.add(id))
      return n
    })
  }

  function bulkAssign() {
    if (!bulkCat || selectedIds.size === 0) return
    onUpdateTransactions(txSubset.map(t => selectedIds.has(t.id) ? { ...t, category: bulkCat } : t))
    setSelectedIds(new Set())
    setBulkCat('')
  }

  function startEdit(t) {
    setEditId(t.id); setEditAccId(String(t.accountId)); setEditDate(t.date)
    setEditDesc(t.description); setEditRecip(t.recipient || '')
    setEditAmt(String(Math.abs(t.amount))); setEditSign(t.amount >= 0 ? 1 : -1)
    setEditCat(t.category || '')
  }

  function saveEdit() {
    const old = txSubset.find(t => t.id === editId)
    const newAmt = editSign * (Math.abs(parseFloat(editAmt)) || 0)
    const newAcc = parseInt(editAccId)
    let accs = accounts.map(a => a.id === old.accountId ? { ...a, balance: a.balance - old.amount } : a)
    accs = accs.map(a => a.id === newAcc ? { ...a, balance: a.balance + newAmt } : a)
    onUpdateAccounts(accs)
    onUpdateTransactions(txSubset.map(t =>
      t.id === editId
        ? { ...t, accountId: newAcc, date: editDate, description: editDesc, recipient: editRecip, amount: newAmt, category: editCat }
        : t
    ))
    setEditId(null)
  }

  function deleteTx(id) {
    const tx = txSubset.find(t => t.id === id)
    if (!tx) return
    onUpdateAccounts(accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a))
    onUpdateTransactions(txSubset.filter(t => t.id !== id))
  }

  const totalSum = txSubset.reduce((s, t) => s + t.amount, 0)
  const clr = v => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : 'var(--color-text-muted)'
  const lbl = { fontSize: '0.71rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2, display: 'block' }
  const btn = { fontSize: '0.73rem', padding: '0.15rem 0.45rem', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '1.5rem', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-surface)', borderRadius: 12, width: '100%', maxWidth: 820,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column',
        maxHeight: 'calc(100vh - 3rem)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {txSubset.length} Umsätze &nbsp;
              <span style={{ color: clr(totalSum), fontWeight: 600 }}>
                {totalSum > 0 ? '+' : ''}{fmt(totalSum)}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem',
              color: 'var(--color-text-muted)', padding: '0.2rem 0.5rem' }}>✕</button>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{ padding: '0.45rem 1.25rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
            background: '#eff6ff', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              {selectedIds.size} ausgewählt
            </span>
            <CategorySelect value={bulkCat} onChange={e => setBulkCat(e.target.value)}
              categories={categories} valueKey="name" placeholder="Kategorie wählen…"
              style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem' }} />
            <button onClick={bulkAssign} disabled={!bulkCat}
              style={{ ...btn, background: bulkCat ? 'var(--color-primary)' : '#e5e7eb',
                color: bulkCat ? '#fff' : '#9ca3af', padding: '0.23rem 0.7rem' }}>
              Zuordnen
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              style={{ ...btn, background: 'none', color: 'var(--color-text-muted)', padding: '0.23rem 0.5rem' }}>
              Auswahl aufheben
            </button>
          </div>
        )}

        {/* Category groups */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {groups.map(g => {
            const key = g.name ?? '__uncat__'
            const isOpen = expandedGroups.has(key)
            const groupIds = g.txs.map(t => t.id)
            const allGroupSelected = groupIds.every(id => selectedIds.has(id))
            const someGroupSelected = groupIds.some(id => selectedIds.has(id))
            return (
              <div key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>

                {/* Group header */}
                <div onClick={() => toggleGroup(key)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.52rem 1rem', cursor: 'pointer',
                    background: 'var(--color-bg)', userSelect: 'none' }}>
                  <input type="checkbox"
                    checked={allGroupSelected}
                    ref={el => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected }}
                    onClick={e => toggleGroupSelect(groupIds, e)}
                    onChange={() => {}}
                    style={{ cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', width: '0.8rem', flexShrink: 0 }}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.87rem' }}>
                    {g.name || 'Ohne Kategorie'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginRight: '0.5rem' }}>
                    {g.txs.length} {g.txs.length === 1 ? 'Eintrag' : 'Einträge'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: clr(g.total) }}>
                    {g.total > 0 ? '+' : ''}{fmt(g.total)}
                  </span>
                </div>

                {/* Individual transaction rows */}
                {isOpen && g.txs.map(t => (
                  editId === t.id ? (
                    <div key={t.id} style={{ padding: '0.75rem 1rem 0.85rem', background: '#eff6ff',
                      borderTop: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 0.75rem', marginBottom: '0.5rem' }}>
                        <div>
                          <label style={lbl}>Datum</label>
                          <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                            style={{ width: '100%', fontSize: '0.82rem', padding: '0.28rem 0.4rem', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 4 }} />
                        </div>
                        <div>
                          <label style={lbl}>Empfänger</label>
                          <input value={editRecip} onChange={e => setEditRecip(e.target.value)}
                            style={{ width: '100%', fontSize: '0.82rem', padding: '0.28rem 0.4rem', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 4 }} />
                        </div>
                        <div>
                          <label style={lbl}>Buchungstext</label>
                          <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                            style={{ width: '100%', fontSize: '0.82rem', padding: '0.28rem 0.4rem', boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 4 }} />
                        </div>
                        <div>
                          <label style={lbl}>Betrag (€)</label>
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <button onClick={() => setEditSign(s => -s)}
                              style={{ padding: '0.28rem 0.6rem', border: 'none', borderRadius: 4, cursor: 'pointer',
                                fontWeight: 700, flexShrink: 0,
                                background: editSign < 0 ? '#fee2e2' : '#dcfce7',
                                color: editSign < 0 ? '#dc2626' : '#16a34a' }}>
                              {editSign < 0 ? '−' : '+'}
                            </button>
                            <input type="number" value={editAmt} onChange={e => setEditAmt(e.target.value)}
                              step="0.01" min="0"
                              style={{ flex: 1, fontSize: '0.82rem', padding: '0.28rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
                          </div>
                        </div>
                        <div>
                          <label style={lbl}>Kategorie</label>
                          <CategorySelect value={editCat} onChange={e => setEditCat(e.target.value)}
                            categories={categories} valueKey="name" placeholder="– keine –"
                            style={{ width: '100%', fontSize: '0.82rem', padding: '0.28rem 0.4rem' }} />
                        </div>
                        {accounts.length > 1 && (
                          <div>
                            <label style={lbl}>Konto</label>
                            <select value={editAccId} onChange={e => setEditAccId(e.target.value)}
                              style={{ width: '100%', fontSize: '0.82rem', padding: '0.28rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 4 }}>
                              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button onClick={saveEdit}
                          style={{ ...btn, background: 'var(--color-primary)', color: '#fff', padding: '0.3rem 0.9rem' }}>
                          Speichern
                        </button>
                        <button onClick={() => setEditId(null)}
                          style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.3rem 0.9rem' }}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={t.id}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.3rem 1rem 0.3rem 1rem',
                        borderTop: '1px solid var(--color-border)',
                        background: selectedIds.has(t.id) ? '#eff6ff' : 'var(--color-surface)',
                        fontSize: '0.79rem' }}>
                      <input type="checkbox" checked={selectedIds.has(t.id)}
                        onChange={e => toggleSelect(t.id, e)}
                        style={{ cursor: 'pointer', flexShrink: 0, marginLeft: '0.25rem' }} />
                      <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums', width: 82, flexShrink: 0 }}>{t.date}</span>
                      <span style={{ color: 'var(--color-text-muted)', width: 120, flexShrink: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={t.recipient || ''}>{t.recipient || '–'}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', fontSize: '0.75rem' }}
                        title={t.description}>{t.description}</span>
                      <span style={{ fontWeight: 700, color: clr(t.amount), whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(t.amount)}</span>
                      <button onClick={() => startEdit(t)}
                        style={{ ...btn, background: '#e5e7eb', color: '#374151' }}>✎</button>
                      <button onClick={() => { if (window.confirm('Umsatz löschen?')) deleteTx(t.id) }}
                        style={{ ...btn, background: '#fee2e2', color: '#dc2626' }}>✕</button>
                    </div>
                  )
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function ExpenseTree() {
  const [source,        setSource]        = useState('transactions')
  const [period,        setPeriod]        = useState('month')
  const initRange = getDateRange('thisYear')
  const [txRangeKey,    setTxRangeKey]    = useState('thisYear')
  const [txFrom,        setTxFrom]        = useState(initRange.from)
  const [txTo,          setTxTo]          = useState(initRange.to)
  const [filterAccount, setFilterAccount] = useState('')
  const [groupBy,       setGroupBy]       = useState('category')
  const [expandedCats,  setExpandedCats]  = useState(new Set())
  const [expandedFreqs, setExpandedFreqs] = useState(new Set(FREQ_ORDER))

  const [filterType,      setFilterType]      = useState('all')
  const [filterFrequency, setFilterFrequency] = useState('')
  const [filterSearch,    setFilterSearch]    = useState('')

  const [txViewMode,        setTxViewMode]        = useState('pivot')
  const [txFilterType,      setTxFilterType]      = useState('all')
  const [pivotGroupBy,      setPivotGroupBy]      = useState('quarter')
  const [pivotExpandedCats, setPivotExpandedCats] = useState(new Set())
  const [drilldown,         setDrilldown]         = useState(null)

  const recurrings  = JSON.parse(localStorage.getItem('recurringPayments')) || []
  const categories  = JSON.parse(localStorage.getItem('categories'))        || []
  const [allTransactions, setAllTransactions] = useState(() => JSON.parse(localStorage.getItem('transactions')) || [])
  const [allAccounts,     setAllAccounts]     = useState(() => JSON.parse(localStorage.getItem('bankAccounts')) || [])

  function saveTransactions(txs) { localStorage.setItem('transactions', JSON.stringify(txs)); setAllTransactions(txs) }
  function saveAccounts(accs)    { localStorage.setItem('bankAccounts', JSON.stringify(accs)); setAllAccounts(accs) }

  const allTxs   = useMemo(() => source === 'transactions' ? allTransactions : [], [source, allTransactions])
  const accounts = useMemo(() => source === 'transactions' ? allAccounts : [],     [source, allAccounts])

  const filteredTxs = useMemo(() =>
    allTxs.filter(t => {
      if (filterAccount && t.accountId !== parseInt(filterAccount)) return false
      if (txFrom && t.date < txFrom) return false
      if (txTo   && t.date > txTo)   return false
      return true
    }),
    [allTxs, txFrom, txTo, filterAccount]
  )

  // ── Recurring mode data ───────────────────────────────────────────
  const factors = FREQ_FACTOR[period]
  const catById = Object.fromEntries(categories.map(c => [c.id, c]))

  function proj(rec) { return rec.amount * (factors[rec.frequency] ?? 1) }
  function projSigned(rec) { return recIsIncome(rec, catById) ? proj(rec) : -proj(rec) }

  const totalIncome  = recurrings.filter(r =>  recIsIncome(r, catById)).reduce((s, r) => s + proj(r), 0)
  const totalExpense = recurrings.filter(r => !recIsIncome(r, catById)).reduce((s, r) => s + proj(r), 0)
  const totalBalance = totalIncome - totalExpense

  const filtered = recurrings.filter(r => {
    if (filterType === 'income'  && !recIsIncome(r, catById)) return false
    if (filterType === 'expense' &&  recIsIncome(r, catById)) return false
    if (filterFrequency && r.frequency !== filterFrequency) return false
    if (filterSearch && !r.description.toLowerCase().includes(filterSearch.toLowerCase())) return false
    return true
  })

  const hasActiveFilter = filterType !== 'all' || filterFrequency || filterSearch
  function resetFilters() { setFilterType('all'); setFilterFrequency(''); setFilterSearch('') }

  function subtreeNet(catId) {
    return filtered.filter(r => r.categoryId === catId).reduce((s, r) => s + projSigned(r), 0)
      + categories.filter(c => c.parent == catId).reduce((s, c) => s + subtreeNet(c.id), 0)
  }
  function subtreeAbs(catId) {
    return filtered.filter(r => r.categoryId === catId).reduce((s, r) => s + proj(r), 0)
      + categories.filter(c => c.parent == catId).reduce((s, c) => s + subtreeAbs(c.id), 0)
  }

  // ── Transaction mode data ─────────────────────────────────────────
  const nameToId = useMemo(() => Object.fromEntries(categories.map(c => [c.name, c.id])), [categories.length])

  const typedFilteredTxs = useMemo(() => {
    if (txFilterType === 'expense') return filteredTxs.filter(t => t.amount < 0)
    if (txFilterType === 'income')  return filteredTxs.filter(t => t.amount > 0)
    return filteredTxs
  }, [filteredTxs, txFilterType])

  const txCatTotals = useMemo(() => {
    const totals = {}
    for (const tx of typedFilteredTxs) {
      const catId = tx.category ? (nameToId[tx.category] ?? null) : null
      const key = catId !== null ? catId : 'uncategorised'
      totals[key] = (totals[key] || 0) + tx.amount
    }
    return totals
  }, [typedFilteredTxs, nameToId])

  const txsByCatId = useMemo(() => {
    const map = {}
    for (const tx of typedFilteredTxs) {
      const catId = tx.category ? (nameToId[tx.category] ?? 'uncategorised') : 'uncategorised'
      if (!map[catId]) map[catId] = []
      map[catId].push(tx)
    }
    return map
  }, [typedFilteredTxs, nameToId])

  const pivotPeriods = useMemo(() => genPivotPeriods(txFrom, txTo, pivotGroupBy), [txFrom, txTo, pivotGroupBy])
  const pivotCellMap = useMemo(() => {
    const map = {}
    for (const tx of typedFilteredTxs) {
      const catId = tx.category ? (nameToId[tx.category] ?? 'uncat') : 'uncat'
      const pk = getPivotKey(tx.date, pivotGroupBy)
      if (!map[catId]) map[catId] = {}
      map[catId][pk] = (map[catId][pk] || 0) + tx.amount
    }
    return map
  }, [typedFilteredTxs, nameToId, pivotGroupBy])

  function txSubtreeTotal(catId) {
    return (txCatTotals[catId] || 0)
      + categories.filter(c => c.parent == catId).reduce((s, c) => s + txSubtreeTotal(c.id), 0)
  }

  const txTotalExpense = useMemo(() =>
    typedFilteredTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [typedFilteredTxs]
  )
  const txTotalIncome = useMemo(() =>
    typedFilteredTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [typedFilteredTxs]
  )

  // ── Pivot helpers (inside component to close over state) ──────────
  function pivotSubtreeVal(catId, period) {
    return (pivotCellMap[catId]?.[period] || 0) +
      categories.filter(c => c.parent == catId).reduce((s, c) => s + pivotSubtreeVal(c.id, period), 0)
  }
  function pivotSubtreeHasData(catId) {
    return pivotPeriods.some(p => pivotSubtreeVal(catId, p) !== 0)
  }
  function pivotRowTotal(catId) {
    return pivotPeriods.reduce((s, p) => s + pivotSubtreeVal(catId, p), 0)
  }
  function buildCatPivotRows(cat, level) {
    const rows = []
    const hasChildren = categories.some(c => c.parent == cat.id && pivotSubtreeHasData(c.id))
    const isOpen = pivotExpandedCats.has(cat.id)
    const vals = pivotPeriods.map(p => pivotSubtreeVal(cat.id, p))
    const total = vals.reduce((s, v) => s + v, 0)
    rows.push({ cat, level, hasChildren, isOpen, vals, total })
    if (isOpen) {
      categories.filter(c => c.parent == cat.id && pivotSubtreeHasData(c.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .forEach(child => rows.push(...buildCatPivotRows(child, level + 1)))
    }
    return rows
  }
  function buildPivotRows() {
    const top = categories.filter(c => c.parent == null && pivotSubtreeHasData(c.id))
    const byType = (type) => top.filter(c => c.type === type).sort((a, b) => a.name.localeCompare(b.name, 'de'))
    const other  = top.filter(c => c.type !== 'Einnahme').sort((a, b) => a.name.localeCompare(b.name, 'de'))
    const income = byType('Einnahme')
    const rows = []
    if (income.length) { rows.push({ header: 'Einnahmen' }); income.forEach(c => rows.push(...buildCatPivotRows(c, 0))) }
    if (other.length)  { rows.push({ header: 'Ausgaben' });  other.forEach(c  => rows.push(...buildCatPivotRows(c, 0))) }
    return rows
  }

  // ── Toggle helpers ────────────────────────────────────────────────
  function toggleCat(id) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleFreq(key) {
    setExpandedFreqs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function expandAll() {
    setExpandedCats(new Set(categories.map(c => c.id)))
    setExpandedFreqs(new Set(FREQ_ORDER))
  }
  function collapseAll() { setExpandedCats(new Set()); setExpandedFreqs(new Set()) }

  // ── Pivot drilldown helpers ───────────────────────────────────────
  function pivotPeriodToDateRange(key, gby) {
    const pad = n => String(n).padStart(2, '0')
    if (gby === 'year') return { from: `${key}-01-01`, to: `${key}-12-31` }
    if (gby === 'quarter') {
      const [y, q] = key.split('-'); const qn = parseInt(q.slice(1))
      const sm = (qn - 1) * 3, em = sm + 2
      return { from: `${y}-${pad(sm+1)}-01`, to: `${y}-${pad(em+1)}-${pad(new Date(parseInt(y), em+1, 0).getDate())}` }
    }
    if (gby === 'month') {
      const [y, m] = key.split('-')
      return { from: `${y}-${m}-01`, to: `${y}-${m}-${pad(new Date(parseInt(y), parseInt(m), 0).getDate())}` }
    }
    return { from: '', to: '' }
  }

  function getAllDescendantNames(catId) {
    const result = new Set()
    const cat = catById[catId]
    if (cat) result.add(cat.name)
    for (const c of categories.filter(c => c.parent == catId))
      for (const name of getAllDescendantNames(c.id)) result.add(name)
    return result
  }

  function openDrilldown(cat, periodKey) {
    const catNames = getAllDescendantNames(cat.id)
    const { from, to } = pivotPeriodToDateRange(periodKey, pivotGroupBy)
    const subset = typedFilteredTxs.filter(t => t.date >= from && t.date <= to && catNames.has(t.category))
    setDrilldown({ title: `${cat.name} – ${pivotLabel(periodKey, pivotGroupBy)}`, txSubset: subset, txIds: new Set(subset.map(t => t.id)) })
  }

  function openCatDrilldown(cat) {
    const catNames = getAllDescendantNames(cat.id)
    const subset = typedFilteredTxs.filter(t => catNames.has(t.category))
    setDrilldown({ title: cat.name, txSubset: subset, txIds: new Set(subset.map(t => t.id)) })
  }

  function openUncatDrilldown(periodKey) {
    const { from, to } = pivotPeriodToDateRange(periodKey, pivotGroupBy)
    const subset = typedFilteredTxs.filter(t => t.date >= from && t.date <= to && !t.category)
    setDrilldown({ title: `Ohne Kategorie – ${pivotLabel(periodKey, pivotGroupBy)}`, txSubset: subset, txIds: new Set(subset.map(t => t.id)) })
  }

  function selectTxRange(key) {
    setTxRangeKey(key)
    if (key === 'all') {
      const dates = allTransactions.map(t => t.date).filter(Boolean).sort()
      const firstYear = dates.length > 0 ? parseInt(dates[0].slice(0, 4)) : new Date().getFullYear()
      setTxFrom(`${firstYear}-01-01`)
      setTxTo(`${new Date().getFullYear()}-12-31`)
    } else {
      const r = getDateRange(key)
      setTxFrom(r.from)
      setTxTo(r.to)
    }
  }

  // ── Recurring category tree ───────────────────────────────────────
  function renderCategoryTree(parentId = null, level = 0) {
    const nodes = categories
      .filter(c => c.parent == parentId)
      .map(c => ({ ...c, net: subtreeNet(c.id), abs: subtreeAbs(c.id) }))
      .filter(c => c.abs > 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

    return nodes.map((c, ni) => {
      const directItems = filtered.filter(r => r.categoryId === c.id)
      const hasChildren = categories.some(ch => ch.parent == c.id && subtreeAbs(ch.id) > 0)
      const hasContent  = directItems.length > 0 || hasChildren
      const isOpen = expandedCats.has(c.id)
      const isLast = ni === nodes.length - 1

      return (
        <div key={c.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.42rem 0.75rem',
            paddingLeft: `${0.75 + level * 1.2}rem`,
            borderBottom: (!isOpen && isLast && level === 0) ? 'none' : '1px solid var(--color-border)',
            background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
          }}>
            {hasContent ? (
              <button onClick={() => toggleCat(c.id)} style={{ background: 'none', border: 'none', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, fontSize: '0.85rem', lineHeight: 1 }}>
                {isOpen ? '▾' : '▸'}
              </button>
            ) : <span style={{ width: '1.4rem', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: level === 0 ? '0.9rem' : '0.83rem', fontWeight: level === 0 ? 600 : 400 }}>{c.name}</span>
            <span style={{ fontWeight: level === 0 ? 700 : 400, fontSize: '0.87rem', flexShrink: 0, color: c.net >= 0 ? '#16a34a' : '#dc2626' }}>
              {c.net > 0 ? '+' : ''}{fmt(c.net)}
            </span>
          </div>
          {isOpen && (
            <>
              {directItems.map((r, ri) => (
                <RecurringRow key={r.id} r={r} projected={proj(r)} indent={level + 1} catById={catById}
                  last={ri === directItems.length - 1 && !hasChildren && isLast && level === 0} />
              ))}
              {renderCategoryTree(c.id, level + 1)}
            </>
          )}
        </div>
      )
    })
  }

  // ── Transaction category tree ─────────────────────────────────────
  function renderTxCategoryTree(parentId = null, level = 0) {
    const nodes = categories
      .filter(c => c.parent == parentId)
      .map(c => ({ ...c, total: txSubtreeTotal(c.id) }))
      .filter(c => c.total !== 0)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

    return nodes.map((c, ni) => {
      const directTxs = txsByCatId[c.id] || []
      const hasChildren = categories.some(ch => ch.parent == c.id && txSubtreeTotal(ch.id) !== 0)
      const hasContent = directTxs.length > 0 || hasChildren
      const isOpen = expandedCats.has(c.id)
      const isLast = ni === nodes.length - 1

      return (
        <div key={c.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.42rem 0.75rem',
            paddingLeft: `${0.75 + level * 1.2}rem`,
            borderBottom: (!isOpen && isLast && level === 0) ? 'none' : '1px solid var(--color-border)',
            background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
          }}>
            {hasContent ? (
              <button onClick={() => toggleCat(c.id)} style={{ background: 'none', border: 'none', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, fontSize: '0.85rem', lineHeight: 1 }}>
                {isOpen ? '▾' : '▸'}
              </button>
            ) : <span style={{ width: '1.4rem', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: level === 0 ? '0.9rem' : '0.83rem', fontWeight: level === 0 ? 600 : 400 }}>{c.name}</span>
            <span style={{ fontWeight: level === 0 ? 700 : 400, fontSize: '0.87rem', flexShrink: 0, color: c.total >= 0 ? '#16a34a' : '#dc2626' }}>
              {c.total > 0 ? '+' : ''}{fmt(c.total)}
            </span>
          </div>
          {isOpen && (
            <>
              {directTxs.sort((a, b) => b.date.localeCompare(a.date)).map((tx, ri) => (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.26rem 0.75rem',
                  paddingLeft: `${0.75 + (level + 1) * 1.2}rem`,
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface)', fontSize: '0.78rem',
                }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{tx.date}</span>
                  <span style={{ flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.recipient || '–'}</span>
                  <span style={{ flex: 1, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.description}
                  </span>
                  <span style={{ fontWeight: 500, flexShrink: 0, color: tx.amount < 0 ? '#dc2626' : '#16a34a' }}>
                    {fmt(tx.amount)}
                  </span>
                </div>
              ))}
              {renderTxCategoryTree(c.id, level + 1)}
            </>
          )}
        </div>
      )
    })
  }

  const uncatRec = filtered.filter(r => !r.categoryId)
  const uncatNet = uncatRec.reduce((s, r) => s + projSigned(r), 0)
  const uncatTxs = txsByCatId['uncategorised'] || []
  const uncatTxTotal = uncatTxs.reduce((s, t) => s + t.amount, 0)

  const PERIOD_LABEL = { month: 'pro Monat', quarter: 'pro Quartal', year: 'pro Jahr' }
  const filterBtnStyle = active => ({
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
    borderRadius: 6, padding: '0.22rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer',
  })
  const pill = active => ({
    padding: '0.2rem 0.48rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : 'none',
    color: active ? '#fff' : 'var(--color-text-muted)',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div className="module">
      <h2>Ausgabenübersicht</h2>

      {/* Unified view selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          ['recurring', 'Daueraufträge'],
          ['tree',      'Kategorienbaum'],
          ['pivot',     'Pivot'],
        ].map(([v, l]) => {
          const active = v === 'recurring' ? source === 'recurring' : source === 'transactions' && txViewMode === v
          return (
            <button key={v} onClick={() => {
              if (v === 'recurring') setSource('recurring')
              else { setSource('transactions'); setTxViewMode(v) }
            }} style={{
              padding: '0.35rem 1rem', borderRadius: 8, cursor: 'pointer', fontSize: '0.88rem',
              fontWeight: active ? 600 : 400,
              border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
              background: active ? 'var(--color-primary)' : 'var(--color-surface)',
              color: active ? '#fff' : 'inherit',
            }}>{l}</button>
          )
        })}
      </div>

      {source === 'recurring' ? (
        <>
          {/* Period tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {[['month', 'Monat'], ['quarter', 'Quartal'], ['year', 'Jahr']].map(([val, label]) => (
              <button key={val} onClick={() => setPeriod(val)} style={pill(period === val)}>{label}</button>
            ))}
          </div>

          {/* Summary cards */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[
              ['Ausgaben ' + PERIOD_LABEL[period], totalExpense, '#dc2626', '–'],
              totalIncome > 0 ? ['Einnahmen ' + PERIOD_LABEL[period], totalIncome, '#16a34a', '+'] : null,
              ['Saldo ' + PERIOD_LABEL[period], totalBalance, totalBalance >= 0 ? '#2563eb' : '#9f1239', totalBalance >= 0 ? '+' : ''],
            ].filter(Boolean).map(([label, val, color, prefix]) => (
              <div key={label} style={{ flex: 1, minWidth: 100, background: color + '0e', border: `1px solid ${color}28`, borderRadius: 8, padding: '0.42rem 0.65rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color, marginTop: 1 }}>{prefix}{fmt(Math.abs(val))}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Typ:</span>
              {[['all', 'Alle'], ['expense', 'Ausgaben'], ['income', 'Einnahmen']].map(([v, l]) => (
                <button key={v} onClick={() => setFilterType(v)} style={filterBtnStyle(filterType === v)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Frequenz:</span>
              {[['', 'Alle'], ['monthly', 'Monatl.'], ['quarterly', 'Quartl.'], ['halfyearly', 'Halbj.'], ['yearly', 'Jährl.']].map(([v, l]) => (
                <button key={v} onClick={() => setFilterFrequency(v)} style={filterBtnStyle(filterFrequency === v)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Suche:</span>
              <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Beschreibung suchen…"
                style={{ fontSize: '0.82rem', padding: '0.22rem 0.5rem', flex: 1, minWidth: 160 }} />
              {hasActiveFilter && (
                <button onClick={resetFilters} style={{ fontSize: '0.78rem', padding: '0.22rem 0.6rem', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151' }}>
                  Filter zurücksetzen
                </button>
              )}
            </div>
          </div>

          {/* Grouping + expand/collapse */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Gruppieren:</span>
            {[['category', 'Kategorie'], ['frequency', 'Frequenz']].map(([v, l]) => (
              <button key={v} onClick={() => setGroupBy(v)} style={filterBtnStyle(groupBy === v)}>{l}</button>
            ))}
            <span style={{ marginLeft: '0.25rem', color: 'var(--color-border)' }}>|</span>
            <button onClick={expandAll}   style={{ fontSize: '0.78rem', padding: '0.22rem 0.6rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, cursor: 'pointer' }}>Alle aufklappen</button>
            <button onClick={collapseAll} style={{ fontSize: '0.78rem', padding: '0.22rem 0.6rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, cursor: 'pointer' }}>Alle zuklappen</button>
            {hasActiveFilter && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({filtered.length} von {recurrings.length})</span>
            )}
          </div>

          {recurrings.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>Noch keine Daueraufträge angelegt.</p>
          ) : filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>Keine Einträge entsprechen den Filterkriterien.</p>
          ) : groupBy === 'category' ? (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              {renderCategoryTree()}
              {uncatRec.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', paddingLeft: '1.65rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  <span>Ohne Kategorie</span>
                  <span style={{ color: uncatNet >= 0 ? '#16a34a' : '#dc2626' }}>{uncatNet > 0 ? '+' : ''}{fmt(uncatNet)}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              {FREQ_ORDER.map((freq, fi) => {
                const items = filtered.filter(r => r.frequency === freq)
                if (items.length === 0) return null
                const net = items.reduce((s, r) => s + projSigned(r), 0)
                const isOpen = expandedFreqs.has(freq)
                const isLast = FREQ_ORDER.slice(fi + 1).every(f => filtered.filter(r => r.frequency === f).length === 0)
                return (
                  <div key={freq}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.42rem 0.75rem', background: 'var(--color-bg)', borderBottom: (!isOpen && isLast) ? 'none' : '1px solid var(--color-border)' }}>
                      <button onClick={() => toggleFreq(freq)} style={{ background: 'none', border: 'none', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, fontSize: '0.85rem', lineHeight: 1 }}>
                        {isOpen ? '▾' : '▸'}
                      </button>
                      <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>{FREQ_FULL[freq]}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.87rem', color: net >= 0 ? '#16a34a' : '#dc2626' }}>{net > 0 ? '+' : ''}{fmt(net)}</span>
                    </div>
                    {isOpen && items.map((r, ri) => (
                      <RecurringRow key={r.id} r={r} projected={proj(r)} indent={1} showCat catById={catById} last={ri === items.length - 1 && isLast} />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Transaction mode filter bar */}
          <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem 0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {/* Row 1: date presets */}
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, marginRight: '0.1rem' }}>Zeitraum:</span>
              {RANGE_PRESETS.map(({ key, label }) => (
                <button key={key} onClick={() => selectTxRange(key)} style={pill(txRangeKey === key)}>{label}</button>
              ))}
            </div>
            {/* Row 2: account, dates, type */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {accounts.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.69rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Konto</div>
                  <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }}>
                    <option value="">Alle Konten</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.69rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Von</div>
                <input type="date" value={txFrom} onChange={e => { setTxFrom(e.target.value); setTxRangeKey('') }}
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
              </div>
              <div>
                <div style={{ fontSize: '0.69rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Bis</div>
                <input type="date" value={txTo} onChange={e => { setTxTo(e.target.value); setTxRangeKey('') }}
                  style={{ fontSize: '0.78rem', padding: '0.2rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4 }} />
              </div>
              <div>
                <div style={{ fontSize: '0.69rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }}>Typ</div>
                <div style={{ display: 'flex', gap: '0.2rem' }}>
                  {[['all','Alle'],['expense','Ausgaben'],['income','Einnahmen']].map(([v,l]) => (
                    <button key={v} onClick={() => setTxFilterType(v)} style={pill(txFilterType === v)}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                {txViewMode === 'tree' && <>
                  <button onClick={expandAll}   style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, cursor: 'pointer' }}>Aufklappen</button>
                  <button onClick={collapseAll} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, cursor: 'pointer' }}>Zuklappen</button>
                </>}
                {txViewMode === 'pivot' && [['month','Monat'],['quarter','Quartal'],['year','Jahr']].map(([v,l]) => (
                  <button key={v} onClick={() => setPivotGroupBy(v)} style={pill(pivotGroupBy === v)}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {txFilterType !== 'income' && (
              <div style={{ flex: 1, minWidth: 100, background: '#dc26260e', border: '1px solid #dc262628', borderRadius: 8, padding: '0.42rem 0.65rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ausgaben</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626', marginTop: 1 }}>{fmt(txTotalExpense)}</div>
              </div>
            )}
            {txFilterType !== 'expense' && txTotalIncome > 0 && (
              <div style={{ flex: 1, minWidth: 100, background: '#16a34a0e', border: '1px solid #16a34a28', borderRadius: 8, padding: '0.42rem 0.65rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Einnahmen</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a', marginTop: 1 }}>+{fmt(txTotalIncome)}</div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 100, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.42rem 0.65rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Umsätze</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 1 }}>{typedFilteredTxs.length}</div>
            </div>
          </div>

          {allTxs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
              Noch keine Umsätze vorhanden. Importieren Sie Kontoauszüge über den PDF-Import.
            </p>
          ) : typedFilteredTxs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
              Keine Umsätze im gewählten Zeitraum.
            </p>
          ) : txViewMode === 'tree' ? (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              {renderTxCategoryTree()}
              {uncatTxs.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', paddingLeft: '1.65rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  <span>Ohne Kategorie</span>
                  <span style={{ color: uncatTxTotal >= 0 ? '#16a34a' : '#dc2626' }}>{uncatTxTotal > 0 ? '+' : ''}{fmt(uncatTxTotal)}</span>
                </div>
              )}
            </div>
          ) : (
            /* ── Pivot table ── */
            (() => {
              const pivotRows = buildPivotRows()
              const ns = { padding: '0.26rem 0.55rem', fontSize: '0.79rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', verticalAlign: 'middle' }
              const cs = { padding: '0.26rem 0.55rem', fontSize: '0.79rem', verticalAlign: 'middle' }
              const sticky = { position: 'sticky', left: 0, zIndex: 1 }
              const clr = v => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : 'var(--color-text-muted)'
              const uncatPVals  = pivotPeriods.map(p => pivotCellMap['uncat']?.[p] || 0)
              const uncatPTotal = uncatPVals.reduce((s, v) => s + v, 0)
              const grandByPeriod = pivotPeriods.map(p =>
                typedFilteredTxs.filter(t => getPivotKey(t.date, pivotGroupBy) === p).reduce((s, t) => s + t.amount, 0)
              )
              const grandTotal = grandByPeriod.reduce((s, v) => s + v, 0)
              return (
                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                        <th style={{ ...cs, ...sticky, background: 'var(--color-bg)', textAlign: 'left', fontWeight: 700, minWidth: 200, whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border)' }}>Kategorie</th>
                        {pivotPeriods.map(p => <th key={p} style={{ ...ns, fontWeight: 700 }}>{pivotLabel(p, pivotGroupBy)}</th>)}
                        <th style={{ ...ns, fontWeight: 700, borderLeft: '2px solid var(--color-border)' }}>Gesamt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pivotRows.map(row => {
                        if (row.header) {
                          const hc = row.header === 'Einnahmen' ? '#16a34a' : '#dc2626'
                          return (
                            <tr key={`h-${row.header}`} style={{ background: hc + '0d', borderBottom: `1px solid ${hc}30` }}>
                              <td style={{ ...cs, ...sticky, background: hc + '0d', borderRight: '1px solid var(--color-border)', fontWeight: 700, color: hc, fontSize: '0.75rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{row.header}</td>
                              {pivotPeriods.map((_, i) => <td key={i} />)}
                              <td style={{ borderLeft: '2px solid var(--color-border)' }} />
                            </tr>
                          )
                        }
                        const { cat, level, hasChildren, isOpen, vals, total } = row
                        return (
                        <tr key={cat.id} style={{ borderBottom: '1px solid var(--color-border)', background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)' }}>
                          <td style={{ ...cs, ...sticky, background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)', paddingLeft: (0.55 + level * 1.1) + 'rem', fontWeight: level === 0 ? 600 : 400, borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                              {hasChildren
                                ? <button onClick={() => setPivotExpandedCats(prev => { const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem', color: 'var(--color-text-muted)', padding: 0, lineHeight: 1, width: '0.9rem' }}>
                                    {isOpen ? '▾' : '▸'}
                                  </button>
                                : <span style={{ display: 'inline-block', width: '0.9rem' }} />}
                              {cat.name}
                            </span>
                          </td>
                          {vals.map((v, i) => (
                            <td key={i} onClick={() => v !== 0 && openDrilldown(cat, pivotPeriods[i])}
                              style={{ ...ns, color: v !== 0 ? clr(v) : 'var(--color-border)', cursor: v !== 0 ? 'pointer' : undefined }}>
                              {v !== 0 ? fmt(v) : '–'}
                            </td>
                          ))}
                          <td onClick={() => total !== 0 && openCatDrilldown(cat)}
                            style={{ ...ns, fontWeight: 700, color: clr(total), borderLeft: '2px solid var(--color-border)', cursor: total !== 0 ? 'pointer' : undefined }}>
                            {total !== 0 ? fmt(total) : ''}
                          </td>
                        </tr>
                        )
                      })}
                      {uncatPTotal !== 0 && (
                        <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                          <td style={{ ...cs, ...sticky, background: 'var(--color-surface)', paddingLeft: '1.5rem', color: 'var(--color-text-muted)', fontStyle: 'italic', borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>ohne Kategorie</td>
                          {uncatPVals.map((v, i) => (
                            <td key={i} onClick={() => v !== 0 && openUncatDrilldown(pivotPeriods[i])}
                              style={{ ...ns, color: v !== 0 ? clr(v) : 'var(--color-border)', cursor: v !== 0 ? 'pointer' : undefined }}>
                              {v !== 0 ? fmt(v) : '–'}
                            </td>
                          ))}
                          <td style={{ ...ns, fontWeight: 700, color: clr(uncatPTotal), borderLeft: '2px solid var(--color-border)' }}>{fmt(uncatPTotal)}</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)', fontWeight: 700 }}>
                        <td style={{ ...cs, ...sticky, background: 'var(--color-bg)', fontWeight: 700, borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>Gesamt</td>
                        {grandByPeriod.map((v, i) => <td key={i} style={{ ...ns, fontWeight: 700, color: clr(v) }}>{v !== 0 ? fmt(v) : ''}</td>)}
                        <td style={{ ...ns, fontWeight: 700, color: clr(grandTotal), borderLeft: '2px solid var(--color-border)' }}>{grandTotal !== 0 ? fmt(grandTotal) : ''}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()
          )}
        </>
      )}

      {drilldown && (
        <PivotDrilldownModal
          title={drilldown.title}
          txSubset={drilldown.txSubset}
          accounts={allAccounts}
          categories={categories}
          onClose={() => setDrilldown(null)}
          onUpdateAccounts={saveAccounts}
          onUpdateTransactions={newSubset => {
            const base = allTransactions.filter(t => !drilldown.txIds.has(t.id))
            saveTransactions([...base, ...newSubset])
            setDrilldown(prev => ({ ...prev, txSubset: newSubset, txIds: new Set(newSubset.map(t => t.id)) }))
          }}
        />
      )}
    </div>
  )
}
