import { useState, useRef } from 'react'
import { fmt } from '../fmt'
import { buildCategoryOptions } from '../categoryOptions'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// ── LocalStorage helper ────────────────────────────────────────────────
function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => JSON.parse(localStorage.getItem(key)) || initial)
  const set = (v) => { localStorage.setItem(key, JSON.stringify(v)); setValue(v) }
  return [value, set]
}

// ── Utilities ──────────────────────────────────────────────────────────
const btnSm = {
  border: 'none', borderRadius: 5, cursor: 'pointer',
  fontSize: '0.78rem', padding: '0.28rem 0.6rem', lineHeight: 1.4,
}

function parseGermanDate(str) {
  const m = str.match(/(\d{2})\.(\d{2})\.(\d{2,4})/)
  if (!m) return null
  let [, d, mo, y] = m
  if (y.length === 2) y = parseInt(y) >= 50 ? '19' + y : '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function parseGermanAmount(str) {
  if (!str) return null
  let s = str.replace(/\s/g, '')
  const trailing = s.endsWith('-')
  if (trailing) s = '-' + s.slice(0, -1)
  // Remove thousand separators (dots before commas): "1.234,56" → "1234.56"
  s = s.replace(/\.(?=\d{3}[,\d])/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

// Extract all lines from a PDF file using PDF.js
async function extractPdfLines(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const allLines = []
  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page = await pdf.getPage(pg)
    const byY = new Map()
    // Use streamTextContent + reader.read() instead of getTextContent() to avoid
    // a pdfjs-dist v5 bug where chunks from tagged/graphic-heavy PDFs have
    // items:undefined, causing push(...undefined) to throw inside getTextContent.
    const stream = page.streamTextContent({ includeMarkedContent: false })
    const reader = stream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const item of (value?.items ?? [])) {
          if (!item.str?.trim() || !item.transform) continue
          const y = Math.round(item.transform[5])
          if (!byY.has(y)) byY.set(y, [])
          byY.get(y).push({ x: item.transform[4], text: item.str })
        }
      }
    } catch {
      // page has no readable text (e.g. image-only or complex structured page)
    } finally {
      try { reader.releaseLock() } catch { /* ignore */ }
    }
    // Sort lines top-to-bottom, items left-to-right
    const sortedYs = [...byY.keys()].sort((a, b) => b - a)
    for (const y of sortedYs) {
      const line = byY.get(y).sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim()
      if (line) allLines.push(line)
    }
  }
  return allLines
}

const DATE_ANYWHERE = /\b(\d{2}\.\d{2}\.(?:20|19)?\d{2})\b/g
const AMOUNT_RE = /(-?\s*\d{1,3}(?:\.\d{3})*,\d{2}\s*[-+]?)/g

// Parse transactions from raw text lines
function parseTransactions(lines) {
  const results = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const dateMatches = [...line.matchAll(DATE_ANYWHERE)]
    if (dateMatches.length === 0) { i++; continue }

    const date = parseGermanDate(dateMatches[0][1])
    if (!date) { i++; continue }

    // Collect this line + up to 6 continuation lines as a "block"
    const blockLines = [line]
    let j = i + 1
    while (j < lines.length && j < i + 7) {
      const next = lines[j]
      // Stop at a new date-starting line
      if (/^\s*\d{2}\.\d{2}\.\d{2,4}/.test(next)) break
      blockLines.push(next)
      j++
    }
    const blockText = blockLines.join(' ')

    // Find all amounts in block
    const amountMatches = [...blockText.matchAll(AMOUNT_RE)]
    if (amountMatches.length === 0) { i++; continue }

    // Use first amount as transaction amount (second often is running balance)
    const amount = parseGermanAmount(amountMatches[0][1])
    if (amount === null || amount === 0) { i++; continue }

    // Build description: strip all dates and amounts from block
    let desc = blockText
    desc = desc.replace(DATE_ANYWHERE, '')
    desc = desc.replace(AMOUNT_RE, '')
    desc = desc.replace(/\s+/g, ' ').trim().slice(0, 250)

    results.push({ date, amount, description: desc || '–', recipient: suggestRecipient(blockText) })
    i++ // advance only by 1 (lines share text; block reading handles continuation)
  }
  return results
}

