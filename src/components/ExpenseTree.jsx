import { useState, useMemo } from 'react'
import { fmt } from '../fmt'

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

export default function ExpenseTree() {
  const [source,        setSource]        = useState('recurring')
  const [period,        setPeriod]        = useState('month')
  const [txRangeKey,    setTxRangeKey]    = useState('thisYear')
  const [groupBy,       setGroupBy]       = useState('category')
  const [expandedCats,  setExpandedCats]  = useState(new Set())
  const [expandedFreqs, setExpandedFreqs] = useState(new Set(FREQ_ORDER))

  const [filterType,      setFilterType]      = useState('all')
  const [filterFrequency, setFilterFrequency] = useState('')
  const [filterSearch,    setFilterSearch]    = useState('')

  const recurrings  = JSON.parse(localStorage.getItem('recurringPayments')) || []
  const categories  = JSON.parse(localStorage.getItem('categories'))        || []
  const allTxs      = useMemo(() =>
    source === 'transactions' ? JSON.parse(localStorage.getItem('transactions')) || [] : [],
    [source]
  )

  const { from: txFrom, to: txTo } = useMemo(() => getDateRange(txRangeKey), [txRangeKey])

  const filteredTxs = useMemo(() =>
    allTxs.filter(t => t.date >= txFrom && t.date <= txTo),
    [allTxs, txFrom, txTo]
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

  const txCatTotals = useMemo(() => {
    const totals = {}
    for (const tx of filteredTxs) {
      const catId = tx.category ? (nameToId[tx.category] ?? null) : null
      const key = catId !== null ? catId : 'uncategorised'
      totals[key] = (totals[key] || 0) + tx.amount
    }
    return totals
  }, [filteredTxs, nameToId])

  const txsByCatId = useMemo(() => {
    const map = {}
    for (const tx of filteredTxs) {
      const catId = tx.category ? (nameToId[tx.category] ?? 'uncategorised') : 'uncategorised'
      if (!map[catId]) map[catId] = []
      map[catId].push(tx)
    }
    return map
  }, [filteredTxs, nameToId])

  function txSubtreeTotal(catId) {
    return (txCatTotals[catId] || 0)
      + categories.filter(c => c.parent == catId).reduce((s, c) => s + txSubtreeTotal(c.id), 0)
  }

  const txTotalExpense = useMemo(() =>
    filteredTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [filteredTxs]
  )
  const txTotalIncome = useMemo(() =>
    filteredTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [filteredTxs]
  )

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
              {directTxs.sort((a, b) => a.amount - b.amount).map((tx, ri) => (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.26rem 0.75rem',
                  paddingLeft: `${0.75 + (level + 1) * 1.2}rem`,
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-surface)', fontSize: '0.78rem',
                }}>
                  <span style={{ flex: 1, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.description}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{tx.date}</span>
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

      {/* Source toggle */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Quelle:</span>
        {[['recurring', 'Daueraufträge'], ['transactions', 'Umsätze']].map(([val, label]) => (
          <button key={val} onClick={() => setSource(val)} style={pill(source === val)}>{label}</button>
        ))}
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
          {/* Transaction mode: date range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 600, marginRight: '0.15rem' }}>Zeitraum:</span>
            {RANGE_PRESETS.map(({ key, label }) => (
              <button key={key} onClick={() => setTxRangeKey(key)} style={pill(txRangeKey === key)}>{label}</button>
            ))}
            <span style={{ marginLeft: '0.5rem', color: 'var(--color-border)' }}>|</span>
            <button onClick={expandAll}   style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, cursor: 'pointer' }}>Aufklappen</button>
            <button onClick={collapseAll} style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6, cursor: 'pointer' }}>Zuklappen</button>
          </div>

          {/* Transaction summary cards */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div style={{ flex: 1, minWidth: 100, background: '#dc26260e', border: '1px solid #dc262628', borderRadius: 8, padding: '0.42rem 0.65rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ausgaben</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#dc2626', marginTop: 1 }}>{fmt(txTotalExpense)}</div>
            </div>
            {txTotalIncome > 0 && (
              <div style={{ flex: 1, minWidth: 100, background: '#16a34a0e', border: '1px solid #16a34a28', borderRadius: 8, padding: '0.42rem 0.65rem' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Einnahmen</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#16a34a', marginTop: 1 }}>+{fmt(txTotalIncome)}</div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 100, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.42rem 0.65rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Umsätze</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 1 }}>{filteredTxs.length}</div>
            </div>
          </div>

          {allTxs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
              Noch keine Umsätze vorhanden. Importieren Sie Kontoauszüge über den PDF-Import.
            </p>
          ) : filteredTxs.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
              Keine Umsätze im gewählten Zeitraum.
            </p>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              {renderTxCategoryTree()}
              {uncatTxs.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.75rem', paddingLeft: '1.65rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                  <span>Ohne Kategorie</span>
                  <span style={{ color: uncatTxTotal >= 0 ? '#16a34a' : '#dc2626' }}>{uncatTxTotal > 0 ? '+' : ''}{fmt(uncatTxTotal)}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
