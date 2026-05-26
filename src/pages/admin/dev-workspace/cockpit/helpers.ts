export function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function userInitial(u: { name?: string; email?: string } | null | undefined): string {
  if (!u) return '?'
  const name = u.name || u.email || ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function relativeFR(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return ''
  if (diff < 60_000) return `il y a ${Math.max(1, Math.floor(diff / 1000))}s`
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`
  return `il y a ${Math.floor(diff / 86_400_000)} j`
}
