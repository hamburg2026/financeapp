import { useRef, useState } from 'react'

const fmt = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

// ── Liquiditätsstufen ──
const LIQUIDITY_LEVELS = {
  1: { label: 'Stufe 1', desc: 'Liquidität',                   color: '#16a34a', bg: '#dcfce7' },
  2: { label: 'Stufe 2', desc: 'Kurzfristig liquidierbar',     color: '#22c55e', bg: '#f0fdf4' },
  3: { label: 'Stufe 3', desc: 'Mittelfristig liquidierbar',   color: '#eab308', bg: '#fefce8' },
  5: { label: 'Stufe 5', desc: 'Schwer liquidierbar',          color: '#f97316', bg: '#fff7ed' },
  6: { label: 'Stufe 6', desc: 'Theoretisch liquidierbar',     color: '#dc2626', bg: '#fef2f2' },
}
const LIQUIDITY_ORDER = [1, 2, 3, 5, 6]

const fmtPnl = (n) => (n >= 0 ? '+\u202f' : '\u2212\u202f') + fmt(Math.abs(n))

const pnlStyle = (n) => ({ color: n >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 })

// All localStorage keys that belong to the app
const BACKUP_KEYS = [
  'bankAccounts', 'transactions', 'categories', 'recurringPayments',
  'depots', 'depotTransactions', 'securityPrices', 'securities', 'fxRates',
  'insuranceContracts', 'realEstate', 'companyShares', 'subscriptions',
  'liquidityLevels',
]

const BACKUP_SECTIONS = [
  { label: 'Bankkonten & Umsätze',  keys: ['bankAccounts', 'transactions'] },
  { label: 'Kategorien',            keys: ['categories'] },
  { label: 'Daueraufträge',         keys: ['recurringPayments'] },
  { label: 'Wertpapiere & Depots',  keys: ['securities', 'securityPrices', 'depots', 'depotTransactions', 'fxRates'] },
  { label: 'Versicherungen',        keys: ['insuranceContracts'] },
  { label: 'Abonnements',           keys: ['subscriptions'] },
  { label: 'Immobilien',            keys: ['realEstate'] },
  { label: 'Firmenbeteiligungen',   keys: ['companyShares'] },
  { label: 'Einstellungen',         keys: ['liquidityLevels'] },
]

// ── Crypto helpers ──
async function deriveKey(password, salt) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function toBase64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))) }
function fromBase64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)) }

async function exportBackup(password, keysToExport = BACKUP_KEYS) {
  const data = {}
  keysToExport.forEach(key => {
    const raw = localStorage.getItem(key)
    if (raw) data[key] = JSON.parse(raw)
  })
  const plaintext = new TextEncoder().encode(JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data }))
  let blob, filename
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv   = crypto.getRandomValues(new Uint8Array(12))
    const key  = await deriveKey(password, salt)
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
    const payload = { version: 2, encrypted: true, salt: toBase64(salt), iv: toBase64(iv), payload: toBase64(encrypted) }
    blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    filename = `financeapp-sicherung-${new Date().toISOString().slice(0, 10)}.enc.json`
  } else {
    blob = new Blob([plaintext], { type: 'application/json' })
    filename = `financeapp-sicherung-${new Date().toISOString().slice(0, 10)}.json`
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function importBackup(file, password) {
  const text = await file.text()
  try {
    const parsed = JSON.parse(text)
    let inner
    if (parsed.encrypted) {
      if (!password) { alert('Diese Sicherungsdatei ist verschlüsselt. Bitte Passwort eingeben.'); return false }
      try {
        const salt = fromBase64(parsed.salt)
        const iv   = fromBase64(parsed.iv)
        const key  = await deriveKey(password, salt)
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64(parsed.payload))
        inner = JSON.parse(new TextDecoder().decode(decrypted))
      } catch {
        alert('Falsches Passwort oder beschädigte Datei.'); return false
      }
    } else {
      inner = parsed
    }
    const data = inner.data && typeof inner.data === 'object' ? inner.data : inner
    let count = 0
    Object.entries(data).forEach(([key, val]) => {
      if (BACKUP_KEYS.includes(key)) { localStorage.setItem(key, JSON.stringify(val)); count++ }
    })
    if (count === 0) { alert('Keine bekannten Daten in der Sicherungsdatei gefunden.'); return false }
    window.location.reload()
    return true
  } catch {
    alert('Sicherungsdatei konnte nicht gelesen werden.')
    return false
  }
}

