import { useState } from 'react'
import { fmt } from '../fmt'

// How much of one recurring payment counts toward each view period
const FREQ_FACTOR = {
  month:   { monthly: 1,  quarterly: 1/3, halfyearly: 1/6,  yearly: 1/12 },
  quarter: { monthly: 3,  quarterly: 1,   halfyearly: 1/2,  yearly: 1/4  },
  year:    { monthly: 12, quarterly: 4,   halfyearly: 2,    yearly: 1    },
}

const FREQ_SHORT = {
  monthly:    'mtl.',
  quarterly:  'quartl.',
  halfyearly: 'halbj.',
  yearly:     'jährl.',
}

const FREQ_FULL = {
  monthly:    'Monatlich',
  quarterly:  'Vierteljährlich',
  halfyearly: 'Halbjährlich',
  yearly:     'Jährlich',
}

const FREQ_ORDER = ['monthly', 'quarterly', 'halfyearly', 'yearly']

function RecurringRow({ r, projected, indent, showFreq, showCat, catById, last, isIncome }) {
  const color = isIncome ? '#16a34a' : 'var(--color-text)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.28rem 0.75rem',
      paddingLeft: `${0.75 + indent * 1.2}rem`,
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      fontSize: '0.8rem',
    }}>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color }}>
        {r.description}
      </span>
      {showCat && r.categoryId && (
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {catById[r.categoryId]?.name}
        </span>
      )}
      {showFreq && (
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {FREQ_SHORT[r.frequency]}
        </span>
      )}
      <span style={{ fontWeight: 500, flexShrink: 0, color }}>{isIncome ? '+' : ''}{fmt(projected)}</span>
    </div>
  )
}

