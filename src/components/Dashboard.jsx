import { useRef, useState } from 'react'

const fmt = (n) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

const fmtPnl = (n) => (n >= 0 ? '+\u202f' : '\u2212\u202f') + fmt(Math.abs(n))

const pnlStyle = (n) => ({ color: n >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 })

// All localStorage keys that belong to the app
const BACKUP_KEYS = [
  'bankAccounts', 'transactions', 'categories', 'recurringPayments',
  'depots', 'depotTransactions', 'securityPrices', 'securities', 'fxRates',
  'insuranceContracts', 'realEstate', 'companyShares', 'subscriptions',
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

async function exportBackup(password) {
  const data = {}
  BACKUP_KEYS.forEach(key => {
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

export default function Dashboard() {
  const fileInputRef = useRef(null)
  const [backupPassword, setBackupPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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

  const freqLabel = { monthly: 'mtl.', quarterly: 'quartl.', halfyearly: 'halbj.', yearly: 'jährl.' }

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
          <button onClick={() => exportBackup(backupPassword || null)} style={{ fontSize: '0.85rem', padding: '0.45rem 1rem' }}>
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
