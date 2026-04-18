import mongoose from 'mongoose'

export interface IArrowPilotage {
  key: string
  goals: string[]
  scorecard: string[]
  decisions: string[]
  cadence: string[]
  updatedBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const schema = new mongoose.Schema<IArrowPilotage>(
  {
    key: { type: String, required: true, unique: true, default: 'arrow' },
    goals: { type: [String], default: [] },
    scorecard: { type: [String], default: [] },
    decisions: { type: [String], default: [] },
    cadence: { type: [String], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

export default mongoose.model<IArrowPilotage>('ArrowPilotage', schema)
