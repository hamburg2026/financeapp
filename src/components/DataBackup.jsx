import { useRef, useState } from 'react'

const BACKUP_KEYS = [
  'bankAccounts', 'transactions', 'categories', 'recurringPayments',
  'depots', 'depotTransactions', 'securityPrices', 'securities', 'fxRates',
  'insuranceContracts', 'insurancePersons', 'realEstate', 'companyShares', 'subscriptions',
  'serviceEntries', 'serviceTypes',
  'banks', 'liquidityLevels',
]

const BACKUP_SECTIONS = [
  { label: 'Bankkonten & Umsätze',  keys: ['bankAccounts', 'transactions', 'banks'] },
  { label: 'Kategorien',            keys: ['categories'] },
  { label: 'Daueraufträge',         keys: ['recurringPayments'] },
  { label: 'Wertpapiere & Depots',  keys: ['securities', 'securityPrices', 'depots', 'depotTransactions', 'fxRates'] },
  { label: 'Versicherungen',        keys: ['insuranceContracts', 'insurancePersons'] },
  { label: 'Abonnements',           keys: ['subscriptions'] },
  { label: 'Immobilien',            keys: ['realEstate'] },
  { label: 'Firmenbeteiligungen',   keys: ['companyShares'] },
  { label: 'Dienstleistungskosten', keys: ['serviceEntries', 'serviceTypes'] },
  { label: 'Einstellungen',         keys: ['liquidityLevels'] },
]

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

function toBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}
function fromBase64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)) }

function getAvailableSectionIndices(data) {
  return BACKUP_SECTIONS.reduce((acc, sec, i) => {
    if (sec.keys.some(k => k in data)) acc.push(i)
    return acc
  }, [])
}

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

