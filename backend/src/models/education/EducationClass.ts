import mongoose, { Schema } from 'mongoose'

export const CLASS_STATUSES = ['ACTIVE', 'PAUSE', 'TERMINE', 'ARCHIVE'] as const
export type EducationClassStatus = (typeof CLASS_STATUSES)[number]

/** Types de propriétés flexibles (façon « properties » Notion). */
export const CLASS_PROPERTY_TYPES = ['text', 'number', 'date', 'select', 'url', 'checkbox'] as const
export type ClassPropertyType = (typeof CLASS_PROPERTY_TYPES)[number]

export interface IClassProperty {
  id: string
  label: string
  type: ClassPropertyType
  value: string
}

export interface IEducationClass {
  owner: mongoose.Types.ObjectId
  name: string
  /** Emoji d'icône de page (façon Notion). */
  emoji: string
  /** URL ou gradient CSS de la bannière de couverture. */
  cover: string
  school: string
  level: string
  program: string
  period: { start: Date | null; end: Date | null }
  weeklyHours: number | null
  totalHours: number | null
  status: EducationClassStatus
  color: string
  tags: string[]
  /** Propriétés personnalisées clé/valeur (en plus des champs structurés). */
  properties: IClassProperty[]
  /** Note servant de page racine (corps de la classe, canvas de blocs). */
  homeNote: mongoose.Types.ObjectId | null
  notes: string
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationClass>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: '' },
    cover: { type: String, default: '' },
    school: { type: String, default: '', trim: true },
    level: { type: String, default: '', trim: true },
    program: { type: String, default: '', trim: true },
    period: {
      start: { type: Date, default: null },
      end: { type: Date, default: null },
    },
    weeklyHours: { type: Number, default: null },
    totalHours: { type: Number, default: null },
    status: { type: String, enum: CLASS_STATUSES, default: 'ACTIVE', index: true },
    color: { type: String, default: '#22C55E' },
    tags: { type: [String], default: [] },
    properties: {
      type: [
        {
          id: { type: String, required: true },
          label: { type: String, default: '' },
          type: { type: String, enum: CLASS_PROPERTY_TYPES, default: 'text' },
          value: { type: String, default: '' },
        },
      ],
      default: [],
    },
    homeNote: { type: Schema.Types.ObjectId, ref: 'EducationNote', default: null },
    notes: { type: String, default: '' },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
)

schema.index({ owner: 1, status: 1, deletedAt: 1 })
schema.index({ name: 'text', school: 'text', program: 'text', notes: 'text' })

export default mongoose.model<IEducationClass>('EducationClass', schema)
