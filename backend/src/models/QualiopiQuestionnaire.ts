import mongoose from 'mongoose'
import crypto from 'crypto'
import type { IQualiopiQuestionnaire } from '../types/models.js'

const answerSchema = new mongoose.Schema({
  questionIndex: { type: Number, required: true },
  value: { type: String, default: '' },
}, { _id: false })

const responseSchema = new mongoose.Schema({
  respondentName: { type: String, required: true, trim: true },
  respondentEmail: { type: String, required: true, trim: true },
  formation: { type: String, default: '', trim: true },
  answers: [answerSchema],
  submittedAt: { type: Date, default: Date.now },
}, { _id: true })

const questionSchema = new mongoose.Schema({
  type: { type: String, enum: ['rating', 'text', 'multiple_choice'], required: true },
  label: { type: String, required: true, trim: true },
  options: [{ type: String, trim: true }],
  required: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
}, { _id: true })

const qualiopiQuestionnaireSchema = new mongoose.Schema<IQualiopiQuestionnaire>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    questions: [questionSchema],
    active: { type: Boolean, default: true },
    token: { type: String, default: () => crypto.randomBytes(24).toString('hex') },
    responses: [responseSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

qualiopiQuestionnaireSchema.index({ token: 1 })

export default mongoose.model<IQualiopiQuestionnaire>('QualiopiQuestionnaire', qualiopiQuestionnaireSchema)
