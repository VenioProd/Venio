// Constants & types shared across InternalProjectList sub-components.
// Kept here (next to the components) rather than in `src/lib/` because they
// are specific to the admin "Projets internes" page.

export const ENTITIES = ['Venio', 'Creatio', 'Decisio', 'Formatio', 'Arrow']
export const POLES = [
  'Dev',
  'Design',
  'Marketing',
  'Communication',
  'Commercial',
  'Direction',
  'RH',
  'Formation',
]

export const STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Terminé',
  ARCHIVE: 'Archivé',
}

export const STATUS_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  EN_COURS: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: '#6ee7b7' },
  EN_ATTENTE: { bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.4)', text: '#fde047' },
  TERMINE: { bg: 'rgba(100, 116, 180, 0.12)', border: 'rgba(100, 116, 180, 0.35)', text: '#a5b4cf' },
  ARCHIVE: { bg: 'rgba(100, 100, 100, 0.12)', border: 'rgba(100, 100, 100, 0.35)', text: '#9ca3af' },
}

export const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#6ee7b7',
  NORMALE: '#a5b4cf',
  HAUTE: '#fbbf24',
  URGENTE: '#f87171',
}

export const DEFAULT_ARROW_PILOTAGE = {
  goals: [
    'Valider le cas d’usage prioritaire avec 5 retours utilisateurs',
    'Stabiliser le workflow MVP de bout en bout',
    'Transformer les apprentissages en décisions produit',
  ],
  scorecard: [
    'Workflow principal cadré',
    'Missions de validation créées',
    'Blocages visibles',
    'Premiers livrables suivis',
  ],
  decisions: [
    'Cette semaine | Premier workflow Arrow | Concentrer le suivi sur un scénario utilisateur principal avant d’élargir. | Produit',
    'À trancher | Critère MVP | Définir le seuil minimum pour considérer le prototype testable. | Équipe',
    'À revoir | Cible prioritaire | Réévaluer après les premiers tests et objections récurrentes. | Direction',
  ],
  cadence: [
    'Lundi | Priorités, responsables, livrable attendu.',
    'Mercredi | Blocages, arbitrages, ajustements.',
    'Vendredi | Résultats, apprentissages, décisions.',
    'Règle | Chaque semaine livre un résultat ou un apprentissage validé.',
  ],
}

export type ArrowPilotage = typeof DEFAULT_ARROW_PILOTAGE
export type ArrowPilotageSection = keyof typeof DEFAULT_ARROW_PILOTAGE

export const ARROW_SECTION_LABELS: Record<ArrowPilotageSection, string> = {
  goals: 'Objectif de la semaine',
  scorecard: 'Scorecard',
  decisions: 'Journal des décisions',
  cadence: 'Cadre de suivi',
}

export interface Member {
  _id: string
  name: string
  email: string
  role: string
}

export interface Mission {
  _id: string
  title: string
  description: string
  status: string
  dueDate: string | null
  progress: number
  assignedTo: { _id: string; name: string; email: string }[]
  internalProject: { _id: string; name: string; entity: string }
  participants: {
    _id: string
    user: { _id: string; name: string; email: string }
    progress: number
    status: string
    blocked: boolean
    blockedReason: string
  }[]
  steps: {
    _id: string
    title: string
    description: string
    done: boolean
    waitingReview: boolean
    assignedTo?: string
  }[]
  deliverables: {
    _id: string
    title: string
    description: string
    done: boolean
    assignedTo?: string
  }[]
  files: { _id: string; originalName: string; mimeType: string; size: number }[]
  createdAt: string
}

export interface Project {
  _id: string
  name: string
  description: string
  entity: string
  poles: string[]
  members: Member[]
  status: string
  priority: string
  startDate: string | null
  endDate: string | null
  tags: string[]
  createdBy: { name: string }
}

export interface ProjectFormState {
  name: string
  description: string
  entity: string
  poles: string[]
  members: string[]
  status: string
  priority: string
  startDate: string
  endDate: string
  tags: string
}

export const emptyProjectForm: ProjectFormState = {
  name: '',
  description: '',
  entity: 'Venio',
  poles: [] as string[],
  members: [] as string[],
  status: 'EN_COURS',
  priority: 'NORMALE',
  startDate: '',
  endDate: '',
  tags: '',
}
