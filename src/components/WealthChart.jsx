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

// DonutChart: renders multiple overlapping SVG circles, each offset/clipped to its arc
// Uses the stroke-dasharray trick: each circle shows only its segment via dasharray + dashoffset
function DonutChart({ segments, size = 220, strokeWidth = 42 }) {
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  // Gap in px between segments
  const gapCirc = 0

  let offsetAngle = -90 // start at top

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {segments.map((seg, i) => {
        const fraction = seg.pct / 100
        const arcLen = circumference * fraction
        const dashArray = Math.max(0, arcLen - gapCirc)
        const dashOffset = -(offsetAngle / 360) * circumference

        // rotation: start from current angle offset
        const rotation = offsetAngle

        offsetAngle += fraction * 360

        if (dashArray <= 0) return null
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dashArray} ${circumference}`}
            strokeDashoffset={circumference / 4}
            style={{ transform: `rotate(${rotation + 90}deg)`, transformOrigin: `${cx}px ${cy}px` }}
          />
        )
      })}
      {/* Background ring when no data */}
      {segments.length === 0 && (
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="var(--color-border)" strokeWidth={strokeWidth}
        />
      )}
    </svg>
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

  // Bank
  const totalBank = accounts.reduce((s, a) => s + (a.balance || 0), 0)

  // Securities via depots
  const totalSecurities = depots.reduce((sum, depot) => {
    const trans = depotTrans.filter(t => t.depotId === depot.id)
    const qty = {}
    trans.forEach(t => {
      if (!qty[t.securityId]) qty[t.securityId] = 0
      if (t.type === 'buy')  qty[t.securityId] += t.quantity
      if (t.type === 'sell') qty[t.securityId] -= t.quantity
    })
    const depotValue = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .reduce((s, [secId, q]) => s + q * getCurrentPrice(secId, prices), 0)
    return sum + depotValue
  }, 0)

  // Insurance
  const totalInsurance = insurance.reduce((s, c) => s + (c.value || 0), 0)

  // Real Estate
  const totalRealEstate = realEstate.reduce((s, p) => s + (p.current || 0), 0)

  // Company shares
  const totalShares = shares.reduce((s, sh) => s + (sh.value || 0), 0)

  const values = {
    bank:       totalBank,
    securities: totalSecurities,
    insurance:  totalInsurance,
    realEstate: totalRealEstate,
    shares:     totalShares,
  }

  const total = Object.values(values).reduce((s, v) => s + v, 0)

  // Build segments for donut (only assets with value > 0)
  const activeAssets = ASSETS.filter(a => values[a.key] > 0)
  const segments = activeAssets.map(a => ({
    color: a.color,
    pct: total > 0 ? (values[a.key] / total) * 100 : 0,
  }))

  return (
    <div className="module">
      <h2>Vermögensübersicht</h2>

      {total === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem 0', margin: 0 }}>
          Keine Vermögensdaten vorhanden
        </p>
      ) : (
        <>
          {/* Donut centered */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
            <DonutChart segments={segments} size={220} strokeWidth={42} />
            {/* Total below donut */}
            <div style={{
              marginTop: '0.75rem',
              fontSize: '1.6rem',
              fontWeight: 700,
              color: 'var(--color-primary)',
              letterSpacing: '-0.01em',
            }}>
              {fmt(total)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
              Gesamtvermögen
            </div>
          </div>

          {/* Asset rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {ASSETS.filter(a => values[a.key] > 0).map(a => {
              const val = values[a.key]
              const pct = total > 0 ? (val / total) * 100 : 0
              return (
                <div key={a.key}>
                  {/* Row: label left, amount+pct right */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem',
                  }}>
                    {/* Left: dot + icon + label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: a.color,
                        flexShrink: 0,
                        display: 'inline-block',
                      }} />
                      <span style={{ fontSize: '1rem' }}>{a.icon}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{a.label}</span>
                    </div>
                    {/* Right: amount + pct */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{fmt(val)}</span>
                      <span style={{
                        fontSize: '0.72rem',
                        color: 'var(--color-text-muted)',
                        marginLeft: '0.4rem',
                      }}>
                        {pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                      </span>
                    </div>
                  </div>
                  {/* Percentage bar */}
                  <div style={{
                    width: '100%',
                    height: 4,
                    borderRadius: 9999,
                    background: 'var(--color-border)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      borderRadius: 9999,
                      background: a.color,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
