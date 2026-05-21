import mongoose, { Schema } from 'mongoose'

export const NOTE_LINK_TYPES = ['class', 'session', 'assignment', 'student'] as const
export type NoteLinkType = typeof NOTE_LINK_TYPES[number]

/**
 * Block-light editor. Chaque note contient une liste de blocs typés.
 * V1: types simples (heading, paragraph, checklist, link, code, divider, callout).
 * On garde aussi un champ `markdown` plain en miroir pour la recherche full-text.
 */
export const NOTE_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'checklist',
  'bullet',
  'numbered',
  'quote',
  'callout',
  'code',
  'divider',
  'link',
] as const
export type NoteBlockType = typeof NOTE_BLOCK_TYPES[number]

export interface INoteBlock {
  id: string
  type: NoteBlockType
  text: string
  checked: boolean
  level: number
  meta: Record<string, unknown>
}

export interface INoteLink {
  type: NoteLinkType
  refId: mongoose.Types.ObjectId
}

export interface INoteSource {
  provider: string
  id: string
  url: string
  lastEditedTime: Date | null
}

export interface IEducationNote {
  owner: mongoose.Types.ObjectId
  title: string
  emoji: string
  cover: string
  blocks: INoteBlock[]
  markdown: string
  links: INoteLink[]
  tags: string[]
  pinned: boolean
  archived: boolean
  source: INoteSource | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationNote>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: '', trim: true },
    emoji: { type: String, default: '' },
    cover: { type: String, default: '' },
    blocks: {
      type: [
        {
          id: { type: String, required: true },
          type: { type: String, enum: NOTE_BLOCK_TYPES, required: true },
          text: { type: String, default: '' },
          checked: { type: Boolean, default: false },
          level: { type: Number, default: 1 },
          meta: { type: Schema.Types.Mixed, default: {} },
        },
      ],
      default: [],
    },
    markdown: { type: String, default: '' },
    links: {
      type: [
        {
          type: { type: String, enum: NOTE_LINK_TYPES, required: true },
          refId: { type: Schema.Types.ObjectId, required: true },
        },
      ],
      default: [],
    },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false, index: true },
    archived: { type: Boolean, default: false, index: true },
    source: {
      type: new Schema<INoteSource>(
        {
          provider: { type: String, default: '' },
          id: { type: String, default: '' },
          url: { type: String, default: '' },
          lastEditedTime: { type: Date, default: null },
        },
        { _id: false }
      ),
      default: null,
    },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, archived: 1, pinned: -1, updatedAt: -1, deletedAt: 1 })
schema.index({ 'links.type': 1, 'links.refId': 1 })
schema.index({ title: 'text', markdown: 'text' })
schema.index({ owner: 1, 'source.provider': 1, 'source.id': 1 })

export default mongoose.model<IEducationNote>('EducationNote', schema)
