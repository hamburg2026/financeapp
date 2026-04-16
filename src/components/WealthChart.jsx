import { fmt } from '../fmt'

const ASSETS = [
  { key: 'bank',       label: 'Bankkonten',     icon: '🏦', color: '#3b82f6' },
  { key: 'securities', label: 'Wertpapiere',    icon: '📈', color: '#8b5cf6' },
  { key: 'insurance',  label: 'Versicherungen', icon: '🛡️', color: '#14b8a6' },
  { key: 'realEstate', label: 'Immobilien',     icon: '🏠', color: '#f59e0b' },
  { key: 'shares',     label: 'Firmenbeteil.',  icon: '🏢', color: '#ec4899' },
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

function DonutChart({ segments, size = 200, strokeWidth = 38, centerLabel, centerValue }) {
  if (segments.length === 0) return null

  let angle = 0
  const stops = segments.map((seg, i) => {
    const start = angle
    angle = i === segments.length - 1 ? 360 : +(angle + seg.pct / 100 * 360).toFixed(4)
    return `${seg.color} ${start}deg ${angle}deg`
  })

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `conic-gradient(from -90deg, ${stops.join(', ')})`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.13)',
      }} />
      <div style={{
        position: 'absolute',
        top: strokeWidth, left: strokeWidth,
        right: strokeWidth, bottom: strokeWidth,
        borderRadius: '50%',
        background: 'var(--color-surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {centerValue != null && (
          <>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {centerValue}
            </span>
            {centerLabel && (
              <span style={{ fontSize: '0.58rem', color: 'var(--color-text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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

  const values = {
    bank: totalBank, securities: totalSecurities, insurance: totalInsurance,
    realEstate: totalRealEstate, shares: totalShares,
  }
  const total = Object.values(values).reduce((s, v) => s + v, 0)

  if (total === 0) return null

  const activeAssets = ASSETS.filter(a => values[a.key] > 0)
  const segments = activeAssets.map(a => ({
    color: a.color,
    pct: (values[a.key] / total) * 100,
  }))

  return (
    <div className="module">
      <h2>Vermögensübersicht</h2>

      {/* Total wealth hero */}
      <div style={{
        textAlign: 'center',
        marginBottom: '1.5rem',
        padding: '1.25rem',
        background: 'linear-gradient(135deg, var(--color-primary) 0%, #7c3aed 100%)',
        borderRadius: 16,
        color: '#fff',
        boxShadow: '0 4px 20px rgba(37,99,235,0.25)',
      }}>
        <div style={{ fontSize: '0.7rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Gesamtvermögen
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {fmt(total)}
        </div>
        <div style={{ fontSize: '0.72rem', opacity: 0.7, marginTop: 6 }}>
          {activeAssets.length} Anlagegruppe{activeAssets.length !== 1 ? 'n' : ''}
        </div>
      </div>

      {/* Donut chart centered */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.75rem' }}>
        <DonutChart
          segments={segments}
          size={200} strokeWidth={38}
          centerValue={fmt(total)}
          centerLabel="Gesamt"
        />
      </div>

      {/* Asset cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {activeAssets.map(a => {
          const val = values[a.key]
          const pct = (val / total) * 100
          return (
            <div key={a.key} style={{
              display: 'grid',
              gridTemplateColumns: '2.2rem 1fr auto',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: 12,
              background: a.color + '0f',
              border: `1px solid ${a.color}30`,
              borderLeft: `4px solid ${a.color}`,
            }}>
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>{a.label}</div>
                <div style={{ height: 6, borderRadius: 9999, background: 'var(--color-border)', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 9999,
                    background: a.color,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: a.color, whiteSpace: 'nowrap' }}>
                  {fmt(val)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                  {pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
