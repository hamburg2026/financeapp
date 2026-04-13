import { useState } from 'react'
import { fmt, fmtNum } from '../fmt'

const FREQ_LABELS = {
  monthly:    'Monatlich',
  quarterly:  'Vierteljährlich',
  halfyearly: 'Halbjährlich',
  yearly:     'Jährlich',
}

const PRINT_SECTIONS = [
  { id: 'bankAccounts',       label: 'Bankkonten',           icon: '🏦' },
  { id: 'insuranceContracts', label: 'Versicherungen',       icon: '🛡️' },
  { id: 'securities',         label: 'Wertpapiere & Depots', icon: '📈' },
  { id: 'realEstate',         label: 'Immobilien',           icon: '🏠' },
  { id: 'companyShares',      label: 'Firmenbeteiligungen',  icon: '🏢' },
  { id: 'subscriptions',      label: 'Abonnements',          icon: '📱' },
  { id: 'recurringPayments',  label: 'Daueraufträge',        icon: '🔄' },
  { id: 'categories',         label: 'Kategorien',           icon: '🏷️' },
]

function isoToGerman(iso) {
  if (!iso || iso.length < 10) return '–'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function latestHistoryValue(history, fallback) {
  if (!history?.length) return fallback
  return [...history].sort((a, b) => b.date.localeCompare(a.date))[0].value
}

function isAnnuity(c) {
  return c.verrentungTyp === 'verrentung' || c.verrentungTyp === 'nurVerrentung' || (!!c.nurVerrentung && !c.verrentungTyp)
}

function isNurVerrentung(c) {
  return c.verrentungTyp === 'nurVerrentung' || (!!c.nurVerrentung && !c.verrentungTyp)
}

// ─── Unified print table (no colors, compact) ─────────────────────────────────

const TH = {
  padding: '0.15rem 0.35rem',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
  borderRight: '1px solid #e5e7eb',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#4b5563',
  whiteSpace: 'nowrap',
}

const TD = {
  padding: '0.15rem 0.35rem',
  borderBottom: '1px solid #e5e7eb',
  borderRight: '1px solid #f3f4f6',
  fontSize: '0.72rem',
  verticalAlign: 'top',
}

const TD_LAST = { ...TD, borderRight: 'none' }

function PrintTable({ headers, rows, emptyText = 'Keine Einträge vorhanden.' }) {
  if (!rows.length) return <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0.15rem 0 0.4rem' }}>{emptyText}</p>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', tableLayout: 'auto' }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ ...TH, ...(i === headers.length - 1 ? { borderRight: 'none' } : {}) }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
            {row.map((cell, ci) => (
              <td key={ci} style={ci === row.length - 1 ? TD_LAST : TD}>{cell ?? '–'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SectionTitle({ icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.3rem',
      borderBottom: '1.5px solid #374151', paddingBottom: '0.18rem',
      marginTop: '0.9rem', marginBottom: '0.3rem',
      pageBreakAfter: 'avoid',
    }}>
      <h2 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{icon} {label}</h2>
    </div>
  )
}

// ─── Section renderers ─────────────────────────────────────────────────────────

function PrintBankAccounts({ accounts }) {
  return (
    <PrintTable
      headers={['Kontoname', 'Aktueller Saldo']}
      rows={accounts.map(a => [
        a.name,
        fmt(latestHistoryValue(a.balanceHistory, a.balance)),
      ])}
    />
  )
}

// Column widths for insurance table (fixed layout, equal field sizes for every row)
const INS_COLS = [
  { label: 'Name',         width: '19%' },
  { label: 'Anbieter',     width: '13%' },
  { label: 'Vertrags-Nr.', width: '11%' },
  { label: 'Prämie',       width: '8%'  },
  { label: 'Rhythmus',     width: '9%'  },
  { label: 'Status',       width: '6%'  },
  { label: 'Verrentung',   width: '10%' },
  { label: 'Personen',     width: '14%' },
  { label: 'Kategorie',    width: '10%' },
]

function PrintInsurances({ contracts, categories }) {
  if (!contracts.length) return <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0.15rem 0 0.4rem' }}>Keine Versicherungen vorhanden.</p>

  const catName = id => categories.find(c => c.id === id)?.name || '–'
  const freq = f => FREQ_LABELS[f] || f || '–'

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', tableLayout: 'fixed' }}>
      <colgroup>
        {INS_COLS.map((col, i) => <col key={i} style={{ width: col.width }} />)}
      </colgroup>
      <thead>
        <tr>
          {INS_COLS.map((col, i) => (
            <th key={i} style={{ ...TH, ...(i === INS_COLS.length - 1 ? { borderRight: 'none' } : {}) }}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {contracts.map((c, ri) => {
          const annuity  = isAnnuity(c)
          const nurVer   = isNurVerrentung(c)
          const verLabel = c.verrentungTyp === 'nichtRelevant' ? 'Nein'
                         : nurVer           ? 'Nur Verr.'
                         : annuity          ? 'Ja'
                         : '–'
          const latest   = c.valueHistory?.length
            ? [...c.valueHistory].sort((a, b) => b.date.localeCompare(a.date))[0]
            : null
          const rentInfo = annuity && latest?.multiplikator && latest?.garantierteJaehrlicheRente
            ? `${fmt((latest.value / latest.multiplikator) * latest.garantierteJaehrlicheRente)}/J.`
            : null
          const personStr = c.persons?.length
            ? c.persons.map(p => p.name + (p.role ? ` (${p.role})` : '')).join(', ')
            : '–'

          return (
            <tr key={c.id} style={{ background: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={{ ...TD, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
              <td style={{ ...TD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.provider || '–'}</td>
              <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.vertragsnummer || '–'}</td>
              <td style={{ ...TD, whiteSpace: 'nowrap' }}>{c.premium > 0 ? fmt(c.premium) : '–'}</td>
              <td style={TD}>{c.premium > 0 ? freq(c.premiumFrequency) : '–'}</td>
              <td style={TD}>{c.active ? 'Aktiv' : 'Inaktiv'}</td>
              <td style={TD}>{rentInfo ? `${verLabel} · ${rentInfo}` : verLabel}</td>
              <td style={{ ...TD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{personStr}</td>
              <td style={{ ...TD_LAST, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{catName(c.categoryId)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const INCOME_TX = new Set(['dividend', 'interest'])

function PrintSecurities({ securities, prices, depots, depotTransactions }) {
  const hasSecurities = securities.length > 0
  const hasDepots     = depots.length > 0

  if (!hasSecurities && !hasDepots) return <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0.15rem 0 0.4rem' }}>Keine Wertpapiere oder Depots vorhanden.</p>

  function getLatestPrice(secId) {
    const arr = prices[String(secId)]
    if (!arr?.length) return 0
    return [...arr].sort((a, b) => b.date.localeCompare(a.date))[0].value
  }

  function getPositions(depotId) {
    const pos = {}
    depotTransactions.filter(t => String(t.depotId) === String(depotId)).forEach(t => {
      if (!pos[t.securityId]) pos[t.securityId] = { quantity: 0, cost: 0, income: 0 }
      if (t.type === 'buy') {
        pos[t.securityId].quantity += t.quantity
        pos[t.securityId].cost    += t.quantity * t.price + (t.fees || 0)
      } else if (t.type === 'sell') {
        pos[t.securityId].quantity -= t.quantity
        pos[t.securityId].cost    -= t.quantity * t.price - (t.fees || 0)
      } else if (INCOME_TX.has(t.type)) {
        pos[t.securityId].income  += t.price - (t.fees || 0)
      }
    })
    return Object.entries(pos)
      .filter(([, p]) => p.quantity > 0.0001 || p.income > 0)
      .map(([secId, p]) => {
        const sec      = securities.find(s => String(s.id) === secId)
        const curPrice = getLatestPrice(secId)
        const curValue = p.quantity * curPrice
        return { secId, sec, quantity: p.quantity, curValue, cost: p.cost, income: p.income }
      })
  }

  const subLabel = { fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280', margin: '0.3rem 0 0.15rem' }

  return (
    <>
      {hasSecurities && (
        <>
          <div style={subLabel}>Wertpapiere</div>
          <PrintTable
            headers={['Name', 'Symbol', 'ISIN', 'Typ', 'Währung', 'Letzter Kurs', 'Stand']}
            rows={securities.map(s => {
              const secPrices = [...(prices[s.id] || [])].sort((a, b) => b.date.localeCompare(a.date))
              const latest = secPrices[0]
              return [
                s.name,
                s.symbol || '–',
                s.isin   || '–',
                s.type   || '–',
                s.currency || 'EUR',
                latest ? `${fmtNum(latest.value)} ${s.currency || 'EUR'}` : '–',
                latest ? isoToGerman(latest.date) : '–',
              ]
            })}
          />
        </>
      )}
      {hasDepots && depots.map(d => {
        const positions  = getPositions(d.id)
        const totalValue = positions.reduce((s, p) => s + p.curValue, 0)
        const totalIncome = positions.reduce((s, p) => s + p.income, 0)
        return (
          <div key={d.id}>
            <div style={{ ...subLabel, marginTop: hasSecurities ? '0.55rem' : '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>Depot: {d.name}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#111827' }}>
                Bestand: {fmt(totalValue)}{totalIncome > 0 ? ` · Erträge: +${fmt(totalIncome)}` : ''}
              </span>
            </div>
            <PrintTable
              headers={['Wertpapier', 'ISIN', 'Anzahl', 'Kurs', 'Bestand']}
              emptyText="Keine offenen Positionen."
              rows={positions.map(p => [
                p.sec?.name || p.secId,
                p.sec?.isin || '–',
                fmtNum(p.quantity, 4),
                getLatestPrice(p.secId) > 0 ? fmt(getLatestPrice(p.secId)) : '–',
                p.curValue > 0 ? fmt(p.curValue) : '–',
              ])}
            />
          </div>
        )
      })}
    </>
  )
}

function PrintRealEstate({ properties }) {
  return (
    <PrintTable
      headers={['Bezeichnung', 'Anschaffungswert', 'Aktueller Zeitwert', 'G / V', 'Notizen']}
      rows={properties.map(p => {
        const current = latestHistoryValue(p.currentHistory, p.current)
        const pnl     = current - p.purchase
        const pnlPct  = p.purchase > 0 ? (pnl / p.purchase) * 100 : null
        const pnlStr  = (pnl >= 0 ? '+' : '') + fmt(pnl) + (pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %)` : '')
        return [p.name, fmt(p.purchase), fmt(current), pnlStr, p.notes || '–']
      })}
    />
  )
}

function PrintCompanyShares({ shares }) {
  const total = shares.reduce((sum, s) => sum + latestHistoryValue(s.valueHistory, s.value), 0)
  return (
    <>
      <PrintTable
        headers={['Firma', 'Beteiligung', 'Aktueller Wert', 'Notizen']}
        rows={shares.map(s => [
          s.company,
          `${fmtNum(s.percentage)} %`,
          fmt(latestHistoryValue(s.valueHistory, s.value)),
          s.notes || '–',
        ])}
      />
      {shares.length > 1 && (
        <div style={{ textAlign: 'right', fontSize: '0.77rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderTop: '1px solid #d1d5db' }}>
          Gesamt: {fmt(total)}
        </div>
      )}
    </>
  )
}

function PrintSubscriptions({ subscriptions, categories }) {
  const catName = id => categories.find(c => c.id == id)?.name || '–'
  return (
    <PrintTable
      headers={['Name', 'Betrag', 'Häufigkeit', 'Typ', 'Status', 'Kündigung', 'Kategorie']}
      rows={subscriptions.map(s => [
        s.name,
        fmt(s.cost),
        FREQ_LABELS[s.frequency] || s.frequency || '–',
        s.type || '–',
        s.active ? 'Aktiv' : 'Inaktiv',
        s.cancel ? (s.cancelDate ? `bis ${isoToGerman(s.cancelDate)}` : 'Ja') : '–',
        catName(s.categoryId),
      ])}
    />
  )
}

function PrintRecurringPayments({ recurrings, categories }) {
  const catName = id => categories.find(c => c.id == id)?.name || '–'
  return (
    <PrintTable
      headers={['Beschreibung', 'Betrag', 'Häufigkeit', 'Typ', 'Kategorie', 'Quelle']}
      rows={recurrings.map(r => [
        r.description,
        fmt(r.amount),
        FREQ_LABELS[r.frequency] || r.frequency || '–',
        r.type || '–',
        catName(r.categoryId),
        r.insuranceId ? 'Versicherung' : r.subscriptionId ? 'Abonnement' : 'Manuell',
      ])}
    />
  )
}

function PrintCategories({ categories }) {
  if (!categories.length) return <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0.2rem 0 0.5rem' }}>Keine Kategorien vorhanden.</p>

  function renderTree(parentId = null, depth = 0) {
    return categories
      .filter(c => c.parent == parentId)
      .map(c => (
        <div key={c.id} style={{ marginLeft: depth * 12, padding: '0.12rem 0', fontSize: '0.77rem', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
          {depth > 0 && <span style={{ color: '#9ca3af', fontSize: '0.68rem', flexShrink: 0 }}>└</span>}
          <span style={{ fontWeight: depth === 0 ? 700 : 400 }}>{c.name}</span>
          <span style={{ fontSize: '0.65rem', color: '#6b7280', fontStyle: 'italic' }}>{c.type}</span>
          {renderTree(c.id, depth + 1)}
        </div>
      ))
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '0.4rem 0.65rem' }}>
      {renderTree()}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PrintDialog({ onClose }) {
  const initialSelected = Object.fromEntries(PRINT_SECTIONS.map(s => [s.id, true]))
  const [selected, setSelected] = useState(initialSelected)

  const accounts          = JSON.parse(localStorage.getItem('bankAccounts'))       || []
  const insurances        = JSON.parse(localStorage.getItem('insuranceContracts'))  || []
  const securities        = JSON.parse(localStorage.getItem('securities'))          || []
  const prices            = JSON.parse(localStorage.getItem('securityPrices'))      || {}
  const depots            = JSON.parse(localStorage.getItem('depots'))              || []
  const depotTransactions = JSON.parse(localStorage.getItem('depotTransactions'))   || []
  const realEstate        = JSON.parse(localStorage.getItem('realEstate'))          || []
  const companyShares     = JSON.parse(localStorage.getItem('companyShares'))       || []
  const subscriptions     = JSON.parse(localStorage.getItem('subscriptions'))       || []
  const recurrings        = JSON.parse(localStorage.getItem('recurringPayments'))   || []
  const categories        = JSON.parse(localStorage.getItem('categories'))          || []

  const anySelected = Object.values(selected).some(Boolean)
  const printDate   = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  function toggleAll(val) {
    setSelected(Object.fromEntries(PRINT_SECTIONS.map(s => [s.id, val])))
  }

  return (
    <>
      {/* ── Selection dialog – hidden when printing ── */}
      <div className="print-dialog-overlay">
        <div className="print-dialog-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--color-primary)' }}>Ausdruck erstellen</h2>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0.2rem 0.5rem', lineHeight: 1 }}
              aria-label="Schließen"
            >✕</button>
          </div>

          <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Bereiche auswählen, die im Ausdruck enthalten sein sollen:
          </p>

          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => toggleAll(true)}
              style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, padding: '0.25rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem' }}
            >Alle auswählen</button>
            <button
              onClick={() => toggleAll(false)}
              style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, padding: '0.25rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem' }}
            >Alle abwählen</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '1.25rem' }}>
            {PRINT_SECTIONS.map(s => (
              <label
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  cursor: 'pointer', fontSize: '0.85rem', padding: '0.35rem 0.6rem',
                  borderRadius: 7, userSelect: 'none',
                  background: selected[s.id] ? '#f0fdf4' : 'transparent',
                  border: `1px solid ${selected[s.id] ? '#86efac' : 'var(--color-border)'}`,
                  transition: 'background 0.1s, border-color 0.1s',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected[s.id]}
                  onChange={e => setSelected(prev => ({ ...prev, [s.id]: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: 'var(--color-primary)', flexShrink: 0 }}
                />
                <span style={{ fontSize: '0.95rem' }}>{s.icon}</span>
                <span>{s.label}</span>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => window.print()}
              disabled={!anySelected}
              style={{
                flex: 1, padding: '0.6rem', fontSize: '0.92rem', fontWeight: 600,
                background: anySelected ? 'var(--color-primary)' : '#e5e7eb',
                color: anySelected ? '#fff' : '#9ca3af',
                border: 'none', borderRadius: 8,
                cursor: anySelected ? 'pointer' : 'not-allowed',
              }}
            >Drucken</button>
            <button
              onClick={onClose}
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.92rem', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >Abbrechen</button>
          </div>
        </div>
      </div>

      {/* ── Print view – only visible during printing ── */}
      <div className="print-view">
        <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#111827', fontSize: '0.72rem' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #111827', paddingBottom: '0.25rem', marginBottom: '0.2rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Finanzverwaltung – Ausdruck</div>
            <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>Stand: {printDate}</div>
          </div>
          <div style={{ fontSize: '0.63rem', color: '#6b7280', marginBottom: '0.35rem' }}>
            Enthält: {PRINT_SECTIONS.filter(s => selected[s.id]).map(s => s.label).join(' · ')}
          </div>

          {selected.bankAccounts && (
            <>
              <SectionTitle icon="🏦" label="Bankkonten" />
              <PrintBankAccounts accounts={accounts} />
            </>
          )}

          {selected.insuranceContracts && (
            <>
              <SectionTitle icon="🛡️" label="Versicherungen" />
              <PrintInsurances contracts={insurances} categories={categories} />
            </>
          )}

          {selected.securities && (
            <>
              <SectionTitle icon="📈" label="Wertpapiere & Depots" />
              <PrintSecurities securities={securities} prices={prices} depots={depots} depotTransactions={depotTransactions} />
            </>
          )}

          {selected.realEstate && (
            <>
              <SectionTitle icon="🏠" label="Immobilien" />
              <PrintRealEstate properties={realEstate} />
            </>
          )}

          {selected.companyShares && (
            <>
              <SectionTitle icon="🏢" label="Firmenbeteiligungen" />
              <PrintCompanyShares shares={companyShares} />
            </>
          )}

          {selected.subscriptions && (
            <>
              <SectionTitle icon="📱" label="Abonnements" />
              <PrintSubscriptions subscriptions={subscriptions} categories={categories} />
            </>
          )}

          {selected.recurringPayments && (
            <>
              <SectionTitle icon="🔄" label="Daueraufträge" />
              <PrintRecurringPayments recurrings={recurrings} categories={categories} />
            </>
          )}

          {selected.categories && (
            <>
              <SectionTitle icon="🏷️" label="Kategorien" />
              <PrintCategories categories={categories} />
            </>
          )}

        </div>
      </div>
    </>
  )
}
