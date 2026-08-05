export function lsGet(key, fallback) {
  try {
    const s = localStorage.getItem(key)
    if (s == null || s === 'undefined') return fallback
    return JSON.parse(s) ?? fallback
  } catch {
    return fallback
  }
}
