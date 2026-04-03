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

const FREQ_LABELS = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich' }

// Flat options with full path: "Nebenkosten → Strom"
function CategorySelect({ value, onChange, categories }) {
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
    <select value={value} onChange={onChange}>
      <option value="">– Kategorie wählen –</option>
      {buildOptions()}
    </select>
  )
}

// Keep recurringPayments in sync for a subscription
function syncRecurring(sub, isActive) {
  const recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || []

  if (!isActive) {
    localStorage.setItem('recurringPayments', JSON.stringify(
      recurrings.filter(r => r.subscriptionId !== sub.id)
    ))
    return
  }

  const existing = recurrings.find(r => r.subscriptionId === sub.id)
  if (existing) {
    localStorage.setItem('recurringPayments', JSON.stringify(
      recurrings.map(r => r.subscriptionId === sub.id
        ? { ...r, description: sub.name, amount: sub.cost, frequency: sub.frequency, categoryId: sub.categoryId ?? null }
        : r
      )
    ))
  } else {
    localStorage.setItem('recurringPayments', JSON.stringify([
      ...recurrings,
      { id: Date.now(), description: sub.name, amount: sub.cost, frequency: sub.frequency, categoryId: sub.categoryId ?? null, subscriptionId: sub.id },
    ]))
  }
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useLocalStorage('subscriptions', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [name,       setName]       = useState('')
  const [cost,       setCost]       = useState('')
  const [frequency,  setFrequency]  = useState('monthly')
  const [cancel,     setCancel]     = useState('')
  const [next,       setNext]       = useState('')
  const [aktiv,      setAktiv]      = useState(true)
  const [categoryId, setCategoryId] = useState('')

  function getCategoryLabel(catId) {
    if (!catId) return null
    const cat = categories.find(c => c.id === catId)
    if (!cat) return null
    const parent = cat.parent ? categories.find(c => c.id === cat.parent) : null
    return parent ? `${parent.name} → ${cat.name}` : cat.name
  }

  // Edit state
  const [editId,          setEditId]          = useState(null)
  const [editName,        setEditName]        = useState('')
  const [editCost,        setEditCost]        = useState('')
  const [editFrequency,   setEditFrequency]   = useState('monthly')
  const [editCancel,      setEditCancel]      = useState('')
  const [editNext,        setEditNext]        = useState('')
  const [editAktiv,       setEditAktiv]       = useState(true)
  const [editCategoryId,  setEditCategoryId]  = useState('')

  function addSubscription(e) {
    e.preventDefault()
    const sub = { id: Date.now(), name, cost: parseFloat(cost), frequency, cancel, next, aktiv, categoryId: categoryId ? parseInt(categoryId) : null }
    setSubscriptions([...subscriptions, sub])
    syncRecurring(sub, aktiv)
    setName(''); setCost(''); setFrequency('monthly'); setCancel(''); setNext(''); setAktiv(true); setCategoryId('')
  }

  function startEdit(s) {
    setEditId(s.id)
    setEditName(s.name)
    setEditCost(String(s.cost))
    setEditFrequency(s.frequency)
    setEditCancel(s.cancel || '')
    setEditNext(s.next || '')
    setEditAktiv(s.aktiv ?? true)
    setEditCategoryId(s.categoryId ? String(s.categoryId) : '')
  }

  function saveEdit() {
    const updated = {
      ...subscriptions.find(s => s.id === editId),
      name:       editName,
      cost:       parseFloat(editCost),
      frequency:  editFrequency,
      cancel:     editCancel,
      next:       editNext,
      aktiv:      editAktiv,
      categoryId: editCategoryId ? parseInt(editCategoryId) : null,
    }
    setSubscriptions(subscriptions.map(s => s.id === editId ? updated : s))
    syncRecurring(updated, updated.aktiv)
    setEditId(null)
  }

  function toggleAktiv(sub) {
    const updated = { ...sub, aktiv: !sub.aktiv }
    setSubscriptions(subscriptions.map(s => s.id === sub.id ? updated : s))
    syncRecurring(updated, updated.aktiv)
  }

  function removeSubscription(id) {
    const sub = subscriptions.find(s => s.id === id)
    if (sub) syncRecurring(sub, false)
    setSubscriptions(subscriptions.filter(s => s.id !== id))
  }

  return (
    <div className="module">
      <h2>Abonnements</h2>
      <form onSubmit={addSubscription}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" required />
        <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="Kosten" step="0.01" required />
        <select value={frequency} onChange={e => setFrequency(e.target.value)} required>
          <option value="monthly">Monatlich</option>
          <option value="quarterly">Vierteljährlich</option>
          <option value="yearly">Jährlich</option>
        </select>
        <input value={cancel} onChange={e => setCancel(e.target.value)} placeholder="Kündigungsfrist" required />
        <input type="date" value={next} onChange={e => setNext(e.target.value)} />
        <CategorySelect value={categoryId} onChange={e => setCategoryId(e.target.value)} categories={categories} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={aktiv} onChange={e => setAktiv(e.target.checked)} />
          Aktiv (als Dauerauftrag übernehmen)
        </label>
        <button type="submit">Abonnement hinzufügen</button>
      </form>

      <div style={{ marginTop: '1.25rem', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        {subscriptions.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', margin: 0, fontSize: '0.875rem' }}>
            Noch keine Abonnements angelegt
          </p>
        ) : subscriptions.map((s, i) => {
          const border = i < subscriptions.length - 1 ? '1px solid var(--color-border)' : 'none'
          const btnS = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem' }

          if (editId === s.id) {
            return (
              <div key={s.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', padding: '0.45rem 0.75rem', borderBottom: border, background: '#fefce8' }}>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  style={{ flex: 2, minWidth: 120, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="Name" />
                <input type="number" value={editCost} onChange={e => setEditCost(e.target.value)}
                  style={{ width: 90, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} step="0.01" min="0" />
                <select value={editFrequency} onChange={e => setEditFrequency(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }}>
                  <option value="monthly">Monatlich</option>
                  <option value="quarterly">Vierteljährlich</option>
                  <option value="yearly">Jährlich</option>
                </select>
                <CategorySelect value={editCategoryId} onChange={e => setEditCategoryId(e.target.value)} categories={categories} />
                <input value={editCancel} onChange={e => setEditCancel(e.target.value)}
                  style={{ width: 110, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="Kündigung" />
                <input type="date" value={editNext} onChange={e => setEditNext(e.target.value)}
                  style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem' }}>
                  <input type="checkbox" checked={editAktiv} onChange={e => setEditAktiv(e.target.checked)} />
                  Aktiv
                </label>
                <button onClick={saveEdit} style={{ ...btnS, background: '#16a34a', color: '#fff' }}>Speichern</button>
                <button onClick={() => setEditId(null)} style={{ ...btnS, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
              </div>
            )
          }

          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
              padding: '0.45rem 0.75rem', borderBottom: border,
              fontSize: '0.85rem', opacity: s.aktiv ? 1 : 0.55,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {FREQ_LABELS[s.frequency] || s.frequency}
                  {getCategoryLabel(s.categoryId) && <span style={{ marginLeft: '0.5rem' }}>· {getCategoryLabel(s.categoryId)}</span>}
                  {s.cancel && <span style={{ marginLeft: '0.5rem' }}>· Kündigung: {s.cancel}</span>}
                  {s.next   && <span style={{ marginLeft: '0.5rem' }}>· Nächste: {s.next}</span>}
                </div>
              </div>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(s.cost)}</span>
              <button onClick={() => toggleAktiv(s)} title={s.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                style={{ ...btnS, background: s.aktiv ? 'var(--color-primary)' : '#e5e7eb', color: s.aktiv ? '#fff' : '#374151' }}>
                {s.aktiv ? 'Aktiv' : 'Inaktiv'}
              </button>
              <button onClick={() => startEdit(s)} style={{ ...btnS, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
              <button onClick={() => removeSubscription(s.id)}
                style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
                title="Löschen">✕</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
