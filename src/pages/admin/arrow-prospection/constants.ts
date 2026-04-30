import type { ArrowSchoolFormData } from '../../../types/arrow.types'

export const ARROW_STATUSES = [
  { key: 'A_PROSPECTER', label: 'À prospecter', color: '#6366f1' },
  { key: 'CONTACTE', label: 'Contacté', color: '#0ea5e9' },
  { key: 'REPONSE', label: 'Réponse obtenue', color: '#8b5cf6' },
  { key: 'DEMO_PLANIFIEE', label: 'Démo planifiée', color: '#f59e0b' },
  { key: 'DEMO_FAITE', label: 'Démo faite', color: '#f97316' },
  { key: 'PROPOSITION', label: 'Proposition envoyée', color: '#ec4899' },
  { key: 'SIGNE', label: 'Signé ✓', color: '#22c55e' },
  { key: 'NON_INTERESSE', label: 'Non intéressé', color: '#ef4444' },
]

export const ARROW_SCHOOL_TYPES = [
  { key: 'LYCEE', label: 'Lycée' },
  { key: 'BTS_IUT', label: 'BTS / IUT' },
  { key: 'UNIVERSITE', label: 'Université' },
  { key: 'ECOLE_SUP', label: 'École supérieure' },
  { key: 'CFA', label: 'CFA / Apprentissage' },
  { key: 'AUTRE', label: 'Autre' },
]

export const ARROW_TEMPERATURES = [
  { key: 'FROID', label: 'Froid ❄️', color: '#64748b' },
  { key: 'TIEDE', label: 'Tiède 🌤️', color: '#f59e0b' },
  { key: 'CHAUD', label: 'Chaud 🔥', color: '#f97316' },
  { key: 'TRES_CHAUD', label: 'Très chaud 🔥🔥', color: '#ef4444' },
]

export const ARROW_SOURCES = ['LinkedIn', 'Prospection terrain', 'Réseau', 'Référence', 'Site web', 'Salon', 'Autre']

export const STATUS_MAP = Object.fromEntries(ARROW_STATUSES.map((s) => [s.key, s]))
export const TEMPERATURE_MAP = Object.fromEntries(ARROW_TEMPERATURES.map((t) => [t.key, t]))
export const SCHOOL_TYPE_MAP = Object.fromEntries(ARROW_SCHOOL_TYPES.map((t) => [t.key, t]))

export const EMPTY_FORM: ArrowSchoolFormData = {
  name: '',
  schoolType: 'AUTRE',
  city: '',
  region: '',
  studentCount: '',
  emailGeneral: '',
  contactName: '',
  contactRole: '',
  contactEmail: '',
  contactPhone: '',
  status: 'A_PROSPECTER',
  temperature: 'TIEDE',
  source: '',
  notes: '',
  nextActionAt: '',
  lastContactAt: '',
  assignedTo: '',
}
