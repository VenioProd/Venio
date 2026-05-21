import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, Apple, MapPin, Clock, ExternalLink, Building2, BookOpen,
} from 'lucide-react'
import {
  fetchCalendarEventWorkspace,
  updateCalendarEventWorkspace,
  type AppleCalendarEvent,
  type CalendarClassMatch,
  type CalendarEventWorkspace,
} from '../../../services/educationCalendar'
import {
  formatDate,
  type EducationClass,
  type SessionDuty,
  type SessionLink,
  type SessionReminder,
  type SessionRemark,
} from '../../../services/education'
import {
  DutiesSection,
  LinksSection,
  NotesSection,
  RemarksSection,
  RemindersSection,
  SaveIndicator,
  type SaveState,
} from './WorkspaceSections'

/**
 * VENIO-44 — Fiche d'événement Apple Calendar exploitable.
 *
 * L'événement Apple lui-même reste read-only (flux ICS). Ce drawer affiche
 * les métadonnées de l'événement en lecture seule (titre, horaires, lieu,
 * description, lien) PUIS sous le bloc info, une fiche persistante Venio
 * permettant de capturer notes, devoirs à donner, rappels, remarques et
 * liens. La fiche est indexée par occurrenceId — donc rouvrir le même
 * créneau (cockpit ou calendrier) reprend toujours les mêmes données.
 *
 * Le rattachement à une EducationClass est optionnel : si le matching
 * automatique l'a trouvé, on l'utilise par défaut, sinon le user peut le
 * choisir manuellement dans une dropdown.
 *
 * Autosave en debounce 800ms (identique à SessionDetailDrawer pour VENIO-43).
 */

const DAY_NAMES_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function durationLabel(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function formatRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return 'Journée entière'
  return `${formatTime(start)} – ${formatTime(end)}`
}

export interface CalendarEventWorkspaceDrawerProps {
  event: AppleCalendarEvent
  defaultMatch?: CalendarClassMatch | null
  classes?: EducationClass[]
  onClose: () => void
  onChanged?: () => void
  onOpenClass?: (classId: string) => void
}

