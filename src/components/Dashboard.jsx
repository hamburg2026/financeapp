const fmt = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtPnl = (n) => (n >= 0 ? '+\u202f' : '\u2212\u202f') + fmt(Math.abs(n))

const pnlStyle = (n) => ({ color: n >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 })

function Section({ title, children }) {
  return (
    <div className="module" style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>{title}</h2>
      {children}
    </div>
  )
}

function StatRow({ label, value, sub }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>{label}</span>
      <span style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
        <strong>{value}</strong>
        {sub != null && <span style={pnlStyle(sub)}>{fmtPnl(sub)}</span>}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const accounts    = JSON.parse(localStorage.getItem('bankAccounts'))       || []
  const depots      = JSON.parse(localStorage.getItem('depots'))             || []
  const depotTrans  = JSON.parse(localStorage.getItem('depotTransactions'))  || []
  const prices      = JSON.parse(localStorage.getItem('securityPrices'))     || {}
  const securities  = JSON.parse(localStorage.getItem('securities'))         || []
  const insurance   = JSON.parse(localStorage.getItem('insuranceContracts')) || []
  const realEstate  = JSON.parse(localStorage.getItem('realEstate'))         || []
  const shares      = JSON.parse(localStorage.getItem('companyShares'))      || []
  const subscriptions = JSON.parse(localStorage.getItem('subscriptions'))    || []

  // ── Bankkonten ──────────────────────────────────
  const totalBank = accounts.reduce((s, a) => s + a.balance, 0)

  // ── Depots ──────────────────────────────────────
  function getCurrentPrice(secId) {
    const list = prices[secId]
    if (!list || list.length === 0) return 0
    return [...list].sort((a, b) => new Date(b.date) - new Date(a.date))[0].value
  }

  const depotData = depots.map(depot => {
    const trans = depotTrans.filter(t => t.depotId === depot.id)
    const pos = {}
    trans.forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { qty: 0, cost: 0 }
      if (t.type === 'buy') {
        pos[t.securityId].qty  += t.quantity
        pos[t.securityId].cost += t.quantity * t.price + (t.fees || 0)
      } else if (t.type === 'sell') {
        pos[t.securityId].qty  -= t.quantity
        pos[t.securityId].cost -= t.quantity * t.price - (t.fees || 0)
      }
    })
    const positions = Object.entries(pos)
      .filter(([, p]) => p.qty > 0)
      .map(([secId, p]) => {
        const sec = securities.find(s => s.id == secId)
        const curPrice = getCurrentPrice(secId)
        const curValue = p.qty * curPrice
        const pnl = curValue - p.cost
        return { secId, name: sec?.name || secId, qty: p.qty, curValue, pnl }
      })
    const totalValue = positions.reduce((s, p) => s + p.curValue, 0)
    const totalPnl   = positions.reduce((s, p) => s + p.pnl, 0)
    return { depot, positions, totalValue, totalPnl }
  })
  const totalSecurities = depotData.reduce((s, d) => s + d.totalValue, 0)

  // ── Immobilien ──────────────────────────────────
  const totalRealEstate = realEstate.reduce((s, p) => s + p.current, 0)

  // ── Firmenbeteiligungen ─────────────────────────
  const totalShares = shares.reduce((s, sh) => s + sh.value, 0)

  // ── Versicherungen ──────────────────────────────
  const totalInsurance = insurance.reduce((s, c) => s + c.value, 0)

  // ── Gesamtvermögen ──────────────────────────────
  const totalAssets = totalBank + totalSecurities + totalInsurance + totalRealEstate + totalShares

  // ── Abonnements monatlich ───────────────────────
  const freqLabel = { monthly: 'mtl.', quarterly: 'vrtlj.', yearly: 'jährl.' }

  return (
    <div>
      {/* Gesamtvermögen */}
      <div className="module" style={{ marginBottom: '1.25rem', background: 'var(--color-primary)', color: '#fff' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gesamtvermögen</div>
        <div style={{ fontSize: '2.25rem', fontWeight: 700, margin: '0.25rem 0 0.75rem' }}>{fmt(totalAssets)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
          {[
            ['Bankkonten', totalBank],
            ['Wertpapiere', totalSecurities],
            ['Versicherungen', totalInsurance],
            ['Immobilien', totalRealEstate],
            ['Beteiligungen', totalShares],
          ].map(([label, val]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{label}</div>
              <div style={{ fontWeight: 600 }}>{fmt(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Depots */}
      {depotData.length > 0 && (
        <Section title="Depots">
          {depotData.map(({ depot, positions, totalValue, totalPnl }) => (
            <div key={depot.id} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <strong>{depot.name}</strong>
                <span>
                  {fmt(totalValue)}{' '}
                  <span style={pnlStyle(totalPnl)}>{fmtPnl(totalPnl)}</span>
                </span>
              </div>
              {positions.length > 0 ? (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Wertpapier</th><th style={{textAlign:'right'}}>Anzahl</th><th style={{textAlign:'right'}}>Wert</th><th style={{textAlign:'right'}}>G/V</th></tr>
                    </thead>
                    <tbody>
                      {positions.map(p => (
                        <tr key={p.secId}>
                          <td>{p.name}</td>
                          <td style={{textAlign:'right'}}>{p.qty.toLocaleString('de-DE')}</td>
                          <td style={{textAlign:'right'}}>{fmt(p.curValue)}</td>
                          <td style={{textAlign:'right', ...pnlStyle(p.pnl)}}>{fmtPnl(p.pnl)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Keine Positionen</p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* Immobilien */}
      {realEstate.length > 0 && (
        <Section title="Immobilien">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Objekt</th><th style={{textAlign:'right'}}>Zeitwert</th><th style={{textAlign:'right'}}>G/V</th></tr>
              </thead>
              <tbody>
                {realEstate.map(p => {
                  const pnl = p.current - p.purchase
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td style={{textAlign:'right'}}>{fmt(p.current)}</td>
                      <td style={{textAlign:'right', ...pnlStyle(pnl)}}>{fmtPnl(pnl)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Firmenbeteiligungen */}
      {shares.length > 0 && (
        <Section title="Firmenbeteiligungen">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Firma</th><th style={{textAlign:'right'}}>Anteil</th><th style={{textAlign:'right'}}>Wert</th></tr>
              </thead>
              <tbody>
                {shares.map(s => (
                  <tr key={s.id}>
                    <td>{s.company}</td>
                    <td style={{textAlign:'right'}}>{s.percentage.toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2})} %</td>
                    <td style={{textAlign:'right'}}>{fmt(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Abonnements */}
      {subscriptions.length > 0 && (
        <Section title="Abonnements">
          {subscriptions.map(s => (
            <StatRow
              key={s.id}
              label={`${s.name} (${freqLabel[s.frequency] || s.frequency})`}
              value={fmt(s.cost)}
            />
          ))}
        </Section>
      )}
    </div>
  )
}
