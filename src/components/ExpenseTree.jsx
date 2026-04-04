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

// Income check: r.type takes precedence, then category type, default = expense
function recIsIncome(r, catById) {
  const type = r.type || catById[r.categoryId]?.type
  return type === 'Einnahme'
}

function RecurringRow({ r, projected, indent, showCat, catById, last }) {
  const inc = recIsIncome(r, catById)
  const color = inc ? '#16a34a' : 'var(--color-text-muted)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.26rem 0.75rem',
      paddingLeft: `${0.75 + indent * 1.2}rem`,
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      fontSize: '0.78rem',
    }}>
      <span style={{ flex: 1, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.description}
      </span>
      {showCat && r.categoryId && (
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
          {catById[r.categoryId]?.name}
        </span>
      )}
      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', flexShrink: 0, marginRight: '0.25rem' }}>
        {FREQ_SHORT[r.frequency]}
      </span>
      <span style={{ fontWeight: 500, flexShrink: 0, color: inc ? '#16a34a' : 'inherit' }}>
        {inc ? '+' : ''}{fmt(projected)}
      </span>
    </div>
  )
}

export default function ExpenseTree() {
  const [period,        setPeriod]        = useState('month')
  const [groupBy,       setGroupBy]       = useState('category')
  const [expandedCats,  setExpandedCats]  = useState(new Set())
  const [expandedFreqs, setExpandedFreqs] = useState(new Set(FREQ_ORDER))

  const recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || []
  const categories = JSON.parse(localStorage.getItem('categories'))        || []

  const factors = FREQ_FACTOR[period]
  const catById = Object.fromEntries(categories.map(c => [c.id, c]))

  function proj(rec) {
    return rec.amount * (factors[rec.frequency] ?? 1)
  }

  // Signed projected: +proj for income, -proj for expense
  function projSigned(rec) {
    return recIsIncome(rec, catById) ? proj(rec) : -proj(rec)
  }

  // Net value for a subtree (income positive, expense negative)
  function subtreeNet(catId) {
    const direct   = recurrings.filter(r => r.categoryId === catId).reduce((s, r) => s + projSigned(r), 0)
    const children = categories.filter(c => c.parent == catId).reduce((s, c) => s + subtreeNet(c.id), 0)
    return direct + children
  }

  // Absolute total for filtering (to detect non-empty subtrees)
  function subtreeAbs(catId) {
    const direct   = recurrings.filter(r => r.categoryId === catId).reduce((s, r) => s + proj(r), 0)
    const children = categories.filter(c => c.parent == catId).reduce((s, c) => s + subtreeAbs(c.id), 0)
    return direct + children
  }

  const totalIncome  = recurrings.filter(r =>  recIsIncome(r, catById)).reduce((s, r) => s + proj(r), 0)
  const totalExpense = recurrings.filter(r => !recIsIncome(r, catById)).reduce((s, r) => s + proj(r), 0)
  const totalBalance = totalIncome - totalExpense

  function toggleCat(id) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleFreq(key) {
    setExpandedFreqs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function renderCategoryTree(parentId = null, level = 0) {
    const nodes = categories
      .filter(c => c.parent == parentId)
      .map(c => ({ ...c, net: subtreeNet(c.id), abs: subtreeAbs(c.id) }))
      .filter(c => c.abs > 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))

    return nodes.map((c, ni) => {
      const directItems = recurrings.filter(r => r.categoryId === c.id)
      const hasChildren = categories.some(ch => ch.parent == c.id && subtreeAbs(ch.id) > 0)
      const hasContent  = directItems.length > 0 || hasChildren
      const isOpen      = expandedCats.has(c.id)           // ALL levels individually toggleable
      const isLast      = ni === nodes.length - 1
      const netPositive = c.net >= 0
      const amtColor    = netPositive ? '#16a34a' : '#dc2626'

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
              <button onClick={e => { e.stopPropagation(); toggleCat(c.id) }} style={{
                background: 'none', border: 'none', padding: '0.1rem 0.3rem',
                color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, fontSize: '0.85rem', lineHeight: 1,
              }}>{isOpen ? '▾' : '▸'}</button>
            ) : (
              <span style={{ width: '1.4rem', flexShrink: 0 }} />
            )}
            <span style={{
              flex: 1,
              fontSize: level === 0 ? '0.9rem' : '0.83rem',
              fontWeight: level === 0 ? 600 : 400,
            }}>
              {c.name}
            </span>
            <span style={{ fontWeight: level === 0 ? 700 : 400, fontSize: '0.87rem', flexShrink: 0, color: amtColor }}>
              {c.net > 0 ? '+' : ''}{fmt(c.net)}
            </span>
          </div>
          {isOpen && (
            <>
              {directItems.map((r, ri) => (
                <RecurringRow
                  key={r.id} r={r} projected={proj(r)}
                  indent={level + 1} catById={catById}
                  last={ri === directItems.length - 1 && !hasChildren && isLast && level === 0}
                />
              ))}
              {renderCategoryTree(c.id, level + 1)}
            </>
          )}
        </div>
      )
    })
  }

  const uncategorised    = recurrings.filter(r => !r.categoryId)
  const uncatNet         = uncategorised.reduce((s, r) => s + projSigned(r), 0)

  const PERIOD_LABEL = { month: 'pro Monat', quarter: 'pro Quartal', year: 'pro Jahr' }

  return (
    <div className="module">
      <h2>Daueraufträge – Ausgabenübersicht</h2>

      {/* Period tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[['month', 'Monat'], ['quarter', 'Quartal'], ['year', 'Jahr']].map(([val, label]) => (
          <button key={val} onClick={() => setPeriod(val)} style={{
            background: period === val ? 'var(--color-primary)' : 'transparent',
            border: '1px solid var(--color-primary)',
            color: period === val ? '#fff' : 'var(--color-primary)',
            borderRadius: 8, padding: '0.4rem 0.9rem', fontSize: '0.85rem',
          }}>{label}</button>
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
          <button key={v} onClick={() => setGroupBy(v)} style={{
            background: groupBy === v ? 'var(--color-primary)' : 'transparent',
            border: '1px solid var(--color-primary)',
            color: groupBy === v ? '#fff' : 'var(--color-primary)',
            borderRadius: 6, padding: '0.22rem 0.6rem', fontSize: '0.78rem',
          }}>{l}</button>
        ))}
      </div>

      {recurrings.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Daueraufträge angelegt.
        </p>
      ) : groupBy === 'category' ? (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {renderCategoryTree()}
          {uncategorised.length > 0 && (
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '0.4rem 0.75rem', paddingLeft: '1.65rem',
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)', fontSize: '0.85rem',
            }}>
              <span>Ohne Kategorie</span>
              <span style={{ color: uncatNet >= 0 ? '#16a34a' : '#dc2626' }}>
                {uncatNet > 0 ? '+' : ''}{fmt(uncatNet)}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {FREQ_ORDER.map((freq, fi) => {
            const items  = recurrings.filter(r => r.frequency === freq)
            if (items.length === 0) return null
            const net    = items.reduce((s, r) => s + projSigned(r), 0)
            const isOpen = expandedFreqs.has(freq)
            const isLast = FREQ_ORDER.slice(fi + 1).every(f => recurrings.filter(r => r.frequency === f).length === 0)
            return (
              <div key={freq}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.42rem 0.75rem', background: 'var(--color-bg)',
                  borderBottom: (!isOpen && isLast) ? 'none' : '1px solid var(--color-border)',
                }}>
                  <button onClick={e => { e.stopPropagation(); toggleFreq(freq) }} style={{
                    background: 'none', border: 'none', padding: '0.1rem 0.3rem',
                    color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, fontSize: '0.85rem', lineHeight: 1,
                  }}>{isOpen ? '▾' : '▸'}</button>
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>{FREQ_FULL[freq]}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.87rem', color: net >= 0 ? '#16a34a' : '#dc2626' }}>
                    {net > 0 ? '+' : ''}{fmt(net)}
                  </span>
                </div>
                {isOpen && items.map((r, ri) => (
                  <RecurringRow
                    key={r.id} r={r} projected={proj(r)}
                    indent={1} showCat catById={catById}
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
