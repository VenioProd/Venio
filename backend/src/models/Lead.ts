import { syncTombstones } from '../lib/syncTombstones.js'
import mongoose from 'mongoose'
import type { ILead } from '../types/models/index.js'
import { createNotification } from '../lib/notifications.js'
import logger from '../lib/logger.js'

// Projet / produit concerné par le lead. Vide pour les leads historiques.
export const LEAD_PROJECTS = ['ARTOSERA', 'VIGNO', 'ARROW', 'VENIO', 'AUTRE'] as const

const leadSchema = new mongoose.Schema<ILead>(
  {
    company: { type: String, required: true, trim: true },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    source: { type: String, default: '' },
    project: { type: String, enum: ['', ...LEAD_PROJECTS], default: '' },
    // Provenance de migration, indépendante des notes éditables. Absente des leads ordinaires.
    legacyArrowSchoolId: { type: mongoose.Schema.Types.ObjectId, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST'],
      default: 'LEAD',
    },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    budget: { type: Number, default: null },
    nextActionAt: { type: Date, default: null },
    followUpNotifiedFor: { type: Date, default: null },
    lastContactAt: { type: Date, default: null },
    notes: { type: String, default: '' },
    serviceType: { type: String, default: '' }, // Type de service proposé
    leadTemperature: {
      type: String,
      enum: ['FROID', 'TIEDE', 'CHAUD', 'TRES_CHAUD'],
      default: 'TIEDE',
    },
    interactionNotes: { type: String, default: '' }, // Notes détaillées des interactions
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Les demandes publiques sont créées par le système, sans utilisateur interne.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    statusChangedAt: { type: Date, default: null },
    clientAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Commercial externe crédité du lead : son seul accès au CRM passe par ce champ.
    externalRep: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Passage de main au closer ; le commercial externe garde la lecture.
    closingHandoff: {
      type: new mongoose.Schema(
        {
          at: { type: Date, required: true },
          to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          // Notes telles que l'externe les a laissées : seules celles-ci lui restent visibles.
          repNotes: { type: String, default: '' },
        },
        { _id: false },
      ),
      default: null,
    },
    score: { type: Number, default: null }, // Lead scoring (0-100)
    // Motif de perte : exigé par l'interface, accepté vide par l'API pour ne
    // pas casser l'agent ni les automatisations qui passent des leads à LOST.
    lostReason: { type: String, default: '' },
    lostComment: { type: String, default: '' },
    // Enrichissement CRM : valeur pondérée, classement et suivi d'activité.
    probability: { type: Number, min: 0, max: 100, default: null },
    expectedCloseAt: { type: Date, default: null },
    tags: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    sourceDetail: { type: String, default: '', maxlength: 300 },
    utm: { type: mongoose.Schema.Types.Mixed, default: null },
    sector: { type: String, default: '', maxlength: 80 },
    companySize: { type: String, default: '', maxlength: 40 },
    nextActionLabel: { type: String, default: '', maxlength: 200 },
    nextActionType: { type: String, enum: ['', 'CALL', 'EMAIL', 'MEETING', 'TASK', 'OTHER'], default: '' },
    // Dénormalisés depuis Interaction (lastContactAt reste la date saisie à la main).
    lastInteractionAt: { type: Date, default: null },
    interactionsCount: { type: Number, default: 0 },
    archivedAt: { type: Date, default: null },
    // Suspend les règles d'automatisation pour ce seul lead.
    automationPausedAt: { type: Date, default: null },
    // Posé une seule fois, atomiquement, par la conversion d'un lead gagné (crmClientConversion) : verrou d'idempotence.
    wonProcessedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// Probabilité par défaut selon l'étape, appliquée tant que personne ne l'a fixée à la main.
export const STATUS_PROBABILITY: Record<string, number> = {
  LEAD: 10,
  QUALIFIED: 25,
  CONTACTED: 35,
  DEMO: 50,
  PROPOSAL: 65,
  WON: 100,
  LOST: 0,
}

leadSchema.pre('validate', function () {
  if (this.probability == null || (this.isModified('status') && !this.isModified('probability') && !this.isNew)) {
    this.probability = STATUS_PROBABILITY[this.status] ?? 10
  }
})

// Le modèle couvre aussi les sauvegardes de l'API agent et du planificateur.
leadSchema.pre('save', async function () {
  this.$locals.assignmentChanged = false
  if (!this.isModified('assignedTo') || !this.assignedTo) return
  const previous = this.isNew
    ? null
    : await (this.constructor as mongoose.Model<ILead>).findById(this._id).select('assignedTo').lean()
  this.$locals.assignmentChanged = String(previous?.assignedTo || '') !== String(this.assignedTo)
})
leadSchema.post('save', async function (lead) {
  if (!lead.$locals.assignmentChanged) return
  lead.$locals.assignmentChanged = false
  if (!lead.assignedTo || String(lead.assignedTo) === lead.$locals.assignmentActorId) return
  await createNotification({
    recipient: lead.assignedTo,
    type: 'CRM_LEAD_ASSIGNED',
    title: 'Lead assigné',
    message: `${lead.company}${lead.contactName ? ` — ${lead.contactName}` : ''}`,
    link: `/admin/crm/leads/${lead._id}`,
    metadata: { leadId: String(lead._id) },
  }).catch(() => logger.warn('[crm] Échec notification d’assignation'))
})

leadSchema.index({ status: 1, priority: 1 })
leadSchema.index({ assignedTo: 1, nextActionAt: 1 })
leadSchema.index({ company: 1 })
leadSchema.index({ project: 1 })
leadSchema.index({ clientAccountId: 1 })
leadSchema.index({ externalRep: 1, updatedAt: -1 })
leadSchema.index({ archivedAt: 1, status: 1 })
leadSchema.index({ tags: 1 })
leadSchema.index({ score: -1 }) // Index for sorting by score
leadSchema.index({ status: 1, createdAt: -1 }) // Cohortes du pilotage

syncTombstones(leadSchema, 'leads')

export default mongoose.model<ILead>('Lead', leadSchema)
