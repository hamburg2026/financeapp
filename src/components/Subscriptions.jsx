import { useState } from 'react'
import { fmt } from '../fmt'
import CategorySelect from './CategorySelect'
import Modal from './Modal'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => { localStorage.setItem(key, JSON.stringify(newVal)); setValue(newVal) }
  return [value, set]
}

const FREQ_LABELS = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', halfyearly: 'Halbjährlich', yearly: 'Jährlich' }
const lbl = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', display: 'block', fontWeight: 500 }

function syncRecurring(sub, isActive) {
  const recurrings = JSON.parse(localStorage.getItem('recurringPayments')) || []
  if (!isActive) {
    localStorage.setItem('recurringPayments', JSON.stringify(recurrings.filter(r => r.subscriptionId !== sub.id)))
    return
  }
  const existing = recurrings.find(r => r.subscriptionId === sub.id)
  if (existing) {
    localStorage.setItem('recurringPayments', JSON.stringify(
      recurrings.map(r => r.subscriptionId === sub.id
        ? { ...r, description: sub.name, amount: sub.cost, frequency: sub.frequency, categoryId: sub.categoryId ?? null, type: sub.type ?? 'Ausgabe' }
        : r
      )
    ))
  } else {
    localStorage.setItem('recurringPayments', JSON.stringify([
      ...recurrings,
      { id: Date.now(), description: sub.name, amount: sub.cost, frequency: sub.frequency, categoryId: sub.categoryId ?? null, type: sub.type ?? 'Ausgabe', subscriptionId: sub.id },
    ]))
  }
}

const EMPTY = { name: '', cost: '', frequency: 'monthly', cancel: '', cancelDate: '', aktiv: true, gekuendigt: false, categoryId: '', type: 'Ausgabe' }

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useLocalStorage('subscriptions', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [modal, setModal] = useState(null) // null | 'add' | subId
  const [form, setForm] = useState(EMPTY)

  function field(key) { return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) } }
  function check(key) { return { checked: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.checked })) } }

  function handleCategoryChange(val) {
    setForm(f => {
      const cat = val ? categories.find(c => c.id === parseInt(val)) : null
      return { ...f, categoryId: val, type: cat?.type || f.type }
    })
  }

  function openAdd() { setForm(EMPTY); setModal('add') }
  function openEdit(s) {
    setForm({ name: s.name, cost: String(s.cost), frequency: s.frequency, cancel: s.cancel || '', cancelDate: s.cancelDate || '', aktiv: s.aktiv ?? true, gekuendigt: s.gekuendigt || false, categoryId: s.categoryId ? String(s.categoryId) : '', type: s.type || 'Ausgabe' })
    setModal(s.id)
  }
  function closeModal() { setModal(null) }

  function save(e) {
    e.preventDefault()
    const sub = {
      id: modal === 'add' ? Date.now() : modal,
      name: form.name, cost: parseFloat(form.cost), frequency: form.frequency,
      cancel: form.cancel, cancelDate: form.cancelDate, aktiv: form.aktiv, gekuendigt: form.gekuendigt,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null, type: form.type,
    }
    if (modal === 'add') {
      setSubscriptions([...subscriptions, sub])
    } else {
      setSubscriptions(subscriptions.map(s => s.id === modal ? sub : s))
    }
    syncRecurring(sub, form.aktiv)
    closeModal()
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

  function getCategoryLabel(catId) {
    if (!catId) return null
    const cat = categories.find(c => c.id === catId)
    if (!cat) return null
    const parent = cat.parent ? categories.find(c => c.id === cat.parent) : null
    return parent ? `${parent.name} → ${cat.name}` : cat.name
  }

  const btnS = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem' }
  const isEditing = modal !== null && modal !== 'add'

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Abonnements</h2>
        <button onClick={openAdd} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Neu</button>
      </div>

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        {subscriptions.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', margin: 0, fontSize: '0.875rem' }}>
            Noch keine Abonnements angelegt
          </p>
        ) : subscriptions.map((s, i) => {
          const border = i < subscriptions.length - 1 ? '1px solid var(--color-border)' : 'none'
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
              padding: '0.45rem 0.75rem', borderBottom: border,
              fontSize: '0.85rem', opacity: s.aktiv ? 1 : 0.55,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  {s.gekuendigt && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '0.1rem 0.4rem', flexShrink: 0 }}>
                      Gekündigt
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {FREQ_LABELS[s.frequency] || s.frequency}
                  {getCategoryLabel(s.categoryId) && <span style={{ marginLeft: '0.5rem' }}>· {getCategoryLabel(s.categoryId)}</span>}
                  {s.cancel     && <span style={{ marginLeft: '0.5rem' }}>· Frist: {s.cancel}</span>}
                  {s.cancelDate && <span style={{ marginLeft: '0.5rem' }}>· Kündigung bis: {s.cancelDate}</span>}
                </div>
              </div>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{fmt(s.cost)}</span>
              <button onClick={() => toggleAktiv(s)} title={s.aktiv ? 'Deaktivieren' : 'Aktivieren'}
                style={{ ...btnS, background: s.aktiv ? 'var(--color-primary)' : '#e5e7eb', color: s.aktiv ? '#fff' : '#374151' }}>
                {s.aktiv ? 'Aktiv' : 'Inaktiv'}
              </button>
              <button onClick={() => openEdit(s)} style={{ ...btnS, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
              <button onClick={() => removeSubscription(s.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 }} title="Löschen">✕</button>
            </div>
          )
        })}
      </div>

      {modal && (
        <Modal title={isEditing ? 'Abonnement bearbeiten' : 'Abonnement hinzufügen'} onClose={closeModal} maxWidth={540}>
          <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Name *</label>
                <input {...field('name')} placeholder="z. B. Netflix" required style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Kosten (€) *</label>
                <input type="number" {...field('cost')} placeholder="9.99" step="0.01" min="0" required style={{ width: '100%' }} />
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
                <CategorySelect value={form.categoryId} onChange={e => handleCategoryChange(e.target.value)} categories={categories} placeholder="– keine –" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Typ</label>
                <select {...field('type')} style={{ width: '100%' }}>
                  <option value="Ausgabe">Ausgabe</option>
                  <option value="Einnahme">Einnahme</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Kündigungsfrist</label>
                <input list="cancel-opts" {...field('cancel')} placeholder="z. B. 1 Monat" style={{ width: '100%' }} />
                <datalist id="cancel-opts">
                  {['1 Monat','2 Monate','3 Monate','6 Monate','12 Monate','quartalsweise','halbjährlich','jährlich','individuell'].map(v => <option key={v} value={v} />)}
                </datalist>
              </div>
              <div>
                <label style={lbl}>Kündigungsdatum</label>
                <input type="date" {...field('cancelDate')} style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" {...check('aktiv')} />
                Aktiv (als Dauerauftrag übernehmen)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="checkbox" {...check('gekuendigt')} />
                Gekündigt
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="submit" style={{ flex: 1 }}>{isEditing ? 'Änderungen speichern' : 'Abonnement hinzufügen'}</button>
              <button type="button" onClick={closeModal} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
