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

export default function Securities() {
  const [securities, setSecurities] = useLocalStorage('securities', [])
  const [prices, setPrices] = useLocalStorage('securityPrices', {})

  const [secName, setSecName] = useState('')
  const [secSymbol, setSecSymbol] = useState('')
  const [secType, setSecType] = useState('')

  const [priceSecId, setPriceSecId] = useState('')
  const [priceDate, setPriceDate] = useState('')
  const [priceValue, setPriceValue] = useState('')

  function addSecurity(e) {
    e.preventDefault()
    setSecurities([...securities, { id: Date.now(), name: secName, symbol: secSymbol, type: secType }])
    setSecName('')
    setSecSymbol('')
    setSecType('')
  }

  function removeSecurity(id) {
    const newPrices = { ...prices }
    delete newPrices[id]
    setPrices(newPrices)
    setSecurities(securities.filter(s => s.id !== id))
  }

  function addPrice(e) {
    e.preventDefault()
    const secId = priceSecId || securities[0]?.id
    const newPrices = { ...prices, [secId]: [...(prices[secId] || []), { date: priceDate, value: parseFloat(priceValue) }] }
    setPrices(newPrices)
    setPriceDate('')
    setPriceValue('')
  }

  function getCurrentPrice(securityId) {
    if (!prices[securityId] || prices[securityId].length === 0) return null
    const sorted = [...prices[securityId]].sort((a, b) => new Date(b.date) - new Date(a.date))
    return sorted[0].value
  }

  return (
    <div className="module">
      <h2>Wertpapiere</h2>
      <form onSubmit={addSecurity}>
        <input value={secName} onChange={e => setSecName(e.target.value)} placeholder="Name" required />
        <input value={secSymbol} onChange={e => setSecSymbol(e.target.value)} placeholder="Symbol" required />
        <input value={secType} onChange={e => setSecType(e.target.value)} placeholder="Typ (Aktie, Bond, etc.)" required />
        <button type="submit">Wertpapier hinzufügen</button>
      </form>
      <h3>Wertpapiere</h3>
      <table>
        <thead><tr><th>Name</th><th>Symbol</th><th>Typ</th><th>Aktueller Kurs</th><th>Aktionen</th></tr></thead>
        <tbody>
          {securities.map(s => {
            const price = getCurrentPrice(s.id)
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.symbol}</td>
                <td>{s.type}</td>
                <td>{price !== null ? fmt(price) : 'N/A'}</td>
                <td><button onClick={() => removeSecurity(s.id)}>Löschen</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <h3>Kurse aktualisieren</h3>
      <form onSubmit={addPrice}>
        <select value={priceSecId} onChange={e => setPriceSecId(e.target.value)} required>
          {securities.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} required />
        <input type="number" value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder="Kurs" step="0.01" required />
        <button type="submit">Kurs hinzufügen</button>
      </form>
    </div>
  )
}
