import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function Subscriptions() {
  const [subscriptions, setSubscriptions] = useLocalStorage('subscriptions', [])
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [cancel, setCancel] = useState('')
  const [next, setNext] = useState('')

  function addSubscription(e) {
    e.preventDefault()
    setSubscriptions([...subscriptions, { id: Date.now(), name, cost: parseFloat(cost), frequency, cancel, next }])
    setName('')
    setCost('')
    setFrequency('monthly')
    setCancel('')
    setNext('')
  }

  function removeSubscription(id) {
    setSubscriptions(subscriptions.filter(s => s.id !== id))
  }

  return (
    <div className="module">
      <h2>Abonnements</h2>
      <form onSubmit={addSubscription}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" required />
        <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="Kosten" step="0.01" required />
        <select value={frequency} onChange={e => setFrequency(e.target.value)} required>
          <option value="monthly">Monatlich</option>
          <option value="quarterly">Vierteljährlich</option>
          <option value="yearly">Jährlich</option>
        </select>
        <input value={cancel} onChange={e => setCancel(e.target.value)} placeholder="Kündigungsfrist" required />
        <input type="date" value={next} onChange={e => setNext(e.target.value)} />
        <button type="submit">Abonnement hinzufügen</button>
      </form>
      <h3>Abonnements</h3>
      <table>
        <thead><tr><th>Name</th><th>Kosten</th><th>Frequenz</th><th>Kündigung</th><th>Nächste</th><th>Aktionen</th></tr></thead>
        <tbody>
          {subscriptions.map(s => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.cost.toFixed(2)} €</td>
              <td>{s.frequency}</td>
              <td>{s.cancel}</td>
              <td>{s.next}</td>
              <td><button onClick={() => removeSubscription(s.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
