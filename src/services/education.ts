import { apiDownload, apiFetch, apiUpload } from '../lib/api'
import { SENSITIVE_ACTIONS, sensitiveActionHeaders } from '../lib/sensitiveActions'

// ─── Types ──────────────────────────────────────────────────────────────────

export type EducationClassStatus = 'ACTIVE' | 'PAUSE' | 'TERMINE' | 'ARCHIVE'
export type EducationStudentStatus = 'ACTIVE' | 'PAUSE' | 'ABANDON' | 'TERMINE'
export type EducationSessionStatus = 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE'
export type AttendanceState = 'PRESENT' | 'ABSENT' | 'RETARD' | 'EXCUSE' | 'NON_RENSEIGNE'
export type EducationAssignmentStatus = 'DRAFT' | 'OUVERT' | 'EN_CORRECTION' | 'CLOS' | 'ARCHIVE'
export type EducationAssignmentKind = 'DEVOIR' | 'PROJET' | 'EXPOSE' | 'QCM' | 'EXAMEN' | 'AUTRE'
export type EducationSubmissionStatus = 'NON_RENDU' | 'EN_RETARD' | 'RENDU' | 'EN_CORRECTION' | 'CORRIGE' | 'NON_VALIDE'

export type NoteBlockType =
  | 'heading'
  | 'paragraph'
  | 'checklist'
  | 'bullet'
  | 'numbered'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'link'
  | 'mention'
  | 'subpage'

export type ClassPropertyType = 'text' | 'number' | 'date' | 'select' | 'url' | 'checkbox'

export interface EducationClassProperty {
  id: string
  label: string
  type: ClassPropertyType
  value: string
}

export type NoteLinkType = 'class' | 'session' | 'assignment' | 'student'

export type EducationDocumentParentType =
  | 'class'
  | 'session'
  | 'assignment'
  | 'submission'
  | 'student'
  | 'note'
  | 'standalone'

