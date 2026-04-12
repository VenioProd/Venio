import mongoose from 'mongoose'
import type { IUser } from '../types/models/index.js'

const userAddressSchema = new mongoose.Schema(
  {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: '' },
  },
  { _id: false }
)

const userSchema = new mongoose.Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['CLIENT', 'SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'], required: true },
    name: { type: String, required: true },
    title: { type: String, default: '' },
    companyName: { type: String, default: '' },
    serviceType: { type: String, default: '' }, // Service pour lequel le client paie (ex. Communication, Développement web)
    phone: { type: String, default: '' },
    website: { type: String, default: '' },
    address: { type: userAddressSchema, default: () => ({}) },
    tags: { type: [String], default: [] },
    source: {
      type: String,
      enum: ['REFERRAL', 'INBOUND', 'OUTBOUND', 'PARTNER', 'AUTRE'],
      default: 'AUTRE',
    },
    ownerAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['PROSPECT', 'ACTIF', 'EN_PAUSE', 'CLOS', 'ARCHIVE'],
      default: 'ACTIF',
    },
    onboardingStatus: {
      type: String,
      enum: ['A_FAIRE', 'EN_COURS', 'TERMINE'],
      default: 'A_FAIRE',
    },
    healthStatus: {
      type: String,
      enum: ['BON', 'ATTENTION', 'CRITIQUE'],
      default: 'BON',
    },
    lastContactAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    // 2FA fields
    twoFactorSecret: { type: String, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    // Custom permissions override (null = use role defaults)
    customPermissions: { type: [String], default: null },
    // Security tracking
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    locale: { type: String, enum: ['fr', 'en'], default: null },
  },
  { timestamps: true }
)

userSchema.index({ role: 1, status: 1 })
userSchema.index({ ownerAdminId: 1, updatedAt: -1 })
userSchema.index({ name: 'text', companyName: 'text', email: 'text' })

export default mongoose.model<IUser>('User', userSchema)
