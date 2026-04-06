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

export default function RealEstate() {
  const [properties, setProperties] = useLocalStorage('realEstate', [])
  const [name, setName] = useState('')
  const [purchase, setPurchase] = useState('')
  const [current, setCurrent] = useState('')
  const [notes, setNotes] = useState('')

  function addProperty(e) {
    e.preventDefault()
    setProperties([...properties, { id: Date.now(), name, purchase: parseFloat(purchase), current: parseFloat(current), notes }])
    setName('')
    setPurchase('')
    setCurrent('')
    setNotes('')
  }

  function removeProperty(id) {
    setProperties(properties.filter(p => p.id !== id))
  }

  return (
    <div className="module">
      <h2>Immobilien</h2>

      <h3>Immobilien</h3>
      <table>
        <thead><tr><th>Name</th><th>Anschaffungswert</th><th>Zeitwert</th><th>Gewinn/Verlust</th><th>Aktionen</th></tr></thead>
        <tbody>
          {properties.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{fmt(p.purchase)}</td>
              <td>{fmt(p.current)}</td>
              <td>{fmt(p.current - p.purchase)}</td>
              <td><button onClick={() => removeProperty(p.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '1.5rem' }}>Immobilie hinzufügen</h3>
      <form onSubmit={addProperty}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" required />
        <input type="number" value={purchase} onChange={e => setPurchase(e.target.value)} placeholder="Anschaffungswert" step="0.01" required />
        <input type="number" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Zeitwert" step="0.01" required />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notizen" />
        <button type="submit">Immobilie hinzufügen</button>
      </form>
    </div>
  )
}
