import { useRef } from 'react'

const fmt = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtPnl = (n) => (n >= 0 ? '+\u202f' : '\u2212\u202f') + fmt(Math.abs(n))

const pnlStyle = (n) => ({ color: n >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 })

// All localStorage keys that belong to the app
const BACKUP_KEYS = [
  'bankAccounts', 'transactions', 'categories', 'recurringPayments',
  'depots', 'depotTransactions', 'securityPrices', 'securities',
  'insuranceContracts', 'realEstate', 'companyShares', 'subscriptions',
]

function exportBackup() {
  const data = {}
  BACKUP_KEYS.forEach(key => {
    const raw = localStorage.getItem(key)
    if (raw) data[key] = JSON.parse(raw)
  })
  const payload = { version: 1, exportedAt: new Date().toISOString(), data }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `financeapp-sicherung-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importBackup(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result)
      // Accept both { version, data: {...} } and a plain object of keys
      const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed
      let count = 0
      Object.entries(data).forEach(([key, val]) => {
        if (BACKUP_KEYS.includes(key)) {
          localStorage.setItem(key, JSON.stringify(val))
          count++
        }
      })
      if (count === 0) { alert('Keine bekannten Daten in der Sicherungsdatei gefunden.'); return }
      window.location.reload()
    } catch {
      alert('Sicherungsdatei konnte nicht gelesen werden.')
    }
  }
  reader.readAsText(file)
}

function Section({ title, children }) {
  return (
    <div className="module" style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>{title}</h2>
      {children}
    </div>
  )
}

function MiniRow({ label, value, sub, muted }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '0.28rem 0',
      borderBottom: '1px solid var(--color-border)',
      fontSize: '0.82rem',
    }}>
      <span style={{ color: muted ? 'var(--color-text-muted)' : 'var(--color-text)' }}>{label}</span>
      <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 500 }}>{value}</span>
        {sub != null && <span style={pnlStyle(sub)}>{fmtPnl(sub)}</span>}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const fileInputRef = useRef(null)

  const accounts     = JSON.parse(localStorage.getItem('bankAccounts'))       || []
  const depots       = JSON.parse(localStorage.getItem('depots'))             || []
  const depotTrans   = JSON.parse(localStorage.getItem('depotTransactions'))  || []
  const prices       = JSON.parse(localStorage.getItem('securityPrices'))     || {}
  const securities   = JSON.parse(localStorage.getItem('securities'))         || []
  const insurance    = JSON.parse(localStorage.getItem('insuranceContracts')) || []
  const realEstate   = JSON.parse(localStorage.getItem('realEstate'))         || []
  const shares       = JSON.parse(localStorage.getItem('companyShares'))      || []
  const subscriptions = JSON.parse(localStorage.getItem('subscriptions'))     || []

  // ── Bankkonten ──
  const totalBank = accounts.reduce((s, a) => s + a.balance, 0)

  // ── Depots ──
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
    const totalPnl   = positions.reduce((s, p) => s + p.pnl,      0)
    return { depot, positions, totalValue, totalPnl }
  })
  const totalSecurities = depotData.reduce((s, d) => s + d.totalValue, 0)

  // ── Immobilien ──
  const totalRealEstate = realEstate.reduce((s, p) => s + p.current, 0)

  // ── Firmenbeteiligungen ──
  const totalShares = shares.reduce((s, sh) => s + sh.value, 0)

  // ── Versicherungen ──
  const totalInsurance = insurance.reduce((s, c) => s + c.value, 0)

  // ── Gesamtvermögen ──
  const totalAssets = totalBank + totalSecurities + totalInsurance + totalRealEstate + totalShares

  const freqLabel = { monthly: 'mtl.', quarterly: 'quartl.', yearly: 'jährl.' }

  return (
    <div>
      {/* ── Gesamtvermögen ── */}
      <div className="module" style={{ marginBottom: '1.25rem', background: 'var(--color-primary)', color: '#fff' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gesamtvermögen</div>
        <div style={{ fontSize: '2.25rem', fontWeight: 700, margin: '0.25rem 0 0.75rem' }}>{fmt(totalAssets)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem' }}>
          {[
            ['Bankkonten',    totalBank],
            ['Wertpapiere',   totalSecurities],
            ['Versicherungen', totalInsurance],
            ['Immobilien',    totalRealEstate],
            ['Beteiligungen', totalShares],
          ].map(([label, val]) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{label}</div>
              <div style={{ fontWeight: 600 }}>{fmt(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Sicherung ── */}
      <div className="module" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Datensicherung</h2>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={exportBackup} style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}>
            Sicherung herunterladen
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', background: '#6b7280' }}>
            Sicherung wiederherstellen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) importBackup(e.target.files[0]) }}
          />
          <button
            onClick={() => {
              if (window.confirm('Alle lokalen Daten unwiderruflich löschen? Vorher bitte sichern!')) {
                BACKUP_KEYS.forEach(k => localStorage.removeItem(k))
                window.location.reload()
              }
            }}
            style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', background: '#dc2626' }}
          >
            Browser-Reset
          </button>
        </div>
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          Die Sicherungsdatei enthält alle lokalen Daten und kann jederzeit wieder eingespielt werden. Browser-Reset löscht alles dauerhaft.
        </p>
      </div>

      {/* ── Bankkonten ── */}
      {accounts.length > 0 && (
        <Section title="Bankkonten">
          {accounts.map(a => (
            <MiniRow key={a.id} label={a.name} value={fmt(a.balance)} />
          ))}
          {accounts.length > 1 && (
            <MiniRow label="Gesamt" value={fmt(totalBank)} muted />
          )}
        </Section>
      )}

      {/* ── Versicherungen ── */}
      {insurance.length > 0 && (
        <Section title="Versicherungen">
          {insurance.map(c => (
            <MiniRow
              key={c.id}
              label={c.name || c.company || '–'}
              value={fmt(c.value || 0)}
            />
          ))}
          {insurance.length > 1 && (
            <MiniRow label="Gesamt" value={fmt(totalInsurance)} muted />
          )}
        </Section>
      )}

      {/* ── Depots ── */}
      {depotData.length > 0 && (
        <Section title="Depots">
          {depotData.map(({ depot, positions, totalValue, totalPnl }) => (
            <div key={depot.id} style={{ marginBottom: '0.75rem' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '0.3rem 0', borderBottom: '2px solid var(--color-border)',
                fontWeight: 600, fontSize: '0.88rem',
              }}>
                <span>{depot.name}</span>
                <span>
                  {fmt(totalValue)}{' '}
                  <span style={pnlStyle(totalPnl)}>{fmtPnl(totalPnl)}</span>
                </span>
              </div>
              {positions.map(p => (
                <MiniRow
                  key={p.secId}
                  label={`${p.name} (${p.qty.toLocaleString('de-DE')} Stk.)`}
                  value={fmt(p.curValue)}
                  sub={p.pnl}
                />
              ))}
              {positions.length === 0 && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', margin: '0.3rem 0' }}>Keine Positionen</p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ── Immobilien ── */}
      {realEstate.length > 0 && (
        <Section title="Immobilien">
          {realEstate.map(p => (
            <MiniRow
              key={p.id}
              label={p.name}
              value={fmt(p.current)}
              sub={p.current - p.purchase}
            />
          ))}
          {realEstate.length > 1 && (
            <MiniRow label="Gesamt" value={fmt(totalRealEstate)} muted />
          )}
        </Section>
      )}

      {/* ── Firmenbeteiligungen ── */}
      {shares.length > 0 && (
        <Section title="Firmenbeteiligungen">
          {shares.map(s => (
            <MiniRow
              key={s.id}
              label={`${s.company} (${s.percentage.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %)`}
              value={fmt(s.value)}
            />
          ))}
          {shares.length > 1 && (
            <MiniRow label="Gesamt" value={fmt(totalShares)} muted />
          )}
        </Section>
      )}

      {/* ── Abonnements ── */}
      {subscriptions.length > 0 && (
        <Section title="Abonnements">
          {subscriptions.map(s => (
            <MiniRow
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
