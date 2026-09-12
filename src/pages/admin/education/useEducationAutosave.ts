import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { updateClass, updateNote, updateSession } from '../../../services/education'

import { updateCalendarEventWorkspace } from '../../../services/educationCalendar'

type Kind = 'class' | 'note' | 'session' | 'calendar-event'
type Patch = Record<string, unknown>
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Entry = {
  key: string
  id: string
  kind: Kind
  pending: Patch
  sending: Patch | null
  task: Promise<boolean> | null
  timer: ReturnType<typeof setTimeout> | null
  error: string | null
  saved: boolean
}

// Sharing by owner + entity serializes writes from the drawer and live mode too.
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0
const snapshot = () => version
function notify() {
  version++
  listeners.forEach((fn) => fn())
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const hasFields = (patch: Patch) => Object.keys(patch).length > 0

function remember(entry: Entry) {
  const patch = { ...entry.sending, ...entry.pending }
  try {
    if (hasFields(patch)) localStorage.setItem(entry.key, JSON.stringify(patch))
    else localStorage.removeItem(entry.key)
  } catch {
    // In-memory pending changes remain available if browser storage is full.
  }
}

function getEntry(owner: string, kind: Kind, id: string): Entry {
  const key = `venio:education-draft:${owner}:${kind}:${id}`
  const known = entries.get(key)
  if (known) return known
  let pending: Patch = {}
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || '{}')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) pending = stored as Patch
  } catch {
    /* no usable draft */
  }
  const entry: Entry = {
    key,
    id,
    kind,
    pending,
    sending: null,
    task: null,
    timer: null,
    saved: false,
    error: hasFields(pending) ? 'Brouillon local récupéré. Enregistrez-le pour reprendre.' : null,
  }
  entries.set(key, entry)
  return entry
}

async function flushEntry(entry: Entry): Promise<boolean> {
  if (entry.timer) clearTimeout(entry.timer)
  entry.timer = null
  if (entry.task) return entry.task
  if (!hasFields(entry.pending)) return true
  entry.error = null
  entry.task = (async () => {
    while (hasFields(entry.pending)) {
      const patch = entry.pending
      entry.pending = {}
      entry.sending = patch
      notify()
      try {
        if (entry.kind === 'class') await updateClass(entry.id, patch)
        else if (entry.kind === 'note') await updateNote(entry.id, patch)
        else if (entry.kind === 'calendar-event')
          await updateCalendarEventWorkspace({ ...patch, occurrenceId: entry.id })
        else await updateSession(entry.id, patch)
        entry.sending = null
        entry.saved = true
        remember(entry)
      } catch (err) {
        entry.pending = { ...patch, ...entry.pending }
        entry.sending = null
        entry.error = err instanceof Error ? err.message : 'Échec de sauvegarde'
        remember(entry)
        return false
      }
    }
    return true
  })().finally(() => {
    entry.task = null
    notify()
  })
  return entry.task
}

export function useEducationAutosave() {
  const { user } = useAuth()
  const owner = user?._id ?? 'signed-out'
  const watched = useMemo(() => new Set<Entry>(), [owner])
  useSyncExternalStore(subscribe, snapshot, snapshot)

  const entryFor = useCallback(
    (kind: Kind, id: string) => {
      const entry = getEntry(owner, kind, id)
      watched.add(entry)
      return entry
    },
    [owner, watched],
  )

  const stage = useCallback(
    (kind: Kind, id: string, patch: Patch) => {
      const entry = entryFor(kind, id)
      entry.pending = { ...entry.pending, ...patch }
      entry.error = null
      if (entry.timer) clearTimeout(entry.timer)
      remember(entry)
      entry.timer = setTimeout(() => {
        void flushEntry(entry)
      }, 600)
      notify()
    },
    [entryFor],
  )

  const restore = useCallback(
    <T extends object>(kind: Kind, id: string, value: T): T => {
      const entry = entryFor(kind, id)
      return { ...value, ...entry.sending, ...entry.pending } as T
    },
    [entryFor],
  )

  const flush = useCallback(async () => {
    const results = await Promise.all([...watched].map(flushEntry))
    return results.every(Boolean)
  }, [watched])

  const discard = useCallback(
    (kind: Kind, id: string) => {
      const entry = entryFor(kind, id)
      if (entry.timer) clearTimeout(entry.timer)
      entry.timer = null
      entry.pending = {}
      entry.error = null
      remember(entry)
      notify()
    },
    [entryFor],
  )

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (![...watched].some((e) => hasFields(e.pending) || e.sending)) return
      watched.forEach(remember)
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      // Internal navigation must not cancel the final debounce. A failed write
      // stays in the owner-scoped draft and is restored when the page is opened.
      void flush()
    }
  }, [flush, watched])

  const error = [...watched].find((e) => e.error)?.error ?? null
  const pending = [...watched].some((e) => hasFields(e.pending) || e.sending)
  const status: SaveState = error ? 'error' : pending ? 'saving' : [...watched].some((e) => e.saved) ? 'saved' : 'idle'
  return { stage, restore, flush, discard, status, error }
}
