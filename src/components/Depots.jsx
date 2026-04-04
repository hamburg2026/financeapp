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

const TYPE_LABELS = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende', interest: 'Zinsen' }

export default function Depots() {
  const [depots, setDepots] = useLocalStorage('depots', [])
  const [transactions, setTransactions] = useLocalStorage('depotTransactions', [])
  const securities = JSON.parse(localStorage.getItem('securities')) || []
  const prices = JSON.parse(localStorage.getItem('securityPrices')) || {}

  const [tab, setTab] = useState('positions')
  const [depotName, setDepotName] = useState('')
  const [selectedDepot, setSelectedDepot] = useState('')

  const [txSecurityId, setTxSecurityId] = useState('')
  const [txType, setTxType] = useState('buy')
  const [txQuantity, setTxQuantity] = useState('')
  const [txPrice, setTxPrice] = useState('')
  const [txFees, setTxFees] = useState('')
  const [txDate, setTxDate] = useState('')

  const activeDepotId = parseInt(selectedDepot || depots[0]?.id)
  const activeDepot = depots.find(d => d.id === activeDepotId)

  function addDepot(e) {
    e.preventDefault()
    const newDepots = [...depots, { id: Date.now(), name: depotName }]
    setDepots(newDepots)
    if (!selectedDepot && newDepots.length === 1) setSelectedDepot(String(newDepots[0].id))
    setDepotName('')
  }

  function removeDepot(id) {
    setDepots(depots.filter(d => d.id !== id))
    setTransactions(transactions.filter(t => t.depotId !== id))
    if (String(id) === selectedDepot) setSelectedDepot('')
  }

  function addTransaction(e) {
    e.preventDefault()
    setTransactions([...transactions, {
      id: Date.now(),
      depotId: activeDepotId,
      securityId: parseInt(txSecurityId || securities[0]?.id),
      type: txType,
      quantity: parseFloat(txQuantity),
      price: parseFloat(txPrice),
      fees: parseFloat(txFees) || 0,
      date: txDate,
    }])
    setTxQuantity('')
    setTxPrice('')
    setTxFees('')
    setTxDate('')
  }

  function removeTransaction(id) {
    setTransactions(transactions.filter(t => t.id !== id))
  }

  function getCurrentPrice(securityId) {
    if (!prices[securityId] || prices[securityId].length === 0) return 0
    return [...prices[securityId]].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
  }

  function getPositions() {
    const depotTrans = transactions.filter(t => t.depotId === activeDepotId)
    const pos = {}
    depotTrans.forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { quantity: 0, cost: 0 }
      if (t.type === 'buy') {
        pos[t.securityId].quantity += t.quantity
        pos[t.securityId].cost += t.quantity * t.price + (t.fees || 0)
      } else if (t.type === 'sell') {
        pos[t.securityId].quantity -= t.quantity
        pos[t.securityId].cost -= t.quantity * t.price - (t.fees || 0)
      }
    })
    return Object.entries(pos)
      .filter(([, p]) => p.quantity > 0)
      .map(([secId, p]) => {
        const sec = securities.find(s => s.id == secId)
        const curPrice = getCurrentPrice(secId)
        const curValue = p.quantity * curPrice
        const pnl = curValue - p.cost
        const avgPrice = p.cost / p.quantity
        return { secId, sec, quantity: p.quantity, cost: p.cost, avgPrice, curValue, pnl }
      })
  }

  const positions = depots.length > 0 ? getPositions() : []
  const depotTransactions = transactions
    .filter(t => t.depotId === activeDepotId)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  const totalValue = positions.reduce((s, p) => s + p.curValue, 0)
  const totalPnl   = positions.reduce((s, p) => s + p.pnl, 0)

  const tabStyle = (active) => ({
    padding: '0.4rem 1rem',
    fontSize: '0.85rem',
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
    borderRadius: 8,
    cursor: 'pointer',
  })

  return (
    <div className="module">
      <h2>Depots</h2>

      {/* Depot selector + add form */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {depots.length > 0 && (
          <select value={selectedDepot} onChange={e => setSelectedDepot(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
            {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <form onSubmit={addDepot} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input value={depotName} onChange={e => setDepotName(e.target.value)} placeholder="Neues Depot" required style={{ minWidth: 130 }} />
          <button type="submit" style={{ whiteSpace: 'nowrap' }}>+ Depot</button>
        </form>
        {activeDepot && depots.length > 0 && (
          <button
            onClick={() => { if (window.confirm(`Depot "${activeDepot.name}" und alle Transaktionen löschen?`)) removeDepot(activeDepotId) }}
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '0.4rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer' }}
          >Depot löschen</button>
        )}
      </div>

      {depots.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>Noch keine Depots angelegt.</p>
      ) : (
        <>
          {/* Tab nav */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
            <button style={tabStyle(tab === 'positions')}    onClick={() => setTab('positions')}>Positionen</button>
            <button style={tabStyle(tab === 'transactions')} onClick={() => setTab('transactions')}>Transaktionen</button>
          </div>

          {/* ── Positionen tab ── */}
          {tab === 'positions' && (
            <>
              {positions.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Keine Positionen im Depot.</p>
              ) : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                        <th style={{ textAlign: 'left',  padding: '0.4rem 0.75rem' }}>Wertpapier</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Anzahl</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Ø Preis</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Kurs</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Wert</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>G/V</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(({ secId, sec, quantity, avgPrice, curValue, pnl }, i) => (
                        <tr key={secId} style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '0.4rem 0.75rem', fontWeight: 500 }}>{sec?.name || secId}</td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>{quantity.toLocaleString('de-DE', { maximumFractionDigits: 4 })}</td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>{fmt(avgPrice)}</td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>{fmt(getCurrentPrice(secId))}</td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{fmt(curValue)}</td>
                          <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 600, color: pnl >= 0 ? '#16a34a' : '#dc2626' }}>
                            {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                        <td colSpan={4} style={{ padding: '0.4rem 0.75rem', fontWeight: 600, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Gesamt</td>
                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{fmt(totalValue)}</td>
                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 700, color: totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>
                          {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Transaktionen tab ── */}
          {tab === 'transactions' && (
            <>
              <form onSubmit={addTransaction} style={{ marginBottom: '1.25rem', background: 'var(--color-bg)', padding: '1rem', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
                <select value={txSecurityId} onChange={e => setTxSecurityId(e.target.value)} required style={{ flex: 2, minWidth: 130 }}>
                  <option value="">– Wertpapier –</option>
                  {securities.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={txType} onChange={e => setTxType(e.target.value)} required style={{ minWidth: 110 }}>
                  <option value="buy">Kauf</option>
                  <option value="sell">Verkauf</option>
                  <option value="dividend">Dividende</option>
                  <option value="interest">Zinsen</option>
                </select>
                <input type="number" value={txQuantity} onChange={e => setTxQuantity(e.target.value)} placeholder="Anzahl" step="0.0001" min="0.0001" required style={{ width: 90 }} />
                <input type="number" value={txPrice} onChange={e => setTxPrice(e.target.value)} placeholder="Preis/Stk." step="0.01" min="0" required style={{ width: 100 }} />
                <input type="number" value={txFees} onChange={e => setTxFees(e.target.value)} placeholder="Gebühren" step="0.01" min="0" style={{ width: 90 }} />
                <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
                <button type="submit">+ Transaktion</button>
              </form>

              {depotTransactions.length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Noch keine Transaktionen.</p>
              ) : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                        <th style={{ textAlign: 'left',  padding: '0.4rem 0.75rem' }}>Datum</th>
                        <th style={{ textAlign: 'left',  padding: '0.4rem 0.75rem' }}>Typ</th>
                        <th style={{ textAlign: 'left',  padding: '0.4rem 0.75rem' }}>Wertpapier</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Anzahl</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Preis</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Gebühren</th>
                        <th style={{ textAlign: 'right', padding: '0.4rem 0.75rem' }}>Gesamt</th>
                        <th style={{ padding: '0.4rem 0.75rem' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {depotTransactions.map((t, i) => {
                        const sec = securities.find(s => s.id == t.securityId)
                        const total = t.quantity * t.price + (t.fees || 0)
                        const isSell = t.type === 'sell'
                        return (
                          <tr key={t.id} style={{ borderBottom: i < depotTransactions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                            <td style={{ padding: '0.4rem 0.75rem', color: 'var(--color-text-muted)' }}>{t.date}</td>
                            <td style={{ padding: '0.4rem 0.75rem', fontWeight: 600, color: isSell ? '#dc2626' : '#16a34a' }}>{TYPE_LABELS[t.type] || t.type}</td>
                            <td style={{ padding: '0.4rem 0.75rem' }}>{sec?.name || t.securityId}</td>
                            <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>{t.quantity?.toLocaleString('de-DE', { maximumFractionDigits: 4 })}</td>
                            <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>{fmt(t.price)}</td>
                            <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>{t.fees ? fmt(t.fees) : '–'}</td>
                            <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{fmt(total)}</td>
                            <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>
                              <button
                                onClick={() => removeTransaction(t.id)}
                                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', padding: '0.1rem 0.3rem' }}
                                title="Löschen"
                              >✕</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
