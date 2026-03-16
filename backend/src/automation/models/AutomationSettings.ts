import mongoose, { Schema, type Document } from 'mongoose'
import type { AutomationSettingsDoc, Channel } from '../types.js'

export interface IAutomationSettings extends AutomationSettingsDoc, Document {}

const AutomationSettingsSchema = new Schema<IAutomationSettings>(
  {
    key: { type: String, required: true, unique: true, index: true },
    enabled: { type: Boolean, default: true },
    channels: [{ type: String, enum: ['in_app', 'email', 'system_log'] }],
    throttleWindowMinutes: { type: Number, default: 0 },
    escalationEnabled: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

const AutomationSettings = mongoose.model<IAutomationSettings>(
  'AutomationSettings',
  AutomationSettingsSchema
)

export default AutomationSettings

// ── Helper: get or create settings for an automation key ──
export async function getAutomationSettings(
  key: string,
  defaults?: Partial<AutomationSettingsDoc>
): Promise<IAutomationSettings> {
  let doc = await AutomationSettings.findOne({ key })
  if (!doc) {
    doc = await AutomationSettings.create({
      key,
      enabled: defaults?.enabled ?? true,
      channels: defaults?.channels ?? ['in_app', 'system_log'],
      throttleWindowMinutes: defaults?.throttleWindowMinutes ?? 0,
      escalationEnabled: defaults?.escalationEnabled ?? false,
      config: defaults?.config ?? {},
    })
  }
  return doc
}

export async function updateAutomationSettings(
  key: string,
  updates: Partial<AutomationSettingsDoc>
): Promise<IAutomationSettings | null> {
  return AutomationSettings.findOneAndUpdate(
    { key },
    { $set: updates },
    { new: true, upsert: true }
  )
}

export async function listAutomationSettings(): Promise<IAutomationSettings[]> {
  return AutomationSettings.find().sort({ key: 1 })
}
