import mongoose from 'mongoose'

const internSettingsSchema = new mongoose.Schema(
  {
    reportNotifRecipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

const InternSettings = mongoose.model('InternSettings', internSettingsSchema)

export async function getInternSettings() {
  let settings = await InternSettings.findOne()
  if (!settings) settings = await InternSettings.create({ reportNotifRecipients: [] })
  return settings
}

export default InternSettings
