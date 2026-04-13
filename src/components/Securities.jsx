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

const SEC_TYPES = ['Aktie', 'ETF', 'Fonds', 'Anleihe', 'Rohstoff', 'Kryptowährung', 'Sonstiges']
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD']

const TX_LABELS = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende', interest: 'Zinsen' }
const TX_COLORS = { buy: '#16a34a', sell: '#dc2626', dividend: '#2563eb', interest: '#7c3aed' }
const TX_BG    = { buy: '#dcfce7', sell: '#fee2e2', dividend: '#dbeafe', interest: '#ede9fe' }
const INCOME_TX = new Set(['dividend', 'interest'])

const btnBase = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4 }
const labelStyle = { fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: 2, display: 'block' }

const today = () => new Date().toISOString().slice(0, 10)

// ── Alpha Vantage – kostenloser API-Key unter alphavantage.co ──
// Symbolformat: US-Aktien = "AAPL", Deutsche Aktien = "SAP.FRA", ETFs = "VWCE.FRA"
async function fetchAlphaVantagePrice(symbol, apiKey) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.Note) throw new Error('Tageslimit (25 Abfragen) erreicht. Bitte morgen erneut versuchen.')
  if (data.Information) throw new Error('API-Key ungültig oder Limit überschritten.')
  const quote = data['Global Quote']
  if (!quote?.['05. price']) throw new Error(`Symbol „${symbol}" nicht gefunden. Tipp: Deutsche Aktien als „SAP.FRA" eingeben.`)
  return {
    price: parseFloat(quote['05. price']),
    date:  quote['07. latest trading day'] || today(),
  }
}

// ── Leeway – kostenloser API-Token unter leeway.tech ──
// Symbolformat: Deutsche Aktien = "DTE.XETRA", US-Aktien = "AAPL.US", ETFs = "VWCE.XETRA"
async function fetchLeewayPrice(symbol, apiToken) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 10)
  const toStr = to.toISOString().slice(0, 10)
  const fromStr = from.toISOString().slice(0, 10)
  const url = `https://api.leeway.tech/api/v1/public/historicalquotes/${encodeURIComponent(symbol)}?apitoken=${encodeURIComponent(apiToken)}&from=${fromStr}&to=${toStr}`
  const res = await fetch(url)
  if (res.status === 429) throw new Error('Tageslimit überschritten. Bitte später erneut versuchen.')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) throw new Error(`Keine Kursdaten für „${symbol}" gefunden. Tipp: Symbolformat „DTE.XETRA" oder „AAPL.US"`)
  const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date))
  const latest = sorted[0]
  return {
    price: latest.adjusted_close ?? latest.close,
    date:  latest.date,
  }
}

