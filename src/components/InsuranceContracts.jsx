import { useState } from 'react'
import { fmt } from '../fmt'
import CategorySelect from './CategorySelect'
import Modal from './Modal'

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

// ─── Value history ─────────────────────────────────────────────────────────────

function latestHistoryValue(history, fallback) {
  if (!history?.length) return fallback
  return [...history].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

function latestHistoryEntry(history) {
  if (!history?.length) return null
  return [...history].sort((a, b) => b.date.localeCompare(a.date))[0]
}

// Verrentungstyp helpers (backward compat with old nurVerrentung boolean)
function isNurVerrentung(c)  { return c.verrentungTyp === 'nurVerrentung' || (!!c.nurVerrentung && !c.verrentungTyp) }
function isAnnuity(c)        { return c.verrentungTyp === 'verrentung' || isNurVerrentung(c) }
function isNichtRelevant(c)  { return c.verrentungTyp === 'nichtRelevant' }

const PERSON_COLOR_PALETTE = [
  { border: '#f43f5e', badgeBg: '#ffe4e6', badgeColor: '#be123c' },
  { border: '#3b82f6', badgeBg: '#dbeafe', badgeColor: '#1d4ed8' },
  { border: '#16a34a', badgeBg: '#dcfce7', badgeColor: '#15803d' },
  { border: '#d97706', badgeBg: '#fef3c7', badgeColor: '#b45309' },
  { border: '#7c3aed', badgeBg: '#ede9fe', badgeColor: '#6d28d9' },
  { border: '#0891b2', badgeBg: '#cffafe', badgeColor: '#0369a1' },
]

function ValueHistory({ history = [], onChange, annuity = false }) {
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState(todayIso())
  const [newVal, setNewVal] = useState('')
  const [newMult, setNewMult] = useState('')
  const [newGar, setNewGar] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editDate, setEditDate] = useState('')
  const [editVal, setEditVal] = useState('')
  const [editMult, setEditMult] = useState('')
  const [editGar, setEditGar] = useState('')

  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))

  function add() {
    if (!newDate || newVal === '') return
    const entry = { id: Date.now(), date: newDate, value: parseFloat(newVal) }
    if (annuity) {
      if (newMult !== '') entry.multiplikator = parseFloat(newMult)
      if (newGar !== '') entry.garantierteJaehrlicheRente = parseFloat(newGar)
    }
    onChange([...history, entry])
    setNewVal(''); setNewMult(''); setNewGar('')
    setAdding(false)
  }

  function startEdit(e) {
    setEditingId(e.id)
    setEditDate(e.date)
    setEditVal(String(e.value))
    setEditMult(e.multiplikator != null ? String(e.multiplikator) : '')
    setEditGar(e.garantierteJaehrlicheRente != null ? String(e.garantierteJaehrlicheRente) : '')
  }

  function saveEdit(id) {
    if (!editDate || editVal === '') return
    onChange(history.map(e => {
      if (e.id !== id) return e
      const updated = { ...e, date: editDate, value: parseFloat(editVal) }
      if (annuity) {
        if (editMult !== '') updated.multiplikator = parseFloat(editMult); else delete updated.multiplikator
        if (editGar !== '') updated.garantierteJaehrlicheRente = parseFloat(editGar); else delete updated.garantierteJaehrlicheRente
      }
      return updated
    }))
    setEditingId(null)
  }

  function remove(id) { onChange(history.filter(e => e.id !== id)) }

  const btn = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem' }
  const inpSt = { fontSize: '0.8rem', padding: '0.25rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 4 }

  function calcRente(val, mult, gar) {
    if (!mult || !gar) return null
    return (val / mult) * gar
  }

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: '0.5rem 0.75rem', background: 'var(--color-bg)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {annuity ? 'Zeitwerte je Stichtag' : 'Werthistorie'}
      </div>
      {sorted.length === 0 && !adding && (
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
          Noch keine Einträge
        </div>
      )}
      {sorted.map((e, i) => {
        const jaehrl = annuity ? calcRente(e.value, e.multiplikator, e.garantierteJaehrlicheRente) : null
        const monatl = jaehrl != null ? jaehrl / 12 : null
        const isEditing = editingId === e.id
        return (
          <div key={e.id} style={{
            padding: '0.3rem 0',
            borderBottom: i < sorted.length - 1 ? '1px solid var(--color-border)' : 'none',
            fontSize: '0.82rem',
          }}>
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <DateInput value={editDate} onChange={setEditDate} />
                  <input type="number" value={editVal} onChange={ev => setEditVal(ev.target.value)}
                    placeholder="Wert (€)" step="0.01" style={{ ...inpSt, width: 110 }} />
                  {annuity && <>
                    <input type="number" value={editMult} onChange={ev => setEditMult(ev.target.value)}
                      placeholder="Multiplikator" step="0.01" min="0" style={{ ...inpSt, width: 110 }} />
                    <input type="number" value={editGar} onChange={ev => setEditGar(ev.target.value)}
                      placeholder="Gar. jährl. Rente (€)" step="0.01" min="0" style={{ ...inpSt, width: 150 }} />
                  </>}
                  <button onClick={() => saveEdit(e.id)}
                    style={{ ...btn, background: 'var(--color-primary)', color: '#fff', padding: '0.25rem 0.5rem' }}>✓</button>
                  <button onClick={() => setEditingId(null)}
                    style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.25rem 0.5rem' }}>✕</button>
                </div>
                {annuity && editMult !== '' && editGar !== '' && parseFloat(editMult) > 0 && editVal !== '' && (() => {
                  const r = calcRente(parseFloat(editVal), parseFloat(editMult), parseFloat(editGar))
                  return r != null ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                      Jährl.: <strong>{fmt(r)}</strong> / Monatl.: <strong>{fmt(r / 12)}</strong>
                    </div>
                  ) : null
                })()}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--color-text-muted)', minWidth: 90, fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.date}</span>
                  <span style={{ fontWeight: 700, flex: 1 }}>{fmt(e.value)}</span>
                  {annuity && e.multiplikator != null && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      Mult.: {e.multiplikator.toLocaleString('de-DE')}
                    </span>
                  )}
                  {annuity && e.garantierteJaehrlicheRente != null && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      Gar.: {fmt(e.garantierteJaehrlicheRente)}
                    </span>
                  )}
                  {i === 0 && <span style={{ fontSize: '0.65rem', background: '#dcfce7', color: '#16a34a', borderRadius: 4, padding: '0.05rem 0.3rem', fontWeight: 600 }}>aktuell</span>}
                  <button onClick={() => startEdit(e)}
                    style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.1rem 0.3rem' }}>✎</button>
                  <button onClick={() => remove(e.id)}
                    style={{ ...btn, background: 'none', color: '#dc2626', padding: '0.1rem 0.3rem' }}>✕</button>
                </div>
                {annuity && jaehrl != null && (
                  <div style={{ display: 'flex', gap: '1.2rem', marginTop: '0.2rem', paddingLeft: 94, fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      Jährl. Rente: <strong style={{ color: 'var(--color-text)' }}>{fmt(jaehrl)}</strong>
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      Monatl. Rente: <strong style={{ color: 'var(--color-text)' }}>{fmt(monatl)}</strong>
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      {adding ? (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <DateInput value={newDate} onChange={setNewDate} />
            <input type="number" value={newVal} onChange={e => setNewVal(e.target.value)}
              placeholder="Wert (€)" step="0.01" min="0"
              style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', width: 110, border: '1px solid var(--color-border)', borderRadius: 5 }} />
            {annuity && <>
              <input type="number" value={newMult} onChange={e => setNewMult(e.target.value)}
                placeholder="Multiplikator" step="0.01" min="0"
                style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', width: 110, border: '1px solid var(--color-border)', borderRadius: 5 }} />
              <input type="number" value={newGar} onChange={e => setNewGar(e.target.value)}
                placeholder="Gar. jährl. Rente (€)" step="0.01" min="0"
                style={{ fontSize: '0.83rem', padding: '0.33rem 0.5rem', width: 150, border: '1px solid var(--color-border)', borderRadius: 5 }} />
            </>}
            <button onClick={add} style={{ ...btn, background: 'var(--color-primary)', color: '#fff', padding: '0.3rem 0.6rem' }}>Speichern</button>
            <button onClick={() => setAdding(false)} style={{ ...btn, background: '#e5e7eb', color: '#374151', padding: '0.3rem 0.6rem' }}>Abbrechen</button>
          </div>
          {annuity && newMult !== '' && newGar !== '' && parseFloat(newMult) > 0 && newVal !== '' && (() => {
            const r = calcRente(parseFloat(newVal), parseFloat(newMult), parseFloat(newGar))
            return r != null ? (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', paddingLeft: 4 }}>
                Jährl.: <strong>{fmt(r)}</strong> / Monatl.: <strong>{fmt(r / 12)}</strong>
              </div>
            ) : null
          })()}
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
  name: '', provider: '', vertragsnummer: '', categoryId: '', value: '', premium: '', premiumFrequency: 'monthly',
  start: '', end: '', notes: '', comment: '', active: true,
  renteNachTodesfall: false, verrentungTyp: '', person: '',
  annuityDate: '', multiplikator: '', garantierteJaehrlicheRente: '',
}

export default function InsuranceContracts() {
  const [contracts, setContracts] = useLocalStorage('insuranceContracts', [])
  const [allCategories] = useLocalStorage('categories', [])
  const expenseCategories = allCategories.filter(c => c.type === 'Ausgabe')
  const [persons, setPersons] = useLocalStorage('insurancePersons', ['Karin', 'Jürgen'])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, annuityDate: todayIso() }))
  const [editId, setEditId] = useState(null)
  const [expandedHistory, setExpandedHistory] = useState(new Set())
  const [expandedContracts, setExpandedContracts] = useState(new Set())
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newPersonInput, setNewPersonInput] = useState('')

  const [filterPerson, setFilterPerson] = useState('')
  const [filterProvider, setFilterProvider] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [groupBy, setGroupBy] = useState('none')

  function getPersonColor(personName) {
    const idx = persons.indexOf(personName)
    if (idx < 0) return null
    return PERSON_COLOR_PALETTE[idx % PERSON_COLOR_PALETTE.length]
  }

  function field(key) {
    return { value: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) }
  }
  function check(key) {
    return { checked: form[key], onChange: e => setForm(f => ({ ...f, [key]: e.target.checked })) }
  }

  function saveContract(e) {
    e.preventDefault()
    const existing = contracts.find(c => c.id === editId)
    let valueHistory = existing?.valueHistory || []

    if (form.verrentungTyp && form.value !== '' && form.annuityDate) {
      const wert = parseFloat(form.value)
      const entry = { id: Date.now(), date: form.annuityDate, value: wert }
      if (form.multiplikator !== '') entry.multiplikator = parseFloat(form.multiplikator)
      if (form.garantierteJaehrlicheRente !== '') entry.garantierteJaehrlicheRente = parseFloat(form.garantierteJaehrlicheRente)
      const idx = valueHistory.findIndex(en => en.date === form.annuityDate)
      valueHistory = idx >= 0
        ? valueHistory.map((en, i) => i === idx ? { ...en, value: wert, multiplikator: entry.multiplikator, garantierteJaehrlicheRente: entry.garantierteJaehrlicheRente } : en)
        : [...valueHistory, entry]
    }

    const contract = {
      id:                  editId || Date.now(),
      name:                form.name,
      provider:            form.provider,
      vertragsnummer:      form.vertragsnummer,
      categoryId:          form.categoryId ? parseInt(form.categoryId) : null,
      value:               form.value !== '' ? parseFloat(form.value) : null,
      premium:             form.premium !== '' ? parseFloat(form.premium) : 0,
      premiumFrequency:    form.premiumFrequency,
      start:               form.start,
      end:                 form.end,
      notes:               form.notes,
      comment:             form.comment,
      active:              form.active,
      renteNachTodesfall:  form.renteNachTodesfall,
      verrentungTyp:       form.verrentungTyp,
      nurVerrentung:       form.verrentungTyp === 'nurVerrentung', // backward compat
      person:              form.person,
      valueHistory,
    }
    const updated = editId
      ? contracts.map(c => c.id === editId ? contract : c)
      : [...contracts, contract]
    setContracts(updated)
    syncRecurringPayment(contract)
    setForm({ ...EMPTY_FORM, annuityDate: todayIso() })
    setShowForm(false)
    setEditId(null)
  }

  function startEdit(c) {
    const annuity = isAnnuity(c)
    const latestE = annuity ? latestHistoryEntry(c.valueHistory) : null
    setForm({
      name:                c.name || '',
      provider:            c.provider || '',
      vertragsnummer:      c.vertragsnummer || '',
      categoryId:          c.categoryId ? String(c.categoryId) : '',
      value:               latestE ? String(latestE.value) : (c.value != null ? String(c.value) : ''),
      premium:             c.premium ? String(c.premium) : '',
      premiumFrequency:    c.premiumFrequency || 'monthly',
      start:               c.start || '',
      end:                 c.end || '',
      notes:               c.notes || '',
      comment:             c.comment || '',
      active:              c.active !== false,
      renteNachTodesfall:  c.renteNachTodesfall || false,
      verrentungTyp:       c.verrentungTyp || (c.nurVerrentung ? 'nurVerrentung' : ''),
      person:              c.person || '',
      annuityDate:                latestE?.date || todayIso(),
      multiplikator:              latestE?.multiplikator != null ? String(latestE.multiplikator) : '',
      garantierteJaehrlicheRente: latestE?.garantierteJaehrlicheRente != null ? String(latestE.garantierteJaehrlicheRente) : '',
    })
    setEditId(c.id)
    setShowForm(true)
  }

  function cancelForm() {
    setForm({ ...EMPTY_FORM, annuityDate: todayIso() })
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

  function toggleContract(id) {
    setExpandedContracts(prev => {
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

  // Derived filter/group data
  const providers = [...new Set(contracts.map(c => c.provider).filter(Boolean))].sort()
  const filtered = contracts.filter(c => {
    if (filterPerson && c.person !== filterPerson) return false
    if (filterProvider && c.provider !== filterProvider) return false
    if (filterCategory && String(c.categoryId) !== filterCategory) return false
    return true
  })
  const hasActiveFilter = !!(filterPerson || filterProvider || filterCategory)

  function getGroups(list) {
    if (groupBy === 'none') return [{ label: null, items: list }]
    const map = new Map()
    list.forEach(c => {
      let key
      if (groupBy === 'person') key = c.person || '(Keine Person)'
      else if (groupBy === 'provider') key = c.provider || '(Kein Anbieter)'
      else if (groupBy === 'category') {
        const cat = allCategories.find(x => x.id === c.categoryId)
        key = cat ? cat.name : '(Keine Kategorie)'
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    })
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de')).map(([label, items]) => ({ label, items }))
  }

  // "Nur Verrentung" and "Nicht relevant" not counted as asset
  const totalValue = contracts
    .filter(c => !isNurVerrentung(c) && !isNichtRelevant(c))
    .reduce((s, c) => s + (getDisplayValue(c) || 0), 0)

  const inputStyle = { fontSize: '0.85rem', padding: '0.35rem 0.5rem' }
  const labelStyle = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem', display: 'block' }

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Versicherungsverträge</h2>
        <button onClick={() => setShowForm(true)} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>
          + Neu
        </button>
      </div>

      {showForm && (
        <Modal title={editId ? 'Vertrag bearbeiten' : 'Neuer Vertrag'} onClose={cancelForm} maxWidth={680}>
          <form onSubmit={saveContract} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Vertragsname *</label>
              <input {...field('name')} placeholder="z. B. Haftpflicht" required style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Anbieter</label>
              <input {...field('provider')} placeholder="z. B. Allianz" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Vertragsnummer</label>
              <input {...field('vertragsnummer')} placeholder="z. B. VN-123456" style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Kategorie</label>
              <CategorySelect {...field('categoryId')} categories={expenseCategories} placeholder="– keine –" style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <label style={{ ...labelStyle, marginBottom: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" {...check('active')} />
                <span>Aktiv (erzeugt Dauerauftrag)</span>
              </label>
            </div>
          </div>

          {/* Person + flags */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <div>
              <label style={labelStyle}>Person</label>
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <select value={form.person} onChange={e => setForm(f => ({ ...f, person: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">– keine –</option>
                  {persons.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <button type="button" onClick={() => setShowAddPerson(v => !v)} title="Person hinzufügen"
                  style={{ padding: '0.35rem 0.55rem', fontSize: '0.85rem', border: '1px solid var(--color-border)', borderRadius: 5, cursor: 'pointer', background: showAddPerson ? 'var(--color-primary)' : 'var(--color-surface)', color: showAddPerson ? '#fff' : 'inherit', lineHeight: 1 }}>+</button>
              </div>
              {showAddPerson && (
                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.35rem' }}>
                  <input type="text" value={newPersonInput} onChange={e => setNewPersonInput(e.target.value)}
                    placeholder="Neuer Name…" style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newPersonInput.trim() && !persons.includes(newPersonInput.trim())) { const n = newPersonInput.trim(); setPersons([...persons, n]); setForm(f => ({ ...f, person: n })) } setNewPersonInput(''); setShowAddPerson(false) }}} />
                  <button type="button" onClick={() => { if (newPersonInput.trim() && !persons.includes(newPersonInput.trim())) { const n = newPersonInput.trim(); setPersons([...persons, n]); setForm(f => ({ ...f, person: n })) } setNewPersonInput(''); setShowAddPerson(false) }}
                    style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem', border: 'none', borderRadius: 5, cursor: 'pointer', background: 'var(--color-primary)', color: '#fff' }}>OK</button>
                  <button type="button" onClick={() => { setNewPersonInput(''); setShowAddPerson(false) }}
                    style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem', border: '1px solid var(--color-border)', borderRadius: 5, cursor: 'pointer' }}>✕</button>
                </div>
              )}
            </div>
            <div>
              <label style={labelStyle}>Verrentung / Relevanz</label>
              <select value={form.verrentungTyp} onChange={e => setForm(f => ({ ...f, verrentungTyp: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                <option value="">– keine –</option>
                <option value="verrentung">Verrentung (Vermögenswert)</option>
                <option value="nurVerrentung">Nur Verrentung (kein Vermögenswert)</option>
                <option value="nichtRelevant">Nicht relevant (kein Vermögenswert)</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <input type="checkbox" {...check('renteNachTodesfall')} />
              <span>Rente nach Todesfall</span>
            </label>
          </div>

          {form.verrentungTyp && form.verrentungTyp !== 'nichtRelevant' ? (
            <div style={{ border: '1px solid #c4b5fd', borderRadius: 6, padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#faf5ff' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Verrentungswert je Stichtag
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div>
                  <label style={labelStyle}>Stichtag</label>
                  <DateInput value={form.annuityDate} onChange={v => setForm(f => ({ ...f, annuityDate: v }))} />
                </div>
                <div>
                  <label style={labelStyle}>Wert (€)</label>
                  <input type="number" {...field('value')} placeholder="z. B. 50000" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={labelStyle}>Multiplikator</label>
                  <input type="number" {...field('multiplikator')} placeholder="z. B. 20" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={labelStyle}>Garantierte jährliche Rente (€)</label>
                  <input type="number" {...field('garantierteJaehrlicheRente')} placeholder="z. B. 3000" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
                </div>
              </div>
              {form.value !== '' && form.multiplikator !== '' && form.garantierteJaehrlicheRente !== '' && parseFloat(form.multiplikator) > 0 && (() => {
                const jaehrl = (parseFloat(form.value) / parseFloat(form.multiplikator)) * parseFloat(form.garantierteJaehrlicheRente)
                return (
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem', padding: '0.35rem 0.5rem', background: '#ede9fe', borderRadius: 5 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      Jährliche Rente: <strong style={{ color: '#7c3aed' }}>{fmt(jaehrl)}</strong>
                    </span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      Monatliche Rente: <strong style={{ color: '#7c3aed' }}>{fmt(jaehrl / 12)}</strong>
                    </span>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={labelStyle}>Aktueller Wert (€) – optional</label>
                <input type="number" {...field('value')} placeholder="z. B. 5000" step="0.01" min="0" style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>
          )}

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

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button type="submit" style={{ flex: 1 }}>
              {editId ? 'Änderungen speichern' : 'Vertrag hinzufügen'}
            </button>
            <button type="button" onClick={cancelForm} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>
              Abbrechen
            </button>
          </div>
          </form>
        </Modal>
      )}

      {/* ── Filter- und Gruppierungsleiste ── */}
      {contracts.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
          <select value={filterPerson} onChange={e => setFilterPerson(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.22rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5 }}>
            <option value="">Alle Personen</option>
            {persons.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.22rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5 }}>
            <option value="">Alle Anbieter</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <CategorySelect value={filterCategory} onChange={e => setFilterCategory(e.target.value)} categories={expenseCategories} placeholder="Alle Kategorien" style={{ fontSize: '0.78rem', padding: '0.22rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5 }} />
          {hasActiveFilter && (
            <button onClick={() => { setFilterPerson(''); setFilterProvider(''); setFilterCategory('') }}
              style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', background: 'none', border: '1px solid var(--color-border)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              ✕ Filter
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>Gruppieren:</span>
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.22rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5 }}>
            <option value="none">– keine –</option>
            <option value="person">Person</option>
            <option value="provider">Anbieter</option>
            <option value="category">Kategorie</option>
          </select>
        </div>
      )}

      {contracts.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Noch keine Versicherungsverträge angelegt.
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1rem 0', margin: 0 }}>
          Keine Verträge entsprechen dem Filter.
        </p>
      ) : (
        <>
          {getGroups(filtered).map(({ label, items }) => (
            <div key={label ?? '__all'} style={{ marginBottom: groupBy !== 'none' ? '1rem' : 0 }}>
              {label !== null && (
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0.25rem 0.5rem', background: 'var(--color-bg)', borderRadius: 5, marginBottom: '0.4rem', borderLeft: '3px solid var(--color-border)' }}>
                  {label}
                </div>
              )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {items.map(c => {
              const displayVal = getDisplayValue(c)
              const histOpen = expandedHistory.has(c.id)
              const contractOpen = expandedContracts.has(c.id)
              const latestEntry = latestHistoryEntry(c.valueHistory)
              const annuity = isAnnuity(c)
              const nurV    = isNurVerrentung(c)
              const jaehrlicheRente = annuity && latestEntry?.multiplikator && latestEntry?.garantierteJaehrlicheRente
                ? (latestEntry.value / latestEntry.multiplikator) * latestEntry.garantierteJaehrlicheRente
                : null
              const monatlicheRente = jaehrlicheRente != null ? jaehrlicheRente / 12 : null
              const personColor = getPersonColor(c.person)
              return (
                <div key={c.id} style={{
                  border: '1px solid var(--color-border)', borderRadius: 8,
                  overflow: 'hidden', opacity: c.active === false ? 0.6 : 1,
                  borderLeft: personColor ? `3px solid ${personColor.border}` : undefined,
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
                    {c.person && personColor && (
                      <span style={{ fontSize: '0.68rem', background: personColor.badgeBg, color: personColor.badgeColor, borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>
                        {c.person}
                      </span>
                    )}
                    {annuity && (
                      <span style={{ fontSize: '0.68rem', color: '#7c3aed', background: '#ede9fe', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>
                        {nurV ? 'Nur Verrentung' : 'Verrentung'}
                      </span>
                    )}
                    {isNichtRelevant(c) && (
                      <span style={{ fontSize: '0.68rem', color: '#6b7280', background: '#f3f4f6', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>
                        Nicht relevant
                      </span>
                    )}
                    {c.renteNachTodesfall && (
                      <span style={{ fontSize: '0.68rem', color: '#b45309', background: '#fef3c7', borderRadius: 4, padding: '0.1rem 0.4rem', fontWeight: 600 }}>
                        Rente nach Todesfall
                      </span>
                    )}
                    {c.categoryId && (() => {
                      const cat = allCategories.find(x => x.id === c.categoryId)
                      return cat ? <span style={{ fontSize: '0.72rem', color: '#0369a1', background: '#e0f2fe', borderRadius: 4, padding: '0.1rem 0.4rem' }}>{cat.name}</span> : null
                    })()}
                    <button onClick={() => toggleContract(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>{contractOpen ? '▾' : '▸'}</button>
                    <button onClick={() => startEdit(c)} style={{ background: '#e5e7eb', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem', color: '#374151' }}>✎</button>
                    <button onClick={() => removeContract(c.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer' }}>✕</button>
                  </div>

                  {/* Summary row – always visible: Vertragsnr., Wert, Beitrag, Laufzeit */}
                  <div style={{ display: 'flex', fontSize: '0.8rem', alignItems: 'stretch', overflow: 'hidden' }}>
                    {/* Vertragsnummer */}
                    <div style={{ width: 140, minWidth: 140, padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Vertragsnr.</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.vertragsnummer || '–'}</div>
                    </div>
                    {/* Wert */}
                    <div style={{ width: 110, minWidth: 110, padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>{nurV ? 'Zeitwert' : 'Wert'}</div>
                      <div style={{ fontWeight: 600 }}>{displayVal != null ? fmt(displayVal) : '–'}</div>
                      {c.valueHistory?.length > 0 && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{c.valueHistory.length} Einträge</div>
                      )}
                    </div>
                    {/* Beitrag */}
                    <div style={{ width: 120, minWidth: 120, padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Beitrag</div>
                      {c.premium > 0 ? (
                        <div style={{ fontWeight: 600, color: '#dc2626' }}>
                          {fmt(c.premium)}
                          <span style={{ fontSize: '0.68rem', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.25rem' }}>{FREQ_SHORT[c.premiumFrequency || 'monthly']}</span>
                          {c.active !== false && (
                            <span style={{ fontSize: '0.65rem', marginLeft: '0.3rem', color: '#16a34a' }}>✓ DA</span>
                          )}
                        </div>
                      ) : <div style={{ color: 'var(--color-text-muted)' }}>–</div>}
                    </div>
                    {/* Laufzeit */}
                    <div style={{ flex: 1, padding: '0.4rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Laufzeit</div>
                      <div style={{ whiteSpace: 'nowrap' }}>
                        {(c.start || c.end) ? `${isoToGerman(c.start) || '–'} → ${isoToGerman(c.end) || '∞'}` : '–'}
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {contractOpen && (
                    <div>
                      {/* Details row: Anbieter, Notizen, Kommentar, Werthistorie */}
                      <div style={{ display: 'flex', fontSize: '0.8rem', alignItems: 'stretch', overflow: 'hidden', borderTop: '1px solid var(--color-border)' }}>
                        {/* Anbieter */}
                        <div style={{ width: 160, minWidth: 160, padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Anbieter</div>
                          <div style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.provider || '–'}</div>
                        </div>
                        {/* Notizen */}
                        <div style={{ flex: 1, minWidth: 80, padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Notizen</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.notes || '–'}</div>
                        </div>
                        {/* Kommentar */}
                        <div style={{ flex: 1, minWidth: 80, padding: '0.4rem 0.75rem', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Kommentar</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.comment || '–'}</div>
                        </div>
                        {/* Werthistorie toggle */}
                        <div style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center' }}>
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
                            {histOpen ? '▾' : '▸'} {annuity ? 'Zeitwerte' : 'Werthistorie'}
                          </button>
                        </div>
                      </div>

                      {/* Value history */}
                      {histOpen && (
                        <ValueHistory
                          history={c.valueHistory || []}
                          onChange={h => updateHistory(c.id, h)}
                          annuity={annuity}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
            </div>
          ))}

          {filtered.filter(c => !isNurVerrentung(c) && !isNichtRelevant(c)).length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0.4rem 0.75rem', background: 'var(--color-bg)', borderRadius: 6, fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{hasActiveFilter ? 'Gesamt Wert (gefiltert)' : 'Gesamt Wert'}</span>
              <span style={{ fontWeight: 700 }}>{fmt(filtered.filter(c => !isNurVerrentung(c) && !isNichtRelevant(c)).reduce((s, c) => s + (getDisplayValue(c) || 0), 0))}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
