import mongoose from 'mongoose'

/**
 * Filiale — business interne du groupe Venio (Yumi, Arrow, Jiraya…).
 * Espace réservé au SUPER_ADMIN : centralise les infos clés de chaque entité.
 * Données hybrides : champs saisis manuellement + agrégation depuis l'existant
 * (projets internes liés via `linkedEntity`, équipe via `team`).
 */

export const SUBSIDIARY_STATUSES = ['ACTIVE', 'INCUBATION', 'PAUSE', 'ARCHIVED'] as const
export const SUBSIDIARY_HEALTHS = ['GOOD', 'WATCH', 'RISK'] as const

export type SubsidiaryStatus = (typeof SUBSIDIARY_STATUSES)[number]
export type SubsidiaryHealth = (typeof SUBSIDIARY_HEALTHS)[number]

export const LINK_TYPES = [
  'repo',
  'production',
  'staging',
  'analytics',
  'hosting',
  'dns',
  'ci',
  'design',
  'docs',
  'drive',
  'other',
] as const
export type SubsidiaryLinkType = (typeof LINK_TYPES)[number]

export interface ISubsidiaryLink {
  type: SubsidiaryLinkType
  label: string
  url: string
  icon?: string
}

/** Paire libre clé → valeur (SIRET, banque, stack, abonnement…). */
export interface ISubsidiaryInfo {
  label: string
  value: string
}

/** Contact clé rattaché à la filiale. */
export interface ISubsidiaryContact {
  name: string
  role: string
  email: string
  phone: string
  notes: string
}

export const CREDENTIAL_CATEGORIES = ['admin', 'service', 'api', 'db', 'other'] as const
export type SubsidiaryCredentialCategory = (typeof CREDENTIAL_CATEGORIES)[number]

/** Identifiant stocké dans le coffre — le secret est chiffré au repos. */
export interface ISubsidiaryCredential {
  category: SubsidiaryCredentialCategory
  label: string
  username: string
  /** Secret chiffré (AES-GCM). Jamais renvoyé tel quel : voir route /reveal. */
  secretEnc: string
  url: string
  notes: string
}

export interface ISubsidiaryAlert {
  label: string
  level: 'INFO' | 'WARNING' | 'CRITICAL'
}

export interface ISubsidiaryKpis {
  caMtd: number // CA du mois en cours (€)
  caMtdDelta: number // variation vs mois précédent (%)
  margin: number // marge (%)
  marginTarget: number // objectif de marge (%)
  treasury: number // trésorerie (€)
  runwayMonths: number // runway estimé (mois)
  headcount: number // effectif saisi (fallback si pas d'équipe liée)
  headcountTarget: number
}

export interface ISubsidiaryObjective {
  label: string
  current: number
  target: number
  unit: string
}

/** Section libre du dossier (ex. « Roadmap », « Concurrence », « Risques »). */
export interface ISubsidiarySection {
  title: string
  content: string
}

/** Catégories de pièces jointes — rattachées à une partie du dossier. */
export const DOCUMENT_CATEGORIES = ['product', 'service', 'businessModel', 'businessPlan', 'general'] as const
export type SubsidiaryDocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export interface ISubsidiaryDocument {
  category: SubsidiaryDocumentCategory
  label: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  uploadedBy: mongoose.Types.ObjectId
  uploadedAt: Date
}

