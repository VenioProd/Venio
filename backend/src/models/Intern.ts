import mongoose, { Schema, Document } from 'mongoose'

export interface IIntern extends Document {
  userId: mongoose.Types.ObjectId
  type: 'STAGIAIRE' | 'ALTERNANT'
  poste: string
  departement: string
  dateDebut: Date
  dateFin: Date
  tuteur: mongoose.Types.ObjectId | null
  ecole: string
  formation: string
  notes: string
  joursParSemaine: number
  status: 'ACTIF' | 'TERMINE' | 'ANNULE'
  nextcloudUsername: string
  nextcloudPassword: string
  conventions: { filename: string; originalName: string; size: number; uploadedAt: Date }[]
  createdBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const internSchema = new Schema<IIntern>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['STAGIAIRE', 'ALTERNANT'], default: 'STAGIAIRE' },
    poste: { type: String, required: true, trim: true },
    departement: { type: String, default: '', trim: true },
    dateDebut: { type: Date, required: true },
    dateFin: { type: Date, required: true },
    tuteur: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    ecole: { type: String, default: '', trim: true },
    formation: { type: String, default: '', trim: true },
    notes: { type: String, default: '' },
    joursParSemaine: { type: Number, default: 5, min: 1, max: 7 },
    status: { type: String, enum: ['ACTIF', 'TERMINE', 'ANNULE'], default: 'ACTIF' },
    nextcloudUsername: { type: String, default: '' },
    nextcloudPassword: { type: String, default: '' },
    conventions: {
      type: [{
        filename: { type: String, required: true },
        originalName: { type: String, required: true },
        size: { type: Number, required: true },
        uploadedAt: { type: Date, default: Date.now },
      }],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

internSchema.index({ userId: 1 }, { unique: true })
internSchema.index({ status: 1 })

export default mongoose.model<IIntern>('Intern', internSchema)
