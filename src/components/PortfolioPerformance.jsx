import { useState, useRef } from 'react'
import { fmt } from '../fmt'

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtShort(n) {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' Mio.'
  if (abs >= 10_000)    return (n / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k'
  if (abs >= 1_000)     return (n / 1_000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + 'k'
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 })
}

function fmtPct(n, decimals = 2) {
  return (n >= 0 ? '+' : '') + n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' %'
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const LINE_COLORS  = ['#4ade80', '#60a5fa', '#fb923c', '#f472b6', '#a78bfa', '#34d399', '#fbbf24']
const GLOW_COLORS  = ['#16a34a', '#2563eb', '#ea580c', '#db2777', '#7c3aed', '#059669', '#d97706']
const LABEL_COLORS = ['#16a34a', '#2563eb', '#ea580c', '#db2777', '#7c3aed', '#059669', '#d97706']

// ─── Period filter ────────────────────────────────────────────────────────────

const PERIODS = [
  { key: '1M', label: '1 M' },
  { key: '3M', label: '3 M' },
  { key: '6M', label: '6 M' },
  { key: '1J', label: '1 J' },
  { key: '3J', label: '3 J' },
  { key: '5J', label: '5 J' },
  { key: 'MAX', label: 'MAX' },
  { key: 'IND', label: 'Individuell' },
]

function periodFromDate(key) {
  if (key === 'MAX' || key === 'IND') return null
  const d = new Date()
  const map = { '1M': [1,0], '3M': [3,0], '6M': [6,0], '1J': [0,1], '3J': [0,3], '5J': [0,5] }
  const [months, years] = map[key] || [0,0]
  d.setMonth(d.getMonth() - months)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function applyPeriod(points, period, customFrom, customTo) {
  let pts = [...points]
  if (period === 'IND') {
    if (customFrom) pts = pts.filter(p => p.date >= customFrom)
    if (customTo)   pts = pts.filter(p => p.date <= customTo)
    return pts
  }
  const from = periodFromDate(period)
  return from ? pts.filter(p => p.date >= from) : pts
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getPriceOn(history, date) {
  const rel = (history || []).filter(p => p.date <= date)
  if (!rel.length) return null
  return [...rel].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

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

function priceDatesFor(secIds, prices) {
  const set = new Set()
  secIds.forEach(secId => (prices[secId] || []).forEach(p => set.add(p.date)))
  return [...set].sort()
}

function buildSingleDepotSeries(depot, transactions, prices, colorIdx, showCost) {
  const secIds = [...new Set(transactions.filter(t => t.depotId === depot.id).map(t => t.securityId))]
  const dates = priceDatesFor(secIds, prices)
  const valuePts = [], costPts = []
  dates.forEach(date => {
    const { value, cost } = depotValueAt(depot.id, date, transactions, prices)
    if (value > 0) {
      valuePts.push({ date, value })
      costPts.push({ date, value: cost })
    }
  })
  const series = [{ label: depot.name, colorIdx, points: valuePts }]
  if (showCost && costPts.length > 0) {
    series.push({ label: `${depot.name} (Einstand)`, colorIdx, dashed: true, points: costPts })
  }
  return series
}

// ─── Smooth bezier path (Catmull-Rom → Cubic Bezier) ─────────────────────────

function smoothPath(xys) {
  if (xys.length < 2) return ''
  let d = `M${xys[0][0].toFixed(1)},${xys[0][1].toFixed(1)}`
  for (let i = 0; i < xys.length - 1; i++) {
    const p0 = xys[Math.max(0, i - 1)]
    const p1 = xys[i]
    const p2 = xys[i + 1]
    const p3 = xys[Math.min(xys.length - 1, i + 2)]
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
  }
  return d
}

// ─── Fancy Chart ──────────────────────────────────────────────────────────────

const VW = 720, VH = 300
const PAD = { t: 24, r: 20, b: 52, l: 80 }
const DARK   = '#0f172a'
const DGRID  = 'rgba(148,163,184,0.08)'
const DLINE  = 'rgba(148,163,184,0.18)'
const DTXT   = '#64748b'

function FancyChart({ series }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)

  const hasEnough = series.some(s => s.points.length >= 2)
  if (!hasEnough) {
    return (
      <div style={{
        background: DARK, borderRadius: 16, padding: '3rem 1rem',
        textAlign: 'center', color: DTXT, fontSize: '0.88rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        Zu wenig Kursdaten – bitte mehr Kurse oder Transaktionen erfassen.
      </div>
    )
  }

  const innerW = VW - PAD.l - PAD.r
  const innerH = VH - PAD.t - PAD.b

  const allDates = [...new Set(series.flatMap(s => s.points.map(p => p.date)))].sort()
  const n = allDates.length
  const dateIdx = Object.fromEntries(allDates.map((d, i) => [d, i]))

  const allVals = series.flatMap(s => s.points.map(p => p.value))
  const rawMin  = Math.min(...allVals)
  const rawMax  = Math.max(...allVals)
  const rng     = (rawMax - rawMin) || 1
  const yMin    = rawMin - rng * 0.1
  const yMax    = rawMax + rng * 0.1

  const xi  = i   => PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const xid = d   => xi(dateIdx[d] ?? 0)
  const yv  = val => PAD.t + innerH - ((val - yMin) / (yMax - yMin)) * innerH

  // Precompute XY coordinates per series
  const seriesXY = series.map(s =>
    s.points.map(p => [xid(p.date), yv(p.value)])
  )

  const Y_TICKS = 5
  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => yMin + (yMax - yMin) * i / Y_TICKS)
  const step   = Math.max(1, Math.ceil(n / 8))
  const xTicks = allDates.map((d, i) => ({ d, i })).filter(({ i }) => i % step === 0 || i === n - 1)

  const onMouseMove = e => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX  = ((e.clientX - rect.left) / rect.width) * VW
    const raw   = (svgX - PAD.l) / (innerW / Math.max(n - 1, 1))
    setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(raw))))
  }

  const hd      = hoverIdx !== null ? allDates[hoverIdx] : null
  const tipLeft = hoverIdx !== null && hoverIdx < n * 0.65
  const tipXpct = hoverIdx !== null ? ((xi(hoverIdx) / VW) * 100).toFixed(1) : '0'

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        style={{ display: 'block', background: DARK, cursor: 'crosshair', minWidth: 280 }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {series.map((s, si) => {
            const c = LINE_COLORS[s.colorIdx % LINE_COLORS.length]
            return (
              <linearGradient key={si} id={`grad-pp-${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={c} stopOpacity={s.dashed ? 0.08 : 0.28} />
                <stop offset="100%" stopColor={c} stopOpacity="0.01" />
              </linearGradient>
            )
          })}
          <clipPath id="chart-clip-pp">
            <rect x={PAD.l} y={PAD.t} width={innerW} height={innerH} />
          </clipPath>
          {/* Subtle vignette at bottom */}
          <linearGradient id="vignette-pp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={DARK} stopOpacity="0" />
            <stop offset="100%" stopColor={DARK} stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Background subtle gradient */}
        <rect x={PAD.l} y={PAD.t} width={innerW} height={innerH}
          fill="url(#vignette-pp)" />

        {/* Horizontal grid lines */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={PAD.l + innerW} y1={yv(v)} y2={yv(v)}
              stroke={i === 0 ? DLINE : DGRID} strokeWidth={i === 0 ? 1 : 0.75} />
            <text x={PAD.l - 10} y={yv(v) + 4} textAnchor="end" fontSize={11} fill={DTXT}>
              {fmtShort(v)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {xTicks.map(({ d, i }) => (
          <text key={i} x={xi(i)} y={PAD.t + innerH + 20} textAnchor="middle" fontSize={10} fill={DTXT}>
            {d.slice(0, 7)}
          </text>
        ))}

        {/* Area fills */}
        <g clipPath="url(#chart-clip-pp)">
          {series.map((s, si) => {
            const xys = seriesXY[si]
            if (xys.length < 2 || s.dashed) return null
            const linePart = smoothPath(xys)
            const first = xys[0], last = xys[xys.length - 1]
            const areaPath = linePart
              + ` L${last[0].toFixed(1)},${(PAD.t + innerH).toFixed(1)}`
              + ` L${first[0].toFixed(1)},${(PAD.t + innerH).toFixed(1)} Z`
            return <path key={si} d={areaPath} fill={`url(#grad-pp-${si})`} />
          })}

          {/* Glow shadow + main line */}
          {series.map((s, si) => {
            const xys = seriesXY[si]
            if (xys.length < 2) return null
            const path = smoothPath(xys)
            const c = LINE_COLORS[s.colorIdx % LINE_COLORS.length]
            const gc = GLOW_COLORS[s.colorIdx % GLOW_COLORS.length]
            return (
              <g key={si}>
                {/* Outer glow */}
                <path d={path} stroke={gc} strokeWidth={8} strokeOpacity={0.15}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {/* Inner glow */}
                <path d={path} stroke={c} strokeWidth={4} strokeOpacity={0.25}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {/* Main line */}
                <path d={path} stroke={c}
                  strokeWidth={s.dashed ? 1.8 : 2.5}
                  strokeDasharray={s.dashed ? '7,5' : undefined}
                  fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          })}
        </g>

        {/* Hover crosshair */}
        {hoverIdx !== null && (
          <>
            <line
              x1={xi(hoverIdx)} x2={xi(hoverIdx)}
              y1={PAD.t} y2={PAD.t + innerH}
              stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="4,3"
            />
            {series.map((s, si) => {
              const pt = s.points.find(p => p.date === hd)
              if (!pt) return null
              const c = LINE_COLORS[s.colorIdx % LINE_COLORS.length]
              const gc = GLOW_COLORS[s.colorIdx % GLOW_COLORS.length]
              return (
                <g key={si}>
                  <circle cx={xid(pt.date)} cy={yv(pt.value)} r={7} fill={gc} opacity={0.3} />
                  <circle cx={xid(pt.date)} cy={yv(pt.value)} r={4} fill={c} stroke={DARK} strokeWidth={2} />
                </g>
              )
            })}
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hd && (
        <div style={{
          position: 'absolute',
          top: `${(PAD.t / VH * 100).toFixed(1)}%`,
          ...(tipLeft
            ? { left: `calc(${tipXpct}% + 12px)` }
            : { right: `calc(${(100 - parseFloat(tipXpct)).toFixed(1)}% + 12px)` }
          ),
          background: 'rgba(15,23,42,0.95)',
          border: '1px solid rgba(148,163,184,0.2)',
          backdropFilter: 'blur(8px)',
          borderRadius: 10,
          padding: '0.55rem 0.85rem',
          fontSize: '0.78rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 10,
          pointerEvents: 'none',
          minWidth: 150,
        }}>
          <div style={{ fontWeight: 600, color: '#94a3b8', fontSize: '0.72rem', marginBottom: '0.35rem' }}>{hd}</div>
          {series.map((s, si) => {
            const pt = s.points.find(p => p.date === hd)
            if (!pt) return null
            const c = LINE_COLORS[s.colorIdx % LINE_COLORS.length]
            return (
              <div key={si} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 3, whiteSpace: 'nowrap' }}>
                <span style={{ width: 8, height: 8, borderRadius: s.dashed ? 2 : '50%', background: c, flexShrink: 0 }} />
                <span style={{ color: '#94a3b8', flex: 1, fontSize: '0.72rem' }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{fmt(pt.value)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend({ series }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem', justifyContent: 'center', marginTop: '0.6rem' }}>
      {series.map((s, i) => {
        const c = LINE_COLORS[s.colorIdx % LINE_COLORS.length]
        const lc = LABEL_COLORS[s.colorIdx % LABEL_COLORS.length]
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
            <svg width={22} height={10} style={{ flexShrink: 0 }}>
              <line x1={0} y1={5} x2={22} y2={5} stroke={c} strokeWidth={s.dashed ? 1.8 : 2.5} strokeDasharray={s.dashed ? '5,3' : undefined} />
            </svg>
            <span style={{ color: lc, fontWeight: 500 }}>{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, subColor }) {
  return (
    <div style={{
      background: 'var(--color-bg)', borderRadius: 10, padding: '0.7rem 1rem',
      display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 120px',
      border: '1px solid var(--color-border)',
    }}>
      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: subColor || 'var(--color-text)' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Period selector ──────────────────────────────────────────────────────────

function PeriodBar({ period, onChange, customFrom, customTo, onCustomFrom, onCustomTo }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center', marginBottom: '1rem' }}>
      {PERIODS.map(p => (
        <button key={p.key} type="button" onClick={() => onChange(p.key)} style={{
          padding: '0.28rem 0.65rem', fontSize: '0.78rem', borderRadius: 20,
          cursor: 'pointer', fontWeight: period === p.key ? 700 : 400,
          background: period === p.key ? 'var(--color-primary)' : 'var(--color-bg)',
          color:      period === p.key ? '#fff' : 'var(--color-text-muted)',
          border:     period === p.key ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
          transition: 'all 0.15s',
        }}>{p.label}</button>
      ))}
      {period === 'IND' && (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: '0.3rem' }}>
          <input type="date" value={customFrom} onChange={e => onCustomFrom(e.target.value)}
            style={{ fontSize: '0.78rem', padding: '0.25rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5 }} />
          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>–</span>
          <input type="date" value={customTo} onChange={e => onCustomTo(e.target.value)}
            style={{ fontSize: '0.78rem', padding: '0.25rem 0.4rem', border: '1px solid var(--color-border)', borderRadius: 5 }} />
        </div>
      )}
    </div>
  )
}

// ─── Multi-select checklist ───────────────────────────────────────────────────

function MultiSelect({ items, selected, onToggle, colorFn, label }) {
  const allSelected = items.every(it => selected.has(it.id))
  const toggleAll = () => {
    if (allSelected) items.forEach(it => onToggle(it.id, false))
    else items.forEach(it => onToggle(it.id, true))
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {items.length > 1 && (
          <button type="button" onClick={toggleAll} style={{
            padding: '0.25rem 0.65rem', fontSize: '0.78rem', borderRadius: 20,
            border: '1px solid var(--color-border)', cursor: 'pointer',
            background: allSelected ? '#e5e7eb' : 'transparent', color: 'var(--color-text-muted)',
          }}>
            {allSelected ? 'Alle ab' : 'Alle'}
          </button>
        )}
        {items.map((it, idx) => {
          const sel = selected.has(it.id)
          const ci  = colorFn ? colorFn(it, idx) : idx
          const c   = LINE_COLORS[ci % LINE_COLORS.length]
          const lc  = LABEL_COLORS[ci % LABEL_COLORS.length]
          return (
            <button key={it.id} type="button" onClick={() => onToggle(it.id, !sel)} style={{
              padding: '0.25rem 0.7rem', fontSize: '0.82rem', borderRadius: 20,
              border: sel ? `2px solid ${lc}` : '1px solid var(--color-border)',
              cursor: 'pointer',
              background: sel ? `${c}22` : 'transparent',
              color: sel ? lc : 'var(--color-text-muted)',
              fontWeight: sel ? 600 : 400,
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}>
              {sel && <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />}
              {it.name || it.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PortfolioPerformance() {
  const depots       = JSON.parse(localStorage.getItem('depots'))            || []
  const transactions = JSON.parse(localStorage.getItem('depotTransactions')) || []
  const securities   = JSON.parse(localStorage.getItem('securities'))        || []
  const prices       = JSON.parse(localStorage.getItem('securityPrices'))    || {}
  const allInsurance = JSON.parse(localStorage.getItem('insuranceContracts')) || []
  const insWithHistory = allInsurance.filter(c => (c.valueHistory?.length || 0) >= 2)

  const [tab,        setTab]        = useState('depots')
  const [period,     setPeriod]     = useState('MAX')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState(new Date().toISOString().slice(0, 10))

  // Multi-select state
  const initDepots = new Set(depots.map(d => d.id))
  const initSecs   = new Set(securities.slice(0, 3).map(s => s.id))
  const initIns    = new Set(insWithHistory.slice(0, 5).map(c => c.id))

  const [selDepotIds, setSelDepotIds] = useState(initDepots)
  const [selSecIds,   setSelSecIds]   = useState(initSecs)
  const [selInsIds,   setSelInsIds]   = useState(initIns)

  function toggleDepot(id, on) {
    setSelDepotIds(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next })
  }
  function toggleSec(id, on) {
    setSelSecIds(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next })
  }
  function toggleIns(id, on) {
    setSelInsIds(prev => { const next = new Set(prev); on ? next.add(id) : next.delete(id); return next })
  }

  const tabSt = active => ({
    padding: '0.38rem 0.9rem', fontSize: '0.83rem', cursor: 'pointer', borderRadius: 8,
    background: active ? 'var(--color-primary)' : 'transparent',
    border: '1px solid var(--color-primary)',
    color: active ? '#fff' : 'var(--color-primary)',
  })

  // ── Build depot series ─────────────────────────────────────────────────────

  const selDepotList = depots.filter(d => selDepotIds.has(d.id))
  const isSingleDepot = selDepotList.length === 1

  let rawDepotSeries = []
  selDepotList.forEach((depot, idx) => {
    const colorIdx = depots.findIndex(d => d.id === depot.id)
    const sub = buildSingleDepotSeries(depot, transactions, prices, colorIdx, isSingleDepot)
    sub.forEach(s => rawDepotSeries.push(s))
  })

  // Apply period filter
  const depotSeries = rawDepotSeries.map(s => ({
    ...s,
    points: applyPeriod(s.points, period, customFrom, customTo),
  })).filter(s => s.points.length >= 1)

  // KPIs for depots
  const mainDepotSeries = depotSeries.filter(s => !s.dashed)
  const totalCurVal  = mainDepotSeries.reduce((sum, s) => sum + (s.points[s.points.length - 1]?.value || 0), 0)
  const costSeries   = depotSeries.filter(s => s.dashed)
  const totalCostVal = costSeries.reduce((sum, s) => sum + (s.points[s.points.length - 1]?.value || 0), 0)
  const depotPnl     = isSingleDepot && costSeries.length ? totalCurVal - totalCostVal : null
  const depotPct     = depotPnl !== null && totalCostVal > 0 ? (depotPnl / totalCostVal) * 100 : null

  // ── Build securities series ────────────────────────────────────────────────

  const selSecList = securities.filter(s => selSecIds.has(s.id))
  let rawSecSeries = selSecList.map(sec => {
    const colorIdx = securities.findIndex(s => s.id === sec.id)
    const history  = (prices[sec.id] || []).slice().sort((a, b) => a.date.localeCompare(b.date))
    return {
      label: sec.name + (sec.symbol ? ` (${sec.symbol})` : ''),
      colorIdx,
      points: history,
    }
  })

  const secSeries = rawSecSeries.map(s => ({
    ...s,
    points: applyPeriod(s.points, period, customFrom, customTo),
  })).filter(s => s.points.length >= 1)

  // KPIs for securities (single)
  const selSecSingle = selSecList.length === 1 ? selSecList[0] : null
  const singleHistory = selSecSingle
    ? applyPeriod((prices[selSecSingle.id] || []).sort((a, b) => a.date.localeCompare(b.date)), period, customFrom, customTo)
    : []
  const firstPt = singleHistory[0]
  const lastPt  = singleHistory[singleHistory.length - 1]
  const secChange = firstPt && lastPt ? lastPt.value - firstPt.value : null
  const secPct    = firstPt?.value > 0 && secChange !== null ? (secChange / firstPt.value) * 100 : null

  // ── Build insurance series ─────────────────────────────────────────────────

  const selInsList = insWithHistory.filter(c => selInsIds.has(c.id))
  const rawInsSeries = selInsList.map(c => {
    const colorIdx = insWithHistory.findIndex(x => x.id === c.id)
    const history  = (c.valueHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date))
    return {
      label:    c.name + (c.provider ? ` (${c.provider})` : ''),
      colorIdx,
      points:   history,
    }
  })

  const insSeries = rawInsSeries.map(s => ({
    ...s,
    points: applyPeriod(s.points, period, customFrom, customTo),
  })).filter(s => s.points.length >= 1)

  const totalInsVal = insSeries.reduce((sum, s) => {
    const last = s.points[s.points.length - 1]
    return sum + (last?.value || 0)
  }, 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="module">
      <h2>Wertentwicklung</h2>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button style={tabSt(tab === 'depots')}      onClick={() => setTab('depots')}>Depots</button>
        <button style={tabSt(tab === 'securities')}  onClick={() => setTab('securities')}>Einzeltitel</button>
        <button style={tabSt(tab === 'insurance')}   onClick={() => setTab('insurance')}>Versicherungen</button>
      </div>

      {/* Period bar */}
      <PeriodBar
        period={period} onChange={setPeriod}
        customFrom={customFrom} customTo={customTo}
        onCustomFrom={setCustomFrom} onCustomTo={setCustomTo}
      />

      {/* ══ Depots tab ══════════════════════════════════════════════════════ */}
      {tab === 'depots' && (
        depots.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Noch keine Depots angelegt. Bitte zuerst Depots und Transaktionen in „Wertpapiere &amp; Depots" erfassen.
          </p>
        ) : (
          <>
            <MultiSelect
              items={depots.map(d => ({ id: d.id, name: d.name }))}
              selected={selDepotIds}
              onToggle={toggleDepot}
              colorFn={(it, idx) => depots.findIndex(d => d.id === it.id)}
              label="Depots auswählen"
            />

            <FancyChart series={depotSeries} />
            {depotSeries.length > 0 && <Legend series={depotSeries} />}

            {totalCurVal > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <KpiCard label="Aktueller Wert" value={fmt(totalCurVal)} />
                {isSingleDepot && totalCostVal > 0 && <KpiCard label="Einstand" value={fmt(totalCostVal)} />}
                {depotPnl !== null && (
                  <KpiCard
                    label="Gewinn / Verlust"
                    value={(depotPnl >= 0 ? '+' : '') + fmt(depotPnl)}
                    subColor={depotPnl >= 0 ? '#16a34a' : '#dc2626'}
                  />
                )}
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

      {/* ══ Versicherungen tab ══════════════════════════════════════════════ */}
      {tab === 'insurance' && (
        insWithHistory.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Keine Versicherungsverträge mit Werthistorie vorhanden. Bitte in „Versicherungen" Zeitwerte erfassen.
          </p>
        ) : (
          <>
            <MultiSelect
              items={insWithHistory.map(c => ({ id: c.id, name: c.name + (c.provider ? ` (${c.provider})` : '') }))}
              selected={selInsIds}
              onToggle={toggleIns}
              colorFn={(it) => insWithHistory.findIndex(c => c.id === it.id)}
              label="Versicherungen auswählen"
            />

            <FancyChart series={insSeries} />
            {insSeries.length > 0 && <Legend series={insSeries} />}

            {totalInsVal > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <KpiCard label="Aktueller Gesamtwert" value={fmt(totalInsVal)} />
              </div>
            )}
          </>
        )
      )}

      {/* ══ Einzeltitel tab ═════════════════════════════════════════════════ */}
      {tab === 'securities' && (
        securities.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            Noch keine Wertpapiere erfasst.
          </p>
        ) : (
          <>
            <MultiSelect
              items={securities.map(s => ({ id: s.id, name: s.name + (s.symbol ? ` (${s.symbol})` : '') }))}
              selected={selSecIds}
              onToggle={toggleSec}
              colorFn={(it, idx) => securities.findIndex(s => s.id === it.id)}
              label="Wertpapiere auswählen"
            />

            <FancyChart series={secSeries} />
            {secSeries.length > 0 && <Legend series={secSeries} />}

            {selSecSingle && lastPt && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                <KpiCard label={`Kurs (${lastPt.date})`} value={fmt(lastPt.value)} />
                {firstPt && firstPt.date !== lastPt.date && (
                  <KpiCard label={`Kurs (${firstPt.date})`} value={fmt(firstPt.value)} />
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
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
