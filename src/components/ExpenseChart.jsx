import { useState } from 'react'
import { fmt } from '../fmt'

const FREQ_FACTOR = {
  month:   { monthly: 1,  quarterly: 1/3, halfyearly: 1/6,  yearly: 1/12 },
  quarter: { monthly: 3,  quarterly: 1,   halfyearly: 1/2,  yearly: 1/4  },
  year:    { monthly: 12, quarterly: 4,   halfyearly: 2,    yearly: 1    },
}

const PERIOD_LABEL = { month: 'Monat', quarter: 'Quartal', year: 'Jahr' }
const PERIOD_SHORT = { month: 'pro Monat', quarter: 'pro Quartal', year: 'pro Jahr' }

const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#14b8a6', '#84cc16',
]

function recIsIncome(r, catById) {
  const type = r.type || catById[r.categoryId]?.type
  return type === 'Einnahme'
}

// DonutChart using stroke-dasharray trick
function DonutChart({ segments, size = 200, strokeWidth = 38 }) {
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const gapCirc = 0
  let offsetAngle = -90

  return (
    <svg width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      {segments.length === 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--color-border)" strokeWidth={strokeWidth}
        />
      )}
      {segments.map((seg, i) => {
        const fraction = seg.pct / 100
        const arcLen = circumference * fraction
        const dashArray = Math.max(0, arcLen - gapCirc)
        const rotation = offsetAngle
        offsetAngle += fraction * 360
        if (dashArray <= 0) return null
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashArray} ${circumference}`}
            strokeDashoffset={circumference / 4}
            style={{ transform: `rotate(${rotation + 90}deg)`, transformOrigin: `${cx}px ${cy}px` }}
          />
        )
      })}
    </svg>
  )
}

export default function ExpenseChart() {
  const [period, setPeriod] = useState('month')

  const recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || []
  const categories = JSON.parse(localStorage.getItem('categories'))        || []

  const factors = FREQ_FACTOR[period]
  const catById = Object.fromEntries(categories.map(c => [c.id, c]))

  function proj(r) {
    return r.amount * (factors[r.frequency] ?? 1)
  }

  if (recurrings.length === 0) {
    return (
      <div className="module">
        <h2>Ausgaben &amp; Einnahmen – Grafik</h2>
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Daueraufträge angelegt.
        </p>
      </div>
    )
  }

  const totalExpense = recurrings
    .filter(r => !recIsIncome(r, catById))
    .reduce((s, r) => s + proj(r), 0)

  const totalIncome = recurrings
    .filter(r => recIsIncome(r, catById))
    .reduce((s, r) => s + proj(r), 0)

  const totalBalance = totalIncome - totalExpense

  // ── Root categories ──
  const rootCats = categories.filter(c => !c.parent || c.parent === '' || c.parent == null)

  // For each root category, get all descendant IDs (including itself)
  function getDescendants(catId) {
    const children = categories.filter(c => c.parent == catId)
    return [catId, ...children.flatMap(c => getDescendants(c.id))]
  }

  // Summarise expense + income for a root category subtree
  function catTotals(catId) {
    const ids = new Set(getDescendants(catId))
    let expense = 0
    let income = 0
    recurrings.forEach(r => {
      if (!ids.has(r.categoryId)) return
      if (recIsIncome(r, catById)) income += proj(r)
      else expense += proj(r)
    })
    return { expense, income }
  }

  // Uncategorised items
  const uncatExpense = recurrings
    .filter(r => !r.categoryId && !recIsIncome(r, catById))
    .reduce((s, r) => s + proj(r), 0)
  const uncatIncome = recurrings
    .filter(r => !r.categoryId && recIsIncome(r, catById))
    .reduce((s, r) => s + proj(r), 0)

  // Build root category data
  const rootData = rootCats
    .map(c => ({ ...c, ...catTotals(c.id) }))
    .filter(c => c.expense > 0 || c.income > 0)

  if (uncatExpense > 0 || uncatIncome > 0) {
    rootData.push({ id: '__uncat__', name: 'Ohne Kategorie', expense: uncatExpense, income: uncatIncome })
  }

  rootData.sort((a, b) => Math.abs(b.expense - b.income) - Math.abs(a.expense - a.income))

  // ── Donut: top 8 expense categories, rest = "Sonstige" ──
  // Only expense categories for the donut (categories that have expense > 0)
  const expenseCats = rootData
    .filter(c => c.expense > 0)
    .sort((a, b) => b.expense - a.expense)

  const MAX_SEGS = 8
  let donutSegments = []

  if (expenseCats.length > 0) {
    const top = expenseCats.slice(0, MAX_SEGS)
    const rest = expenseCats.slice(MAX_SEGS)
    const restTotal = rest.reduce((s, c) => s + c.expense, 0)
    const donutItems = [...top]
    if (restTotal > 0) donutItems.push({ id: '__other__', name: 'Sonstige', expense: restTotal })

    const donutTotal = donutItems.reduce((s, c) => s + c.expense, 0)
    donutSegments = donutItems.map((c, i) => ({
      ...c,
      color: PALETTE[i % PALETTE.length],
      pct: donutTotal > 0 ? (c.expense / donutTotal) * 100 : 0,
    }))
  }

  const donutTotal = donutSegments.reduce((s, seg) => s + seg.expense, 0)

  // ── Horizontal bar chart: max bar width reference ──
  const maxBarValue = rootData.reduce((m, c) => Math.max(m, c.expense, c.income), 1)

  return (
    <div className="module">
      <h2>Ausgaben &amp; Einnahmen – Grafik</h2>

      {/* Period tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[['month', 'Monat'], ['quarter', 'Quartal'], ['year', 'Jahr']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setPeriod(val)}
            style={{
              background: period === val ? 'var(--color-primary)' : 'transparent',
              border: '1px solid var(--color-primary)',
              color: period === val ? '#fff' : 'var(--color-primary)',
              borderRadius: 8,
              padding: '0.4rem 0.9rem',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: 110,
          background: '#dc2626', color: '#fff',
          borderRadius: 8, padding: '0.5rem 0.75rem',
        }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Ausgaben {PERIOD_SHORT[period]}</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt(totalExpense)}</div>
        </div>

        {totalIncome > 0 && (
          <div style={{
            flex: 1, minWidth: 110,
            background: '#16a34a', color: '#fff',
            borderRadius: 8, padding: '0.5rem 0.75rem',
          }}>
            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Einnahmen {PERIOD_SHORT[period]}</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>+{fmt(totalIncome)}</div>
          </div>
        )}

        <div style={{
          flex: 1, minWidth: 110,
          background: totalBalance >= 0 ? 'var(--color-primary)' : '#9f1239',
          color: '#fff',
          borderRadius: 8, padding: '0.5rem 0.75rem',
        }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Saldo {PERIOD_SHORT[period]}</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            {totalBalance >= 0 ? '+' : ''}{fmt(totalBalance)}
          </div>
        </div>
      </div>

      {/* Donut + legend */}
      {donutSegments.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Ausgaben nach Kategorie
          </div>
          <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <DonutChart segments={donutSegments} size={200} strokeWidth={38} />
            {/* Legend */}
            <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: '0.45rem', justifyContent: 'center' }}>
              {donutSegments.map(seg => (
                <div key={seg.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: seg.color, flexShrink: 0, display: 'inline-block',
                  }} />
                  <span style={{ fontSize: '0.78rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {seg.name}
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, flexShrink: 0 }}>
                    {fmt(seg.expense)}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0, minWidth: '2.5rem', textAlign: 'right' }}>
                    {donutTotal > 0
                      ? (seg.expense / donutTotal * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                      : '0'} %
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Horizontal bar chart per root category */}
      {rootData.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Kategorien im Vergleich
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {rootData.map(c => {
              const net = c.income - c.expense
              const netColor = net >= 0 ? '#16a34a' : '#dc2626'
              const expPct = maxBarValue > 0 ? (c.expense / maxBarValue) * 100 : 0
              const incPct = maxBarValue > 0 ? (c.income / maxBarValue) * 100 : 0
              return (
                <div key={c.id}>
                  {/* Label row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.83rem', fontWeight: 500 }}>{c.name}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: netColor }}>
                      {net >= 0 ? '+' : ''}{fmt(net)}
                    </span>
                  </div>
                  {/* Bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {c.expense > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ width: '3rem', fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>
                          Ausg.
                        </div>
                        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: 9999, height: 10, overflow: 'hidden' }}>
                          <div style={{
                            width: `${expPct}%`,
                            height: '100%',
                            background: '#ef4444',
                            borderRadius: 9999,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <div style={{ width: '5rem', fontSize: '0.68rem', color: '#ef4444', fontWeight: 600, flexShrink: 0 }}>
                          {fmt(c.expense)}
                        </div>
                      </div>
                    )}
                    {c.income > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ width: '3rem', fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'right', flexShrink: 0 }}>
                          Einnh.
                        </div>
                        <div style={{ flex: 1, background: 'var(--color-border)', borderRadius: 9999, height: 10, overflow: 'hidden' }}>
                          <div style={{
                            width: `${incPct}%`,
                            height: '100%',
                            background: '#22c55e',
                            borderRadius: 9999,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <div style={{ width: '5rem', fontSize: '0.68rem', color: '#22c55e', fontWeight: 600, flexShrink: 0 }}>
                          {fmt(c.income)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
