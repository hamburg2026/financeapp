import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function CategorySelect({
  categories,
  value,
  onChange,
  valueKey = 'id',
  placeholder = '– Kategorie wählen –',
  selectParents = false,
  style = {},
}) {
  const [open,     setOpen]     = useState(false)
  const [dropPos,  setDropPos]  = useState(null)
  const [expanded, setExpanded] = useState(new Set())
  const triggerRef = useRef()
  const dropRef    = useRef()

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (!triggerRef.current?.contains(e.target) && !dropRef.current?.contains(e.target))
        setOpen(false)
    }
    const onClose = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [open])

  useEffect(() => {
    if (!open || !triggerRef.current) { setDropPos(null); return }
    const r = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    setDropPos(spaceBelow < 340
      ? { top: 'auto', bottom: window.innerHeight - r.top + 3, left: r.left, minW: r.width }
      : { top: r.bottom + 3, bottom: 'auto',                   left: r.left, minW: r.width }
    )
  }, [open])

  const getVal = cat => valueKey === 'name' ? cat.name : String(cat.id)

  function getLabel() {
    if (!value && value !== 0) return ''
    const cat = valueKey === 'name'
      ? categories.find(c => c.name === value)
      : categories.find(c => String(c.id) === String(value))
    if (!cat) return String(value)
    const parent = cat.parent != null ? categories.find(c => c.id == cat.parent) : null
    return parent ? `${parent.name} › ${cat.name}` : cat.name
  }

  function emit(val) { onChange({ target: { value: val } }); setOpen(false) }

  function renderTree(parentId = null, depth = 0) {
    return categories
      .filter(c => (c.parent ?? null) == parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(cat => {
        const hasKids    = categories.some(c => (c.parent ?? null) == cat.id)
        const isExpanded = expanded.has(cat.id)
        const isSelected = (value !== '' && value != null) && String(value) === String(getVal(cat))
        const pl = 0.65 + depth * 1.1
        const toggleExpand = () => setExpanded(prev => {
          const n = new Set(prev); n.has(cat.id) ? n.delete(cat.id) : n.add(cat.id); return n
        })
        function handleClick() {
          if (hasKids && !selectParents) toggleExpand()
          else emit(getVal(cat))
        }
        return (
          <div key={cat.id}>
            <div onClick={handleClick}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg)' }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = '' }}
              style={{
                display: 'flex', alignItems: 'center',
                padding: `0.35rem 0.65rem 0.35rem ${pl}rem`,
                cursor: 'pointer',
                fontSize: depth === 0 ? '0.84rem' : '0.81rem',
                fontWeight: depth === 0 ? 600 : 400,
                background: isSelected ? 'var(--color-primary)' : undefined,
                color: isSelected ? '#fff' : undefined,
              }}>
              {hasKids
                ? selectParents
                  ? <button onClick={e => { e.stopPropagation(); toggleExpand() }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.3rem 0 0', fontSize: '0.72rem', color: isSelected ? '#fff' : 'var(--color-text-muted)', flexShrink: 0, lineHeight: 1 }}>
                      {isExpanded ? '▾' : '▸'}
                    </button>
                  : <span style={{ fontSize: '0.72rem', color: isSelected ? '#fff' : 'var(--color-text-muted)', flexShrink: 0, marginRight: '0.3rem', lineHeight: 1 }}>
                      {isExpanded ? '▾' : '▸'}
                    </span>
                : <span style={{ width: '1.1rem', flexShrink: 0 }} />
              }
              <span style={{ flex: 1 }}>{cat.name}</span>
            </div>
            {hasKids && isExpanded && renderTree(cat.id, depth + 1)}
          </div>
        )
      })
  }

  const label = getLabel()

  return (
    <div ref={triggerRef} style={{ position: 'relative', display: 'inline-block', verticalAlign: 'middle', ...style }}>
      <div onClick={() => setOpen(o => !o)} style={{
        border: '1px solid var(--color-border)', borderRadius: 4,
        background: 'var(--color-surface)', cursor: 'pointer', userSelect: 'none',
        width: '100%', boxSizing: 'border-box',
        padding: style.padding || '0.22rem 0.5rem',
        fontSize: style.fontSize || '0.83rem',
        ...(style.border          ? { border: style.border }                   : {}),
        ...(style.borderRadius != null ? { borderRadius: style.borderRadius }  : {}),
        display: 'flex', alignItems: 'center', gap: '0.25rem',
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: !label ? 'var(--color-text-muted)' : undefined }}>
          {label || placeholder}
        </span>
        <span style={{ fontSize: '0.55rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>▾</span>
      </div>

      {open && dropPos && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: dropPos.top, bottom: dropPos.bottom, left: dropPos.left,
          zIndex: 99999, background: 'var(--color-surface)',
          border: '1px solid var(--color-border)', borderRadius: 6,
          boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
          minWidth: Math.max(dropPos.minW, 240), maxWidth: 400,
          maxHeight: 'min(520px, 60vh)', overflowY: 'auto',
        }}>
          <div onClick={() => emit('')}
            onMouseEnter={e => { if (value || value === 0) e.currentTarget.style.background = 'var(--color-bg)' }}
            onMouseLeave={e => { if (value || value === 0) e.currentTarget.style.background = '' }}
            style={{
              padding: '0.35rem 0.65rem', fontSize: '0.84rem', cursor: 'pointer',
              color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)',
              background: (!value && value !== 0) ? 'var(--color-bg)' : undefined,
            }}>{placeholder}</div>
          {renderTree()}
        </div>,
        document.body
      )}
    </div>
  )
}
