import { useState } from 'react'
import { fmt, fmtNum } from '../fmt'

const FREQ_LABELS = {
  monthly:    'Monatlich',
  quarterly:  'Vierteljährlich',
  halfyearly: 'Halbjährlich',
  yearly:     'Jährlich',
}

const TX_LABELS = { buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende', interest: 'Zinsen' }

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

// ─── Shared print primitives ───────────────────────────────────────────────────

function SectionTitle({ icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      borderBottom: '2px solid #1a6b3c', paddingBottom: '0.3rem',
      marginTop: '1.8rem', marginBottom: '0.65rem',
      pageBreakAfter: 'avoid',
    }}>
      <span>{icon}</span>
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1a6b3c' }}>{label}</h2>
    </div>
  )
}

function SubTable({ headers, rows }) {
  if (!rows.length) return null
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem', marginTop: '0.2rem' }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: '0.2rem 0.4rem', background: '#f0fdf4', borderBottom: '1px solid #d1fae5', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: '0.2rem 0.4rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function FlatTable({ headers, rows }) {
  if (!rows.length) return <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: '0.25rem 0' }}>Keine Einträge vorhanden.</p>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{ padding: '0.3rem 0.5rem', background: '#f0fdf4', borderBottom: '1px solid #d1fae5', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
            {row.map((cell, j) => (
              <td key={j} style={{ padding: '0.3rem 0.5rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ItemCard({ title, badge, fields, children }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: '0.55rem', overflow: 'hidden', pageBreakInside: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.65rem', background: '#f0fdf4', borderBottom: '1px solid #d1fae5' }}>
        <span style={{ fontWeight: 700, fontSize: '0.85rem', flex: 1 }}>{title}</span>
        {badge != null && (
          <span style={{ fontSize: '0.71rem', background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '0.05rem 0.4rem', fontWeight: 600, flexShrink: 0 }}>
            {badge}
          </span>
        )}
      </div>
      {fields.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', padding: '0.25rem 0.65rem 0.15rem', gap: '0 1.25rem' }}>
          {fields.map(([label, value], i) => (
            <div key={i} style={{ marginBottom: '0.2rem' }}>
              <div style={{ fontSize: '0.63rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{value ?? '–'}</div>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

function HistoryBlock({ label, children }) {
  return (
    <div style={{ padding: '0.25rem 0.65rem 0.35rem', borderTop: '1px solid #f3f4f6' }}>
      <div style={{ fontSize: '0.63rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: '0.15rem' }}>{label}</div>
      {children}
    </div>
  )
}

// ─── Section renderers ─────────────────────────────────────────────────────────

function PrintBankAccounts({ accounts, transactions }) {
  if (!accounts.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Bankkonten vorhanden.</p>

  return (
    <div>
      {accounts.map(a => {
        const balance = latestHistoryValue(a.balanceHistory, a.balance)
        const sortedHistory = [...(a.balanceHistory || [])].sort((x, y) => y.date.localeCompare(x.date))
        const acctTxs = [...transactions.filter(t => t.accountId === a.id)].sort((x, y) => y.date.localeCompare(x.date))
        return (
          <ItemCard
            key={a.id}
            title={a.name}
            badge={fmt(balance)}
            fields={[]}
          >
            {sortedHistory.length > 0 && (
              <HistoryBlock label={`Saldenhistorie (${sortedHistory.length} Einträge)`}>
                <SubTable
                  headers={['Datum', 'Saldo']}
                  rows={sortedHistory.map(e => [
                    isoToGerman(e.date),
                    <span style={{ color: e.value >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{fmt(e.value)}</span>,
                  ])}
                />
              </HistoryBlock>
            )}
            {acctTxs.length > 0 && (
              <HistoryBlock label={`Umsätze (${acctTxs.length})`}>
                <SubTable
                  headers={['Datum', 'Beschreibung', 'Empfänger', 'Betrag', 'Kategorie']}
                  rows={acctTxs.map(t => [
                    isoToGerman(t.date),
                    t.description || '–',
                    t.recipient || '–',
                    <span style={{ color: t.amount >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{fmt(t.amount)}</span>,
                    t.category || '–',
                  ])}
                />
              </HistoryBlock>
            )}
          </ItemCard>
        )
      })}
    </div>
  )
}

function PrintInsurances({ contracts, categories }) {
  if (!contracts.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Versicherungen vorhanden.</p>

  return (
    <div>
      {contracts.map(c => {
        const latestVal = latestHistoryValue(c.valueHistory, null)
        const annuity = isAnnuity(c)
        const sortedHistory = [...(c.valueHistory || [])].sort((a, b) => b.date.localeCompare(a.date))
        const catName = categories.find(cat => cat.id === c.categoryId)?.name || null
        const fields = [
          c.company        && ['Gesellschaft',  c.company],
          c.provider       && ['Versicherer',   c.provider],
          c.contractNumber && ['Vertragsnr.',   c.contractNumber],
          c.premium > 0    && ['Beitrag',       `${fmt(c.premium)}${c.premiumFrequency ? ' / ' + (FREQ_LABELS[c.premiumFrequency] || c.premiumFrequency) : ''}`],
          catName          && ['Kategorie',     catName],
          latestVal != null && ['Aktueller Wert', fmt(latestVal)],
        ].filter(Boolean)

        return (
          <ItemCard
            key={c.id}
            title={c.name}
            badge={c.active ? 'Aktiv' : 'Inaktiv'}
            fields={fields}
          >
            {c.persons?.length > 0 && (
              <div style={{ padding: '0.15rem 0.65rem 0.2rem', fontSize: '0.75rem' }}>
                <span style={{ fontSize: '0.63rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Personen: </span>
                {c.persons.map((p, i) => (
                  <span key={i} style={{ marginRight: '0.75rem', fontWeight: 600 }}>
                    {p.name}{p.role ? ` (${p.role})` : ''}
                  </span>
                ))}
              </div>
            )}
            {sortedHistory.length > 0 && (
              <HistoryBlock label={`Werthistorie (${sortedHistory.length} Einträge)`}>
                <SubTable
                  headers={annuity
                    ? ['Datum', 'Wert', 'Multiplikator', 'Garantierte Jahresrente']
                    : ['Datum', 'Wert']}
                  rows={sortedHistory.map(e => {
                    const base = [
                      isoToGerman(e.date),
                      <span style={{ fontWeight: 600 }}>{fmt(e.value)}</span>,
                    ]
                    if (annuity) {
                      const mult = e.multiplikator
                      const gar  = e.garantierteJaehrlicheRente
                      const rent = (mult && gar) ? fmt((e.value / mult) * gar) : '–'
                      base.push(mult != null ? fmtNum(mult) : '–')
                      base.push(rent)
                    }
                    return base
                  })}
                />
              </HistoryBlock>
            )}
          </ItemCard>
        )
      })}
    </div>
  )
}

function PrintSecurities({ securities, prices, depots, depotTransactions }) {
  const hasSecurities = securities.length > 0
  const hasDepots = depots.length > 0
  if (!hasSecurities && !hasDepots) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Wertpapiere oder Depots vorhanden.</p>

  return (
    <div>
      {hasSecurities && (
        <>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', margin: '0.5rem 0 0.35rem' }}>Wertpapiere</div>
          {securities.map(s => {
            const secPrices = [...(prices[s.id] || [])].sort((a, b) => b.date.localeCompare(a.date))
            const latest = secPrices[0]
            return (
              <ItemCard
                key={s.id}
                title={s.name}
                badge={s.type}
                fields={[
                  s.symbol   && ['Symbol',      s.symbol],
                  s.isin     && ['ISIN',         s.isin],
                  ['Währung',  s.currency || 'EUR'],
                  latest     && ['Letzter Kurs', `${fmtNum(latest.value)} ${s.currency || 'EUR'}`],
                  latest     && ['Stand',        isoToGerman(latest.date)],
                ].filter(Boolean)}
              >
                {secPrices.length > 0 && (
                  <HistoryBlock label={`Kurshistorie (${secPrices.length} Einträge)`}>
                    <SubTable
                      headers={['Datum', 'Kurs']}
                      rows={secPrices.map(e => [isoToGerman(e.date), `${fmtNum(e.value)} ${s.currency || 'EUR'}`])}
                    />
                  </HistoryBlock>
                )}
              </ItemCard>
            )
          })}
        </>
      )}

      {hasDepots && (
        <>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', margin: '0.75rem 0 0.35rem' }}>Depots</div>
          {depots.map(d => {
            const txs = [...depotTransactions.filter(t => t.depotId === d.id)].sort((a, b) => b.date.localeCompare(a.date))
            return (
              <ItemCard key={d.id} title={d.name} fields={[['Transaktionen', txs.length]]}>
                {txs.length > 0 && (
                  <HistoryBlock label="Transaktionen">
                    <SubTable
                      headers={['Datum', 'Wertpapier', 'Typ', 'Menge', 'Kurs', 'Gebühren']}
                      rows={txs.map(t => {
                        const sec = securities.find(s => s.id === t.securityId)
                        return [
                          isoToGerman(t.date),
                          sec?.name || '–',
                          TX_LABELS[t.type] || t.type,
                          fmtNum(t.quantity),
                          `${fmtNum(t.price)} ${sec?.currency || 'EUR'}`,
                          t.fees ? fmt(t.fees) : '–',
                        ]
                      })}
                    />
                  </HistoryBlock>
                )}
              </ItemCard>
            )
          })}
        </>
      )}
    </div>
  )
}

function PrintRealEstate({ properties }) {
  if (!properties.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Immobilien vorhanden.</p>

  return (
    <div>
      {properties.map(p => {
        const current   = latestHistoryValue(p.currentHistory, p.current)
        const pnl       = current - p.purchase
        const pnlPct    = p.purchase > 0 ? (pnl / p.purchase) * 100 : null
        const sortedHistory = [...(p.currentHistory || [])].sort((a, b) => b.date.localeCompare(a.date))
        return (
          <ItemCard
            key={p.id}
            title={p.name}
            fields={[
              ['Anschaffung', fmt(p.purchase)],
              ['Zeitwert',    fmt(current)],
              ['G / V',       <span style={{ color: pnl >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                                {(pnl >= 0 ? '+' : '') + fmt(pnl)}
                                {pnlPct != null && ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %)`}
                              </span>],
              p.notes && ['Notizen', p.notes],
            ].filter(Boolean)}
          >
            {sortedHistory.length > 0 && (
              <HistoryBlock label={`Zeitwert-Verlauf (${sortedHistory.length} Einträge)`}>
                <SubTable
                  headers={['Datum', 'Wert']}
                  rows={sortedHistory.map(e => [isoToGerman(e.date), fmt(e.value)])}
                />
              </HistoryBlock>
            )}
          </ItemCard>
        )
      })}
    </div>
  )
}

function PrintCompanyShares({ shares }) {
  if (!shares.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Firmenbeteiligungen vorhanden.</p>

  const total = shares.reduce((sum, s) => sum + latestHistoryValue(s.valueHistory, s.value), 0)
  return (
    <div>
      {shares.map(s => {
        const val = latestHistoryValue(s.valueHistory, s.value)
        const sortedHistory = [...(s.valueHistory || [])].sort((a, b) => b.date.localeCompare(a.date))
        return (
          <ItemCard
            key={s.id}
            title={s.company}
            badge={`${fmtNum(s.percentage)} %`}
            fields={[
              ['Wert',    fmt(val)],
              s.notes && ['Notizen', s.notes],
            ].filter(Boolean)}
          >
            {sortedHistory.length > 0 && (
              <HistoryBlock label={`Werthistorie (${sortedHistory.length} Einträge)`}>
                <SubTable
                  headers={['Datum', 'Wert']}
                  rows={sortedHistory.map(e => [isoToGerman(e.date), fmt(e.value)])}
                />
              </HistoryBlock>
            )}
          </ItemCard>
        )
      })}
      {shares.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.3rem 0.65rem', background: '#f0fdf4', borderRadius: 6, fontSize: '0.82rem', fontWeight: 700, marginTop: '0.2rem' }}>
          <span style={{ color: '#6b7280', marginRight: '1rem' }}>Gesamt</span>
          <span>{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

function PrintSubscriptions({ subscriptions, categories }) {
  if (!subscriptions.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Abonnements vorhanden.</p>

  const catName = id => categories.find(c => c.id == id)?.name || '–'
  return (
    <FlatTable
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
  if (!recurrings.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Daueraufträge vorhanden.</p>

  const catName = id => categories.find(c => c.id == id)?.name || '–'
  return (
    <FlatTable
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
  if (!categories.length) return <p style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Keine Kategorien vorhanden.</p>

  function renderTree(parentId = null, depth = 0) {
    return categories
      .filter(c => c.parent == parentId)
      .map(c => (
        <div key={c.id} style={{ marginLeft: depth * 14, padding: '0.15rem 0', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {depth > 0 && <span style={{ color: '#d1d5db', fontSize: '0.72rem' }}>{'└'}</span>}
          <span style={{ fontWeight: depth === 0 ? 700 : 400 }}>{c.name}</span>
          <span style={{
            fontSize: '0.65rem', borderRadius: 3, padding: '0.05rem 0.3rem', fontWeight: 600,
            background: c.type === 'Ausgabe' ? '#fee2e2' : '#dcfce7',
            color:      c.type === 'Ausgabe' ? '#dc2626' : '#16a34a',
          }}>{c.type}</span>
          {renderTree(c.id, depth + 1)}
        </div>
      ))
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
      {renderTree()}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PrintDialog({ onClose }) {
  const initialSelected = Object.fromEntries(PRINT_SECTIONS.map(s => [s.id, true]))
  const [selected, setSelected] = useState(initialSelected)

  // Read all data fresh from localStorage when dialog opens
  const accounts         = JSON.parse(localStorage.getItem('bankAccounts'))       || []
  const transactions     = JSON.parse(localStorage.getItem('transactions'))        || []
  const insurances       = JSON.parse(localStorage.getItem('insuranceContracts'))  || []
  const securities       = JSON.parse(localStorage.getItem('securities'))          || []
  const prices           = JSON.parse(localStorage.getItem('securityPrices'))      || {}
  const depots           = JSON.parse(localStorage.getItem('depots'))              || []
  const depotTransactions = JSON.parse(localStorage.getItem('depotTransactions'))  || []
  const realEstate       = JSON.parse(localStorage.getItem('realEstate'))          || []
  const companyShares    = JSON.parse(localStorage.getItem('companyShares'))       || []
  const subscriptions    = JSON.parse(localStorage.getItem('subscriptions'))       || []
  const recurrings       = JSON.parse(localStorage.getItem('recurringPayments'))   || []
  const categories       = JSON.parse(localStorage.getItem('categories'))          || []

  const anySelected  = Object.values(selected).some(Boolean)
  const printDate    = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

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
            >
              Alle auswählen
            </button>
            <button
              onClick={() => toggleAll(false)}
              style={{ background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 6, padding: '0.25rem 0.7rem', cursor: 'pointer', fontSize: '0.78rem' }}
            >
              Alle abwählen
            </button>
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
            >
              Drucken
            </button>
            <button
              onClick={onClose}
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.92rem', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>

      {/* ── Print view – hidden on screen, visible when printing ── */}
      <div className="print-view">
        <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1a202c' }}>

          {/* Page header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #1a6b3c', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1a6b3c' }}>Finanzverwaltung – Ausdruck</div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.1rem' }}>
                {PRINT_SECTIONS.filter(s => selected[s.id]).map(s => s.label).join(' · ')}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'right' }}>
              Erstellt: {printDate}
            </div>
          </div>

          {selected.bankAccounts && (
            <>
              <SectionTitle icon="🏦" label="Bankkonten" />
              <PrintBankAccounts accounts={accounts} transactions={transactions} />
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
              <PrintSecurities
                securities={securities}
                prices={prices}
                depots={depots}
                depotTransactions={depotTransactions}
              />
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
