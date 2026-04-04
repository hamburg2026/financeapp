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

const btnBase = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.45rem', lineHeight: 1.4 }
const labelStyle = { fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: 2, display: 'block' }

export default function Securities() {
  const [securities,   setSecurities]   = useLocalStorage('securities', [])
  const [prices,       setPrices]       = useLocalStorage('securityPrices', {})
  const [fxRates,      setFxRates]      = useLocalStorage('fxRates', {})

  // ── Add security form ──
  const [secName,   setSecName]   = useState('')
  const [secSymbol, setSecSymbol] = useState('')
  const [secType,   setSecType]   = useState('Aktie')
  const [secCur,    setSecCur]    = useState('EUR')

  // ── Edit security ──
  const [editSecId,     setEditSecId]     = useState(null)
  const [editSecName,   setEditSecName]   = useState('')
  const [editSecSymbol, setEditSecSymbol] = useState('')
  const [editSecType,   setEditSecType]   = useState('Aktie')
  const [editSecCur,    setEditSecCur]    = useState('EUR')

  // ── Price form ──
  const [priceSecId,   setPriceSecId]   = useState('')
  const [priceDate,    setPriceDate]    = useState('')
  const [priceValue,   setPriceValue]   = useState('')

  // ── Edit price ──
  const [editPriceKey, setEditPriceKey] = useState(null) // { secId, index }
  const [editPriceDate, setEditPriceDate] = useState('')
  const [editPriceValue, setEditPriceValue] = useState('')

  // ── FX rate form ──
  const [fxPair,  setFxPair]  = useState('USD')
  const [fxDate,  setFxDate]  = useState('')
  const [fxValue, setFxValue] = useState('')

  // ── Edit FX rate ──
  const [editFxKey, setEditFxKey] = useState(null) // { pair, index }
  const [editFxDate, setEditFxDate] = useState('')
  const [editFxValue, setEditFxValue] = useState('')

  // ── Expanded price lists ──
  const [expandedPrices, setExpandedPrices] = useState(new Set())

  // ─── Security CRUD ───────────────────────────────────────────────────────────
  function addSecurity(e) {
    e.preventDefault()
    setSecurities([...securities, { id: Date.now(), name: secName, symbol: secSymbol, type: secType, currency: secCur }])
    setSecName(''); setSecSymbol(''); setSecType('Aktie'); setSecCur('EUR')
  }

  function startEditSec(s) {
    setEditSecId(s.id)
    setEditSecName(s.name)
    setEditSecSymbol(s.symbol)
    setEditSecType(s.type || 'Aktie')
    setEditSecCur(s.currency || 'EUR')
  }

  function saveEditSec() {
    setSecurities(securities.map(s => s.id === editSecId
      ? { ...s, name: editSecName, symbol: editSecSymbol, type: editSecType, currency: editSecCur }
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
  function addPrice(e) {
    e.preventDefault()
    const secId = priceSecId || securities[0]?.id
    if (!secId) return
    const list = [...(prices[secId] || []), { date: priceDate, value: parseFloat(priceValue) }]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    setPrices({ ...prices, [secId]: list })
    setPriceDate(''); setPriceValue('')
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

  // ─── FX Rates CRUD ───────────────────────────────────────────────────────────
  // fxRates: { 'USD': [{date, value}, ...], 'GBP': [...] }
  // value = wie viele EUR je 1 Fremdwährung

  function addFxRate(e) {
    e.preventDefault()
    const list = [...(fxRates[fxPair] || []), { date: fxDate, value: parseFloat(fxValue) }]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    setFxRates({ ...fxRates, [fxPair]: list })
    setFxDate(''); setFxValue('')
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

  const usedFxPairs = [...new Set([
    ...Object.keys(fxRates),
    ...securities.filter(s => s.currency && s.currency !== 'EUR').map(s => s.currency),
  ])]

  const sectionHead = { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '0.5rem', marginTop: '1.5rem' }

  return (
    <div className="module">
      <h2>Wertpapiere</h2>

      {/* ── Add security ── */}
      <p style={sectionHead}>Wertpapier hinzufügen</p>
      <form onSubmit={addSecurity} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', flex: 2, minWidth: 140 }}>
          <span style={labelStyle}>Name</span>
          <input value={secName} onChange={e => setSecName(e.target.value)} placeholder="z. B. Apple Inc." required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
          <span style={labelStyle}>Symbol / ISIN</span>
          <input value={secSymbol} onChange={e => setSecSymbol(e.target.value)} placeholder="AAPL" required />
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

      {/* ── Securities list ── */}
      {securities.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {securities.map((s, si) => {
            const price = getCurrentPrice(s.id)
            const pricesOpen = expandedPrices.has(s.id)
            const priceList  = (prices[s.id] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
            const isEditing  = editSecId === s.id
            const isLast     = si === securities.length - 1

            return (
              <div key={s.id}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'flex-end', padding: '0.45rem 0.75rem', borderBottom: isLast ? 'none' : '1px solid var(--color-border)', background: '#fefce8' }}>
                    <input value={editSecName} onChange={e => setEditSecName(e.target.value)}
                      style={{ flex: 2, minWidth: 120, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="Name" />
                    <input value={editSecSymbol} onChange={e => setEditSecSymbol(e.target.value)}
                      style={{ width: 90, fontSize: '0.82rem', padding: '0.25rem 0.4rem' }} placeholder="Symbol" />
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.42rem 0.75rem', borderBottom: (!pricesOpen && isLast) ? 'none' : '1px solid var(--color-border)', background: 'var(--color-bg)', flexWrap: 'wrap' }}>
                    <button onClick={() => togglePrices(s.id)} style={{ ...btnBase, background: 'none', padding: '0.1rem 0.3rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {pricesOpen ? '▾' : '▸'}
                    </button>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>{s.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.symbol}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: 4, padding: '0.05rem 0.35rem' }}>{s.type}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: s.currency !== 'EUR' ? '#d97706' : 'var(--color-text-muted)' }}>{s.currency || 'EUR'}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.87rem', minWidth: 70, textAlign: 'right' }}>{price !== null ? fmt(price) : '–'}</span>
                    <button onClick={() => startEditSec(s)} style={{ ...btnBase, background: '#e5e7eb', color: '#374151' }} title="Bearbeiten">✎</button>
                    <button onClick={() => removeSecurity(s.id)} style={{ ...btnBase, background: '#fee2e2', color: '#dc2626' }} title="Löschen">✕</button>
                  </div>
                )}

                {/* Price history */}
                {pricesOpen && (
                  <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
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
                    <form onSubmit={e => { e.preventDefault(); const id = s.id; const list = [...(prices[id] || []), { date: priceDate, value: parseFloat(priceValue) }].sort((a, b) => new Date(b.date) - new Date(a.date)); setPrices({ ...prices, [id]: list }); setPriceDate(''); setPriceValue('') }} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', padding: '0.35rem 0.75rem', paddingLeft: '2.2rem', borderTop: priceList.length ? '1px dashed var(--color-border)' : 'none' }}>
                      <input type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} required style={{ fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                      <input type="number" value={priceValue} onChange={e => setPriceValue(e.target.value)} placeholder="Kurs" step="0.0001" min="0" required style={{ width: 100, fontSize: '0.78rem', padding: '0.18rem 0.35rem' }} />
                      <button type="submit" style={{ ...btnBase, fontSize: '0.68rem', background: 'var(--color-primary)', color: '#fff' }}>+ Kurs</button>
                    </form>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Devisenkurse ── */}
      <p style={sectionHead}>Devisenkurse (je 1 Fremdwährung in EUR)</p>
      <form onSubmit={addFxRate} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
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

      {usedFxPairs.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {usedFxPairs.map((pair, pi) => {
            const list = (fxRates[pair] || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
            const latest = getLatestFx(pair)
            return (
              <div key={pair} style={{ borderBottom: pi < usedFxPairs.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.42rem 0.75rem', background: 'var(--color-bg)', fontSize: '0.85rem' }}>
                  <span style={{ fontWeight: 700, minWidth: 40 }}>{pair}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', flex: 1 }}>→ EUR</span>
                  <span style={{ fontWeight: 600 }}>{latest !== null ? latest.toFixed(4) : '–'}</span>
                </div>
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
    </div>
  )
}
