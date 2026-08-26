import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Notification from '../models/Notification.js'
import ActivityLog from '../models/ActivityLog.js'
import { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import { createNotification } from '../lib/notifications.js'

const PHASE_NOTIFICATION_TYPES = ['PHASE_VALIDATION_REQUESTED', 'PHASE_VALIDATED', 'PHASE_REVISION_REQUESTED'] as const

const PHASE_ACTIVITY_ACTIONS = [
  'PHASE_CREATED',
  'PHASE_UPDATED',
  'PHASE_DELETED',
  'PHASE_STATUS_CHANGED',
  'PHASE_VALIDATION_REQUESTED',
  'PHASE_VALIDATED',
  'PHASE_REVISION_REQUESTED',
  'PHASE_REVISION_RESOLVED',
] as const

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('synchronisation des enums de notification', () => {
  it('déclare les types d’étape dans l’enum du modèle Notification', () => {
    const enumValues = Notification.schema.path('type').options.enum as string[]
    for (const type of PHASE_NOTIFICATION_TYPES) {
      expect(enumValues, `${type} doit figurer dans l’enum du modèle Notification`).toContain(type)
    }
  })

  it('expose les types d’étape dans les préférences de notification', () => {
    for (const type of PHASE_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPES).toContain(type)
    }
  })

  it('persiste réellement une notification de chaque type d’étape', async () => {
    const recipient = new mongoose.Types.ObjectId()
    for (const type of PHASE_NOTIFICATION_TYPES) {
      await createNotification({ recipient, type, title: `Test ${type}` })
    }

    const stored = await Notification.find({ recipient }).select('type').lean()
    expect(stored.map((n) => n.type).sort()).toEqual([...PHASE_NOTIFICATION_TYPES].sort())
  })
})

describe('synchronisation des actions d’activité', () => {
  it('déclare les actions d’étape dans l’enum du modèle ActivityLog', () => {
    const enumValues = ActivityLog.schema.path('action').options.enum as string[]
    for (const action of PHASE_ACTIVITY_ACTIONS) {
      expect(enumValues, `${action} doit figurer dans l’enum du modèle ActivityLog`).toContain(action)
    }
  })

  it('persiste réellement chaque action d’étape', async () => {
    const project = new mongoose.Types.ObjectId()
    const actor = new mongoose.Types.ObjectId()
    for (const action of PHASE_ACTIVITY_ACTIONS) {
      await ActivityLog.create({ project, action, actor, summary: `Test ${action}` })
    }
    expect(await ActivityLog.countDocuments({ project })).toBe(PHASE_ACTIVITY_ACTIONS.length)
  })
})
