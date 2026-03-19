import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function RecurringPayments() {
  const [recurrings, setRecurrings] = useLocalStorage('recurringPayments', [])
  const accounts = JSON.parse(localStorage.getItem('bankAccounts')) || []

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [accountId, setAccountId] = useState('')

  function addRecurring(e) {
    e.preventDefault()
    setRecurrings([...recurrings, {
      id: Date.now(),
      description,
      amount: parseFloat(amount),
      frequency,
      accountId: parseInt(accountId || accounts[0]?.id),
    }])
    setDescription('')
    setAmount('')
    setFrequency('monthly')
    setAccountId('')
  }

  function removeRecurring(id) {
    setRecurrings(recurrings.filter(r => r.id !== id))
  }

  function executeRecurrings() {
    const transactions = JSON.parse(localStorage.getItem('transactions')) || []
    const today = new Date().toISOString().split('T')[0]
    recurrings.forEach(rec => {
      transactions.push({
        id: Date.now() + Math.random(),
        accountId: rec.accountId,
        date: today,
        description: rec.description,
        amount: rec.amount,
        category: 'Dauerauftrag',
      })
    })
    localStorage.setItem('transactions', JSON.stringify(transactions))
    alert('Daueraufträge ausgeführt')
  }

  return (
    <div className="module">
      <h2>Daueraufträge</h2>
      <form onSubmit={addRecurring}>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Beschreibung" required />
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Betrag" step="0.01" required />
        <select value={frequency} onChange={e => setFrequency(e.target.value)} required>
          <option value="monthly">Monatlich</option>
          <option value="quarterly">Vierteljährlich</option>
          <option value="yearly">Jährlich</option>
        </select>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} required>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button type="submit">Dauerauftrag hinzufügen</button>
      </form>
      <h3>Daueraufträge</h3>
      <table>
        <thead><tr><th>Beschreibung</th><th>Betrag</th><th>Frequenz</th><th>Aktionen</th></tr></thead>
        <tbody>
          {recurrings.map(r => (
            <tr key={r.id}>
              <td>{r.description}</td>
              <td>{r.amount.toFixed(2)} €</td>
              <td>{r.frequency}</td>
              <td><button onClick={() => removeRecurring(r.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={executeRecurrings}>Ausführen</button>
    </div>
  )
}
