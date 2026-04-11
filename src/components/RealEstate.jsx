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

const btnSm = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4 }

function todayIso() { return new Date().toISOString().slice(0, 10) }

function isoToGerman(iso) {
  if (!iso || iso.length < 10) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function parseGermanDate(text) {
  const digits = text.replace(/\D/g, '')
  if (digits.length === 8) {
    const d = digits.slice(0, 2)
    const m = digits.slice(2, 4)
    const y = digits.slice(4, 8)
    return `${y}-${m}-${d}`
  }
  return ''
}

function DateInput({ value, onChange }) {
  const [raw, setRaw] = useState('')
  const [focused, setFocused] = useState(false)
  function handleFocus() { setRaw(isoToGerman(value)); setFocused(true) }
  function handleBlur() {
    setFocused(false)
    if (!raw.trim()) { onChange(''); return }
    const iso = parseGermanDate(raw)
    if (iso) onChange(iso)
  }
  return (
    <input type="text"
      value={focused ? raw : isoToGerman(value)}
      placeholder="TTMMJJJJ"
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={e => setRaw(e.target.value)}
      style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', border: '1px solid var(--color-border)', borderRadius: 5, background: 'var(--color-surface)', width: 110 }}
    />
  )
}

function latestHistoryValue(history, fallback) {
  if (!history?.length) return fallback
  return [...history].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

function ValueHistory({ label = 'Werthistorie', history = [], onChange }) {
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState(todayIso())
  const [newVal, setNewVal] = useState('')
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))
  function add() {
    if (!newDate || newVal === '') return
    onChange([...history, { id: Date.now(), date: newDate, value: parseFloat(newVal) }])
    setNewVal('')
    setAdding(false)
  }
  function remove(id) { onChange(history.filter(e => e.id !== id)) }
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '0.5rem 0.75rem', background: 'var(--color-bg)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      {sorted.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>Noch keine Einträge</div>}
      {sorted.map((e, i) => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', borderBottom: i < sorted.length - 1 ? '1px solid var(--color-border)' : 'none', fontSize: '0.82rem' }}>
          <span style={{ color: 'var(--color-text-muted)', minWidth: 90, fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.date}</span>
          <span style={{ fontWeight: 700, flex: 1 }}>{fmt(e.value)}</span>
          {i === 0 && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '0.05rem 0.3rem', fontWeight: 600 }}>aktuell</span>}
          <button onClick={() => remove(e.id)} style={{ ...btnSm, background: 'none', color: '#dc2626', padding: '0.1rem 0.3rem' }}>✕</button>
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <DateInput value={newDate} onChange={setNewDate} />
          <input type="number" value={newVal} onChange={e => setNewVal(e.target.value)}
            placeholder="Wert (€)" step="0.01" min="0"
            style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', width: 120, border: '1px solid var(--color-border)', borderRadius: 5 }} />
          <button onClick={add} style={{ ...btnSm, background: 'var(--color-primary)', color: '#fff', padding: '0.3rem 0.6rem' }}>Speichern</button>
          <button onClick={() => setAdding(false)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151', padding: '0.3rem 0.6rem' }}>Abbrechen</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: '0.4rem', background: 'none', border: '1px dashed var(--color-border)', borderRadius: 5, cursor: 'pointer', fontSize: '0.78rem', padding: '0.2rem 0.6rem', color: 'var(--color-text-muted)', width: '100%', textAlign: 'left' }}>
          + Stichtag hinzufügen
        </button>
      )}
    </div>
  )
}

const EMPTY = { name: '', purchase: '', current: '', notes: '' }
const inputStyle = { fontSize: '0.85rem', padding: '0.35rem 0.5rem' }
const labelStyle = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'block' }

