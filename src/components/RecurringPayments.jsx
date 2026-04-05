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

// Flat options with full path label: "Nebenkosten → Strom"
function CategorySelect({ value, onChange, categories, style, placeholder = '– Kategorie wählen –' }) {
  function buildOptions(parentId = null, prefix = '') {
    return categories
      .filter(c => c.parent == parentId)
      .flatMap(c => {
        const label = prefix ? `${prefix} → ${c.name}` : c.name
        return [
          <option key={c.id} value={c.id}>{label}</option>,
          ...buildOptions(c.id, label),
        ]
      })
  }
  return (
    <select value={value} onChange={onChange} style={style}>
      <option value="">{placeholder}</option>
      {buildOptions()}
    </select>
  )
}

// Returns all descendant category IDs including catId itself
function getDescendants(catId, categories) {
  const children = categories.filter(c => c.parent == catId)
  return [catId, ...children.flatMap(c => getDescendants(c.id, categories))]
}

export default function RecurringPayments() {
  const [recurrings, setRecurrings] = useLocalStorage('recurringPayments', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  // Add form state
  const [showForm,    setShowForm]    = useState(false)
  const [description, setDescription] = useState('')
  const [amount,      setAmount]      = useState('')
  const [frequency,   setFrequency]   = useState('monthly')
  const [categoryId,  setCategoryId]  = useState('')
  const [type,        setType]        = useState('Ausgabe')

  // Edit state
  const [editId,          setEditId]          = useState(null)
  const [editDescription, setEditDescription] = useState('')
  const [editAmount,      setEditAmount]      = useState('')
  const [editFrequency,   setEditFrequency]   = useState('monthly')
  const [editCategoryId,  setEditCategoryId]  = useState('')
  const [editType,        setEditType]        = useState('Ausgabe')

  // Filter state
  const [filterType,       setFilterType]       = useState('all') // 'all' | 'Ausgabe' | 'Einnahme'
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [filterFrequency,  setFilterFrequency]  = useState('')
  const [filterSearch,     setFilterSearch]     = useState('')

  function handleCategoryChange(val) {
    setCategoryId(val)
    if (val) {
      const cat = categories.find(c => c.id === parseInt(val))
      if (cat?.type) setType(cat.type)
    }
  }

  function handleEditCategoryChange(val) {
    setEditCategoryId(val)
    if (val) {
      const cat = categories.find(c => c.id === parseInt(val))
      if (cat?.type) setEditType(cat.type)
    }
  }

  // Grouping
  const [groupBy,        setGroupBy]        = useState('frequency')
  const [expandedGroups, setExpandedGroups] = useState(new Set(FREQ_ORDER))

  function addRecurring(e) {
    e.preventDefault()
    setRecurrings([...recurrings, {
      id:         Date.now(),
      description,
      amount:     parseFloat(amount),
      frequency,
      categoryId: categoryId ? parseInt(categoryId) : null,
      type,
    }])
    setDescription(''); setAmount(''); setFrequency('monthly'); setCategoryId(''); setType('Ausgabe')
    setShowForm(false)
  }

  function startEdit(r) {
    setEditId(r.id)
    setEditDescription(r.description)
    setEditAmount(String(r.amount))
    setEditFrequency(r.frequency)
    setEditCategoryId(r.categoryId ? String(r.categoryId) : '')
    setEditType(r.type || 'Ausgabe')
  }

  function saveEdit() {
    setRecurrings(recurrings.map(r => r.id === editId ? {
      ...r,
      description: editDescription,
      amount:      parseFloat(editAmount),
      frequency:   editFrequency,
      categoryId:  editCategoryId ? parseInt(editCategoryId) : null,
      type:        editType,
    } : r))
    setEditId(null)
  }

  function removeRecurring(id) {
    setRecurrings(recurrings.filter(r => r.id !== id))
  }

  function getCategoryLabel(catId) {
    if (!catId) return '–'
    const cat = categories.find(c => c.id === catId)
    if (!cat) return '–'
    const parent = cat.parent ? categories.find(c => c.id === cat.parent) : null
    return parent ? `${parent.name} → ${cat.name}` : cat.name
  }

  function toggleGroup(key) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Apply filters
  const catById = Object.fromEntries(categories.map(c => [c.id, c]))
  function recIsIncome(r) {
    const t = r.type || catById[r.categoryId]?.type
    return t === 'Einnahme'
  }

  const filteredDescendants = filterCategoryId
    ? new Set(getDescendants(parseInt(filterCategoryId), categories).map(String))
    : null

  const filteredRecurrings = recurrings.filter(r => {
    if (filterType === 'Ausgabe' && recIsIncome(r)) return false
    if (filterType === 'Einnahme' && !recIsIncome(r)) return false
    if (filteredDescendants && !filteredDescendants.has(String(r.categoryId))) return false
    if (filterFrequency && r.frequency !== filterFrequency) return false
    if (filterSearch && !r.description.toLowerCase().includes(filterSearch.toLowerCase())) return false
    return true
  })

  const hasActiveFilter = filterType !== 'all' || filterCategoryId || filterFrequency || filterSearch

  function resetFilters() {
    setFilterType('all')
    setFilterCategoryId('')
    setFilterFrequency('')
    setFilterSearch('')
  }

  function getGroups() {
    if (groupBy === 'frequency') {
      const map = {}
      FREQ_ORDER.forEach(f => { map[f] = [] })
      filteredRecurrings.forEach(r => {
        if (!map[r.frequency]) map[r.frequency] = []
        map[r.frequency].push(r)
      })
      return FREQ_ORDER
        .filter(f => map[f].length > 0)
        .map(f => ({ key: f, label: FREQ_LABELS[f], items: map[f] }))
    }
    if (groupBy === 'category') {
      const map = {}
      filteredRecurrings.forEach(r => {
        const key = r.categoryId ? String(r.categoryId) : '__none__'
        if (!map[key]) map[key] = []
        map[key].push(r)
      })
      return Object.entries(map).map(([key, items]) => ({
        key,
        label: key === '__none__' ? 'Ohne Kategorie' : getCategoryLabel(parseInt(key)),
        items,
      }))
    }
    return [{ key: 'all', label: null, items: filteredRecurrings }]
  }

  const groups = getGroups()
  const btnSmall = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem' }
  const filterBtnStyle = (active) => ({
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
    borderRadius: 6, padding: '0.22rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer',
  })

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Daueraufträge</h2>
        <button onClick={() => { setShowForm(v => !v); setEditId(null) }} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          {showForm ? 'Abbrechen' : '+ Neu'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={addRecurring} style={{ marginBottom: '1.5rem', background: 'var(--color-bg)', padding: '1rem', borderRadius: 8, gap: '0.6rem' }}>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Beschreibung" required />
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Betrag (€)" step="0.01" min="0.01" required />
          <select value={frequency} onChange={e => setFrequency(e.target.value)}>
            <option value="monthly">Monatlich</option>
            <option value="quarterly">Vierteljährlich</option>
            <option value="halfyearly">Halbjährlich</option>
            <option value="yearly">Jährlich</option>
          </select>
          <CategorySelect value={categoryId} onChange={e => handleCategoryChange(e.target.value)} categories={categories} />
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="Ausgabe">Ausgabe</option>
            <option value="Einnahme">Einnahme</option>
          </select>
          <button type="submit">Hinzufügen</button>
        </form>
      )}

      {/* Filter controls */}
      <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Typ:</span>
          {[['all', 'Alle'], ['Ausgabe', 'Ausgaben'], ['Einnahme', 'Einnahmen']].map(([v, l]) => (
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
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Kategorie:</span>
          <CategorySelect
            value={filterCategoryId}
            onChange={e => setFilterCategoryId(e.target.value)}
            categories={categories}
            placeholder="– Alle Kategorien –"
            style={{ fontSize: '0.82rem', padding: '0.22rem 0.5rem', flex: 1, minWidth: 160 }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Suche:</span>
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Beschreibung suchen…"
            style={{ fontSize: '0.82rem', padding: '0.22rem 0.5rem', flex: 1, minWidth: 160 }}
          />
          {hasActiveFilter && (
            <button onClick={resetFilters} style={{ fontSize: '0.78rem', padding: '0.22rem 0.6rem', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151' }}>
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Grouping controls */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Gruppieren:</span>
        {[['frequency', 'Frequenz'], ['category', 'Kategorie'], ['none', 'Keine']].map(([v, l]) => (
          <button key={v} onClick={() => setGroupBy(v)} style={{
            background: groupBy === v ? 'var(--color-primary)' : 'transparent',
            border: '1px solid var(--color-primary)',
            color: groupBy === v ? '#fff' : 'var(--color-primary)',
            borderRadius: 6, padding: '0.22rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer',
          }}>{l}</button>
        ))}
        {hasActiveFilter && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>
            ({filteredRecurrings.length} von {recurrings.length} Einträgen)
          </span>
        )}
      </div>

      {/* List */}
      {filteredRecurrings.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0', margin: 0 }}>
          {recurrings.length === 0 ? 'Noch keine Daueraufträge angelegt.' : 'Keine Einträge entsprechen den Filterkriterien.'}
        </p>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {groups.map((group, gi) => {
            const groupTotal = group.items.reduce((s, r) => s + r.amount, 0)
            const isOpen = !group.label || expandedGroups.has(group.key)
            return (
              <div key={group.key}>
                {group.label && (
                  <div onClick={() => toggleGroup(group.key)} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.38rem 0.75rem', background: 'var(--color-bg)',
                    borderBottom: '1px solid var(--color-border)', cursor: 'pointer', userSelect: 'none',
                  }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', width: '0.9rem' }}>
                      {isOpen ? '▼' : '▶'}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmt(groupTotal)}</span>
                  </div>
                )}
                {isOpen && group.items.map((r, ri) => {
                  const isEditing = editId === r.id
                  const isLast = ri === group.items.length - 1 && gi === groups.length - 1
                  return isEditing ? (
                    <div key={r.id} style={{
                      display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center',
                      padding: '0.45rem 0.75rem', paddingLeft: group.label ? '1.75rem' : '0.75rem',
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                      background: '#fefce8',
                    }}>
                      <input value={editDescription} onChange={e => setEditDescription(e.target.value)}
                        style={{ flex: 2, minWidth: 120, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} />
                      <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)}
                        style={{ width: 90, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} step="0.01" min="0.01" />
                      <select value={editFrequency} onChange={e => setEditFrequency(e.target.value)}
                        style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }}>
                        <option value="monthly">Monatlich</option>
                        <option value="quarterly">Vierteljährlich</option>
                        <option value="halfyearly">Halbjährlich</option>
                        <option value="yearly">Jährlich</option>
                      </select>
                      <CategorySelect value={editCategoryId} onChange={e => handleEditCategoryChange(e.target.value)}
                        categories={categories} style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} />
                      <select value={editType} onChange={e => setEditType(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }}>
                        <option value="Ausgabe">Ausgabe</option>
                        <option value="Einnahme">Einnahme</option>
                      </select>
                      <button onClick={saveEdit} style={{ ...btnSmall, background: '#16a34a', color: '#fff' }}>Speichern</button>
                      <button onClick={() => setEditId(null)} style={{ ...btnSmall, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                    </div>
                  ) : (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.32rem 0.75rem',
                      paddingLeft: group.label ? '1.75rem' : '0.75rem',
                      borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                      fontSize: '0.85rem',
                      background: r.insuranceId ? '#f0fdf4' : r.subscriptionId ? '#f5f3ff' : undefined,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.description}
                          {r.insuranceId && (
                            <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', borderRadius: 3, padding: '0.1rem 0.3rem', fontWeight: 600 }}>
                              Versicherung
                            </span>
                          )}
                          {r.subscriptionId && (
                            <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '0.1rem 0.3rem', fontWeight: 600 }}>
                              Abonnement
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                          {getCategoryLabel(r.categoryId)}
                          {r.type && (
                            <span style={{
                              marginLeft: '0.4rem',
                              color: r.type === 'Einnahme' ? '#16a34a' : '#dc2626',
                              fontWeight: 600,
                            }}>{r.type === 'Einnahme' ? '+ Einnahme' : '− Ausgabe'}</span>
                          )}
                          {groupBy !== 'frequency' && (
                            <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>{FREQ_LABELS[r.frequency]}</span>
                          )}
                          {(r.insuranceId || r.subscriptionId) && (
                            <span style={{ marginLeft: '0.4rem', opacity: 0.6 }}>
                              – wird von {r.insuranceId ? 'Versicherungsvertrag' : 'Abonnement'} gesteuert
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(r.amount)}</span>
                      {!r.insuranceId && !r.subscriptionId && <>
                        <button onClick={() => startEdit(r)}
                          style={{ ...btnSmall, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
                        <button onClick={() => removeRecurring(r.id)}
                          style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
                          title="Löschen">✕</button>
                      </>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
