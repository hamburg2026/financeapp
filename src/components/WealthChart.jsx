import { fmt } from '../fmt'

const ASSETS = [
  { key: 'bank',       label: 'Bankkonten',     icon: '🏦', color: '#3b82f6' },
  { key: 'securities', label: 'Wertpapiere',    icon: '📈', color: '#8b5cf6' },
  { key: 'insurance',  label: 'Versicherungen', icon: '🛡️', color: '#14b8a6' },
  { key: 'realEstate', label: 'Immobilien',     icon: '🏠', color: '#f59e0b' },
  { key: 'shares',     label: 'Firmenbeteil.',  icon: '🏢', color: '#ec4899' },
]

function getCurrentPrice(secId, prices) {
  const list = prices[secId]
  if (!list?.length) return 0
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
}

// DonutChart via CSS conic-gradient – always exactly 360°, no SVG rendering gaps.
// 'from -90deg' starts at 12 o'clock. Last stop is forced to 360 so the ring is closed.
function DonutChart({ segments, size = 220, strokeWidth = 42, centerLabel, centerValue }) {
  if (segments.length === 0) return null

  let angle = 0
  const stops = segments.map((seg, i) => {
    const start = angle
    angle = i === segments.length - 1 ? 360 : +(angle + seg.pct / 100 * 360).toFixed(4)
    return `${seg.color} ${start}deg ${angle}deg`
  })

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Outer ring */}
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(from -90deg, ${stops.join(', ')})`,
      }} />
      {/* Donut hole – covers the center, matching the card background */}
      <div style={{
        position: 'absolute',
        top: strokeWidth, left: strokeWidth,
        right: strokeWidth, bottom: strokeWidth,
        borderRadius: '50%',
        background: 'var(--color-surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {centerValue != null && (
          <>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {centerValue}
            </span>
            {centerLabel && (
              <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {centerLabel}
              </span>
            )}
          </>
        )}
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

  const totalBank = accounts.reduce((s, a) => s + (a.balance || 0), 0)

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

  function latestHistVal(history, fallback) {
    if (!history?.length) return fallback || 0
    return [...history].sort((a, b) => b.date.localeCompare(a.date))[0].value
  }

  const totalInsurance  = insurance.filter(c => !c.nurVerrentung).reduce((s, c) => s + latestHistVal(c.valueHistory, c.value), 0)
  const totalRealEstate = realEstate.reduce((s, p) => s + latestHistVal(p.currentHistory, p.current), 0)
  const totalShares     = shares.reduce((s, sh) => s + latestHistVal(sh.valueHistory, sh.value), 0)

  const values = {
    bank: totalBank, securities: totalSecurities, insurance: totalInsurance,
    realEstate: totalRealEstate, shares: totalShares,
  }
  const total = Object.values(values).reduce((s, v) => s + v, 0)

  if (total === 0) return null  // keine Daten → nicht anzeigen

  const activeAssets = ASSETS.filter(a => values[a.key] > 0)
  const segments = activeAssets.map(a => ({
    color: a.color,
    pct: (values[a.key] / total) * 100,
  }))

  return (
    <div className="module">
      <h2>Vermögensübersicht</h2>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
        <DonutChart
          segments={segments}
          size={220} strokeWidth={42}
          centerValue={fmt(total)}
          centerLabel="Gesamtvermögen"
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {activeAssets.map(a => {
          const val = values[a.key]
          const pct = (val / total) * 100
          return (
            <div key={a.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: a.color, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: '1rem' }}>{a.icon}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{a.label}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{fmt(val)}</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: '0.4rem' }}>
                    {pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                  </span>
                </div>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 9999, background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: a.color, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