export interface EducationClass {
  _id: string
  owner: string
  name: string
  emoji: string
  cover: string
  school: string
  level: string
  program: string
  period: { start: string | null; end: string | null }
  weeklyHours: number | null
  totalHours: number | null
  status: EducationClassStatus
  color: string
  tags: string[]
  properties: EducationClassProperty[]
  homeNote: string | null
  notes: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EducationStudent {
  _id: string
  owner: string
  classId: string | { _id: string; name: string; color?: string }
  firstName: string
  lastName: string
  email: string
  phone: string
  externalId: string
  status: EducationStudentStatus
  tags: string[]
  attendanceCount: number
  absenceCount: number
  lateCount: number
  averageGrade: number | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AttendanceEntry {
  studentId: string | { _id: string; firstName: string; lastName: string }
  state: AttendanceState
  comment: string
}

export interface EducationSession {
  _id: string
  classId: string | { _id: string; name: string; color?: string }
  title: string
  theme: string
  objectives: string[]
  agenda: string
  date: string
  durationMin: number
  location: string
  status: EducationSessionStatus
  attendance: AttendanceEntry[]
  recap: string
  supports: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface RubricCriterion {
  label: string
  max: number
}

export interface EducationAssignment {
  _id: string
  classId: string | { _id: string; name: string; color?: string; school?: string }
  sessionId: string | null
  title: string
  kind: EducationAssignmentKind
  instructions: string
  deadline: string | null
  maxGrade: number
  weight: number
  status: EducationAssignmentStatus
  expectedDeliverables: string[]
  rubric: RubricCriterion[]
  feedbackSnippets: string[]
  groupMode: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface EducationSubmission {
  _id: string
  assignmentId: string
  studentId: string | { _id: string; firstName: string; lastName: string; email?: string }
  status: EducationSubmissionStatus
  submittedAt: string | null
  url: string
  textBody: string
  grade: number | null
  feedback: string
  isLate: boolean
  createdAt: string
  updatedAt: string
}

export interface NoteBlock {
  id: string
  type: NoteBlockType
  text: string
  checked: boolean
  level: number
  meta: Record<string, unknown>
}

export interface EducationNote {
  _id: string
  title: string
  emoji: string
  cover: string
  blocks: NoteBlock[]
  markdown: string
  links: { type: NoteLinkType; refId: string }[]
  tags: string[]
  parentNote: string | null
  pinned: boolean
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type EducationTemplateKind = 'session' | 'assignment' | 'note' | 'class'

export interface EducationTemplate {
  _id: string
  kind: EducationTemplateKind
  name: string
  description: string
  body: Record<string, unknown>
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface EducationDocument {
  _id: string
  parentType: EducationDocumentParentType
  parentId: string | null
  title: string
  originalName: string
  mimeType: string
  size: number
  url: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface EducationDashboard {
  counters: {
    activeClasses: number
    totalStudents: number
    todaySessions: number
    weekSessions: number
    openAssignments: number
    lateSubmissions: number
    toGrade: number
    toPrepare: number
  }
  today: EducationSession[]
  week: EducationSession[]
  toPrepare: EducationSession[]
  openAssignments: EducationAssignment[]
  toCorrect: EducationAssignment[]
  lastSessionByClass: Array<{
    class: { _id: string; name: string; color?: string; school?: string }
    lastSession: EducationSession | null
  }>
  schools: string[]
  filter: { school: string | null }
  activity: Array<{
    _id: string
    entityType: string
    entityId: string
    action: string
    payload: Record<string, unknown>
    createdAt: string
  }>
}

// ─── Labels & couleurs ──────────────────────────────────────────────────────

export const CLASS_STATUS_LABEL: Record<EducationClassStatus, string> = {
  ACTIVE: 'En cours',
  PAUSE: 'En pause',
  TERMINE: 'Terminée',
  ARCHIVE: 'Archivée',
}

export const SESSION_STATUS_LABEL: Record<EducationSessionStatus, string> = {
  PLANIFIEE: 'Planifiée',
  EN_COURS: 'En cours',
  TERMINEE: 'Terminée',
  ANNULEE: 'Annulée',
}

export const ATTENDANCE_LABEL: Record<AttendanceState, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  RETARD: 'En retard',
  EXCUSE: 'Excusé',
  NON_RENSEIGNE: '—',
}

export const ATTENDANCE_COLOR: Record<AttendanceState, string> = {
  PRESENT: '#22C55E',
  ABSENT: '#EF4444',
  RETARD: '#F59E0B',
  EXCUSE: '#6366F1',
  NON_RENSEIGNE: '#94A3B8',
}

export const ASSIGNMENT_STATUS_LABEL: Record<EducationAssignmentStatus, string> = {
  DRAFT: 'Brouillon',
  OUVERT: 'Ouvert',
  EN_CORRECTION: 'En correction',
  CLOS: 'Clos',
  ARCHIVE: 'Archivé',
}

export const ASSIGNMENT_STATUS_COLOR: Record<EducationAssignmentStatus, string> = {
  DRAFT: '#64748B',
  OUVERT: '#0EA5E9',
  EN_CORRECTION: '#F59E0B',
  CLOS: '#22C55E',
  ARCHIVE: '#475569',
}

export const ASSIGNMENT_KIND_LABEL: Record<EducationAssignmentKind, string> = {
  DEVOIR: 'Devoir',
  PROJET: 'Projet',
  EXPOSE: 'Exposé',
  QCM: 'QCM',
  EXAMEN: 'Examen',
  AUTRE: 'Autre',
}

export const SUBMISSION_STATUS_LABEL: Record<EducationSubmissionStatus, string> = {
  NON_RENDU: 'Non rendu',
  EN_RETARD: 'En retard',
  RENDU: 'Rendu',
  EN_CORRECTION: 'En correction',
  CORRIGE: 'Corrigé',
  NON_VALIDE: 'Non validé',
}

export const CLASS_COLOR_PALETTE = [
  '#22C55E',
  '#0EA5E9',
  '#A855F7',
  '#F59E0B',
  '#EF4444',
  '#10B981',
  '#8B5CF6',
  '#EC4899',
  '#F97316',
  '#14B8A6',
]

// ─── API calls ──────────────────────────────────────────────────────────────

const base = '/api/admin/education'

export async function fetchDashboard(params: { school?: string } = {}): Promise<EducationDashboard> {
  const qs = new URLSearchParams()
  if (params.school) qs.set('school', params.school)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return await apiFetch<EducationDashboard>(`${base}/dashboard${suffix}`)
}

// Classes
export async function listClasses(
  params: { status?: string; search?: string } = {},
): Promise<{ classes: EducationClass[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  return await apiFetch(`${base}/classes${qs.toString() ? '?' + qs.toString() : ''}`)
}

export async function getClass(id: string): Promise<{
  class: EducationClass
  stats: { studentCount: number; sessionCount: number; assignmentCount: number; openAssignments: number }
  nextSession: EducationSession | null
}> {
  return await apiFetch(`${base}/classes/${id}`)
}

export async function createClass(data: Partial<EducationClass>): Promise<{ class: EducationClass }> {
  return await apiFetch(`${base}/classes`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateClass(id: string, data: Partial<EducationClass>): Promise<{ class: EducationClass }> {
  return await apiFetch(`${base}/classes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteClass(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/classes/${id}`, { method: 'DELETE' })
}

/** Page racine (canvas de blocs) de la classe — créée à la volée côté serveur. */
export async function getClassHome(classId: string): Promise<{ note: EducationNote }> {
  return await apiFetch(`${base}/classes/${classId}/home`)
}

// Students
export async function listStudents(
  params: { classId?: string; status?: string; search?: string } = {},
): Promise<{ students: EducationStudent[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.classId) qs.set('classId', params.classId)
  if (params.status) qs.set('status', params.status)
  if (params.search) qs.set('search', params.search)
  return await apiFetch(`${base}/students${qs.toString() ? '?' + qs.toString() : ''}`)
}

export async function createStudent(
  data: Partial<EducationStudent> & { classId: string; lastName: string },
): Promise<{ student: EducationStudent }> {
  return await apiFetch(`${base}/students`, { method: 'POST', body: JSON.stringify(data) })
}

export async function importStudentsCsv(
  classId: string,
  csv: string,
): Promise<{ inserted: number; students: EducationStudent[] }> {
  return await apiFetch(`${base}/students/import`, {
    method: 'POST',
    body: JSON.stringify({ classId, csv }),
  })
}

export async function updateStudent(
  id: string,
  data: Partial<EducationStudent>,
): Promise<{ student: EducationStudent }> {
  return await apiFetch(`${base}/students/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteStudent(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/students/${id}`, { method: 'DELETE' })
}

// Sessions
export async function listSessions(
  params: { classId?: string; from?: string; to?: string; status?: string } = {},
): Promise<{ sessions: EducationSession[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.classId) qs.set('classId', params.classId)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.status) qs.set('status', params.status)
  return await apiFetch(`${base}/sessions${qs.toString() ? '?' + qs.toString() : ''}`)
}

export async function getSession(id: string): Promise<{ session: EducationSession }> {
  return await apiFetch(`${base}/sessions/${id}`)
}

export async function createSession(
  data: Partial<EducationSession> & { classId: string; title: string; date: string },
): Promise<{ session: EducationSession }> {
  return await apiFetch(`${base}/sessions`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateSession(
  id: string,
  data: Partial<EducationSession>,
): Promise<{ session: EducationSession }> {
  return await apiFetch(`${base}/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteSession(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/sessions/${id}`, { method: 'DELETE' })
}

export async function updateAttendance(
  id: string,
  attendance: Array<{ studentId: string; state: AttendanceState; comment?: string }>,
): Promise<{ session: EducationSession }> {
  return await apiFetch(`${base}/sessions/${id}/attendance`, {
    method: 'PATCH',
    body: JSON.stringify({ attendance }),
  })
}

// Assignments
export async function listAssignments(
  params: { classId?: string; status?: string; kind?: string; search?: string } = {},
): Promise<{ assignments: EducationAssignment[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.classId) qs.set('classId', params.classId)
  if (params.status) qs.set('status', params.status)
  if (params.kind) qs.set('kind', params.kind)
  if (params.search) qs.set('search', params.search)
  return await apiFetch(`${base}/assignments${qs.toString() ? '?' + qs.toString() : ''}`)
}

export async function getAssignment(id: string): Promise<{
  assignment: EducationAssignment
  submissions: EducationSubmission[]
  stats: { total: number; rendu: number; corrige: number; nonRendu: number; retard: number; moyenne: number | null }
}> {
  return await apiFetch(`${base}/assignments/${id}`)
}

export async function createAssignment(
  data: Partial<EducationAssignment> & { classId: string; title: string },
): Promise<{ assignment: EducationAssignment }> {
  return await apiFetch(`${base}/assignments`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateAssignment(
  id: string,
  data: Partial<EducationAssignment>,
): Promise<{ assignment: EducationAssignment }> {
  return await apiFetch(`${base}/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteAssignment(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/assignments/${id}`, { method: 'DELETE' })
}

export async function updateSubmission(
  assignmentId: string,
  studentId: string,
  data: Partial<EducationSubmission>,
): Promise<{ submission: EducationSubmission }> {
  return await apiFetch(`${base}/assignments/${assignmentId}/submissions/${studentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export interface SubmissionBulkUpdate {
  studentId: string
  status?: EducationSubmissionStatus
  grade?: number | null
  feedback?: string
  submittedAt?: string | null
}

export async function bulkUpdateSubmissions(
  assignmentId: string,
  updates: SubmissionBulkUpdate[],
): Promise<{ updated: number; submissions: EducationSubmission[] }> {
  return await apiFetch(`${base}/assignments/${assignmentId}/submissions/bulk`, {
    method: 'PATCH',
    body: JSON.stringify({ updates }),
  })
}

export function assignmentExportUrl(assignmentId: string): string {
  return `${base}/assignments/${assignmentId}/export.csv`
}

export function sessionExportUrl(sessionId: string): string {
  return `${base}/sessions/${sessionId}/export.csv`
}

function saveDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function downloadAssignmentExport(assignmentId: string): Promise<void> {
  const { blob, filename } = await apiDownload(assignmentExportUrl(assignmentId), {
    headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.EDUCATION_ASSIGNMENT_EXPORT),
  })
  saveDownload(blob, filename ?? 'corrections.csv')
}

export async function downloadSessionExport(sessionId: string): Promise<void> {
  const { blob, filename } = await apiDownload(sessionExportUrl(sessionId), {
    headers: sensitiveActionHeaders(SENSITIVE_ACTIONS.EDUCATION_SESSION_EXPORT),
  })
  saveDownload(blob, filename ?? 'presences.csv')
}

// Notes
export async function listNotes(
  params: {
    archived?: boolean
    pinned?: boolean
    linkType?: NoteLinkType
    linkId?: string
    search?: string
    parent?: string
  } = {},
): Promise<{ notes: EducationNote[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.archived !== undefined) qs.set('archived', String(params.archived))
  if (params.pinned !== undefined) qs.set('pinned', String(params.pinned))
  if (params.linkType) qs.set('linkType', params.linkType)
  if (params.linkId) qs.set('linkId', params.linkId)
  if (params.search) qs.set('search', params.search)
  if (params.parent) qs.set('parent', params.parent)
  return await apiFetch(`${base}/notes${qs.toString() ? '?' + qs.toString() : ''}`)
}

/** Sous-pages directes d'une note (arborescence). */
export async function listChildPages(parentId: string): Promise<{ notes: EducationNote[]; total: number }> {
  return await listNotes({ parent: parentId, archived: false })
}

export async function getNote(id: string): Promise<{ note: EducationNote }> {
  return await apiFetch(`${base}/notes/${id}`)
}

export async function createNote(data: Partial<EducationNote>): Promise<{ note: EducationNote }> {
  return await apiFetch(`${base}/notes`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateNote(id: string, data: Partial<EducationNote>): Promise<{ note: EducationNote }> {
  return await apiFetch(`${base}/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteNote(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/notes/${id}`, { method: 'DELETE' })
}

// Templates
export const TEMPLATE_KIND_LABEL: Record<EducationTemplateKind, string> = {
  session: 'Séance',
  assignment: 'Devoir / projet',
  note: 'Note',
  class: 'Classe',
}

export async function listTemplates(
  params: { kind?: EducationTemplateKind } = {},
): Promise<{ templates: EducationTemplate[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.kind) qs.set('kind', params.kind)
  return await apiFetch(`${base}/templates${qs.toString() ? '?' + qs.toString() : ''}`)
}

export async function createTemplate(data: Partial<EducationTemplate>): Promise<{ template: EducationTemplate }> {
  return await apiFetch(`${base}/templates`, { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTemplate(
  id: string,
  data: Partial<EducationTemplate>,
): Promise<{ template: EducationTemplate }> {
  return await apiFetch(`${base}/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteTemplate(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/templates/${id}`, { method: 'DELETE' })
}

// Backlinks — notes liées à une entité spécifique
export async function listLinkedNotes(linkType: NoteLinkType, linkId: string): Promise<{ notes: EducationNote[] }> {
  const r = await listNotes({ linkType, linkId })
  return { notes: r.notes }
}

// Search
export async function searchEducation(q: string): Promise<{
  results: {
    classes: EducationClass[]
    students: EducationStudent[]
    sessions: EducationSession[]
    assignments: EducationAssignment[]
    notes: EducationNote[]
    documents: EducationDocument[]
  }
}> {
  return await apiFetch(`${base}/search?q=${encodeURIComponent(q)}`)
}

export type AdvancedSearchEntity = 'all' | 'classes' | 'students' | 'sessions' | 'assignments' | 'notes'

export interface AdvancedSearchParams {
  q?: string
  entity?: AdvancedSearchEntity
  school?: string
  classId?: string
  kind?: EducationAssignmentKind | ''
  status?: string
  from?: string
  to?: string
  limit?: number
}

export interface AdvancedSearchResult {
  results: {
    classes: EducationClass[]
    students: EducationStudent[]
    sessions: EducationSession[]
    assignments: EducationAssignment[]
    notes: EducationNote[]
  }
  counts: {
    classes: number
    students: number
    sessions: number
    assignments: number
    notes: number
  }
  schools: string[]
}

export async function searchEducationAdvanced(params: AdvancedSearchParams = {}): Promise<AdvancedSearchResult> {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.entity && params.entity !== 'all') qs.set('entity', params.entity)
  if (params.school) qs.set('school', params.school)
  if (params.classId) qs.set('classId', params.classId)
  if (params.kind) qs.set('kind', params.kind)
  if (params.status) qs.set('status', params.status)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  if (params.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return await apiFetch(`${base}/search/advanced${suffix}`)
}

export interface SearchFacets {
  classes: Array<{ _id: string; name: string; school?: string; color?: string; status: string }>
  schools: Array<{ name: string; count: number }>
}

export async function fetchSearchFacets(): Promise<SearchFacets> {
  return await apiFetch(`${base}/search/facets`)
}

export interface SchoolBucket {
  school: string
  classes: EducationClass[]
  studentCount: number
}

export async function listEducationBySchool(): Promise<{ schools: SchoolBucket[] }> {
  return await apiFetch(`${base}/search/by-school`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cycle de présence un-tap : NON_RENSEIGNE démarre à PRESENT, puis rotation. */
const ATTENDANCE_CYCLE: AttendanceState[] = ['PRESENT', 'RETARD', 'ABSENT', 'EXCUSE']

export function nextAttendanceState(current: AttendanceState): AttendanceState {
  const idx = ATTENDANCE_CYCLE.indexOf(current)
  return ATTENDANCE_CYCLE[(idx + 1) % ATTENDANCE_CYCLE.length] ?? 'PRESENT'
}

export function studentDisplayName(s: EducationStudent | { firstName?: string; lastName?: string }): string {
  const last = (s.lastName || '').toUpperCase()
  const first = s.firstName || ''
  return [first, last].filter(Boolean).join(' ') || '—'
}

export function classDisplayName(c: { name: string; color?: string }): string {
  return c.name
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.floor(h / 24)
  if (days < 7) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR')
}

export function formatDate(date: string | null | undefined, withTime = false): string {
  if (!date) return '—'
  const d = new Date(date)
  if (withTime) {
    return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Documents ───────────────────────────────────────────────────────────────
// Ajoutés en fin de fichier : ce module est importé en lecture par mon-espace,
// ne pas réorganiser l'existant ci-dessus.

export async function listDocuments(
  params: { parentType?: EducationDocumentParentType; parentId?: string } = {},
): Promise<{ documents: EducationDocument[]; total: number }> {
  const qs = new URLSearchParams()
  if (params.parentType) qs.set('parentType', params.parentType)
  if (params.parentId) qs.set('parentId', params.parentId)
  return await apiFetch(`${base}/documents${qs.toString() ? '?' + qs.toString() : ''}`)
}

/** Upload multipart (champ `file` + metadata) — apiUpload laisse le navigateur fixer le boundary. */
export async function uploadDocument(
  file: File,
  meta: { parentType: EducationDocumentParentType; parentId: string; title?: string },
): Promise<{ document: EducationDocument }> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('parentType', meta.parentType)
  fd.append('parentId', meta.parentId)
  if (meta.title) fd.append('title', meta.title)
  return await apiUpload(`${base}/documents`, fd)
}

/** URL de téléchargement (route protégée Bearer : à consommer via apiDownload côté UI). */
export function documentDownloadUrl(id: string): string {
  return `${base}/documents/${id}/download`
}

export async function deleteDocument(id: string): Promise<{ success: true }> {
  return await apiFetch(`${base}/documents/${id}`, { method: 'DELETE' })
}

/** Taille de fichier lisible (o, Ko, Mo). */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
