import mongoose from 'mongoose'

export interface IInternalMission {
  title: string
  description: string
  assignedTo: mongoose.Types.ObjectId
  internalProject: mongoose.Types.ObjectId
  status: 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
  dueDate: Date | null
  steps: { title: string; done: boolean; _id?: any }[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const schema = new mongoose.Schema<IInternalMission>(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    internalProject: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalProject', required: true },
    status: { type: String, enum: ['A_FAIRE', 'EN_COURS', 'TERMINE'], default: 'A_FAIRE' },
    dueDate: { type: Date, default: null },
    steps: [{
      title: { type: String, required: true },
      done: { type: Boolean, default: false },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model<IInternalMission>('InternalMission', schema)
