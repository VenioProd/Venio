import type { EducationClass, EducationNote } from '@/services/education'
import type { BacklinkEntry } from '../NoteEditor'

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error'

export function Kpi({
  label,
  value,
  sub,
}: {
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div className="edu-kpi">
      <div className="edu-kpi-label">{label}</div>
      <div className="edu-kpi-value">{value}</div>
      {sub && <div className="edu-kpi-sub">{sub}</div>}
    </div>
  )
}

export function NoteSaveIndicator({ state }: { state: NoteSaveState }) {
  if (state === 'idle') return null
  const label = state === 'saving' ? 'Sauvegarde…' : state === 'saved' ? 'Sauvegardé' : 'Erreur'
  const color =
    state === 'error' ? '#EF4444' : state === 'saved' ? '#22C55E' : 'rgba(255,255,255,0.6)'
  return (
    <span
      className="edu-pill"
      style={{ background: 'rgba(255,255,255,0.06)', color, fontSize: 11.5 }}
      aria-live="polite"
    >
      {label}
    </span>
  )
}

export function makeBlockId() {
  return Math.random().toString(36).slice(2, 10)
}

/** Compose un tableau de backlinks à partir des links de la note + contexte. */
export function buildBacklinks(
  note: EducationNote,
  classes: EducationClass[],
  onOpenClass?: (id: string) => void,
): BacklinkEntry[] {
  const map = new Map<string, EducationClass>()
  classes.forEach(c => map.set(c._id, c))
  return note.links.map(l => {
    if (l.type === 'class') {
      const c = map.get(l.refId)
      return {
        type: l.type,
        refId: l.refId,
        label: c?.name ?? `Classe ${l.refId.slice(-6)}`,
        meta: c ? [c.school, c.level].filter(Boolean).join(' · ') : undefined,
        onOpen: onOpenClass ? () => onOpenClass(l.refId) : undefined,
      }
    }
    return {
      type: l.type,
      refId: l.refId,
      label: `${
        l.type === 'session' ? 'Séance' : l.type === 'assignment' ? 'Devoir' : 'Étudiant'
      } ${l.refId.slice(-6)}`,
    }
  })
}