export interface ISubsidiary {
  name: string
  slug: string
  tagline: string
  sector: string
  status: SubsidiaryStatus
  health: SubsidiaryHealth
  description: string
  /** Dossier — descriptions longues pour comprendre et suivre l'activité. */
  productDescription: string
  serviceDescription: string
  businessModel: string
  businessPlan: string
  sections: ISubsidiarySection[]
  documents: ISubsidiaryDocument[]
  infos: ISubsidiaryInfo[]
  contacts: ISubsidiaryContact[]
  credentials: ISubsidiaryCredential[]
  accentColor: string
  lead: mongoose.Types.ObjectId | null
  foundedYear: number | null
  /** Nom d'entité projets internes (InternalProject.entity) pour l'agrégation auto. */
  linkedEntity: string
  team: mongoose.Types.ObjectId[]
  kpis: ISubsidiaryKpis
  objective: ISubsidiaryObjective
  links: ISubsidiaryLink[]
  alerts: ISubsidiaryAlert[]
  tags: string[]
  order: number
  archived: boolean
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const linkSchema = new mongoose.Schema<ISubsidiaryLink>(
  {
    type: { type: String, enum: LINK_TYPES, default: 'other' },
    label: { type: String, required: true },
    url: { type: String, required: true },
    icon: { type: String, default: '' },
  },
  { _id: false },
)

const infoSchema = new mongoose.Schema<ISubsidiaryInfo>(
  {
    label: { type: String, required: true },
    value: { type: String, default: '' },
  },
  { _id: true },
)

const contactSchema = new mongoose.Schema<ISubsidiaryContact>(
  {
    name: { type: String, required: true },
    role: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { _id: true },
)

const credentialSchema = new mongoose.Schema<ISubsidiaryCredential>(
  {
    category: { type: String, enum: CREDENTIAL_CATEGORIES, default: 'admin' },
    label: { type: String, required: true },
    username: { type: String, default: '' },
    secretEnc: { type: String, default: '' },
    url: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { _id: true },
)

const sectionSchema = new mongoose.Schema<ISubsidiarySection>(
  {
    title: { type: String, required: true },
    content: { type: String, default: '' },
  },
  { _id: false },
)

const documentSchema = new mongoose.Schema<ISubsidiaryDocument>(
  {
    category: { type: String, enum: DOCUMENT_CATEGORIES, default: 'general' },
    label: { type: String, default: '' },
    originalName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
)

const alertSchema = new mongoose.Schema<ISubsidiaryAlert>(
  {
    label: { type: String, required: true },
    level: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'INFO' },
  },
  { _id: false },
)

const schema = new mongoose.Schema<ISubsidiary>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    tagline: { type: String, default: '' },
    sector: { type: String, default: '' },
    status: { type: String, enum: SUBSIDIARY_STATUSES, default: 'INCUBATION' },
    health: { type: String, enum: SUBSIDIARY_HEALTHS, default: 'WATCH' },
    description: { type: String, default: '' },
    productDescription: { type: String, default: '' },
    serviceDescription: { type: String, default: '' },
    businessModel: { type: String, default: '' },
    businessPlan: { type: String, default: '' },
    sections: { type: [sectionSchema], default: [] },
    documents: { type: [documentSchema], default: [] },
    infos: { type: [infoSchema], default: [] },
    contacts: { type: [contactSchema], default: [] },
    credentials: { type: [credentialSchema], default: [] },
    accentColor: { type: String, default: '#0ea5e9' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    foundedYear: { type: Number, default: null },
    linkedEntity: { type: String, default: '' },
    team: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    kpis: {
      caMtd: { type: Number, default: 0 },
      caMtdDelta: { type: Number, default: 0 },
      margin: { type: Number, default: 0 },
      marginTarget: { type: Number, default: 0 },
      treasury: { type: Number, default: 0 },
      runwayMonths: { type: Number, default: 0 },
      headcount: { type: Number, default: 0 },
      headcountTarget: { type: Number, default: 0 },
    },
    objective: {
      label: { type: String, default: '' },
      current: { type: Number, default: 0 },
      target: { type: Number, default: 0 },
      unit: { type: String, default: '' },
    },
    links: { type: [linkSchema], default: [] },
    alerts: { type: [alertSchema], default: [] },
    tags: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
)

schema.index({ slug: 1 }, { unique: true })

export default mongoose.model<ISubsidiary>('Subsidiary', schema)
