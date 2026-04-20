import { useState, useMemo, Fragment } from 'react'
import { fmt } from '../fmt'

const DATE_DIMS = [
  { key: 'thisMonth', label: 'Dieser Monat' },
  { key: 'lastMonth', label: 'Letzter Monat' },
  { key: 'thisQ',     label: 'Dieses Quartal' },
  { key: 'lastQ',     label: 'Letztes Quartal' },
  { key: 'thisYear',  label: 'Dieses Jahr' },
  { key: 'lastYear',  label: 'Letztes Jahr' },
  { key: 'all',       label: 'Alles' },
]

function getDateRange(key) {
  const n = new Date()
  const y = n.getFullYear(), m = n.getMonth()   // m is 0-indexed
  const p   = s  => String(s).padStart(2, '0')
  const iso = (yr, mo, day) => `${yr}-${p(mo + 1)}-${p(day)}`
  const end = (yr, mo)      => new Date(yr, mo + 1, 0).getDate()
  const q = Math.floor(m / 3)
  switch (key) {
    case 'thisMonth': return { from: iso(y, m, 1), to: iso(y, m, end(y, m)) }
    case 'lastMonth': { const lm = m === 0 ? 11 : m - 1, ly = m === 0 ? y - 1 : y; return { from: iso(ly, lm, 1), to: iso(ly, lm, end(ly, lm)) } }
    case 'thisQ':  return { from: iso(y, q*3, 1), to: iso(y, q*3+2, end(y, q*3+2)) }
    case 'lastQ':  { const lq = q === 0 ? 3 : q - 1, lqy = q === 0 ? y - 1 : y; return { from: iso(lqy, lq*3, 1), to: iso(lqy, lq*3+2, end(lqy, lq*3+2)) } }
    case 'thisYear': return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'lastYear': return { from: `${y-1}-01-01`, to: `${y-1}-12-31` }
    default: return { from: '', to: '' }
  }
}

function getPeriodKey(dateStr, groupBy) {
  const [y, m] = dateStr.split('-')
  if (groupBy === 'month')   return `${y}-${m}`
  if (groupBy === 'quarter') return `${y}-Q${Math.ceil(parseInt(m) / 3)}`
  return y
}

function periodLabel(key, groupBy) {
  if (groupBy === 'month') {
    const [y, m] = key.split('-')
    const names = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
    return `${names[parseInt(m)-1]} ${y.slice(2)}`
  }
  if (groupBy === 'quarter') {
    const [y, q] = key.split('-')
    return `${q} ${y.slice(2)}`
  }
  return key
}

function generatePeriods(from, to, groupBy) {
  if (!from || !to) return []
  const periods = []
  const cur = new Date(from + 'T00:00:00')
  const end = new Date(to   + 'T00:00:00')
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = cur.getMonth() + 1  // 1-indexed, local time
    const p = n => String(n).padStart(2, '0')
    const key = groupBy === 'month'   ? `${y}-${p(m)}`
               : groupBy === 'quarter' ? `${y}-Q${Math.ceil(m / 3)}`
               : String(y)
    if (!periods.length || periods[periods.length - 1] !== key) periods.push(key)
    if (groupBy === 'month')        cur.setMonth(cur.getMonth() + 1)
    else if (groupBy === 'quarter') cur.setMonth(cur.getMonth() + 3)
    else                            cur.setFullYear(cur.getFullYear() + 1)
  }
  return periods
}

