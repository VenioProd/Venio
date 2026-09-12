export type SubsidiaryStatus = 'ACTIVE' | 'INCUBATION' | 'PAUSE' | 'ARCHIVED'
export type SubsidiaryHealth = 'GOOD' | 'WATCH' | 'RISK'

export interface SubsidiaryPerson {
  _id: string
  name?: string
  email?: string
  role?: string
}

export type SubsidiaryLinkType =
  | 'repo'
  | 'production'
  | 'staging'
  | 'analytics'
  | 'hosting'
  | 'dns'
  | 'ci'
  | 'design'
  | 'docs'
  | 'drive'
  | 'other'

export interface SubsidiaryLink {
  type: SubsidiaryLinkType
  label: string
  url: string
  icon?: string
}

export interface SubsidiaryInfo {
  _id?: string
  label: string
  value: string
}

export interface SubsidiaryContact {
  _id?: string
  name: string
  role: string
  email: string
  phone: string
  notes: string
}

export type SubsidiaryCredentialCategory = 'admin' | 'service' | 'api' | 'db' | 'other'

/** Identifiant renvoyé par l'API — sans le secret (hasSecret indique sa présence). */
export interface SubsidiaryCredential {
  _id: string
  category: SubsidiaryCredentialCategory
  label: string
  username: string
  url: string
  notes: string
  hasSecret: boolean
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

export interface SubsidiarySection {
  title: string
  content: string
}

export type SubsidiaryDocumentCategory = 'product' | 'service' | 'businessModel' | 'businessPlan' | 'general'

export interface SubsidiaryDocument {
  _id: string
  category: SubsidiaryDocumentCategory
  label: string
  originalName: string
  mimeType: string
  size: number
  uploadedAt: string
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
  productDescription: string
  serviceDescription: string
  businessModel: string
  businessPlan: string
  sections: SubsidiarySection[]
  documents: SubsidiaryDocument[]
  infos: SubsidiaryInfo[]
  contacts: SubsidiaryContact[]
  credentials: SubsidiaryCredential[]
  accentColor: string
  logoUrl?: string
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

export const LINK_TYPE_LABELS: Record<SubsidiaryLinkType, string> = {
  repo: 'Repo GitHub',
  production: 'Production',
  staging: 'Staging',
  analytics: 'Analytics',
  hosting: 'Hébergement',
  dns: 'DNS / domaine',
  ci: 'CI / CD',
  design: 'Design',
  docs: 'Documentation',
  drive: 'Drive / fichiers',
  other: 'Autre lien',
}

export const CREDENTIAL_CATEGORY_LABELS: Record<SubsidiaryCredentialCategory, string> = {
  admin: 'Admin',
  service: 'Compte de service',
  api: 'Clé API',
  db: 'Base de données',
  other: 'Autre',
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
