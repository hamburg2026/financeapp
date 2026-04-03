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
        ? { ...r, description: sub.name, amount: sub.cost, frequency: sub.frequency }
        : r
      )
    ))
  } else {
    localStorage.setItem('recurringPayments', JSON.stringify([
      ...recurrings,
      { id: Date.now(), description: sub.name, amount: sub.cost, frequency: sub.frequency, categoryId: null, subscriptionId: sub.id },
    ]))
  }
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useLocalStorage('subscriptions', [])

  const [name,      setName]      = useState('')
  const [cost,      setCost]      = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [cancel,    setCancel]    = useState('')
  const [next,      setNext]      = useState('')
  const [aktiv,     setAktiv]     = useState(true)

  function addSubscription(e) {
    e.preventDefault()
    const sub = { id: Date.now(), name, cost: parseFloat(cost), frequency, cancel, next, aktiv }
    setSubscriptions([...subscriptions, sub])
    syncRecurring(sub, aktiv)
    setName(''); setCost(''); setFrequency('monthly'); setCancel(''); setNext(''); setAktiv(true)
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
        ) : subscriptions.map((s, i) => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
            padding: '0.45rem 0.75rem',
            borderBottom: i < subscriptions.length - 1 ? '1px solid var(--color-border)' : 'none',
            fontSize: '0.85rem',
            opacity: s.aktiv ? 1 : 0.55,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {FREQ_LABELS[s.frequency] || s.frequency}
                {s.cancel && <span style={{ marginLeft: '0.5rem' }}>· Kündigung: {s.cancel}</span>}
                {s.next   && <span style={{ marginLeft: '0.5rem' }}>· Nächste: {s.next}</span>}
              </div>
            </div>
            <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(s.cost)}</span>
            <button
              onClick={() => toggleAktiv(s)}
              title={s.aktiv ? 'Deaktivieren' : 'Aktivieren'}
              style={{
                background: s.aktiv ? 'var(--color-primary)' : '#e5e7eb',
                color: s.aktiv ? '#fff' : '#374151',
                border: 'none', borderRadius: 5,
                padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0,
              }}
            >
              {s.aktiv ? 'Aktiv' : 'Inaktiv'}
            </button>
            <button
              onClick={() => removeSubscription(s.id)}
              style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }}
              title="Löschen"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