export default function TransactionPivot() {
  const transactions = useMemo(() => JSON.parse(localStorage.getItem('transactions'))    || [], [])
  const categories   = useMemo(() => JSON.parse(localStorage.getItem('categories'))      || [], [])
  const accounts     = useMemo(() => JSON.parse(localStorage.getItem('bankAccounts'))    || [], [])

  const init = getDateRange('thisYear')
  const [dateDim,     setDateDim]     = useState('thisYear')
  const [dateFrom,    setDateFrom]    = useState(init.from)
  const [dateTo,      setDateTo]      = useState(init.to)
  const [filterAcc,   setFilterAcc]   = useState('')
  const [filterType,  setFilterType]  = useState('expense')
  const [groupBy,     setGroupBy]     = useState('month')
  const [expandedCats, setExpandedCats] = useState(new Set())

  function selectDim(key) {
    setDateDim(key)
    if (key === 'all') {
      const dates = transactions.map(t => t.date).filter(Boolean).sort()
      setDateFrom(dates[0] || '')
      setDateTo(dates[dates.length - 1] || '')
    } else {
      const r = getDateRange(key)
      setDateFrom(r.from)
      setDateTo(r.to)
    }
  }

  function toggleCat(id) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filtered = useMemo(() =>
    transactions.filter(t => {
      if (filterAcc  && t.accountId !== parseInt(filterAcc)) return false
      if (dateFrom   && t.date < dateFrom) return false
      if (dateTo     && t.date > dateTo)   return false
      if (filterType === 'income'  && t.amount <= 0) return false
      if (filterType === 'expense' && t.amount >= 0) return false
      return true
    }),
    [transactions, filterAcc, dateFrom, dateTo, filterType]
  )

  const periods = useMemo(() => generatePeriods(dateFrom, dateTo, groupBy), [dateFrom, dateTo, groupBy])

  const nameToId = useMemo(() => Object.fromEntries(categories.map(c => [c.name, c.id])), [categories])

  // catId (or 'uncat') → periodKey → sum
  const cellMap = useMemo(() => {
    const map = {}
    for (const tx of filtered) {
      const catId = tx.category ? (nameToId[tx.category] ?? 'uncat') : 'uncat'
      const period = getPeriodKey(tx.date, groupBy)
      if (!map[catId]) map[catId] = {}
      map[catId][period] = (map[catId][period] || 0) + tx.amount
    }
    return map
  }, [filtered, nameToId, groupBy])

  // Sum of category subtree for one period
  function subtreeVal(catId, period) {
    const direct = cellMap[catId]?.[period] || 0
    return direct + categories
      .filter(c => c.parent == catId)
      .reduce((s, c) => s + subtreeVal(c.id, period), 0)
  }

  function subtreeHasData(catId) {
    return periods.some(p => subtreeVal(catId, p) !== 0)
  }

  function rowTotal(catId) {
    return periods.reduce((s, p) => s + subtreeVal(catId, p), 0)
  }

  // Build flat row list (handles expand/collapse)
  function buildRows(parentId = null, level = 0) {
    const rows = []
    const nodes = categories
      .filter(c => (c.parent ?? null) == parentId && subtreeHasData(c.id))
      .sort((a, b) => Math.abs(rowTotal(b.id)) - Math.abs(rowTotal(a.id)))

    for (const cat of nodes) {
      const hasChildren = categories.some(c => c.parent == cat.id && subtreeHasData(c.id))
      const isOpen      = expandedCats.has(cat.id)
      const vals        = periods.map(p => subtreeVal(cat.id, p))
      const total       = vals.reduce((s, v) => s + v, 0)
      rows.push({ cat, level, hasChildren, isOpen, vals, total })
      if (isOpen) rows.push(...buildRows(cat.id, level + 1))
    }
    return rows
  }

  const rows = useMemo(() => buildRows(), [categories, cellMap, periods, expandedCats])

  const uncatVals  = periods.map(p => cellMap['uncat']?.[p] || 0)
  const uncatTotal = uncatVals.reduce((s, v) => s + v, 0)

  const grandByPeriod = periods.map(p =>
    filtered.filter(t => getPeriodKey(t.date, groupBy) === p).reduce((s, t) => s + t.amount, 0)
  )
  const grandTotal = grandByPeriod.reduce((s, v) => s + v, 0)

  const fmtCell  = v => v !== 0 ? fmt(v) : ''
  const cellClr  = v => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : 'var(--color-text-muted)'

  const cs  = { padding: '0.26rem 0.55rem', fontSize: '0.79rem', verticalAlign: 'middle' }
  const ns  = { ...cs, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const fl  = { fontSize: '0.69rem', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: 2 }
  const sel = { fontSize: '0.78rem', padding: '0.2rem 0.35rem', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-surface)' }
  const pill = active => ({
    padding: '0.2rem 0.5rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.73rem',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-muted)', fontWeight: active ? 600 : 400,
  })

  const stickyBase = { position: 'sticky', left: 0, zIndex: 1 }

  return (
    <div className="module">
      <h2>Pivot-Auswertung</h2>

      {/* Filter bar */}
      <div style={{ marginBottom: '1rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.6rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {/* Date presets */}
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: 2 }}>Zeitraum</span>
          {DATE_DIMS.map(({ key, label }) => (
            <button key={key} onClick={() => selectDim(key)} style={pill(dateDim === key)}>{label}</button>
          ))}
        </div>
        {/* Second row: account, dates, type, grouping */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {accounts.length > 0 && (
            <div>
              <div style={fl}>Konto</div>
              <select value={filterAcc} onChange={e => setFilterAcc(e.target.value)} style={sel}>
                <option value="">Alle Konten</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <div style={fl}>Von</div>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateDim('') }} style={sel} />
          </div>
          <div>
            <div style={fl}>Bis</div>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateDim('') }} style={sel} />
          </div>
          <div>
            <div style={fl}>Typ</div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={sel}>
              <option value="expense">Ausgaben</option>
              <option value="income">Einnahmen</option>
              <option value="all">Alle</option>
            </select>
          </div>
          <div>
            <div style={fl}>Spalten</div>
            <div style={{ display: 'flex', gap: '0.2rem' }}>
              {[['month','Monat'],['quarter','Quartal'],['year','Jahr']].map(([v, l]) => (
                <button key={v} onClick={() => setGroupBy(v)} style={pill(groupBy === v)}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
              {filtered.length} Umsätze · {periods.length} {groupBy === 'month' ? 'Monate' : groupBy === 'quarter' ? 'Quartale' : 'Jahre'}
            </span>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
          Keine Umsätze im gewählten Zeitraum.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.79rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
                <th style={{ ...cs, ...stickyBase, background: 'var(--color-bg)', textAlign: 'left', fontWeight: 700, minWidth: 200, whiteSpace: 'nowrap', borderRight: '1px solid var(--color-border)' }}>
                  Kategorie
                </th>
                {periods.map(p => (
                  <th key={p} style={{ ...ns, fontWeight: 700, background: 'var(--color-bg)', whiteSpace: 'nowrap' }}>{periodLabel(p, groupBy)}</th>
                ))}
                <th style={{ ...ns, fontWeight: 700, background: 'var(--color-bg)', borderLeft: '2px solid var(--color-border)', whiteSpace: 'nowrap' }}>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ cat, level, hasChildren, isOpen, vals, total }) => (
                <tr key={cat.id} style={{ borderBottom: '1px solid var(--color-border)', background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)' }}>
                  <td style={{ ...cs, ...stickyBase, background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)', paddingLeft: (0.55 + level * 1.1) + 'rem', fontWeight: level === 0 ? 600 : 400, borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                      {hasChildren
                        ? <button onClick={() => toggleCat(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem', color: 'var(--color-text-muted)', padding: 0, lineHeight: 1, width: '0.9rem' }}>
                            {isOpen ? '▾' : '▸'}
                          </button>
                        : <span style={{ display: 'inline-block', width: '0.9rem' }} />
                      }
                      {cat.name}
                    </span>
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} style={{ ...ns, color: v !== 0 ? cellClr(v) : 'var(--color-border)' }}>{v !== 0 ? fmt(v) : '–'}</td>
                  ))}
                  <td style={{ ...ns, fontWeight: 700, color: cellClr(total), borderLeft: '2px solid var(--color-border)' }}>{fmtCell(total)}</td>
                </tr>
              ))}

              {uncatTotal !== 0 && (
                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  <td style={{ ...cs, ...stickyBase, background: 'var(--color-surface)', paddingLeft: '1.5rem', color: 'var(--color-text-muted)', fontStyle: 'italic', borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                    ohne Kategorie
                  </td>
                  {uncatVals.map((v, i) => (
                    <td key={i} style={{ ...ns, color: v !== 0 ? cellClr(v) : 'var(--color-border)' }}>{v !== 0 ? fmt(v) : '–'}</td>
                  ))}
                  <td style={{ ...ns, fontWeight: 700, color: cellClr(uncatTotal), borderLeft: '2px solid var(--color-border)' }}>{fmtCell(uncatTotal)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)', fontWeight: 700 }}>
                <td style={{ ...cs, ...stickyBase, background: 'var(--color-bg)', fontWeight: 700, borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>Gesamt</td>
                {grandByPeriod.map((v, i) => (
                  <td key={i} style={{ ...ns, fontWeight: 700, color: cellClr(v) }}>{fmtCell(v)}</td>
                ))}
                <td style={{ ...ns, fontWeight: 700, color: cellClr(grandTotal), borderLeft: '2px solid var(--color-border)' }}>{fmtCell(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