// ── Recipient extraction heuristic ────────────────────────────────────
function suggestRecipient(blockText) {
  // Labeled field: "Auftraggeber: Name" / "Zahlungsempfänger: Name" etc.
  const labeled = blockText.match(
    /(?:Auftraggeber|Zahlungsempfänger|Begünstigter|Empfänger)\s*[:/]\s*([^\n]+?)(?:\s{2,}|\s+(?:IBAN|BIC|Kto\.|Verwendungszweck|Mandats|Ref\.))/i
  )
  if (labeled) return labeled[1].trim().slice(0, 60)

  // Credit card style: "VISA MERCHANTNAME CITY"
  const visa = blockText.match(/\bVISA\s+([A-Z][A-Z0-9\s&\-.]{2,40}?)(?:\s+[A-Z]{2}\b|\s{3,}|$)/i)
  if (visa) return visa[1].trim().slice(0, 60)

  // Fallback: first Title-Case / ALLCAPS token sequence (likely a business name)
  const caps = blockText.match(/\b([A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\-&.]{2,}(?:\s+[A-ZÄÖÜ][A-ZÄÖÜa-zäöüß\-&.]{1,}){0,3})\b/)
  if (caps && caps[1].length >= 4) return caps[1].trim().slice(0, 60)

  return ''
}

