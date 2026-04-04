import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

const TYPE_COLOR = { Einnahme: '#16a34a', Ausgabe: '#dc2626' }

const btnBase = {
  border: 'none', borderRadius: 5, cursor: 'pointer',
  fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4,
}

export default function Categories() {
  const [categories, setCategories] = useLocalStorage('categories', [])

  const [name, setName] = useState('')
  const [parent, setParent] = useState('')
  const [type, setType] = useState('Ausgabe')

  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editParent, setEditParent] = useState('')
  const [editType, setEditType] = useState('Ausgabe')

  const [expanded, setExpanded] = useState(new Set())

  function addCategory(e) {
    e.preventDefault()
    setCategories([...categories, { id: Date.now(), name, parent: parent ? parseInt(parent) : null, type }])
    setName('')
    setParent('')
    setType('Ausgabe')
  }

  function removeCategory(id) {
    setCategories(categories.filter(c => c.id !== id && c.parent !== id))
  }

  function startEdit(c) {
    setEditId(c.id)
    setEditName(c.name)
    setEditParent(c.parent ? String(c.parent) : '')
    setEditType(c.type || 'Ausgabe')
  }

  function saveEdit() {
    setCategories(categories.map(c =>
      c.id === editId
        ? { ...c, name: editName, parent: editParent ? parseInt(editParent) : null, type: editType }
        : c
    ))
    setEditId(null)
  }

  function toggle(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function expandAll()   { setExpanded(new Set(categories.filter(c => categories.some(ch => ch.parent == c.id)).map(c => c.id))) }
  function collapseAll() { setExpanded(new Set()) }

  function renderTree(parentId = null, level = 0) {
    const siblings = categories.filter(c => c.parent == parentId)
    return siblings.map((c, idx) => {
      const isLast = idx === siblings.length - 1
      const hasChildren = categories.some(ch => ch.parent == c.id)
      const isOpen = expanded.has(c.id)
      const typeColor = TYPE_COLOR[c.type] || '#6b7280'

      if (editId === c.id) {
        return (
          <div key={c.id} style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center',
            padding: '0.4rem 0.5rem',
            paddingLeft: `${0.5 + level * 1.4}rem`,
            background: '#fefce8',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              style={{ flex: 1, minWidth: 100, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }}
            />
            <div style={{ fontSize: '0.82rem' }}>
              <ParentSelect
                value={editParent}
                onChange={e => setEditParent(e.target.value)}
                excludeId={c.id}
              />
            </div>
            <select
              value={editType}
              onChange={e => setEditType(e.target.value)}
              style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }}
            >
              <option value="Ausgabe">Ausgabe</option>
              <option value="Einnahme">Einnahme</option>
            </select>
            <button onClick={saveEdit} style={{ ...btnBase, background: '#16a34a', color: '#fff' }}>Speichern</button>
            <button onClick={() => setEditId(null)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
          </div>
        )
      }

      return (
        <div key={c.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.38rem 0.5rem',
            paddingLeft: `${0.5 + level * 1.4}rem`,
            borderBottom: '1px solid var(--color-border)',
            background: level === 0 ? 'var(--color-bg)' : 'var(--color-surface)',
          }}>
            {/* Tree connector */}
            {level > 0 && (
              <span style={{ color: '#d1d5db', fontSize: '0.8rem', flexShrink: 0, lineHeight: 1 }}>
                {isLast ? '└─' : '├─'}
              </span>
            )}

            {/* Expand toggle */}
            {hasChildren ? (
              <button
                onClick={() => toggle(c.id)}
                style={{ ...btnBase, background: 'none', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)' }}
              >
                {isOpen ? '▾' : '▸'}
              </button>
            ) : (
              <span style={{ width: '1.4rem', flexShrink: 0 }} />
            )}

            {/* Name */}
            <span style={{
              flex: 1,
              fontSize: level === 0 ? '0.9rem' : '0.85rem',
              fontWeight: level === 0 ? 600 : 400,
            }}>
              {c.name}
            </span>

            {/* Type badge */}
            <span style={{
              fontSize: '0.68rem', fontWeight: 600,
              background: typeColor + '18',
              color: typeColor,
              border: `1px solid ${typeColor}40`,
              borderRadius: 4, padding: '0.1rem 0.4rem',
              flexShrink: 0,
            }}>
              {c.type || 'Ausgabe'}
            </span>

            {/* Actions */}
            <button
              onClick={() => startEdit(c)}
              style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}
              title="Bearbeiten"
            >
              ✎
            </button>
            <button
              onClick={() => removeCategory(c.id)}
              style={{ ...btnBase, background: '#fee2e2', color: '#dc2626' }}
              title="Löschen"
            >
              ✕
            </button>
          </div>
          {isOpen && renderTree(c.id, level + 1)}
        </div>
      )
    })
  }

  // Build grouped options for parent selects
  function ParentSelect({ value, onChange, excludeId }) {
    const roots = categories.filter(c => c.parent == null && c.id !== excludeId)
    const subs  = categories.filter(c => c.parent != null && c.id !== excludeId)
    return (
      <select value={value} onChange={onChange}>
        <option value="">– Hauptkategorie (keine Oberkategorie) –</option>
        {roots.length > 0 && (
          <optgroup label="Hauptkategorien">
            {roots.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        )}
        {subs.length > 0 && (
          <optgroup label="Unterkategorien">
            {subs.map(c => {
              const p = categories.find(x => x.id === c.parent)
              return <option key={c.id} value={c.id}>{p ? `${p.name} › ` : ''}{c.name}</option>
            })}
          </optgroup>
        )}
      </select>
    )
  }

  return (
    <div className="module">
      <h2>Kategorien</h2>
      <form onSubmit={addCategory}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Kategoriename" required />
        <ParentSelect value={parent} onChange={e => setParent(e.target.value)} />
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="Ausgabe">Ausgabe</option>
          <option value="Einnahme">Einnahme</option>
        </select>
        <button type="submit">Kategorie hinzufügen</button>
      </form>

      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          <button onClick={expandAll}   style={{ fontSize: '0.78rem', padding: '0.28rem 0.75rem', background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', borderRadius: 6 }}>Alle aufklappen</button>
          <button onClick={collapseAll} style={{ fontSize: '0.78rem', padding: '0.28rem 0.75rem', background: 'transparent', border: '1px solid var(--color-border)',   color: 'var(--color-text-muted)', borderRadius: 6 }}>Alle zuklappen</button>
        </div>
      )}

      <div style={{ marginTop: '0.5rem', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        {categories.filter(c => c.parent == null).length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem', fontSize: '0.875rem' }}>
            Noch keine Kategorien angelegt
          </p>
        ) : renderTree()}
      </div>
    </div>
  )
}
