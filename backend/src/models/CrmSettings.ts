import mongoose, { Model } from 'mongoose'
import type { ICrmSettings } from '../types/models/index.js'
import { DEFAULT_CALL_ANALYSIS_SETTINGS } from '../lib/callAnalysis/heat.js'

export const DEFAULT_RECORDING_NOTICE =
  'Cet appel est enregistré et transcrit pour le suivi de votre demande. Vous pouvez vous y opposer à tout moment.'

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
    callOutcomes: {
      type: [
        {
          _id: false,
          value: { type: String, required: true },
          fr: { type: String, required: true },
          en: { type: String, required: true },
          effect: {
            type: String,
            enum: ['NONE', 'VOICEMAIL', 'CALLBACK', 'MEETING', 'LOST', 'WRONG_NUMBER', 'DO_NOT_CALL'],
            required: true,
          },
          reached: { type: Boolean, required: true },
          retryAfterMinutes: { type: Number, default: null },
        },
      ],
      default: [
        {
          value: 'NO_ANSWER',
          fr: 'Sans réponse',
          en: 'No answer',
          effect: 'NONE',
          reached: false,
          retryAfterMinutes: 240,
        },
        {
          value: 'VOICEMAIL',
          fr: 'Messagerie',
          en: 'Voicemail',
          effect: 'VOICEMAIL',
          reached: false,
          retryAfterMinutes: 1440,
        },
        {
          value: 'CALLBACK',
          fr: 'À rappeler',
          en: 'Callback',
          effect: 'CALLBACK',
          reached: true,
          retryAfterMinutes: null,
        },
        {
          value: 'MEETING_BOOKED',
          fr: 'Rendez-vous pris',
          en: 'Meeting booked',
          effect: 'MEETING',
          reached: true,
          retryAfterMinutes: null,
        },
        {
          value: 'NOT_INTERESTED',
          fr: 'Pas intéressé',
          en: 'Not interested',
          effect: 'LOST',
          reached: true,
          retryAfterMinutes: null,
        },
        {
          value: 'WRONG_NUMBER',
          fr: 'Mauvais numéro',
          en: 'Wrong number',
          effect: 'WRONG_NUMBER',
          reached: false,
          retryAfterMinutes: null,
        },
        {
          value: 'DO_NOT_CALL',
          fr: 'Ne plus appeler',
          en: 'Do not call',
          effect: 'DO_NOT_CALL',
          reached: true,
          retryAfterMinutes: null,
        },
      ],
    },
    callScriptTags: { type: [String], default: ['DEFAULT'] },
    callDefaultRegion: { type: String, default: 'FR' },
    // Téléphonie (lot A) : appliquées par le serveur au lancement et à la mise en relation.
    telephony: {
      callingHours: {
        timezone: {
          type: String,
          default: 'Europe/Paris',
          validate: (value: string) => {
            try {
              new Intl.DateTimeFormat('fr-FR', { timeZone: value })
              return true
            } catch {
              return false
            }
          },
        },
        // 0 = dimanche … 6 = samedi.
        days: { type: [{ type: Number, min: 0, max: 6 }], default: [1, 2, 3, 4, 5] },
        start: { type: String, default: '09:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        end: { type: String, default: '20:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
      },
      // Tentatives par numéro et par jour local, tous commerciaux confondus.
      attemptCapPerDay: { type: Number, default: 3, min: 1, max: 20 },
    },
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
      default: 'NOTIFY_MANAGER',
    },
    escalationManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ═══════════════════════════════════════════════════════════════
    // COMMERCIAUX EXTERNES
    // ═══════════════════════════════════════════════════════════════
    // Reçoit les dossiers « prêts à closer ». Vide : les super-admins.
    defaultCloserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ═══════════════════════════════════════════════════════════════
    // MOTIFS DE PERTE
    // ═══════════════════════════════════════════════════════════════
    lostReasons: {
      type: [String],
      default: ['Prix', 'Délai', 'Concurrent', 'Sans réponse', 'Hors cible', 'Projet annulé'],
    },

    // ═══════════════════════════════════════════════════════════════
    // LEAD SCORING
    // ═══════════════════════════════════════════════════════════════
    scoringEnabled: { type: Boolean, default: false },
    scoringWeights: {
      budgetHigh: { type: Number, default: 30 }, // budget > 10000
      budgetMedium: { type: Number, default: 15 }, // budget 1000-10000
      budgetLow: { type: Number, default: 5 }, // budget < 1000
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
    // Refuse (409) la création d'un lead qui a des doublons probables ; sinon la réponse les signale seulement.
    duplicateBlockOnCreate: { type: Boolean, default: false },

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

    // ═══════════════════════════════════════════════════════════════
    // RGPD : CONSERVATION DES DONNÉES (chantier 3D)
    // ═══════════════════════════════════════════════════════════════
    // Durée sans interaction ni modification au-delà de laquelle un lead non gagné est anonymisé.
    retentionMonths: { type: Number, default: 36, min: 6, max: 120 },
    // Tant qu'il est faux, la purge quotidienne ne fait que compter (simulation).
    retentionPurgeEnabled: { type: Boolean, default: false },

    // ═══════════════════════════════════════════════════════════════
    // TRANSCRIPTION DES APPELS (poste d'appel, lot C)
    // ═══════════════════════════════════════════════════════════════
    // Sans ASSEMBLYAI_API_KEY, une demande donne un transcript SKIPPED quel que soit ce réglage.
    callTranscription: {
      enabled: { type: Boolean, default: true },
      language: { type: String, default: 'fr', trim: true, lowercase: true, match: /^[a-z]{2}(_[a-z]{2})?$/ },
      retentionMonths: { type: Number, default: 12, min: 1, max: 36 },
    },

    // ═══════════════════════════════════════════════════════════════
    // ANALYSE D'APPEL (lot D) — inopérante sans ANTHROPIC_API_KEY
    // ═══════════════════════════════════════════════════════════════
    // Grille contrôlée par heatGridError (lib/callAnalysis/heat) ; une grille invalide retombe sur celle de départ.
    callAnalysis: {
      type: new mongoose.Schema(
        {
          enabled: { type: Boolean, default: true },
          heatGrid: {
            criteria: {
              type: [
                {
                  _id: false,
                  key: { type: String, required: true, maxlength: 40 },
                  label: { type: String, required: true, maxlength: 80 },
                  max: { type: Number, required: true, min: -100, max: 100 },
                  description: { type: String, default: '', maxlength: 300 },
                },
              ],
              default: () => DEFAULT_CALL_ANALYSIS_SETTINGS.heatGrid.criteria.map((criterion) => ({ ...criterion })),
            },
            thresholds: {
              tiede: {
                type: Number,
                default: DEFAULT_CALL_ANALYSIS_SETTINGS.heatGrid.thresholds.tiede,
                min: 1,
                max: 100,
              },
              chaud: {
                type: Number,
                default: DEFAULT_CALL_ANALYSIS_SETTINGS.heatGrid.thresholds.chaud,
                min: 1,
                max: 100,
              },
              tresChaud: {
                type: Number,
                default: DEFAULT_CALL_ANALYSIS_SETTINGS.heatGrid.thresholds.tresChaud,
                min: 1,
                max: 100,
              },
            },
          },
          // Analyses et transcripts : un an au plus (doctrine CNIL sur les documents d'analyse).
          retentionMonths: { type: Number, default: 12, min: 1, max: 12 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    // ═══════════════════════════════════════════════════════════════
    // ENREGISTREMENT DES APPELS (vague 2, lot F1)
    // ═══════════════════════════════════════════════════════════════
    // Audio supprimé chez l'opérateur une fois le transcript obtenu, sauf si keepAudioDays > 0.
    callRecording: {
      enabled: { type: Boolean, default: true },
      notice: {
        enabled: { type: Boolean, default: true },
        text: { type: String, default: DEFAULT_RECORDING_NOTICE, trim: true, maxlength: 300 },
      },
      keepAudioDays: { type: Number, default: 0, min: 0, max: 180 },
    },
  },
  { timestamps: true },
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
  const settings = await this.findOneAndUpdate({}, { $set: updates }, { upsert: true, new: true, runValidators: true })
  return settings
}

export default mongoose.model<ICrmSettings, CrmSettingsModel>('CrmSettings', crmSettingsSchema)