function Section({ title, children }) {
  return (
    <div className="module" style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>{title}</h2>
      {children}
    </div>
  )
}

// Right-side cells: fixed-width columns so values align across all rows
const COL_VAL  = { width: 90,  textAlign: 'right', fontWeight: 500, flexShrink: 0 }
const COL_PCT  = { width: 58,  textAlign: 'right', fontSize: '0.73rem', fontWeight: 600, flexShrink: 0 }
const COL_CHG  = { width: 88,  textAlign: 'right', fontWeight: 600, flexShrink: 0 }

function MiniRow({ label, value, sub, pct, hint, muted }) {
  const showRight = sub != null || pct != null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '0.28rem 0',
      borderBottom: '1px solid var(--color-border)',
      fontSize: '0.82rem',
      gap: '0.25rem',
    }}>
      <span style={{ color: muted ? 'var(--color-text-muted)' : 'var(--color-text)', flex: 1, minWidth: 0 }}>
        {label}
        {hint && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 400, marginTop: 1 }}>{hint}</span>}
      </span>
      <span style={COL_VAL}>{value}</span>
      {showRight && <>
        <span style={{ ...COL_PCT, color: (pct ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
          {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %` : ''}
        </span>
        <span style={{ ...COL_CHG, color: (sub ?? 0) >= 0 ? '#16a34a' : '#dc2626' }}>
          {sub != null ? fmtPnl(sub) : ''}
        </span>
      </>}
    </div>
  )
}

const TILE_NAV = {
  'Bankkonten':     'bankAccounts',
  'Wertpapiere':    'securities',
  'Versicherungen': 'insuranceContracts',
  'Immobilien':     'realEstate',
  'Beteiligungen':  'companyShares',
}

export default function Dashboard({ onNavigate }) {
  const fileInputRef = useRef(null)
  const [backupPassword, setBackupPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showLiqConfig, setShowLiqConfig] = useState(false)
  const [selectedSections, setSelectedSections] = useState(() => new Set(BACKUP_SECTIONS.map((_, i) => i)))
  const [liquidityLevels, setLiquidityLevelsState] = useState(
    () => JSON.parse(localStorage.getItem('liquidityLevels')) || {}
  )

  function setLiquidityLevel(key, level) {
    const next = { ...liquidityLevels }
    if (level === '') {
      delete next[key]
    } else {
      next[key] = parseInt(level)
    }
    localStorage.setItem('liquidityLevels', JSON.stringify(next))
    setLiquidityLevelsState(next)
  }

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

  const INCOME_TYPES_DASH = new Set(['dividend', 'interest'])
  const depotData = depots.map(depot => {
    const trans = depotTrans.filter(t => t.depotId === depot.id)
    const pos = {}
    trans.forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { qty: 0, cost: 0, income: 0 }
      if (t.type === 'buy') {
        pos[t.securityId].qty    += t.quantity
        pos[t.securityId].cost   += t.quantity * t.price + (t.fees || 0)
      } else if (t.type === 'sell') {
        pos[t.securityId].qty    -= t.quantity
        pos[t.securityId].cost   -= t.quantity * t.price - (t.fees || 0)
      } else if (INCOME_TYPES_DASH.has(t.type)) {
        pos[t.securityId].income += t.quantity * t.price - (t.fees || 0)
      }
    })
    const positions = Object.entries(pos)
      .filter(([, p]) => p.qty > 0 || p.income > 0)
      .map(([secId, p]) => {
        const sec      = securities.find(s => s.id == secId)
        const curPrice = getCurrentPrice(secId)
        const curValue = p.qty * curPrice
        const pnl      = curValue - p.cost + p.income
        const pct      = p.cost > 0 ? (pnl / p.cost) * 100 : null
        return { secId, name: sec?.name || secId, qty: p.qty, cost: p.cost, curValue, pnl, pct }
      })
    const totalValue = positions.reduce((s, p) => s + p.curValue, 0)
    const totalCost  = positions.reduce((s, p) => s + p.cost,     0)
    const totalPnl   = positions.reduce((s, p) => s + p.pnl,      0)
    const totalPct   = totalCost > 0 ? (totalPnl / totalCost) * 100 : null
    return { depot, positions, totalValue, totalCost, totalPnl, totalPct }
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

  // ── Liquidität: alle Positionen als flache Liste ──
  const allAssetItems = [
    ...accounts.map(a => ({ key: `bank_${a.id}`, name: a.name, type: 'Bankkonto', value: a.balance })),
    ...depotData.map(({ depot, totalValue }) => ({ key: `depot_${depot.id}`, name: depot.name, type: 'Depot', value: totalValue })),
    ...insurance.map(c => ({ key: `insurance_${c.id}`, name: c.name || c.company || '–', type: 'Versicherung', value: c.value || 0 })),
    ...realEstate.map(p => ({ key: `realestate_${p.id}`, name: p.name, type: 'Immobilie', value: p.current || 0 })),
    ...shares.map(s => ({ key: `shares_${s.id}`, name: s.company, type: 'Beteiligung', value: s.value || 0 })),
  ]

  const assignedItems   = allAssetItems.filter(a => liquidityLevels[a.key] != null)
  const unassignedItems = allAssetItems.filter(a => liquidityLevels[a.key] == null)

  const freqLabel = { monthly: 'mtl.', quarterly: 'quartl.', halfyearly: 'halbj.', yearly: 'jährl.' }

  return (
    <div>
      {/* ── Gesamtvermögen ── */}
      <div className="module" style={{ marginBottom: '1.25rem', background: 'var(--color-primary)', color: '#fff' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gesamtvermögen</div>
        <div style={{ fontSize: '2.25rem', fontWeight: 700, margin: '0.25rem 0 0.75rem' }}>{fmt(totalAssets)}</div>

        {/* Vermögensklassen – feste Kachelbreite, alle gleich groß */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            ['Bankkonten',     totalBank],
            ['Wertpapiere',    totalSecurities],
            ['Versicherungen', totalInsurance],
            ['Immobilien',     totalRealEstate],
            ['Beteiligungen',  totalShares],
          ].map(([label, val]) => {
            const navId = TILE_NAV[label]
            return (
              <div
                key={label}
                onClick={() => navId && onNavigate && onNavigate(navId)}
                style={{
                  background: 'rgba(255,255,255,0.15)', borderRadius: 8,
                  padding: '0.5rem 0.75rem', flex: '1 1 120px',
                  cursor: navId && onNavigate ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (navId && onNavigate) e.currentTarget.style.background = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
                title={navId ? `Zu ${label} wechseln` : undefined}
              >
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{fmt(val)}</div>
              </div>
            )
          })}
        </div>

        {/* Liquiditätsstufen-Zusammenfassung */}
        {assignedItems.length > 0 && (
          <>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.25)', margin: '0.85rem 0 0.65rem' }} />
            <div style={{ fontSize: '0.72rem', opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              Liquidität
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {LIQUIDITY_ORDER.map(level => {
                const lDef  = LIQUIDITY_LEVELS[level]
                const items = assignedItems.filter(a => liquidityLevels[a.key] === level)
                if (items.length === 0) return null
                const lvlTotal = items.reduce((s, a) => s + a.value, 0)
                const pct      = totalAssets > 0 ? (lvlTotal / totalAssets) * 100 : 0
                return (
                  <div key={level} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.5rem 0.75rem', borderLeft: `3px solid ${lDef.color}`, flex: '1 1 120px' }}>
                    <div style={{ fontSize: '0.68rem', opacity: 0.8 }}>{lDef.label} · {lDef.desc}</div>
                    <div style={{ fontWeight: 700 }}>{fmt(lvlTotal)}</div>
                    <div style={{ fontSize: '0.68rem', opacity: 0.65 }}>{pct.toFixed(1)} %</div>
                  </div>
                )
              })}
              {unassignedItems.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.5rem 0.75rem', borderLeft: '3px solid rgba(255,255,255,0.3)', flex: '1 1 120px' }}>
                  <div style={{ fontSize: '0.68rem', opacity: 0.7 }}>Nicht zugeordnet</div>
                  <div style={{ fontWeight: 600 }}>{fmt(unassignedItems.reduce((s, a) => s + a.value, 0))}</div>
                  <div style={{ fontSize: '0.68rem', opacity: 0.55 }}>{unassignedItems.length} Position{unassignedItems.length > 1 ? 'en' : ''}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Liquiditätsübersicht ── */}
      <div className="module" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Liquiditätsübersicht</h2>
          <button
            onClick={() => setShowLiqConfig(v => !v)}
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-muted)' }}
          >
            {showLiqConfig ? 'Konfiguration schließen' : 'Stufen konfigurieren'}
          </button>
        </div>

        {/* Konfiguration */}
        {showLiqConfig && (
          <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '0.85rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              Liquiditätsstufe je Position festlegen
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {allAssetItems.map(item => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', marginRight: '0.3rem' }}>{item.type}</span>
                    {item.name}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem', flexShrink: 0 }}>{fmt(item.value)}</span>
                  <select
                    value={liquidityLevels[item.key] ?? ''}
                    onChange={e => setLiquidityLevel(item.key, e.target.value)}
                    style={{ fontSize: '0.78rem', padding: '0.18rem 0.4rem', flexShrink: 0 }}
                  >
                    <option value="">– nicht zugeordnet –</option>
                    {LIQUIDITY_ORDER.map(l => (
                      <option key={l} value={l}>{LIQUIDITY_LEVELS[l].label} – {LIQUIDITY_LEVELS[l].desc}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Übersicht je Stufe */}
        {LIQUIDITY_ORDER.map(level => {
          const lDef  = LIQUIDITY_LEVELS[level]
          const items = assignedItems.filter(a => liquidityLevels[a.key] === level)
          if (items.length === 0) return null
          const total = items.reduce((s, a) => s + a.value, 0)
          const pct   = totalAssets > 0 ? (total / totalAssets) * 100 : 0
          return (
            <div key={level} style={{ marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: lDef.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{lDef.label}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{lDef.desc}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{pct.toFixed(1)} %</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmt(total)}</span>
                </div>
              </div>
              {/* Fortschrittsbalken */}
              <div style={{ width: '100%', height: 4, borderRadius: 9999, background: 'var(--color-border)', overflow: 'hidden', marginBottom: '0.3rem' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: lDef.color, transition: 'width 0.4s ease' }} />
              </div>
              {/* Einzelne Positionen */}
              {items.map(a => (
                <MiniRow key={a.key} label={a.name} value={fmt(a.value)} hint={a.type} muted />
              ))}
            </div>
          )
        })}

        {/* Nicht zugeordnete Positionen */}
        {unassignedItems.length > 0 && (
          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#fef9c3', borderRadius: 6, fontSize: '0.78rem', color: '#854d0e' }}>
            {unassignedItems.length} Position{unassignedItems.length > 1 ? 'en' : ''} noch keiner Liquiditätsstufe zugeordnet
            ({unassignedItems.map(a => a.name).join(', ')})
          </div>
        )}

        {allAssetItems.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>
            Noch keine Vermögenswerte vorhanden.
          </p>
        )}
      </div>

      {/* ── Sicherung ── */}
      <div className="module" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginBottom: '0.75rem' }}>Datensicherung</h2>

        {/* Section selection */}
        <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Bereiche für Export auswählen
            </span>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                onClick={() => setSelectedSections(new Set(BACKUP_SECTIONS.map((_, i) => i)))}
                style={{ fontSize: '0.75rem', padding: '0.18rem 0.5rem', background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', borderRadius: 5, cursor: 'pointer' }}
              >Alle</button>
              <button
                onClick={() => setSelectedSections(new Set())}
                style={{ fontSize: '0.75rem', padding: '0.18rem 0.5rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 5, cursor: 'pointer' }}
              >Keine</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {BACKUP_SECTIONS.map((sec, i) => {
              const checked = selectedSections.has(i)
              return (
                <label key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontSize: '0.82rem', cursor: 'pointer',
                  padding: '0.22rem 0.55rem',
                  borderRadius: 6,
                  border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: checked ? 'rgba(var(--color-primary-rgb, 37,99,235),0.07)' : 'transparent',
                  userSelect: 'none',
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedSections(prev => {
                        const next = new Set(prev)
                        next.has(i) ? next.delete(i) : next.add(i)
                        return next
                      })
                    }}
                    style={{ margin: 0 }}
                  />
                  {sec.label}
                </label>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={backupPassword}
              onChange={e => setBackupPassword(e.target.value)}
              placeholder="Passwort (optional)"
              style={{ fontSize: '0.85rem', padding: '0.38rem 2.2rem 0.38rem 0.6rem', minWidth: 180 }}
            />
            <button
              onClick={() => setShowPassword(v => !v)}
              style={{ position: 'absolute', right: 4, background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.8rem' }}
              title={showPassword ? 'Verbergen' : 'Anzeigen'}
            >{showPassword ? '🙈' : '👁'}</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => {
              const keys = BACKUP_SECTIONS.filter((_, i) => selectedSections.has(i)).flatMap(s => s.keys)
              if (keys.length === 0) { alert('Bitte mindestens einen Bereich auswählen.'); return }
              exportBackup(backupPassword || null, keys)
            }}
            style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}
            title={`${selectedSections.size} Bereich${selectedSections.size !== 1 ? 'e' : ''} ausgewählt`}
          >
            Sicherung herunterladen {selectedSections.size < BACKUP_SECTIONS.length ? `(${selectedSections.size}/${BACKUP_SECTIONS.length})` : '(alles)'}
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', background: '#6b7280' }}>
            Sicherung wiederherstellen
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) importBackup(e.target.files[0], backupPassword || null) }}
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
          Mit Passwort wird die Sicherung verschlüsselt (AES-256). Ohne Passwort wird unverschlüsselt gespeichert. Browser-Reset löscht alle Daten dauerhaft.
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
          {depotData.map(({ depot, positions, totalValue, totalPnl, totalPct }) => (
            <div key={depot.id} style={{ marginBottom: '0.75rem' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '0.3rem 0', borderBottom: '2px solid var(--color-border)',
                fontWeight: 600, fontSize: '0.88rem', gap: '0.5rem',
              }}>
                <span>{depot.name}</span>
                <span style={{ display: 'flex', gap: '0.45rem', alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {fmt(totalValue)}
                  {totalPct != null && <span style={{ fontSize: '0.73rem', fontWeight: 600, color: totalPct >= 0 ? '#16a34a' : '#dc2626' }}>{totalPct >= 0 ? '+' : ''}{totalPct.toFixed(1)} %</span>}
                  <span style={pnlStyle(totalPnl)}>{fmtPnl(totalPnl)}</span>
                </span>
              </div>
              {positions.map(p => (
                <MiniRow
                  key={p.secId}
                  label={`${p.name} (${p.qty.toLocaleString('de-DE', { maximumFractionDigits: 4 })} Stk.)`}
                  value={fmt(p.curValue)}
                  pct={p.pct}
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
          {realEstate.map(p => {
            const diff = p.current - p.purchase
            const pct  = p.purchase > 0 ? (diff / p.purchase) * 100 : null
            return (
              <MiniRow
                key={p.id}
                label={p.name}
                value={fmt(p.current)}
                pct={pct}
                sub={diff}
              />
            )
          })}
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
          {subscriptions.map(s => {
            const cancelParts = []
            if (s.cancel)     cancelParts.push(`Frist: ${s.cancel}`)
            if (s.cancelDate) cancelParts.push(`Kündigung bis: ${s.cancelDate}`)
            return (
              <MiniRow
                key={s.id}
                label={`${s.name} (${freqLabel[s.frequency] || s.frequency})`}
                value={fmt(s.cost)}
                hint={cancelParts.length ? cancelParts.join(' · ') : null}
                muted={!s.aktiv}
              />
            )
          })}
        </Section>
      )}
    </div>
  )
}
