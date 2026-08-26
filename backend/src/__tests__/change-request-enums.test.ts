import { describe, expect, it } from 'vitest'
import Notification from '../models/Notification.js'
import NotificationPreferences, { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import AuditLog from '../models/AuditLog.js'
import ActivityLog from '../models/ActivityLog.js'
import { UPLOAD_TYPES } from '../lib/nextcloud.js'

const CHANGE_REQUEST_NOTIFICATION_TYPES = [
  'CHANGE_REQUEST_CREATED',
  'CHANGE_REQUEST_REPLY',
  'CHANGE_REQUEST_QUALIFIED',
  'CHANGE_REQUEST_QUOTE_SENT',
  'CHANGE_REQUEST_DELIVERED',
  'CHANGE_REQUEST_PLANNED',
]

function enumValues(model: { schema: { path: (p: string) => unknown } }, path: string): string[] {
  const schemaPath = model.schema.path(path) as { enumValues?: string[] }
  return schemaPath.enumValues ?? []
}

describe('registres transverses des demandes de changement', () => {
  // Sans cette égalité, createNotification lève en validation Mongoose et la
  // notification est perdue en silence (le .catch(() => {}) de l'appelant).
  it('déclare chaque type de notification dans l’enum du modèle Notification', () => {
    const modelValues = enumValues(Notification, 'type')
    for (const type of CHANGE_REQUEST_NOTIFICATION_TYPES) {
      expect(modelValues, `${type} manque dans models/Notification.ts`).toContain(type)
    }
  })

  it('offre un toggle de préférences pour chaque type', () => {
    for (const type of CHANGE_REQUEST_NOTIFICATION_TYPES) {
      expect(NOTIFICATION_TYPES).toContain(type)
    }
    expect(NotificationPreferences.modelName).toBe('NotificationPreferences')
  })

  it('déclare les actions d’audit des demandes', () => {
    const actions = enumValues(AuditLog, 'action')
    for (const action of [
      'CHANGE_REQUEST_CREATED',
      'CHANGE_REQUEST_QUALIFIED',
      'CHANGE_REQUEST_REFUSED',
      'CHANGE_REQUEST_PLANNED',
      'CHANGE_REQUEST_STATUS_CHANGED',
    ]) {
      expect(actions, `${action} manque dans models/AuditLog.ts`).toContain(action)
    }
  })

  it('déclare les actions d’activité projet des demandes', () => {
    const actions = enumValues(ActivityLog, 'action')
    for (const action of ['CHANGE_REQUEST_CREATED', 'CHANGE_REQUEST_QUALIFIED', 'CHANGE_REQUEST_STATUS_CHANGED']) {
      expect(actions, `${action} manque dans models/ActivityLog.ts`).toContain(action)
    }
  })

  it('expose un dossier Nextcloud dédié', () => {
    expect(UPLOAD_TYPES).toContain('demandes-client')
  })
})
