import mongoose from 'mongoose'
import { LEAD_PROJECTS } from './Lead.js'
import { GROUP_ENTITIES } from '../lib/groupEntities.js'
import { isWebUrl } from './Subsidiary.js'

/**
 * Fiche projet — réceptacle de connaissance sur un projet ou une filiale du
 * groupe (Venio, Arrow, Creatio, Virendys…), lisible par toute l'équipe
 * interne et éditable par SUPER_ADMIN / ADMIN.
 *
 * À ne pas confondre avec :
 *  - `Subsidiary` : dossier de pilotage réservé au SUPER_ADMIN (trésorerie,
 *    KPIs, coffre d'identifiants réels). Une fiche peut y être reliée
 *    (`subsidiary`), mais n'en recopie jamais les données confidentielles ;
 *  - `Project` : projets clients ;
 *  - la « fiche projet » PDF de la comptabilité (`projectSheetPdf`).
 *
 * Le contenu éditorial est du Markdown, rendu côté front sans HTML brut.
 * Les mots de passe des accès démo sont chiffrés au repos (secretBox) et
 * exclus des requêtes par défaut (`select: false`).
 */

export const PROJECT_SHEET_STATUSES = ['ACTIVE', 'LAUNCHING', 'PAUSED'] as const
export type ProjectSheetStatus = (typeof PROJECT_SHEET_STATUSES)[number]

/** Relecture : brouillon pré-rempli, fiche vide à compléter, fiche validée. */
export const PROJECT_SHEET_REVIEW_STATUSES = ['DRAFT', 'TO_COMPLETE', 'VALIDATED'] as const
export type ProjectSheetReviewStatus = (typeof PROJECT_SHEET_REVIEW_STATUSES)[number]

export const PROJECT_SHEET_LINK_TYPES = ['repo', 'app', 'docs', 'nextcloud', 'design', 'other'] as const
export type ProjectSheetLinkType = (typeof PROJECT_SHEET_LINK_TYPES)[number]

/** Sections éditoriales (Markdown), dans l'ordre de lecture de la fiche. */
export const PROJECT_SHEET_SECTIONS = [
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
export type ProjectSheetSection = (typeof PROJECT_SHEET_SECTIONS)[number]

export const SECTION_MAX_LENGTH = 20_000
export const ONE_LINER_MAX_LENGTH = 300
export const HISTORY_LIMIT = 200

export interface IProjectSheetWebsite {
  label: string
  url: string
}
export interface IProjectSheetLink {
  type: ProjectSheetLinkType
  label: string
  url: string
}
export interface IProjectSheetMember {
  user: mongoose.Types.ObjectId
  role: string
}
/** Accès à un environnement de démonstration (données fictives uniquement). */
export interface IProjectSheetDemoAccess {
  _id: mongoose.Types.ObjectId
  url: string
  role: string
  username: string
  /** Chiffré (AES-256-GCM, secretBox). Jamais renvoyé : voir la route /reveal. */
  passwordEnc: string
  notes: string
  updatedAt: Date
  updatedBy: mongoose.Types.ObjectId | null
}
/** Entrée d'historique : qui, quand, quels champs. Jamais de valeur. */
export interface IProjectSheetHistory {
  at: Date
  by: mongoose.Types.ObjectId | null
  fields: string[]
  summary: string
}

export type IProjectSheetSections = Record<ProjectSheetSection, string>

export interface IProjectSheet extends IProjectSheetSections {
  slug: string
  name: string
  logoUrl: string
  accentColor: string
  status: ProjectSheetStatus
  reviewStatus: ProjectSheetReviewStatus
  archived: boolean
  oneLiner: string
  websites: IProjectSheetWebsite[]
  legalEntity: (typeof GROUP_ENTITIES)[number] | ''
  leadProject: (typeof LEAD_PROJECTS)[number] | ''
  links: IProjectSheetLink[]
  referent: mongoose.Types.ObjectId | null
  team: IProjectSheetMember[]
  devProject: mongoose.Types.ObjectId | null
  subsidiary: mongoose.Types.ObjectId | null
  demoAccesses: IProjectSheetDemoAccess[]
  history: IProjectSheetHistory[]
  createdBy: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const text = (maxlength: number) => ({ type: String, default: '', trim: true, maxlength })
const webUrl = (required = false) => ({
  ...text(2000),
  required,
  validate: { validator: isWebUrl, message: 'URL HTTP/HTTPS invalide' },
})
const maxItems = (max: number) => ({
  validator: (v: unknown[]) => v.length <= max,
  message: `Maximum ${max} entrées`,
})

const websiteSchema = new mongoose.Schema<IProjectSheetWebsite>({ label: text(120), url: webUrl(true) }, { _id: false })
const linkSchema = new mongoose.Schema<IProjectSheetLink>(
  {
    type: { type: String, enum: PROJECT_SHEET_LINK_TYPES, default: 'other' },
    label: { ...text(160), required: true },
    url: webUrl(true),
  },
  { _id: false },
)
const memberSchema = new mongoose.Schema<IProjectSheetMember>(
  { user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, role: text(160) },
  { _id: false },
)
const demoAccessSchema = new mongoose.Schema<IProjectSheetDemoAccess>(
  {
    url: webUrl(),
    role: text(160),
    username: text(320),
    passwordEnc: { type: String, default: '', select: false },
    notes: text(2000),
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: true },
)
const historySchema = new mongoose.Schema<IProjectSheetHistory>(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    fields: { type: [String], default: [] },
    summary: text(300),
  },
  { _id: false },
)

const sectionFields = Object.fromEntries(PROJECT_SHEET_SECTIONS.map((key) => [key, text(SECTION_MAX_LENGTH)]))

const schema = new mongoose.Schema<IProjectSheet>(
  {
    ...sectionFields,
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    name: { ...text(120), required: true },
    logoUrl: webUrl(),
    accentColor: {
      type: String,
      default: '#0ea5e9',
      validate: { validator: (v: string) => !v || /^#[0-9a-fA-F]{6}$/.test(v), message: 'Couleur #RRGGBB attendue' },
    },
    status: { type: String, enum: PROJECT_SHEET_STATUSES, default: 'LAUNCHING' },
    reviewStatus: { type: String, enum: PROJECT_SHEET_REVIEW_STATUSES, default: 'TO_COMPLETE' },
    archived: { type: Boolean, default: false },
    oneLiner: text(ONE_LINER_MAX_LENGTH),
    websites: { type: [websiteSchema], default: [], validate: maxItems(20) },
    legalEntity: { type: String, enum: ['', ...GROUP_ENTITIES], default: '' },
    leadProject: { type: String, enum: ['', ...LEAD_PROJECTS], default: '' },
    links: { type: [linkSchema], default: [], validate: maxItems(50) },
    referent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    team: { type: [memberSchema], default: [], validate: maxItems(100) },
    devProject: { type: mongoose.Schema.Types.ObjectId, ref: 'DevProject', default: null },
    subsidiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Subsidiary', default: null },
    demoAccesses: { type: [demoAccessSchema], default: [], validate: maxItems(50) },
    history: { type: [historySchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

schema.index({ slug: 1 }, { unique: true })
// Une filiale du dossier SUPER_ADMIN a au plus une fiche.
schema.index({ subsidiary: 1 }, { unique: true, partialFilterExpression: { subsidiary: { $type: 'objectId' } } })

export default mongoose.model<IProjectSheet>('ProjectSheet', schema)
