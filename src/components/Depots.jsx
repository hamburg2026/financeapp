import { useState } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (newVal) => {
    localStorage.setItem(key, JSON.stringify(newVal))
    setValue(newVal)
  }
  return [value, set]
}

export default function Depots() {
  const [depots, setDepots] = useLocalStorage('depots', [])
  const [transactions, setTransactions] = useLocalStorage('depotTransactions', [])
  const securities = JSON.parse(localStorage.getItem('securities')) || []
  const prices = JSON.parse(localStorage.getItem('securityPrices')) || {}

  const [depotName, setDepotName] = useState('')
  const [selectedDepot, setSelectedDepot] = useState('')

  const [txSecurityId, setTxSecurityId] = useState('')
  const [txType, setTxType] = useState('buy')
  const [txQuantity, setTxQuantity] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [txFees, setTxFees] = useState('')
  const [txDate, setTxDate] = useState('')

  function addDepot(e) {
    e.preventDefault()
    const newDepots = [...depots, { id: Date.now(), name: depotName }]
    setDepots(newDepots)
    if (!selectedDepot && newDepots.length === 1) setSelectedDepot(String(newDepots[0].id))
    setDepotName('')
  }

  function addTransaction(e) {
    e.preventDefault()
    const depotId = parseInt(selectedDepot || depots[0]?.id)
    setTransactions([...transactions, {
      id: Date.now(),
      depotId,
      securityId: parseInt(txSecurityId || securities[0]?.id),
      type: txType,
      quantity: parseFloat(txQuantity),
      price: parseFloat(txPrice),
      fees: parseFloat(txFees),
      date: txDate,
    }])
    setTxQuantity('')
    setTxPrice('')
    setTxFees('')
    setTxDate('')
  }

  function getCurrentPrice(securityId) {
    if (!prices[securityId] || prices[securityId].length === 0) return 0
    const sorted = [...prices[securityId]].sort((a, b) => new Date(b.date) - new Date(a.date))
    return sorted[0].value
  }

  function getPositions() {
    const depotId = parseInt(selectedDepot || depots[0]?.id)
    const depotTrans = transactions.filter(t => t.depotId === depotId)
    const positions = {}
    depotTrans.forEach(t => {
      if (!positions[t.securityId]) positions[t.securityId] = { quantity: 0, cost: 0 }
      if (t.type === 'buy') {
        positions[t.securityId].quantity += t.quantity
        positions[t.securityId].cost += t.quantity * t.price + t.fees
      } else if (t.type === 'sell') {
        positions[t.securityId].quantity -= t.quantity
        positions[t.securityId].cost -= t.quantity * t.price - t.fees
      }
    })
    return Object.entries(positions)
      .filter(([, pos]) => pos.quantity > 0)
      .map(([secId, pos]) => {
        const sec = securities.find(s => s.id == secId)
        const currentPrice = getCurrentPrice(secId)
        const currentValue = pos.quantity * currentPrice
        const pnl = currentValue - pos.cost
        return { secId, sec, pos, currentValue, pnl }
      })
  }

  const positions = depots.length > 0 ? getPositions() : []

  return (
    <div className="module">
      <h2>Depots</h2>
      <form onSubmit={addDepot}>
        <input value={depotName} onChange={e => setDepotName(e.target.value)} placeholder="Depotname" required />
        <button type="submit">Depot hinzufügen</button>
      </form>
      <h3>Depot auswählen</h3>
      <select value={selectedDepot} onChange={e => setSelectedDepot(e.target.value)}>
        {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <h3>Transaktionen</h3>
      <form onSubmit={addTransaction}>
        <select value={txSecurityId} onChange={e => setTxSecurityId(e.target.value)} required>
          {securities.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={txType} onChange={e => setTxType(e.target.value)} required>
          <option value="buy">Kauf</option>
          <option value="sell">Verkauf</option>
          <option value="dividend">Dividende</option>
          <option value="interest">Zinsen</option>
        </select>
        <input type="number" value={txQuantity} onChange={e => setTxQuantity(e.target.value)} placeholder="Anzahl" step="0.01" required />
        <input type="number" value={txPrice} onChange={e => setTxPrice(e.target.value)} placeholder="Preis pro Stück" step="0.01" required />
        <input type="number" value={txFees} onChange={e => setTxFees(e.target.value)} placeholder="Gebühren" step="0.01" required />
        <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
        <button type="submit">Transaktion hinzufügen</button>
      </form>
      <h3>Depotübersicht</h3>
      <table>
        <thead><tr><th>Wertpapier</th><th>Anzahl</th><th>Durchschnittspreis</th><th>Aktueller Wert</th><th>Gewinn/Verlust</th></tr></thead>
        <tbody>
          {positions.map(({ secId, sec, pos, currentValue, pnl }) => (
            <tr key={secId}>
              <td>{sec?.name || secId}</td>
              <td>{pos.quantity}</td>
              <td>{(pos.cost / pos.quantity).toFixed(2)} €</td>
              <td>{currentValue.toFixed(2)} €</td>
              <td>{pnl.toFixed(2)} €</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
