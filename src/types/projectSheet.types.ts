// Fiches projets : réceptacle de connaissance par filiale / projet du groupe.

export const PROJECT_SHEET_STATUSES = ['ACTIVE', 'LAUNCHING', 'PAUSED'] as const
export type ProjectSheetStatus = (typeof PROJECT_SHEET_STATUSES)[number]

export const PROJECT_SHEET_REVIEW_STATUSES = ['DRAFT', 'TO_COMPLETE', 'VALIDATED'] as const
export type ProjectSheetReviewStatus = (typeof PROJECT_SHEET_REVIEW_STATUSES)[number]

export const PROJECT_SHEET_ENTITIES = ['VENIO', 'CREATIO', 'DECISIO', 'FORMATIO', 'ARROW'] as const
export type ProjectSheetEntity = (typeof PROJECT_SHEET_ENTITIES)[number]

export const PROJECT_SHEET_LINK_TYPES = ['repo', 'app', 'docs', 'nextcloud', 'design', 'other'] as const
export type ProjectSheetLinkType = (typeof PROJECT_SHEET_LINK_TYPES)[number]

/** Sections rédigées en Markdown. */
export const PROJECT_SHEET_MARKDOWN_KEYS = [
  'whatWeDo',
  'audience',
  'positioning',
  'brandVoice',
  'offers',
  'keyFigures',
  'stack',
  'roadmap',
  'decisions',
  'prospectFaq',
  'glossary',
] as const
export type ProjectSheetMarkdownKey = (typeof PROJECT_SHEET_MARKDOWN_KEYS)[number]

export interface ProjectSheetWebsite {
  label: string
  url: string
}

export interface ProjectSheetLink {
  type: ProjectSheetLinkType
  label: string
  url: string
}

export interface ProjectSheetPerson {
  _id: string
  name: string
  email?: string
  role?: string
}

export interface ProjectSheetTeamMember {
  user: ProjectSheetPerson
  role: string
}

export interface ProjectSheetDevProject {
  _id: string
  key: string
  name: string
  href?: string
}

export interface ProjectSheetCrm {
  entity?: string | null
  leadProject?: string | null
  openLeads: number
  wonLeads: number
  href: string
}

/** Accès démo : le mot de passe n'est jamais présent, seulement hasPassword. */
export interface ProjectSheetDemoAccess {
  _id: string
  url: string
  role: string
  username: string
  notes: string
  hasPassword: boolean
  updatedAt?: string
}

export interface ProjectSheetHistoryEntry {
  at: string
  by: { _id: string; name: string } | null
  fields: string[]
  summary: string
}

export interface ProjectSheetMatch {
  field: string
  excerpt: string
}

export interface ProjectSheetListItem {
  _id: string
  slug: string
  name: string
  logoUrl?: string
  accentColor?: string
  status: ProjectSheetStatus
  reviewStatus: ProjectSheetReviewStatus
  archived: boolean
  oneLiner: string
  legalEntity?: ProjectSheetEntity | '' | null
  referent: { _id: string; name: string } | null
  updatedAt: string
  matches?: ProjectSheetMatch[]
}

export interface ProjectSheetListResponse {
  sheets: ProjectSheetListItem[]
  canEdit: boolean
}

export type ProjectSheet = {
  _id: string
  slug: string
  name: string
  logoUrl?: string
  accentColor?: string
  status: ProjectSheetStatus
  reviewStatus: ProjectSheetReviewStatus
  archived: boolean
  oneLiner: string
  websites: ProjectSheetWebsite[]
  legalEntity?: ProjectSheetEntity | '' | null
  leadProject?: string | null
  links: ProjectSheetLink[]
  referent: ProjectSheetPerson | null
  team: ProjectSheetTeamMember[]
  devProject: ProjectSheetDevProject | null
  /** Présent seulement pour SUPER_ADMIN. */
  subsidiaryHref: string | null
  demoAccesses: ProjectSheetDemoAccess[]
  crm: ProjectSheetCrm | null
  history: ProjectSheetHistoryEntry[]
  canEdit: boolean
  canReveal: boolean
  createdAt: string
  updatedAt: string
} & Record<ProjectSheetMarkdownKey, string>

export interface ProjectSheetMeta {
  statuses: ProjectSheetStatus[]
  reviewStatuses: ProjectSheetReviewStatus[]
  entities: ProjectSheetEntity[]
  leadProjects: string[]
  linkTypes: ProjectSheetLinkType[]
  sectionKeys: string[]
  canEdit: boolean
  canReveal: boolean
  /** Présents seulement pour les éditeurs. */
  members?: ProjectSheetPerson[]
  devProjects?: ProjectSheetDevProject[]
}

export interface DemoAccessInput {
  url: string
  role: string
  username: string
  password?: string
  notes: string
}
