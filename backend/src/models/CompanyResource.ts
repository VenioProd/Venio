import mongoose from 'mongoose'

export const RESOURCE_CATEGORIES = [
  'Présentation',
  'Charte graphique',
  'RH',
  'Juridique',
  'Commercial',
  'Formation',
  'Autre',
] as const

export interface ICompanyResource {
  name: string
  description: string
  category: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  uploadedBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const schema = new mongoose.Schema<ICompanyResource>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, default: 'Autre' },
    originalName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

export default mongoose.model<ICompanyResource>('CompanyResource', schema)
