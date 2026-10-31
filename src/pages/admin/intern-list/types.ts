import type { MessageKey } from '../../../i18n'
import { translate } from '../../../i18n'
import { formatDate as formatLocalDate, formatDateTime as formatLocalDateTime } from '../../../i18n/format'

export interface InternUser {
  _id: string
  name: string
  email: string
  phone?: string
  lastLoginAt?: string | null
}

export interface Intern {
  _id: string
  userId: InternUser
  type: 'STAGIAIRE' | 'ALTERNANT'
  poste: string
  departement: string
  dateDebut: string
  dateFin: string
  tuteur: { _id: string; name: string; email: string } | null
  ecole: string
  formation: string
  notes: string
  joursPresence: string[]
  status: 'ACTIF' | 'TERMINE' | 'ANNULE'
  createdAt: string
  updatedAt: string
}

export interface AdminUser {
  _id: string
  name: string
  role: string
  email?: string
}

export interface InternFormData {
  name: string
  email: string
  phone: string
  password: string
  type: 'STAGIAIRE' | 'ALTERNANT'
  poste: string
  departement: string
  dateDebut: string
  dateFin: string
  tuteur: string
  ecole: string
  formation: string
  notes: string
  joursPresence: string[]
}

// i18n-ignore: valeurs stockées en base (jours de présence), seul le libellé est traduit
export const INTERN_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const DEFAULT_INTERN_DAYS = INTERN_DAYS.slice(0, 5)

export const INTERN_DAY_LABEL_KEYS: Record<string, MessageKey> = {
  lundi: 'intern.day.monday',
  mardi: 'intern.day.tuesday',
  mercredi: 'intern.day.wednesday',
  jeudi: 'intern.day.thursday',
  vendredi: 'intern.day.friday',
  samedi: 'intern.day.saturday',
  dimanche: 'intern.day.sunday',
}

export function createEmptyInternForm(): InternFormData {
  return {
    name: '',
    email: '',
    phone: '',
    password: '',
    type: 'STAGIAIRE',
    poste: '',
    departement: '',
    dateDebut: '',
    dateFin: '',
    tuteur: '',
    ecole: '',
    formation: '',
    notes: '',
    joursPresence: [...DEFAULT_INTERN_DAYS],
  }
}

export function internFormFromIntern(intern: Intern): InternFormData {
  return {
    name: intern.userId.name,
    email: intern.userId.email,
    phone: intern.userId.phone || '',
    password: '',
    type: intern.type || 'STAGIAIRE',
    poste: intern.poste,
    departement: intern.departement,
    dateDebut: intern.dateDebut.split('T')[0],
    dateFin: intern.dateFin.split('T')[0],
    tuteur: intern.tuteur?._id || '',
    ecole: intern.ecole,
    formation: intern.formation,
    notes: intern.notes,
    joursPresence: intern.joursPresence?.length ? intern.joursPresence : [...DEFAULT_INTERN_DAYS],
  }
}

export interface ReportFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface ActivityReport {
  _id: string
  internId: string
  userId: { _id: string; name: string; email: string }
  date: string
  contenu: string
  taches: string[]
  attachments: ReportFile[]
  status: 'BROUILLON' | 'SOUMIS' | 'VALIDE'
  commentaireAdmin: string
  validePar: { _id: string; name: string } | null
  valideAt: string | null
  createdAt: string
  updatedAt: string
}

export const STATUS_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  ACTIF: { labelKey: 'intern.status.active', color: '#22c55e' },
  TERMINE: { labelKey: 'intern.status.finished', color: '#64748b' },
  ANNULE: { labelKey: 'intern.status.cancelled', color: '#ef4444' },
}

export const REPORT_STATUS_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  BROUILLON: { labelKey: 'intern.reportStatus.draft', color: '#f59e0b' },
  SOUMIS: { labelKey: 'intern.reportStatus.submitted', color: '#0ea5e9' },
  VALIDE: { labelKey: 'intern.reportStatus.validated', color: '#22c55e' },
}

export function formatDate(d: string) {
  return formatLocalDate(d, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string) {
  return formatLocalDateTime(d, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return translate('intern.file.bytes', { value: bytes })
  if (bytes < 1024 * 1024) return translate('intern.file.kilobytes', { value: (bytes / 1024).toFixed(0) })
  return translate('intern.file.megabytes', { value: (bytes / (1024 * 1024)).toFixed(1) })
}

export function isImage(mime: string) {
  return mime.startsWith('image/')
}

export function daysRemaining(dateFin: string) {
  const now = new Date()
  const end = new Date(dateFin)
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}
