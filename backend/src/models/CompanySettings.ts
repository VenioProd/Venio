import mongoose, { Model } from 'mongoose'
import type { ICompanySettings } from '../types/models/index.js'

// Interface pour les statics du singleton CompanySettings
interface CompanySettingsModel extends Model<ICompanySettings> {
  getOrCreate(): Promise<ICompanySettings>
}

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    zip: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: 'France' },
  },
  { _id: false }
)

const ibanSchema = new mongoose.Schema(
  {
    label: { type: String, default: '' },
    iban: { type: String, default: '' },
    bic: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccount: { type: String, default: '' },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
)

const companySettingsSchema = new mongoose.Schema<ICompanySettings, CompanySettingsModel>(
  {
    singletonKey: { type: String, default: 'MAIN', unique: true },
    legalName: { type: String, default: 'Venio' },
    legalForm: { type: String, default: '' },
    siret: { type: String, default: '' },
    siren: { type: String, default: '' },
    apeNafCode: { type: String, default: '' },
    rcs: { type: String, default: '' },
    vatNumber: { type: String, default: '' },
    capitalSocial: { type: Number, default: null },
    address: { type: addressSchema, default: () => ({}) },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    website: { type: String, default: '' },
    logoPath: { type: String, default: '' },
    fiscalRegime: {
      type: String,
      enum: ['REEL_NORMAL', 'REEL_SIMPLIFIE', 'MICRO'],
      default: 'REEL_NORMAL',
    },
    vatPeriodicity: {
      type: String,
      enum: ['MENSUEL', 'TRIMESTRIEL', 'ANNUEL'],
      default: 'MENSUEL',
    },
    fiscalYearStartMonth: { type: Number, default: 1, min: 1, max: 12 },
    currency: { type: String, default: 'EUR' },
    ibanList: { type: [ibanSchema], default: [] },
    paymentTermsDays: { type: Number, default: 30 },
    legalMentions: { type: String, default: '' },
    invoiceFooterNote: { type: String, default: '' },
    latePaymentRateNote: {
      type: String,
      default:
        'En cas de retard de paiement, application du taux d’intérêt légal BCE + 10 points et indemnité forfaitaire de 40 € (art. L441-10 du Code de commerce).',
    },
    isConfigured: { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Récupère ou crée le singleton (clé MAIN)
companySettingsSchema.statics.getOrCreate = async function getOrCreate(): Promise<ICompanySettings> {
  let doc = await this.findOne({ singletonKey: 'MAIN' })
  if (!doc) {
    doc = await this.create({ singletonKey: 'MAIN' })
  }
  return doc
}

export default mongoose.model<ICompanySettings, CompanySettingsModel>('CompanySettings', companySettingsSchema)
