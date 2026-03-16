import mongoose from 'mongoose'
import type { ISequence } from '../types/models/index.js'

const sequenceSchema = new mongoose.Schema<ISequence>(
  {
    name: { type: String, required: true, unique: true },
    value: { type: Number, default: 0 },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    padding: { type: Number, default: 0 },
  },
  { timestamps: false }
)

/**
 * Get next value for a sequence and optionally format it.
 */
export async function getNextSequence(
  name: string,
  options: { prefix?: string; suffix?: string; padding?: number } = {}
): Promise<{ value: number; formatted: string }> {
  const { prefix = '', suffix = '', padding = 3 } = options
  const SequenceModel = mongoose.model('Sequence')
  const doc = await SequenceModel.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  )
  const value = doc?.value ?? 1
  const padded = padding > 0 ? String(value).padStart(padding, '0') : String(value)
  const formatted = `${prefix}${padded}${suffix}`
  return { value, formatted }
}

export default mongoose.model<ISequence>('Sequence', sequenceSchema)
