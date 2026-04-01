export interface InternUser {
  _id: string
  name: string
  email: string
  phone?: string
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
  status: 'ACTIF' | 'TERMINE' | 'ANNULE'
  createdAt: string
  updatedAt: string
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

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ACTIF: { label: 'Actif', color: '#22c55e' },
  TERMINE: { label: 'Termine', color: '#64748b' },
  ANNULE: { label: 'Annule', color: '#ef4444' },
}

export const REPORT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  BROUILLON: { label: 'Brouillon', color: '#f59e0b' },
  SOUMIS: { label: 'Soumis', color: '#0ea5e9' },
  VALIDE: { label: 'Valide', color: '#22c55e' },
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function isImage(mime: string) { return mime.startsWith('image/') }

export function daysRemaining(dateFin: string) {
  const now = new Date()
  const end = new Date(dateFin)
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return diff
}
