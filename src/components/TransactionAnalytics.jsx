import { useState, useMemo } from 'react'
import { fmt } from '../fmt'

const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#f97316', '#8b5cf6',
  '#ec4899', '#06b6d4', '#eab308', '#14b8a6', '#84cc16',
]

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

function isoToGermanMonthYear(iso) {
  const [y, m] = iso.split('-')
  const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  return `${names[parseInt(m) - 1]} ${y.slice(2)}`
}

function getPeriodKey(date, groupBy) {
  const [y, m] = date.split('-')
  if (groupBy === 'month') return `${y}-${m}`
  if (groupBy === 'quarter') return `${y}-Q${Math.ceil(parseInt(m) / 3)}`
  return y
}

function formatPeriodLabel(key, groupBy) {
  if (groupBy === 'month') return isoToGermanMonthYear(key + '-01')
  if (groupBy === 'quarter') {
    const [y, q] = key.split('-')
    return `${q} ${y}`
  }
  return key
}

// ── SVG bar chart ──────────────────────────────────────────────────────
function BarChart({ data, height = 140 }) {
  if (data.length === 0) return null
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1)
  const W = 600
  const PAD_L = 48, PAD_R = 8, PAD_T = 16, PAD_B = 36
  const chartW = W - PAD_L - PAD_R
  const chartH = height - PAD_T - PAD_B
  const groupW = chartW / data.length
  const barW = Math.max(4, Math.min(18, groupW * 0.3))
  const gap = Math.max(2, barW * 0.3)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: PAD_T + chartH * (1 - f), val: maxVal * f }))

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="var(--color-border)" strokeWidth={0.5} />
          <text x={PAD_L - 4} y={t.y + 4} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">
            {t.val >= 1000 ? `${(t.val / 1000).toFixed(0)}k` : t.val.toFixed(0)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = PAD_L + (i + 0.5) * groupW
        const incH = (d.income / maxVal) * chartH
        const expH = (d.expense / maxVal) * chartH
        const net = d.income - d.expense
        return (
          <g key={i}>
            {d.income > 0 && (
              <rect x={cx - barW - gap / 2} y={PAD_T + chartH - incH} width={barW} height={incH} fill="#22c55e" rx={2}>
                <title>{d.label}: Einnahmen {fmt(d.income)}</title>
              </rect>
            )}
            {d.expense > 0 && (
              <rect x={cx + gap / 2} y={PAD_T + chartH - expH} width={barW} height={expH} fill="#ef4444" rx={2}>
                <title>{d.label}: Ausgaben {fmt(d.expense)}</title>
              </rect>
            )}
            <text x={cx} y={height - PAD_B + 12} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">{d.label}</text>
            {(d.income > 0 || d.expense > 0) && (
              <text x={cx} y={PAD_T + chartH - Math.max(incH, expH) - 4} textAnchor="middle" fontSize={8}
                fill={net >= 0 ? '#16a34a' : '#dc2626'}>
                {net >= 0 ? '+' : ''}{Math.abs(net) >= 1000 ? `${(net / 1000).toFixed(1)}k` : net.toFixed(0)}
              </text>
            )}
          </g>
        )
      })}
      <g transform={`translate(${PAD_L}, ${height - 6})`}>
        <rect x={0} y={-7} width={10} height={8} fill="#22c55e" rx={2} />
        <text x={13} y={0} fontSize={9} fill="var(--color-text-muted)">Einnahmen</text>
        <rect x={70} y={-7} width={10} height={8} fill="#ef4444" rx={2} />
        <text x={83} y={0} fontSize={9} fill="var(--color-text-muted)">Ausgaben</text>
      </g>
    </svg>
  )
}

// ── SVG line chart ─────────────────────────────────────────────────────
function LineChart({ data, height = 110 }) {
  if (data.length < 2) return null
  const values = data.map(d => d.value)
  const minV = Math.min(...values), maxV = Math.max(...values)
  const range = maxV - minV || 1
  const W = 600
  const PAD_L = 52, PAD_R = 8, PAD_T = 12, PAD_B = 28
  const chartW = W - PAD_L - PAD_R
  const chartH = height - PAD_T - PAD_B
  const pts = data.map((d, i) => ({
    x: PAD_L + (i / (data.length - 1)) * chartW,
    y: PAD_T + chartH - ((d.value - minV) / range) * chartH,
    ...d,
  }))
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = `${PAD_L},${PAD_T + chartH} ` + polyline + ` ${PAD_L + chartW},${PAD_T + chartH}`
  const ticks = [0, 0.5, 1].map(f => ({ y: PAD_T + chartH * (1 - f), val: minV + range * f }))

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="var(--color-border)" strokeWidth={0.5} />
          <text x={PAD_L - 4} y={t.y + 4} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">
            {Math.abs(t.val) >= 1000 ? `${(t.val / 1000).toFixed(0)}k` : t.val.toFixed(0)}
          </text>
        </g>
      ))}
      <polygon points={area} fill="url(#lineGrad)" />
      <polyline points={polyline} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" />
      {pts.filter((_, i) => i === 0 || i === pts.length - 1 || pts.length <= 12).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--color-primary)">
          <title>{p.label}: {fmt(p.value)}</title>
        </circle>
      ))}
      {pts.filter((_, i, arr) => {
        if (arr.length <= 8) return true
        const step = Math.ceil(arr.length / 6)
        return i === 0 || i === arr.length - 1 || i % step === 0
      }).map((p, i) => (
        <text key={i} x={p.x} y={height - 4} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">{p.label}</text>
      ))}
    </svg>
  )
}