export function CalendarEventWorkspaceDrawer({
  event,
  defaultMatch,
  classes,
  onClose,
  onChanged,
  onOpenClass,
}: CalendarEventWorkspaceDrawerProps) {
  const [workspace, setWorkspace] = useState<CalendarEventWorkspace | null>(null)
  const [notes, setNotes] = useState('')
  const [remarks, setRemarks] = useState<SessionRemark[]>([])
  const [links, setLinks] = useState<SessionLink[]>([])
  const [reminders, setReminders] = useState<SessionReminder[]>([])
  const [duties, setDuties] = useState<SessionDuty[]>([])
  const [classId, setClassId] = useState<string | null>(defaultMatch?.classId ?? null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const lastSent = useRef<string>('')

  const load = useCallback(async () => {
    try {
      const r = await fetchCalendarEventWorkspace(event.occurrenceId)
      setWorkspace(r.workspace)
      setNotes(r.workspace.notes || '')
      setRemarks(r.workspace.remarks || [])
      setLinks(r.workspace.links || [])
      setReminders(r.workspace.reminders || [])
      setDuties(r.workspace.duties || [])
      // Si déjà rattaché côté serveur, on prend ce classId ; sinon on garde
      // le match best-effort fourni par le cockpit/calendrier.
      const initialClassId = r.workspace.classId ?? (defaultMatch?.classId ?? null)
      setClassId(initialClassId)
      lastSent.current = JSON.stringify({
        notes: r.workspace.notes || '',
        remarks: r.workspace.remarks || [],
        links: r.workspace.links || [],
        reminders: r.workspace.reminders || [],
        duties: r.workspace.duties || [],
        classId: initialClassId,
      })
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la fiche')
    }
  }, [event.occurrenceId, defaultMatch?.classId])

  useEffect(() => { load() }, [load])

  // Autosave consolidée (notes/remarques/liens/rappels/devoirs + rattachement
  // à une classe). On compare une sérialisation pour éviter une boucle après
  // refresh côté serveur.
  useEffect(() => {
    if (!loaded) return
    const snapshot = { notes, remarks, links, reminders, duties, classId }
    const serialized = JSON.stringify(snapshot)
    if (serialized === lastSent.current) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        const r = await updateCalendarEventWorkspace({
          occurrenceId: event.occurrenceId,
          uid: event.uid,
          title: event.title,
          start: event.start,
          source: 'Apple Calendar',
          classId,
          notes,
          remarks,
          links,
          reminders,
          duties,
        })
        setWorkspace(r.workspace)
        setRemarks(r.workspace.remarks || [])
        setLinks(r.workspace.links || [])
        setReminders(r.workspace.reminders || [])
        setDuties(r.workspace.duties || [])
        lastSent.current = JSON.stringify({
          notes: r.workspace.notes || '',
          remarks: r.workspace.remarks || [],
          links: r.workspace.links || [],
          reminders: r.workspace.reminders || [],
          duties: r.workspace.duties || [],
          classId: r.workspace.classId,
        })
        setSaveState('saved')
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
        if (onChanged) onChanged()
      } catch (err) {
        setSaveState('error')
        setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [notes, remarks, links, reminders, duties, classId, loaded, event, onChanged])

  const dayLabel = useMemo(() => {
    const start = new Date(event.start)
    return `${DAY_NAMES_LONG[(start.getDay() + 6) % 7]} ${start.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
  }, [event.start])

  const classOptions = useMemo(() => {
    if (!classes) return []
    return [...classes]
      .filter((c) => c.status !== 'ARCHIVE')
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [classes])

  const linkedClass = classOptions.find((c) => c._id === classId) || null
  const matchHint = defaultMatch && !workspace?.classId
    ? `Rattachement suggéré : ${defaultMatch.className}`
    : null

  return (
    <>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>{event.title || '(Sans titre)'}</h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <Apple size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Apple Calendar
              {event.status && ` · ${event.status.toLowerCase()}`}
              <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.4)' }}>(événement en lecture seule)</span>
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <SaveIndicator state={saveState} />
            <button className="edu-btn-icon" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
          </div>
        </div>

        <div className="edu-drawer-body">
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
              <button
                className="edu-btn ghost"
                style={{ marginLeft: 12 }}
                onClick={() => { setError(null); load() }}
              >
                Recharger
              </button>
            </div>
          )}

          {/* Bloc métadonnées événement (read-only) */}
          <div className="edu-calevt-meta">
            <div className="edu-calevt-meta-row">
              <Clock size={13} />
              <span>{dayLabel} · {formatRange(event.start, event.end, event.allDay)} · {durationLabel(event.durationMin)}</span>
            </div>
            {event.location && (
              <div className="edu-calevt-meta-row">
                <MapPin size={13} />
                <span>{event.location}</span>
              </div>
            )}
            {(event.school || event.classLabel) && (
              <div className="edu-calevt-meta-row">
                <Building2 size={13} />
                <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {event.school && <span className="edu-pill">{event.school}</span>}
                  {event.classLabel && <span className="edu-pill">{event.classLabel}</span>}
                </div>
              </div>
            )}
            {event.description && (
              <div className="edu-calevt-meta-block">
                <div className="edu-calevt-meta-label">Description Apple</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{event.description}</div>
              </div>
            )}
            {event.url && (
              <div className="edu-calevt-meta-row">
                <ExternalLink size={13} />
                <a href={event.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>{event.url}</a>
              </div>
            )}
          </div>

          {/* Rattachement classe (côté Venio, persisté) */}
          <div className="edu-session-block">
            <div className="edu-collapse-toggle" aria-disabled style={{ cursor: 'default' }}>
              <BookOpen size={13} />
              <span>Classe rattachée</span>
              {linkedClass && <span className="edu-side-badge">{linkedClass.name}</span>}
            </div>
            <div className="edu-session-block-body">
              <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <select
                  className="edu-select"
                  value={classId || ''}
                  onChange={(e) => setClassId(e.target.value || null)}
                  style={{ minWidth: 220 }}
                  aria-label="Rattacher à une classe"
                >
                  <option value="">— Aucune classe —</option>
                  {classOptions.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}{c.school ? ` · ${c.school}` : ''}
                    </option>
                  ))}
                </select>
                {linkedClass && onOpenClass && (
                  <button
                    className="edu-btn ghost"
                    onClick={() => onOpenClass(linkedClass._id)}
                    title="Ouvrir la classe"
                  >
                    <ExternalLink size={13} /> Ouvrir la classe
                  </button>
                )}
              </div>
              {matchHint && (
                <p className="edu-sub" style={{ marginTop: 6 }}>
                  {matchHint} — sélectionne dans la liste pour le confirmer.
                </p>
              )}
            </div>
          </div>

          {/* Workspace exploitable (mêmes blocs qu'une séance interne) */}
          <NotesSection notes={notes} onChange={setNotes} />
          <DutiesSection duties={duties} onChange={setDuties} />
          <RemindersSection reminders={reminders} onChange={setReminders} />
          <RemarksSection remarks={remarks} onChange={setRemarks} />
          <LinksSection links={links} onChange={setLinks} />

          {workspace?.updatedAt && (
            <p className="edu-sub" style={{ marginTop: 12, fontSize: 11.5, opacity: 0.55 }}>
              Dernière sauvegarde locale : {formatDate(workspace.updatedAt, true)}
            </p>
          )}
        </div>

        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
      <CalendarEventDrawerStyles />
    </>
  )
}

function CalendarEventDrawerStyles() {
  return (
    <style>{`
      .edu-calevt-meta {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 16px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .edu-calevt-meta-row {
        display: flex; gap: 8px; align-items: center;
        font-size: 13px; color: rgba(255,255,255,0.85);
        flex-wrap: wrap;
      }
      .edu-calevt-meta-block { display: flex; flex-direction: column; gap: 4px; }
      .edu-calevt-meta-label {
        font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
        color: rgba(255,255,255,0.5);
      }
    `}</style>
  )
}

export default CalendarEventWorkspaceDrawer
