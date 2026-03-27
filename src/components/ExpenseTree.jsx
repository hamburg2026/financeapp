import { useState } from 'react'
import { fmt } from '../fmt'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function firstOfYear() {
  return new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)
}

function getRange(period, customFrom, customTo) {
  if (period === 'month') return { from: firstOfMonth(), to: today() }
  if (period === 'year')  return { from: firstOfYear(),  to: today() }
  return { from: customFrom, to: customTo }
}

export default function ExpenseTree() {
  const [period, setPeriod] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [expanded, setExpanded]     = useState(new Set())

  const transactions = JSON.parse(localStorage.getItem('transactions')) || []
  const categories   = JSON.parse(localStorage.getItem('categories'))   || []

  const { from, to } = getRange(period, customFrom, customTo)

  // Only negative amounts = expenses; filter by date range
  const filtered = transactions.filter(t =>
    t.amount < 0 &&
    (!from || t.date >= from) &&
    (!to   || t.date <= to)
  )

  // Map category name → category object
  const catByName = {}
  categories.forEach(c => { catByName[c.name] = c })

  // Direct totals per category id (absolute values)
  const directTotals = {}
  let uncategorisedTotal = 0
  filtered.forEach(t => {
    const cat = catByName[t.category]
    if (cat) {
      directTotals[cat.id] = (directTotals[cat.id] || 0) + Math.abs(t.amount)
    } else {
      uncategorisedTotal += Math.abs(t.amount)
    }
  })

  // Recursive total including all descendants
  function subtreeTotal(catId) {
    const direct = directTotals[catId] || 0
    return direct + categories
      .filter(c => c.parent == catId)
      .reduce((s, c) => s + subtreeTotal(c.id), 0)
  }

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderTree(parentId = null, level = 0) {
    return categories
      .filter(c => c.parent == parentId)
      .map(c => ({ ...c, total: subtreeTotal(c.id) }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .map(c => {
        const hasChildren = categories.some(ch => ch.parent == c.id && subtreeTotal(ch.id) > 0)
        const isOpen = expanded.has(c.id)
        return (
          <div key={c.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.75rem',
                paddingLeft: `${0.75 + level * 1.5}rem`,
                borderBottom: '1px solid var(--color-border)',
                background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
              }}
            >
              <button
                onClick={() => hasChildren && toggle(c.id)}
                style={{
                  background: 'none', border: 'none', padding: 0, margin: 0,
                  width: '1.25rem', color: 'var(--color-text-muted)',
                  cursor: hasChildren ? 'pointer' : 'default',
                  fontSize: '0.75rem', flexShrink: 0, lineHeight: 1,
                }}
                aria-label={isOpen ? 'Zuklappen' : 'Aufklappen'}
              >
                {hasChildren ? (isOpen ? '▼' : '▶') : ''}
              </button>
              <span style={{
                flex: 1,
                fontSize: level === 0 ? '0.95rem' : '0.875rem',
                fontWeight: level === 0 ? 600 : 400,
              }}>
                {c.name}
              </span>
              <span style={{ fontWeight: level === 0 ? 700 : 400, fontSize: '0.9rem' }}>
                {fmt(c.total)}
              </span>
            </div>
            {isOpen && renderTree(c.id, level + 1)}
          </div>
        )
      })
  }

  const grandTotal = filtered.reduce((s, t) => s + Math.abs(t.amount), 0)

  const PERIODS = [
    ['month',  'Aktueller Monat'],
    ['year',   'Aktuelles Jahr'],
    ['custom', 'Benutzerdefiniert'],
  ]

  return (
    <div className="module">
      <h2>Ausgaben nach Kategorie</h2>

      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        {PERIODS.map(([val, label]) => (
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
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 'auto' }} />
          <span style={{ color: 'var(--color-text-muted)' }}>–</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
      )}

      {/* Date hint */}
      {from && to && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
          {from} – {to}
        </p>
      )}

      {/* Grand total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        background: 'var(--color-primary)', color: '#fff',
        borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.75rem',
      }}>
        <span style={{ fontWeight: 600 }}>Gesamt Ausgaben</span>
        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmt(grandTotal)}</span>
      </div>

      {/* Tree */}
      {grandTotal === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0' }}>
          Keine Ausgaben im gewählten Zeitraum
        </p>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {renderTree()}
          {uncategorisedTotal > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.45rem 0.75rem', paddingLeft: '2rem',
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)', fontSize: '0.875rem',
            }}>
              <span>Ohne Kategorie</span>
              <span>{fmt(uncategorisedTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
