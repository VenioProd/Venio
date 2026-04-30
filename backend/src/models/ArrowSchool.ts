import mongoose from 'mongoose'

const arrowSchoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolType: {
      type: String,
      enum: ['LYCEE', 'BTS_IUT', 'UNIVERSITE', 'ECOLE_SUP', 'CFA', 'AUTRE'],
      default: 'AUTRE',
    },
    city: { type: String, default: '' },
    region: { type: String, default: '' },
    studentCount: { type: Number, default: null },
    emailGeneral: { type: String, default: '' },
    // Contact référent
    contactName: { type: String, default: '' },
    contactRole: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    // Pipeline
    status: {
      type: String,
      enum: ['A_PROSPECTER', 'CONTACTE', 'REPONSE', 'DEMO_PLANIFIEE', 'DEMO_FAITE', 'PROPOSITION', 'SIGNE', 'NON_INTERESSE'],
      default: 'A_PROSPECTER',
    },
    temperature: {
      type: String,
      enum: ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'],
      default: 'TIEDE',
    },
    source: { type: String, default: '' },
    notes: { type: String, default: '' },
    nextActionAt: { type: Date, default: null },
    lastContactAt: { type: Date, default: null },
    statusChangedAt: { type: Date, default: null },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
)

arrowSchoolSchema.index({ status: 1 })
arrowSchoolSchema.index({ assignedTo: 1 })
arrowSchoolSchema.index({ name: 1 })
arrowSchoolSchema.index({ isArchived: 1 })

export default mongoose.model('ArrowSchool', arrowSchoolSchema)
