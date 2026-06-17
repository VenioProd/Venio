export type SubsidiaryStatus = 'ACTIVE' | 'INCUBATION' | 'PAUSE' | 'ARCHIVED'
export type SubsidiaryHealth = 'GOOD' | 'WATCH' | 'RISK'

export interface SubsidiaryPerson {
  _id: string
  name?: string
  email?: string
  role?: string
}

export interface SubsidiaryLink {
  label: string
  url: string
  icon?: string
}

export interface SubsidiaryAlert {
  label: string
  level: 'INFO' | 'WARNING' | 'CRITICAL'
}

export interface SubsidiaryKpis {
  caMtd: number
  caMtdDelta: number
  margin: number
  marginTarget: number
  treasury: number
  runwayMonths: number
  headcount: number
  headcountTarget: number
}

export interface SubsidiaryObjective {
  label: string
  current: number
  target: number
  unit: string
}

export interface LinkedProject {
  _id: string
  name: string
  status: string
  priority: string
  updatedAt: string
}

export interface Subsidiary {
  _id: string
  name: string
  slug: string
  tagline: string
  sector: string
  status: SubsidiaryStatus
  health: SubsidiaryHealth
  description: string
  accentColor: string
  lead: SubsidiaryPerson | null
  foundedYear: number | null
  linkedEntity: string
  team: SubsidiaryPerson[]
  kpis: SubsidiaryKpis
  objective: SubsidiaryObjective
  links: SubsidiaryLink[]
  alerts: SubsidiaryAlert[]
  tags: string[]
  order: number
  archived: boolean
  headcount?: number
  projectCounts?: { active: number; total: number }
  linkedProjects?: LinkedProject[]
  createdAt: string
  updatedAt: string
}

export const STATUS_LABELS: Record<SubsidiaryStatus, string> = {
  ACTIVE: 'Active',
  INCUBATION: 'Incubation',
  PAUSE: 'En pause',
  ARCHIVED: 'Archivée',
}

export const HEALTH_LABELS: Record<SubsidiaryHealth, string> = {
  GOOD: 'Bonne santé',
  WATCH: 'À surveiller',
  RISK: 'À risque',
}

export const HEALTH_COLORS: Record<SubsidiaryHealth, string> = {
  GOOD: '#22c55e',
  WATCH: '#f59e0b',
  RISK: '#f87171',
}

export const STATUS_COLORS: Record<SubsidiaryStatus, string> = {
  ACTIVE: '#22c55e',
  INCUBATION: '#0ea5e9',
  PAUSE: '#a5b4cf',
  ARCHIVED: '#9ca3af',
}
