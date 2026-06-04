import mongoose from 'mongoose'
import type { IWorkspaceLayout } from '../types/models/index.js'

const widgetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    w: { type: Number, default: 4 },
    h: { type: Number, default: 4 },
  },
  { _id: false }
)

const shortcutSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    link: { type: String, required: true },
    icon: { type: String, default: '' },
  },
  { _id: false }
)

const workspaceLayoutSchema = new mongoose.Schema<IWorkspaceLayout>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    widgets: { type: [widgetSchema], default: [] },
    shortcuts: { type: [shortcutSchema], default: [] },
    dailyGoal: {
      type: new mongoose.Schema(
        { text: { type: String, default: '' }, date: { type: Date, default: Date.now } },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
)

export default mongoose.model<IWorkspaceLayout>('WorkspaceLayout', workspaceLayoutSchema)
