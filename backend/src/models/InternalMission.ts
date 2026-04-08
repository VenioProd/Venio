import mongoose from 'mongoose'

export interface IInternalMission {
  title: string
  description: string
  assignedTo: mongoose.Types.ObjectId
  internalProject: mongoose.Types.ObjectId
  status: 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
  progress: number
  dueDate: Date | null
  steps: { title: string; done: boolean; waitingReview: boolean; _id?: any }[]
  files: { originalName: string; storagePath: string; mimeType: string; size: number; uploadedBy: mongoose.Types.ObjectId; _id?: any }[]
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
    progress: { type: Number, default: 0, min: 0, max: 100 },
    dueDate: { type: Date, default: null },
    steps: [{
      title: { type: String, required: true },
      done: { type: Boolean, default: false },
      waitingReview: { type: Boolean, default: false },
    }],
    files: [{
      originalName: { type: String, required: true },
      storagePath: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, default: 0 },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model<IInternalMission>('InternalMission', schema)
