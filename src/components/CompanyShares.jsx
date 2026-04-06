import { useState } from 'react'
import { fmt, fmtNum } from '../fmt'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function CompanyShares() {
  const [shares, setShares] = useLocalStorage('companyShares', [])
  const [company, setCompany] = useState('')
  const [percentage, setPercentage] = useState('')
  const [value, setValue] = useState('')
  const [notes, setNotes] = useState('')

  function addShare(e) {
    e.preventDefault()
    setShares([...shares, { id: Date.now(), company, percentage: parseFloat(percentage), value: parseFloat(value), notes }])
    setCompany('')
    setPercentage('')
    setValue('')
    setNotes('')
  }

  function removeShare(id) {
    setShares(shares.filter(s => s.id !== id))
  }

  return (
    <div className="module">
      <h2>Firmenbeteiligungen</h2>

      <h3>Beteiligungen</h3>
      <table>
        <thead><tr><th>Firma</th><th>Beteiligung</th><th>Wert</th><th>Aktionen</th></tr></thead>
        <tbody>
          {shares.map(s => (
            <tr key={s.id}>
              <td>{s.company}</td>
              <td>{fmtNum(s.percentage)} %</td>
              <td>{fmt(s.value)}</td>
              <td><button onClick={() => removeShare(s.id)}>Löschen</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '1.5rem' }}>Beteiligung hinzufügen</h3>
      <form onSubmit={addShare}>
        <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Firmenname" required />
        <input type="number" value={percentage} onChange={e => setPercentage(e.target.value)} placeholder="Beteiligung %" step="0.01" required />
        <input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="Wert" step="0.01" required />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notizen" />
        <button type="submit">Beteiligung hinzufügen</button>
      </form>
    </div>
  )
}
