import { useState } from 'react'
import { fmt } from '../fmt'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

const FREQ_LABELS = {
  monthly:    'Monatlich',
  quarterly:  'Vierteljährlich',
  halfyearly: 'Halbjährlich',
  yearly:     'Jährlich',
}
const FREQ_ORDER = ['monthly', 'quarterly', 'halfyearly', 'yearly']

export default function RecurringPayments() {
  const [recurrings, setRecurrings] = useLocalStorage('recurringPayments', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [description, setDescription] = useState('')
  const [amount,      setAmount]       = useState('')
  const [frequency,   setFrequency]    = useState('monthly')
  const [categoryId,  setCategoryId]   = useState('')
  const [showForm,    setShowForm]     = useState(false)
  const [groupBy,     setGroupBy]      = useState('frequency') // 'frequency' | 'category' | 'none'
  const [expandedGroups, setExpandedGroups] = useState(new Set(FREQ_ORDER))

  function addRecurring(e) {
    e.preventDefault()
    setRecurrings([...recurrings, {
      id:         Date.now(),
      description,
      amount:     parseFloat(amount),
      frequency,
      categoryId: categoryId ? parseInt(categoryId) : null,
    }])
    setDescription('')
    setAmount('')
    setFrequency('monthly')
    setCategoryId('')
    setShowForm(false)
  }

  function removeRecurring(id) {
    setRecurrings(recurrings.filter(r => r.id !== id))
  }

  function getCategoryName(catId) {
    if (!catId) return '–'
    return categories.find(c => c.id === catId)?.name || '–'
  }

  function toggleGroup(key) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function getGroups() {
    if (groupBy === 'frequency') {
      const map = {}
      FREQ_ORDER.forEach(f => { map[f] = [] })
      recurrings.forEach(r => {
        if (!map[r.frequency]) map[r.frequency] = []
        map[r.frequency].push(r)
      })
      return FREQ_ORDER
        .filter(f => map[f].length > 0)
        .map(f => ({ key: f, label: FREQ_LABELS[f], items: map[f] }))
    }
    if (groupBy === 'category') {
      const map = {}
      recurrings.forEach(r => {
        const key = r.categoryId ? String(r.categoryId) : '__none__'
        if (!map[key]) map[key] = []
        map[key].push(r)
      })
      return Object.entries(map).map(([key, items]) => ({
        key,
        label: key === '__none__' ? 'Ohne Kategorie' : getCategoryName(parseInt(key)),
        items,
      }))
    }
    return [{ key: 'all', label: null, items: recurrings }]
  }

  const groups = getGroups()

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Daueraufträge</h2>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
        >
          {showForm ? 'Abbrechen' : '+ Neu'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addRecurring} style={{ marginBottom: '1.5rem', background: 'var(--color-bg)', padding: '1rem', borderRadius: 8, gap: '0.6rem' }}>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Beschreibung"
            required
          />
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="Betrag (€)"
            step="0.01"
            min="0.01"
            required
          />
          <select value={frequency} onChange={e => setFrequency(e.target.value)}>
            <option value="monthly">Monatlich</option>
            <option value="quarterly">Vierteljährlich</option>
            <option value="halfyearly">Halbjährlich</option>
            <option value="yearly">Jährlich</option>
          </select>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">– Kategorie wählen –</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="submit">Hinzufügen</button>
        </form>
      )}

      {/* Grouping controls */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Gruppieren:</span>
        {[['frequency', 'Frequenz'], ['category', 'Kategorie'], ['none', 'Keine']].map(([v, l]) => (
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

      {/* List */}
      {recurrings.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0', margin: 0 }}>
          Noch keine Daueraufträge angelegt.
        </p>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {groups.map((group, gi) => {
            const groupTotal = group.items.reduce((s, r) => s + r.amount, 0)
            const isOpen = !group.label || expandedGroups.has(group.key)
            return (
              <div key={group.key}>
                {group.label && (
                  <div
                    onClick={() => toggleGroup(group.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.38rem 0.75rem',
                      background: 'var(--color-bg)',
                      borderBottom: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', width: '0.9rem' }}>
                      {isOpen ? '▼' : '▶'}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmt(groupTotal)}</span>
                  </div>
                )}
                {isOpen && group.items.map((r, ri) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.32rem 0.75rem',
                      paddingLeft: group.label ? '1.75rem' : '0.75rem',
                      borderBottom: ri < group.items.length - 1 || gi < groups.length - 1
                        ? '1px solid var(--color-border)' : 'none',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                        {getCategoryName(r.categoryId)}
                        {groupBy !== 'frequency' && (
                          <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>{FREQ_LABELS[r.frequency]}</span>
                        )}
                      </div>
                    </div>
                    <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(r.amount)}</span>
                    <button
                      onClick={() => removeRecurring(r.id)}
                      style={{
                        background: 'none', border: 'none', color: '#dc2626',
                        padding: '0.15rem 0.3rem', fontSize: '0.8rem',
                        cursor: 'pointer', flexShrink: 0, lineHeight: 1,
                      }}
                      title="Löschen"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