// ── Frankfurter.app FX (kostenlos, CORS-fähig) ──
async function fetchFrankfurterFx(pair) {
  const res = await fetch(`https://api.frankfurter.app/latest?base=${encodeURIComponent(pair)}&symbols=EUR`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const rate = data?.rates?.EUR
  if (rate == null) throw new Error('Kurs nicht verfügbar')
  return { rate, date: data.date || today() }
}

export default function Securities() {
  const [securities,   setSecurities]   = useLocalStorage('securities', [])
  const [prices,       setPrices]       = useLocalStorage('securityPrices', {})
  const [fxRates,      setFxRates]      = useLocalStorage('fxRates', {})
  const [alphaKey,     setAlphaKeyState] = useState(() => localStorage.getItem('alphavantage_key') || '')
  const [leewayKey,    setLeewayKeyState] = useState(() => localStorage.getItem('leeway_token') || '')

  function saveAlphaKey(val) {
    localStorage.setItem('alphavantage_key', val)
    setAlphaKeyState(val)
  }

  function saveLeewayKey(val) {
    localStorage.setItem('leeway_token', val)
    setLeewayKeyState(val)
  }

  // ── Add security form ──
  const [secName,   setSecName]   = useState('')
  const [secSymbol, setSecSymbol] = useState('')
  const [secIsin,   setSecIsin]   = useState('')
  const [secType,   setSecType]   = useState('Aktie')
  const [secCur,    setSecCur]    = useState('EUR')

  // ── Edit security ──
  const [editSecId,     setEditSecId]     = useState(null)
  const [editSecName,   setEditSecName]   = useState('')
  const [editSecSymbol, setEditSecSymbol] = useState('')
  const [editSecIsin,   setEditSecIsin]   = useState('')
  const [editSecType,   setEditSecType]   = useState('Aktie')
  const [editSecCur,    setEditSecCur]    = useState('EUR')

  // ── Price form (shared date/value for inline add) ──
  const [priceDate,    setPriceDate]    = useState(today)
  const [priceValue,   setPriceValue]   = useState('')

  // ── Edit price ──
  const [editPriceKey,   setEditPriceKey]   = useState(null)
  const [editPriceDate,  setEditPriceDate]  = useState('')
  const [editPriceValue, setEditPriceValue] = useState('')

  // ── FX rate form ──
  const [fxPair,  setFxPair]  = useState('USD')
  const [fxDate,  setFxDate]  = useState(today)
  const [fxValue, setFxValue] = useState('')

  // ── Edit FX rate ──
  const [editFxKey,   setEditFxKey]   = useState(null)
  const [editFxDate,  setEditFxDate]  = useState('')
  const [editFxValue, setEditFxValue] = useState('')

  // ── Depot transactions (shared with Depots module) ──
  const [depotTransactions, setDepotTransactions] = useLocalStorage('depotTransactions', [])
  const [depots, setDepots] = useLocalStorage('depots', [])
  const [newDepotName, setNewDepotName] = useState('')

  // ── Expanded sections ──
  const [expandedPrices, setExpandedPrices] = useState(new Set())
  const [expandedTx,     setExpandedTx]     = useState(new Set())

  // ── Add transaction form (shared) ──
  const [txDate,    setTxDate]    = useState(today)
  const [txDepotId, setTxDepotId] = useState('')
  const [txType,    setTxType]    = useState('buy')
  const [txQty,     setTxQty]     = useState('')
  const [txPrice,   setTxPrice]   = useState('')
  const [txFees,    setTxFees]    = useState('')

  // ── Edit transaction ──
  const [editTxId,      setEditTxId]      = useState(null)
  const [editTxDate,    setEditTxDate]    = useState('')
  const [editTxDepotId, setEditTxDepotId] = useState('')
  const [editTxType,    setEditTxType]    = useState('buy')
  const [editTxQty,     setEditTxQty]     = useState('')
  const [editTxPrice,   setEditTxPrice]   = useState('')
  const [editTxFees,    setEditTxFees]    = useState('')

  // ── API fetch state ──
  const [fetchingPrice,  setFetchingPrice]  = useState({})
  const [fetchPriceErr,  setFetchPriceErr]  = useState({})
  const [fetchingLeeway, setFetchingLeeway] = useState({})
  const [fetchLeewayErr, setFetchLeewayErr] = useState({})
  const [fetchingFx,     setFetchingFx]     = useState({})
  const [fetchFxErr,     setFetchFxErr]     = useState({})

  // ─── Security CRUD ───────────────────────────────────────────────────────────
  function addSecurity(e) {
    e.preventDefault()
    setSecurities([...securities, {
      id: Date.now(), name: secName, symbol: secSymbol,
      isin: secIsin.trim(), type: secType, currency: secCur,
    }])
    setSecName(''); setSecSymbol(''); setSecIsin(''); setSecType('Aktie'); setSecCur('EUR')
  }

  function startEditSec(s) {
    setEditSecId(s.id)
    setEditSecName(s.name)
    setEditSecSymbol(s.symbol)
    setEditSecIsin(s.isin || '')
    setEditSecType(s.type || 'Aktie')
    setEditSecCur(s.currency || 'EUR')
  }

  function saveEditSec() {
    setSecurities(securities.map(s => s.id === editSecId
      ? { ...s, name: editSecName, symbol: editSecSymbol, isin: editSecIsin.trim(), type: editSecType, currency: editSecCur }
      : s
    ))
    setEditSecId(null)
  }

  function removeSecurity(id) {
    const np = { ...prices }; delete np[id]
    setPrices(np)
    setSecurities(securities.filter(s => s.id !== id))
  }

  // ─── Price CRUD ──────────────────────────────────────────────────────────────
  function addPriceInline(secId) {
    const list = [...(prices[secId] || []), { date: priceDate, value: parseFloat(priceValue) }]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    setPrices({ ...prices, [secId]: list })
    setPriceDate(today()); setPriceValue('')
  }

  function startEditPrice(secId, idx) {
    const entry = prices[secId][idx]
    setEditPriceKey({ secId, idx })
    setEditPriceDate(entry.date)
    setEditPriceValue(String(entry.value))
  }

  function saveEditPrice() {
    const { secId, idx } = editPriceKey
    const list = prices[secId].map((p, i) => i === idx ? { date: editPriceDate, value: parseFloat(editPriceValue) } : p)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    setPrices({ ...prices, [secId]: list })
    setEditPriceKey(null)
  }

  function removePrice(secId, idx) {
    const list = prices[secId].filter((_, i) => i !== idx)
    setPrices({ ...prices, [secId]: list })
  }

  function getCurrentPrice(secId) {
    const list = prices[secId]
    if (!list?.length) return null
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
  }

  function togglePrices(id) {
    setExpandedPrices(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleTx(id) {
    setExpandedTx(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ─── Depot Transaction CRUD ──────────────────────────────────────────────────
  function addTxInline(secId) {
    const depotId = txDepotId ? parseInt(txDepotId) : depots[0]?.id
    if (!depotId) return
    const isIncome = INCOME_TX.has(txType)
    setDepotTransactions([...depotTransactions, {
      id:         Date.now(),
      depotId,
      securityId: secId,
      type:       txType,
      quantity:   isIncome ? 1 : parseFloat(txQty),
      price:      parseFloat(txPrice),
      fees:       parseFloat(txFees) || 0,
      date:       txDate,
    }])
    setTxQty(''); setTxPrice(''); setTxFees(''); setTxDate(today())
  }

  function startEditTx(t) {
    setEditTxId(t.id)
    setEditTxDate(t.date)
    setEditTxDepotId(String(t.depotId))
    setEditTxType(t.type)
    setEditTxQty(INCOME_TX.has(t.type) ? '' : String(t.quantity))
    setEditTxPrice(String(t.price))
    setEditTxFees(String(t.fees || ''))
  }

  function saveEditTx() {
    setDepotTransactions(depotTransactions.map(t => t.id === editTxId ? {
      ...t,
      date:     editTxDate,
      depotId:  parseInt(editTxDepotId),
      type:     editTxType,
      quantity: INCOME_TX.has(editTxType) ? 1 : parseFloat(editTxQty),
      price:    parseFloat(editTxPrice),
      fees:     parseFloat(editTxFees) || 0,
    } : t))
    setEditTxId(null)
  }

  function removeTx(id) {
    setDepotTransactions(depotTransactions.filter(t => t.id !== id))
  }

  function depotName(id) {
    return depots.find(d => d.id === id)?.name || `Depot ${id}`
  }

  // ─── Depot CRUD ──────────────────────────────────────────────────────────────
  function addDepot(e) {
    e.preventDefault()
    const nd = [...depots, { id: Date.now(), name: newDepotName.trim() }]
    setDepots(nd)
    setNewDepotName('')
  }

  function removeDepotFn(id) {
    if (!window.confirm('Depot und alle zugehörigen Transaktionen löschen?')) return
    setDepots(depots.filter(d => d.id !== id))
    setDepotTransactions(depotTransactions.filter(t => t.depotId !== id))
  }

  // ─── Depot position calculation ──────────────────────────────────────────────
  function getDepotPositions(depotId) {
    const pos = {}
    depotTransactions.filter(t => String(t.depotId) === String(depotId)).forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { quantity: 0, cost: 0, income: 0 }
      if (t.type === 'buy') {
        pos[t.securityId].quantity += t.quantity
        pos[t.securityId].cost    += t.quantity * t.price + (t.fees || 0)
      } else if (t.type === 'sell') {
        pos[t.securityId].quantity -= t.quantity
        pos[t.securityId].cost    -= t.quantity * t.price - (t.fees || 0)
      } else if (INCOME_TX.has(t.type)) {
        pos[t.securityId].income  += t.price - (t.fees || 0)
      }
    })
    return Object.entries(pos)
      .filter(([, p]) => p.quantity > 0.0001 || p.income > 0)
      .map(([secId, p]) => {
        const sec      = securities.find(s => String(s.id) === secId)
        const curPrice = getCurrentPrice(secId)
        const curValue = p.quantity * curPrice
        const pnl      = curValue - p.cost + p.income
        const pct      = p.cost > 0 ? (pnl / p.cost) * 100 : null
        return { secId, sec, quantity: p.quantity, cost: p.cost, curValue, pnl, pct, income: p.income }
      })
  }

  // ─── API: Security price (Alpha Vantage) ────────────────────────────────────
  async function handleFetchApiPrice(sec) {
    if (!sec.symbol) {
      setFetchPriceErr(e => ({ ...e, [sec.id]: 'Kein Ticker/Symbol hinterlegt.' }))
      return
    }
    if (!alphaKey) {
      setFetchPriceErr(e => ({ ...e, [sec.id]: 'Bitte zuerst den Alpha Vantage API-Schlüssel hinterlegen (siehe unten).' }))
      return
    }
    setFetchingPrice(s => ({ ...s, [sec.id]: true }))
    setFetchPriceErr(e => ({ ...e, [sec.id]: null }))
    try {
      const { price, date } = await fetchAlphaVantagePrice(sec.symbol, alphaKey)
      const list = [...(prices[sec.id] || []), { date, value: price }]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setPrices(prev => ({ ...prev, [sec.id]: list }))
      setExpandedPrices(prev => { const n = new Set(prev); n.add(sec.id); return n })
    } catch (err) {
      setFetchPriceErr(e => ({ ...e, [sec.id]: `API-Fehler: ${err.message}` }))
    } finally {
      setFetchingPrice(s => ({ ...s, [sec.id]: false }))
    }
  }

  // ─── API: Security price (Leeway) ───────────────────────────────────────────
  async function handleFetchLeewayPrice(sec) {
    if (!sec.symbol) {
      setFetchLeewayErr(e => ({ ...e, [sec.id]: 'Kein Ticker/Symbol hinterlegt.' }))
      return
    }
    if (!leewayKey) {
      setFetchLeewayErr(e => ({ ...e, [sec.id]: 'Bitte zuerst den Leeway API-Token hinterlegen (siehe unten).' }))
      return
    }
    setFetchingLeeway(s => ({ ...s, [sec.id]: true }))
    setFetchLeewayErr(e => ({ ...e, [sec.id]: null }))
    try {
      const { price, date } = await fetchLeewayPrice(sec.symbol, leewayKey)
      const list = [...(prices[sec.id] || []), { date, value: price }]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setPrices(prev => ({ ...prev, [sec.id]: list }))
      setExpandedPrices(prev => { const n = new Set(prev); n.add(sec.id); return n })
    } catch (err) {
      setFetchLeewayErr(e => ({ ...e, [sec.id]: `Leeway-Fehler: ${err.message}` }))
    } finally {
      setFetchingLeeway(s => ({ ...s, [sec.id]: false }))
    }
  }

  // ─── FX Rates CRUD ───────────────────────────────────────────────────────────
  function addFxRate(e) {
    e.preventDefault()
    const list = [...(fxRates[fxPair] || []), { date: fxDate, value: parseFloat(fxValue) }]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    setFxRates({ ...fxRates, [fxPair]: list })
    setFxDate(today()); setFxValue('')
  }

  function startEditFx(pair, idx) {
    const entry = fxRates[pair][idx]
    setEditFxKey({ pair, idx })
    setEditFxDate(entry.date)
    setEditFxValue(String(entry.value))
  }

  function saveEditFx() {
    const { pair, idx } = editFxKey
    const list = fxRates[pair].map((r, i) => i === idx ? { date: editFxDate, value: parseFloat(editFxValue) } : r)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    setFxRates({ ...fxRates, [pair]: list })
    setEditFxKey(null)
  }

  function removeFxRate(pair, idx) {
    const list = fxRates[pair].filter((_, i) => i !== idx)
    setFxRates({ ...fxRates, [pair]: list })
  }

  function getLatestFx(pair) {
    const list = fxRates[pair]
    if (!list?.length) return null
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
  }

  // ─── API: FX rate ────────────────────────────────────────────────────────────
  async function handleFetchApiFx(pair) {
    setFetchingFx(s => ({ ...s, [pair]: true }))
    setFetchFxErr(e => ({ ...e, [pair]: null }))
    try {
      const { rate, date } = await fetchFrankfurterFx(pair)
      const list = [...(fxRates[pair] || []), { date, value: rate }]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
      setFxRates(prev => ({ ...prev, [pair]: list }))
    } catch (err) {
      setFetchFxErr(e => ({ ...e, [pair]: `API-Fehler: ${err.message}` }))
    } finally {
      setFetchingFx(s => ({ ...s, [pair]: false }))
    }
  }

  const usedFxPairs = [...new Set([
    ...Object.keys(fxRates),
    ...securities.filter(s => s.currency && s.currency !== 'EUR').map(s => s.currency),
  ])]

  const sectionHead = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.5rem', marginTop: '1.5rem' }

  const cellR = { padding: '0.3rem 0.5rem', textAlign: 'right', fontSize: '0.78rem' }
  const cellL = { padding: '0.3rem 0.5rem', textAlign: 'left',  fontSize: '0.78rem' }

  return (
    <div className="module">
      <h2>Wertpapiere &amp; Depots</h2>

      {/* ── Depot-Positionen ── */}
      <p style={sectionHead}>Depot-Positionen</p>
      {depots.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
          Noch keine Depots vorhanden. Legen Sie unten ein neues Depot an.
        </p>
      )}
      {depots.map(depot => {
        const positions  = getDepotPositions(depot.id)
        const totalValue = positions.reduce((s, p) => s + p.curValue, 0)
        const totalCost  = positions.reduce((s, p) => s + p.cost,     0)
        const totalPnl   = positions.reduce((s, p) => s + p.pnl,      0)
        const totalPct   = totalCost > 0 ? (totalPnl / totalCost) * 100 : null
        return (
          <div key={depot.id} style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
            {/* Depot header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--color-bg)', borderBottom: positions.length ? '1px solid var(--color-border)' : 'none', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.92rem', flex: 1 }}>{depot.name}</span>
              <span style={{ fontWeight: 700 }}>{fmt(totalValue)}</span>
              {totalPct != null && (
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: totalPct >= 0 ? '#16a34a' : '#dc2626' }}>
                  {totalPct >= 0 ? '+' : ''}{totalPct.toFixed(1)} %
                </span>
              )}
              {totalPnl !== 0 && (
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>
                  {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
                </span>
              )}
              <button onClick={() => removeDepotFn(depot.id)}
                style={{ ...btnBase, background: '#fee2e2', color: '#dc2626', fontSize: '0.7rem' }}>
                Depot löschen
              </button>
            </div>
            {/* Positions */}
            {positions.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                    {['Wertpapier', 'Anzahl', 'Ø Preis', 'Kurs', 'Wert', 'Erträge', 'G/V', '%'].map(h => (
                      <th key={h} style={{ ...cellR, textAlign: h === 'Wertpapier' ? 'left' : 'right', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(({ secId, sec, quantity, cost, curValue, pnl, pct, income }, i) => {
                    const avgPrice = quantity > 0 ? cost / quantity : 0
                    const curPrice = getCurrentPrice(secId)
                    return (
                      <tr key={secId} style={{ borderBottom: i < positions.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                        <td style={cellL}>{sec?.name || secId}</td>
                        <td style={cellR}>{quantity.toLocaleString('de-DE', { maximumFractionDigits: 4 })}</td>
                        <td style={{ ...cellR, color: 'var(--color-text-muted)' }}>{fmt(avgPrice)}</td>
                        <td style={{ ...cellR, color: 'var(--color-text-muted)' }}>{curPrice ? fmt(curPrice) : '–'}</td>
                        <td style={{ ...cellR, fontWeight: 600 }}>{fmt(curValue)}</td>
                        <td style={{ ...cellR, color: income > 0 ? '#2563eb' : 'var(--color-text-muted)' }}>{income > 0 ? `+${fmt(income)}` : '–'}</td>
                        <td style={{ ...cellR, fontWeight: 700, color: pnl >= 0 ? '#16a34a' : '#dc2626' }}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</td>
                        <td style={{ ...cellR, color: (pct ?? 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %` : '–'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', margin: '0.5rem 0.75rem' }}>Keine Positionen</p>
            )}
          </div>
        )
      })}
      {/* New depot form */}
      <form onSubmit={addDepot} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', flex: 1, maxWidth: 280 }}>
          <span style={labelStyle}>Neues Depot</span>
          <input value={newDepotName} onChange={e => setNewDepotName(e.target.value)} placeholder="Depotname" required />
        </label>
        <button type="submit" style={{ alignSelf: 'flex-end' }}>+ Depot anlegen</button>
      </form>

      {/* ── Securities list ── */}
      {securities.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.5rem' }}>
          {securities.map((s, si) => {
            const price      = getCurrentPrice(s.id)
            const pricesOpen = expandedPrices.has(s.id)
            const priceList  = (prices[s.id] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
            const txOpen     = expandedTx.has(s.id)
            const secTxs     = depotTransactions.filter(t => String(t.securityId) === String(s.id))
                                 .slice().sort((a, b) => new Date(b.date) - new Date(a.date))
            const isEditing  = editSecId === s.id
            const isLast     = si === securities.length - 1
            const isFetching      = fetchingPrice[s.id]
            const fetchErr        = fetchPriceErr[s.id]
            const isLeewayFetching = fetchingLeeway[s.id]
            const leewayFetchErr  = fetchLeewayErr[s.id]
            const isinVal         = s.isin?.trim()

            return (
              <div key={s.id}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'flex-end', padding: '0.45rem 0.75rem', borderBottom: isLast ? 'none' : '1px solid var(--color-border)', background: '#fefce8' }}>
                    <input value={editSecName} onChange={e => setEditSecName(e.target.value)}
                      style={{ flex: 2, minWidth: 120, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="Name" />
                    <input value={editSecSymbol} onChange={e => setEditSecSymbol(e.target.value)}
                      style={{ width: 90, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="Ticker" />
                    <input value={editSecIsin} onChange={e => setEditSecIsin(e.target.value)}
                      style={{ width: 115, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="ISIN" maxLength={12} />
                    <select value={editSecType} onChange={e => setEditSecType(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem' }}>
                      {SEC_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <select value={editSecCur} onChange={e => setEditSecCur(e.target.value)} style={{ fontSize: '0.82rem', padding: '0.25rem 0.4rem', width: 80 }}>
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <button onClick={saveEditSec} style={{ ...btnBase, background: '#16a34a', color: '#fff' }}>Speichern</button>
                    <button onClick={() => setEditSecId(null)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }}>Abbrechen</button>
                  </div>
                ) : (
                  <div style={{ borderBottom: (!pricesOpen && !txOpen && isLast) ? 'none' : '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.42rem 0.75rem', flexWrap: 'wrap' }}>
                      <button onClick={() => togglePrices(s.id)} style={{ ...btnBase, background: pricesOpen ? '#e0f2fe' : 'none', padding: '0.1rem 0.35rem', color: pricesOpen ? '#0369a1' : 'var(--color-text-muted)', fontSize: '0.75rem' }}
                        title="Kursverlauf">
                        {pricesOpen ? '▾' : '▸'} Kurse
                      </button>
                      <button onClick={() => toggleTx(s.id)} style={{ ...btnBase, background: txOpen ? '#f0fdf4' : 'none', padding: '0.1rem 0.35rem', color: txOpen ? '#166534' : 'var(--color-text-muted)', fontSize: '0.75rem' }}
                        title="Transaktionen">
                        {txOpen ? '▾' : '▸'} Tx{secTxs.length > 0 ? ` (${secTxs.length})` : ''}
                      </button>
                      <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.symbol}</span>
                      {isinVal ? (
                        <a
                          href={`https://finance.yahoo.com/quote/${isinVal}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '0.72rem', color: 'var(--color-primary)', textDecoration: 'underline', fontFamily: 'monospace' }}
                          title="ISIN auf Yahoo Finance öffnen"
                        >
                          {isinVal}
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: '#d97706', background: '#fef9c3', borderRadius: 4, padding: '0.05rem 0.35rem', cursor: 'pointer' }}
                          onClick={() => startEditSec(s)} title="ISIN hinterlegen">
                          + ISIN
                        </span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: 4, padding: '0.05rem 0.35rem' }}>{s.type}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: s.currency !== 'EUR' ? '#d97706' : 'var(--color-text-muted)' }}>{s.currency || 'EUR'}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.87rem', minWidth: 70, textAlign: 'right' }}>{price !== null ? fmt(price) : '–'}</span>
                      <button
                        onClick={() => handleFetchApiPrice(s)}
                        disabled={isFetching}
                        style={{ ...btnBase, background: '#dbeafe', color: '#1d4ed8', minWidth: 72 }}
                        title={`Kurs für ${s.symbol} von Alpha Vantage abrufen`}
                      >
                        {isFetching ? '…' : '↓ Alpha Vantage'}
                      </button>
                      {leewayKey && (
                        <button
                          onClick={() => handleFetchLeewayPrice(s)}
                          disabled={isLeewayFetching}
                          style={{ ...btnBase, background: '#ede9fe', color: '#6d28d9', minWidth: 72 }}
                          title={`Kurs für ${s.symbol} von Leeway abrufen`}
                        >
                          {isLeewayFetching ? '…' : '↓ Leeway'}
                        </button>
                      )}
                      <button onClick={() => startEditSec(s)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
                      <button onClick={() => removeSecurity(s.id)} style={{ ...btnBase, background: '#fee2e2', color: '#dc2626' }} title="Löschen">✕</button>
                    </div>
                    {fetchErr && (
                      <div style={{ fontSize: '0.72rem', color: '#dc2626', padding: '0.2rem 0.75rem 0.3rem 2.2rem' }}>
                        {fetchErr}
                      </div>
                    )}
                    {leewayFetchErr && (
                      <div style={{ fontSize: '0.72rem', color: '#7c3aed', padding: '0.2rem 0.75rem 0.3rem 2.2rem' }}>
                        {leewayFetchErr}
                      </div>
                    )}
                  </div>
                )}

                {/* Price history */}
                {pricesOpen && (
                  <div style={{ borderBottom: (isLast && !txOpen) ? 'none' : '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                    {priceList.map((p, pi) => {
                      const isEditingPrice = editPriceKey?.secId === s.id && editPriceKey?.idx === pi
                      return (
                        <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.28rem 0.75rem', paddingLeft: '2.2rem', borderBottom: pi < priceList.length - 1 ? '1px solid var(--color-border)' : '1px dashed var(--color-border)', fontSize: '0.78rem' }}>
                          {isEditingPrice ? (
                            <>
                              <input type="date" value={editPriceDate} onChange={e => setEditPriceDate(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                              <input type="number" value={editPriceValue} onChange={e => setEditPriceValue(e.target.value)} step="0.0001" style={{ width: 90, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                              <button onClick={saveEditPrice} style={{ ...btnBase, fontSize: '0.68rem', background: '#16a34a', color: '#fff' }}>✓</button>
                              <button onClick={() => setEditPriceKey(null)} style={{ ...btnBase, fontSize: '0.68rem', background: '#e5e7eb', color: '#374151' }}>✕</button>
                            </>
                          ) : (
                            <>
                              <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>{p.date}</span>
                              <span style={{ flex: 1, fontWeight: 500 }}>{fmt(p.value)}</span>
                              <button onClick={() => startEditPrice(s.id, pi)} style={{ ...btnBase, fontSize: '0.68rem', background: '#e5e7eb', color: '#374151' }}>✎</button>
                              <button onClick={() => removePrice(s.id, pi)} style={{ ...btnBase, fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626' }}>✕</button>
                            </>
                          )}
                        </div>
                      )
                    })}
                    {/* Add price inline */}
                    <form
                      onSubmit={e => { e.preventDefault(); addPriceInline(s.id) }}
                      style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.35rem 0.75rem', paddingLeft: '2.2rem', borderTop: priceList.length ? '1px dashed var(--color-border)' : 'none' }}
                    >
                      <input type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} required style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                      <input type="number" value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder="Kurs" step="0.0001" min="0" required style={{ width: 100, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                      <button type="submit" style={{ ...btnBase, fontSize: '0.68rem', background: 'var(--color-primary)', color: '#fff' }}>+ Kurs</button>
                    </form>
                  </div>
                )}

                {/* ── Transactions ── */}
                {txOpen && (
                  <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)', background: '#fafafa' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.28rem 0.75rem', paddingLeft: '1.5rem', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: '0.7rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Transaktionen
                      {depots.length === 0 && <span style={{ fontWeight: 400, textTransform: 'none', color: '#dc2626', marginLeft: '0.5rem' }}>– Bitte zuerst ein Depot anlegen</span>}
                    </div>

                    {/* Existing transactions */}
                    {secTxs.map((t, ti) => {
                      const isEditingTx = editTxId === t.id
                      const isIncome    = INCOME_TX.has(t.type)
                      const total       = isIncome
                        ? t.price - (t.fees || 0)
                        : t.quantity * t.price + (t.type === 'buy' ? (t.fees || 0) : -(t.fees || 0))
                      return (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.28rem 0.75rem', paddingLeft: '1.5rem', borderBottom: ti < secTxs.length - 1 ? '1px solid var(--color-border)' : '1px dashed var(--color-border)', fontSize: '0.78rem', flexWrap: 'wrap' }}>
                          {isEditingTx ? (
                            <>
                              <input type="date" value={editTxDate} onChange={e => setEditTxDate(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem', width: 120 }} />
                              {depots.length > 1 && (
                                <select value={editTxDepotId} onChange={e => setEditTxDepotId(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }}>
                                  {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                              )}
                              <select value={editTxType} onChange={e => setEditTxType(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }}>
                                {Object.entries(TX_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                              {!INCOME_TX.has(editTxType) && (
                                <input type="number" value={editTxQty} onChange={e => setEditTxQty(e.target.value)} placeholder="Anzahl" step="0.0001" min="0" style={{ width: 75, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                              )}
                              <input type="number" value={editTxPrice} onChange={e => setEditTxPrice(e.target.value)} placeholder={INCOME_TX.has(editTxType) ? 'Betrag' : 'Kurs/Stk.'} step="0.0001" min="0" style={{ width: 90, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                              <input type="number" value={editTxFees} onChange={e => setEditTxFees(e.target.value)} placeholder="Gebühren" step="0.01" min="0" style={{ width: 75, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                              <button onClick={saveEditTx} style={{ ...btnBase, fontSize: '0.68rem', background: '#16a34a', color: '#fff' }}>✓</button>
                              <button onClick={() => setEditTxId(null)} style={{ ...btnBase, fontSize: '0.68rem', background: '#e5e7eb', color: '#374151' }}>✕</button>
                            </>
                          ) : (
                            <>
                              <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>{t.date}</span>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: TX_COLORS[t.type], background: TX_BG[t.type], borderRadius: 4, padding: '0.05rem 0.3rem', flexShrink: 0 }}>
                                {TX_LABELS[t.type]}
                              </span>
                              {depots.length > 1 && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>{depotName(t.depotId)}</span>
                              )}
                              {isIncome ? (
                                <span style={{ flex: 1 }}>{fmt(t.price)}</span>
                              ) : (
                                <span style={{ flex: 1, color: 'var(--color-text-muted)' }}>
                                  {t.quantity.toLocaleString('de-DE', { maximumFractionDigits: 4 })} × {fmt(t.price)}
                                </span>
                              )}
                              {t.fees > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{fmt(t.fees)} Geb.</span>}
                              <span style={{ fontWeight: 700, minWidth: 70, textAlign: 'right', color: isIncome ? '#2563eb' : t.type === 'sell' ? '#dc2626' : '#16a34a' }}>
                                {isIncome ? '+' : t.type === 'sell' ? '' : ''}{fmt(total)}
                              </span>
                              <button onClick={() => startEditTx(t)} style={{ ...btnBase, fontSize: '0.68rem', background: '#e5e7eb', color: '#374151' }}>✎</button>
                              <button onClick={() => removeTx(t.id)} style={{ ...btnBase, fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626' }}>✕</button>
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Add transaction inline */}
                    {depots.length > 0 && (
                      <form
                        onSubmit={e => { e.preventDefault(); addTxInline(s.id) }}
                        style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.35rem 0.75rem', paddingLeft: '1.5rem', borderTop: secTxs.length ? '1px dashed var(--color-border)' : 'none' }}
                      >
                        <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} required style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                        {depots.length > 1 && (
                          <select value={txDepotId} onChange={e => setTxDepotId(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }}>
                            <option value="">– Depot –</option>
                            {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        )}
                        <select value={txType} onChange={e => setTxType(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }}>
                          {Object.entries(TX_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        {!INCOME_TX.has(txType) && (
                          <input type="number" value={txQty} onChange={e => setTxQty(e.target.value)} placeholder="Anzahl" step="0.0001" min="0.0001" required style={{ width: 75, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                        )}
                        <input type="number" value={txPrice} onChange={e => setTxPrice(e.target.value)} placeholder={INCOME_TX.has(txType) ? 'Betrag' : 'Kurs/Stk.'} step="0.0001" min="0" required style={{ width: 90, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                        <input type="number" value={txFees} onChange={e => setTxFees(e.target.value)} placeholder="Gebühren" step="0.01" min="0" style={{ width: 75, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                        <button type="submit" style={{ ...btnBase, fontSize: '0.68rem', background: '#16a34a', color: '#fff' }}>+ Transaktion</button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── API-Konfiguration (Kursdaten) ── */}
      <p style={sectionHead}>API-Konfiguration (Kursdaten)</p>

      {/* Alpha Vantage */}
      <div style={{ background: alphaKey ? '#f0fdf4' : '#fef9c3', border: `1px solid ${alphaKey ? '#bbf7d0' : '#fde68a'}`, borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem', fontSize: '0.82rem' }}>
        <p style={{ margin: '0 0 0.4rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Alpha Vantage</p>
        {!alphaKey && (
          <p style={{ margin: '0 0 0.5rem', color: '#92400e' }}>
            Kostenloser API-Schlüssel unter{' '}
            <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
              alphavantage.co
            </a>{' '}
            (keine Kreditkarte). Limit: 25 Abfragen/Tag.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={alphaKey}
            onChange={e => saveAlphaKey(e.target.value)}
            placeholder="Alpha Vantage API-Schlüssel"
            style={{ flex: 1, minWidth: 200, fontSize: '0.82rem', padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}
          />
          {alphaKey && <span style={{ color: '#16a34a', fontSize: '0.78rem', fontWeight: 600 }}>✓ Gespeichert</span>}
        </div>
        {alphaKey && (
          <p style={{ margin: '0.4rem 0 0', color: '#166534', fontSize: '0.75rem' }}>
            Symbolformat: US-Aktien = <code>AAPL</code>, Deutsche Aktien = <code>SAP.FRA</code>, ETFs = <code>VWCE.FRA</code>
          </p>
        )}
      </div>

      {/* Leeway */}
      <div style={{ background: leewayKey ? '#faf5ff' : '#fef9c3', border: `1px solid ${leewayKey ? '#ddd6fe' : '#fde68a'}`, borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.82rem' }}>
        <p style={{ margin: '0 0 0.4rem', fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Leeway</p>
        {!leewayKey && (
          <p style={{ margin: '0 0 0.5rem', color: '#92400e' }}>
            Kostenloser API-Token unter{' '}
            <a href="https://leeway.tech" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>
              leeway.tech
            </a>{' '}
            (keine Kreditkarte). Limit: 100.000 Abfragen/Tag.
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={leewayKey}
            onChange={e => saveLeewayKey(e.target.value)}
            placeholder="Leeway API-Token"
            style={{ flex: 1, minWidth: 200, fontSize: '0.82rem', padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}
          />
          {leewayKey && <span style={{ color: '#7c3aed', fontSize: '0.78rem', fontWeight: 600 }}>✓ Gespeichert</span>}
        </div>
        {leewayKey && (
          <p style={{ margin: '0.4rem 0 0', color: '#5b21b6', fontSize: '0.75rem' }}>
            Symbolformat: Deutsche Aktien = <code>DTE.XETRA</code>, US-Aktien = <code>AAPL.US</code>, ETFs = <code>VWCE.XETRA</code>
          </p>
        )}
      </div>

      {/* ── Add security form (unterhalb der Liste) ── */}
      <p style={sectionHead}>Wertpapier hinzufügen</p>
      <form onSubmit={addSecurity} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', flex: 2, minWidth: 140 }}>
          <span style={labelStyle}>Name</span>
          <input value={secName} onChange={e => setSecName(e.target.value)} placeholder="z. B. Apple Inc." required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
          <span style={labelStyle}>Ticker / Symbol</span>
          <input value={secSymbol} onChange={e => setSecSymbol(e.target.value)} placeholder="AAPL" required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
          <span style={labelStyle}>ISIN (optional)</span>
          <input value={secIsin} onChange={e => setSecIsin(e.target.value)} placeholder="US0378331005" maxLength={12} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
          <span style={labelStyle}>Typ</span>
          <select value={secType} onChange={e => setSecType(e.target.value)}>
            {SEC_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 80 }}>
          <span style={labelStyle}>Währung</span>
          <select value={secCur} onChange={e => setSecCur(e.target.value)}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <button type="submit" style={{ alignSelf: 'flex-end' }}>+ Wertpapier</button>
      </form>

      {/* ── Devisenkurse: Liste ── */}
      <p style={{ ...sectionHead, marginTop: '0.5rem' }}>Devisenkurse (je 1 Fremdwährung in EUR)</p>
      {usedFxPairs.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '0.5rem' }}>
          {usedFxPairs.map((pair, pi) => {
            const list       = (fxRates[pair] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
            const latest     = getLatestFx(pair)
            const isFetching = fetchingFx[pair]
            const fetchErr   = fetchFxErr[pair]
            return (
              <div key={pair} style={{ borderBottom: pi < usedFxPairs.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.42rem 0.75rem', background: 'var(--color-bg)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, minWidth: 40 }}>{pair}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', flex: 1 }}>→ EUR</span>
                  <span style={{ fontWeight: 600 }}>{latest !== null ? latest.toFixed(4) : '–'}</span>
                  <button
                    onClick={() => handleFetchApiFx(pair)}
                    disabled={isFetching}
                    style={{ ...btnBase, background: '#dbeafe', color: '#1d4ed8' }}
                    title={`Aktuellen ${pair}/EUR Kurs von Frankfurter.app abrufen`}
                  >
                    {isFetching ? '…' : '↓ API-Kurs'}
                  </button>
                </div>
                {fetchErr && (
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', padding: '0.15rem 0.75rem 0.25rem 1.6rem' }}>
                    {fetchErr}
                  </div>
                )}
                {list.map((r, ri) => {
                  const isEditingFx = editFxKey?.pair === pair && editFxKey?.idx === ri
                  return (
                    <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.26rem 0.75rem', paddingLeft: '1.6rem', borderTop: '1px solid var(--color-border)', fontSize: '0.78rem' }}>
                      {isEditingFx ? (
                        <>
                          <input type="date" value={editFxDate} onChange={e => setEditFxDate(e.target.value)} style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                          <input type="number" value={editFxValue} onChange={e => setEditFxValue(e.target.value)} step="0.0001" style={{ width: 90, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                          <button onClick={saveEditFx} style={{ ...btnBase, fontSize: '0.68rem', background: '#16a34a', color: '#fff' }}>✓</button>
                          <button onClick={() => setEditFxKey(null)} style={{ ...btnBase, fontSize: '0.68rem', background: '#e5e7eb', color: '#374151' }}>✕</button>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>{r.date}</span>
                          <span style={{ flex: 1 }}>{r.value.toFixed(4)}</span>
                          <button onClick={() => startEditFx(pair, ri)} style={{ ...btnBase, fontSize: '0.68rem', background: '#e5e7eb', color: '#374151' }}>✎</button>
                          <button onClick={() => removeFxRate(pair, ri)} style={{ ...btnBase, fontSize: '0.68rem', background: '#fee2e2', color: '#dc2626' }}>✕</button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Devisenkurs hinzufügen (unterhalb der Liste) ── */}
      <form onSubmit={addFxRate} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
          <span style={labelStyle}>Währung</span>
          <select value={fxPair} onChange={e => setFxPair(e.target.value)}>
            {CURRENCIES.filter(c => c !== 'EUR').map(c => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={labelStyle}>Datum</span>
          <input type="date" value={fxDate} onChange={e => setFxDate(e.target.value)} required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 100 }}>
          <span style={labelStyle}>Kurs (EUR)</span>
          <input type="number" value={fxValue} onChange={e => setFxValue(e.target.value)} placeholder="0.9200" step="0.0001" min="0" required />
        </label>
        <button type="submit" style={{ alignSelf: 'flex-end' }}>+ Devisenkurs</button>
      </form>
    </div>
  )
}
