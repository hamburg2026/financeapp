import { useState } from 'react'
import { fmt, fmtNum } from '../fmt'
import Modal from './Modal'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key)
    if (stored === null) {
      localStorage.setItem(key, JSON.stringify(initial))
      return initial
    }
    return JSON.parse(stored)
  })
  const set = (newVal) => { localStorage.setItem(key, JSON.stringify(newVal)); setValue(newVal) }
  return [value, set]
}

export const DEFAULT_SERVICE_TYPES = [
  { id: 1, name: 'Hemden bügeln', unit: 'Stück',   defaultPrice: 1.50 },
  { id: 2, name: 'Putzen',        unit: 'Stunden',  defaultPrice: 15.00 },
  { id: 3, name: 'Kochen',        unit: 'Stunden',  defaultPrice: 12.00 },
]

const UNIT_SUGGESTIONS = ['Stunden', 'Stück', 'Menge', 'Pauschal', 'kg', 'm²', 'Tag', 'Woche']

const lbl = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', display: 'block', fontWeight: 500 }
const btnS = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem' }
const row2 = { display: 'flex', gap: '0.75rem' }
const col  = { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }

function isoToGerman(iso) {
  if (!iso || iso.length < 10) return '–'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const EMPTY_ENTRY = { date: todayIso(), serviceTypeId: '', quantity: '', pricePerUnit: '', notes: '', status: 'offen' }
const EMPTY_TYPE  = { name: '', unit: 'Stück', defaultPrice: '' }

export default function ServiceCostCalculator() {
  const [serviceTypes, setServiceTypes] = useLocalStorage('serviceTypes', DEFAULT_SERVICE_TYPES)
  const [entries,      setEntries]      = useLocalStorage('serviceEntries', [])

  const [activeTab, setActiveTab] = useState('entries')
  const [modal,     setModal]     = useState(null)

  const [filterType,   setFilterType]   = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY)
  const [typeForm,  setTypeForm]  = useState(EMPTY_TYPE)

  function entryField(key) {
    return { value: entryForm[key], onChange: e => setEntryForm(f => ({ ...f, [key]: e.target.value })) }
  }
  function typeField(key) {
    return { value: typeForm[key], onChange: e => setTypeForm(f => ({ ...f, [key]: e.target.value })) }
  }

  function handleEntryTypeChange(val) {
    const type = serviceTypes.find(t => String(t.id) === val)
    setEntryForm(f => ({ ...f, serviceTypeId: val, pricePerUnit: type ? String(type.defaultPrice) : f.pricePerUnit }))
  }

  const entryTotal = parseFloat(entryForm.quantity || 0) * parseFloat(entryForm.pricePerUnit || 0)

  const filteredEntries = entries
    .filter(e => {
      if (filterType   && String(e.serviceTypeId) !== filterType) return false
      if (filterFrom   && e.date < filterFrom) return false
      if (filterTo     && e.date > filterTo)   return false
      if (filterStatus && (e.status || 'offen') !== filterStatus) return false
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const totalSum = filteredEntries.reduce((s, e) => s + (e.total || 0), 0)

  const isEditingEntry = modal?.startsWith('editEntry:')
  const isEditingType  = modal?.startsWith('editType:')

  function openAddEntry()  { setEntryForm({ ...EMPTY_ENTRY, date: todayIso() }); setModal('addEntry') }
  function openEditEntry(e) {
    setEntryForm({ date: e.date, serviceTypeId: String(e.serviceTypeId), quantity: String(e.quantity), pricePerUnit: String(e.pricePerUnit), notes: e.notes || '', status: e.status || 'offen' })
    setModal(`editEntry:${e.id}`)
  }
  function saveEntry(ev) {
    ev.preventDefault()
    const quantity     = parseFloat(entryForm.quantity)
    const pricePerUnit = parseFloat(entryForm.pricePerUnit)
    const isNew        = modal === 'addEntry'
    const entry = { id: isNew ? Date.now() : parseInt(modal.split(':')[1]), date: entryForm.date, serviceTypeId: parseInt(entryForm.serviceTypeId), quantity, pricePerUnit, total: quantity * pricePerUnit, notes: entryForm.notes, status: entryForm.status || 'offen' }
    setEntries(isNew ? [...entries, entry] : entries.map(e => e.id === entry.id ? entry : e))
    setModal(null)
  }
  function deleteEntry(id) { setEntries(entries.filter(e => e.id !== id)) }

  function openAddType(fromEntry = false) {
    setTypeForm({ ...EMPTY_TYPE, _fromEntry: fromEntry })
    setModal('addType')
  }
  function openEditType(t) {
    setTypeForm({ name: t.name, unit: t.unit, defaultPrice: String(t.defaultPrice) })
    setModal(`editType:${t.id}`)
  }
  function saveType(ev) {
    ev.preventDefault()
    const isNew      = modal === 'addType'
    const fromEntry  = typeForm._fromEntry
    const type = { id: isNew ? Date.now() : parseInt(modal.split(':')[1]), name: typeForm.name, unit: typeForm.unit, defaultPrice: parseFloat(typeForm.defaultPrice) || 0 }
    const newTypes   = isNew ? [...serviceTypes, type] : serviceTypes.map(t => t.id === type.id ? type : t)
    setServiceTypes(newTypes)
    if (isNew && fromEntry) {
      setEntryForm(f => ({ ...f, serviceTypeId: String(type.id), pricePerUnit: String(type.defaultPrice) }))
      setModal('addEntry')
    } else {
      setModal(null)
    }
  }
  function deleteType(id) { setServiceTypes(serviceTypes.filter(t => t.id !== id)) }

  function getTypeName(typeId) { return serviceTypes.find(t => t.id === typeId)?.name || '–' }
  function getTypeUnit(typeId) { return serviceTypes.find(t => t.id === typeId)?.unit || '' }

  const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '0.45rem 0.75rem', verticalAlign: 'middle' }

  function StatusBadge({ status }) {
    const paid = (status || 'offen') === 'bezahlt'
    return (
      <span style={{ display: 'inline-block', padding: '0.1rem 0.45rem', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600, background: paid ? '#dcfce7' : '#fef3c7', color: paid ? '#16a34a' : '#d97706' }}>
        {paid ? 'bezahlt' : 'offen'}
      </span>
    )
  }

  const selectedUnit = entryForm.serviceTypeId ? getTypeUnit(parseInt(entryForm.serviceTypeId)) : ''

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Dienstleistungskosten</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'entries'
            ? <button onClick={openAddEntry}      style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Eintrag</button>
            : <button onClick={() => openAddType()} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Dienstleistung</button>
          }
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {[{ id: 'entries', label: '📋 Einträge' }, { id: 'types', label: '⚙️ Dienstleistungen verwalten' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '0.3rem 0.8rem', fontSize: '0.85rem', border: 'none', borderRadius: 6, cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--color-primary)' : '#e5e7eb',
            color: activeTab === tab.id ? '#fff' : '#374151',
            fontWeight: activeTab === tab.id ? 600 : 400,
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ── Entries tab ─────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <>
          {/* Filter row */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--color-bg)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
            <div>
              <label style={lbl}>Dienstleistung</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.28rem 0.5rem' }}>
                <option value="">Alle</option>
                {serviceTypes.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Von</label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.28rem 0.5rem' }} />
            </div>
            <div>
              <label style={lbl}>Bis</label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.28rem 0.5rem' }} />
            </div>
            <div>
              <label style={lbl}>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.28rem 0.5rem' }}>
                <option value="">Alle</option>
                <option value="offen">offen</option>
                <option value="bezahlt">bezahlt</option>
              </select>
            </div>
            {(filterType || filterFrom || filterTo || filterStatus) && (
              <button onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo(''); setFilterStatus('') }}
                style={{ ...btnS, background: '#fee2e2', color: '#dc2626', padding: '0.28rem 0.7rem' }}>
                Zurücksetzen
              </button>
            )}
          </div>

          {/* Summary */}
          {filteredEntries.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '0.35rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{filteredEntries.length} Einträge · Gesamt:</span>
              <span style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(totalSum)}</span>
            </div>
          )}

          {/* Table */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {filteredEntries.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', margin: 0, fontSize: '0.875rem' }}>
                {entries.length === 0 ? 'Noch keine Einträge. Klicken Sie auf "+ Eintrag" um zu beginnen.' : 'Keine Einträge für den gewählten Filter.'}
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                    <th style={thStyle}>Datum</th>
                    <th style={thStyle}>Art der Dienstleistung</th>
                    <th style={thStyle}>Einheit</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Menge</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Preis/Einheit</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Summe</th>
                    <th style={thStyle}>Notizen</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, width: 64 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom: i < filteredEntries.length - 1 ? '1px solid var(--color-border)' : 'none', background: i % 2 === 0 ? '#fff' : 'var(--color-bg)' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{isoToGerman(e.date)}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{getTypeName(e.serviceTypeId)}</td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{getTypeUnit(e.serviceTypeId)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(e.quantity, 2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(e.pricePerUnit)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(e.total)}</td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--color-text-muted)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '–'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}><StatusBadge status={e.status} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEditEntry(e)} style={{ ...btnS, background: '#e5e7eb', color: '#374151', marginRight: '0.2rem' }} title="Bearbeiten">✎</button>
                        <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer' }} title="Löschen">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                    <td colSpan={5} style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                      Gesamt ({filteredEntries.length} Einträge)
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(totalSum)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Service types tab ───────────────────────────────── */}
      {activeTab === 'types' && (
        <>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.83rem', color: 'var(--color-text-muted)' }}>
            Hier können Sie eigene Dienstleistungsarten mit Einheit und Standardpreis definieren.
            Diese stehen dann beim Erfassen von Einträgen zur Auswahl.
          </p>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {serviceTypes.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', margin: 0, fontSize: '0.875rem' }}>
                Noch keine Dienstleistungsarten definiert. Klicken Sie auf "+ Dienstleistung".
              </p>
            ) : serviceTypes.map((t, i) => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
                padding: '0.55rem 0.75rem',
                borderBottom: i < serviceTypes.length - 1 ? '1px solid var(--color-border)' : 'none',
                fontSize: '0.85rem',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Einheit: {t.unit}</div>
                </div>
                <span style={{ fontWeight: 600, flexShrink: 0, color: 'var(--color-primary)' }}>
                  {fmt(t.defaultPrice)} / {t.unit}
                </span>
                <button onClick={() => openEditType(t)} style={{ ...btnS, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
                <button onClick={() => deleteType(t.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer' }} title="Löschen">✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Entry Modal ─────────────────────────────────────── */}
      {(modal === 'addEntry' || isEditingEntry) && (
        <Modal title={isEditingEntry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} onClose={() => setModal(null)} maxWidth={520}>
          <form onSubmit={saveEntry} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

            {/* Row 1: Date + Service type */}
            <div style={row2}>
              <div style={col}>
                <label style={lbl}>Datum *</label>
                <input type="date" {...entryField('date')} required style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={col}>
                <label style={lbl}>Art der Dienstleistung *</label>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <select value={entryForm.serviceTypeId} onChange={e => handleEntryTypeChange(e.target.value)} required
                    style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
                    <option value="">– bitte wählen –</option>
                    {serviceTypes.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                  </select>
                  <button type="button" onClick={() => openAddType(true)} title="Neue Dienstleistungsart anlegen"
                    style={{ ...btnS, background: 'var(--color-primary)', color: '#fff', padding: '0.3rem 0.55rem', flexShrink: 0, fontSize: '0.9rem' }}>
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Row 2: Quantity + Price */}
            <div style={row2}>
              <div style={col}>
                <label style={lbl}>Menge{selectedUnit ? ` (${selectedUnit})` : ''} *</label>
                <input type="number" {...entryField('quantity')} placeholder="1" step="0.01" min="0" required
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div style={col}>
                <label style={lbl}>Preis je Einheit (€) *</label>
                <input type="number" {...entryField('pricePerUnit')} placeholder="0,00" step="0.01" min="0" required
                  style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Calculated sum */}
            <div style={{ background: 'var(--color-bg)', borderRadius: 6, padding: '0.5rem 0.85rem', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Berechnete Summe:</span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-primary)' }}>{fmt(entryTotal)}</span>
            </div>

            {/* Row 3: Status + Notes */}
            <div style={row2}>
              <div style={{ ...col, flex: '0 0 auto' }}>
                <label style={lbl}>Status *</label>
                <select {...entryField('status')} style={{ width: '100%', boxSizing: 'border-box' }}>
                  <option value="offen">offen</option>
                  <option value="bezahlt">bezahlt</option>
                </select>
              </div>
              <div style={col}>
                <label style={lbl}>Notizen</label>
                <input {...entryField('notes')} placeholder="Optionale Notizen..." style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" style={{ flex: 1 }}>{isEditingEntry ? 'Änderungen speichern' : 'Eintrag hinzufügen'}</button>
              <button type="button" onClick={() => setModal(null)} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Service type Modal ──────────────────────────────── */}
      {(modal === 'addType' || isEditingType) && (
        <Modal title={isEditingType ? 'Dienstleistung bearbeiten' : 'Neue Dienstleistungsart'} onClose={() => setModal(null)} maxWidth={420}>
          <form onSubmit={saveType} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={lbl}>Bezeichnung *</label>
              <input {...typeField('name')} placeholder="z. B. Fenster putzen" required style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={row2}>
              <div style={col}>
                <label style={lbl}>Einheit *</label>
                <input list="unit-opts" {...typeField('unit')} placeholder="z. B. Stück" required style={{ width: '100%', boxSizing: 'border-box' }} />
                <datalist id="unit-opts">
                  {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div style={col}>
                <label style={lbl}>Standardpreis (€)</label>
                <input type="number" {...typeField('defaultPrice')} placeholder="0,00" step="0.01" min="0" style={{ width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            {modal === 'addType' && typeForm._fromEntry && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                Nach dem Speichern wird die neue Art automatisch im Eintrag ausgewählt.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" style={{ flex: 1 }}>{isEditingType ? 'Änderungen speichern' : 'Dienstleistung anlegen'}</button>
              <button type="button" onClick={() => setModal(null)} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
