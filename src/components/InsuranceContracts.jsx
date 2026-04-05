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

const CATEGORIES = [
  'Haftpflicht',
  'KFZ',
  'Leben',
  'Kranken / Zusatz',
  'Hausrat',
  'Gebäude',
  'Unfall',
  'Berufsunfähigkeit',
  'Rechtsschutz',
  'Reise',
  'Sonstige',
]

const FREQ_LABELS = {
  monthly:    'Monatlich',
  quarterly:  'Vierteljährlich',
  halfyearly: 'Halbjährlich',
  yearly:     'Jährlich',
}

const FREQ_SHORT = {
  monthly:    'mtl.',
  quarterly:  'quartl.',
  halfyearly: 'halbj.',
  yearly:     'jährl.',
}

// Sync the recurring payment for a contract.
// Removes any old entry with insuranceId === id, then adds a new one if active + premium > 0.
function syncRecurringPayment(contract) {
  const stored = JSON.parse(localStorage.getItem('recurringPayments')) || []
  // Remove existing entry for this contract
  const without = stored.filter(r => r.insuranceId !== contract.id)
  let next = without
  if (contract.active && contract.premium > 0) {
    next = [...without, {
      id:          `ins_${contract.id}`,
      insuranceId: contract.id,
      description: contract.name + (contract.provider ? ` (${contract.provider})` : ''),
      amount:      contract.premium,
      frequency:   contract.premiumFrequency || 'monthly',
      type:        'Ausgabe',
      categoryId:  null,
    }]
  }
  localStorage.setItem('recurringPayments', JSON.stringify(next))
}

function removeRecurringPayment(contractId) {
  const stored = JSON.parse(localStorage.getItem('recurringPayments')) || []
  localStorage.setItem('recurringPayments', JSON.stringify(stored.filter(r => r.insuranceId !== contractId)))
}

const EMPTY_FORM = {
  name: '', provider: '', category: '', value: '', premium: '', premiumFrequency: 'monthly',
  start: '', end: '', notes: '', comment: '', active: true,
}

