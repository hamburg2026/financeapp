import { useState } from 'react'
import { fmt, fmtNum } from '../fmt'
import Modal from './Modal'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => { localStorage.setItem(key, JSON.stringify(newVal)); setValue(newVal) }
  return [value, set]
}

const DEFAULT_TYPES = [
  { id: 1, name: 'Hemden bügeln', unit: 'Stück', defaultPrice: 1.50 },
  { id: 2, name: 'Putzen', unit: 'Stunden', defaultPrice: 15.00 },
  { id: 3, name: 'Kochen', unit: 'Stunden', defaultPrice: 12.00 },
]

const UNIT_SUGGESTIONS = ['Stunden', 'Stück', 'Menge', 'Pauschal', 'kg', 'm²', 'Tag', 'Woche']

const lbl = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', display: 'block', fontWeight: 500 }
const btnS = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.75rem', padding: '0.2rem 0.45rem' }

function isoToGerman(iso) {
  if (!iso || iso.length < 10) return '–'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const todayIso = () => new Date().toISOString().slice(0, 10)

const EMPTY_ENTRY = { date: todayIso(), serviceTypeId: '', quantity: '', pricePerUnit: '', notes: '' }
const EMPTY_TYPE = { name: '', unit: 'Stück', defaultPrice: '' }

export default function ServiceCostCalculator() {
  const [serviceTypes, setServiceTypes] = useLocalStorage('serviceTypes', DEFAULT_TYPES)
  const [entries, setEntries] = useLocalStorage('serviceEntries', [])

  const [activeTab, setActiveTab] = useState('entries')
  const [modal, setModal] = useState(null)

  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [entryForm, setEntryForm] = useState(EMPTY_ENTRY)
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE)

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
      if (filterType && String(e.serviceTypeId) !== filterType) return false
      if (filterFrom && e.date < filterFrom) return false
      if (filterTo && e.date > filterTo) return false
      return true
    })
    .sort((a, b) => b.date.localeCompare(a.date))

  const totalSum = filteredEntries.reduce((s, e) => s + (e.total || 0), 0)

  const isEditingEntry = modal?.startsWith('editEntry:')
  const isEditingType = modal?.startsWith('editType:')

  function openAddEntry() { setEntryForm({ ...EMPTY_ENTRY, date: todayIso() }); setModal('addEntry') }
  function openEditEntry(e) {
    setEntryForm({ date: e.date, serviceTypeId: String(e.serviceTypeId), quantity: String(e.quantity), pricePerUnit: String(e.pricePerUnit), notes: e.notes || '' })
    setModal(`editEntry:${e.id}`)
  }
  function saveEntry(ev) {
    ev.preventDefault()
    const quantity = parseFloat(entryForm.quantity)
    const pricePerUnit = parseFloat(entryForm.pricePerUnit)
    const isNew = modal === 'addEntry'
    const entry = {
      id: isNew ? Date.now() : parseInt(modal.split(':')[1]),
      date: entryForm.date,
      serviceTypeId: parseInt(entryForm.serviceTypeId),
      quantity, pricePerUnit,
      total: quantity * pricePerUnit,
      notes: entryForm.notes,
    }
    setEntries(isNew ? [...entries, entry] : entries.map(e => e.id === entry.id ? entry : e))
    setModal(null)
  }
  function deleteEntry(id) { setEntries(entries.filter(e => e.id !== id)) }

  function openAddType() { setTypeForm(EMPTY_TYPE); setModal('addType') }
  function openEditType(t) {
    setTypeForm({ name: t.name, unit: t.unit, defaultPrice: String(t.defaultPrice) })
    setModal(`editType:${t.id}`)
  }
  function saveType(ev) {
    ev.preventDefault()
    const isNew = modal === 'addType'
    const type = { id: isNew ? Date.now() : parseInt(modal.split(':')[1]), name: typeForm.name, unit: typeForm.unit, defaultPrice: parseFloat(typeForm.defaultPrice) || 0 }
    setServiceTypes(isNew ? [...serviceTypes, type] : serviceTypes.map(t => t.id === type.id ? type : t))
    setModal(null)
  }
  function deleteType(id) { setServiceTypes(serviceTypes.filter(t => t.id !== id)) }

  function getTypeName(typeId) { return serviceTypes.find(t => t.id === typeId)?.name || '–' }
  function getTypeUnit(typeId) { return serviceTypes.find(t => t.id === typeId)?.unit || '' }

  const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
  const tdStyle = { padding: '0.45rem 0.75rem', verticalAlign: 'middle' }

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Dienstleistungskosten</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'entries'
            ? <button onClick={openAddEntry} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Eintrag</button>
            : <button onClick={openAddType} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Dienstleistung</button>
          }
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        {[{ id: 'entries', label: '📋 Einträge' }, { id: 'types', label: '⚙️ Dienstleistungen' }].map(tab => (
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
            {(filterType || filterFrom || filterTo) && (
              <button onClick={() => { setFilterType(''); setFilterFrom(''); setFilterTo('') }}
                style={{ ...btnS, background: '#fee2e2', color: '#dc2626', padding: '0.28rem 0.7rem', marginBottom: '0.05rem' }}>
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
                {entries.length === 0
                  ? 'Noch keine Einträge. Klicken Sie auf "+ Eintrag" um zu beginnen.'
                  : 'Keine Einträge für den gewählten Filter.'}
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                    <th style={thStyle}>Datum</th>
                    <th style={thStyle}>Dienstleistung</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Menge</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Preis/Einheit</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Summe</th>
                    <th style={thStyle}>Notizen</th>
                    <th style={{ ...thStyle, width: 64 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom: i < filteredEntries.length - 1 ? '1px solid var(--color-border)' : 'none', background: i % 2 === 0 ? '#fff' : 'var(--color-bg)' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{isoToGerman(e.date)}</td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500 }}>{getTypeName(e.serviceTypeId)}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: '0.35rem' }}>{getTypeUnit(e.serviceTypeId)}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(e.quantity, 2)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmt(e.pricePerUnit)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(e.total)}</td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--color-text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '–'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openEditEntry(e)} style={{ ...btnS, background: '#e5e7eb', color: '#374151', marginRight: '0.2rem' }} title="Bearbeiten">✎</button>
                        <button onClick={() => deleteEntry(e.id)} style={{ background: 'none', border: 'none', color: '#dc2626', padding: '0.15rem 0.3rem', fontSize: '0.8rem', cursor: 'pointer' }} title="Löschen">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                    <td colSpan={4} style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                      Gesamt ({filteredEntries.length} Einträge)
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 700, color: 'var(--color-primary)' }}>{fmt(totalSum)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Service types tab ───────────────────────────────── */}
      {activeTab === 'types' && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {serviceTypes.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', margin: 0, fontSize: '0.875rem' }}>
              Noch keine Dienstleistungsarten definiert.
            </p>
          ) : serviceTypes.map((t, i) => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
              padding: '0.5rem 0.75rem',
              borderBottom: i < serviceTypes.length - 1 ? '1px solid var(--color-border)' : 'none',
              fontSize: '0.85rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{t.name}</div>
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
      )}

      {/* ── Entry Modal ─────────────────────────────────────── */}
      {(modal === 'addEntry' || isEditingEntry) && (
        <Modal title={isEditingEntry ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} onClose={() => setModal(null)} maxWidth={480}>
          <form onSubmit={saveEntry} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div>
                <label style={lbl}>Datum *</label>
                <input type="date" {...entryField('date')} required style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Dienstleistung *</label>
                <select value={entryForm.serviceTypeId} onChange={e => handleEntryTypeChange(e.target.value)} required style={{ width: '100%' }}>
                  <option value="">– bitte wählen –</option>
                  {serviceTypes.map(t => <option key={t.id} value={String(t.id)}>{t.name} ({t.unit})</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Menge / {entryForm.serviceTypeId ? getTypeUnit(parseInt(entryForm.serviceTypeId)) : 'Einheit'} *</label>
                <input type="number" {...entryField('quantity')} placeholder="1" step="0.01" min="0" required style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Preis je Einheit (€) *</label>
                <input type="number" {...entryField('pricePerUnit')} placeholder="0.00" step="0.01" min="0" required style={{ width: '100%' }} />
              </div>
              <div style={{ gridColumn: '1 / -1', background: 'var(--color-bg)', borderRadius: 6, padding: '0.5rem 0.85rem', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>Berechnete Summe:</span>
                <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-primary)' }}>{fmt(entryTotal)}</span>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Notizen</label>
                <input {...entryField('notes')} placeholder="Optionale Notizen..." style={{ width: '100%' }} />
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
        <Modal title={isEditingType ? 'Dienstleistung bearbeiten' : 'Neue Dienstleistung'} onClose={() => setModal(null)} maxWidth={420}>
          <form onSubmit={saveType} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Bezeichnung *</label>
                <input {...typeField('name')} placeholder="z. B. Hemden bügeln" required style={{ width: '100%' }} />
              </div>
              <div>
                <label style={lbl}>Einheit *</label>
                <input list="unit-opts" {...typeField('unit')} placeholder="z. B. Stück" required style={{ width: '100%' }} />
                <datalist id="unit-opts">
                  {UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
              <div>
                <label style={lbl}>Standardpreis (€)</label>
                <input type="number" {...typeField('defaultPrice')} placeholder="0.00" step="0.01" min="0" style={{ width: '100%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" style={{ flex: 1 }}>{isEditingType ? 'Änderungen speichern' : 'Dienstleistung hinzufügen'}</button>
              <button type="button" onClick={() => setModal(null)} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
