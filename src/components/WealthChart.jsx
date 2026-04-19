import { useState, useEffect, useRef } from 'react'
import { fmt } from '../fmt'

const ASSETS = [
  { key: 'bank',       label: 'Bankkonten',     icon: '🏦', color: '#3b82f6', grad: 'linear-gradient(90deg,#3b82f6,#1d4ed8)' },
  { key: 'securities', label: 'Wertpapiere',    icon: '📈', color: '#8b5cf6', grad: 'linear-gradient(90deg,#8b5cf6,#6d28d9)' },
  { key: 'insurance',  label: 'Versicherungen', icon: '🛡️', color: '#14b8a6', grad: 'linear-gradient(90deg,#14b8a6,#0f766e)' },
  { key: 'realEstate', label: 'Immobilien',     icon: '🏠', color: '#f59e0b', grad: 'linear-gradient(90deg,#f59e0b,#b45309)' },
  { key: 'shares',     label: 'Firmenbeteil.',  icon: '🏢', color: '#ec4899', grad: 'linear-gradient(90deg,#ec4899,#be185d)' },
]

function latestHistVal(history, fallback) {
  if (!history?.length) return fallback || 0
  return [...history].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

function getCurrentPrice(secId, prices) {
  const list = prices[secId]
  if (!list?.length) return 0
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
}

function AnimatedCounter({ target, format }) {
  const [value, setValue] = useState(0)
  const frame = useRef(null)
  useEffect(() => {
    const duration = 1400
    const start = Date.now()
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target])
  return <>{format(value)}</>
}

function DonutChart({ segments, size = 240, stroke = 42, centerValue, centerLabel }) {
  if (!segments.length) return null
  let angle = 0
  const stops = segments.map((s, i) => {
    const from = angle
    angle = i === segments.length - 1 ? 360 : +(angle + s.pct / 100 * 360).toFixed(4)
    return `${s.color} ${from}deg ${angle}deg`
  })
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(from -90deg, ${stops.join(', ')})`,
        boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
      }} />
      <div style={{
        position: 'absolute',
        inset: stroke, borderRadius: '50%',
        background: 'var(--color-surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.07)',
        gap: 2,
      }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {centerLabel}
        </span>
        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-0.02em', lineHeight: 1.15, textAlign: 'center', padding: '0 6px' }}>
          {centerValue}
        </span>
      </div>
    </div>
  )
}

export default function WealthChart() {
  const accounts   = JSON.parse(localStorage.getItem('bankAccounts'))       || []
  const depots     = JSON.parse(localStorage.getItem('depots'))             || []
  const depotTrans = JSON.parse(localStorage.getItem('depotTransactions'))  || []
  const prices     = JSON.parse(localStorage.getItem('securityPrices'))     || {}
  const insurance  = JSON.parse(localStorage.getItem('insuranceContracts')) || []
  const realEstate = JSON.parse(localStorage.getItem('realEstate'))         || []
  const shares     = JSON.parse(localStorage.getItem('companyShares'))      || []
  const [animated, setAnimated] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 60)
    return () => clearTimeout(t)
  }, [])

  function latestBankBalance(a) {
    const h = a.balanceHistory
    if (h?.length) return [...h].sort((x, y) => y.date.localeCompare(x.date))[0].value
    return a.balance || 0
  }

  const totalBank = accounts.reduce((s, a) => s + latestBankBalance(a), 0)

  const totalSecurities = depots.reduce((sum, depot) => {
    const trans = depotTrans.filter(t => t.depotId === depot.id)
    const qty = {}
    trans.forEach(t => {
      if (!qty[t.securityId]) qty[t.securityId] = 0
      if (t.type === 'buy')  qty[t.securityId] += t.quantity
      if (t.type === 'sell') qty[t.securityId] -= t.quantity
    })
    return sum + Object.entries(qty)
      .filter(([, q]) => q > 0)
      .reduce((s, [secId, q]) => s + q * getCurrentPrice(secId, prices), 0)
  }, 0)

  const totalInsurance  = insurance
    .filter(c => c.verrentungTyp !== 'nurVerrentung' && !c.nurVerrentung)
    .reduce((s, c) => s + latestHistVal(c.valueHistory, c.value), 0)
  const totalRealEstate = realEstate.reduce((s, p) => s + latestHistVal(p.currentHistory, p.current), 0)
  const totalShares     = shares.reduce((s, sh) => s + latestHistVal(sh.valueHistory, sh.value), 0)

  const values = { bank: totalBank, securities: totalSecurities, insurance: totalInsurance, realEstate: totalRealEstate, shares: totalShares }
  const total  = Object.values(values).reduce((s, v) => s + v, 0)

  if (total === 0) return (
    <div className="module" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
      Noch keine Vermögenswerte erfasst.
    </div>
  )

  const activeAssets = ASSETS.filter(a => values[a.key] > 0)
  const segments     = activeAssets.map(a => ({ color: a.color, pct: (values[a.key] / total) * 100 }))
  const topAsset     = [...activeAssets].sort((a, b) => values[b.key] - values[a.key])[0]

  return (
    <div className="module" style={{ padding: 0, overflow: 'hidden' }}>

      {/* ── Hero Banner ── */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, color-mix(in srgb, var(--color-primary) 55%, #5b21b6) 100%)',
        padding: '2rem 2rem 1.75rem',
        color: '#fff',
      }}>
        {/* decorative blobs */}
        <div style={{ position: 'absolute', right: -50, top: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 30, bottom: -70, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: -30, bottom: -40, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '0.68rem', opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 10 }}>
            Gesamtvermögen
          </div>
          <div style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 14 }}>
            <AnimatedCounter target={total} format={fmt} />
          </div>

          {/* asset legend dots */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1.2rem', marginBottom: 4 }}>
            {activeAssets.map(a => (
              <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: a.color, boxShadow: `0 0 6px ${a.color}aa` }} />
                <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>{a.label}</span>
                <span style={{ fontSize: '0.68rem', opacity: 0.55 }}>
                  {((values[a.key] / total) * 100).toFixed(1)} %
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart + Cards ── */}
      <div style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Donut */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <DonutChart
            segments={segments}
            size={230} stroke={42}
            centerValue={fmt(total)}
            centerLabel="Gesamt"
          />
          {topAsset && (
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Größte Position: <span style={{ fontWeight: 700, color: topAsset.color }}>{topAsset.label}</span>
            </div>
          )}
        </div>

        {/* Asset cards */}
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {activeAssets.map((a, i) => {
            const val = values[a.key]
            const pct = (val / total) * 100
            return (
              <div key={a.key} style={{
                padding: '0.75rem 1rem',
                borderRadius: 12,
                background: a.color + '0e',
                border: `1px solid ${a.color}22`,
                borderLeft: `3px solid ${a.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.2rem' }}>{a.icon}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{a.label}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: a.color }}>{fmt(val)}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                      {pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                    </div>
                  </div>
                </div>
                <div style={{ height: 5, borderRadius: 9999, background: 'var(--color-border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    borderRadius: 9999,
                    background: a.grad,
                    width: animated ? `${pct}%` : '0%',
                    transition: `width 1s cubic-bezier(0.4,0,0.2,1) ${i * 80}ms`,
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
