import { useState } from 'react'
import { fmt } from '../fmt'
import { buildCategoryOptions } from '../categoryOptions'
import Modal from './Modal'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => { localStorage.setItem(key, JSON.stringify(newVal)); setValue(newVal) }
  return [value, set]
}

const FREQ_LABELS = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', halfyearly: 'Halbjährlich', yearly: 'Jährlich' }
const FREQ_ORDER  = ['monthly', 'quarterly', 'halfyearly', 'yearly']
const lbl = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', display: 'block', fontWeight: 500 }
const EMPTY = { description: '', amount: '', frequency: 'monthly', categoryId: '', type: 'Ausgabe' }

function CategorySelect({ value, onChange, categories, style, placeholder = '– Kategorie wählen –' }) {
  return (
    <select value={value} onChange={onChange} style={style}>
      <option value="">{placeholder}</option>
      {buildCategoryOptions(categories)}
    </select>
  )
}

function getDescendants(catId, categories) {
  const children = categories.filter(c => c.parent == catId)
  return [catId, ...children.flatMap(c => getDescendants(c.id, categories))]
}

export default function RecurringPayments() {
  const [recurrings, setRecurrings] = useLocalStorage('recurringPayments', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [modal, setModal] = useState(null) // null | 'add' | recurringId
  const [form, setForm] = useState(EMPTY)

  const [filterType,       setFilterType]       = useState('all')
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [filterFrequency,  setFilterFrequency]  = useState('')
  const [filterSearch,     setFilterSearch]     = useState('')

  const [groupBy,        setGroupBy]        = useState('frequency')
  const [expandedGroups, setExpandedGroups] = useState(new Set(FREQ_ORDER))

  function field(key) { return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) } }

  function handleCategoryChange(val) {
    const cat = val ? categories.find(c => c.id === parseInt(val)) : null
    setForm(f => ({ ...f, categoryId: val, type: cat?.type || f.type }))
  }

  function openAdd() { setForm(EMPTY); setModal('add') }
  function openEdit(r) {
    setForm({ description: r.description, amount: String(r.amount), frequency: r.frequency, categoryId: r.categoryId ? String(r.categoryId) : '', type: r.type || 'Ausgabe' })
    setModal(r.id)
  }
  function closeModal() { setModal(null) }

  function save(e) {
    e.preventDefault()
    const item = { description: form.description, amount: parseFloat(form.amount), frequency: form.frequency, categoryId: form.categoryId ? parseInt(form.categoryId) : null, type: form.type }
    if (modal === 'add') {
      setRecurrings([...recurrings, { id: Date.now(), ...item }])
    } else {
      setRecurrings(recurrings.map(r => r.id === modal ? { ...r, ...item } : r))
    }
    closeModal()
  }

  function removeRecurring(id) { setRecurrings(recurrings.filter(r => r.id !== id)) }

  function getCategoryLabel(catId) {
    if (!catId) return '–'
    const cat = categories.find(c => c.id === catId)
    if (!cat) return '–'
    const parent = cat.parent ? categories.find(c => c.id === cat.parent) : null
    return parent ? `${parent.name} → ${cat.name}` : cat.name
  }

  function toggleGroup(key) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  const catById = Object.fromEntries(categories.map(c => [c.id, c]))
  function recIsIncome(r) { const t = r.type || catById[r.categoryId]?.type; return t === 'Einnahme' }

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
  function resetFilters() { setFilterType('all'); setFilterCategoryId(''); setFilterFrequency(''); setFilterSearch('') }

  function getGroups() {
    if (groupBy === 'frequency') {
      const map = {}
      FREQ_ORDER.forEach(f => { map[f] = [] })
      filteredRecurrings.forEach(r => { if (!map[r.frequency]) map[r.frequency] = []; map[r.frequency].push(r) })
      return FREQ_ORDER.filter(f => map[f].length > 0).map(f => ({ key: f, label: FREQ_LABELS[f], items: map[f] }))
    }
    return [{ key: 'all', label: null, items: filteredRecurrings }]
  }

  function buildCategoryTree(parentId = null) {
    return categories.filter(c => c.parent == parentId).map(cat => {
      const items = filteredRecurrings.filter(r => r.categoryId === cat.id)
      const children = buildCategoryTree(cat.id)
      if (!items.length && !children.length) return null
      return { cat, items, children }
    }).filter(Boolean)
  }

  function catTreeTotal(node) {
    return node.items.reduce((s, r) => s + r.amount, 0) + node.children.reduce((s, ch) => s + catTreeTotal(ch), 0)
  }

  function renderRecurringRow(r, ri, total, indent, groupKey) {
    const isLast = ri === total - 1
    return (
      <div key={r.id} style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: `0.32rem 0.75rem 0.32rem ${indent}rem`,
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        fontSize: '0.85rem',
        background: r.insuranceId ? '#f0fdf4' : r.subscriptionId ? '#f5f3ff' : undefined,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.description}
            {r.insuranceId  && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', borderRadius: 3, padding: '0.1rem 0.3rem', fontWeight: 600 }}>Versicherung</span>}
            {r.subscriptionId && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '0.1rem 0.3rem', fontWeight: 600 }}>Abonnement</span>}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
            {r.type && <span style={{ color: r.type === 'Einnahme' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{r.type === 'Einnahme' ? '+ Einnahme' : '− Ausgabe'}</span>}
            {groupBy !== 'frequency' && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>{FREQ_LABELS[r.frequency]}</span>}
            {(r.insuranceId || r.subscriptionId) && <span style={{ marginLeft: '0.4rem', opacity: 0.6 }}>– wird von {r.insuranceId ? 'Versicherungsvertrag' : 'Abonnement'} gesteuert</span>}
          </div>
        </div>
        <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(r.amount)}</span>
        {!r.insuranceId && !r.subscriptionId && <>
          <button onClick={() => openEdit(r)} style={{ border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem', background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
          <button onClick={() => removeRecurring(r.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }} title="Löschen">✕</button>
        </>}
      </div>
    )
  }

  function renderCategoryNode(node, depth = 0) {
    const total   = catTreeTotal(node)
    const indent  = depth * 1.1
    const isOpen  = expandedGroups.has(`cat_${node.cat.id}`)
    return (
      <div key={node.cat.id}>
        <div onClick={() => toggleGroup(`cat_${node.cat.id}`)} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: `0.35rem 0.75rem 0.35rem ${0.75 + indent}rem`,
          background: depth === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)', cursor: 'pointer', userSelect: 'none',
        }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', width: '0.9rem' }}>{isOpen ? '▼' : '▶'}</span>
          <span style={{ flex: 1, fontSize: depth === 0 ? '0.82rem' : '0.78rem', fontWeight: depth === 0 ? 700 : 600, color: depth === 0 ? 'var(--color-text)' : 'var(--color-text-muted)', textTransform: depth === 0 ? 'uppercase' : 'none', letterSpacing: depth === 0 ? '0.04em' : 0 }}>{node.cat.name}</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmt(total)}</span>
        </div>
        {isOpen && (
          <div>
            {node.children.map(ch => renderCategoryNode(ch, depth + 1))}
            {node.items.map((r, ri) => renderRecurringRow(r, ri, node.items.length, indent + 1.1, `cat_${node.cat.id}`))}
          </div>
        )}
      </div>
    )
  }

  const categoryTree  = groupBy === 'category' ? buildCategoryTree() : []
  const uncategorized = groupBy === 'category' ? filteredRecurrings.filter(r => !r.categoryId) : []
  const groups        = getGroups()

  const filterBtnStyle = (active) => ({
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
    borderRadius: 6, padding: '0.22rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer',
  })

  const isEditing = modal !== null && modal !== 'add'

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Daueraufträge</h2>
        <button onClick={openAdd} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Neu</button>
      </div>

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
          <CategorySelect value={filterCategoryId} onChange={e => setFilterCategoryId(e.target.value)} categories={categories} placeholder="– Alle Kategorien –" style={{ fontSize: '0.82rem', padding: '0.22rem 0.5rem', flex: 1, minWidth: 160 }} />
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', minWidth: '3.5rem' }}>Suche:</span>
          <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Beschreibung suchen…" style={{ fontSize: '0.82rem', padding: '0.22rem 0.5rem', flex: 1, minWidth: 160 }} />
          {hasActiveFilter && <button onClick={resetFilters} style={{ fontSize: '0.78rem', padding: '0.22rem 0.6rem', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#374151' }}>Filter zurücksetzen</button>}
        </div>
      </div>

      {/* Grouping */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Gruppieren:</span>
        {[['frequency', 'Frequenz'], ['category', 'Kategorie'], ['none', 'Keine']].map(([v, l]) => (
          <button key={v} onClick={() => {
            setGroupBy(v)
            if (v === 'category') setExpandedGroups(new Set(categories.map(c => `cat_${c.id}`).concat(['cat_none'])))
            if (v === 'frequency') setExpandedGroups(new Set(FREQ_ORDER))
          }} style={{ background: groupBy === v ? 'var(--color-primary)' : 'transparent', border: '1px solid var(--color-primary)', color: groupBy === v ? '#fff' : 'var(--color-primary)', borderRadius: 6, padding: '0.22rem 0.6rem', fontSize: '0.78rem', cursor: 'pointer' }}>{l}</button>
        ))}
        {hasActiveFilter && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>({filteredRecurrings.length} von {recurrings.length})</span>}
      </div>

      {/* List */}
      {filteredRecurrings.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0', margin: 0 }}>
          {recurrings.length === 0 ? 'Noch keine Daueraufträge angelegt.' : 'Keine Einträge entsprechen den Filterkriterien.'}
        </p>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {groupBy === 'category' ? (
            <>
              {categoryTree.map(node => renderCategoryNode(node))}
              {uncategorized.length > 0 && (
                <div>
                  <div onClick={() => toggleGroup('cat_none')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', width: '0.9rem' }}>{expandedGroups.has('cat_none') ? '▼' : '▶'}</span>
                    <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ohne Kategorie</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmt(uncategorized.reduce((s, r) => s + r.amount, 0))}</span>
                  </div>
                  {expandedGroups.has('cat_none') && uncategorized.map((r, ri) => renderRecurringRow(r, ri, uncategorized.length, 1.85, 'cat_none'))}
                </div>
              )}
            </>
          ) : (
            groups.map((group, gi) => {
              const groupTotal = group.items.reduce((s, r) => s + r.amount, 0)
              const isOpen = !group.label || expandedGroups.has(group.key)
              return (
                <div key={group.key}>
                  {group.label && (
                    <div onClick={() => toggleGroup(group.key)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.38rem 0.75rem', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', userSelect: 'none' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', width: '0.9rem' }}>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{group.label}</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmt(groupTotal)}</span>
                    </div>
                  )}
                  {isOpen && group.items.map((r, ri) => {
                    const isLast = ri === group.items.length - 1 && gi === groups.length - 1
                    return (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.32rem 0.75rem', paddingLeft: group.label ? '1.75rem' : '0.75rem',
                        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
                        fontSize: '0.85rem',
                        background: r.insuranceId ? '#f0fdf4' : r.subscriptionId ? '#f5f3ff' : undefined,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.description}
                            {r.insuranceId  && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#dcfce7', color: '#15803d', borderRadius: 3, padding: '0.1rem 0.3rem', fontWeight: 600 }}>Versicherung</span>}
                            {r.subscriptionId && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '0.1rem 0.3rem', fontWeight: 600 }}>Abonnement</span>}
                          </div>
                          <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                            {getCategoryLabel(r.categoryId)}
                            {r.type && <span style={{ marginLeft: '0.4rem', color: r.type === 'Einnahme' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{r.type === 'Einnahme' ? '+ Einnahme' : '− Ausgabe'}</span>}
                            {groupBy !== 'frequency' && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>{FREQ_LABELS[r.frequency]}</span>}
                            {(r.insuranceId || r.subscriptionId) && <span style={{ marginLeft: '0.4rem', opacity: 0.6 }}>– von {r.insuranceId ? 'Versicherung' : 'Abonnement'} gesteuert</span>}
                          </div>
                        </div>
                        <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(r.amount)}</span>
                        {!r.insuranceId && !r.subscriptionId && <>
                          <button onClick={() => openEdit(r)} style={{ border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem', background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
                          <button onClick={() => removeRecurring(r.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }} title="Löschen">✕</button>
                        </>}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      )}

      {modal && (
        <Modal title={isEditing ? 'Dauerauftrag bearbeiten' : 'Neuer Dauerauftrag'} onClose={closeModal} maxWidth={520}>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={lbl}>Beschreibung *</label>
              <input {...field('description')} placeholder="z. B. Miete" required style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div>
                <label style={lbl}>Betrag (€) *</label>
                <input type="number" {...field('amount')} placeholder="0.00" step="0.01" min="0.01" required style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Frequenz</label>
                <select {...field('frequency')} style={{ width: '100%' }}>
                  <option value="monthly">Monatlich</option>
                  <option value="quarterly">Vierteljährlich</option>
                  <option value="halfyearly">Halbjährlich</option>
                  <option value="yearly">Jährlich</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Kategorie</label>
                <CategorySelect value={form.categoryId} onChange={e => handleCategoryChange(e.target.value)} categories={categories} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Typ</label>
                <select {...field('type')} style={{ width: '100%' }}>
                  <option value="Ausgabe">Ausgabe</option>
                  <option value="Einnahme">Einnahme</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="submit" style={{ flex: 1 }}>{isEditing ? 'Änderungen speichern' : 'Hinzufügen'}</button>
              <button type="button" onClick={closeModal} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
