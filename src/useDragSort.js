import { useRef, useState } from 'react'

const HANDLE_STYLE = {
  cursor: 'grab',
  color: 'var(--color-border)',
  fontSize: '1rem',
  lineHeight: 1,
  padding: '0 0.25rem',
  userSelect: 'none',
  flexShrink: 0,
}

export const DragHandle = () => (
  <span draggable={false} style={HANDLE_STYLE} title="Ziehen zum Sortieren">⠿</span>
)

export function useDragSort(items, setItems) {
  const dragIdx = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  function dragProps(idx) {
    return {
      draggable: true,
      onDragStart: (e) => { e.stopPropagation(); dragIdx.current = idx },
      onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(idx) },
      onDrop: (e) => {
        e.preventDefault(); e.stopPropagation()
        const from = dragIdx.current
        if (from !== null && from !== idx) {
          const arr = [...items]
          const [el] = arr.splice(from, 1)
          arr.splice(idx, 0, el)
          setItems(arr)
        }
        dragIdx.current = null; setDragOver(null)
      },
      onDragEnd: () => { dragIdx.current = null; setDragOver(null) },
    }
  }

  return { dragProps, isDragOver: idx => dragOver === idx }
}

export function reorderSubset(fullArr, displayItems, from, to) {
  const newDisplay = [...displayItems]
  const [el] = newDisplay.splice(from, 1)
  newDisplay.splice(to, 0, el)
  const arr = [...fullArr]
  const positions = displayItems
    .map(d => arr.findIndex(x => x.id === d.id))
    .sort((a, b) => a - b)
  positions.forEach((pos, i) => { arr[pos] = newDisplay[i] })
  return arr
}
