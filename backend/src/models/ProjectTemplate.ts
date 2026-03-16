import mongoose from 'mongoose'
import type { IProjectTemplate } from '../types/models/index.js'

const projectTemplateSchema = new mongoose.Schema<IProjectTemplate>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    serviceTypes: { type: [String], default: [] },
    deliverableTypes: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    priority: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
      default: 'NORMALE',
    },
    defaultSections: [
      {
        title: { type: String, required: true },
        description: { type: String, default: '' },
      },
    ],
    defaultTasks: [
      {
        title: { type: String, required: true },
        description: { type: String, default: '' },
        priority: {
          type: String,
          enum: ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE'],
          default: 'NORMALE',
        },
      },
    ],
    budget: {
      amount: { type: Number, default: null },
      currency: { type: String, default: 'EUR' },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

export default mongoose.model<IProjectTemplate>('ProjectTemplate', projectTemplateSchema)
