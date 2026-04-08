import mongoose from 'mongoose'

export const ENTITIES = ['Venio', 'Creatio', 'Decisio', 'Formatio', 'Arrow'] as const
export const POLES = ['Dev', 'Design', 'Marketing', 'Communication', 'Commercial', 'Direction', 'RH', 'Formation'] as const

export type Entity = typeof ENTITIES[number]
export type Pole = typeof POLES[number]

export interface IInternalProject {
  name: string
  description: string
  entity: string
  poles: string[]
  members: mongoose.Types.ObjectId[]
  status: 'EN_COURS' | 'EN_ATTENTE' | 'TERMINE' | 'ARCHIVE'
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  startDate: Date | null
  endDate: Date | null
  tags: string[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const schema = new mongoose.Schema<IInternalProject>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    entity: { type: String, required: true },
    poles: { type: [String], default: [] },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['EN_COURS', 'EN_ATTENTE', 'TERMINE', 'ARCHIVE'],
      default: 'EN_COURS',
    },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model<IInternalProject>('InternalProject', schema)
