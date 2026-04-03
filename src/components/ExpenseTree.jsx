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
  const [expandedExp, setExpandedExp] = useState(new Set())
  const [expandedInc, setExpandedInc] = useState(new Set())
  const [showIncome, setShowIncome]   = useState(true)

  const transactions = JSON.parse(localStorage.getItem('transactions')) || []
  const categories   = JSON.parse(localStorage.getItem('categories'))   || []

  const { from, to } = getRange(period, customFrom, customTo)

  const inRange = t => (!from || t.date >= from) && (!to || t.date <= to)

  const filteredExp = transactions.filter(t => t.amount < 0 && inRange(t))
  const filteredInc = transactions.filter(t => t.amount > 0 && inRange(t))

  // Map category name → category object
  const catByName = {}
  categories.forEach(c => { catByName[c.name] = c })

  // Build totals per category
  function buildTotals(txList) {
    const directTotals = {}
    let uncategorisedTotal = 0
    txList.forEach(t => {
      const cat = catByName[t.category]
      if (cat) {
        directTotals[cat.id] = (directTotals[cat.id] || 0) + Math.abs(t.amount)
      } else {
        uncategorisedTotal += Math.abs(t.amount)
      }
    })
    return { directTotals, uncategorisedTotal }
  }

  const { directTotals: expTotals, uncategorisedTotal: expUncategorised } = buildTotals(filteredExp)
  const { directTotals: incTotals, uncategorisedTotal: incUncategorised } = buildTotals(filteredInc)

  function subtreeTotal(catId, directTotals) {
    const direct = directTotals[catId] || 0
    return direct + categories
      .filter(c => c.parent == catId)
      .reduce((s, c) => s + subtreeTotal(c.id, directTotals), 0)
  }

  function toggle(id, setExpanded) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderTree(parentId = null, level = 0, directTotals, expanded, setExpanded) {
    return categories
      .filter(c => c.parent == parentId)
      .map(c => ({ ...c, total: subtreeTotal(c.id, directTotals) }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .map(c => {
        const hasChildren = categories.some(ch => ch.parent == c.id && subtreeTotal(ch.id, directTotals) > 0)
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
                onClick={() => hasChildren && toggle(c.id, setExpanded)}
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
            {isOpen && renderTree(c.id, level + 1, directTotals, expanded, setExpanded)}
          </div>
        )
      })
  }

  const grandTotalExp = filteredExp.reduce((s, t) => s + Math.abs(t.amount), 0)
  const grandTotalInc = filteredInc.reduce((s, t) => s + Math.abs(t.amount), 0)
  const balance = grandTotalInc - grandTotalExp

  const PERIODS = [
    ['month',  'Aktueller Monat'],
    ['year',   'Aktuelles Jahr'],
    ['custom', 'Benutzerdefiniert'],
  ]

  return (
    <div className="module">
      <h2>Ausgaben &amp; Einnahmen nach Kategorie</h2>

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

      {/* Summary bar: Einnahmen / Ausgaben / Saldo */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{
          flex: 1, minWidth: 120,
          background: '#16a34a', color: '#fff',
          borderRadius: 8, padding: '0.5rem 0.75rem',
        }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Einnahmen</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(grandTotalInc)}</div>
        </div>
        <div style={{
          flex: 1, minWidth: 120,
          background: '#dc2626', color: '#fff',
          borderRadius: 8, padding: '0.5rem 0.75rem',
        }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Ausgaben</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(grandTotalExp)}</div>
        </div>
        <div style={{
          flex: 1, minWidth: 120,
          background: balance >= 0 ? 'var(--color-primary)' : '#9f1239',
          color: '#fff',
          borderRadius: 8, padding: '0.5rem 0.75rem',
        }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Saldo</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{fmt(balance)}</div>
        </div>
      </div>

      {/* Income section */}
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          onClick={() => setShowIncome(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
            background: '#16a34a', color: '#fff',
            borderRadius: showIncome ? '8px 8px 0 0' : 8,
            padding: '0.6rem 0.75rem', border: 'none', cursor: 'pointer',
            marginBottom: 0,
          }}
        >
          <span style={{ fontSize: '0.75rem' }}>{showIncome ? '▼' : '▶'}</span>
          <span style={{ fontWeight: 600, flex: 1, textAlign: 'left' }}>Einnahmen nach Kategorie</span>
          <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmt(grandTotalInc)}</span>
        </button>
        {showIncome && (
          grandTotalInc === 0 ? (
            <div style={{
              border: '1px solid var(--color-border)', borderTop: 'none',
              borderRadius: '0 0 8px 8px',
              padding: '1.5rem', textAlign: 'center',
              color: 'var(--color-text-muted)', fontSize: '0.875rem',
            }}>
              Keine Einnahmen im gewählten Zeitraum
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {renderTree(null, 0, incTotals, expandedInc, setExpandedInc)}
              {incUncategorised > 0 && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '0.45rem 0.75rem', paddingLeft: '2rem',
                  borderTop: '1px solid var(--color-border)',
                  color: 'var(--color-text-muted)', fontSize: '0.875rem',
                }}>
                  <span>Ohne Kategorie</span>
                  <span>{fmt(incUncategorised)}</span>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Expense section */}
      <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.4rem', color: '#dc2626' }}>
        Ausgaben nach Kategorie
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        background: '#dc2626', color: '#fff',
        borderRadius: grandTotalExp === 0 ? 8 : '8px 8px 0 0',
        padding: '0.6rem 0.75rem',
      }}>
        <span style={{ fontWeight: 600 }}>Gesamt Ausgaben</span>
        <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmt(grandTotalExp)}</span>
      </div>

      {grandTotalExp === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0' }}>
          Keine Ausgaben im gewählten Zeitraum
        </p>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {renderTree(null, 0, expTotals, expandedExp, setExpandedExp)}
          {expUncategorised > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.45rem 0.75rem', paddingLeft: '2rem',
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)', fontSize: '0.875rem',
            }}>
              <span>Ohne Kategorie</span>
              <span>{fmt(expUncategorised)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
