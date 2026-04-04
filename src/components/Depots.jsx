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
const TYPE_COLOR  = { buy: '#16a34a', sell: '#dc2626', dividend: '#2563eb', interest: '#7c3aed' }

const btnBase  = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4 }
const labelSt  = { fontSize: '0.68rem', color: 'var(--color-text-muted)', marginBottom: 2, display: 'block' }
const fieldCol = (width) => ({ display: 'flex', flexDirection: 'column', width })

export default function Depots() {
  const [depots,       setDepots]       = useLocalStorage('depots', [])
  const [transactions, setTransactions] = useLocalStorage('depotTransactions', [])
  const securities = JSON.parse(localStorage.getItem('securities')) || []
  const prices     = JSON.parse(localStorage.getItem('securityPrices')) || {}

  const [tab,           setTab]           = useState('positions')
  const [depotName,     setDepotName]     = useState('')
  const [selectedDepot, setSelectedDepot] = useState('')

  // ── Add transaction ──
  const [txSecurityId, setTxSecurityId] = useState('')
  const [txType,       setTxType]       = useState('buy')
  const [txQuantity,   setTxQuantity]   = useState('')
  const [txPrice,      setTxPrice]      = useState('')
  const [txTotal,      setTxTotal]      = useState('')   // Einstandswert
  const [txPriceMode,  setTxPriceMode]  = useState('price') // 'price' | 'total'
  const [txFees,       setTxFees]       = useState('')
  const [txDate,       setTxDate]       = useState('')

  // ── Edit transaction ──
  const [editTxId,        setEditTxId]        = useState(null)
  const [editSecurityId,  setEditSecurityId]  = useState('')
  const [editType,        setEditType]        = useState('buy')
  const [editQuantity,    setEditQuantity]    = useState('')
  const [editPrice,       setEditPrice]       = useState('')
  const [editTotal,       setEditTotal]       = useState('')
  const [editPriceMode,   setEditPriceMode]   = useState('price')
  const [editFees,        setEditFees]        = useState('')
  const [editDate,        setEditDate]        = useState('')

  const activeDepotId = parseInt(selectedDepot || depots[0]?.id)
  const activeDepot   = depots.find(d => d.id === activeDepotId)

  // ─── Depot CRUD ──────────────────────────────────────────────────────────────
  function addDepot(e) {
    e.preventDefault()
    const nd = [...depots, { id: Date.now(), name: depotName }]
    setDepots(nd)
    if (!selectedDepot && nd.length === 1) setSelectedDepot(String(nd[0].id))
    setDepotName('')
  }

  function removeDepot(id) {
    setDepots(depots.filter(d => d.id !== id))
    setTransactions(transactions.filter(t => t.depotId !== id))
    if (String(id) === selectedDepot) setSelectedDepot('')
  }

  // ─── Price helpers ───────────────────────────────────────────────────────────
  function getCurrentPrice(secId) {
    const list = prices[secId]
    if (!list?.length) return 0
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
  }

  // ─── Transaction price/total sync ────────────────────────────────────────────
  // When quantity + price are filled → compute total; when quantity + total → compute price
  function resolvedPrice(qty, price, total, mode) {
    if (mode === 'total' && qty && total) return parseFloat(total) / parseFloat(qty)
    return parseFloat(price) || 0
  }

  // ─── Add transaction ─────────────────────────────────────────────────────────
  function addTransaction(e) {
    e.preventDefault()
    const price = resolvedPrice(txQuantity, txPrice, txTotal, txPriceMode)
    setTransactions([...transactions, {
      id:         Date.now(),
      depotId:    activeDepotId,
      securityId: parseInt(txSecurityId || securities[0]?.id),
      type:       txType,
      quantity:   parseFloat(txQuantity),
      price,
      fees:       parseFloat(txFees) || 0,
      date:       txDate,
    }])
    setTxQuantity(''); setTxPrice(''); setTxTotal(''); setTxFees(''); setTxDate('')
  }

  // ─── Edit transaction ────────────────────────────────────────────────────────
  function startEditTx(t) {
    setEditTxId(t.id)
    setEditSecurityId(String(t.securityId))
    setEditType(t.type)
    setEditQuantity(String(t.quantity))
    setEditPrice(String(t.price))
    setEditTotal(String(Math.round(t.quantity * t.price * 100) / 100))
    setEditPriceMode('price')
    setEditFees(String(t.fees || ''))
    setEditDate(t.date)
  }

  function saveEditTx() {
    const price = resolvedPrice(editQuantity, editPrice, editTotal, editPriceMode)
    const updated = {
      ...transactions.find(t => t.id === editTxId),
      securityId: parseInt(editSecurityId),
      type:       editType,
      quantity:   parseFloat(editQuantity),
      price,
      fees:       parseFloat(editFees) || 0,
      date:       editDate,
    }
    setTransactions(transactions.map(t => t.id === editTxId ? updated : t))
    setEditTxId(null)
  }

  function removeTx(id) { setTransactions(transactions.filter(t => t.id !== id)) }

  // ─── Positions ───────────────────────────────────────────────────────────────
  function getPositions() {
    const pos = {}
    transactions.filter(t => t.depotId === activeDepotId).forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { quantity: 0, cost: 0 }
      if (t.type === 'buy') {
        pos[t.securityId].quantity += t.quantity
        pos[t.securityId].cost    += t.quantity * t.price + (t.fees || 0)
      } else if (t.type === 'sell') {
        pos[t.securityId].quantity -= t.quantity
        pos[t.securityId].cost    -= t.quantity * t.price - (t.fees || 0)
      }
    })
    return Object.entries(pos).filter(([, p]) => p.quantity > 0.0001).map(([secId, p]) => {
      const sec      = securities.find(s => s.id == secId)
      const curPrice = getCurrentPrice(secId)
      const curValue = p.quantity * curPrice
      const pnl      = curValue - p.cost
      return { secId, sec, quantity: p.quantity, cost: p.cost, avgPrice: p.cost / p.quantity, curPrice, curValue, pnl }
    })
  }

  const positions = depots.length > 0 ? getPositions() : []
  const depotTxs  = transactions.filter(t => t.depotId === activeDepotId).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
  const totalVal  = positions.reduce((s, p) => s + p.curValue, 0)
  const totalPnl  = positions.reduce((s, p) => s + p.pnl, 0)

  const tabSt = (active) => ({
    padding: '0.38rem 0.9rem', fontSize: '0.83rem', cursor: 'pointer', borderRadius: 8,
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
  })

  // ── Inline price/total toggle for a form ──
  function PriceModeToggle({ mode, setMode }) {
    return (
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)', alignSelf: 'flex-end', height: 34 }}>
        {[['price', 'Kurs'], ['total', 'Einstand']].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setMode(v)} style={{
            border: 'none', cursor: 'pointer', padding: '0 0.55rem', fontSize: '0.7rem', fontWeight: mode === v ? 700 : 400,
            background: mode === v ? 'var(--color-primary)' : 'transparent',
            color: mode === v ? '#fff' : 'var(--color-text-muted)',
          }}>{l}</button>
        ))}
      </div>
    )
  }

  return (
    <div className="module">
      <h2>Depots</h2>

      {/* Depot selector + add */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {depots.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 150 }}>
            <span style={labelSt}>Depot</span>
            <select value={selectedDepot} onChange={e => setSelectedDepot(e.target.value)}>
              {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <form onSubmit={addDepot} style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={labelSt}>Neues Depot</span>
            <input value={depotName} onChange={e => setDepotName(e.target.value)} placeholder="Depotname" required style={{ minWidth: 130 }} />
          </label>
          <button type="submit" style={{ whiteSpace: 'nowrap' }}>+ Depot</button>
        </form>
        {activeDepot && (
          <button onClick={() => { if (window.confirm(`Depot „${activeDepot.name}" löschen?`)) removeDepot(activeDepotId) }}
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '0.42rem 0.75rem', fontSize: '0.82rem', cursor: 'pointer', alignSelf: 'flex-end' }}>
            Depot löschen
          </button>
        )}
      </div>

      {depots.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>Noch keine Depots angelegt.</p>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
            <button style={tabSt(tab === 'positions')}    onClick={() => setTab('positions')}>Positionen</button>
            <button style={tabSt(tab === 'transactions')} onClick={() => setTab('transactions')}>Transaktionen</button>
          </div>

          {/* ── Positionen ── */}
          {tab === 'positions' && (
            positions.length === 0
              ? <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Keine Positionen im Depot.</p>
              : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                        {['Wertpapier', 'Anzahl', 'Ø Preis', 'Kurs', 'Wert', 'G/V'].map((h, i) => (
                          <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '0.4rem 0.75rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(({ secId, sec, quantity, avgPrice, curPrice, curValue, pnl }, i) => (
                        <tr key={secId} style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '0.42rem 0.75rem', fontWeight: 500 }}>{sec?.name || secId}</td>
                          <td style={{ padding: '0.42rem 0.75rem' }}>{quantity.toLocaleString('de-DE', { maximumFractionDigits: 4 })}</td>
                          <td style={{ padding: '0.42rem 0.75rem', textAlign: 'right' }}>{fmt(avgPrice)}</td>
                          <td style={{ padding: '0.42rem 0.75rem', textAlign: 'right' }}>{fmt(curPrice)}</td>
                          <td style={{ padding: '0.42rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>{fmt(curValue)}</td>
                          <td style={{ padding: '0.42rem 0.75rem', textAlign: 'right', fontWeight: 600, color: pnl >= 0 ? '#16a34a' : '#dc2626' }}>
                            {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-bg)' }}>
                        <td colSpan={4} style={{ padding: '0.42rem 0.75rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Gesamt</td>
                        <td style={{ padding: '0.42rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{fmt(totalVal)}</td>
                        <td style={{ padding: '0.42rem 0.75rem', textAlign: 'right', fontWeight: 700, color: totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>
                          {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
          )}

          {/* ── Transaktionen ── */}
          {tab === 'transactions' && (
            <>
              {/* Add form — compact, labeled */}
              <div style={{ background: 'var(--color-bg)', padding: '0.85rem 1rem', borderRadius: 8, marginBottom: '1rem', border: '1px solid var(--color-border)' }}>
                <form onSubmit={addTransaction}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'flex-end' }}>
                    <div style={fieldCol(undefined)}>
                      <span style={labelSt}>Wertpapier</span>
                      <select value={txSecurityId} onChange={e => setTxSecurityId(e.target.value)} required style={{ minWidth: 140 }}>
                        <option value="">– wählen –</option>
                        {securities.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div style={fieldCol(100)}>
                      <span style={labelSt}>Typ</span>
                      <select value={txType} onChange={e => setTxType(e.target.value)}>
                        <option value="buy">Kauf</option>
                        <option value="sell">Verkauf</option>
                        <option value="dividend">Dividende</option>
                        <option value="interest">Zinsen</option>
                      </select>
                    </div>
                    <div style={fieldCol(85)}>
                      <span style={labelSt}>Anzahl</span>
                      <input type="number" value={txQuantity} onChange={e => { setTxQuantity(e.target.value); if (txPriceMode === 'total' && e.target.value && txTotal) setTxPrice((parseFloat(txTotal) / parseFloat(e.target.value)).toFixed(4)) }} step="0.0001" min="0.0001" required />
                    </div>
                    <PriceModeToggle mode={txPriceMode} setMode={setTxPriceMode} />
                    {txPriceMode === 'price' ? (
                      <div style={fieldCol(95)}>
                        <span style={labelSt}>Kurs/Stk.</span>
                        <input type="number" value={txPrice} onChange={e => setTxPrice(e.target.value)} step="0.0001" min="0" required />
                      </div>
                    ) : (
                      <div style={fieldCol(100)}>
                        <span style={labelSt}>Einstandswert</span>
                        <input type="number" value={txTotal} onChange={e => setTxTotal(e.target.value)} step="0.01" min="0" required placeholder="Gesamt" />
                      </div>
                    )}
                    <div style={fieldCol(80)}>
                      <span style={labelSt}>Gebühren</span>
                      <input type="number" value={txFees} onChange={e => setTxFees(e.target.value)} step="0.01" min="0" placeholder="0" />
                    </div>
                    <div style={fieldCol(undefined)}>
                      <span style={labelSt}>Datum</span>
                      <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required />
                    </div>
                    <button type="submit" style={{ alignSelf: 'flex-end' }}>+ Transaktion</button>
                  </div>
                </form>
              </div>

              {/* Transaction history */}
              {depotTxs.length === 0
                ? <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>Noch keine Transaktionen.</p>
                : (
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                    {depotTxs.map((t, i) => {
                      const sec   = securities.find(s => s.id == t.securityId)
                      const total = t.quantity * t.price + (t.fees || 0)
                      const isLast = i === depotTxs.length - 1
                      const border = isLast ? 'none' : '1px solid var(--color-border)'

                      if (editTxId === t.id) {
                        return (
                          <div key={t.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'flex-end', padding: '0.55rem 0.75rem', borderBottom: border, background: '#fefce8' }}>
                            <div style={fieldCol(undefined)}>
                              <span style={labelSt}>Wertpapier</span>
                              <select value={editSecurityId} onChange={e => setEditSecurityId(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem', minWidth: 120 }}>
                                {securities.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div style={fieldCol(95)}>
                              <span style={labelSt}>Typ</span>
                              <select value={editType} onChange={e => setEditType(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem' }}>
                                <option value="buy">Kauf</option>
                                <option value="sell">Verkauf</option>
                                <option value="dividend">Dividende</option>
                                <option value="interest">Zinsen</option>
                              </select>
                            </div>
                            <div style={fieldCol(80)}>
                              <span style={labelSt}>Anzahl</span>
                              <input type="number" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} step="0.0001" style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem' }} />
                            </div>
                            <PriceModeToggle mode={editPriceMode} setMode={setEditPriceMode} />
                            {editPriceMode === 'price' ? (
                              <div style={fieldCol(90)}>
                                <span style={labelSt}>Kurs/Stk.</span>
                                <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} step="0.0001" style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem' }} />
                              </div>
                            ) : (
                              <div style={fieldCol(100)}>
                                <span style={labelSt}>Einstandswert</span>
                                <input type="number" value={editTotal} onChange={e => setEditTotal(e.target.value)} step="0.01" style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem' }} />
                              </div>
                            )}
                            <div style={fieldCol(75)}>
                              <span style={labelSt}>Gebühren</span>
                              <input type="number" value={editFees} onChange={e => setEditFees(e.target.value)} step="0.01" style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem' }} />
                            </div>
                            <div style={fieldCol(undefined)}>
                              <span style={labelSt}>Datum</span>
                              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ fontSize: '0.8rem', padding: '0.22rem 0.4rem' }} />
                            </div>
                            <button onClick={saveEditTx} style={{ ...btnBase, background: '#16a34a', color: '#fff', alignSelf: 'flex-end' }}>Speichern</button>
                            <button onClick={() => setEditTxId(null)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151', alignSelf: 'flex-end' }}>Abbrechen</button>
                          </div>
                        )
                      }

                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', padding: '0.42rem 0.75rem', borderBottom: border, fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--color-text-muted)', minWidth: 80, fontSize: '0.78rem' }}>{t.date}</span>
                          <span style={{ fontWeight: 700, color: TYPE_COLOR[t.type] || '#374151', minWidth: 60 }}>{TYPE_LABELS[t.type]}</span>
                          <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec?.name || t.securityId}</span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{t.quantity?.toLocaleString('de-DE', { maximumFractionDigits: 4 })} × {fmt(t.price)}</span>
                          {t.fees > 0 && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>+{fmt(t.fees)} Geb.</span>}
                          <span style={{ fontWeight: 700, minWidth: 70, textAlign: 'right' }}>{fmt(total)}</span>
                          <button onClick={() => startEditTx(t)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
                          <button onClick={() => removeTx(t.id)} style={{ ...btnBase, background: '#fee2e2', color: '#dc2626' }} title="Löschen">✕</button>
                        </div>
                      )
                    })}
                  </div>
                )
              }
            </>
          )}
        </>
      )}
    </div>
  )
}
