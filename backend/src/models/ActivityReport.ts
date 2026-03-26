import mongoose, { Schema, Document } from 'mongoose'

export interface IReportFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface IActivityReport extends Document {
  internId: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  date: Date
  contenu: string
  taches: string[]
  attachments: IReportFile[]
  status: 'BROUILLON' | 'SOUMIS' | 'VALIDE'
  commentaireAdmin: string
  validePar: mongoose.Types.ObjectId | null
  valideAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const fileSchema = new Schema<IReportFile>(
  {
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
)

const activityReportSchema = new Schema<IActivityReport>(
  {
    internId: { type: Schema.Types.ObjectId, ref: 'Intern', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    contenu: { type: String, required: true },
    taches: { type: [String], default: [] },
    attachments: { type: [fileSchema], default: [] },
    status: { type: String, enum: ['BROUILLON', 'SOUMIS', 'VALIDE'], default: 'SOUMIS' },
    commentaireAdmin: { type: String, default: '' },
    validePar: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    valideAt: { type: Date, default: null },
  },
  { timestamps: true }
)

activityReportSchema.index({ internId: 1, date: -1 })
activityReportSchema.index({ userId: 1, date: -1 })
activityReportSchema.index({ date: -1 })

export default mongoose.model<IActivityReport>('ActivityReport', activityReportSchema)
