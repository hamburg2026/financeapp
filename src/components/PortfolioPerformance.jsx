import { useState, useRef } from 'react'
import { fmt } from '../fmt'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtShort(n) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' Mio. €'
  if (abs >= 10_000)    return (n / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k €'
  if (abs >= 1_000)     return (n / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + 'k €'
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

function fmtPct(n, decimals = 2) {
  return (n >= 0 ? '+' : '') + n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' %'
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

// Latest price on or before 'date' from a price history array
function getPriceOn(history, date) {
  const rel = (history || []).filter(p => p.date <= date)
  if (!rel.length) return null
  return [...rel].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

// Compute (value, cost) of a depot at a given date
function depotValueAt(depotId, date, transactions, prices) {
  const pos = {}
  transactions
    .filter(t => t.depotId === depotId && t.date <= date)
    .forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { qty: 0, cost: 0 }
      if (t.type === 'buy')  { pos[t.securityId].qty += t.quantity; pos[t.securityId].cost += t.quantity * t.price + (t.fees || 0) }
      if (t.type === 'sell') { pos[t.securityId].qty -= t.quantity; pos[t.securityId].cost -= t.quantity * t.price - (t.fees || 0) }
    })
  let value = 0, cost = 0
  Object.entries(pos).forEach(([secId, p]) => {
    if (p.qty <= 0.0001) return
    const price = getPriceOn(prices[secId], date)
    if (price !== null) { value += p.qty * price; cost += p.cost }
    else cost += p.cost
  })
  return { value, cost }
}

// All price dates for a set of security IDs
function priceDatesFor(secIds, prices) {
  const set = new Set()
  secIds.forEach(secId => (prices[secId] || []).forEach(p => set.add(p.date)))
  return [...set].sort()
}

// Build value+cost time series for one or all depots
function buildDepotSeries(depotList, transactions, prices, color) {
  const secIds = [...new Set(
    transactions.filter(t => depotList.some(d => d.id === t.depotId)).map(t => t.securityId)
  )]
  const dates = priceDatesFor(secIds, prices)

  const valuePts = [], costPts = []
  dates.forEach(date => {
    let totalValue = 0, totalCost = 0
    depotList.forEach(d => {
      const { value, cost } = depotValueAt(d.id, date, transactions, prices)
      totalValue += value; totalCost += cost
    })
    if (totalValue > 0) {
      valuePts.push({ date, value: totalValue })
      costPts.push({ date, value: totalCost })
    }
  })

  return [
    { label: depotList.length === 1 ? 'Marktwert' : 'Marktwert (Gesamt)', color, points: valuePts },
    { label: depotList.length === 1 ? 'Einstand'  : 'Einstand (Gesamt)',  color: '#9ca3af', dashed: true, points: costPts },
  ]
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const COLORS = ['#1a6b3c', '#2563eb', '#dc2626', '#f59e0b', '#8b5cf6', '#14b8a6', '#ec4899']

// ─── SVG Line Chart ───────────────────────────────────────────────────────────

const VW = 720, VH = 280
const PAD = { t: 20, r: 22, b: 48, l: 78 }

function LineChart({ series }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)

  const hasEnough = series.some(s => s.points.length >= 2)
  if (!hasEnough) {
    return (
      <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2.5rem 0', fontSize: '0.88rem' }}>
        Zu wenig Kursdaten für Verlaufsgrafik. Bitte mehr Kurse in „Wertpapiere &amp; Depots" erfassen.
      </p>
    )
  }

  const innerW = VW - PAD.l - PAD.r
  const innerH = VH - PAD.t - PAD.b

  const allDates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort()
  const allVals  = series.flatMap(s => s.points.map(p => p.value))
  const rawMin   = Math.min(...allVals)
  const rawMax   = Math.max(...allVals)
  const rng      = (rawMax - rawMin) || 1
  const yMin     = rawMin - rng * 0.08
  const yMax     = rawMax + rng * 0.08
  const n        = allDates.length

  const xi = i  => PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yv = val => PAD.t + innerH - ((val - yMin) / (yMax - yMin)) * innerH

  // Y ticks
  const Y_TICKS  = 5
  const yTicks   = Array.from({ length: Y_TICKS + 1 }, (_, i) => yMin + (yMax - yMin) * i / Y_TICKS)

  // X ticks (max 7, always include last)
  const step     = Math.max(1, Math.ceil(n / 7))
  const xTicks   = allDates.map((d, i) => ({ d, i })).filter(({ i }) => i % step === 0 || i === n - 1)

  // SVG paths per series
  const paths = series.map(s => {
    if (s.points.length < 2) return null
    return s.points
      .map((p, j) => `${j === 0 ? 'M' : 'L'}${xi(allDates.indexOf(p.date)).toFixed(1)},${yv(p.value).toFixed(1)}`)
      .join(' ')
  })

  // Mouse → date index
  const onMouseMove = e => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX  = ((e.clientX - rect.left) / rect.width) * VW
    const raw   = (svgX - PAD.l) / (innerW / Math.max(n - 1, 1))
    setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(raw))))
  }

  const hd       = hoverIdx !== null ? allDates[hoverIdx] : null
  const tipLeft  = hoverIdx !== null && hoverIdx < n * 0.65  // tooltip right-of-crosshair vs left

  // Convert SVG X to % of viewBox (for absolute tooltip positioning)
  const tipXpct  = hoverIdx !== null ? ((xi(hoverIdx) / VW) * 100).toFixed(1) : '0'

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        style={{ display: 'block', minWidth: 280, cursor: 'crosshair' }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal grid + Y axis labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={PAD.l + innerW} y1={yv(v)} y2={yv(v)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={PAD.l - 7} y={yv(v) + 4} textAnchor="end" fontSize={10} fill="#9ca3af">
              {fmtShort(v)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xTicks.map(({ d, i }) => (
          <text key={i} x={xi(i)} y={PAD.t + innerH + 18} textAnchor="middle" fontSize={10} fill="#9ca3af">
            {d.slice(0, 7)}
          </text>
        ))}

        {/* Lines */}
        {series.map((s, si) => paths[si] && (
          <path
            key={si}
            d={paths[si]}
            stroke={s.color}
            strokeWidth={s.dashed ? 1.8 : 2.5}
            strokeDasharray={s.dashed ? '6,4' : undefined}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Hover crosshair + dots */}
        {hoverIdx !== null && (
          <>
            <line
              x1={xi(hoverIdx)} x2={xi(hoverIdx)}
              y1={PAD.t} y2={PAD.t + innerH}
              stroke="rgba(0,0,0,0.18)" strokeWidth={1} strokeDasharray="4,3"
            />
            {series.map((s, si) => {
              const pt = s.points.find(p => p.date === hd)
              return pt ? (
                <circle key={si} cx={xi(hoverIdx)} cy={yv(pt.value)} r={4} fill={s.color} stroke="white" strokeWidth={2} />
              ) : null
            })}
          </>
        )}
      </svg>

      {/* Floating tooltip */}
      {hd && (
        <div style={{
          position: 'absolute',
          top: `${(PAD.t / VH * 100).toFixed(1)}%`,
          ...(tipLeft
            ? { left: `calc(${tipXpct}% + 10px)` }
            : { right: `calc(${(100 - parseFloat(tipXpct)).toFixed(1)}% + 10px)` }
          ),
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '0.5rem 0.75rem',
          fontSize: '0.78rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          zIndex: 10,
          pointerEvents: 'none',
          minWidth: 140,
        }}>
          <div style={{ fontWeight: 600, color: '#6b7280', fontSize: '0.72rem', marginBottom: '0.3rem' }}>{hd}</div>
          {series.map((s, si) => {
            const pt = s.points.find(p => p.date === hd)
            return pt ? (
              <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 2, whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: s.dashed ? 2 : '50%', background: s.color, flexShrink: 0 }} />
                <span style={{ color: '#6b7280', flex: 1, fontSize: '0.72rem' }}>{s.label}</span>
                <span style={{ fontWeight: 700 }}>{fmt(pt.value)}</span>
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ series }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', justifyContent: 'center', marginTop: '0.5rem' }}>
      {series.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
          <svg width={22} height={10} style={{ flexShrink: 0 }}>
            <line x1={0} y1={5} x2={22} y2={5} stroke={s.color} strokeWidth={s.dashed ? 1.8 : 2.5} strokeDasharray={s.dashed ? '5,3' : undefined} />
          </svg>
          <span style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, subColor, noCard }) {
  const inner = (
    <>
      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: subColor || 'var(--color-text)' }}>
        {value}
      </span>
    </>
  )
  if (noCard) return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{inner}</div>
  return (
    <div style={{
      background: 'var(--color-bg)', borderRadius: 10, padding: '0.7rem 1rem',
      display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 120px',
    }}>
      {inner}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortfolioPerformance() {
  const depots       = JSON.parse(localStorage.getItem('depots'))            || []
  const transactions = JSON.parse(localStorage.getItem('depotTransactions')) || []
  const securities   = JSON.parse(localStorage.getItem('securities'))        || []
  const prices       = JSON.parse(localStorage.getItem('securityPrices'))    || {}

  const [tab,         setTab]         = useState('depots')
  const [depotMode,   setDepotMode]   = useState('single')   // 'single' | 'all'
  const [selDepotId,  setSelDepotId]  = useState(depots[0]?.id ?? null)
  const [selSecId,    setSelSecId]    = useState(securities[0]?.id ?? null)

  const tabSt = active => ({
    padding: '0.38rem 0.9rem', fontSize: '0.83rem', cursor: 'pointer', borderRadius: 8,
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
  })

  // ── Depot tab data ────────────────────────────────────────────────────────

  const selectedDepots = depotMode === 'all'
    ? depots
    : depots.filter(d => d.id === parseInt(selDepotId))

  const depotSeries = selectedDepots.length > 0
    ? buildDepotSeries(selectedDepots, transactions, prices, COLORS[0])
    : []

  const valuePts = depotSeries[0]?.points || []
  const costPts  = depotSeries[1]?.points || []
  const lastVal  = valuePts[valuePts.length - 1]?.value ?? 0
  const lastCost = costPts[costPts.length - 1]?.value ?? 0
  const depotPnl = lastVal - lastCost
  const depotPct = lastCost > 0 ? (depotPnl / lastCost) * 100 : null

  // ── Security tab data ─────────────────────────────────────────────────────

  const selSec     = securities.find(s => s.id == selSecId)
  const secHistory = selSecId
    ? (prices[selSecId] || []).slice().sort((a, b) => a.date.localeCompare(b.date))
    : []
  const secSeries  = selSec && secHistory.length > 0
    ? [{ label: selSec.name + (selSec.symbol ? ` (${selSec.symbol})` : ''), color: COLORS[0], points: secHistory }]
    : []

  const firstPt   = secHistory[0]
  const lastPt    = secHistory[secHistory.length - 1]
  const secChange = (firstPt && lastPt) ? lastPt.value - firstPt.value : null
  const secPct    = (firstPt?.value > 0 && secChange !== null) ? (secChange / firstPt.value) * 100 : null

  // Holdings per depot for selected security
  const holdings = selSecId ? depots.map(depot => {
    const pos = { qty: 0, cost: 0 }
    transactions.filter(t => t.depotId === depot.id && t.securityId == selSecId).forEach(t => {
      if (t.type === 'buy')  { pos.qty += t.quantity; pos.cost += t.quantity * t.price + (t.fees || 0) }
      if (t.type === 'sell') { pos.qty -= t.quantity; pos.cost -= t.quantity * t.price - (t.fees || 0) }
    })
    if (pos.qty <= 0.0001) return null
    const curPrice = lastPt?.value || 0
    const curValue = pos.qty * curPrice
    const pnl      = curValue - pos.cost
    const pct      = pos.cost > 0 ? (pnl / pos.cost) * 100 : null
    return { depot, qty: pos.qty, cost: pos.cost, curValue, pnl, pct }
  }).filter(Boolean) : []

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="module">
      <h2>Wertentwicklung</h2>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
        <button style={tabSt(tab === 'depots')}     onClick={() => setTab('depots')}>Depots</button>
        <button style={tabSt(tab === 'securities')} onClick={() => setTab('securities')}>Einzeltitel</button>
      </div>

      {/* ══ Depots tab ══════════════════════════════════════════════════════ */}
      {tab === 'depots' && (
        depots.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Noch keine Depots angelegt. Bitte zuerst Depots und Transaktionen in „Wertpapiere &amp; Depots" erfassen.
          </p>
        ) : (
          <>
            {/* Controls */}
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {depots.length > 1 && (
                <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)', height: 34 }}>
                  {[['single', 'Einzelnes Depot'], ['all', 'Alle Depots']].map(([m, l]) => (
                    <button key={m} type="button" onClick={() => setDepotMode(m)} style={{
                      border: 'none', cursor: 'pointer', padding: '0 0.75rem', fontSize: '0.78rem',
                      fontWeight: depotMode === m ? 700 : 400,
                      background: depotMode === m ? 'var(--color-primary)' : 'transparent',
                      color: depotMode === m ? '#fff' : 'var(--color-text-muted)',
                    }}>{l}</button>
                  ))}
                </div>
              )}
              {(depotMode === 'single' || depots.length === 1) && (
                <select
                  value={selDepotId ?? ''}
                  onChange={e => setSelDepotId(parseInt(e.target.value))}
                  style={{ fontSize: '0.85rem', minWidth: 160 }}
                >
                  {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>

            {/* Chart */}
            <LineChart series={depotSeries} />
            {depotSeries.length > 0 && depotSeries.some(s => s.points.length >= 2) && (
              <Legend series={depotSeries} />
            )}

            {/* KPI row */}
            {lastVal > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <KpiCard label="Aktueller Wert" value={fmt(lastVal)} />
                <KpiCard label="Einstand"        value={fmt(lastCost)} />
                <KpiCard
                  label="Gewinn / Verlust"
                  value={(depotPnl >= 0 ? '+' : '') + fmt(depotPnl)}
                  subColor={depotPnl >= 0 ? '#16a34a' : '#dc2626'}
                />
                {depotPct !== null && (
                  <KpiCard
                    label="Rendite"
                    value={fmtPct(depotPct)}
                    subColor={depotPct >= 0 ? '#16a34a' : '#dc2626'}
                  />
                )}
              </div>
            )}
          </>
        )
      )}

      {/* ══ Einzeltitel tab ═════════════════════════════════════════════════ */}
      {tab === 'securities' && (
        securities.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Noch keine Wertpapiere erfasst. Bitte zuerst Wertpapiere und Kurse in „Wertpapiere &amp; Depots" anlegen.
          </p>
        ) : (
          <>
            {/* Security selector */}
            <div style={{ marginBottom: '1rem' }}>
              <select
                value={selSecId ?? ''}
                onChange={e => setSelSecId(parseInt(e.target.value))}
                style={{ fontSize: '0.88rem', minWidth: 220 }}
              >
                {securities.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.symbol ? ` (${s.symbol})` : ''}
                    {prices[s.id]?.length ? ` – ${prices[s.id].length} Kurse` : ' – keine Kurse'}
                  </option>
                ))}
              </select>
            </div>

            {/* Chart */}
            <LineChart series={secSeries} />

            {/* KPI row */}
            {lastPt && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <KpiCard label={`Aktueller Kurs (${lastPt.date})`} value={fmt(lastPt.value)} />
                {firstPt && firstPt.date !== lastPt.date && (
                  <KpiCard label={`Erster Kurs (${firstPt.date})`} value={fmt(firstPt.value)} />
                )}
                {secChange !== null && (
                  <KpiCard
                    label="Kursentwicklung"
                    value={(secChange >= 0 ? '+' : '') + fmt(secChange)}
                    subColor={secChange >= 0 ? '#16a34a' : '#dc2626'}
                  />
                )}
                {secPct !== null && (
                  <KpiCard
                    label="Rendite (Kurs)"
                    value={fmtPct(secPct)}
                    subColor={secPct >= 0 ? '#16a34a' : '#dc2626'}
                  />
                )}
                <KpiCard label="Erfasste Kurse" value={String(secHistory.length)} />
              </div>
            )}

            {/* Holdings table */}
            {holdings.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{
                  fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem',
                }}>
                  Positionen in Depots
                </div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                        {['Depot', 'Anzahl', 'Einstand', 'Aktueller Wert', 'G/V', '%'].map((h, i) => (
                          <th key={h} style={{
                            padding: '0.35rem 0.6rem',
                            textAlign: i === 0 ? 'left' : 'right',
                            fontWeight: 600, fontSize: '0.72rem', color: 'var(--color-text-muted)',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map(({ depot, qty, cost, curValue, pnl, pct }, i) => (
                        <tr key={depot.id} style={{ borderBottom: i < holdings.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                          <td style={{ padding: '0.4rem 0.6rem', fontWeight: 500 }}>{depot.name}</td>
                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                            {qty.toLocaleString('de-DE', { maximumFractionDigits: 4 })}
                          </td>
                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--color-text-muted)' }}>{fmt(cost)}</td>
                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>{fmt(curValue)}</td>
                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontWeight: 700, color: pnl >= 0 ? '#16a34a' : '#dc2626' }}>
                            {(pnl >= 0 ? '+' : '') + fmt(pnl)}
                          </td>
                          <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: (pct ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                            {pct != null ? fmtPct(pct, 1) : '–'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