// ── Donut chart ────────────────────────────────────────────────────────
function DonutChart({ segments, size = 140, stroke = 28, centerLabel, centerValue }) {
  if (!segments.length) return null
  let angle = 0
  const stops = segments.map((seg, i) => {
    const start = angle
    angle = i === segments.length - 1 ? 360 : +(angle + seg.pct / 100 * 360).toFixed(4)
    return `${seg.color} ${start}deg ${angle}deg`
  })
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: `conic-gradient(from -90deg, ${stops.join(', ')})` }} />
      <div style={{
        position: 'absolute', top: stroke, left: stroke, right: stroke, bottom: stroke,
        borderRadius: '50%', background: 'var(--color-surface)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {centerValue != null && <>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', lineHeight: 1.1 }}>{centerValue}</span>
          {centerLabel && <span style={{ fontSize: '0.56rem', color: 'var(--color-text-muted)', marginTop: 2, textTransform: 'uppercase' }}>{centerLabel}</span>}
        </>}
      </div>
    </div>
  )
}

// ── Recurring → synthetic transactions ────────────────────────────────
function generateRecurringTxs(recurrings, categories, from, to) {
  const result = []
  for (const p of recurrings) {
    if (!p.amount || !p.frequency || !p.startDate) continue
    const cat = categories.find(c => c.id == p.categoryId)
    const catName = cat?.name || ''
    const isIncome = p.type === 'Einnahme' || cat?.type === 'Einnahme'
    const pEnd = p.endDate && p.endDate < to ? p.endDate : to
    let cur = new Date(p.startDate)
    const toDate = new Date(pEnd)
    while (cur <= toDate) {
      const d = cur.toISOString().slice(0, 10)
      if (d >= from) {
        result.push({ id: `r-${p.id}-${d}`, date: d, description: p.name || '–', amount: isIncome ? Math.abs(p.amount) : -Math.abs(p.amount), category: catName, recipient: '' })
      }
      const nx = new Date(cur)
      if (p.frequency === 'monthly')     nx.setMonth(nx.getMonth() + 1)
      else if (p.frequency === 'quarterly')  nx.setMonth(nx.getMonth() + 3)
      else if (p.frequency === 'halfyearly') nx.setMonth(nx.getMonth() + 6)
      else if (p.frequency === 'yearly') nx.setFullYear(nx.getFullYear() + 1)
      else break
      if (nx <= cur) break
      cur = nx
    }
  }
  return result
}

