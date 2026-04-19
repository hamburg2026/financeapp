export const THEMES = [
  { id: 'blue',   label: 'Dunkelblau', primary: '#1e3a5f', dark: '#152b47', light: '#60a5fa', bg: '#eff6ff' },
  { id: 'green',  label: 'Grün',       primary: '#1a6b3c', dark: '#145530', light: '#4ade80', bg: '#f0fdf4' },
  { id: 'teal',   label: 'Petrol',     primary: '#0f766e', dark: '#0c5c55', light: '#2dd4bf', bg: '#f0fdfa' },
  { id: 'purple', label: 'Lila',       primary: '#5b21b6', dark: '#4c1d95', light: '#a78bfa', bg: '#f5f3ff' },
  { id: 'slate',  label: 'Anthrazit',  primary: '#334155', dark: '#1e293b', light: '#94a3b8', bg: '#f8fafc' },
  { id: 'rose',   label: 'Bordeaux',   primary: '#9f1239', dark: '#881337', light: '#fb7185', bg: '#fff1f2' },
]

export function applyTheme(id) {
  const t = THEMES.find(t => t.id === id) || THEMES[0]
  const r = document.documentElement
  r.style.setProperty('--color-primary',       t.primary)
  r.style.setProperty('--color-primary-dark',  t.dark)
  r.style.setProperty('--color-primary-light', t.light)
  r.style.setProperty('--color-bg',            t.bg)
  localStorage.setItem('theme_color', id)
}

export function loadTheme() {
  const id = localStorage.getItem('theme_color') || 'blue'
  applyTheme(id)
  return id
}
