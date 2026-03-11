import mongoose from 'mongoose'
import crypto from 'crypto'

const schema = new mongoose.Schema({
  token: { type: String, default: () => crypto.randomBytes(24).toString('hex') },
  label: { type: String, default: 'Lien de creation', trim: true },
  active: { type: Boolean, default: true },
}, { timestamps: true })

schema.index({ token: 1 })

export default mongoose.model('QualiopiCreationToken', schema)
