import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { InboxItem, InboxActionKind, InboxResponse } from './types'
import InboxCard from './InboxCard'
import InboxFilters, { InboxFilter } from './InboxFilters'
import SnoozePopover from './SnoozePopover'

const InboxStream = () => {
  const [data, setData] = useState<InboxResponse | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [loading, setLoading] = useState(true)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    try {
      const includeSnoozed = filter === 'snoozed'
      const res = await apiFetch<InboxResponse>(`/api/admin/inbox?includeSnoozed=${includeSnoozed}`)
      setData(res)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  const filteredItems = useMemo(() => {
    if (!data) return []
    if (filter === 'all' || filter === 'snoozed') return data.items
    return data.items.filter((it) => it.type === filter)
  }, [data, filter])

  // initial focus = premier item
  useEffect(() => {
    if (filteredItems.length > 0 && !focusedId) setFocusedId(filteredItems[0].id)
  }, [filteredItems, focusedId])

  const focusedIndex = filteredItems.findIndex((it) => it.id === focusedId)
  const focusedItem = filteredItems[focusedIndex]

  const handleAction = async (kind: InboxActionKind, item: InboxItem) => {
    try {
      switch (kind) {
        case 'approve':
          await apiFetch(`/api/admin/decisions/${item.sourceId}/approve`, { method: 'POST', body: JSON.stringify({ comment: '' }) })
          break
        case 'reject': {
          const c = window.prompt('Motif du rejet :') ?? ''
          await apiFetch(`/api/admin/decisions/${item.sourceId}/reject`, { method: 'POST', body: JSON.stringify({ comment: c }) })
          break
        }
        case 'open':
        case 'read':
        case 'email':
          if (item.link) navigate(item.link)
          break
        case 'mark_done':
          await apiFetch(`/api/admin/tasks/${item.sourceId}/done`, { method: 'POST' })
          break
        case 'snooze':
          setSnoozingId(item.id)
          return
        case 'unpin':
          await apiFetch(`/api/admin/inbox/pin/${item.sourceId}`, { method: 'DELETE' })
          break
      }
      await fetchInbox()
    } catch (e) {
      window.alert((e as Error).message || 'Erreur')
    }
  }

  const handleSnooze = async (until: Date) => {
    if (!snoozingId) return
    const item = filteredItems.find((i) => i.id === snoozingId)
    if (!item) return
    await apiFetch('/api/admin/inbox/snooze', {
      method: 'POST',
      body: JSON.stringify({ itemType: item.type, sourceId: item.sourceId, snoozedUntil: until.toISOString() }),
    })
    setSnoozingId(null)
    await fetchInbox()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(filteredItems.length - 1, focusedIndex + 1)
        if (filteredItems[next]) setFocusedId(filteredItems[next].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = Math.max(0, focusedIndex - 1)
        if (filteredItems[prev]) setFocusedId(filteredItems[prev].id)
      } else if (focusedItem) {
        const matchedAction = focusedItem.actions.find((a) => a.shortcut === e.key.toLowerCase())
        if (matchedAction) { e.preventDefault(); handleAction(matchedAction.kind, focusedItem) }
        else if (e.key === 'Enter') {
          const openAction = focusedItem.actions.find((a) => a.kind === 'open' || a.kind === 'read')
          if (openAction) { e.preventDefault(); handleAction(openAction.kind, focusedItem) }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredItems, focusedIndex, focusedItem])

  if (loading && !data) return <p style={{ padding: 20, color: 'var(--text-muted)' }}>Chargement…</p>

  return (
    <div className="ix-stream">
      <header className="ix-stream__header">
        <span className="ix-stream__title">⚡ INBOX — {data?.counts.all ?? 0} à traiter</span>
        <span className="ix-stream__shortcut">↑↓ · A/R · S snooze · ⏎ ouvrir · F fait</span>
      </header>
      <InboxFilters value={filter} counts={data?.counts ?? {}} snoozedCount={data?.snoozedCount ?? 0} onChange={setFilter} />
      {filteredItems.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          🎉 Inbox vide
        </p>
      ) : (
        filteredItems.map((it) => (
          <InboxCard key={it.id} item={it} focused={it.id === focusedId} onAction={handleAction} />
        ))
      )}
      {snoozingId && <SnoozePopover onSnooze={handleSnooze} onClose={() => setSnoozingId(null)} />}
    </div>
  )
}

export default InboxStream
