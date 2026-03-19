export default function Dashboard() {
  const accounts = JSON.parse(localStorage.getItem('bankAccounts')) || []
  const depots = JSON.parse(localStorage.getItem('depots')) || []
  const depotTrans = JSON.parse(localStorage.getItem('depotTransactions')) || []
  const prices = JSON.parse(localStorage.getItem('securityPrices')) || {}
  const insurance = JSON.parse(localStorage.getItem('insuranceContracts')) || []
  const realEstate = JSON.parse(localStorage.getItem('realEstate')) || []
  const shares = JSON.parse(localStorage.getItem('companyShares')) || []
  const subscriptions = JSON.parse(localStorage.getItem('subscriptions')) || []

  const totalBank = accounts.reduce((sum, acc) => sum + acc.balance, 0)

  let totalSecurities = 0
  depots.forEach(depot => {
    const trans = depotTrans.filter(t => t.depotId === depot.id)
    const pos = {}
    trans.forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { qty: 0 }
      if (t.type === 'buy') pos[t.securityId].qty += t.quantity
      else if (t.type === 'sell') pos[t.securityId].qty -= t.quantity
    })
    Object.keys(pos).forEach(secId => {
      const qty = pos[secId].qty
      if (qty > 0 && prices[secId]) {
        const sorted = [...prices[secId]].sort((a, b) => new Date(b.date) - new Date(a.date))
        totalSecurities += qty * sorted[0].value
      }
    })
  })

  const totalInsurance = insurance.reduce((sum, con) => sum + con.value, 0)
  const totalRealEstate = realEstate.reduce((sum, prop) => sum + prop.current, 0)
  const totalShares = shares.reduce((sum, sh) => sum + sh.value, 0)
  const totalAssets = totalBank + totalSecurities + totalInsurance + totalRealEstate + totalShares

  const monthlyExpenses = subscriptions.reduce((sum, sub) => {
    if (sub.frequency === 'monthly') return sum + sub.cost
    if (sub.frequency === 'quarterly') return sum + sub.cost / 3
    if (sub.frequency === 'yearly') return sum + sub.cost / 12
    return sum
  }, 0)

  return (
    <div className="module">
      <h2>Dashboard</h2>
      <p>Übersicht über alle Finanzdaten.</p>
      <h3>Zusammenfassung</h3>
      <p>Gesamtvermögen: <strong>{totalAssets.toFixed(2)} €</strong></p>
      <ul>
        <li>Bankkonten: {totalBank.toFixed(2)} €</li>
        <li>Wertpapiere: {totalSecurities.toFixed(2)} €</li>
        <li>Versicherungen: {totalInsurance.toFixed(2)} €</li>
        <li>Immobilien: {totalRealEstate.toFixed(2)} €</li>
        <li>Firmenbeteiligungen: {totalShares.toFixed(2)} €</li>
      </ul>
      <p>Monatliche Abonnementkosten: {monthlyExpenses.toFixed(2)} €</p>
    </div>
  )
}