// ── Main component ─────────────────────────────────────────────────────
export default function TransactionAnalytics() {
  const transactions      = useMemo(() => JSON.parse(localStorage.getItem('transactions')) || [], [])
  const recurringPayments = useMemo(() => JSON.parse(localStorage.getItem('recurringPayments')) || [], [])
  const accounts          = useMemo(() => JSON.parse(localStorage.getItem('bankAccounts')) || [], [])
  const categories        = useMemo(() => JSON.parse(localStorage.getItem('categories')) || [], [])

  const [source,        setSource]        = useState('transactions')
  const [groupBy,       setGroupBy]       = useState('month')
  const [filterAccount, setFilterAccount] = useState('')
  const [rangeKey,      setRangeKey]      = useState('thisYear')

  const { from, to } = useMemo(() => getDateRange(rangeKey), [rangeKey])

  const filtered = useMemo(() => {
    if (source === 'recurring') return generateRecurringTxs(recurringPayments, categories, from, to)
    return transactions.filter(t => {
      if (filterAccount && t.accountId !== parseInt(filterAccount)) return false
      if (t.date < from || t.date > to) return false
      return true
    })
  }, [source, transactions, recurringPayments, categories, filterAccount, from, to])

  const periodMap = useMemo(() => {
    const map = {}
    for (const tx of filtered) {
      const key = getPeriodKey(tx.date, groupBy)
      if (!map[key]) map[key] = { income: 0, expense: 0, txCount: 0 }
      if (tx.amount > 0) map[key].income += tx.amount
      else map[key].expense += Math.abs(tx.amount)
      map[key].txCount++
    }
    return map
  }, [filtered, groupBy])

  const periodData = useMemo(() =>
    Object.keys(periodMap).sort().map(k => ({ key: k, label: formatPeriodLabel(k, groupBy), ...periodMap[k] })),
    [periodMap, groupBy]
  )

  const catExpense = useMemo(() => {
    const map = {}
    for (const tx of filtered) {
      if (tx.amount >= 0) continue
      const cat = tx.category || '(ohne Kategorie)'
      map[cat] = (map[cat] || 0) + Math.abs(tx.amount)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const catIncome = useMemo(() => {
    const map = {}
    for (const tx of filtered) {
      if (tx.amount <= 0) continue
      const cat = tx.category || '(ohne Kategorie)'
      map[cat] = (map[cat] || 0) + tx.amount
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const totalExpense = catExpense.reduce((s, [, v]) => s + v, 0)
  const totalIncome  = catIncome.reduce((s, [, v]) => s + v, 0)
  const netBalance   = totalIncome - totalExpense

  const donutSegments = useMemo(() => {
    const top = catExpense.slice(0, 8)
    const rest = catExpense.slice(8).reduce((s, [, v]) => s + v, 0)
    const items = rest > 0 ? [...top, ['Sonstige', rest]] : top
    const total = items.reduce((s, [, v]) => s + v, 0)
    return items.map(([name, val], i) => ({
      name, val, color: PALETTE[i % PALETTE.length], pct: total > 0 ? (val / total) * 100 : 0,
    }))
  }, [catExpense])

  const balanceTrend = useMemo(() => {
    const accId = filterAccount ? parseInt(filterAccount) : null
    const relevantAccounts = accId ? accounts.filter(a => a.id === accId) : accounts
    const initBalance = relevantAccounts.reduce((sum, acc) => {
      const txSum = transactions.filter(t => t.accountId === acc.id).reduce((s, t) => s + t.amount, 0)
      return sum + (acc.balance || 0) - txSum
    }, 0)
    const base = accId ? transactions.filter(t => t.accountId === accId) : transactions
    const relevantTxs = base.filter(t => t.date >= from && t.date <= to).sort((a, b) => a.date.localeCompare(b.date))
    if (relevantTxs.length === 0) return []
    let running = initBalance + base.filter(t => t.date < from).reduce((s, t) => s + t.amount, 0)
    const byPeriod = {}
    for (const tx of relevantTxs) {
      const key = getPeriodKey(tx.date, groupBy)
      byPeriod[key] = (byPeriod[key] || 0) + tx.amount
    }
    return Object.keys(byPeriod).sort().map(key => {
      running += byPeriod[key]
      return { key, label: formatPeriodLabel(key, groupBy), value: running }
    })
  }, [transactions, accounts, filterAccount, groupBy, from, to])

  const topExpenses = useMemo(() =>
    [...filtered].filter(t => t.amount < 0).sort((a, b) => a.amount - b.amount).slice(0, 5),
    [filtered]
  )

  if (transactions.length === 0 && recurringPayments.length === 0) {
    return (
      <div className="module">
        <h2>Ausgaben-Übersicht</h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          Noch keine Daten vorhanden. Importieren Sie Umsätze über den PDF-Import oder legen Sie Daueraufträge an.
        </p>
      </div>
    )
  }

  const sec = { fontSize: '0.71rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }
  const pill = active => ({
    padding: '0.2rem 0.48rem', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem',
    border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-primary)' : 'none',
    color: active ? '#fff' : 'var(--color-text-muted)',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div className="module">
      <h2>Ausgaben-Übersicht</h2>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.55rem 0.7rem' }}>
        {/* Row 1: source, account, grouping, count */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Quelle</span>
          {[['transactions', 'Umsätze'], ['recurring', 'Daueraufträge']].map(([val, label]) => (
            <button key={val} onClick={() => setSource(val)} style={pill(source === val)}>{label}</button>
          ))}
          {source === 'transactions' && (
            <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', borderRadius: 6, border: '1px solid var(--color-border)', marginLeft: '0.25rem' }}>
              <option value="">Alle Konten</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Gruppe</span>
            {[['month', 'Monat'], ['quarter', 'Quartal'], ['year', 'Jahr']].map(([val, label]) => (
              <button key={val} onClick={() => setGroupBy(val)} style={pill(groupBy === val)}>{label}</button>
            ))}
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{filtered.length} Eintr.</span>
        </div>
        {/* Row 2: time range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: '0.1rem', flexShrink: 0 }}>Zeitraum</span>
          {RANGE_PRESETS.map(({ key, label }) => (
            <button key={key} onClick={() => setRangeKey(key)} style={pill(rangeKey === key)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          ['Einnahmen', totalIncome, '#16a34a', '+'],
          ['Ausgaben', totalExpense, '#dc2626', '–'],
          ['Saldo', netBalance, netBalance >= 0 ? '#2563eb' : '#9f1239', netBalance >= 0 ? '+' : ''],
        ].map(([label, val, color, prefix]) => (
          <div key={label} style={{ flex: 1, minWidth: 100, background: color + '0e', border: `1px solid ${color}28`, borderRadius: 8, padding: '0.42rem 0.65rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color, marginTop: 1 }}>{prefix}{fmt(Math.abs(val))}</div>
          </div>
        ))}
      </div>

      {/* ── Bar chart ── */}
      {periodData.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={sec}>Einnahmen vs. Ausgaben</div>
          <BarChart data={periodData} />
        </div>
      )}

      {/* ── Balance trend ── */}
      {source === 'transactions' && balanceTrend.length >= 2 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={sec}>Kontoverlauf</div>
          <LineChart data={balanceTrend} />
        </div>
      )}

      {/* ── Category breakdown ── */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {donutSegments.length > 0 && (
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={sec}>Ausgaben nach Kategorie</div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <DonutChart segments={donutSegments} centerValue={fmt(totalExpense)} centerLabel="Ausgaben" />
              <div style={{ flex: 1, minWidth: 110, display: 'flex', flexDirection: 'column', gap: '0.26rem' }}>
                {donutSegments.map(seg => (
                  <div key={seg.name} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: seg.color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.74rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.name}</span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 600, flexShrink: 0 }}>{fmt(seg.val)}</span>
                    <span style={{ fontSize: '0.63rem', color: 'var(--color-text-muted)', flexShrink: 0, width: '2.5rem', textAlign: 'right' }}>
                      {seg.pct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {catIncome.length > 0 && (
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={sec}>Einnahmen nach Kategorie</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.32rem' }}>
              {catIncome.slice(0, 8).map(([name, val], i) => {
                const pct = totalIncome > 0 ? (val / totalIncome) * 100 : 0
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 2 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                      <span style={{ fontWeight: 600, flexShrink: 0, marginLeft: 8, color: '#16a34a' }}>{fmt(val)}</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 9999, background: 'var(--color-border)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: PALETTE[i % PALETTE.length], borderRadius: 9999 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Period table ── */}
      {periodData.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={sec}>Perioden-Übersicht</div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  {['Zeitraum', 'Einnahmen', 'Ausgaben', 'Saldo', 'Anz.'].map(h => (
                    <th key={h} style={{ padding: '0.3rem 0.5rem', textAlign: h === 'Zeitraum' ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...periodData].reverse().map(d => {
                  const net = d.income - d.expense
                  return (
                    <tr key={d.key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.25rem 0.5rem', fontWeight: 500 }}>{d.label}</td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>
                        {d.income > 0 ? '+' + fmt(d.income) : '–'}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                        {d.expense > 0 ? fmt(d.expense) : '–'}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', fontWeight: 700, color: net >= 0 ? '#2563eb' : '#9f1239' }}>
                        {net >= 0 ? '+' : ''}{fmt(net)}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>{d.txCount}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: 'var(--color-bg)', fontWeight: 700 }}>
                  <td style={{ padding: '0.3rem 0.5rem' }}>Gesamt</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: '#16a34a' }}>+{fmt(totalIncome)}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: '#dc2626' }}>{fmt(totalExpense)}</td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: netBalance >= 0 ? '#2563eb' : '#9f1239' }}>
                    {netBalance >= 0 ? '+' : ''}{fmt(netBalance)}
                  </td>
                  <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>{filtered.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top expenses ── */}
      {topExpenses.length > 0 && (
        <div>
          <div style={sec}>Größte Ausgaben</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem' }}>
            {topExpenses.map((tx, i) => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem', borderRadius: 7, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <span style={{ width: 19, height: 19, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.63rem', fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{tx.date}</span>
                <span style={{ fontSize: '0.74rem', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.recipient || '–'}</span>
                <span style={{ fontSize: '0.74rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>{tx.description}</span>
                <span style={{ fontWeight: 700, color: '#dc2626', flexShrink: 0, fontSize: '0.82rem' }}>–{fmt(Math.abs(tx.amount))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
