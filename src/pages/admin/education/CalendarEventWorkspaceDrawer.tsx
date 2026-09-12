import { WorkspaceOverlayPortal } from '../../../components/WorkspaceOverlayPortal'
import { useEducationAutosave } from './useEducationAutosave'
import { AutosaveStatus } from './AutosaveStatus'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Apple, MapPin, Clock, ExternalLink, Building2, BookOpen } from 'lucide-react'
import {
  fetchCalendarEventWorkspace,
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
import { DutiesSection, LinksSection, NotesSection, RemarksSection, RemindersSection } from './WorkspaceSections'

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
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
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
  onCreateSession?: () => void
  onClose: () => void
  onChanged?: () => void
  onOpenClass?: (classId: string) => void
}

export function CalendarEventWorkspaceDrawer({
  event,
  defaultMatch,
  classes,
  onClose: onExit,
  onCreateSession,
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
  const { stage, restore, flush, status: saveState, error: saveError } = useEducationAutosave()
  const onClose = async () => {
    if (await flush()) {
      onChanged?.()
      onExit()
    }
  }
  const change = (patch: Record<string, unknown>) =>
    stage('calendar-event', event.occurrenceId, {
      uid: event.uid,
      title: event.title,
      start: event.start,
      source: 'Apple Calendar',
      classId,
      ...patch,
    })
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetchCalendarEventWorkspace(event.occurrenceId)
      const restored = restore('calendar-event', event.occurrenceId, {
        ...r.workspace,
        classId: r.workspace.classId ?? defaultMatch?.classId ?? null,
      })
      setWorkspace(r.workspace)
      setNotes(restored.notes || '')
      setRemarks(restored.remarks || [])
      setLinks(restored.links || [])
      setReminders(restored.reminders || [])
      setDuties(restored.duties || [])
      setClassId(restored.classId)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la fiche')
    }
  }, [event.occurrenceId, defaultMatch?.classId, restore])

  useEffect(() => {
    load()
  }, [load])

  const dayLabel = useMemo(() => {
    const start = new Date(event.start)
    return `${DAY_NAMES_LONG[(start.getDay() + 6) % 7]} ${start.getDate()} ${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
  }, [event.start])

  const classOptions = useMemo(() => {
    if (!classes) return []
    return [...classes].filter((c) => c.status !== 'ARCHIVE').sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [classes])

  const linkedClass = classOptions.find((c) => c._id === classId) || null
  const matchHint = defaultMatch && !workspace?.classId ? `Rattachement suggéré : ${defaultMatch.className}` : null

  return (
    <WorkspaceOverlayPortal>
      <div className="edu-drawer-backdrop" onClick={onClose} />
      <div className="edu-drawer">
        <div className="edu-drawer-head">
          <div>
            <h2 className="edu-h1" style={{ fontSize: 18, margin: 0 }}>
              {event.title || '(Sans titre)'}
            </h2>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
              <Apple size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Apple Calendar
              {event.status && ` · ${event.status.toLowerCase()}`}
              <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.4)' }}>(événement en lecture seule)</span>
            </div>
          </div>
          <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <AutosaveStatus status={saveState} error={saveError} onRetry={flush} />
            {onCreateSession && (
              <button
                className="edu-btn"
                onClick={async () => {
                  if (await flush()) onCreateSession()
                }}
              >
                Créer la séance
              </button>
            )}
            <button className="edu-btn-icon" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="edu-drawer-body">
          {error && (
            <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
              {error}
              <button
                className="edu-btn ghost"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  setError(null)
                  load()
                }}
              >
                Recharger
              </button>
            </div>
          )}

          {/* Bloc métadonnées événement (read-only) */}
          <div className="edu-calevt-meta">
            <div className="edu-calevt-meta-row">
              <Clock size={13} />
              <span>
                {dayLabel} · {formatRange(event.start, event.end, event.allDay)} · {durationLabel(event.durationMin)}
              </span>
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
                <a href={event.url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                  {event.url}
                </a>
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
                  onChange={(e) => {
                    const value = e.target.value || null
                    setClassId(value)
                    change({ classId: value })
                  }}
                  style={{ minWidth: 220 }}
                  aria-label="Rattacher à une classe"
                >
                  <option value="">— Aucune classe —</option>
                  {classOptions.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                      {c.school ? ` · ${c.school}` : ''}
                    </option>
                  ))}
                </select>
                {linkedClass && onOpenClass && (
                  <button
                    className="edu-btn ghost"
                    onClick={async () => {
                      if (await flush()) onOpenClass(linkedClass._id)
                    }}
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
          <NotesSection
            notes={notes}
            onChange={(value) => {
              setNotes(value)
              change({ notes: value })
            }}
          />
          <DutiesSection
            duties={duties}
            onChange={(value) => {
              setDuties(value)
              change({ duties: value })
            }}
          />
          <RemindersSection
            reminders={reminders}
            onChange={(value) => {
              setReminders(value)
              change({ reminders: value })
            }}
          />
          <RemarksSection
            remarks={remarks}
            onChange={(value) => {
              setRemarks(value)
              change({ remarks: value })
            }}
          />
          <LinksSection
            links={links}
            onChange={(value) => {
              setLinks(value)
              change({ links: value })
            }}
          />

          {workspace?.updatedAt && (
            <p className="edu-sub" style={{ marginTop: 12, fontSize: 11.5, opacity: 0.55 }}>
              Dernière sauvegarde locale : {formatDate(workspace.updatedAt, true)}
            </p>
          )}
        </div>

        <div className="edu-drawer-foot">
          <button className="edu-btn ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
      <CalendarEventDrawerStyles />
    </WorkspaceOverlayPortal>
  )
}

function CalendarEventDrawerStyles() {
  return (
    <style>{`
      .edu-calevt-meta {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: var(--r-md);
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
        font-size: 11px; 
        color: rgba(255,255,255,0.5);
      }
    `}</style>
  )
}

export default CalendarEventWorkspaceDrawer