export default function ExpenseTree() {
  const [period,  setPeriod]  = useState('month')
  const [groupBy, setGroupBy] = useState('category')
  const [expandedCats,  setExpandedCats]  = useState(new Set())
  const [expandedFreqs, setExpandedFreqs] = useState(new Set(FREQ_ORDER))

  const recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || []
  const categories = JSON.parse(localStorage.getItem('categories'))        || []

  const factors = FREQ_FACTOR[period]
  const catById = Object.fromEntries(categories.map(c => [c.id, c]))

  function proj(rec) {
    return rec.amount * (factors[rec.frequency] ?? 1)
  }

  function isIncome(rec) {
    return catById[rec.categoryId]?.type === 'Einnahme'
  }

  const totalExpense = recurrings.filter(r => !isIncome(r)).reduce((s, r) => s + proj(r), 0)
  const totalIncome  = recurrings.filter(r =>  isIncome(r)).reduce((s, r) => s + proj(r), 0)
  const totalBalance = totalIncome - totalExpense

  /* ── category tree ── */
  function subtreeTotal(catId) {
    const direct   = recurrings.filter(r => r.categoryId === catId).reduce((s, r) => s + proj(r), 0)
    const children = categories.filter(c => c.parent == catId).reduce((s, c) => s + subtreeTotal(c.id), 0)
    return direct + children
  }

  function toggleCat(id) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleFreq(key) {
    setExpandedFreqs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function renderCategoryTree(parentId = null, level = 0) {
    const nodes = categories
      .filter(c => c.parent == parentId)
      .map(c => ({ ...c, total: subtreeTotal(c.id) }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)

    return nodes.map((c, ni) => {
      const hasChildren = categories.some(ch => ch.parent == c.id && subtreeTotal(ch.id) > 0)
      // Only root level can be toggled; sub-levels always open
      const isOpen  = level > 0 || expandedCats.has(c.id)
      const isLast  = ni === nodes.length - 1 && level === 0
      const income  = c.type === 'Einnahme'
      const amtColor = income ? '#16a34a' : 'inherit'

      return (
        <div key={c.id}>
          <div
            onClick={() => level === 0 && hasChildren && toggleCat(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.42rem 0.75rem',
              paddingLeft: `${0.75 + level * 1.2}rem`,
              borderBottom: (!isOpen && isLast) ? 'none' : '1px solid var(--color-border)',
              background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
              cursor: level === 0 && hasChildren ? 'pointer' : 'default',
              userSelect: 'none',
            }}
          >
            <span style={{ width: '0.9rem', fontSize: '0.68rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
              {level === 0 && hasChildren ? (isOpen ? '▼' : '▶') : ''}
            </span>
            <span style={{
              flex: 1,
              fontSize: level === 0 ? '0.9rem' : '0.83rem',
              fontWeight: level === 0 ? 600 : 400,
              color: income ? '#16a34a' : 'inherit',
            }}>
              {c.name}
            </span>
            <span style={{ fontWeight: level === 0 ? 700 : 400, fontSize: '0.87rem', flexShrink: 0, color: amtColor }}>
              {income ? '+' : ''}{fmt(c.total)}
            </span>
          </div>
          {isOpen && renderCategoryTree(c.id, level + 1)}
        </div>
      )
    })
  }

  const uncategorised      = recurrings.filter(r => !r.categoryId)
  const uncategorisedTotal = uncategorised.reduce((s, r) => s + proj(r), 0)

  const PERIOD_LABEL = { month: 'pro Monat', quarter: 'pro Quartal', year: 'pro Jahr' }

  return (
    <div className="module">
      <h2>Daueraufträge – Ausgabenübersicht</h2>

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
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 110, background: '#dc2626', color: '#fff', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Ausgaben {PERIOD_LABEL[period]}</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt(totalExpense)}</div>
        </div>
        {totalIncome > 0 && (
          <div style={{ flex: 1, minWidth: 110, background: '#16a34a', color: '#fff', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Einnahmen {PERIOD_LABEL[period]}</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>+{fmt(totalIncome)}</div>
          </div>
        )}
        <div style={{
          flex: 1, minWidth: 110,
          background: totalBalance >= 0 ? 'var(--color-primary)' : '#9f1239',
          color: '#fff', borderRadius: 8, padding: '0.5rem 0.75rem',
        }}>
          <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>Saldo {PERIOD_LABEL[period]}</div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{totalBalance >= 0 ? '+' : ''}{fmt(totalBalance)}</div>
        </div>
      </div>

      {/* Grouping toggle */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Gruppieren:</span>
        {[['category', 'Kategorie'], ['frequency', 'Frequenz']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setGroupBy(v)}
            style={{
              background: groupBy === v ? 'var(--color-primary)' : 'transparent',
              border: '1px solid var(--color-primary)',
              color: groupBy === v ? '#fff' : 'var(--color-primary)',
              borderRadius: 6,
              padding: '0.22rem 0.6rem',
              fontSize: '0.78rem',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {recurrings.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Daueraufträge angelegt.
        </p>
      ) : groupBy === 'category' ? (
        /* ── by category tree ── */
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {renderCategoryTree()}
          {uncategorisedTotal > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.4rem 0.75rem', paddingLeft: '1.65rem',
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)', fontSize: '0.85rem',
            }}>
              <span>Ohne Kategorie</span>
              <span>{fmt(uncategorisedTotal)}</span>
            </div>
          )}
        </div>
      ) : (
        /* ── by frequency ── */
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {FREQ_ORDER.map((freq, fi) => {
            const items = recurrings.filter(r => r.frequency === freq)
            if (items.length === 0) return null
            const freqTotal = items.reduce((s, r) => s + proj(r), 0)
            const isOpen    = expandedFreqs.has(freq)
            const isLast    = FREQ_ORDER.slice(fi + 1).every(f => recurrings.filter(r => r.frequency === f).length === 0)
            return (
              <div key={freq}>
                <div
                  onClick={() => toggleFreq(freq)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.42rem 0.75rem',
                    background: 'var(--color-bg)',
                    borderBottom: (!isOpen && isLast) ? 'none' : '1px solid var(--color-border)',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <span style={{ width: '0.9rem', fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                    {isOpen ? '▼' : '▶'}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>{FREQ_FULL[freq]}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.87rem' }}>{fmt(freqTotal)}</span>
                </div>
                {isOpen && items.map((r, ri) => (
                  <RecurringRow
                    key={r.id} r={r} projected={proj(r)}
                    indent={1} showCat catById={catById}
                    isIncome={isIncome(r)}
                    last={ri === items.length - 1 && isLast}
                  />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
