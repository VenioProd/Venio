import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AuditLog from '../models/AuditLog.js'
import Notification from '../models/Notification.js'
import { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import { PERMISSIONS } from '../lib/permissions.js'
import type { AuditAction, NotificationType } from '../types/enums.js'

/**
 * L'enum du modèle Notification est historiquement désynchronisée de l'union
 * NotificationType (dette signalée, hors périmètre). Ce test ne compare donc
 * pas les registres entre eux : il verrouille la présence des types du
 * pipeline webhooks dans les TROIS, pour ne pas reproduire le bug.
 */
const WEBHOOK_NOTIFICATION_TYPES: NotificationType[] = ['WEBHOOK_ENDPOINT_DISABLED', 'WEBHOOK_TEST']

const WEBHOOK_AUDIT_ACTIONS: AuditAction[] = [
  'WEBHOOK_ENDPOINT_CREATE',
  'WEBHOOK_ENDPOINT_UPDATE',
  'WEBHOOK_ENDPOINT_DELETE',
  'WEBHOOK_ENDPOINT_ROTATE',
  'WEBHOOK_TEST_SENT',
  'WEBHOOK_DELIVERY_REPLAY',
]

function enumValues(model: { schema: { path: (p: string) => unknown } }, path: string): string[] {
  return (model.schema.path(path) as unknown as { enumValues: string[] }).enumValues
}

describe('registres du pipeline webhooks', () => {
  it('déclare les types webhook dans l’enum du modèle Notification', () => {
    const values = enumValues(Notification, 'type')
    for (const type of WEBHOOK_NOTIFICATION_TYPES) expect(values).toContain(type)
  })

  it('déclare les types webhook dans les préférences de notification', () => {
    for (const type of WEBHOOK_NOTIFICATION_TYPES) expect(NOTIFICATION_TYPES).toContain(type)
  })

  it('déclare les actions d’audit webhook dans l’enum du modèle AuditLog', () => {
    const values = enumValues(AuditLog, 'action')
    for (const action of WEBHOOK_AUDIT_ACTIONS) expect(values).toContain(action)
  })

  it('expose les permissions webhook côté API', () => {
    expect(PERMISSIONS.VIEW_WEBHOOKS).toBe('view_webhooks')
    expect(PERMISSIONS.MANAGE_WEBHOOKS).toBe('manage_webhooks')
  })

  it('réserve les permissions webhook au SUPER_ADMIN dans la matrice', () => {
    const matrix = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../rbac-matrix.json'), 'utf8')) as {
      rolePermissions: Record<string, string[]>
    }

    expect(matrix.rolePermissions.SUPER_ADMIN).toEqual(expect.arrayContaining(['view_webhooks', 'manage_webhooks']))
    for (const role of Object.keys(matrix.rolePermissions).filter((r) => r !== 'SUPER_ADMIN')) {
      expect(matrix.rolePermissions[role]).not.toContain('view_webhooks')
      expect(matrix.rolePermissions[role]).not.toContain('manage_webhooks')
    }
  })
})