export default function DataBackup() {
  const fileInputRef = useRef(null)
  const [backupPassword, setBackupPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedSections, setSelectedSections] = useState(() => new Set(BACKUP_SECTIONS.map((_, i) => i)))
  const [restoreModal, setRestoreModal] = useState(null)

  async function openRestoreModal(file) {
    const text = await file.text()
    try {
      const parsed = JSON.parse(text)
      if (parsed.encrypted) {
        setRestoreModal({ parsed, inner: null, restorePassword: '', selectedSections: new Set(), availableSectionIndices: [], error: null })
      } else {
        const inner = parsed
        const data = inner.data && typeof inner.data === 'object' ? inner.data : inner
        const available = getAvailableSectionIndices(data)
        setRestoreModal({ parsed, inner, restorePassword: '', selectedSections: new Set(available), availableSectionIndices: available, error: null })
      }
    } catch {
      alert('Sicherungsdatei konnte nicht gelesen werden.')
    }
  }

  async function decryptRestoreModal() {
    const { parsed, restorePassword } = restoreModal
    try {
      const salt = fromBase64(parsed.salt)
      const iv   = fromBase64(parsed.iv)
      const key  = await deriveKey(restorePassword, salt)
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, fromBase64(parsed.payload))
      const inner = JSON.parse(new TextDecoder().decode(decrypted))
      const data = inner.data && typeof inner.data === 'object' ? inner.data : inner
      const available = getAvailableSectionIndices(data)
      setRestoreModal(prev => ({ ...prev, inner, selectedSections: new Set(available), availableSectionIndices: available, error: null }))
    } catch {
      setRestoreModal(prev => ({ ...prev, error: 'Falsches Passwort oder beschädigte Datei.' }))
    }
  }

  function performRestore() {
    const { inner, selectedSections: sel, availableSectionIndices } = restoreModal
    const data = inner.data && typeof inner.data === 'object' ? inner.data : inner
    const keysToRestore = availableSectionIndices
      .filter(secIdx => sel.has(secIdx))
      .flatMap(secIdx => BACKUP_SECTIONS[secIdx].keys)
    let count = 0
    keysToRestore.forEach(key => {
      if (key in data) { localStorage.setItem(key, JSON.stringify(data[key])); count++ }
    })
    if (count === 0) { alert('Keine Daten zum Wiederherstellen ausgewählt.'); return }
    window.location.reload()
  }

  return (
    <div className="module">
      {/* ── Restore Modal ── */}
      {restoreModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 12, padding: '1.5rem', maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Sicherung wiederherstellen</h3>

            {restoreModal.inner?.exportedAt && (
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: '0 0 0.75rem' }}>
                Exportiert am: {new Date(restoreModal.inner.exportedAt).toLocaleString('de-DE')}
              </p>
            )}

            {restoreModal.parsed.encrypted && !restoreModal.inner && (
              <div style={{ marginBottom: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', margin: '0 0 0.5rem', color: 'var(--color-text-muted)' }}>
                  Diese Datei ist verschlüsselt. Bitte Passwort eingeben:
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="password"
                    value={restoreModal.restorePassword}
                    onChange={e => setRestoreModal(prev => ({ ...prev, restorePassword: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') decryptRestoreModal() }}
                    placeholder="Passwort"
                    style={{ flex: 1, fontSize: '0.85rem', padding: '0.38rem 0.6rem' }}
                    autoFocus
                  />
                  <button onClick={decryptRestoreModal} style={{ fontSize: '0.85rem', padding: '0.38rem 0.8rem' }}>
                    Entschlüsseln
                  </button>
                </div>
                {restoreModal.error && (
                  <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0.4rem 0 0' }}>{restoreModal.error}</p>
                )}
              </div>
            )}

            {restoreModal.inner && restoreModal.availableSectionIndices.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Bereiche wiederherstellen
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      onClick={() => setRestoreModal(prev => ({ ...prev, selectedSections: new Set(prev.availableSectionIndices) }))}
                      style={{ fontSize: '0.75rem', padding: '0.18rem 0.5rem', background: 'transparent', border: '1px solid var(--color-primary)', color: 'var(--color-primary)', borderRadius: 5, cursor: 'pointer' }}
                    >Alle</button>
                    <button
                      onClick={() => setRestoreModal(prev => ({ ...prev, selectedSections: new Set() }))}
                      style={{ fontSize: '0.75rem', padding: '0.18rem 0.5rem', background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: 5, cursor: 'pointer' }}
                    >Keine</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {restoreModal.availableSectionIndices.map(secIdx => {
                    const sec = BACKUP_SECTIONS[secIdx]
                    const checked = restoreModal.selectedSections.has(secIdx)
                    return (
                      <label key={secIdx} style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.82rem', cursor: 'pointer',
                        padding: '0.22rem 0.55rem', borderRadius: 6,
                        border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: checked ? 'rgba(var(--color-primary-rgb, 37,99,235),0.07)' : 'transparent',
                        userSelect: 'none',
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setRestoreModal(prev => {
                            const next = new Set(prev.selectedSections)
                            next.has(secIdx) ? next.delete(secIdx) : next.add(secIdx)
                            return { ...prev, selectedSections: next }
                          })}
                          style={{ margin: 0 }}
                        />
                        {sec.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {restoreModal.inner && restoreModal.availableSectionIndices.length === 0 && (
              <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                Keine bekannten Daten in der Sicherungsdatei gefunden.
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <button
                onClick={() => setRestoreModal(null)}
                style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', background: '#6b7280' }}
              >
                Abbrechen
              </button>
              {restoreModal.inner && (
                <button
                  onClick={performRestore}
                  disabled={restoreModal.selectedSections.size === 0}
                  style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', opacity: restoreModal.selectedSections.size === 0 ? 0.5 : 1, cursor: restoreModal.selectedSections.size === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Wiederherstellen ({restoreModal.selectedSections.size})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
          onChange={e => {
            const file = e.target.files[0]
            e.target.value = ''
            if (file) openRestoreModal(file)
          }}
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
  )
}
