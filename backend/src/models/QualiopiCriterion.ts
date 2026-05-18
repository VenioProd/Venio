import mongoose from 'mongoose'
import type { IQualiopiCriterion } from '../types/models/index.js'

const fileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storagePath: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true })

const subElementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  status: { type: String, enum: ['A_FAIRE', 'EN_COURS', 'FAIT', 'BLOQUE', 'NON_CONCERNE'], default: 'A_FAIRE' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dueDate: { type: Date, default: null },
  files: [fileSchema],
  notes: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: true })

const indicatorSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  title: { type: String, required: true, trim: true },
  status: { type: String, enum: ['A_FAIRE', 'EN_COURS', 'FAIT', 'BLOQUE', 'NON_CONCERNE'], default: 'A_FAIRE' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  subElements: [subElementSchema],
  files: [fileSchema],
  order: { type: Number, default: 0 },
}, { _id: true })

const qualiopiCriterionSchema = new mongoose.Schema<IQualiopiCriterion>(
  {
    number: { type: Number, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    objective: { type: String, default: '' },
    indicators: [indicatorSchema],
  },
  { timestamps: true }
)

export default mongoose.model<IQualiopiCriterion>('QualiopiCriterion', qualiopiCriterionSchema)
