import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function Categories() {
  const [categories, setCategories] = useLocalStorage('categories', [])
  const [name, setName] = useState('')
  const [parent, setParent] = useState('')

  function addCategory(e) {
    e.preventDefault()
    setCategories([...categories, { id: Date.now(), name, parent: parent || null }])
    setName('')
    setParent('')
  }

  function removeCategory(id) {
    setCategories(categories.filter(c => c.id !== id && c.parent !== id))
  }

  function renderTree(parentId = null, level = 0) {
    return categories
      .filter(c => c.parent == parentId)
      .flatMap(c => [
        <li key={c.id} style={{ marginLeft: level * 16 }}>
          {c.name} <button onClick={() => removeCategory(c.id)}>Löschen</button>
        </li>,
        ...renderTree(c.id, level + 1),
      ])
  }

  return (
    <div className="module">
      <h2>Kategorien</h2>
      <form onSubmit={addCategory}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Kategoriename" required />
        <select value={parent} onChange={e => setParent(e.target.value)}>
          <option value="">Hauptkategorie</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit">Kategorie hinzufügen</button>
      </form>
      <h3>Kategorien</h3>
      <ul>{renderTree()}</ul>
    </div>
  )
}
