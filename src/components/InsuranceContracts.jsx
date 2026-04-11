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

const FREQ_SHORT = {
  monthly:    'mtl.',
  quarterly:  'quartl.',
  halfyearly: 'halbj.',
  yearly:     'jährl.',
}

function syncRecurringPayment(contract) {
  const stored = JSON.parse(localStorage.getItem('recurringPayments')) || []
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
      categoryId:  contract.categoryId || null,
    }]
  }
  localStorage.setItem('recurringPayments', JSON.stringify(next))
}

function removeRecurringPayment(contractId) {
  const stored = JSON.parse(localStorage.getItem('recurringPayments')) || []
  localStorage.setItem('recurringPayments', JSON.stringify(stored.filter(r => r.insuranceId !== contractId)))
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

function todayIso() { return new Date().toISOString().slice(0, 10) }

function isoToParts(iso) {
  if (!iso || iso.length < 10) return { d: '', m: '', y: '' }
  const [y, m, d] = iso.split('-')
  return { d: d || '', m: m || '', y: y || '' }
}

function partsToIso(d, m, y) {
  if (!d && !m && !y) return ''
  const dd = String(d).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return y && mm && dd ? `${y}-${mm}-${dd}` : ''
}

// Three-field date input: TT / MM / JJJJ
function DateInput({ value, onChange }) {
  const { d, m, y } = isoToParts(value)
  const st = { fontSize: '0.83rem', padding: '0.33rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5, textAlign: 'center', background: 'var(--color-surface)' }
  const upd = (nd, nm, ny) => onChange(partsToIso(nd, nm, ny))
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input type="number" value={d} min="1" max="31" placeholder="TT"
        style={{ ...st, width: 50 }} onChange={e => upd(e.target.value, m, y)} />
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>.</span>
      <input type="number" value={m} min="1" max="12" placeholder="MM"
        style={{ ...st, width: 50 }} onChange={e => upd(d, e.target.value, y)} />
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>.</span>
      <input type="number" value={y} min="1900" max="2100" placeholder="JJJJ"
        style={{ ...st, width: 70 }} onChange={e => upd(d, m, e.target.value)} />
    </div>
  )
}

// ─── Value history ─────────────────────────────────────────────────────────────

function latestHistoryValue(history, fallback) {
  if (!history?.length) return fallback
  return [...history].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

function ValueHistory({ history = [], onChange }) {
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState(todayIso())
  const [newVal, setNewVal] = useState('')

  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))

  function add() {
    if (!newDate || newVal === '') return
    const entry = { id: Date.now(), date: newDate, value: parseFloat(newVal) }
    onChange([...history, entry])
    setNewVal('')
    setAdding(false)
  }

  function remove(id) { onChange(history.filter(e => e.id !== id)) }

  const btn = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem' }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '0.5rem 0.75rem', background: 'var(--color-bg)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        Werthistorie
      </div>
      {sorted.length === 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
          Noch keine Einträge
        </div>
      )}
      {sorted.map((e, i) => (
        <div key={e.id} style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.2rem 0', borderBottom: i < sorted.length - 1 ? '1px solid var(--color-border)' : 'none',
          fontSize: '0.82rem',
        }}>
          <span style={{ color: 'var(--color-text-muted)', minWidth: 90, fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.date}</span>
          <span style={{ fontWeight: 700, flex: 1 }}>{fmt(e.value)}</span>
          {i === 0 && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '0.05rem 0.3rem', fontWeight: 600 }}>aktuell</span>}
          <button onClick={() => remove(e.id)} style={{ ...btn, background: 'none', color: '#dc2626', padding: '0.1rem 0.3rem' }}>✕</button>
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <DateInput value={newDate} onChange={setNewDate} />
          <input type="number" value={newVal} onChange={e => setNewVal(e.target.value)}
            placeholder="Wert (€)" step="0.01" min="0"
            style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', width: 110, border: '1px solid var(--color-border)', borderRadius: 5 }} />
          <button onClick={add} style={{ ...btn, background: 'var(--color-primary)', color: '#fff', padding: '0.3rem 0.6rem' }}>Speichern</button>
          <button onClick={() => setAdding(false)} style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.3rem 0.6rem' }}>Abbrechen</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{
          marginTop: '0.4rem', background: 'none', border: '1px dashed var(--color-border)',
          borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', padding: '0.2rem 0.6rem',
          color: 'var(--color-text-muted)', width: '100%', textAlign: 'left',
        }}>
          + Stichtag hinzufügen
        </button>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', provider: '', categoryId: '', value: '', premium: '', premiumFrequency: 'monthly',
  start: '', end: '', notes: '', comment: '', active: true,
}

