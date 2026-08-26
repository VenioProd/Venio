import { describe, expect, it } from 'vitest'
import Notification from '../models/Notification.js'
import { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import ActivityLog from '../models/ActivityLog.js'

describe('registres de notifications — synchronisation CLIENT_FILE_UPLOADED', () => {
  it("l'enum du schéma Notification accepte CLIENT_FILE_UPLOADED", () => {
    const enumValues = (Notification.schema.path('type') as unknown as { enumValues: string[] }).enumValues
    expect(enumValues).toContain('CLIENT_FILE_UPLOADED')
  })

  it('NOTIFICATION_TYPES (préférences) contient CLIENT_FILE_UPLOADED', () => {
    expect(NOTIFICATION_TYPES).toContain('CLIENT_FILE_UPLOADED')
  })
})

describe('ActivityLog — synchronisation FICHIER_CLIENT_DEPOSE', () => {
  it("l'enum du schéma ActivityLog accepte FICHIER_CLIENT_DEPOSE", () => {
    const enumValues = (ActivityLog.schema.path('action') as unknown as { enumValues: string[] }).enumValues
    expect(enumValues).toContain('FICHIER_CLIENT_DEPOSE')
  })
})
