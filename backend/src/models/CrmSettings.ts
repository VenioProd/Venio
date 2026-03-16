import mongoose, { Model } from 'mongoose'
import type { ICrmSettings } from '../types/models/index.js'

interface CrmSettingsModel extends Model<ICrmSettings> {
  getSettings(): Promise<ICrmSettings>
  updateSettings(updates: Partial<ICrmSettings>): Promise<ICrmSettings>
}

/**
 * CRM Settings - Singleton document for CRM automation configuration
 * There should only be one document in this collection
 */
const crmSettingsSchema = new mongoose.Schema<ICrmSettings, CrmSettingsModel>(
  {
    // ═══════════════════════════════════════════════════════════════
    // ASSIGNMENT AUTOMATIONS
    // ═══════════════════════════════════════════════════════════════
    roundRobinEnabled: { type: Boolean, default: true },

    // ═══════════════════════════════════════════════════════════════
    // QUALIFICATION AUTOMATIONS
    // ═══════════════════════════════════════════════════════════════
    autoQualifyEnabled: { type: Boolean, default: true },

    // ═══════════════════════════════════════════════════════════════
    // STATUS CHANGE AUTOMATIONS
    // ═══════════════════════════════════════════════════════════════
    autoLastContactOnContacted: { type: Boolean, default: true },
    autoNextActionOnDemo: { type: Boolean, default: true },
    demoFollowUpDays: { type: Number, default: 1 },
    autoNextActionOnProposal: { type: Boolean, default: true },
    proposalFollowUpDays: { type: Number, default: 3 },
    clearNextActionOnClose: { type: Boolean, default: true },

    // ═══════════════════════════════════════════════════════════════
    // NOTIFICATION AUTOMATIONS
    // ═══════════════════════════════════════════════════════════════
    emailOnAssignment: { type: Boolean, default: true },
    activityLogging: { type: Boolean, default: true },

    // ═══════════════════════════════════════════════════════════════
    // COLD LEAD ALERTS
    // ═══════════════════════════════════════════════════════════════
    coldLeadAlertEnabled: { type: Boolean, default: true },
    coldLeadThresholdDays: { type: Number, default: 7 },
    coldLeadEmailEnabled: { type: Boolean, default: false },

    // ═══════════════════════════════════════════════════════════════
    // OVERDUE ACTION ALERTS
    // ═══════════════════════════════════════════════════════════════
    overdueAlertEnabled: { type: Boolean, default: true },
    dailyOverdueEmailEnabled: { type: Boolean, default: false },
    dailyOverdueEmailTime: { type: String, default: '08:00' }, // HH:mm format

    // ═══════════════════════════════════════════════════════════════
    // STALE LEAD ALERTS
    // ═══════════════════════════════════════════════════════════════
    staleLeadAlertEnabled: { type: Boolean, default: true },
    staleLeadThresholdDays: { type: Number, default: 14 },

    // ═══════════════════════════════════════════════════════════════
    // ESCALATION / INACTIVITY
    // ═══════════════════════════════════════════════════════════════
    escalationEnabled: { type: Boolean, default: false },
    escalationThresholdDays: { type: Number, default: 10 },
    escalationAction: {
      type: String,
      enum: ['NOTIFY_MANAGER', 'REASSIGN', 'BOTH'],
      default: 'NOTIFY_MANAGER'
    },
    escalationManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ═══════════════════════════════════════════════════════════════
    // LEAD SCORING
    // ═══════════════════════════════════════════════════════════════
    scoringEnabled: { type: Boolean, default: false },
    scoringWeights: {
      budgetHigh: { type: Number, default: 30 },      // budget > 10000
      budgetMedium: { type: Number, default: 15 },    // budget 1000-10000
      budgetLow: { type: Number, default: 5 },        // budget < 1000
      sourceReferral: { type: Number, default: 25 },
      sourceAds: { type: Number, default: 15 },
      sourceOther: { type: Number, default: 10 },
      priorityUrgent: { type: Number, default: 20 },
      priorityHigh: { type: Number, default: 15 },
      priorityNormal: { type: Number, default: 5 },
      hasEmail: { type: Number, default: 10 },
      hasPhone: { type: Number, default: 10 },
    },

    // ═══════════════════════════════════════════════════════════════
    // DUPLICATE DETECTION
    // ═══════════════════════════════════════════════════════════════
    duplicateDetectionEnabled: { type: Boolean, default: true },
    duplicateCheckEmail: { type: Boolean, default: true },
    duplicateCheckCompany: { type: Boolean, default: true },
    duplicateCheckPhone: { type: Boolean, default: false },

    // ═══════════════════════════════════════════════════════════════
    // PROPOSAL REMINDER
    // ═══════════════════════════════════════════════════════════════
    proposalReminderEnabled: { type: Boolean, default: false },
    proposalReminderDays: { type: Number, default: 7 }, // Days before reminder

    // ═══════════════════════════════════════════════════════════════
    // WEEKLY REPORT
    // ═══════════════════════════════════════════════════════════════
    weeklyReportEnabled: { type: Boolean, default: false },
    weeklyReportDay: { type: Number, default: 1 }, // 0=Sunday, 1=Monday, etc.
    weeklyReportTime: { type: String, default: '09:00' },
    weeklyReportRecipients: [{ type: String }], // Email addresses

    // ═══════════════════════════════════════════════════════════════
    // PROJECT / BILLING / TASK AUTOMATIONS
    // ═══════════════════════════════════════════════════════════════
    invoiceRemindersEnabled: { type: Boolean, default: true },
    taskRemindersEnabled: { type: Boolean, default: true },
    projectNotificationsEnabled: { type: Boolean, default: true },
    briefRemindersEnabled: { type: Boolean, default: true },
    clientHealthAutoUpdate: { type: Boolean, default: true },
    invoiceReminderDays: { type: Number, default: 7 }, // Days after due date to send reminder
  },
  { timestamps: true }
)

/**
 * Get the singleton settings document, creating it if it doesn't exist
 */
crmSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({})
  }
  return settings
}

/**
 * Update settings (upsert)
 */
crmSettingsSchema.statics.updateSettings = async function (updates: Partial<ICrmSettings>) {
  const settings = await this.findOneAndUpdate(
    {},
    { $set: updates },
    { upsert: true, new: true, runValidators: true }
  )
  return settings
}

export default mongoose.model<ICrmSettings, CrmSettingsModel>('CrmSettings', crmSettingsSchema)
