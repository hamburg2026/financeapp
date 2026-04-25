import { useState } from 'react'
import { fmt, fmtNum } from '../fmt'
import Modal from './Modal'
import { useDragSort, DragHandle } from '../useDragSort'

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

function ValueHistory({ history = [], onChange }) {
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
        Werthistorie
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
            style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', width: 110, border: '1px solid var(--color-border)', borderRadius: 5 }} />
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

const EMPTY = { company: '', percentage: '', value: '', notes: '' }
const inputStyle = { fontSize: '0.85rem', padding: '0.35rem 0.5rem' }
const labelStyle = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'block' }

export default function CompanyShares() {
  const [shares, setShares] = useLocalStorage('companyShares', [])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(new Set())

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }

  function saveShare(e) {
    e.preventDefault()
    const existing = shares.find(s => s.id === editId)
    const share = {
      id:         editId || Date.now(),
      company:    form.company,
      percentage: parseFloat(form.percentage),
      value:      parseFloat(form.value),
      notes:      form.notes,
      valueHistory: existing?.valueHistory || [],
    }
    setShares(editId ? shares.map(s => s.id === editId ? share : s) : [...shares, share])
    setForm(EMPTY)
    setShowForm(false)
    setEditId(null)
  }

  function startEdit(s) {
    setForm({ company: s.company, percentage: String(s.percentage), value: String(s.value), notes: s.notes || '' })
    setEditId(s.id)
    setShowForm(true)
  }

  function cancelForm() { setForm(EMPTY); setShowForm(false); setEditId(null) }

  function removeShare(id) { setShares(shares.filter(s => s.id !== id)) }

  function toggleHistory(id) {
    setExpandedHistory(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  function updateHistory(shareId, newHistory) {
    setShares(shares.map(s => {
      if (s.id !== shareId) return s
      const latestVal = newHistory.length > 0
        ? [...newHistory].sort((a, b) => b.date.localeCompare(a.date))[0].value
        : s.value
      return { ...s, valueHistory: newHistory, value: latestVal }
    }))
  }

  const getDisplayValue = s => latestHistoryValue(s.valueHistory, s.value)
  const total = shares.reduce((sum, s) => sum + (getDisplayValue(s) || 0), 0)
  const { dragProps, isDragOver } = useDragSort(shares, setShares)

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Firmenbeteiligungen</h2>
        <button onClick={() => setShowForm(true)} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          + Neu
        </button>
      </div>

      {shares.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Firmenbeteiligungen angelegt.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {shares.map((s, i) => {
              const displayVal = getDisplayValue(s)
              const histOpen = expandedHistory.has(s.id)
              return (
                <div key={s.id} {...dragProps(i)} style={{ border: isDragOver(i) ? '2px solid var(--color-primary)' : '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                    <DragHandle />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{s.company}</span>
                    <span style={{ fontSize: '0.78rem', background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>
                      {fmtNum(s.percentage)} %
                    </span>
                    <button onClick={() => startEdit(s)} style={{ ...btnSm, background: '#e5e7eb', color: '#374151' }}>✎</button>
                    <button onClick={() => removeShare(s.id)} style={{ ...btnSm, background: 'none', color: '#dc2626' }}>✕</button>
                  </div>
                  {/* Detail */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    <div style={{ padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Wert</div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmt(displayVal)}</div>
                      {s.valueHistory?.length > 0 && <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{s.valueHistory.length} Einträge</div>}
                    </div>
                    {s.notes && (
                      <div style={{ padding: '0.4rem 0.75rem', flex: 1, color: 'var(--color-text-muted)' }}>{s.notes}</div>
                    )}
                    <div style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                      <button onClick={() => toggleHistory(s.id)} style={{ ...btnSm, background: histOpen ? 'var(--color-primary)' : '#e5e7eb', color: histOpen ? '#fff' : '#374151', padding: '0.2rem 0.55rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {histOpen ? '▾' : '▸'} Werthistorie
                      </button>
                    </div>
                  </div>
                  {histOpen && <ValueHistory history={s.valueHistory || []} onChange={h => updateHistory(s.id, h)} />}
                </div>
              )
            })}
          </div>
          {shares.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0.4rem 0.75rem', background: 'var(--color-bg)', borderRadius: 6, fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Gesamt</span>
              <span style={{ fontWeight: 700 }}>{fmt(total)}</span>
            </div>
          )}
        </>
      )}

      {showForm && (
        <Modal title={editId ? 'Beteiligung bearbeiten' : 'Neue Beteiligung'} onClose={cancelForm} maxWidth={520}>
          <form onSubmit={saveShare} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}>Firmenname *</label>
                <input {...field('company')} placeholder="z. B. Muster GmbH" required style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>Beteiligung (%)</label>
                <input type="number" {...field('percentage')} placeholder="z. B. 25" step="0.01" min="0" max="100" required style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Aktueller Wert (€)</label>
              <input type="number" {...field('value')} placeholder="z. B. 50000" step="0.01" min="0" required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Notizen</label>
              <textarea {...field('notes')} placeholder="Anmerkungen zur Beteiligung…" rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="submit" style={{ flex: 1 }}>{editId ? 'Änderungen speichern' : 'Beteiligung hinzufügen'}</button>
              <button type="button" onClick={cancelForm} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
