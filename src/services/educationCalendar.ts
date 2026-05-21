import { apiFetch } from '../lib/api'
import type {
  SessionDuty,
  SessionLink,
  SessionReminder,
  SessionRemark,
  SessionWorkspacePayload,
} from './education'

// ─── Apple Calendar (lecture seule) ─────────────────────────────────────────
//
// Service séparé d'education.ts pour garder ce dernier focalisé sur les
// classes/sessions/devoirs. Le calendrier Apple est un import en lecture
// seule via un flux ICS — il ne crée ni ne modifie d'entités côté Mongo.

export interface AppleCalendarEvent {
  occurrenceId: string
  uid: string
  title: string
  description: string
  location: string
  url: string
  status: string
  start: string
  end: string
  durationMin: number
  allDay: boolean
  source: 'Apple Calendar'
  school: string | null
  classLabel: string | null
}

export interface AppleCalendarPayload {
  configured: boolean
  source: 'Apple Calendar'
  fetchedAt: string
  fromCache: boolean
  from: string
  to: string
  events: AppleCalendarEvent[]
}

export async function fetchAppleCalendar(params: {
  from: Date
  to: Date
  refresh?: boolean
}): Promise<AppleCalendarPayload> {
  const qs = new URLSearchParams()
  qs.set('from', params.from.toISOString())
  qs.set('to', params.to.toISOString())
  if (params.refresh) qs.set('refresh', '1')
  return await apiFetch<AppleCalendarPayload>(`/api/admin/education/calendar?${qs.toString()}`)
}

export async function refreshAppleCalendar(): Promise<{
  configured: boolean
  fetchedAt: string
  bytes: number
}> {
  return await apiFetch(`/api/admin/education/calendar/refresh`, { method: 'POST' })
}

// ─── Upcoming events rapprochés des classes du cockpit ──────────────────────
//
// VENIO-42 — endpoint dédié au cockpit intervenant qui renvoie les événements
// Apple Calendar des prochains jours, rapprochés des EducationClass existantes
// lorsque c'est possible (matching best-effort côté backend).

export interface CalendarClassMatch {
  classId: string
  className: string
  school: string
  color: string
  score: number
  reason: 'exact-name' | 'tokens'
}

export interface UpcomingCalendarEvent extends AppleCalendarEvent {
  match: CalendarClassMatch | null
}

export interface UpcomingCalendarPayload {
  configured: boolean
  source: 'Apple Calendar'
  fetchedAt: string
  fromCache: boolean
  from: string
  to: string
  days: number
  events: UpcomingCalendarEvent[]
}

export async function fetchUpcomingCalendar(params: { days?: number } = {}): Promise<UpcomingCalendarPayload> {
  const qs = new URLSearchParams()
  if (params.days) qs.set('days', String(params.days))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return await apiFetch<UpcomingCalendarPayload>(`/api/admin/education/calendar/upcoming${suffix}`)
}

// ─── Workspace persistant pour un événement Apple Calendar (VENIO-44) ──────
//
// On n'écrit JAMAIS dans l'événement Apple lui-même : c'est une lecture
// seule depuis le flux ICS. À la place, le backend stocke une fiche Venio
// indexée par occurrenceId, exposable depuis n'importe quel endroit de
// l'app où cet événement apparaît (cockpit, calendrier). Le format des
// blocs (notes/remarques/liens/rappels/devoirs) est strictement le même
// que pour les séances internes (VENIO-43), ce qui permet de réutiliser
// les mêmes composants côté UI (WorkspaceSections.tsx).

export interface CalendarEventWorkspace {
  _id: string | null
  occurrenceId: string
  uid: string
  source: 'Apple Calendar'
  title: string
  start: string | null
  classId: string | null
  notes: string
  remarks: SessionRemark[]
  links: SessionLink[]
  reminders: SessionReminder[]
  duties: SessionDuty[]
  createdAt: string | null
  updatedAt: string | null
}

export interface CalendarEventWorkspaceResponse {
  workspace: CalendarEventWorkspace
  exists: boolean
}

export interface CalendarEventWorkspacePayload extends SessionWorkspacePayload {
  occurrenceId: string
  uid?: string
  title?: string
  start?: string
  source?: 'Apple Calendar'
  classId?: string | null
}

export async function fetchCalendarEventWorkspace(occurrenceId: string): Promise<CalendarEventWorkspaceResponse> {
  const qs = new URLSearchParams({ occurrenceId })
  return await apiFetch<CalendarEventWorkspaceResponse>(
    `/api/admin/education/calendar/workspace?${qs.toString()}`,
  )
}

export async function updateCalendarEventWorkspace(
  payload: CalendarEventWorkspacePayload,
): Promise<CalendarEventWorkspaceResponse> {
  return await apiFetch<CalendarEventWorkspaceResponse>(
    `/api/admin/education/calendar/workspace`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}