export default function InsuranceContracts() {
  const [contracts, setContracts] = useLocalStorage('insuranceContracts', [])
  const [allCategories] = useLocalStorage('categories', [])
  const expenseCategories = allCategories.filter(c => c.type === 'Ausgabe')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(new Set())

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }
  function check(key) {
    return { checked: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.checked })) }
  }

  function saveContract(e) {
    e.preventDefault()
    const existing = contracts.find(c => c.id === editId)
    const contract = {
      id:               editId || Date.now(),
      name:             form.name,
      provider:         form.provider,
      categoryId:       form.categoryId ? parseInt(form.categoryId) : null,
      value:            form.value !== '' ? parseFloat(form.value) : null,
      premium:          form.premium !== '' ? parseFloat(form.premium) : 0,
      premiumFrequency: form.premiumFrequency,
      start:            form.start,
      end:              form.end,
      notes:            form.notes,
      comment:          form.comment,
      active:           form.active,
      valueHistory:     existing?.valueHistory || [],
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
      categoryId:       c.categoryId ? String(c.categoryId) : '',
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

  function toggleHistory(id) {
    setExpandedHistory(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function updateHistory(contractId, newHistory) {
    setContracts(contracts.map(c => {
      if (c.id !== contractId) return c
      const latestVal = newHistory.length > 0
        ? [...newHistory].sort((a, b) => b.date.localeCompare(a.date))[0].value
        : c.value
      const updated = { ...c, valueHistory: newHistory, value: latestVal }
      syncRecurringPayment(updated)
      return updated
    }))
  }

  const getDisplayValue = (c) => latestHistoryValue(c.valueHistory, c.value)

  const totalValue = contracts.reduce((s, c) => s + (getDisplayValue(c) || 0), 0)

  const inputStyle = { fontSize: '0.85rem', padding: '0.35rem 0.5rem' }
  const labelStyle = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'block' }

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Versicherungsverträge</h2>
        <button
          onClick={() => { showForm ? cancelForm() : setShowForm(true) }}
          style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
        >
          {showForm ? 'Abbrechen' : '+ Neu'}
        </button>
      </div>

      {contracts.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Versicherungsverträge angelegt.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {contracts.map(c => {
              const displayVal = getDisplayValue(c)
              const histOpen = expandedHistory.has(c.id)
              return (
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
                    {c.categoryId && (() => {
                      const cat = allCategories.find(x => x.id === c.categoryId)
                      return cat ? <span style={{ fontSize: '0.72rem', color: '#0369a1', background: '#e0f2fe', borderRadius: 4, padding: '0.1rem 0.4rem' }}>{cat.name}</span> : null
                    })()}
                    <button onClick={() => startEdit(c)} style={{ background: '#e5e7eb', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem', color: '#374151' }}>✎</button>
                    <button onClick={() => removeContract(c.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>✕</button>
                  </div>

                  {/* Detail row */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    {/* Anbieter – prominent */}
                    {c.provider && (
                      <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 100 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Anbieter</div>
                        <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.85rem' }}>{c.provider}</div>
                      </div>
                    )}
                    {/* Wert */}
                    {displayVal != null && (
                      <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Wert</div>
                        <div style={{ fontWeight: 600 }}>{fmt(displayVal)}</div>
                        {c.valueHistory?.length > 0 && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                            {c.valueHistory.length} Einträge
                          </div>
                        )}
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
                    {/* Notizen */}
                    {(c.notes || c.comment) && (
                      <div style={{ padding: '0.4rem 0.75rem', flex: 1, minWidth: 120 }}>
                        {c.notes && <div style={{ color: 'var(--color-text-muted)' }}>{c.notes}</div>}
                        {c.comment && <div style={{ color: 'var(--color-text-muted)', borderTop: c.notes ? '1px solid var(--color-border)' : 'none', paddingTop: c.notes ? '0.2rem' : 0, marginTop: c.notes ? '0.2rem' : 0 }}>{c.comment}</div>}
                      </div>
                    )}
                    {/* Werthistorie toggle */}
                    <div style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                      <button
                        onClick={() => toggleHistory(c.id)}
                        style={{
                          background: histOpen ? 'var(--color-primary)' : '#e5e7eb',
                          color: histOpen ? '#fff' : '#374151',
                          border: 'none', borderRadius: 5, cursor: 'pointer',
                          fontSize: '0.72rem', padding: '0.2rem 0.55rem',
                          display: 'flex', alignItems: 'center', gap: '0.25rem',
                        }}
                      >
                        {histOpen ? '▾' : '▸'} Werthistorie
                      </button>
                    </div>
                  </div>

                  {/* Value history (expandable) */}
                  {histOpen && (
                    <ValueHistory
                      history={c.valueHistory || []}
                      onChange={h => updateHistory(c.id, h)}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {contracts.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0.4rem 0.75rem', background: 'var(--color-bg)', borderRadius: 6, fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Gesamt Wert</span>
              <span style={{ fontWeight: 700 }}>{fmt(totalValue)}</span>
            </div>
          )}
        </>
      )}

      {/* Add/edit form */}
      {showForm && (
        <form onSubmit={saveContract} style={{
          background: 'var(--color-bg)', borderRadius: 8, padding: '1rem',
          marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
          border: '1px solid var(--color-border)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-primary)' }}>
            {editId ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}
          </div>

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
              <select {...field('categoryId')} style={{ ...inputStyle, width: '100%' }}>
                <option value="">– keine –</option>
                {expenseCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ ...labelStyle, marginBottom: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" {...check('active')} />
                <span>Aktiv (erzeugt Dauerauftrag)</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Aktueller Wert (€) – optional</label>
              <input type="number" {...field('value')} placeholder="z. B. 5000" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>

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
              <DateInput value={form.start} onChange={v => setForm(f => ({ ...f, start: v }))} />
            </div>
            <div>
              <label style={labelStyle}>Vertragsende</label>
              <DateInput value={form.end} onChange={v => setForm(f => ({ ...f, end: v }))} />
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
    </div>
  )
}