// ── Auto-categorization ────────────────────────────────────────────────
function normalizeText(text) {
  return (text || '').toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-zäöüß\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function buildCategoryLookup(existingTransactions) {
  const lookup = {} // normalizedKey → { cat: score }
  for (const tx of existingTransactions) {
    if (!tx.category) continue
    const key = normalizeText(tx.description + ' ' + (tx.recipient || ''))
    if (!lookup[key]) lookup[key] = {}
    lookup[key][tx.category] = (lookup[key][tx.category] || 0) + 1
  }
  return lookup
}

function suggestCategory(description, recipient, lookup) {
  const query = normalizeText(description + ' ' + (recipient || ''))
  const qWords = new Set(query.split(/\s+/).filter(w => w.length >= 3))
  if (qWords.size === 0) return ''
  const scores = {}
  for (const [key, cats] of Object.entries(lookup)) {
    const kWords = new Set(key.split(/\s+/).filter(w => w.length >= 3))
    const common = [...qWords].filter(w => kWords.has(w)).length
    if (common === 0) continue
    const sim = common / Math.max(qWords.size, kWords.size)
    for (const [cat, cnt] of Object.entries(cats)) {
      scores[cat] = (scores[cat] || 0) + sim * cnt
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : ''
}

// ── Duplicate detection ────────────────────────────────────────────────
function isDuplicate(newTx, existing) {
  return existing.some(t =>
    t.date === newTx.date &&
    Math.abs(t.amount - newTx.amount) < 0.005
  )
}

// ── Main component ─────────────────────────────────────────────────────
export default function PdfImport({ onNavigate }) {
  const [accounts, setAccounts] = useLocalStorage('bankAccounts', [])
  const [transactions, setTransactions] = useLocalStorage('transactions', [])
  const categories = JSON.parse(localStorage.getItem('categories')) || []

  const [step, setStep] = useState('select') // select | preview | done
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    const accs = JSON.parse(localStorage.getItem('bankAccounts')) || []
    return accs[0]?.id ? String(accs[0].id) : ''
  })
  const [files, setFiles] = useState([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [previewItems, setPreviewItems] = useState([])
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef()
  const folderInputRef = useRef()

  // ── Step 1: parse all selected PDFs ───────────────────────────────
  async function handleParse() {
    if (!selectedAccountId) { setParseError('Bitte zuerst ein Konto auswählen.'); return }
    if (files.length === 0) { setParseError('Bitte mindestens eine PDF-Datei auswählen.'); return }
    setParseError('')
    setParsing(true)
    try {
      const lookup = buildCategoryLookup(transactions)
      const existing = transactions.filter(t => t.accountId === parseInt(selectedAccountId))
      const allParsed = []
      for (const file of files) {
        const lines = await extractPdfLines(file)
        const txs = parseTransactions(lines)
        for (const tx of txs) {
          const dup = isDuplicate(tx, [...existing, ...allParsed.filter(p => !p._skip)])
          const sugCat = suggestCategory(tx.description, tx.recipient, lookup)
          allParsed.push({
            ...tx,
            id: Date.now() + Math.random(),
            category: sugCat,
            isDuplicate: dup,
            include: !dup,
            sourceFile: file.name,
          })
        }
      }
      allParsed.sort((a, b) => a.date.localeCompare(b.date))
      setPreviewItems(allParsed)
      setStep('preview')
    } catch (err) {
      setParseError('Fehler beim Lesen der PDF: ' + err.message)
    } finally {
      setParsing(false)
    }
  }

  // ── Step 2: import confirmed transactions ─────────────────────────
  function handleImport() {
    const toImport = previewItems.filter(p => p.include && !p._skip)
    if (toImport.length === 0) return

    const accountId = parseInt(selectedAccountId)
    const newTxs = toImport.map(p => ({
      id: Date.now() + Math.floor(Math.random() * 1e6),
      accountId,
      date: p.date,
      description: p.description,
      recipient: p.recipient,
      amount: p.amount,
      category: p.category,
    }))

    const totalDelta = newTxs.reduce((s, t) => s + t.amount, 0)
    setTransactions([...transactions, ...newTxs])
    setAccounts(accounts.map(a =>
      a.id === accountId ? { ...a, balance: (a.balance || 0) + totalDelta } : a
    ))

    const duplicatesSkipped = previewItems.filter(p => p.isDuplicate).length
    const manuallySkipped = previewItems.filter(p => !p.include && !p.isDuplicate).length
    setImportResult({
      imported: newTxs.length,
      duplicatesSkipped,
      manuallySkipped,
    })
    setStep('done')
  }

  function reset() {
    setStep('select')
    setFiles([])
    setPreviewItems([])
    setImportResult(null)
    setParseError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  function updateItem(idx, patch) {
    setPreviewItems(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }

  const catType = name => categories.find(c => c.name === name)?.type || null

  // ── Render: step = select ──────────────────────────────────────────
  if (step === 'select') return (
    <div className="module">
      <h2>PDF-Umsatzimport</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        Kontoauszüge und Kreditkartenabrechnungen als PDF importieren. Alle PDF-Dateien
        eines Ordners können auf einmal ausgewählt werden.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
        {/* Account selection */}
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
            Zielkonto *
          </label>
          <select
            value={selectedAccountId}
            onChange={e => setSelectedAccountId(e.target.value)}
            style={{ width: '100%', fontSize: '0.9rem', padding: '0.45rem 0.6rem' }}
          >
            <option value="">– Konto wählen –</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {accounts.length === 0 && (
            <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.3rem' }}>
              Noch keine Konten vorhanden – bitte zuerst unter "Bankkonten" anlegen.
            </p>
          )}
        </div>

        {/* File selection */}
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.3rem' }}>
            PDF-Dateien
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 0.9rem', borderRadius: 6, cursor: 'pointer',
              background: 'var(--color-primary)', color: '#fff', fontSize: '0.85rem', fontWeight: 600,
            }}>
              Dateien wählen
              <input ref={fileInputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
                onChange={e => {
                  const newFiles = [...e.target.files]
                  setFiles(prev => {
                    const names = new Set(prev.map(f => f.name))
                    return [...prev, ...newFiles.filter(f => !names.has(f.name))]
                  })
                }}
              />
            </label>
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 0.9rem', borderRadius: 6, cursor: 'pointer',
              background: '#6b7280', color: '#fff', fontSize: '0.85rem', fontWeight: 600,
            }}>
              Ordner wählen
              <input ref={folderInputRef} type="file" accept=".pdf" multiple
                // @ts-ignore
                webkitdirectory="" directory=""
                style={{ display: 'none' }}
                onChange={e => {
                  const newFiles = [...e.target.files].filter(f => f.name.toLowerCase().endsWith('.pdf'))
                  setFiles(prev => {
                    const names = new Set(prev.map(f => f.name))
                    return [...prev, ...newFiles.filter(f => !names.has(f.name))]
                  })
                }}
              />
            </label>
          </div>
          {files.length > 0 && (
            <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                  <span style={{ color: '#dc2626' }}>📄</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', flexShrink: 0 }}>
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ ...btnSm, background: 'none', color: '#dc2626', padding: '0.1rem 0.3rem' }}>✕</button>
                </div>
              ))}
              <button onClick={() => { setFiles([]); if (fileInputRef.current) fileInputRef.current.value = ''; if (folderInputRef.current) folderInputRef.current.value = '' }}
                style={{ ...btnSm, background: '#fee2e2', color: '#dc2626', marginTop: '0.3rem', alignSelf: 'flex-start' }}>
                Alle entfernen
              </button>
            </div>
          )}
        </div>

        {parseError && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '0.6rem 0.8rem', borderRadius: 6, fontSize: '0.83rem' }}>
            {parseError}
          </div>
        )}

        <button
          onClick={handleParse}
          disabled={parsing || files.length === 0 || !selectedAccountId}
          style={{
            padding: '0.65rem 1.4rem', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '0.95rem',
            opacity: (parsing || files.length === 0 || !selectedAccountId) ? 0.5 : 1,
            alignSelf: 'flex-start',
          }}
        >
          {parsing ? '⏳ PDFs werden gelesen…' : `📂 ${files.length} PDF${files.length !== 1 ? 's' : ''} analysieren`}
        </button>
      </div>
    </div>
  )

  // ── Render: step = preview ─────────────────────────────────────────
  if (step === 'preview') {
    const toImport = previewItems.filter(p => p.include)
    const dupCount = previewItems.filter(p => p.isDuplicate).length
    const cell = { padding: '0.3rem 0.4rem', fontSize: '0.78rem', verticalAlign: 'middle' }

    return (
      <div className="module">
        <h2>Umsätze prüfen &amp; importieren</h2>

        {/* Summary bar */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {[
            ['Gefunden', previewItems.length, '#3b82f6'],
            ['Importieren', toImport.length, '#16a34a'],
            ['Duplikate', dupCount, '#f59e0b'],
          ].map(([label, val, color]) => (
            <div key={label} style={{ padding: '0.4rem 0.85rem', borderRadius: 8, background: color + '18', border: `1px solid ${color}40`, fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ color }}>{val}</span>
              <span style={{ color: 'var(--color-text-muted)', marginLeft: 5 }}>{label}</span>
            </div>
          ))}
        </div>

        {previewItems.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-bg)', borderRadius: 8 }}>
            Keine Umsätze erkannt. Bitte prüfen Sie das PDF-Format.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg)', borderBottom: '2px solid var(--color-border)' }}>
                  <th style={{ ...cell, width: 28 }}>
                    <input type="checkbox"
                      checked={previewItems.every(p => p.include)}
                      onChange={e => setPreviewItems(prev => prev.map(p => ({ ...p, include: p.isDuplicate ? false : e.target.checked })))}
                    />
                  </th>
                  {['Datum', 'Beschreibung', 'Empfänger', 'Betrag', 'Kategorie', 'Status'].map(h => (
                    <th key={h} style={{ ...cell, fontWeight: 700, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewItems.map((item, idx) => {
                  const ct = catType(item.category)
                  const rowBg = item.isDuplicate ? '#fef3c7' : item.include ? '' : '#f9fafb'
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)', background: rowBg, opacity: item.include ? 1 : 0.6 }}>
                      <td style={cell}>
                        <input type="checkbox" checked={item.include}
                          onChange={e => updateItem(idx, { include: e.target.checked })} />
                      </td>
                      <td style={cell}>
                        <input type="date" value={item.date}
                          onChange={e => updateItem(idx, { date: e.target.value })}
                          style={{ fontSize: '0.75rem', padding: '0.15rem 0.3rem', width: 120 }} />
                      </td>
                      <td style={{ ...cell, maxWidth: 200 }}>
                        <input value={item.description}
                          onChange={e => updateItem(idx, { description: e.target.value })}
                          style={{ fontSize: '0.75rem', padding: '0.15rem 0.3rem', width: '100%', minWidth: 120 }} />
                      </td>
                      <td style={cell}>
                        <input value={item.recipient}
                          onChange={e => updateItem(idx, { recipient: e.target.value })}
                          placeholder="–"
                          style={{ fontSize: '0.75rem', padding: '0.15rem 0.3rem', width: 90 }} />
                      </td>
                      <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" value={Math.abs(item.amount).toFixed(2)}
                            onChange={e => {
                              const abs = parseFloat(e.target.value) || 0
                              updateItem(idx, { amount: item.amount < 0 ? -abs : abs })
                            }}
                            step="0.01" min="0"
                            style={{ fontSize: '0.75rem', padding: '0.15rem 0.3rem', width: 80 }} />
                          <button
                            title="Vorzeichen wechseln"
                            onClick={() => updateItem(idx, { amount: -item.amount })}
                            style={{ ...btnSm, background: item.amount < 0 ? '#fee2e2' : '#dcfce7', color: item.amount < 0 ? '#dc2626' : '#16a34a', padding: '0.1rem 0.4rem', fontWeight: 700 }}>
                            {item.amount < 0 ? '−' : '+'}
                          </button>
                        </div>
                      </td>
                      <td style={cell}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <select value={item.category}
                            onChange={e => updateItem(idx, { category: e.target.value })}
                            style={{ fontSize: '0.75rem', padding: '0.15rem 0.3rem', maxWidth: 140 }}>
                            <option value="">– keine –</option>
                            {buildCategoryOptions(categories, 'name')}
                          </select>
                          {ct && (
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: 4, fontWeight: 600, background: ct === 'Ausgabe' ? '#fee2e2' : '#dcfce7', color: ct === 'Ausgabe' ? '#dc2626' : '#16a34a' }}>
                              {ct === 'Ausgabe' ? 'Ausg.' : 'Einnh.'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={cell}>
                        {item.isDuplicate
                          ? <span style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '0.1rem 0.35rem', fontWeight: 600 }}>Duplikat</span>
                          : item.include
                            ? <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '0.1rem 0.35rem', fontWeight: 600 }}>Importieren</span>
                            : <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '0.1rem 0.35rem' }}>Überspringen</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button onClick={handleImport} disabled={toImport.length === 0}
            style={{ padding: '0.6rem 1.3rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', opacity: toImport.length === 0 ? 0.5 : 1 }}>
            {toImport.length} Umsatz{toImport.length !== 1 ? 'ätze' : ''} importieren
          </button>
          <button onClick={reset}
            style={{ padding: '0.6rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
            Zurück
          </button>
        </div>
      </div>
    )
  }

  // ── Render: step = done ────────────────────────────────────────────
  if (step === 'done' && importResult) {
    return (
      <div className="module">
        <h2>Import abgeschlossen</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: 360, marginBottom: '1.5rem' }}>
          {[
            ['Importiert', importResult.imported, '#16a34a', '✓'],
            ['Duplikate übersprungen', importResult.duplicatesSkipped, '#f59e0b', '⚠'],
            ['Manuell übersprungen', importResult.manuallySkipped, '#6b7280', '–'],
          ].map(([label, val, color, icon]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderRadius: 8, background: color + '12', border: `1px solid ${color}30` }}>
              <span style={{ fontSize: '0.85rem' }}>{icon} {label}</span>
              <span style={{ fontWeight: 700, fontSize: '1rem', color }}>{val}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button onClick={reset}
            style={{ padding: '0.6rem 1.2rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--color-primary)', color: '#fff', fontWeight: 600 }}>
            Weitere PDFs importieren
          </button>
          <button onClick={() => onNavigate?.('bankAccounts')}
            style={{ padding: '0.6rem 1.2rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Zu den Umsätzen
          </button>
          <button onClick={() => onNavigate?.('transactionAnalytics')}
            style={{ padding: '0.6rem 1.2rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Zur Auswertung
          </button>
        </div>
      </div>
    )
  }

  return null
}
