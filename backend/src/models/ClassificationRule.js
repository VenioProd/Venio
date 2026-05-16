import mongoose from 'mongoose'

/**
 * ClassificationRule = règle de mapping comptable appliquée à une transaction
 * externe normalisée. La première règle qui match (par priorité décroissante)
 * détermine le journal, les comptes débit/crédit et l'auto-validation.
 *
 * Conditions évaluées (tous les champs présents sont AND) :
 *   - type           : exact match sur normalizedPayload.type
 *                      (SALE/REFUND/EXPENSE/FEE/PAYMENT/TRANSFER…)
 *   - categoryRegex  : regex sur normalizedPayload.category
 *   - descriptionRegex : regex sur normalizedPayload.description
 *   - amountMin      : montant TTC ≥ amountMin
 *   - amountMax      : montant TTC ≤ amountMax
 *   - currency       : devise exacte (EUR par défaut)
 *   - tagsAll        : la transaction doit contenir TOUS ces tags
 *   - tagsAny        : la transaction doit contenir AU MOINS un de ces tags
 *
 * Mapping appliqué si match :
 *   - journalCode
 *   - debitAccount  / creditAccount  (par défaut)
 *   - vatRateValue  (force le taux TVA)
 *   - useVatFromPayload (booléen — sinon prend vatRateValue ci-dessus)
 *   - labelTemplate (libellé d'écriture, supporte {description}, {externalId}, {date})
 *   - autoValidate  (true → entry status VALIDATED ; false → DRAFT)
 *   - assignToAuxiliary (booléen — crée un compte auxiliaire 411XXX par client)
 */

const ruleConditionSchema = new mongoose.Schema(
  {
    type: { type: String, default: '' },
    categoryRegex: { type: String, default: '' },
    descriptionRegex: { type: String, default: '' },
    amountMin: { type: Number, default: null },
    amountMax: { type: Number, default: null },
    currency: { type: String, default: '' },
    tagsAll: { type: [String], default: [] },
    tagsAny: { type: [String], default: [] },
  },
  { _id: false }
)

const ruleMappingSchema = new mongoose.Schema(
  {
    journalCode: { type: String, default: '' },
    debitAccount: { type: String, default: '' },
    creditAccount: { type: String, default: '' },
    vatRateValue: { type: Number, default: null },
    useVatFromPayload: { type: Boolean, default: true },
    labelTemplate: { type: String, default: '' },
    autoValidate: { type: Boolean, default: false },
    assignToAuxiliary: { type: Boolean, default: false },
  },
  { _id: false }
)

const classificationRuleSchema = new mongoose.Schema(
  {
    source: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalSource', required: true },
    name: { type: String, required: true },
    priority: { type: Number, default: 100 },
    enabled: { type: Boolean, default: true },
    conditions: { type: ruleConditionSchema, default: () => ({}) },
    mapping: { type: ruleMappingSchema, default: () => ({}) },
    matchCount: { type: Number, default: 0 },
    lastMatchedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

classificationRuleSchema.index({ source: 1, priority: -1 })
classificationRuleSchema.index({ source: 1, enabled: 1 })

export default mongoose.model('ClassificationRule', classificationRuleSchema)
