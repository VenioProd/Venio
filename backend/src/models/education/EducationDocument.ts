import mongoose, { Schema } from 'mongoose'

export const DOC_PARENT_TYPES = ['class', 'session', 'assignment', 'submission', 'student', 'note', 'standalone'] as const
export type EducationDocumentParentType = typeof DOC_PARENT_TYPES[number]

// VENIO-46 — BDD documentaire pédagogique : on classe chaque document par
// catégorie pour pouvoir filtrer/grouper (sujet d'examen, rendu étudiant,
// correction, ressource, etc.) sans dépendre du parent legacy.
export const DOC_CATEGORIES = [
  'school_document',
  'student_submission',
  'assignment_submission',
  'exam_subject',
  'assignment_correction',
  'teaching_resource',
  'administrative',
  'other',
] as const
export type EducationDocumentCategory = typeof DOC_CATEGORIES[number]

export const DOC_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const
export type EducationDocumentStatus = typeof DOC_STATUSES[number]

export interface IEducationDocument {
  owner: mongoose.Types.ObjectId
  parentType: EducationDocumentParentType
  parentId: mongoose.Types.ObjectId | null
  category: EducationDocumentCategory
  status: EducationDocumentStatus
  title: string
  description: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  url: string
  school: string
  classId: mongoose.Types.ObjectId | null
  sessionId: mongoose.Types.ObjectId | null
  assignmentId: mongoose.Types.ObjectId | null
  submissionId: mongoose.Types.ObjectId | null
  studentId: mongoose.Types.ObjectId | null
  documentDate: Date | null
  dueDate: Date | null
  tags: string[]
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IEducationDocument>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parentType: { type: String, enum: DOC_PARENT_TYPES, default: 'standalone', index: true },
    parentId: { type: Schema.Types.ObjectId, default: null, index: true },
    category: { type: String, enum: DOC_CATEGORIES, default: 'other', index: true },
    status: { type: String, enum: DOC_STATUSES, default: 'PUBLISHED', index: true },
    title: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    originalName: { type: String, default: '' },
    storagePath: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    url: { type: String, default: '' },
    school: { type: String, default: '', trim: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'EducationClass', default: null, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'EducationSession', default: null, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'EducationAssignment', default: null, index: true },
    submissionId: { type: Schema.Types.ObjectId, ref: 'EducationSubmission', default: null, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'EducationStudent', default: null, index: true },
    documentDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

schema.index({ owner: 1, category: 1, deletedAt: 1 })
schema.index({ owner: 1, school: 1, deletedAt: 1 })
schema.index({ owner: 1, classId: 1, deletedAt: 1 })
schema.index({ owner: 1, parentType: 1, parentId: 1, deletedAt: 1 })
schema.index({ title: 'text', originalName: 'text', description: 'text' })

export default mongoose.model<IEducationDocument>('EducationDocument', schema)
