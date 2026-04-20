import { useState } from 'react'
import CategorySelect from './CategorySelect'
import Modal from './Modal'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = v => { localStorage.setItem(key, JSON.stringify(v)); setValue(v) }
  return [value, set]
}

const TYPE_COLOR = { Einnahme: '#16a34a', Ausgabe: '#dc2626' }
const btnBase = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4 }
const lbl = { fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.3rem', display: 'block', fontWeight: 500 }

function ParentSelect({ value, onChange, excludeId, categories }) {
  const available = categories.filter(c => c.id !== excludeId)
  return (
    <CategorySelect value={value} onChange={onChange} categories={available} placeholder="– Hauptkategorie (keine Oberkategorie) –" selectParents style={{ width: '100%' }} />
  )
}

export default function Categories() {
  const [categories, setCategories] = useLocalStorage('categories', [])
  const [modal, setModal] = useState(null) // null | 'add' | categoryId

  const [name,   setName]   = useState('')
  const [parent, setParent] = useState('')
  const [type,   setType]   = useState('Ausgabe')

  const [expanded, setExpanded] = useState(new Set())

  function openAdd() {
    setName(''); setParent(''); setType('Ausgabe')
    setModal('add')
  }

  function openAddChild(c) {
    setName(''); setParent(String(c.id)); setType(c.type || 'Ausgabe')
    setModal('add')
  }

  function openEdit(c) {
    setName(c.name)
    setParent(c.parent ? String(c.parent) : '')
    setType(c.type || 'Ausgabe')
    setModal(c.id)
  }

  function closeModal() { setModal(null) }

  function addCategory(e) {
    e.preventDefault()
    setCategories([...categories, { id: Date.now(), name, parent: parent ? parseInt(parent) : null, type }])
    closeModal()
  }

  function saveEdit(e) {
    e.preventDefault()
    setCategories(categories.map(c =>
      c.id === modal ? { ...c, name, parent: parent ? parseInt(parent) : null, type } : c
    ))
    closeModal()
  }

  function getAllDescendantIds(id) {
    const children = categories.filter(c => c.parent === id)
    return [id, ...children.flatMap(c => getAllDescendantIds(c.id))]
  }

  function removeCategory(id) {
    const toRemove = new Set(getAllDescendantIds(id))
    setCategories(categories.filter(c => !toRemove.has(c.id)))
  }

  function toggle(id) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function expandAll()   { setExpanded(new Set(categories.filter(c => categories.some(ch => ch.parent == c.id)).map(c => c.id))) }
  function collapseAll() { setExpanded(new Set()) }

  function renderTree(parentId = null, level = 0) {
    return categories.filter(c => c.parent == parentId).map((c, idx, siblings) => {
      const isLast = idx === siblings.length - 1
      const hasChildren = categories.some(ch => ch.parent == c.id)
      const isOpen = expanded.has(c.id)
      const typeColor = TYPE_COLOR[c.type] || '#6b7280'
      return (
        <div key={c.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.38rem 0.5rem', paddingLeft: `${0.5 + level * 1.4}rem`,
            borderBottom: '1px solid var(--color-border)',
            background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
          }}>
            {level > 0 && <span style={{ color: '#d1d5db', fontSize: '0.8rem', flexShrink: 0 }}>{isLast ? '└─' : '├─'}</span>}
            {hasChildren ? (
              <button onClick={() => toggle(c.id)} style={{ ...btnBase, background: 'none', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)' }}>
                {isOpen ? '▾' : '▸'}
              </button>
            ) : <span style={{ width: '1.4rem', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: level === 0 ? '0.9rem' : '0.85rem', fontWeight: level === 0 ? 600 : 400 }}>{c.name}</span>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, background: typeColor + '18', color: typeColor, border: `1px solid ${typeColor}40`, borderRadius: 4, padding: '0.1rem 0.4rem', flexShrink: 0 }}>
              {c.type || 'Ausgabe'}
            </span>
            <button onClick={() => openAddChild(c)} style={{ ...btnBase, background: '#dcfce7', color: '#16a34a' }} title="Unterkategorie hinzufügen">+</button>
            <button onClick={() => openEdit(c)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
            <button onClick={() => removeCategory(c.id)} style={{ ...btnBase, background: '#fee2e2', color: '#dc2626' }} title="Löschen">✕</button>
          </div>
          {isOpen && renderTree(c.id, level + 1)}
        </div>
      )
    })
  }

  const isEditing = modal !== null && modal !== 'add'
  const editTarget = isEditing ? categories.find(c => c.id === modal) : null

  return (
    <div className="module">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0 }}>Kategorien</h2>
        <button onClick={openAdd} style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}>+ Neu</button>
      </div>

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
          <button onClick={expandAll}   style={{ fontSize: '0.78rem', padding: '0.28rem 0.75rem', background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', borderRadius: 6 }}>Alle aufklappen</button>
          <button onClick={collapseAll} style={{ fontSize: '0.78rem', padding: '0.28rem 0.75rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 6 }}>Alle zuklappen</button>
        </div>
      )}

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        {categories.filter(c => c.parent == null).length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', fontSize: '0.875rem' }}>
            Noch keine Kategorien angelegt
          </p>
        ) : renderTree()}
      </div>

      {modal && (
        <Modal
          title={isEditing ? `Kategorie bearbeiten: ${editTarget?.name || ''}` : 'Neue Kategorie'}
          onClose={closeModal}
          maxWidth={480}
        >
          <form onSubmit={isEditing ? saveEdit : addCategory} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <label style={lbl}>Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Kategoriename" required style={{ width: '100%' }} />
            </div>
            <div>
              <label style={lbl}>Oberkategorie</label>
              <ParentSelect value={parent} onChange={e => setParent(e.target.value)} excludeId={isEditing ? modal : null} categories={categories} />
            </div>
            <div>
              <label style={lbl}>Typ</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
                <option value="Ausgabe">Ausgabe</option>
                <option value="Einnahme">Einnahme</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="submit" style={{ flex: 1 }}>{isEditing ? 'Änderungen speichern' : 'Kategorie hinzufügen'}</button>
              <button type="button" onClick={closeModal} style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', cursor: 'pointer' }}>Abbrechen</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
