import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function InsuranceContracts() {
  const [contracts, setContracts] = useLocalStorage('insuranceContracts', [])
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('')
  const [value, setValue] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')

  function addContract(e) {
    e.preventDefault()
    setContracts([...contracts, { id: Date.now(), name, provider, value: parseFloat(value), start, end, notes }])
    setName('')
    setProvider('')
    setValue('')
    setStart('')
    setEnd('')
    setNotes('')
  }

  function removeContract(id) {
    setContracts(contracts.filter(c => c.id !== id))
  }

  return (
    <div className="module">
      <h2>Versicherungsverträge</h2>
      <form onSubmit={addContract}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Vertragsname" required />
        <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="Anbieter" required />
        <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Aktueller Wert" step="0.01" required />
        <input type="date" value={start} onChange={e => setStart(e.target.value)} required />
        <input type="date" value={end} onChange={e => setEnd(e.target.value)} required />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notizen" />
        <button type="submit">Vertrag hinzufügen</button>
      </form>
      <h3>Verträge</h3>
      <table>
        <thead><tr><th>Name</th><th>Anbieter</th><th>Wert</th><th>Start</th><th>Ende</th><th>Aktionen</th></tr></thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.provider}</td>
              <td>{c.value.toFixed(2)} €</td>
              <td>{c.start}</td>
              <td>{c.end}</td>
              <td><button onClick={() => removeContract(c.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