export default function RealEstate() {
  const [properties, setProperties] = useLocalStorage('realEstate', [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(new Set())

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }

  function saveProperty(e) {
    e.preventDefault()
    const existing = properties.find(p => p.id === editId)
    const prop = {
      id:           editId || Date.now(),
      name:         form.name,
      purchase:     parseFloat(form.purchase),
      current:      parseFloat(form.current),
      notes:        form.notes,
      currentHistory: existing?.currentHistory || [],
    }
    setProperties(editId ? properties.map(p => p.id === editId ? prop : p) : [...properties, prop])
    setForm(EMPTY)
    setShowForm(false)
    setEditId(null)
  }

  function startEdit(p) {
    setForm({ name: p.name, purchase: String(p.purchase), current: String(p.current), notes: p.notes || '' })
    setEditId(p.id)
    setShowForm(true)
  }

  function cancelForm() { setForm(EMPTY); setShowForm(false); setEditId(null) }

  function removeProperty(id) { setProperties(properties.filter(p => p.id !== id)) }

  function toggleHistory(id) {
    setExpandedHistory(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function updateHistory(propId, newHistory) {
    setProperties(properties.map(p => {
      if (p.id !== propId) return p
      const latestVal = newHistory.length > 0
        ? [...newHistory].sort((a, b) => b.date.localeCompare(a.date))[0].value
        : p.current
      return { ...p, currentHistory: newHistory, current: latestVal }
    }))
  }

  const getDisplayCurrent = p => latestHistoryValue(p.currentHistory, p.current)

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Immobilien</h2>
        <button onClick={() => showForm ? cancelForm() : setShowForm(true)} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          {showForm ? 'Abbrechen' : '+ Neu'}
        </button>
      </div>

      {properties.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Immobilien angelegt.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {properties.map(p => {
            const displayCurrent = getDisplayCurrent(p)
            const pnl = displayCurrent - p.purchase
            const pnlPct = p.purchase > 0 ? (pnl / p.purchase) * 100 : null
            const histOpen = expandedHistory.has(p.id)
            return (
              <div key={p.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{p.name}</span>
                  <button onClick={() => startEdit(p)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>✎</button>
                  <button onClick={() => removeProperty(p.id)} style={{ ...btnSm, background: 'none', color: '#dc2626' }}>✕</button>
                </div>
                {/* Detail */}
                <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                  <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Anschaffung</div>
                    <div style={{ fontWeight: 600 }}>{fmt(p.purchase)}</div>
                  </div>
                  <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Zeitwert</div>
                    <div style={{ fontWeight: 700 }}>{fmt(displayCurrent)}</div>
                    {p.currentHistory?.length > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{p.currentHistory.length} Einträge</div>}
                  </div>
                  <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Gewinn / Verlust</div>
                    <div style={{ fontWeight: 700, color: pnl >= 0 ? '#16a34a' : '#dc2626' }}>
                      {(pnl >= 0 ? '+' : '') + fmt(pnl)}
                      {pnlPct !== null && <span style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: 4 }}>({pnlPct >= 0 ? '+' : ''}{pnlPct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %)</span>}
                    </div>
                  </div>
                  {p.notes && <div style={{ padding: '0.4rem 0.75rem', flex: 1, color: 'var(--color-text-muted)' }}>{p.notes}</div>}
                  <div style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                    <button onClick={() => toggleHistory(p.id)} style={{ ...btnSm, background: histOpen ? 'var(--color-primary)' : '#e5e7eb', color: histOpen ? '#fff' : '#374151', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {histOpen ? '▾' : '▸'} Zeitwert-Verlauf
                    </button>
                  </div>
                </div>
                {histOpen && (
                  <ValueHistory
                    label="Zeitwert-Verlauf"
                    history={p.currentHistory || []}
                    onChange={h => updateHistory(p.id, h)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <form onSubmit={saveProperty} style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '1rem', marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-primary)' }}>{editId ? 'Immobilie bearbeiten' : 'Neue Immobilie'}</div>
          <div>
            <label style={labelStyle}>Name / Bezeichnung *</label>
            <input {...field('name')} placeholder="z. B. Einfamilienhaus München" required style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Anschaffungswert (€) *</label>
              <input type="number" {...field('purchase')} placeholder="z. B. 350000" step="0.01" min="0" required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Aktueller Zeitwert (€) *</label>
              <input type="number" {...field('current')} placeholder="z. B. 420000" step="0.01" min="0" required style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notizen</label>
            <textarea {...field('notes')} placeholder="Adresse, Besonderheiten…" rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" style={{ flex: 1 }}>{editId ? 'Änderungen speichern' : 'Immobilie hinzufügen'}</button>
            <button type="button" onClick={cancelForm} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer' }}>Abbrechen</button>
          </div>
        </form>
      )}
    </div>
  )
}
