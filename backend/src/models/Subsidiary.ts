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

export interface ISubsidiaryLink {
  label: string
  url: string
  icon?: string
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
    label: { type: String, required: true },
    url: { type: String, required: true },
    icon: { type: String, default: '' },
  },
  { _id: false },
)

const sectionSchema = new mongoose.Schema<ISubsidiarySection>(
  {
    title: { type: String, required: true },
    content: { type: String, default: '' },
  },
  { _id: false },
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
