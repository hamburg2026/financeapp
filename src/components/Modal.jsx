export default function Modal({ title, onClose, maxWidth = 560, children }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-surface)', borderRadius: 14,
        width: '100%', maxWidth,
        boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', marginBottom: '2rem',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '1.2rem', lineHeight: 1, color: 'var(--color-text-muted)',
            padding: '0.25rem 0.5rem', borderRadius: 5,
          }}>✕</button>
        </div>
        <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