export default function InsuranceContracts() {
  const [contracts, setContracts] = useLocalStorage('insuranceContracts', [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }
  function check(key) {
    return { checked: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.checked })) }
  }

  function saveContract(e) {
    e.preventDefault()
    const contract = {
      id:               editId || Date.now(),
      name:             form.name,
      provider:         form.provider,
      category:         form.category,
      value:            form.value !== '' ? parseFloat(form.value) : null,
      premium:          form.premium !== '' ? parseFloat(form.premium) : 0,
      premiumFrequency: form.premiumFrequency,
      start:            form.start,
      end:              form.end,
      notes:            form.notes,
      comment:          form.comment,
      active:           form.active,
    }
    const updated = editId
      ? contracts.map(c => c.id === editId ? contract : c)
      : [...contracts, contract]
    setContracts(updated)
    syncRecurringPayment(contract)
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditId(null)
  }

  function startEdit(c) {
    setForm({
      name:             c.name || '',
      provider:         c.provider || '',
      category:         c.category || '',
      value:            c.value != null ? String(c.value) : '',
      premium:          c.premium ? String(c.premium) : '',
      premiumFrequency: c.premiumFrequency || 'monthly',
      start:            c.start || '',
      end:              c.end || '',
      notes:            c.notes || '',
      comment:          c.comment || '',
      active:           c.active !== false,
    })
    setEditId(c.id)
    setShowForm(true)
  }

  function cancelForm() {
    setForm(EMPTY_FORM)
    setShowForm(false)
    setEditId(null)
  }

  function removeContract(id) {
    setContracts(contracts.filter(c => c.id !== id))
    removeRecurringPayment(id)
  }

  const totalValue = contracts.reduce((s, c) => s + (c.value || 0), 0)

  const inputStyle = { fontSize: '0.85rem', padding: '0.35rem 0.5rem' }
  const labelStyle = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'block' }

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Versicherungsverträge</h2>
        <button
          onClick={() => { showForm && editId ? cancelForm() : (showForm ? cancelForm() : setShowForm(true)) }}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
        >
          {showForm ? 'Abbrechen' : '+ Neu'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={saveContract} style={{
          background: 'var(--color-bg)', borderRadius: 8, padding: '1rem',
          marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Vertragsname *</label>
              <input {...field('name')} placeholder="z. B. Haftpflicht" required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Anbieter</label>
              <input {...field('provider')} placeholder="z. B. Allianz" style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Kategorie</label>
              <select {...field('category')} style={{ ...inputStyle, width: '100%' }}>
                <option value="">– keine –</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Aktueller Wert (€) – optional</label>
              <input type="number" {...field('value')} placeholder="z. B. 5000" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ ...labelStyle, marginBottom: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" {...check('active')} />
                <span>Aktiv (erzeugt Dauerauftrag)</span>
              </label>
            </div>
          </div>

          {/* Beitrag */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Beitrag
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}>Betrag (€)</label>
                <input type="number" {...field('premium')} placeholder="z. B. 120" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>Periodizität</label>
                <select {...field('premiumFrequency')} style={{ ...inputStyle, width: '100%' }}>
                  <option value="monthly">Monatlich</option>
                  <option value="quarterly">Vierteljährlich</option>
                  <option value="halfyearly">Halbjährlich</option>
                  <option value="yearly">Jährlich</option>
                </select>
              </div>
            </div>
            {form.active && form.premium > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#16a34a', background: '#dcfce7', borderRadius: 4, padding: '0.25rem 0.5rem' }}>
                Wird als Dauerauftrag „{form.name || '…'}" angelegt
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Vertragsbeginn</label>
              <input type="date" {...field('start')} style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Vertragsende</label>
              <input type="date" {...field('end')} style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notizen</label>
            <textarea {...field('notes')} placeholder="Allgemeine Notizen zum Vertrag…" rows={2}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>

          <div>
            <label style={labelStyle}>Kommentar</label>
            <textarea {...field('comment')} placeholder="Weitere Anmerkungen, Bedingungen, Kontakte…" rows={2}
              style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" style={{ flex: 1 }}>
              {editId ? 'Änderungen speichern' : 'Vertrag hinzufügen'}
            </button>
            <button type="button" onClick={cancelForm} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer' }}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {contracts.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Versicherungsverträge angelegt.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {contracts.map(c => (
              <div key={c.id} style={{
                border: '1px solid var(--color-border)', borderRadius: 8,
                overflow: 'hidden', opacity: c.active === false ? 0.6 : 1,
              }}>
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.75rem', background: 'var(--color-bg)',
                  borderBottom: '1px solid var(--color-border)',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: c.active !== false ? '#16a34a' : '#9ca3af',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{c.name}</span>
                  {c.category && (
                    <span style={{ fontSize: '0.72rem', color: '#0369a1', background: '#e0f2fe', borderRadius: 4, padding: '0.1rem 0.4rem' }}>{c.category}</span>
                  )}
                  {c.provider && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{c.provider}</span>
                  )}
                  <button onClick={() => startEdit(c)} style={{ background: '#e5e7eb', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem', color: '#374151' }}>✎</button>
                  <button onClick={() => removeContract(c.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>✕</button>
                </div>

                {/* Detail row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0', fontSize: '0.8rem' }}>
                  {/* Wert */}
                  {c.value != null && (
                    <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Wert</div>
                      <div style={{ fontWeight: 600 }}>{fmt(c.value)}</div>
                    </div>
                  )}
                  {/* Beitrag */}
                  {c.premium > 0 && (
                    <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Beitrag</div>
                      <div style={{ fontWeight: 600, color: '#dc2626' }}>
                        {fmt(c.premium)}
                        <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>{FREQ_SHORT[c.premiumFrequency || 'monthly']}</span>
                        {c.active !== false && (
                          <span style={{ fontSize: '0.65rem', marginLeft: '0.3rem', color: '#16a34a' }}>✓ DA</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Laufzeit */}
                  {(c.start || c.end) && (
                    <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Laufzeit</div>
                      <div>{c.start || '–'} → {c.end || '∞'}</div>
                    </div>
                  )}
                  {/* Notizen / Kommentar */}
                  {(c.notes || c.comment) && (
                    <div style={{ padding: '0.4rem 0.75rem', flex: 1, minWidth: 120 }}>
                      {c.notes && <div style={{ color: 'var(--color-text-muted)' }}>{c.notes}</div>}
                      {c.comment && <div style={{ color: 'var(--color-text-muted)', borderTop: c.notes ? '1px solid var(--color-border)' : 'none', paddingTop: c.notes ? '0.2rem' : 0, marginTop: c.notes ? '0.2rem' : 0 }}>{c.comment}</div>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {contracts.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0.4rem 0.75rem', background: 'var(--color-bg)', borderRadius: 6, fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Gesamt Wert</span>
              <span style={{ fontWeight: 700 }}>{fmt(totalValue)}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
