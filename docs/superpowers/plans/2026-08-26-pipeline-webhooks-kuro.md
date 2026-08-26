# Pipeline d'événements sortant — webhooks vers Kuro — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pousser en temps réel vers Kuro (et tout consommateur externe) chaque événement qui produit une notification admin, via des webhooks HTTP signés, configurables, rejouables et auto-désactivables depuis l'espace admin.

**Architecture:** Un helper d'émission (`lib/webhookEvents.ts`) est branché sur le point d'émission existant (`createNotification` + les trois broadcasts de `notifyHelpers.ts`). Il crée une `WebhookDelivery` par endpoint actif dont le filtre matche, puis déclenche la livraison HTTP en fire-and-forget. La livraison (`lib/webhooks/deliver.ts`) signe le corps avec la convention HMAC déjà utilisée en entrant (`lib/external/hmac.ts`), applique un backoff 1 min → 5 min → 30 min → 2 h → 12 h, et désactive l'endpoint après 20 échecs consécutifs. Une automation cron du moteur existant reprend les livraisons échues chaque minute. L'admin pilote le tout via `/api/admin/webhooks` et la page `/admin/webhooks`.

**Tech Stack:** Node 22 + TypeScript ESM, Express 5, Mongoose 8, Vitest 4 + supertest + mongodb-memory-server (backend) ; React 19 + React Router + Vitest/jsdom + Testing Library (frontend).

## Global Constraints

- **Ajouts minimaux et localisés** dans `backend/src/types/enums.ts`, `backend/src/models/Notification.ts`, `backend/src/models/AuditLog.ts` et `rbac-matrix.json` : trois autres chantiers tournent en parallèle sur ces fichiers. Toujours **ajouter un bloc en fin de liste** précédé d'un commentaire `// ── Webhooks ──`, jamais réordonner ni reformater l'existant.
- **Anti-boucle** : aucun événement dont le `type` commence par `WEBHOOK_` n'entre dans le pipeline (garde dans `emitWebhookEvent`).
- **Émission jamais bloquante** : `createNotification` et les broadcasts n'attendent jamais la livraison HTTP (`void emitWebhookEventInBackground(...)`, `Promise.allSettled` en interne).
- **Signature sortante** : `payload = timestamp + "." + rawBody`, header `X-Venio-Signature: sha256=<hex>` — via `computeSignature` importée de `backend/src/lib/external/hmac.ts`, **sans dupliquer** l'algorithme.
- **Sécurité livraison** : timeout **10 s**, `redirect: 'manual'` (toute 3xx = échec), corps sérialisé **une seule fois** (le même string sert à signer et à envoyer).
- **Sécurité URL** : `https://` obligatoire ; `http://` accepté uniquement pour `localhost` / `127.0.0.1` / `[::1]` et uniquement si `process.env.NODE_ENV !== 'production'`.
- **Secret** : 32 octets `crypto.randomBytes` en hex, stocké chiffré via `lib/secretBox.ts`, renvoyé en clair **une seule fois** (création + rotation), jamais loggé, jamais exposé par un GET.
- **Permissions** : `view_webhooks` et `manage_webhooks` sont attribuées à **SUPER_ADMIN uniquement**. Justification (la spec demandait de confirmer avec la matrice réelle) : `manage_admins`, sur lequel la spec veut calquer l'attribution, n'existe que pour SUPER_ADMIN dans `rbac-matrix.json`, et `src/lib/__tests__/adminNavigation.test.ts` verrouille le fait que la zone « Administration » — où atterrit `/admin/webhooks` — reste exclusive à SUPER_ADMIN. Donner la lecture à ADMIN rendrait ce test rouge.
- **TTL** : index TTL 30 jours sur `WebhookDelivery.createdAt`.
- **Commits** : conventional commits (`feat(webhooks): …`), un commit par tâche minimum.
- **Branche** : le worktree courant (`claude/determined-meninsky-27d90d`) est la branche dédiée du chantier ; ne jamais committer sur `main`.

## Structure de fichiers

**Backend — créés**

| Fichier | Responsabilité |
|---|---|
| `backend/src/models/WebhookEndpoint.ts` | Endpoint : URL, secret chiffré, filtre de types, santé, désactivation |
| `backend/src/models/WebhookDelivery.ts` | Livraison : payload figé, statut, tentatives, `nextRetryAt`, TTL 30 j |
| `backend/src/lib/webhooks/urls.ts` | Validation d'URL sortante (https / localhost dev) |
| `backend/src/lib/webhooks/secret.ts` | Génération + chiffrement/déchiffrement du secret d'endpoint |
| `backend/src/lib/webhooks/deliver.ts` | Signature, requête HTTP, succès/échec, backoff, auto-désactivation, reprise des échues |
| `backend/src/lib/webhookEvents.ts` | `emitWebhookEvent` / `emitWebhookEventInBackground` (résolution d'endpoints, anti-boucle, fan-out) |
| `backend/src/automation/jobs/webhookDeliveryRetry.ts` | Automation cron `webhooks.delivery_retry` |
| `backend/src/routes/admin/webhooks.ts` | API admin (CRUD, rotate, test, journal, rejeu) |

**Backend — modifiés**

| Fichier | Modification |
|---|---|
| `backend/src/types/enums.ts` | `NotificationType` +2, `Permission` +2, `AuditAction` +6 |
| `backend/src/models/Notification.ts` | enum Mongoose +2 |
| `backend/src/models/NotificationPreferences.ts` | `NOTIFICATION_TYPES` +2 |
| `backend/src/models/AuditLog.ts` | enum Mongoose +6 |
| `backend/src/lib/permissions.ts` | `PERMISSIONS` +2 |
| `backend/src/lib/notifications.ts` | paramètre `skipWebhook` + règles d'émission 1/3/4 |
| `backend/src/lib/notifyHelpers.ts` | émission unique en tête + `skipWebhook: true` (règle 2) |
| `backend/src/automation/scheduler.ts` | `shouldRunNow` exportée + format cron « toutes les N minutes » |
| `backend/src/automation/index.ts` | enregistrement du job de retry |
| `backend/src/index.ts` | montage de `/api/admin/webhooks` |

**Racine / frontend — modifiés & créés**

| Fichier | Modification |
|---|---|
| `rbac-matrix.json` | 2 permissions, SUPER_ADMIN +2, 1 entrée `navigation` |
| `src/types/auth.types.ts` | `Permission` +2 |
| `src/lib/adminNavigation.ts` | `webhooks` → zone `Administration` |
| `src/types/notification.types.ts`, `src/services/notificationPreferences.ts` | union +2, libellés FR +2 |
| `src/services/webhooks.ts` (créé) | client API typé |
| `src/pages/admin/Webhooks.tsx` (créé) | page (liste d'endpoints + journal) |
| `src/pages/admin/webhooks/types.ts` (créé) | types partagés + helpers d'affichage |
| `src/pages/admin/webhooks/EndpointEditorModal.tsx` (créé) | modale création / édition |
| `src/pages/admin/webhooks/SecretRevealModal.tsx` (créé) | révélation unique du secret |
| `src/pages/admin/webhooks/DeliveryLog.tsx` (créé) | journal filtrable + détail + rejeu |
| `src/App.tsx` | route `webhooks` sous `RequirePermission` |

**Documentation**

| Fichier | Modification |
|---|---|
| `docs/webhooks-sortants.md` (créé) | contrat de livraison + récepteur de référence + variable d'env |

---

### Task 1 : Registres — types de notification, permissions, actions d'audit

**Files:**
- Modify: `backend/src/types/enums.ts` (fin de `NotificationType`, fin de `Permission`, fin de `AuditAction`)
- Modify: `backend/src/models/Notification.ts:24` (fin du tableau `enum`)
- Modify: `backend/src/models/NotificationPreferences.ts:47` (fin de `NOTIFICATION_TYPES`)
- Modify: `backend/src/models/AuditLog.ts` (fin du tableau `enum`)
- Modify: `backend/src/lib/permissions.ts:46` (fin de `PERMISSIONS`)
- Modify: `rbac-matrix.json` (`permissions`, `rolePermissions.SUPER_ADMIN`, `navigation`)
- Modify: `src/types/auth.types.ts:33` (fin de `Permission`)
- Modify: `src/lib/adminNavigation.ts:68` (fin de `ZONE_BY_NAVIGATION_ID`)
- Modify: `src/types/notification.types.ts:1`, `src/services/notificationPreferences.ts`
- Test: `backend/src/__tests__/webhook-registries.test.ts` (créé)

**Interfaces:**
- Consumes: rien.
- Produces: types `'WEBHOOK_ENDPOINT_DISABLED' | 'WEBHOOK_TEST'` dans `NotificationType` ; permissions `PERMISSIONS.VIEW_WEBHOOKS === 'view_webhooks'` et `PERMISSIONS.MANAGE_WEBHOOKS === 'manage_webhooks'` ; actions d'audit `WEBHOOK_ENDPOINT_CREATE | WEBHOOK_ENDPOINT_UPDATE | WEBHOOK_ENDPOINT_DELETE | WEBHOOK_ENDPOINT_ROTATE | WEBHOOK_TEST_SENT | WEBHOOK_DELIVERY_REPLAY` dans `AuditAction` ; entrée de navigation `id: 'webhooks'`, `screen: '/admin/webhooks'`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-registries.test.ts` :

```ts
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
    const matrix = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../rbac-matrix.json'), 'utf8'),
    ) as {
      rolePermissions: Record<string, string[]>
      navigation: Array<{ id: string; screen: string; permission: string | null }>
    }

    expect(matrix.rolePermissions.SUPER_ADMIN).toEqual(
      expect.arrayContaining(['view_webhooks', 'manage_webhooks']),
    )
    for (const role of Object.keys(matrix.rolePermissions).filter((r) => r !== 'SUPER_ADMIN')) {
      expect(matrix.rolePermissions[role]).not.toContain('view_webhooks')
      expect(matrix.rolePermissions[role]).not.toContain('manage_webhooks')
    }

    const entry = matrix.navigation.find((item) => item.id === 'webhooks')
    expect(entry).toMatchObject({ screen: '/admin/webhooks', permission: 'view_webhooks' })
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-registries.test.ts`
Expected: FAIL — TypeScript refuse `'WEBHOOK_ENDPOINT_DISABLED'` comme `NotificationType` et `PERMISSIONS.VIEW_WEBHOOKS` est `undefined`.

- [ ] **Step 3 : Ajouter les types à `backend/src/types/enums.ts`**

À la fin de l'union `NotificationType` (après `| 'BRIEF_STATUS_CHANGED'`) :

```ts
  // ── Webhooks sortants ──
  | 'WEBHOOK_ENDPOINT_DISABLED'
  | 'WEBHOOK_TEST'
```

À la fin de l'union `Permission` (après `| 'manage_education'`) :

```ts
  // ── Webhooks sortants ──
  | 'view_webhooks'
  | 'manage_webhooks'
```

À la fin de l'union `AuditAction` (après `| 'QUOTE_PROPOSAL_EXPIRED'`) :

```ts
  // ── Webhooks sortants ──
  | 'WEBHOOK_ENDPOINT_CREATE'
  | 'WEBHOOK_ENDPOINT_UPDATE'
  | 'WEBHOOK_ENDPOINT_DELETE'
  | 'WEBHOOK_ENDPOINT_ROTATE'
  | 'WEBHOOK_TEST_SENT'
  | 'WEBHOOK_DELIVERY_REPLAY'
```

- [ ] **Step 4 : Ajouter les types aux enums Mongoose**

Dans `backend/src/models/Notification.ts`, à la fin du tableau `enum` (après `'SENSITIVE_ACTION_EXECUTED',`) :

```ts
        // ── Webhooks sortants ──
        'WEBHOOK_ENDPOINT_DISABLED',
        'WEBHOOK_TEST',
```

Dans `backend/src/models/AuditLog.ts`, à la fin du tableau `enum` :

```ts
        // ── Webhooks sortants ──
        'WEBHOOK_ENDPOINT_CREATE',
        'WEBHOOK_ENDPOINT_UPDATE',
        'WEBHOOK_ENDPOINT_DELETE',
        'WEBHOOK_ENDPOINT_ROTATE',
        'WEBHOOK_TEST_SENT',
        'WEBHOOK_DELIVERY_REPLAY',
```

Dans `backend/src/models/NotificationPreferences.ts`, à la fin de `NOTIFICATION_TYPES` (après `'INTERNAL_MESSAGE',`) :

```ts
  // ── Webhooks sortants ──
  'WEBHOOK_ENDPOINT_DISABLED',
  'WEBHOOK_TEST',
```

- [ ] **Step 5 : Ajouter les permissions**

Dans `backend/src/lib/permissions.ts`, à la fin de l'objet `PERMISSIONS` (après `MANAGE_EDUCATION: 'manage_education',`) :

```ts
  // ── Webhooks sortants ──
  VIEW_WEBHOOKS: 'view_webhooks',
  MANAGE_WEBHOOKS: 'manage_webhooks',
```

Aucun autre rôle n'est touché : `SUPER_ADMIN: new Set(Object.values(PERMISSIONS))` récupère les deux permissions automatiquement.

Dans `rbac-matrix.json`, ajouter à la fin de l'objet `permissions` :

```json
    "VIEW_WEBHOOKS": "view_webhooks",
    "MANAGE_WEBHOOKS": "manage_webhooks"
```

à la fin du tableau `rolePermissions.SUPER_ADMIN` :

```json
    "view_webhooks",
    "manage_webhooks"
```

et à la fin du tableau `navigation` :

```json
    {
      "id": "webhooks",
      "section": "Admin",
      "screen": "/admin/webhooks",
      "label": "Webhooks",
      "permission": "view_webhooks",
      "roles": []
    }
```

Ne rien ajouter à `apiActions` : cette section exige un `agentSource` (endpoint `/api/v1/agent/*` miroir), or le pipeline n'expose aucune route agent.

- [ ] **Step 6 : Vérifier les tests backend**

Run: `npm --prefix backend test -- webhook-registries.test.ts rbac-matrix.test.ts`
Expected: PASS — les deux fichiers verts (`rbac-matrix.test.ts` valide la synchro `PERMISSIONS` ↔ matrice).

- [ ] **Step 7 : Répercuter côté frontend**

Dans `src/types/auth.types.ts`, à la fin de l'union `Permission` :

```ts
  | 'view_webhooks'
  | 'manage_webhooks'
```

Dans `src/lib/adminNavigation.ts`, à la fin de `ZONE_BY_NAVIGATION_ID` (après `subsidiaries: 'Administration',`) :

```ts
  webhooks: 'Administration',
```

Dans `src/types/notification.types.ts`, ligne 1, étendre l'union :

```ts
export type NotificationType = 'TASK_ASSIGNED' | 'TASK_UPDATED' | 'PROJECT_UPDATE' | 'DOCUMENT_ADDED' | 'TICKET_CREATED' | 'TICKET_REPLY' | 'INTERNAL_MESSAGE' | 'WEBHOOK_ENDPOINT_DISABLED' | 'WEBHOOK_TEST'
```

Dans `src/services/notificationPreferences.ts`, étendre l'union `NotificationType` de la même façon :

```ts
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_UPDATED'
  | 'PROJECT_UPDATE'
  | 'DOCUMENT_ADDED'
  | 'TICKET_CREATED'
  | 'TICKET_REPLY'
  | 'INTERNAL_MESSAGE'
  | 'WEBHOOK_ENDPOINT_DISABLED'
  | 'WEBHOOK_TEST'
```

et ajouter les libellés à la fin de `NOTIFICATION_TYPE_LABELS` (après l'entrée `INTERNAL_MESSAGE`) :

```ts
  WEBHOOK_ENDPOINT_DISABLED: {
    label: 'Webhook désactivé',
    description: 'Un endpoint de webhook a été désactivé après des échecs répétés.',
  },
  WEBHOOK_TEST: {
    label: 'Test de webhook',
    description: 'Événement réservé aux envois de test depuis la page Webhooks.',
  },
```

- [ ] **Step 8 : Vérifier le typecheck et les tests frontend touchés**

Run: `npm run typecheck:all && npx vitest run src/lib/__tests__ src/components/AdminSidebar.test.tsx`
Expected: PASS — aucune erreur TypeScript ; `adminNavigation.test.ts` reste vert (la zone Administration ne devient visible pour aucun rôle supplémentaire, `view_webhooks` étant SUPER_ADMIN seul).

- [ ] **Step 9 : Commit**

```bash
git add backend/src/types/enums.ts backend/src/models/Notification.ts backend/src/models/AuditLog.ts backend/src/models/NotificationPreferences.ts backend/src/lib/permissions.ts backend/src/__tests__/webhook-registries.test.ts rbac-matrix.json src/types/auth.types.ts src/types/notification.types.ts src/services/notificationPreferences.ts src/lib/adminNavigation.ts && git commit -m "feat(webhooks): declarer les types, permissions et actions d'audit du pipeline"
```

---

### Task 2 : Modèles `WebhookEndpoint` et `WebhookDelivery`

**Files:**
- Create: `backend/src/models/WebhookEndpoint.ts`
- Create: `backend/src/models/WebhookDelivery.ts`
- Test: `backend/src/models/webhook-index-contract.test.ts` (créé)

**Interfaces:**
- Consumes: `NotificationType` (Task 1).
- Produces:
  - `WebhookEndpoint` (default export), interface `IWebhookEndpoint` : `name: string`, `url: string`, `secretEncrypted: string`, `eventTypes: string[]`, `isActive: boolean`, `consecutiveFailures: number`, `disabledAt: Date | null`, `disabledReason: 'AUTO_FAILURES' | 'MANUAL' | null`, `lastSuccessAt: Date | null`, `lastFailureAt: Date | null`, `createdBy: Types.ObjectId | null`, `createdAt`/`updatedAt`.
  - `WebhookDelivery` (default export), interface `IWebhookDelivery` : `endpoint: Types.ObjectId`, `eventId: string`, `eventType: string`, `payload: Record<string, unknown>`, `status: 'PENDING' | 'DELIVERED' | 'FAILED'`, `attempts: Array<{ at: Date; httpStatus: number | null; error: string; durationMs: number }>`, `nextRetryAt: Date | null`, `createdAt`/`updatedAt`.
  - Constantes exportées : `WEBHOOK_DISABLED_REASONS`, `WEBHOOK_DELIVERY_STATUSES`, `WEBHOOK_DELIVERY_TTL_DAYS = 30`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/models/webhook-index-contract.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import type { IndexDefinition, IndexOptions } from 'mongoose'
import WebhookDelivery, { WEBHOOK_DELIVERY_TTL_DAYS } from './WebhookDelivery.js'
import WebhookEndpoint from './WebhookEndpoint.js'

type Model = { schema: { indexes: () => [IndexDefinition, IndexOptions][] } }

function findIndex(model: Model, keys: IndexDefinition): IndexOptions | undefined {
  return model.schema
    .indexes()
    .find(([declared]) => JSON.stringify(declared) === JSON.stringify(keys))?.[1]
}

describe('contrats d’index du pipeline webhooks', () => {
  it('purge automatiquement les livraisons après 30 jours', () => {
    const options = findIndex(WebhookDelivery, { createdAt: 1 })
    expect(options).toBeDefined()
    expect(options?.expireAfterSeconds).toBe(WEBHOOK_DELIVERY_TTL_DAYS * 24 * 60 * 60)
  })

  it('indexe le journal par endpoint et la reprise des livraisons échues', () => {
    expect(findIndex(WebhookDelivery, { endpoint: 1, createdAt: -1 })).toBeDefined()
    expect(findIndex(WebhookDelivery, { status: 1, nextRetryAt: 1 })).toBeDefined()
    expect(findIndex(WebhookDelivery, { eventId: 1 })).toBeDefined()
  })

  it('indexe les endpoints actifs pour la résolution à l’émission', () => {
    expect(findIndex(WebhookEndpoint, { isActive: 1 })).toBeDefined()
  })

  it('applique les valeurs par défaut d’un endpoint neuf', () => {
    const endpoint = new WebhookEndpoint({
      name: 'Kuro',
      url: 'https://kuro.example.test/hooks/venio',
      secretEncrypted: 'v1:chiffre',
    })
    expect(endpoint.isActive).toBe(true)
    expect(endpoint.eventTypes).toEqual([])
    expect(endpoint.consecutiveFailures).toBe(0)
    expect(endpoint.disabledAt).toBeNull()
    expect(endpoint.disabledReason).toBeNull()
  })

  it('applique les valeurs par défaut d’une livraison neuve', () => {
    const delivery = new WebhookDelivery({
      endpoint: new WebhookEndpoint()._id,
      eventId: 'b3c1e0e4-0000-4000-8000-000000000000',
      eventType: 'TICKET_CREATED',
      payload: { id: 'x' },
    })
    expect(delivery.status).toBe('PENDING')
    expect(delivery.attempts).toEqual([])
    expect(delivery.nextRetryAt).toBeNull()
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-index-contract.test.ts`
Expected: FAIL — `Cannot find module './WebhookDelivery.js'`.

- [ ] **Step 3 : Créer `backend/src/models/WebhookEndpoint.ts`**

```ts
import mongoose, { Schema, type Document, type Types } from 'mongoose'

/**
 * WebhookEndpoint = un consommateur externe (Kuro en premier) abonné aux
 * événements sortants de Venio.
 *
 * Sécurité :
 *   - secretEncrypted : secret HMAC chiffré via lib/secretBox. Contrairement
 *     aux tokens entrants (hashés), il doit rester déchiffrable pour signer
 *     chaque envoi. Affiché en clair UNE SEULE FOIS à la création/rotation.
 *   - eventTypes vide = tous les types de notification.
 */

export const WEBHOOK_DISABLED_REASONS = ['AUTO_FAILURES', 'MANUAL'] as const
export type WebhookDisabledReason = (typeof WEBHOOK_DISABLED_REASONS)[number]

/** Nombre d'échecs consécutifs au-delà duquel l'endpoint s'auto-désactive. */
export const WEBHOOK_AUTO_DISABLE_THRESHOLD = 20

export interface IWebhookEndpoint extends Document {
  name: string
  url: string
  secretEncrypted: string
  eventTypes: string[]
  isActive: boolean
  consecutiveFailures: number
  disabledAt: Date | null
  disabledReason: WebhookDisabledReason | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  createdBy: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const webhookEndpointSchema = new Schema<IWebhookEndpoint>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    secretEncrypted: { type: String, required: true, select: false },
    eventTypes: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    consecutiveFailures: { type: Number, default: 0, min: 0 },
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, enum: [...WEBHOOK_DISABLED_REASONS, null], default: null },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
)

// Résolution des destinataires à chaque émission : filtre sur isActive.
webhookEndpointSchema.index({ isActive: 1 })

export default mongoose.model<IWebhookEndpoint>('WebhookEndpoint', webhookEndpointSchema)
```

- [ ] **Step 4 : Créer `backend/src/models/WebhookDelivery.ts`**

```ts
import mongoose, { Schema, type Document, type Types } from 'mongoose'

/**
 * WebhookDelivery = une tentative de livraison d'un événement vers UN
 * endpoint. Un même événement logique (eventId partagé) produit une delivery
 * par endpoint abonné.
 *
 * Le payload est figé à l'émission : c'est le corps JSON exact envoyé, donc
 * un rejeu renvoie strictement la même chose.
 */

export const WEBHOOK_DELIVERY_STATUSES = ['PENDING', 'DELIVERED', 'FAILED'] as const
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number]

/** Rétention du journal des livraisons (purge Mongo automatique). */
export const WEBHOOK_DELIVERY_TTL_DAYS = 30

export interface IWebhookDeliveryAttempt {
  at: Date
  httpStatus: number | null
  error: string
  durationMs: number
}

export interface IWebhookDelivery extends Document {
  endpoint: Types.ObjectId
  eventId: string
  eventType: string
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  attempts: IWebhookDeliveryAttempt[]
  nextRetryAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const attemptSchema = new Schema<IWebhookDeliveryAttempt>(
  {
    at: { type: Date, required: true },
    httpStatus: { type: Number, default: null },
    error: { type: String, default: '' },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false },
)

const webhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    endpoint: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: WEBHOOK_DELIVERY_STATUSES, default: 'PENDING' },
    attempts: { type: [attemptSchema], default: [] },
    nextRetryAt: { type: Date, default: null },
  },
  { timestamps: true },
)

// Journal par endpoint, du plus récent au plus ancien.
webhookDeliverySchema.index({ endpoint: 1, createdAt: -1 })
// Reprise par le job de retry : PENDING dont nextRetryAt est échu.
webhookDeliverySchema.index({ status: 1, nextRetryAt: 1 })
// Corrélation des livraisons d'un même événement (rejeu inclus).
webhookDeliverySchema.index({ eventId: 1 })
// Purge automatique après 30 jours.
webhookDeliverySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: WEBHOOK_DELIVERY_TTL_DAYS * 24 * 60 * 60 },
)

export default mongoose.model<IWebhookDelivery>('WebhookDelivery', webhookDeliverySchema)
```

- [ ] **Step 5 : Vérifier que le test passe**

Run: `npm --prefix backend test -- webhook-index-contract.test.ts`
Expected: PASS — 5 tests verts.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/models/WebhookEndpoint.ts backend/src/models/WebhookDelivery.ts backend/src/models/webhook-index-contract.test.ts && git commit -m "feat(webhooks): modeles WebhookEndpoint et WebhookDelivery avec TTL 30 jours"
```

---

### Task 3 : Validation d'URL et secret d'endpoint

**Files:**
- Create: `backend/src/lib/webhooks/urls.ts`
- Create: `backend/src/lib/webhooks/secret.ts`
- Test: `backend/src/__tests__/webhook-url-secret.test.ts` (créé)

**Interfaces:**
- Consumes: `encryptSecret` / `decryptSecret` de `backend/src/lib/secretBox.ts`.
- Produces:
  - `assertValidWebhookUrl(url: unknown): string` — retourne l'URL normalisée, throw `Error` avec message FR sinon.
  - `generateWebhookSecret(): string` — 64 caractères hex (32 octets).
  - `encryptWebhookSecret(plain: string): string`, `decryptWebhookSecret(stored: string): string`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-url-secret.test.ts` :

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { assertValidWebhookUrl } from '../lib/webhooks/urls.js'
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
} from '../lib/webhooks/secret.js'

const initialEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.NODE_ENV = initialEnv
})

describe('validation des URL de webhook', () => {
  it('accepte une URL https et la normalise', () => {
    expect(assertValidWebhookUrl(' https://kuro.example.test/hooks/venio ')).toBe(
      'https://kuro.example.test/hooks/venio',
    )
  })

  it('accepte http://localhost et http://127.0.0.1 hors production', () => {
    process.env.NODE_ENV = 'development'
    expect(assertValidWebhookUrl('http://localhost:4000/hooks')).toBe('http://localhost:4000/hooks')
    expect(assertValidWebhookUrl('http://127.0.0.1:4000/hooks')).toBe('http://127.0.0.1:4000/hooks')
  })

  it('refuse http://localhost en production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertValidWebhookUrl('http://localhost:4000/hooks')).toThrow(/https/i)
  })

  it('refuse une URL http externe même hors production', () => {
    process.env.NODE_ENV = 'development'
    expect(() => assertValidWebhookUrl('http://kuro.example.test/hooks')).toThrow(/https/i)
  })

  it('refuse un protocole non HTTP et une valeur non parsable', () => {
    expect(() => assertValidWebhookUrl('ftp://kuro.example.test/hooks')).toThrow(/https/i)
    expect(() => assertValidWebhookUrl('pas-une-url')).toThrow(/URL/i)
    expect(() => assertValidWebhookUrl(null)).toThrow(/URL/i)
  })
})

describe('secret d’endpoint', () => {
  it('génère 32 octets en hexadécimal, distincts à chaque appel', () => {
    const first = generateWebhookSecret()
    const second = generateWebhookSecret()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).not.toBe(first)
  })

  it('chiffre et déchiffre sans perte', () => {
    const secret = generateWebhookSecret()
    const stored = encryptWebhookSecret(secret)
    expect(stored).not.toBe(secret)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(decryptWebhookSecret(stored)).toBe(secret)
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-url-secret.test.ts`
Expected: FAIL — `Cannot find module '../lib/webhooks/urls.js'`.

- [ ] **Step 3 : Créer `backend/src/lib/webhooks/urls.ts`**

```ts
/**
 * Validation des URL de destination d'un webhook sortant.
 *
 * Règle : https obligatoire. Seule exception, réservée au développement et
 * aux tests : http vers la machine locale (localhost / 127.0.0.1 / [::1]).
 */

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase())
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Retourne l'URL normalisée (trim) ou throw une Error au message destiné à
 * l'admin (renvoyé tel quel en 400 par les routes).
 */
export function assertValidWebhookUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('URL requise')
  }
  const trimmed = url.trim()

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('URL invalide')
  }

  if (parsed.protocol === 'https:') return trimmed

  if (parsed.protocol === 'http:' && isLocalHostname(parsed.hostname) && !isProductionEnv()) {
    return trimmed
  }

  throw new Error('URL invalide : https requis (http toléré uniquement en local hors production)')
}
```

- [ ] **Step 4 : Créer `backend/src/lib/webhooks/secret.ts`**

```ts
import crypto from 'crypto'
import { decryptSecret, encryptSecret } from '../secretBox.js'

/**
 * Secret HMAC d'un endpoint : 32 octets aléatoires en hexadécimal, stocké
 * chiffré (AES-256-GCM via secretBox — clé CREDENTIALS_KEY). Il doit rester
 * déchiffrable pour signer chaque envoi, d'où le chiffrement plutôt qu'un
 * hash. Affiché en clair une seule fois, jamais loggé.
 */

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function encryptWebhookSecret(plain: string): string {
  return encryptSecret(plain)
}

export function decryptWebhookSecret(stored: string): string {
  return decryptSecret(stored)
}
```

- [ ] **Step 5 : Vérifier que le test passe**

Run: `npm --prefix backend test -- webhook-url-secret.test.ts`
Expected: PASS — 7 tests verts.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/lib/webhooks/urls.ts backend/src/lib/webhooks/secret.ts backend/src/__tests__/webhook-url-secret.test.ts && git commit -m "feat(webhooks): validation d'URL sortante et secret chiffre d'endpoint"
```

---

### Task 4 : Livraison signée, backoff et auto-désactivation

**Files:**
- Create: `backend/src/lib/webhooks/deliver.ts`
- Test: `backend/src/__tests__/webhook-delivery.test.ts` (créé)

**Interfaces:**
- Consumes: `computeSignature` de `backend/src/lib/external/hmac.ts` ; `decryptWebhookSecret` (Task 3) ; modèles de la Task 2 ; `notifySuperAdmins` de `backend/src/lib/notifyHelpers.ts` (importé dynamiquement pour éviter un cycle de modules).
- Produces:
  - `WEBHOOK_BACKOFF_MINUTES: readonly number[]` = `[1, 5, 30, 120, 720]`
  - `WEBHOOK_TIMEOUT_MS = 10_000`
  - `attemptDelivery(deliveryId: string | Types.ObjectId): Promise<DeliveryOutcome | null>` avec `interface DeliveryOutcome { ok: boolean; httpStatus: number | null; error: string; durationMs: number; status: WebhookDeliveryStatus }`
  - `processDueDeliveries(now: Date, limit?: number): Promise<{ processed: number; delivered: number; failed: number }>`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-delivery.test.ts` :

```ts
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/notifyHelpers.js', () => ({
  notifySuperAdmins: vi.fn(async () => {}),
  notifyInternalAdmins: vi.fn(async () => {}),
  notifyUsers: vi.fn(async () => {}),
}))

import Notification from '../models/Notification.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint, { WEBHOOK_AUTO_DISABLE_THRESHOLD } from '../models/WebhookEndpoint.js'
import { computeSignature } from '../lib/external/hmac.js'
import { encryptWebhookSecret } from '../lib/webhooks/secret.js'
import { attemptDelivery, processDueDeliveries, WEBHOOK_BACKOFF_MINUTES } from '../lib/webhooks/deliver.js'
import { notifySuperAdmins } from '../lib/notifyHelpers.js'

const SECRET = 'a'.repeat(64)

interface CapturedRequest {
  method: string
  headers: Record<string, string>
  rawBody: string
}

let server: http.Server
let baseUrl: string
let captured: CapturedRequest[]
let respondWith: { status: number; location?: string }

beforeAll(async () => {
  await setupMongo()
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => {
      captured.push({
        method: req.method || '',
        headers: req.headers as Record<string, string>,
        rawBody: Buffer.concat(chunks).toString('utf8'),
      })
      if (respondWith.location) res.setHeader('location', respondWith.location)
      res.statusCode = respondWith.status
      res.end('')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  captured = []
  respondWith = { status: 200 }
})

afterEach(() => {
  vi.useRealTimers()
})

async function seed(overrides: Record<string, unknown> = {}) {
  const endpoint = await WebhookEndpoint.create({
    name: 'Kuro',
    url: `${baseUrl}/hooks/venio`,
    secretEncrypted: encryptWebhookSecret(SECRET),
    ...overrides,
  })
  const delivery = await WebhookDelivery.create({
    endpoint: endpoint._id,
    eventId: 'b3c1e0e4-0000-4000-8000-000000000000',
    eventType: 'TICKET_CREATED',
    payload: {
      id: 'b3c1e0e4-0000-4000-8000-000000000000',
      type: 'TICKET_CREATED',
      occurredAt: '2026-08-26T10:00:00.000Z',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: {},
    },
  })
  return { endpoint, delivery }
}

describe('livraison d’un webhook', () => {
  it('signe le corps exact avec la convention HMAC de Venio', async () => {
    const { delivery } = await seed()

    const outcome = await attemptDelivery(delivery._id)

    expect(outcome?.ok).toBe(true)
    expect(captured).toHaveLength(1)
    const sent = captured[0]!
    expect(sent.method).toBe('POST')
    expect(sent.headers['content-type']).toContain('application/json')
    expect(sent.headers['x-venio-event']).toBe('TICKET_CREATED')
    expect(sent.headers['x-venio-delivery']).toBe(String(delivery._id))
    expect(sent.headers['x-venio-signature']).toBe(
      computeSignature(sent.headers['x-venio-timestamp']!, sent.rawBody, SECRET),
    )
    expect(JSON.parse(sent.rawBody)).toMatchObject({ type: 'TICKET_CREATED', link: '/admin/tickets' })
  })

  it('marque la livraison DELIVERED et remet la santé de l’endpoint à zéro', async () => {
    const { endpoint, delivery } = await seed({ consecutiveFailures: 7 })

    await attemptDelivery(delivery._id)

    const saved = await WebhookDelivery.findById(delivery._id)
    expect(saved?.status).toBe('DELIVERED')
    expect(saved?.nextRetryAt).toBeNull()
    expect(saved?.attempts).toHaveLength(1)
    expect(saved?.attempts[0]?.httpStatus).toBe(200)

    const savedEndpoint = await WebhookEndpoint.findById(endpoint._id)
    expect(savedEndpoint?.consecutiveFailures).toBe(0)
    expect(savedEndpoint?.lastSuccessAt).toBeInstanceOf(Date)
  })

  it('traite une redirection comme un échec, sans la suivre', async () => {
    respondWith = { status: 302, location: `${baseUrl}/ailleurs` }
    const { delivery } = await seed()

    const outcome = await attemptDelivery(delivery._id)

    expect(outcome?.ok).toBe(false)
    expect(captured).toHaveLength(1) // la redirection n'a pas été suivie
    expect((await WebhookDelivery.findById(delivery._id))?.status).toBe('PENDING')
  })

  it('suit le backoff 1/5/30/120/720 minutes puis bascule en FAILED', async () => {
    respondWith = { status: 500 }
    const { delivery } = await seed()

    for (const [index, minutes] of WEBHOOK_BACKOFF_MINUTES.entries()) {
      const before = Date.now()
      await attemptDelivery(delivery._id)
      const saved = await WebhookDelivery.findById(delivery._id)
      expect(saved?.status).toBe('PENDING')
      expect(saved?.attempts).toHaveLength(index + 1)
      const delayMs = saved!.nextRetryAt!.getTime() - before
      expect(delayMs).toBeGreaterThanOrEqual(minutes * 60_000 - 5_000)
      expect(delayMs).toBeLessThanOrEqual(minutes * 60_000 + 5_000)
    }

    await attemptDelivery(delivery._id)
    const exhausted = await WebhookDelivery.findById(delivery._id)
    expect(exhausted?.status).toBe('FAILED')
    expect(exhausted?.attempts).toHaveLength(WEBHOOK_BACKOFF_MINUTES.length + 1)
    expect(exhausted?.nextRetryAt).toBeNull()
  })

  it('désactive l’endpoint au 20e échec consécutif et notifie les super admins', async () => {
    respondWith = { status: 500 }
    const { endpoint, delivery } = await seed({
      consecutiveFailures: WEBHOOK_AUTO_DISABLE_THRESHOLD - 1,
    })

    await attemptDelivery(delivery._id)

    const saved = await WebhookEndpoint.findById(endpoint._id)
    expect(saved?.isActive).toBe(false)
    expect(saved?.disabledReason).toBe('AUTO_FAILURES')
    expect(saved?.disabledAt).toBeInstanceOf(Date)
    expect(notifySuperAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WEBHOOK_ENDPOINT_DISABLED', link: '/admin/webhooks' }),
    )
    // Anti-boucle : la notification d'un webhook ne produit aucune livraison.
    expect(await WebhookDelivery.countDocuments({ eventType: 'WEBHOOK_ENDPOINT_DISABLED' })).toBe(0)
    expect(await Notification.countDocuments()).toBe(0) // notifyHelpers est mocké ici
  })

  it('ne livre rien vers un endpoint désactivé', async () => {
    const { delivery } = await seed({ isActive: false, disabledReason: 'MANUAL' })

    const outcome = await attemptDelivery(delivery._id)

    expect(outcome?.ok).toBe(false)
    expect(captured).toHaveLength(0)
  })

  it('ne reprend que les livraisons PENDING dont le nextRetryAt est échu', async () => {
    const { endpoint } = await seed()
    const now = new Date('2026-08-26T12:00:00.000Z')
    const base = {
      endpoint: endpoint._id,
      eventType: 'TICKET_CREATED',
      payload: { id: 'x', type: 'TICKET_CREATED' },
    }
    const due = await WebhookDelivery.create({
      ...base,
      eventId: 'due',
      nextRetryAt: new Date(now.getTime() - 60_000),
    })
    await WebhookDelivery.create({
      ...base,
      eventId: 'future',
      nextRetryAt: new Date(now.getTime() + 60_000),
    })
    await WebhookDelivery.create({ ...base, eventId: 'failed', status: 'FAILED', nextRetryAt: new Date(0) })

    const result = await processDueDeliveries(now)

    expect(result.processed).toBe(1)
    expect(captured).toHaveLength(1)
    expect(captured[0]!.headers['x-venio-delivery']).toBe(String(due._id))
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-delivery.test.ts`
Expected: FAIL — `Cannot find module '../lib/webhooks/deliver.js'`.

- [ ] **Step 3 : Créer `backend/src/lib/webhooks/deliver.ts`**

```ts
import type { Types } from 'mongoose'
import { computeSignature } from '../external/hmac.js'
import logger from '../logger.js'
import WebhookDelivery, { type WebhookDeliveryStatus } from '../../models/WebhookDelivery.js'
import WebhookEndpoint, { WEBHOOK_AUTO_DISABLE_THRESHOLD } from '../../models/WebhookEndpoint.js'
import { decryptWebhookSecret } from './secret.js'

/**
 * Livraison d'un événement vers un endpoint.
 *
 * Contrat (cf. docs/superpowers/specs/2026-08-26-pipeline-webhooks-kuro-design.md) :
 *   - POST JSON, timeout 10 s, aucune redirection suivie (3xx = échec).
 *   - Le corps est sérialisé UNE SEULE FOIS : le même string sert à signer et
 *     à envoyer, sinon la signature ne se recalcule pas côté récepteur.
 *   - Signature : sha256=HEX(HMAC(secret, `${timestamp}.${rawBody}`)), soit
 *     exactement la convention de lib/external/hmac.ts utilisée en entrant.
 *   - Échec → backoff 1 min / 5 min / 30 min / 2 h / 12 h, puis FAILED.
 *   - 20 échecs consécutifs sur un endpoint → auto-désactivation + alerte.
 */

export const WEBHOOK_BACKOFF_MINUTES = [1, 5, 30, 120, 720] as const
export const WEBHOOK_TIMEOUT_MS = 10_000
const DEFAULT_RETRY_BATCH = 50

export interface DeliveryOutcome {
  ok: boolean
  httpStatus: number | null
  error: string
  durationMs: number
  status: WebhookDeliveryStatus
}

interface HttpAttemptResult {
  ok: boolean
  httpStatus: number | null
  error: string
  durationMs: number
}

async function postSigned(url: string, secret: string, rawBody: string, headers: Record<string, string>): Promise<HttpAttemptResult> {
  const startedAt = Date.now()
  const timestamp = Math.floor(startedAt / 1000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-venio-timestamp': String(timestamp),
        'x-venio-signature': computeSignature(timestamp, rawBody, secret),
        ...headers,
      },
      body: rawBody,
      // Une 3xx est un échec : on ne suit jamais une redirection sortante.
      redirect: 'manual',
      signal: controller.signal,
    })
    const ok = response.status >= 200 && response.status < 300
    return {
      ok,
      httpStatus: response.status,
      error: ok ? '' : `HTTP ${response.status}`,
      durationMs: Date.now() - startedAt,
    }
  } catch (err) {
    const message = (err as Error).name === 'AbortError' ? 'Timeout 10s' : (err as Error).message || 'Erreur réseau'
    return { ok: false, httpStatus: null, error: message.slice(0, 500), durationMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

async function registerSuccess(endpointId: Types.ObjectId): Promise<void> {
  await WebhookEndpoint.updateOne(
    { _id: endpointId },
    { $set: { consecutiveFailures: 0, lastSuccessAt: new Date() } },
  )
}

async function registerFailure(endpointId: Types.ObjectId, endpointName: string): Promise<void> {
  const updated = await WebhookEndpoint.findOneAndUpdate(
    { _id: endpointId },
    { $inc: { consecutiveFailures: 1 }, $set: { lastFailureAt: new Date() } },
    { new: true },
  )
  if (!updated || !updated.isActive) return
  if (updated.consecutiveFailures < WEBHOOK_AUTO_DISABLE_THRESHOLD) return

  await WebhookEndpoint.updateOne(
    { _id: endpointId },
    { $set: { isActive: false, disabledAt: new Date(), disabledReason: 'AUTO_FAILURES' } },
  )

  // Import dynamique : notifyHelpers → notifications → webhookEvents → ce
  // module. Le charger à l'exécution évite un cycle au chargement.
  const { notifySuperAdmins } = await import('../notifyHelpers.js')
  await notifySuperAdmins({
    type: 'WEBHOOK_ENDPOINT_DISABLED',
    title: `Webhook « ${endpointName} » désactivé`,
    message: `${WEBHOOK_AUTO_DISABLE_THRESHOLD} échecs consécutifs. Corrigez la destination puis réactivez l'endpoint.`,
    link: '/admin/webhooks',
    metadata: { endpointId: String(endpointId) },
  })
}

/**
 * Tente une livraison. Retourne null si la livraison n'existe pas ou n'est
 * plus en attente (déjà livrée ou épuisée).
 */
export async function attemptDelivery(deliveryId: string | Types.ObjectId): Promise<DeliveryOutcome | null> {
  const delivery = await WebhookDelivery.findById(deliveryId)
  if (!delivery || delivery.status !== 'PENDING') return null

  const endpoint = await WebhookEndpoint.findById(delivery.endpoint).select('+secretEncrypted')

  let attempt: HttpAttemptResult
  if (!endpoint) {
    attempt = { ok: false, httpStatus: null, error: 'Endpoint supprimé', durationMs: 0 }
  } else if (!endpoint.isActive) {
    attempt = { ok: false, httpStatus: null, error: 'Endpoint désactivé', durationMs: 0 }
  } else {
    const secret = decryptWebhookSecret(endpoint.secretEncrypted)
    if (!secret) {
      attempt = { ok: false, httpStatus: null, error: 'Secret illisible', durationMs: 0 }
    } else {
      attempt = await postSigned(endpoint.url, secret, JSON.stringify(delivery.payload), {
        'x-venio-event': delivery.eventType,
        'x-venio-delivery': String(delivery._id),
      })
    }
  }

  delivery.attempts.push({
    at: new Date(),
    httpStatus: attempt.httpStatus,
    error: attempt.error,
    durationMs: attempt.durationMs,
  })

  if (attempt.ok) {
    delivery.status = 'DELIVERED'
    delivery.nextRetryAt = null
  } else {
    const backoffMinutes = WEBHOOK_BACKOFF_MINUTES[delivery.attempts.length - 1]
    if (backoffMinutes === undefined) {
      delivery.status = 'FAILED'
      delivery.nextRetryAt = null
    } else {
      delivery.nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000)
    }
  }
  await delivery.save()

  // La santé de l'endpoint ne bouge que si la tentative a réellement été
  // émise : un endpoint désactivé ou supprimé n'accumule pas d'échecs.
  if (endpoint && endpoint.isActive) {
    if (attempt.ok) await registerSuccess(endpoint._id as Types.ObjectId)
    else await registerFailure(endpoint._id as Types.ObjectId, endpoint.name)
  }

  return { ...attempt, status: delivery.status }
}

/**
 * Reprend les livraisons en attente dont le retry est échu (lot borné).
 */
export async function processDueDeliveries(
  now: Date,
  limit: number = DEFAULT_RETRY_BATCH,
): Promise<{ processed: number; delivered: number; failed: number }> {
  const due = await WebhookDelivery.find({ status: 'PENDING', nextRetryAt: { $ne: null, $lte: now } })
    .sort({ nextRetryAt: 1 })
    .limit(limit)
    .select('_id')
    .lean()

  let delivered = 0
  let failed = 0
  const results = await Promise.allSettled(due.map((d) => attemptDelivery(d._id)))
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ data: { err: String(result.reason) } }, '[webhooks] retry en erreur')
      continue
    }
    if (result.value?.status === 'DELIVERED') delivered += 1
    else if (result.value?.status === 'FAILED') failed += 1
  }

  return { processed: due.length, delivered, failed }
}
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `npm --prefix backend test -- webhook-delivery.test.ts`
Expected: PASS — 7 tests verts.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/lib/webhooks/deliver.ts backend/src/__tests__/webhook-delivery.test.ts && git commit -m "feat(webhooks): livraison signee avec backoff et auto-desactivation"
```

---

### Task 5 : Émission — `emitWebhookEvent` (filtres, anti-boucle, fan-out)

**Files:**
- Create: `backend/src/lib/webhookEvents.ts`
- Test: `backend/src/__tests__/webhook-emit.test.ts` (créé)

**Interfaces:**
- Consumes: `attemptDelivery` (Task 4), modèles (Task 2), `NotificationType` (Task 1).
- Produces:
  - `interface WebhookEventInput { type: NotificationType; title: string; message?: string; link?: string; metadata?: Record<string, unknown> }`
  - `interface EmittedWebhookEvent { eventId: string; deliveryIds: string[] }`
  - `emitWebhookEvent(input: WebhookEventInput): Promise<EmittedWebhookEvent | null>` — crée les livraisons (awaité) puis déclenche les tentatives HTTP sans les attendre ; `null` si le type est exclu.
  - `emitWebhookEventInBackground(input: WebhookEventInput): void` — appel non bloquant destiné à `createNotification` / `notifyHelpers`.
  - `buildWebhookPayload(eventId: string, input: WebhookEventInput, occurredAt: Date): Record<string, unknown>`

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-emit.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => null),
  processDueDeliveries: vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 })),
}))

import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { encryptWebhookSecret } from '../lib/webhooks/secret.js'
import { emitWebhookEvent } from '../lib/webhookEvents.js'
import { attemptDelivery } from '../lib/webhooks/deliver.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
})

async function endpoint(name: string, overrides: Record<string, unknown> = {}) {
  return WebhookEndpoint.create({
    name,
    url: `https://${name}.example.test/hooks`,
    secretEncrypted: encryptWebhookSecret('b'.repeat(64)),
    ...overrides,
  })
}

describe('emitWebhookEvent', () => {
  it('crée une livraison par endpoint abonné et partage le même eventId', async () => {
    await endpoint('kuro')
    await endpoint('miroir')

    const emitted = await emitWebhookEvent({
      type: 'TICKET_CREATED',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: { ticketId: '12' },
    })

    expect(emitted?.deliveryIds).toHaveLength(2)
    const deliveries = await WebhookDelivery.find().lean()
    expect(deliveries).toHaveLength(2)
    expect(new Set(deliveries.map((d) => d.eventId)).size).toBe(1)
    expect(deliveries[0]!.eventId).toBe(emitted!.eventId)
    expect(deliveries.every((d) => d.status === 'PENDING')).toBe(true)
    expect(attemptDelivery).toHaveBeenCalledTimes(2)
  })

  it('fige un payload conforme au contrat', async () => {
    await endpoint('kuro')

    const emitted = await emitWebhookEvent({
      type: 'TICKET_CREATED',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: { ticketId: '12' },
    })

    const delivery = await WebhookDelivery.findOne().lean()
    expect(delivery!.payload).toEqual({
      id: emitted!.eventId,
      type: 'TICKET_CREATED',
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: { ticketId: '12' },
    })
  })

  it('respecte le filtre eventTypes de chaque endpoint', async () => {
    const filtre = await endpoint('filtre', { eventTypes: ['BILLING_INVOICE_CREATED'] })
    const tous = await endpoint('tous', { eventTypes: [] })

    await emitWebhookEvent({ type: 'TICKET_CREATED', title: 'Ticket' })

    const deliveries = await WebhookDelivery.find().lean()
    expect(deliveries).toHaveLength(1)
    expect(String(deliveries[0]!.endpoint)).toBe(String(tous._id))
    expect(await WebhookDelivery.countDocuments({ endpoint: filtre._id })).toBe(0)

    await emitWebhookEvent({ type: 'BILLING_INVOICE_CREATED', title: 'Facture' })
    expect(await WebhookDelivery.countDocuments({ endpoint: filtre._id })).toBe(1)
  })

  it('ignore les endpoints désactivés', async () => {
    await endpoint('coupe', { isActive: false, disabledReason: 'MANUAL' })

    const emitted = await emitWebhookEvent({ type: 'TICKET_CREATED', title: 'Ticket' })

    expect(emitted?.deliveryIds).toEqual([])
    expect(await WebhookDelivery.countDocuments()).toBe(0)
    expect(attemptDelivery).not.toHaveBeenCalled()
  })

  it('n’émet jamais d’événement à propos des webhooks eux-mêmes', async () => {
    await endpoint('kuro')

    expect(await emitWebhookEvent({ type: 'WEBHOOK_ENDPOINT_DISABLED', title: 'Coupé' })).toBeNull()
    expect(await emitWebhookEvent({ type: 'WEBHOOK_TEST', title: 'Test' })).toBeNull()
    expect(await WebhookDelivery.countDocuments()).toBe(0)
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-emit.test.ts`
Expected: FAIL — `Cannot find module '../lib/webhookEvents.js'`.

- [ ] **Step 3 : Créer `backend/src/lib/webhookEvents.ts`**

```ts
import crypto from 'crypto'
import type { NotificationType } from '../types/enums.js'
import logger from './logger.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { attemptDelivery } from './webhooks/deliver.js'

/**
 * Point d'entrée du pipeline sortant : transforme un événement de
 * notification en une livraison par endpoint abonné.
 *
 * Règles d'émission (cf. spec) — appliquées par les APPELANTS :
 *   1. createNotification({ skipWebhook: true }) n'émet jamais.
 *   2. Les broadcasts de notifyHelpers émettent UNE fois, inconditionnellement.
 *   3. createNotification direct sans dedupeKey émet après la tentative de
 *      création, même si la préférence in-app a bloqué la ligne.
 *   4. createNotification direct avec dedupeKey n'émet que si une ligne a été
 *      créée (une mise à jour d'alerte non lue ne réémet rien).
 *
 * Règle appliquée ICI : anti-boucle. Un événement WEBHOOK_* ne repart jamais
 * dans le pipeline, sinon un endpoint en panne s'auto-alimente.
 */

export interface WebhookEventInput {
  type: NotificationType
  title: string
  message?: string
  link?: string
  metadata?: Record<string, unknown>
}

export interface EmittedWebhookEvent {
  eventId: string
  deliveryIds: string[]
}

function isLoopType(type: string): boolean {
  return type.startsWith('WEBHOOK_')
}

export function buildWebhookPayload(
  eventId: string,
  input: WebhookEventInput,
  occurredAt: Date,
): Record<string, unknown> {
  return {
    id: eventId,
    type: input.type,
    occurredAt: occurredAt.toISOString(),
    title: input.title,
    message: input.message || '',
    link: input.link || '',
    metadata: input.metadata || {},
  }
}

/**
 * Crée les livraisons (awaité) puis déclenche les tentatives HTTP sans les
 * attendre. Retourne null si le type est exclu du pipeline.
 */
export async function emitWebhookEvent(input: WebhookEventInput): Promise<EmittedWebhookEvent | null> {
  if (isLoopType(input.type)) return null

  const endpoints = await WebhookEndpoint.find({
    isActive: true,
    $or: [{ eventTypes: { $size: 0 } }, { eventTypes: input.type }],
  })
    .select('_id')
    .lean()

  const eventId = crypto.randomUUID()
  if (endpoints.length === 0) return { eventId, deliveryIds: [] }

  const payload = buildWebhookPayload(eventId, input, new Date())
  const deliveries = await WebhookDelivery.insertMany(
    endpoints.map((endpoint) => ({
      endpoint: endpoint._id,
      eventId,
      eventType: input.type,
      payload,
    })),
  )

  // Fire-and-forget : l'appelant métier ne doit jamais attendre le réseau.
  void Promise.allSettled(deliveries.map((delivery) => attemptDelivery(delivery._id)))

  return { eventId, deliveryIds: deliveries.map((delivery) => String(delivery._id)) }
}

/** Variante non bloquante pour les points d'émission métier. */
export function emitWebhookEventInBackground(input: WebhookEventInput): void {
  void emitWebhookEvent(input).catch((err) => {
    logger.warn({ data: { type: input.type, err: (err as Error).message } }, '[webhooks] emission fail')
  })
}
```

- [ ] **Step 4 : Vérifier que le test passe**

Run: `npm --prefix backend test -- webhook-emit.test.ts`
Expected: PASS — 5 tests verts.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/lib/webhookEvents.ts backend/src/__tests__/webhook-emit.test.ts && git commit -m "feat(webhooks): emission des evenements avec filtres et anti-boucle"
```

---

### Task 6 : Branchement sur les notifications — dédup des broadcasts

**Files:**
- Modify: `backend/src/lib/notifications.ts` (interface `CreateNotificationParams`, fin de `createNotification`)
- Modify: `backend/src/lib/notifyHelpers.ts` (les trois broadcasts)
- Test: `backend/src/__tests__/webhook-notification-dedup.test.ts` (créé)

**Interfaces:**
- Consumes: `emitWebhookEventInBackground` (Task 5).
- Produces: `createNotification({ …, skipWebhook?: boolean })` — `skipWebhook: true` supprime toute émission ; les broadcasts `notifySuperAdmins` / `notifyInternalAdmins` / `notifyUsers` émettent l'événement une seule fois avant leur fan-out.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-notification-dedup.test.ts` :

```ts
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const shouldNotifyMock = vi.fn(async () => true)

vi.mock('../lib/notificationPreferences.js', () => ({
  shouldNotify: (...args: unknown[]) => shouldNotifyMock(...(args as [])),
}))
vi.mock('../lib/webPush.js', () => ({ sendPushToUser: vi.fn(async () => {}) }))
vi.mock('../realtime/ioSingleton.js', () => ({ getIo: vi.fn(() => null) }))
vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => null),
  processDueDeliveries: vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 })),
}))

import User from '../models/User.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { encryptWebhookSecret } from '../lib/webhooks/secret.js'
import { createNotification } from '../lib/notifications.js'
import { notifyInternalAdmins, notifySuperAdmins, notifyUsers } from '../lib/notifyHelpers.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  shouldNotifyMock.mockImplementation(async () => true)
  await WebhookEndpoint.create({
    name: 'Kuro',
    url: 'https://kuro.example.test/hooks',
    secretEncrypted: encryptWebhookSecret('c'.repeat(64)),
  })
})

async function seedSuperAdmins(count: number): Promise<string[]> {
  const admins = await User.create(
    Array.from({ length: count }, (_, index) => ({
      name: `Admin ${index}`,
      email: `admin${index}@example.test`,
      passwordHash: 'x',
      role: 'SUPER_ADMIN',
      isActive: true,
    })),
  )
  return admins.map((admin) => String(admin._id))
}

const waitForDeliveries = (count: number) =>
  vi.waitFor(async () => expect(await WebhookDelivery.countDocuments()).toBe(count))

describe('dédup du pipeline face aux broadcasts', () => {
  it('n’émet qu’une livraison par endpoint quand 3 super admins sont notifiés', async () => {
    const admins = await seedSuperAdmins(3)

    await notifySuperAdmins({
      type: 'TICKET_CREATED',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
    })

    await waitForDeliveries(1)
    expect(
      await mongoose.model('Notification').countDocuments({ recipient: { $in: admins } }),
    ).toBe(3)
  })

  it('n’émet qu’une livraison pour notifyInternalAdmins et pour notifyUsers', async () => {
    const admins = await seedSuperAdmins(2)

    await notifyInternalAdmins({ type: 'TICKET_CREATED', title: 'Interne' })
    await waitForDeliveries(1)

    await notifyUsers(admins, { type: 'TICKET_CREATED', title: 'Ciblé' })
    await waitForDeliveries(2)
  })

  it('émet même quand la préférence in-app coupe la notification', async () => {
    const [admin] = await seedSuperAdmins(1)
    shouldNotifyMock.mockImplementation(async () => false)

    await notifySuperAdmins({ type: 'TICKET_CREATED', title: 'Broadcast coupé' })
    await waitForDeliveries(1)

    await createNotification({ recipient: admin!, type: 'TICKET_CREATED', title: 'Direct coupé' })
    await waitForDeliveries(2)
    expect(await mongoose.model('Notification').countDocuments()).toBe(0)
  })

  it('émet une livraison pour un createNotification direct', async () => {
    const [admin] = await seedSuperAdmins(1)

    await createNotification({ recipient: admin!, type: 'TICKET_CREATED', title: 'Direct' })

    await waitForDeliveries(1)
  })

  it('n’émet rien quand skipWebhook est demandé', async () => {
    const [admin] = await seedSuperAdmins(1)

    await createNotification({
      recipient: admin!,
      type: 'TICKET_CREATED',
      title: 'Silencieux',
      skipWebhook: true,
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await WebhookDelivery.countDocuments()).toBe(0)
  })

  it('n’émet pas une seconde fois quand un dedupeKey met à jour une alerte non lue', async () => {
    const [admin] = await seedSuperAdmins(1)

    await createNotification({
      recipient: admin!,
      type: 'TASK_UPDATED',
      title: 'Tâche en retard',
      dedupeKey: 'crm:task-overdue:task-1',
    })
    await waitForDeliveries(1)

    await createNotification({
      recipient: admin!,
      type: 'TASK_UPDATED',
      title: 'Tâche toujours en retard',
      dedupeKey: 'crm:task-overdue:task-1',
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await WebhookDelivery.countDocuments()).toBe(1)
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-notification-dedup.test.ts`
Expected: FAIL — aucune livraison créée (`expected 0 to be 1`), et TypeScript refuse `skipWebhook`.

- [ ] **Step 3 : Brancher `createNotification`**

Dans `backend/src/lib/notifications.ts`, ajouter l'import :

```ts
import { emitWebhookEventInBackground } from './webhookEvents.js'
```

Ajouter le champ à `CreateNotificationParams`, après `dedupeKey` :

```ts
  /**
   * Réservé aux broadcasts de notifyHelpers : ils émettent l'événement
   * sortant UNE fois pour tout le fan-out, donc chaque createNotification
   * interne doit rester muet côté webhooks.
   */
  skipWebhook?: boolean
```

Ajouter le paramètre à la déstructuration de la signature :

```ts
export async function createNotification({
  recipient,
  type,
  title,
  message,
  link,
  metadata,
  dedupeKey,
  skipWebhook,
}: CreateNotificationParams) {
```

Puis, juste avant le `return notification` final :

```ts
  // Pipeline sortant. Règle 1 : les broadcasts ont déjà émis pour tout le
  // fan-out. Règle 4 : une alerte à dedupeKey ne réémet que si une ligne a
  // été créée. Règle 3 : sans dedupeKey, on émet même si la préférence
  // in-app a empêché la création — le filtre du pipeline, c'est eventTypes.
  if (!skipWebhook && (!normalizedDedupeKey || created)) {
    emitWebhookEventInBackground({ type, title, message, link, metadata })
  }
```

- [ ] **Step 4 : Brancher les trois broadcasts**

Dans `backend/src/lib/notifyHelpers.ts`, ajouter l'import :

```ts
import { emitWebhookEventInBackground } from './webhookEvents.js'
```

Dans `notifySuperAdmins`, en toute première ligne du corps :

```ts
  // Un événement logique = une livraison par endpoint, pas une par
  // destinataire : on émet ici, les createNotification en aval sont muets.
  emitWebhookEventInBackground({ type, title, message, link, metadata })
```

et ajouter `skipWebhook: true,` à l'objet passé à `createNotification` (après `metadata,`).

Répéter à l'identique dans `notifyInternalAdmins`.

Dans `notifyUsers`, en toute première ligne du corps (avant le calcul de `cleanIds`) :

```ts
  emitWebhookEventInBackground({
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link,
    metadata: params.metadata,
  })
```

et ajouter `skipWebhook: true,` à son `createNotification` (après `metadata: params.metadata,`).

- [ ] **Step 5 : Vérifier les tests de notification**

Run: `npm --prefix backend test -- webhook-notification-dedup.test.ts notifications-dedup.test.ts`
Expected: PASS — 6 nouveaux tests verts, `notifications-dedup.test.ts` toujours vert (il ne crée aucun endpoint, donc aucune livraison).

- [ ] **Step 6 : Commit**

```bash
git add backend/src/lib/notifications.ts backend/src/lib/notifyHelpers.ts backend/src/__tests__/webhook-notification-dedup.test.ts && git commit -m "feat(webhooks): emettre une fois par evenement, jamais par destinataire"
```

---

### Task 7 : Automation cron de reprise des livraisons

**Files:**
- Modify: `backend/src/automation/scheduler.ts:16-42` (export + format « toutes les N minutes »)
- Create: `backend/src/automation/jobs/webhookDeliveryRetry.ts`
- Modify: `backend/src/automation/index.ts` (import + appel de `register`)
- Test: `backend/src/__tests__/webhook-retry-job.test.ts` (créé)

**Interfaces:**
- Consumes: `processDueDeliveries` (Task 4), `registerAutomation` / `AutomationDefinition` du moteur existant.
- Produces:
  - `shouldRunNow(schedule: string | undefined, now: Date): boolean` **exportée** depuis `scheduler.ts`, acceptant en plus les expressions cron `* * * * *` et `*/N * * * *`.
  - `backend/src/automation/jobs/webhookDeliveryRetry.ts` : `export const definition: AutomationDefinition` (clé `webhooks.delivery_retry`, `schedule: '* * * * *'`) et `export function register(): void`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-retry-job.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => null),
  processDueDeliveries: vi.fn(async () => ({ processed: 3, delivered: 2, failed: 1 })),
}))

import { shouldRunNow } from '../automation/scheduler.js'
import { getAutomation, getCronAutomations } from '../automation/registry.js'
import { buildContext } from '../automation/engine.js'
import { definition, register } from '../automation/jobs/webhookDeliveryRetry.js'
import { processDueDeliveries } from '../lib/webhooks/deliver.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
})

describe('planification à la minute', () => {
  it('déclenche une expression cron "toutes les minutes" à chaque tick', () => {
    expect(shouldRunNow('* * * * *', new Date('2026-08-26T10:00:00'))).toBe(true)
    expect(shouldRunNow('* * * * *', new Date('2026-08-26T10:37:00'))).toBe(true)
  })

  it('respecte un pas "*/5"', () => {
    expect(shouldRunNow('*/5 * * * *', new Date('2026-08-26T10:05:00'))).toBe(true)
    expect(shouldRunNow('*/5 * * * *', new Date('2026-08-26T10:07:00'))).toBe(false)
  })

  it('conserve les formats horaires existants', () => {
    expect(shouldRunNow('08:00', new Date('2026-08-26T08:00:00'))).toBe(true)
    expect(shouldRunNow('08:00', new Date('2026-08-26T08:01:00'))).toBe(false)
    expect(shouldRunNow(undefined, new Date())).toBe(false)
  })
})

describe('automation webhooks.delivery_retry', () => {
  it('s’enregistre comme automation cron du moteur', () => {
    register()
    expect(getAutomation('webhooks.delivery_retry')).toBeDefined()
    expect(getCronAutomations().map((job) => job.key)).toContain('webhooks.delivery_retry')
    expect(definition.schedule).toBe('* * * * *')
    expect(definition.triggerType).toBe('cron')
  })

  it('produit une clé d’idempotence distincte à chaque minute', () => {
    const first = definition.buildIdempotencyKey({
      ...buildContext(),
      now: new Date('2026-08-26T10:00:00'),
      dateKey: '2026-08-26',
    })
    const second = definition.buildIdempotencyKey({
      ...buildContext(),
      now: new Date('2026-08-26T10:01:00'),
      dateKey: '2026-08-26',
    })
    expect(first).not.toBe(second)
    expect(first).toContain('webhooks.delivery_retry')
  })

  it('reprend les livraisons échues par lot borné et rend compte du résultat', async () => {
    const ctx = buildContext()
    const result = await definition.execute(ctx)

    expect(processDueDeliveries).toHaveBeenCalledWith(ctx.now, 50)
    expect(result.details).toMatchObject({ processed: 3, delivered: 2, failed: 1 })
    expect(result.actionsExecuted).toContain('webhooks:retry:3')
    expect(result.recipientsNotified).toEqual([])
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-retry-job.test.ts`
Expected: FAIL — `shouldRunNow` n'est pas exportée et `webhookDeliveryRetry.js` n'existe pas.

- [ ] **Step 3 : Étendre le scheduler**

Dans `backend/src/automation/scheduler.ts`, remplacer l'en-tête de `shouldRunNow` et son commentaire par :

```ts
/**
 * Parse schedule string and check if it should run now.
 * Supports: "HH:MM", "monday:HH:MM", "daily HH:MM", "* * * * *", "*\/N * * * *"
 */
export function shouldRunNow(schedule: string | undefined, now: Date): boolean {
  if (!schedule) return false

  // Expressions cron à la minute : le tick du scheduler étant de 60 s, une
  // expression "* * * * *" est due à chaque passage, "*/N" une minute sur N.
  const everyMinute = schedule.match(/^\*(?:\/(\d{1,2}))?\s+\*\s+\*\s+\*\s+\*$/)
  if (everyMinute) {
    const step = Number(everyMinute[1] || 1)
    if (!Number.isFinite(step) || step <= 1) return true
    return now.getMinutes() % step === 0
  }

  const hours = now.getHours()
```

(le reste de la fonction est inchangé).

- [ ] **Step 4 : Créer `backend/src/automation/jobs/webhookDeliveryRetry.ts`**

```ts
// ─────────────────────────────────────────────────────────────
// webhooks.delivery_retry
// Reprend les livraisons de webhooks en attente dont le backoff est échu.
// ─────────────────────────────────────────────────────────────

import { registerAutomation } from '../registry.js'
import { processDueDeliveries } from '../../lib/webhooks/deliver.js'
import type { AutomationContext, AutomationDefinition, AutomationResult } from '../types.js'

/** Lot maximum repris par exécution, pour borner la charge d'une minute. */
const BATCH_SIZE = 50

export const definition: AutomationDefinition = {
  key: 'webhooks.delivery_retry',
  title: 'Reprise des livraisons de webhooks',
  domain: 'webhooks',
  triggerType: 'cron',
  schedule: '* * * * *',
  channels: ['system_log'],
  recipientStrategy: [],
  retryable: false,
  maxRetries: 0,
  defaultEnabled: true,
  permissionsScope: ['SUPER_ADMIN'],

  // Une exécution par minute : la clé porte la minute, sinon le verrou
  // d'idempotence bloquerait toutes les reprises de la journée.
  buildIdempotencyKey: (ctx) =>
    `webhooks.delivery_retry:${ctx.dateKey}:${String(ctx.now.getHours()).padStart(2, '0')}:${String(
      ctx.now.getMinutes(),
    ).padStart(2, '0')}`,

  evaluate: async () => true,

  execute: async (ctx: AutomationContext): Promise<AutomationResult> => {
    const result = await processDueDeliveries(ctx.now, BATCH_SIZE)
    return {
      actionsExecuted: [`webhooks:retry:${result.processed}`],
      recipientsNotified: [],
      details: result,
    }
  },
}

export function register() {
  registerAutomation(definition)
}
```

- [ ] **Step 5 : Enregistrer le job au démarrage**

Dans `backend/src/automation/index.ts`, ajouter l'import après le bloc « Interns » :

```ts
// Webhooks sortants
import { register as registerWebhookDeliveryRetry } from './jobs/webhookDeliveryRetry.js'
```

et l'appel à la fin de la liste des `register…()` dans `initAutomationEngine` :

```ts
  // ── Webhooks sortants ─────────────────────────────────────
  registerWebhookDeliveryRetry()
```

- [ ] **Step 6 : Vérifier que les tests passent**

Run: `npm --prefix backend test -- webhook-retry-job.test.ts automation.test.ts`
Expected: PASS — 7 nouveaux tests verts, `automation.test.ts` inchangé.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/automation/scheduler.ts backend/src/automation/jobs/webhookDeliveryRetry.ts backend/src/automation/index.ts backend/src/__tests__/webhook-retry-job.test.ts && git commit -m "feat(webhooks): automation cron de reprise des livraisons echues"
```

---

### Task 8 : API admin `/api/admin/webhooks`

**Files:**
- Create: `backend/src/routes/admin/webhooks.ts`
- Modify: `backend/src/index.ts` (import + `app.use`)
- Test: `backend/src/__tests__/webhook-admin-routes.test.ts` (créé)

**Interfaces:**
- Consumes: `assertValidWebhookUrl` (Task 3), `generateWebhookSecret` / `encryptWebhookSecret` (Task 3), `attemptDelivery` (Task 4), modèles (Task 2), `PERMISSIONS` (Task 1), `recordAudit` / `buildActorFromReq`, middlewares `auth`, `requireAdmin`, `requirePermission`.
- Produces: routeur Express monté sur `/api/admin/webhooks`. Formes de réponse :
  - `GET /` → `{ endpoints: Array<PublicEndpoint> }` où `PublicEndpoint` = document sans `secretEncrypted`.
  - `POST /` → `201 { endpoint: PublicEndpoint, secret: string }` (secret en clair, unique fois).
  - `PATCH /:id` → `{ endpoint: PublicEndpoint }`.
  - `POST /:id/rotate-secret` → `{ endpoint: PublicEndpoint, secret: string }`.
  - `POST /:id/test` → `{ delivery: IWebhookDelivery, outcome: DeliveryOutcome | null }`.
  - `DELETE /:id` → `{ ok: true, deletedDeliveries: number }`.
  - `GET /:id/deliveries?status&eventType&page&limit` → `{ deliveries, total, page, pages }` (payload exclu).
  - `GET /deliveries/:deliveryId` → `{ delivery }` (payload + tentatives).
  - `POST /deliveries/:deliveryId/replay` → `201 { delivery, outcome }`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `backend/src/__tests__/webhook-admin-routes.test.ts` :

```ts
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => ({
    ok: true,
    httpStatus: 200,
    error: '',
    durationMs: 12,
    status: 'DELIVERED',
  })),
  processDueDeliveries: vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 })),
}))

import { createSession } from '../lib/session.js'
import AuditLog from '../models/AuditLog.js'
import User from '../models/User.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { decryptWebhookSecret, encryptWebhookSecret } from '../lib/webhooks/secret.js'
import adminWebhookRoutes from '../routes/admin/webhooks.js'
import { attemptDelivery } from '../lib/webhooks/deliver.js'

let app: Express
let superAdminCookie: string
let adminCookie: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/webhooks', adminWebhookRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  const passwordHash = await bcrypt.hash('test', 4)
  const [superAdmin, admin] = await User.create([
    { name: 'Super', email: 'super@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'ADMIN' },
  ])
  superAdminCookie = await cookieFor(String(superAdmin!._id))
  adminCookie = await cookieFor(String(admin!._id))
})

async function seedEndpoint(overrides: Record<string, unknown> = {}) {
  return WebhookEndpoint.create({
    name: 'Kuro',
    url: 'https://kuro.example.test/hooks',
    secretEncrypted: encryptWebhookSecret('d'.repeat(64)),
    ...overrides,
  })
}

describe('RBAC des routes webhooks', () => {
  it('refuse un ADMIN sans permission et un anonyme', async () => {
    await request(app).get('/api/admin/webhooks').expect(401)
    await request(app).get('/api/admin/webhooks').set('Cookie', adminCookie).expect(403)
    await request(app)
      .post('/api/admin/webhooks')
      .set('Cookie', adminCookie)
      .send({ name: 'X', url: 'https://x.example.test/h' })
      .expect(403)
  })
})

describe('CRUD des endpoints', () => {
  it('crée un endpoint et révèle le secret une seule fois', async () => {
    const created = await request(app)
      .post('/api/admin/webhooks')
      .set('Cookie', superAdminCookie)
      .send({ name: 'Kuro', url: 'https://kuro.example.test/hooks', eventTypes: ['TICKET_CREATED'] })
      .expect(201)

    expect(created.body.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(created.body.endpoint.secretEncrypted).toBeUndefined()
    expect(created.body.endpoint.eventTypes).toEqual(['TICKET_CREATED'])

    const stored = await WebhookEndpoint.findById(created.body.endpoint._id).select('+secretEncrypted')
    expect(decryptWebhookSecret(stored!.secretEncrypted)).toBe(created.body.secret)

    const listed = await request(app).get('/api/admin/webhooks').set('Cookie', superAdminCookie).expect(200)
    expect(listed.body.endpoints).toHaveLength(1)
    expect(JSON.stringify(listed.body)).not.toContain(created.body.secret)
    expect(listed.body.endpoints[0].secretEncrypted).toBeUndefined()

    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_CREATE' })).toBe(1)
  })

  it('refuse une URL non https hors localhost', async () => {
    const response = await request(app)
      .post('/api/admin/webhooks')
      .set('Cookie', superAdminCookie)
      .send({ name: 'Clair', url: 'http://kuro.example.test/hooks' })
      .expect(400)
    expect(response.body.error).toMatch(/https/i)
    expect(await WebhookEndpoint.countDocuments()).toBe(0)
  })

  it('met à jour un endpoint et remet la santé à zéro à la réactivation', async () => {
    const endpoint = await seedEndpoint({
      isActive: false,
      consecutiveFailures: 20,
      disabledReason: 'AUTO_FAILURES',
      disabledAt: new Date(),
    })

    const response = await request(app)
      .patch(`/api/admin/webhooks/${endpoint._id}`)
      .set('Cookie', superAdminCookie)
      .send({ name: 'Kuro prod', isActive: true })
      .expect(200)

    expect(response.body.endpoint.name).toBe('Kuro prod')
    expect(response.body.endpoint.isActive).toBe(true)
    expect(response.body.endpoint.consecutiveFailures).toBe(0)
    expect(response.body.endpoint.disabledReason).toBeNull()
    expect(response.body.endpoint.disabledAt).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_UPDATE' })).toBe(1)
  })

  it('marque une désactivation manuelle', async () => {
    const endpoint = await seedEndpoint()

    const response = await request(app)
      .patch(`/api/admin/webhooks/${endpoint._id}`)
      .set('Cookie', superAdminCookie)
      .send({ isActive: false })
      .expect(200)

    expect(response.body.endpoint.disabledReason).toBe('MANUAL')
  })

  it('régénère le secret et ne le renvoie qu’une fois', async () => {
    const endpoint = await seedEndpoint()

    const response = await request(app)
      .post(`/api/admin/webhooks/${endpoint._id}/rotate-secret`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(response.body.secret).not.toBe('d'.repeat(64))
    const stored = await WebhookEndpoint.findById(endpoint._id).select('+secretEncrypted')
    expect(decryptWebhookSecret(stored!.secretEncrypted)).toBe(response.body.secret)
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_ROTATE' })).toBe(1)
  })

  it('supprime l’endpoint et son journal', async () => {
    const endpoint = await seedEndpoint()
    await WebhookDelivery.create({
      endpoint: endpoint._id,
      eventId: 'e1',
      eventType: 'TICKET_CREATED',
      payload: { id: 'e1' },
    })

    const response = await request(app)
      .delete(`/api/admin/webhooks/${endpoint._id}`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.deletedDeliveries).toBe(1)
    expect(await WebhookEndpoint.countDocuments()).toBe(0)
    expect(await WebhookDelivery.countDocuments()).toBe(0)
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_DELETE' })).toBe(1)
  })

  it('envoie un événement de test immédiat sans passer par le pipeline', async () => {
    const endpoint = await seedEndpoint({ eventTypes: ['TICKET_CREATED'] })

    const response = await request(app)
      .post(`/api/admin/webhooks/${endpoint._id}/test`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.outcome).toMatchObject({ ok: true, httpStatus: 200 })
    expect(attemptDelivery).toHaveBeenCalledTimes(1)
    const delivery = await WebhookDelivery.findOne().lean()
    // Le filtre eventTypes de l'endpoint ne s'applique pas à un test manuel.
    expect(delivery!.eventType).toBe('WEBHOOK_TEST')
    expect(delivery!.payload).toMatchObject({ type: 'WEBHOOK_TEST' })
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_TEST_SENT' })).toBe(1)
  })
})

describe('journal des livraisons', () => {
  async function seedDeliveries(endpointId: unknown) {
    await WebhookDelivery.create([
      {
        endpoint: endpointId,
        eventId: 'a',
        eventType: 'TICKET_CREATED',
        payload: { id: 'a' },
        status: 'DELIVERED',
      },
      {
        endpoint: endpointId,
        eventId: 'b',
        eventType: 'BILLING_INVOICE_CREATED',
        payload: { id: 'b' },
        status: 'FAILED',
        attempts: [{ at: new Date(), httpStatus: 500, error: 'HTTP 500', durationMs: 20 }],
      },
    ])
  }

  it('pagine et filtre par statut et par type', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)

    const all = await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries`)
      .set('Cookie', superAdminCookie)
      .expect(200)
    expect(all.body.total).toBe(2)
    expect(all.body.deliveries[0].payload).toBeUndefined() // la liste reste légère

    const failed = await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries?status=FAILED`)
      .set('Cookie', superAdminCookie)
      .expect(200)
    expect(failed.body.deliveries.map((d: { eventId: string }) => d.eventId)).toEqual(['b'])

    const byType = await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries?eventType=TICKET_CREATED`)
      .set('Cookie', superAdminCookie)
      .expect(200)
    expect(byType.body.deliveries.map((d: { eventId: string }) => d.eventId)).toEqual(['a'])
  })

  it('expose le détail avec payload et tentatives', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)
    const failed = await WebhookDelivery.findOne({ eventId: 'b' })

    const response = await request(app)
      .get(`/api/admin/webhooks/deliveries/${failed!._id}`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.delivery.payload).toEqual({ id: 'b' })
    expect(response.body.delivery.attempts).toHaveLength(1)
  })

  it('rejoue une livraison en conservant eventId et payload', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)
    const failed = await WebhookDelivery.findOne({ eventId: 'b' })

    const response = await request(app)
      .post(`/api/admin/webhooks/deliveries/${failed!._id}/replay`)
      .set('Cookie', superAdminCookie)
      .expect(201)

    expect(response.body.delivery._id).not.toBe(String(failed!._id))
    expect(response.body.delivery.eventId).toBe('b')
    expect(response.body.delivery.payload).toEqual({ id: 'b' })
    expect(await WebhookDelivery.countDocuments({ eventId: 'b' })).toBe(2)
    expect(attemptDelivery).toHaveBeenCalledTimes(1)
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_DELIVERY_REPLAY' })).toBe(1)
  })

  it('lit le journal avec view_webhooks mais refuse le rejeu sans manage_webhooks', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)
    const reader = await User.create({
      name: 'Lecteur',
      email: 'lecteur@example.test',
      passwordHash: await bcrypt.hash('test', 4),
      role: 'ADMIN',
      grantedPermissions: ['view_webhooks'],
    })
    const readerCookie = await cookieFor(String(reader._id))
    const failed = await WebhookDelivery.findOne({ eventId: 'b' })

    await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries`)
      .set('Cookie', readerCookie)
      .expect(200)
    await request(app)
      .post(`/api/admin/webhooks/deliveries/${failed!._id}/replay`)
      .set('Cookie', readerCookie)
      .expect(403)
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-admin-routes.test.ts`
Expected: FAIL — `Cannot find module '../routes/admin/webhooks.js'`.

- [ ] **Step 3 : Créer `backend/src/routes/admin/webhooks.ts`**

```ts
import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import crypto from 'crypto'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import WebhookDelivery, { WEBHOOK_DELIVERY_STATUSES } from '../../models/WebhookDelivery.js'
import WebhookEndpoint from '../../models/WebhookEndpoint.js'
import { attemptDelivery } from '../../lib/webhooks/deliver.js'
import { buildWebhookPayload } from '../../lib/webhookEvents.js'
import { assertValidWebhookUrl } from '../../lib/webhooks/urls.js'
import { encryptWebhookSecret, generateWebhookSecret } from '../../lib/webhooks/secret.js'

/**
 * API d'administration du pipeline de webhooks sortants.
 *
 * Auth : JWT admin (auth + requireAdmin), puis permission par route —
 * view_webhooks en lecture, manage_webhooks en écriture.
 *
 * Le secret d'un endpoint n'est JAMAIS renvoyé après la réponse de création
 * ou de rotation : secretEncrypted est `select: false` au niveau du schéma et
 * n'est chargé qu'au moment de signer.
 */
const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const canView = requirePermission(PERMISSIONS.VIEW_WEBHOOKS)
const canManage = requirePermission(PERMISSIONS.MANAGE_WEBHOOKS)

function firstError(req: Request): string | null {
  const errors = validationResult(req)
  return errors.isEmpty() ? null : String(errors.array()[0]?.msg || 'Requête invalide')
}

async function findEndpointOr404(id: string, res: Response) {
  const endpoint = await WebhookEndpoint.findById(id)
  if (!endpoint) {
    res.status(404).json({ error: 'Endpoint introuvable' })
    return null
  }
  return endpoint
}

// ──────────────────────────────────────────────────────────────────────────
// Livraisons — déclarées avant /:id pour que « deliveries » ne soit jamais
// interprété comme un identifiant d'endpoint.
// ──────────────────────────────────────────────────────────────────────────

router.get(
  '/deliveries/:deliveryId',
  canView,
  param('deliveryId').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const delivery = await WebhookDelivery.findById(req.params.deliveryId)
        .populate('endpoint', 'name url isActive')
        .lean()
      if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' })
      return res.json({ delivery })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/deliveries/:deliveryId/replay',
  canManage,
  param('deliveryId').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const source = await WebhookDelivery.findById(req.params.deliveryId)
      if (!source) return res.status(404).json({ error: 'Livraison introuvable' })

      // Rejeu = nouvelle livraison, même eventId et même payload figé.
      const replay = await WebhookDelivery.create({
        endpoint: source.endpoint,
        eventId: source.eventId,
        eventType: source.eventType,
        payload: source.payload,
      })
      const outcome = await attemptDelivery(replay._id)

      await recordAudit({
        action: 'WEBHOOK_DELIVERY_REPLAY',
        actor: buildActorFromReq(req),
        entityType: 'WebhookDelivery',
        entityId: String(replay._id),
        summary: `Rejeu de la livraison ${source._id} (${source.eventType})`,
        extra: { sourceDeliveryId: String(source._id), eventId: source.eventId },
      })

      return res.status(201).json({ delivery: await WebhookDelivery.findById(replay._id).lean(), outcome })
    } catch (err) {
      return next(err)
    }
  },
)

// ──────────────────────────────────────────────────────────────────────────
// Endpoints
// ──────────────────────────────────────────────────────────────────────────

router.get('/', canView, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoints = await WebhookEndpoint.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .lean()
    res.json({ endpoints })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/',
  canManage,
  body('name').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Nom requis (max 120 caractères)'),
  body('eventTypes').optional().isArray().withMessage('eventTypes doit être un tableau'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      let url: string
      try {
        url = assertValidWebhookUrl(req.body.url)
      } catch (err) {
        return res.status(400).json({ error: (err as Error).message })
      }

      const secret = generateWebhookSecret()
      const created = await WebhookEndpoint.create({
        name: String(req.body.name).trim(),
        url,
        secretEncrypted: encryptWebhookSecret(secret),
        eventTypes: Array.isArray(req.body.eventTypes) ? req.body.eventTypes.map(String) : [],
        createdBy: req.user?.id || null,
      })

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(created._id),
        entityRef: created.name,
        summary: `Création de l'endpoint ${created.name}`,
        after: { name: created.name, url: created.url, eventTypes: created.eventTypes },
      })

      // Unique occasion où le secret circule en clair.
      return res.status(201).json({ endpoint: await WebhookEndpoint.findById(created._id).lean(), secret })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:id',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 120 }).withMessage('Nom invalide'),
  body('eventTypes').optional().isArray().withMessage('eventTypes doit être un tableau'),
  body('isActive').optional().isBoolean().withMessage('isActive doit être un booléen'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      const before = { name: endpoint.name, url: endpoint.url, eventTypes: [...endpoint.eventTypes], isActive: endpoint.isActive }

      if (req.body.url !== undefined) {
        try {
          endpoint.url = assertValidWebhookUrl(req.body.url)
        } catch (err) {
          return res.status(400).json({ error: (err as Error).message })
        }
      }
      if (req.body.name !== undefined) endpoint.name = String(req.body.name).trim()
      if (Array.isArray(req.body.eventTypes)) endpoint.eventTypes = req.body.eventTypes.map(String)

      if (req.body.isActive === true && !endpoint.isActive) {
        // Réactivation : on repart d'une santé neuve, sinon le prochain échec
        // rebasculerait immédiatement l'endpoint en auto-désactivation.
        endpoint.isActive = true
        endpoint.consecutiveFailures = 0
        endpoint.disabledAt = null
        endpoint.disabledReason = null
      } else if (req.body.isActive === false && endpoint.isActive) {
        endpoint.isActive = false
        endpoint.disabledAt = new Date()
        endpoint.disabledReason = 'MANUAL'
      }

      await endpoint.save()

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_UPDATE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Mise à jour de l'endpoint ${endpoint.name}`,
        before,
        after: { name: endpoint.name, url: endpoint.url, eventTypes: endpoint.eventTypes, isActive: endpoint.isActive },
      })

      return res.json({ endpoint: await WebhookEndpoint.findById(endpoint._id).lean() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/rotate-secret',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      const secret = generateWebhookSecret()
      endpoint.secretEncrypted = encryptWebhookSecret(secret)
      await endpoint.save()

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_ROTATE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Rotation du secret de l'endpoint ${endpoint.name}`,
      })

      return res.json({ endpoint: await WebhookEndpoint.findById(endpoint._id).lean(), secret })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/test',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      // L'envoi de test court-circuite emitWebhookEvent : le type WEBHOOK_*
      // y est bloqué par l'anti-boucle, et un test ignore le filtre
      // eventTypes puisque l'admin cible explicitement cet endpoint.
      const eventId = crypto.randomUUID()
      const delivery = await WebhookDelivery.create({
        endpoint: endpoint._id,
        eventId,
        eventType: 'WEBHOOK_TEST',
        payload: buildWebhookPayload(
          eventId,
          {
            type: 'WEBHOOK_TEST',
            title: 'Test de webhook Venio',
            message: `Envoi de test vers « ${endpoint.name} ».`,
            link: '/admin/webhooks',
            metadata: { endpointId: String(endpoint._id) },
          },
          new Date(),
        ),
      })
      const outcome = await attemptDelivery(delivery._id)

      await recordAudit({
        action: 'WEBHOOK_TEST_SENT',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Envoi de test vers ${endpoint.name}`,
        extra: { deliveryId: String(delivery._id), ok: outcome?.ok ?? false },
      })

      return res.json({ delivery: await WebhookDelivery.findById(delivery._id).lean(), outcome })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/:id',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      const { deletedCount } = await WebhookDelivery.deleteMany({ endpoint: endpoint._id })
      await WebhookEndpoint.deleteOne({ _id: endpoint._id })

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_DELETE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Suppression de l'endpoint ${endpoint.name}`,
        before: { name: endpoint.name, url: endpoint.url },
        extra: { deletedDeliveries: deletedCount || 0 },
      })

      return res.json({ ok: true, deletedDeliveries: deletedCount || 0 })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id/deliveries',
  canView,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const filter: Record<string, unknown> = { endpoint: req.params.id }
      const status = String(req.query.status || '')
      if ((WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(status)) filter.status = status
      const eventType = String(req.query.eventType || '')
      if (eventType) filter.eventType = eventType

      const page = Math.max(Number(req.query.page) || 1, 1)
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)

      const [deliveries, total] = await Promise.all([
        WebhookDelivery.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select('-payload') // la liste reste légère, le détail porte le payload
          .lean(),
        WebhookDelivery.countDocuments(filter),
      ])

      return res.json({ deliveries, total, page, pages: Math.max(Math.ceil(total / limit), 1) })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
```

- [ ] **Step 4 : Monter le routeur**

Dans `backend/src/index.ts`, ajouter l'import à côté de `adminAgentTokenRoutes` :

```ts
import adminWebhookRoutes from './routes/admin/webhooks.js'
```

et le montage après `app.use('/api/admin/activity-center', adminActivityCenterRoutes)` :

```ts
// Webhooks sortants (pipeline d'événements vers Kuro) — UI : /admin/webhooks.
app.use('/api/admin/webhooks', adminWebhookRoutes)
```

- [ ] **Step 5 : Vérifier que les tests passent**

Run: `npm --prefix backend test -- webhook-admin-routes.test.ts`
Expected: PASS — 12 tests verts.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/routes/admin/webhooks.ts backend/src/index.ts backend/src/__tests__/webhook-admin-routes.test.ts && git commit -m "feat(webhooks): API admin de gestion des endpoints et du journal"
```

---

### Task 9 : Catalogue des types d'événement et client API frontend

**Files:**
- Create: `backend/src/lib/webhooks/eventTypes.ts`
- Modify: `backend/src/routes/admin/webhooks.ts` (route `GET /` : ajout du catalogue)
- Modify: `backend/src/__tests__/webhook-admin-routes.test.ts` (un test supplémentaire)
- Create: `src/services/webhooks.ts`
- Create: `src/pages/admin/webhooks/types.ts`

**Interfaces:**
- Consumes: routes de la Task 8.
- Produces:
  - Backend : `WEBHOOK_EVENT_TYPE_CATALOG: NotificationType[]` (typé, donc validé à la compilation) ; `GET /api/admin/webhooks` répond désormais `{ endpoints, eventTypes }`.
  - Frontend `src/pages/admin/webhooks/types.ts` : `WebhookEndpoint`, `WebhookDelivery`, `WebhookDeliveryStatus`, `DeliveryOutcome`, `EndpointFormState`, `emptyEndpointForm`, `formatDateTime(iso: string | null)`, `EVENT_TYPE_LABELS: Record<string, string>`, `eventTypeLabel(type: string): string`, `statusLabel(status: WebhookDeliveryStatus): string`.
  - Frontend `src/services/webhooks.ts` : `listWebhooks()`, `createWebhook(input)`, `updateWebhook(id, input)`, `rotateWebhookSecret(id)`, `testWebhook(id)`, `deleteWebhook(id)`, `listDeliveries(endpointId, params)`, `getDelivery(deliveryId)`, `replayDelivery(deliveryId)`.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `backend/src/__tests__/webhook-admin-routes.test.ts`, à la fin du bloc `describe('CRUD des endpoints', …)` :

```ts
  it('expose le catalogue des types d’événement abonnables', async () => {
    const response = await request(app).get('/api/admin/webhooks').set('Cookie', superAdminCookie).expect(200)

    expect(Array.isArray(response.body.eventTypes)).toBe(true)
    expect(response.body.eventTypes).toEqual(expect.arrayContaining(['TICKET_CREATED', 'BILLING_INVOICE_CREATED']))
    // Anti-boucle : les types du pipeline ne sont pas abonnables.
    expect(response.body.eventTypes).not.toContain('WEBHOOK_TEST')
    expect(response.body.eventTypes).not.toContain('WEBHOOK_ENDPOINT_DISABLED')
  })
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npm --prefix backend test -- webhook-admin-routes.test.ts`
Expected: FAIL — `expected undefined to be an array`.

- [ ] **Step 3 : Créer `backend/src/lib/webhooks/eventTypes.ts`**

```ts
import type { NotificationType } from '../../types/enums.js'

/**
 * Catalogue des types d'événement abonnables par un endpoint, servi à l'UI
 * admin pour le sélecteur de filtre.
 *
 * Typé `NotificationType[]` : ajouter ici un type qui n'existe pas dans
 * l'union casse la compilation, ce qui évite une dérive silencieuse entre le
 * catalogue et les types réellement émis. Les types WEBHOOK_* en sont exclus
 * par construction (anti-boucle : ils ne partent jamais dans le pipeline).
 */
export const WEBHOOK_EVENT_TYPE_CATALOG: NotificationType[] = [
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'PROJECT_UPDATE',
  'DOCUMENT_ADDED',
  'TICKET_CREATED',
  'TICKET_REPLY',
  'TICKET_STATUS_CHANGED',
  'TICKET_ASSIGNED',
  'INTERNAL_MESSAGE',
  'DECISION_SUBMITTED',
  'DECISION_APPROVED',
  'DECISION_REJECTED',
  'DECISION_IMPROVEMENT',
  'INTERN_CREATED',
  'INTERN_REPORT_SUBMITTED',
  'INTERN_REPORT_UPDATED',
  'INTERN_CONVENTION_ADDED',
  'INTERN_CREDENTIALS_SENT',
  'INTERNAL_PROJECT_CREATED',
  'INTERNAL_MISSION_ASSIGNED',
  'INTERNAL_MISSION_REVIEW_REQUESTED',
  'INTERNAL_MISSION_VALIDATED',
  'INTERNAL_MISSION_FILE_ADDED',
  'BILLING_QUOTE_CREATED',
  'BILLING_INVOICE_CREATED',
  'BILLING_DOCUMENT_SENT',
  'BILLING_DOCUMENT_PAID',
  'CRM_LEAD_CREATED',
  'CRM_LEAD_ASSIGNED',
  'CRM_LEAD_STATUS_CHANGED',
  'CRM_LEAD_CONVERTED',
  'DEV_ISSUE_ASSIGNED',
  'DEV_ISSUE_STATUS_CHANGED',
  'QUALIOPI_INDICATOR_UPDATED',
  'QUALIOPI_QUESTIONNAIRE_RECEIVED',
  'CLIENT_CREATED',
  'CLIENT_NOTE_ADDED',
  'PROJECT_ITEM_CREATED',
  'PROJECT_ITEM_VALIDATED',
  'TOOL_ACCESS_GRANTED',
  'RESOURCE_REQUESTED',
  'ADMIN_CREATED',
  'ADMIN_ROLE_CHANGED',
  'ADMIN_PERMISSIONS_CHANGED',
  'TWO_FACTOR_ENABLED',
  'TWO_FACTOR_DISABLED',
  'AGENT_TOKEN_CREATED',
  'AGENT_TOKEN_REVOKED',
  'SENSITIVE_ACTION_EXECUTED',
  'BRIEF_ASSIGNED',
  'BRIEF_STATUS_CHANGED',
]
```

- [ ] **Step 4 : Servir le catalogue depuis `GET /`**

Dans `backend/src/routes/admin/webhooks.ts`, ajouter l'import :

```ts
import { WEBHOOK_EVENT_TYPE_CATALOG } from '../../lib/webhooks/eventTypes.js'
```

et remplacer le corps de la route `GET /` par :

```ts
router.get('/', canView, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoints = await WebhookEndpoint.find()
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .lean()
    // Le catalogue voyage avec la liste : l'UI n'a qu'un appel à faire pour
    // afficher les endpoints et alimenter le sélecteur de types.
    res.json({ endpoints, eventTypes: WEBHOOK_EVENT_TYPE_CATALOG })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 5 : Vérifier que le test passe**

Run: `npm --prefix backend test -- webhook-admin-routes.test.ts`
Expected: PASS — 13 tests verts.

- [ ] **Step 6 : Créer `src/pages/admin/webhooks/types.ts`**

```ts
export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED'
export type WebhookDisabledReason = 'AUTO_FAILURES' | 'MANUAL' | null

export interface WebhookEndpoint {
  _id: string
  name: string
  url: string
  eventTypes: string[]
  isActive: boolean
  consecutiveFailures: number
  disabledAt: string | null
  disabledReason: WebhookDisabledReason
  lastSuccessAt: string | null
  lastFailureAt: string | null
  createdBy?: { _id: string; name?: string; email?: string } | null
  createdAt: string
  updatedAt: string
}

export interface WebhookDeliveryAttempt {
  at: string
  httpStatus: number | null
  error: string
  durationMs: number
}

export interface WebhookDelivery {
  _id: string
  endpoint: string | { _id: string; name: string; url: string; isActive: boolean }
  eventId: string
  eventType: string
  payload?: Record<string, unknown>
  status: WebhookDeliveryStatus
  attempts: WebhookDeliveryAttempt[]
  nextRetryAt: string | null
  createdAt: string
}

export interface DeliveryOutcome {
  ok: boolean
  httpStatus: number | null
  error: string
  durationMs: number
  status: WebhookDeliveryStatus
}

export interface EndpointFormState {
  name: string
  url: string
  eventTypes: string[]
}

export const emptyEndpointForm: EndpointFormState = { name: '', url: '', eventTypes: [] }

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABELS: Record<WebhookDeliveryStatus, string> = {
  PENDING: 'En attente',
  DELIVERED: 'Livré',
  FAILED: 'Échoué',
}

export function statusLabel(status: WebhookDeliveryStatus): string {
  return STATUS_LABELS[status] || status
}

/**
 * Libellés lisibles des types d'événement. Le catalogue faisant foi vient du
 * serveur : tout type sans libellé s'affiche tel quel plutôt que d'être masqué.
 */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: 'Tâche assignée',
  TASK_UPDATED: 'Tâche mise à jour',
  PROJECT_UPDATE: 'Annonce de projet',
  DOCUMENT_ADDED: 'Document ajouté',
  TICKET_CREATED: 'Ticket créé',
  TICKET_REPLY: 'Réponse à un ticket',
  TICKET_STATUS_CHANGED: 'Statut de ticket modifié',
  TICKET_ASSIGNED: 'Ticket assigné',
  INTERNAL_MESSAGE: 'Message interne',
  DECISION_SUBMITTED: 'Décision soumise',
  DECISION_APPROVED: 'Décision approuvée',
  DECISION_REJECTED: 'Décision rejetée',
  DECISION_IMPROVEMENT: 'Décision à améliorer',
  INTERN_CREATED: 'Stagiaire créé',
  INTERN_REPORT_SUBMITTED: 'Rapport de stage soumis',
  INTERN_REPORT_UPDATED: 'Rapport de stage mis à jour',
  INTERN_CONVENTION_ADDED: 'Convention de stage ajoutée',
  INTERN_CREDENTIALS_SENT: 'Identifiants stagiaire envoyés',
  INTERNAL_PROJECT_CREATED: 'Projet interne créé',
  INTERNAL_MISSION_ASSIGNED: 'Mission interne assignée',
  INTERNAL_MISSION_REVIEW_REQUESTED: 'Revue de mission demandée',
  INTERNAL_MISSION_VALIDATED: 'Mission interne validée',
  INTERNAL_MISSION_FILE_ADDED: 'Fichier de mission ajouté',
  BILLING_QUOTE_CREATED: 'Devis créé',
  BILLING_INVOICE_CREATED: 'Facture créée',
  BILLING_DOCUMENT_SENT: 'Document de facturation envoyé',
  BILLING_DOCUMENT_PAID: 'Document de facturation payé',
  CRM_LEAD_CREATED: 'Lead créé',
  CRM_LEAD_ASSIGNED: 'Lead assigné',
  CRM_LEAD_STATUS_CHANGED: 'Statut de lead modifié',
  CRM_LEAD_CONVERTED: 'Lead converti',
  DEV_ISSUE_ASSIGNED: 'Issue dev assignée',
  DEV_ISSUE_STATUS_CHANGED: 'Statut d’issue dev modifié',
  QUALIOPI_INDICATOR_UPDATED: 'Indicateur Qualiopi mis à jour',
  QUALIOPI_QUESTIONNAIRE_RECEIVED: 'Questionnaire Qualiopi reçu',
  CLIENT_CREATED: 'Client créé',
  CLIENT_NOTE_ADDED: 'Note client ajoutée',
  PROJECT_ITEM_CREATED: 'Élément de projet créé',
  PROJECT_ITEM_VALIDATED: 'Élément de projet validé',
  TOOL_ACCESS_GRANTED: 'Accès outil accordé',
  RESOURCE_REQUESTED: 'Ressource demandée',
  ADMIN_CREATED: 'Administrateur créé',
  ADMIN_ROLE_CHANGED: 'Rôle administrateur modifié',
  ADMIN_PERMISSIONS_CHANGED: 'Permissions administrateur modifiées',
  TWO_FACTOR_ENABLED: 'Double authentification activée',
  TWO_FACTOR_DISABLED: 'Double authentification désactivée',
  AGENT_TOKEN_CREATED: 'Token agent créé',
  AGENT_TOKEN_REVOKED: 'Token agent révoqué',
  SENSITIVE_ACTION_EXECUTED: 'Action sensible exécutée',
  BRIEF_ASSIGNED: 'Brief assigné',
  BRIEF_STATUS_CHANGED: 'Statut de brief modifié',
  WEBHOOK_TEST: 'Test de webhook',
  WEBHOOK_ENDPOINT_DISABLED: 'Endpoint désactivé',
}

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || type
}
```

- [ ] **Step 7 : Créer `src/services/webhooks.ts`**

```ts
import { apiFetch } from '../lib/api'
import type {
  DeliveryOutcome,
  EndpointFormState,
  WebhookDelivery,
  WebhookEndpoint,
} from '../pages/admin/webhooks/types'

const BASE = '/api/admin/webhooks'

export function listWebhooks(): Promise<{ endpoints: WebhookEndpoint[]; eventTypes: string[] }> {
  return apiFetch(BASE)
}

export function createWebhook(input: EndpointFormState): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  return apiFetch(BASE, { method: 'POST', body: JSON.stringify(input) })
}

export function updateWebhook(
  id: string,
  input: Partial<EndpointFormState> & { isActive?: boolean },
): Promise<{ endpoint: WebhookEndpoint }> {
  return apiFetch(`${BASE}/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function rotateWebhookSecret(id: string): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
  return apiFetch(`${BASE}/${id}/rotate-secret`, { method: 'POST' })
}

export function testWebhook(id: string): Promise<{ delivery: WebhookDelivery; outcome: DeliveryOutcome | null }> {
  return apiFetch(`${BASE}/${id}/test`, { method: 'POST' })
}

export function deleteWebhook(id: string): Promise<{ ok: true; deletedDeliveries: number }> {
  return apiFetch(`${BASE}/${id}`, { method: 'DELETE' })
}

export function listDeliveries(
  endpointId: string,
  params: { status?: string; eventType?: string; page?: number } = {},
): Promise<{ deliveries: WebhookDelivery[]; total: number; page: number; pages: number }> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.eventType) query.set('eventType', params.eventType)
  query.set('page', String(params.page || 1))
  return apiFetch(`${BASE}/${endpointId}/deliveries?${query.toString()}`)
}

export function getDelivery(deliveryId: string): Promise<{ delivery: WebhookDelivery }> {
  return apiFetch(`${BASE}/deliveries/${deliveryId}`)
}

export function replayDelivery(
  deliveryId: string,
): Promise<{ delivery: WebhookDelivery; outcome: DeliveryOutcome | null }> {
  return apiFetch(`${BASE}/deliveries/${deliveryId}/replay`, { method: 'POST' })
}
```

- [ ] **Step 8 : Vérifier le typecheck**

Run: `npm run typecheck:all`
Expected: PASS — aucune erreur.

- [ ] **Step 9 : Commit**

```bash
git add backend/src/lib/webhooks/eventTypes.ts backend/src/routes/admin/webhooks.ts backend/src/__tests__/webhook-admin-routes.test.ts src/services/webhooks.ts src/pages/admin/webhooks/types.ts && git commit -m "feat(webhooks): catalogue des types d'evenement et client API admin"
```

---

### Task 10 : Page admin `/admin/webhooks` — endpoints, secret et éditeur

**Files:**
- Create: `src/pages/admin/webhooks/SecretRevealModal.tsx`
- Create: `src/pages/admin/webhooks/EndpointEditorModal.tsx`
- Create: `src/pages/admin/Webhooks.tsx`
- Modify: `src/App.tsx` (import lazy + route)
- Test: `src/test/webhooksAdmin.test.tsx` (créé)

**Interfaces:**
- Consumes: `src/services/webhooks.ts` et `src/pages/admin/webhooks/types.ts` (Task 9), `useToast` de `src/context/ToastContext`, `ConfirmModal` de `src/components/ConfirmModal`.
- Produces:
  - `SecretRevealModal` — props `{ secret: string; endpointName: string; onClose: () => void }`.
  - `EndpointEditorModal` — props `{ form: EndpointFormState; eventTypes: string[]; saving: boolean; isEdit: boolean; onChange: (next: EndpointFormState) => void; onSubmit: (e: React.FormEvent) => void; onClose: () => void }`.
  - `Webhooks` (default export) — page complète, exporte aussi `DeliveryLog` monté en Task 11.

Le thème MONOLITHE portail est un habillage global appliqué par `src/styles/monolithe-portal.css` sur les primitives admin (`.admin-portal`, `.admin-container`, `.admin-header`, `.admin-table-wrapper`, `.admin-table`, `.admin-badge`, `.admin-card-btn`, `.portal-input`, `.confirm-modal*`). La page **n'importe aucun CSS dédié** : elle utilise ces classes, et le thème s'y applique tout seul.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/test/webhooksAdmin.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const services = vi.hoisted(() => ({
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  rotateWebhookSecret: vi.fn(),
  testWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  listDeliveries: vi.fn(),
  getDelivery: vi.fn(),
  replayDelivery: vi.fn(),
}))

vi.mock('../services/webhooks', () => services)
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

import Webhooks from '../pages/admin/Webhooks'

const endpoint = {
  _id: 'e1',
  name: 'Kuro',
  url: 'https://kuro.example.test/hooks/venio',
  eventTypes: ['TICKET_CREATED'],
  isActive: true,
  consecutiveFailures: 0,
  disabledAt: null,
  disabledReason: null,
  lastSuccessAt: '2026-08-26T10:00:00.000Z',
  lastFailureAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-26T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  services.listWebhooks.mockResolvedValue({
    endpoints: [endpoint],
    eventTypes: ['TICKET_CREATED', 'BILLING_INVOICE_CREATED'],
  })
  services.listDeliveries.mockResolvedValue({ deliveries: [], total: 0, page: 1, pages: 1 })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <Webhooks />
    </MemoryRouter>,
  )
}

describe('page admin Webhooks', () => {
  it('liste les endpoints avec leur santé et leur filtre de types', async () => {
    renderPage()

    expect(await screen.findByText('Kuro')).toBeInTheDocument()
    expect(screen.getByText('https://kuro.example.test/hooks/venio')).toBeInTheDocument()
    expect(screen.getByText('Ticket créé')).toBeInTheDocument()
    expect(screen.getByText(/Actif/)).toBeInTheDocument()
  })

  it('affiche « Tous les types » quand aucun filtre n’est posé', async () => {
    services.listWebhooks.mockResolvedValue({
      endpoints: [{ ...endpoint, eventTypes: [] }],
      eventTypes: ['TICKET_CREATED'],
    })
    renderPage()

    expect(await screen.findByText('Tous les types')).toBeInTheDocument()
  })

  it('crée un endpoint et révèle le secret une seule fois', async () => {
    const user = userEvent.setup()
    services.createWebhook.mockResolvedValue({ endpoint, secret: 'f'.repeat(64) })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Nouvel endpoint/i }))
    await user.type(screen.getByLabelText(/^Nom/), 'Kuro')
    await user.type(screen.getByLabelText(/^URL/), 'https://kuro.example.test/hooks/venio')
    await user.click(screen.getByRole('button', { name: /^Créer$/ }))

    await waitFor(() =>
      expect(services.createWebhook).toHaveBeenCalledWith({
        name: 'Kuro',
        url: 'https://kuro.example.test/hooks/venio',
        eventTypes: [],
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('f'.repeat(64))).toBeInTheDocument()
    expect(within(dialog).getByText(/ne sera plus jamais affiché/i)).toBeInTheDocument()
  })

  it('remonte l’erreur du serveur sur une URL refusée', async () => {
    const user = userEvent.setup()
    services.createWebhook.mockRejectedValue(new Error('URL invalide : https requis'))
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Nouvel endpoint/i }))
    await user.type(screen.getByLabelText(/^Nom/), 'Clair')
    await user.type(screen.getByLabelText(/^URL/), 'http://kuro.example.test/hooks')
    await user.click(screen.getByRole('button', { name: /^Créer$/ }))

    expect(await screen.findByText(/https requis/i)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('envoie un test et rend compte du résultat', async () => {
    const user = userEvent.setup()
    services.testWebhook.mockResolvedValue({
      delivery: { _id: 'd1' },
      outcome: { ok: true, httpStatus: 200, error: '', durationMs: 42, status: 'DELIVERED' },
    })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Tester/i }))

    await waitFor(() => expect(services.testWebhook).toHaveBeenCalledWith('e1'))
    expect(await screen.findByText(/HTTP 200/)).toBeInTheDocument()
  })

  it('bascule l’endpoint actif/inactif', async () => {
    const user = userEvent.setup()
    services.updateWebhook.mockResolvedValue({ endpoint: { ...endpoint, isActive: false } })
    renderPage()

    await user.click(await screen.findByRole('button', { name: /Désactiver/i }))

    await waitFor(() => expect(services.updateWebhook).toHaveBeenCalledWith('e1', { isActive: false }))
  })

  it('signale un endpoint auto-désactivé', async () => {
    services.listWebhooks.mockResolvedValue({
      endpoints: [
        {
          ...endpoint,
          isActive: false,
          disabledReason: 'AUTO_FAILURES',
          disabledAt: '2026-08-26T11:00:00.000Z',
          consecutiveFailures: 20,
        },
      ],
      eventTypes: [],
    })
    renderPage()

    expect(await screen.findByText(/Désactivé automatiquement/i)).toBeInTheDocument()
    expect(screen.getByText(/20 échecs consécutifs/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npx vitest run src/test/webhooksAdmin.test.tsx`
Expected: FAIL — `Failed to resolve import "../pages/admin/Webhooks"`.

- [ ] **Step 3 : Créer `src/pages/admin/webhooks/SecretRevealModal.tsx`**

```tsx
import { useState } from 'react'

interface Props {
  secret: string
  endpointName: string
  onClose: () => void
}

/**
 * Révélation unique du secret d'un endpoint : le serveur ne le renverra
 * jamais plus, l'avertissement doit donc être explicite.
 */
export default function SecretRevealModal({ secret, endpointName, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="confirm-modal"
        style={{ maxWidth: 640, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">Secret de « {endpointName} »</h2>
        </div>
        <div className="confirm-modal__body">
          <p className="admin-info" style={{ margin: 0 }}>
            Ce secret ne sera plus jamais affiché. Copiez-le maintenant et enregistrez-le côté
            récepteur : il sert à vérifier l’en-tête <code>X-Venio-Signature</code> de chaque envoi.
          </p>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              fontSize: '0.9rem',
            }}
          >
            {secret}
          </div>
          <button type="button" onClick={copy} className="portal-button" style={{ marginTop: 12, width: '100%' }}>
            {copied ? 'Copié' : 'Copier le secret'}
          </button>
        </div>
        <div className="confirm-modal__footer">
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
            onClick={onClose}
          >
            J’ai copié, fermer
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4 : Créer `src/pages/admin/webhooks/EndpointEditorModal.tsx`**

```tsx
import type React from 'react'
import { eventTypeLabel, type EndpointFormState } from './types'

interface Props {
  form: EndpointFormState
  eventTypes: string[]
  saving: boolean
  isEdit: boolean
  error: string
  onChange: (next: EndpointFormState) => void
  onSubmit: (event: React.FormEvent) => void
  onClose: () => void
}

/**
 * Éditeur d'endpoint. Le sélecteur de types est multiple et volontairement
 * vide par défaut : aucun type coché = abonnement à tous les événements.
 */
export default function EndpointEditorModal({
  form,
  eventTypes,
  saving,
  isEdit,
  error,
  onChange,
  onSubmit,
  onClose,
}: Props) {
  const toggleType = (type: string) => {
    onChange({
      ...form,
      eventTypes: form.eventTypes.includes(type)
        ? form.eventTypes.filter((value) => value !== type)
        : [...form.eventTypes, type],
    })
  }

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="confirm-modal"
        style={{ maxWidth: 720, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">{isEdit ? 'Modifier l’endpoint' : 'Nouvel endpoint'}</h2>
          <button type="button" className="confirm-modal__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="confirm-modal__body" style={{ display: 'grid', gap: 16 }}>
            {error && <p className="admin-error" role="alert">{error}</p>}

            <label>
              <div style={{ marginBottom: 4 }}>Nom</div>
              <input
                type="text"
                className="portal-input"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="ex. Kuro prod"
                required
                maxLength={120}
              />
            </label>

            <label>
              <div style={{ marginBottom: 4 }}>URL de destination</div>
              <input
                type="text"
                className="portal-input"
                value={form.url}
                onChange={(e) => onChange({ ...form, url: e.target.value })}
                placeholder="https://kuro.example.com/hooks/venio"
                required
              />
              <small style={{ color: 'var(--text-muted)' }}>
                HTTPS obligatoire (http toléré uniquement en local, hors production).
              </small>
            </label>

            <div>
              <div style={{ marginBottom: 8 }}>
                Types d’événement{' '}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {form.eventTypes.length === 0
                    ? '(aucun sélectionné = tous les types)'
                    : `(${form.eventTypes.length} sélectionné${form.eventTypes.length > 1 ? 's' : ''})`}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 6,
                  maxHeight: 260,
                  overflowY: 'auto',
                  padding: 8,
                  border: '1px solid var(--border-color)',
                }}
              >
                {eventTypes.map((type) => (
                  <label key={type} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={form.eventTypes.includes(type)}
                      onChange={() => toggleType(type)}
                    />
                    <span>{eventTypeLabel(type)}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="confirm-modal__footer">
            <button type="button" className="confirm-modal__btn" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="confirm-modal__btn confirm-modal__btn--confirm"
              disabled={saving}
            >
              {isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5 : Créer `src/pages/admin/Webhooks.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react'
import ConfirmModal from '../../components/ConfirmModal'
import { useToast } from '../../context/ToastContext'
import {
  createWebhook,
  deleteWebhook,
  listWebhooks,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
} from '../../services/webhooks'
import DeliveryLog from './webhooks/DeliveryLog'
import EndpointEditorModal from './webhooks/EndpointEditorModal'
import SecretRevealModal from './webhooks/SecretRevealModal'
import {
  emptyEndpointForm,
  eventTypeLabel,
  formatDateTime,
  type EndpointFormState,
  type WebhookEndpoint,
} from './webhooks/types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

/**
 * Console des webhooks sortants : configuration des endpoints, santé de
 * chacun, journal des livraisons et rejeu manuel.
 *
 * Le style vient des primitives admin (.admin-portal, .admin-table…), que le
 * thème MONOLITHE portail habille globalement — aucun CSS dédié ici.
 */
const Webhooks: React.FC = () => {
  const { showToast } = useToast()

  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ endpointId: string; label: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<EndpointFormState>(emptyEndpointForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [revealed, setRevealed] = useState<{ secret: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null)
  const [selected, setSelected] = useState<WebhookEndpoint | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listWebhooks()
      setEndpoints(data.endpoints || [])
      setEventTypes(data.eventTypes || [])
    } catch (err) {
      showToast((err as Error).message || 'Erreur de chargement des webhooks', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditId(null)
    setForm(emptyEndpointForm)
    setFormError('')
    setFormOpen(true)
  }

  const openEdit = (endpoint: WebhookEndpoint) => {
    setEditId(endpoint._id)
    setForm({ name: endpoint.name, url: endpoint.url, eventTypes: [...endpoint.eventTypes] })
    setFormError('')
    setFormOpen(true)
  }

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      if (editId) {
        await updateWebhook(editId, form)
        showToast('Endpoint mis à jour', 'success')
      } else {
        const created = await createWebhook(form)
        setRevealed({ secret: created.secret, name: created.endpoint.name })
      }
      setFormOpen(false)
      setEditId(null)
      setForm(emptyEndpointForm)
      await load()
    } catch (err) {
      setFormError((err as Error).message || 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (endpoint: WebhookEndpoint) => {
    setBusyId(endpoint._id)
    try {
      await updateWebhook(endpoint._id, { isActive: !endpoint.isActive })
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Modification impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const rotate = async (endpoint: WebhookEndpoint) => {
    setBusyId(endpoint._id)
    try {
      const rotated = await rotateWebhookSecret(endpoint._id)
      setRevealed({ secret: rotated.secret, name: endpoint.name })
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Rotation impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const sendTest = async (endpoint: WebhookEndpoint) => {
    setBusyId(endpoint._id)
    setTestResult(null)
    try {
      const { outcome } = await testWebhook(endpoint._id)
      const label = outcome?.ok
        ? `Test réussi — HTTP ${outcome.httpStatus} en ${outcome.durationMs} ms`
        : `Test échoué — ${outcome?.httpStatus ? `HTTP ${outcome.httpStatus}` : outcome?.error || 'erreur réseau'}`
      setTestResult({ endpointId: endpoint._id, label })
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Test impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteWebhook(deleteTarget._id)
      showToast('Endpoint supprimé', 'success')
      if (selected?._id === deleteTarget._id) setSelected(null)
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Suppression impossible', 'error')
    } finally {
      setDeleteTarget(null)
    }
  }

  const healthLabel = (endpoint: WebhookEndpoint): string => {
    if (endpoint.isActive) return `Actif · dernier succès ${formatDateTime(endpoint.lastSuccessAt)}`
    if (endpoint.disabledReason === 'AUTO_FAILURES') {
      return `Désactivé automatiquement le ${formatDateTime(endpoint.disabledAt)}`
    }
    return 'Désactivé manuellement'
  }

  return (
    <section className="admin-portal" style={{ paddingTop: '120px', minHeight: '100vh' }}>
      <div className="admin-container">
        <div className="admin-header">
          <h1>Webhooks sortants</h1>
          <button type="button" className="portal-button" onClick={openCreate}>
            Nouvel endpoint
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', maxWidth: 720 }}>
          Chaque événement produisant une notification admin est poussé vers les endpoints actifs,
          signé avec l’en-tête <code>X-Venio-Signature</code>. Un endpoint est désactivé
          automatiquement après 20 échecs consécutifs.
        </p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
        ) : endpoints.length === 0 ? (
          <div className="admin-empty-state">
            <p className="admin-empty-state-text">
              Aucun endpoint. Créez-en un pour pousser les événements vers Kuro.
            </p>
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Endpoint</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Types</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Santé</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((endpoint) => (
                  <tr key={endpoint._id}>
                    <td style={{ padding: '10px 12px' }}>
                      <strong>{endpoint.name}</strong>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {endpoint.url}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {endpoint.eventTypes.length === 0 ? (
                        <span className="admin-badge">Tous les types</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {endpoint.eventTypes.slice(0, 3).map((type) => (
                            <span key={type} className="admin-badge">
                              {eventTypeLabel(type)}
                            </span>
                          ))}
                          {endpoint.eventTypes.length > 3 && (
                            <span className="admin-badge">+{endpoint.eventTypes.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.85rem' }}>
                      <div>{healthLabel(endpoint)}</div>
                      {endpoint.consecutiveFailures > 0 && (
                        <div style={{ color: '#f87171' }}>
                          {endpoint.consecutiveFailures} échec{endpoint.consecutiveFailures > 1 ? 's' : ''} consécutif
                          {endpoint.consecutiveFailures > 1 ? 's' : ''}
                        </div>
                      )}
                      {testResult?.endpointId === endpoint._id && (
                        <div style={{ marginTop: 4 }}>{testResult.label}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button type="button" className="admin-card-btn" onClick={() => setSelected(endpoint)}>
                          Journal
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn admin-card-btn--edit"
                          onClick={() => openEdit(endpoint)}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void sendTest(endpoint)}
                        >
                          Tester
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void toggleActive(endpoint)}
                        >
                          {endpoint.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={busyId === endpoint._id}
                          onClick={() => void rotate(endpoint)}
                        >
                          Régénérer le secret
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn admin-card-btn--delete"
                          onClick={() => setDeleteTarget(endpoint)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DeliveryLog endpoints={endpoints} selected={selected} onSelect={setSelected} />
      </div>

      {formOpen && (
        <EndpointEditorModal
          form={form}
          eventTypes={eventTypes}
          saving={saving}
          isEdit={Boolean(editId)}
          error={formError}
          onChange={setForm}
          onSubmit={submitForm}
          onClose={() => {
            setFormOpen(false)
            setEditId(null)
            setFormError('')
          }}
        />
      )}

      {revealed && (
        <SecretRevealModal
          secret={revealed.secret}
          endpointName={revealed.name}
          onClose={() => setRevealed(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          isOpen
          title="Supprimer l’endpoint"
          message={`Supprimer « ${deleteTarget.name} » et tout son journal de livraisons ? Cette action est définitive.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  )
}

export default Webhooks
```

- [ ] **Step 6 : Déclarer la route**

Dans `src/App.tsx`, ajouter à côté des autres imports lazy :

```ts
const Webhooks = lazy(() => import('./pages/admin/Webhooks'))
```

et la route juste après celle de `agents` :

```tsx
                  {/* Webhooks sortants (pipeline d'événements vers Kuro) */}
                  <Route
                    path="webhooks"
                    element={
                      <RequirePermission permission={PERMISSIONS.VIEW_WEBHOOKS} redirectTo="/admin">
                        <Webhooks />
                      </RequirePermission>
                    }
                  />
```

- [ ] **Step 7 : Poser le squelette de `DeliveryLog`**

La page l'importe déjà ; la Task 11 le remplit et le teste. Créer
`src/pages/admin/webhooks/DeliveryLog.tsx` avec exactement ce contenu, pour
que la page compile dès maintenant :

```tsx
import type { WebhookEndpoint } from './types'

interface Props {
  endpoints: WebhookEndpoint[]
  selected: WebhookEndpoint | null
  onSelect: (endpoint: WebhookEndpoint | null) => void
}

export default function DeliveryLog(_props: Props) {
  return null
}
```

- [ ] **Step 8 : Vérifier les tests frontend**

Run: `npx vitest run src/test/webhooksAdmin.test.tsx`
Expected: PASS — 7 tests verts.

- [ ] **Step 9 : Commit**

```bash
git add src/pages/admin/Webhooks.tsx src/pages/admin/webhooks/SecretRevealModal.tsx src/pages/admin/webhooks/EndpointEditorModal.tsx src/pages/admin/webhooks/DeliveryLog.tsx src/App.tsx src/test/webhooksAdmin.test.tsx && git commit -m "feat(webhooks): page admin de gestion des endpoints"
```

---

### Task 11 : Journal des livraisons, détail et rejeu

**Files:**
- Modify: `src/pages/admin/webhooks/DeliveryLog.tsx` (remplace le squelette de la Task 10)
- Test: `src/test/webhooksDeliveryLog.test.tsx` (créé)

**Interfaces:**
- Consumes: `listDeliveries`, `getDelivery`, `replayDelivery` de `src/services/webhooks.ts` ; types de `src/pages/admin/webhooks/types.ts`.
- Produces: `DeliveryLog` (default export) — props `{ endpoints: WebhookEndpoint[]; selected: WebhookEndpoint | null; onSelect: (endpoint: WebhookEndpoint | null) => void }`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `src/test/webhooksDeliveryLog.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const services = vi.hoisted(() => ({
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  rotateWebhookSecret: vi.fn(),
  testWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  listDeliveries: vi.fn(),
  getDelivery: vi.fn(),
  replayDelivery: vi.fn(),
}))

vi.mock('../services/webhooks', () => services)
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }))

import DeliveryLog from '../pages/admin/webhooks/DeliveryLog'
import type { WebhookEndpoint } from '../pages/admin/webhooks/types'

const endpoint = {
  _id: 'e1',
  name: 'Kuro',
  url: 'https://kuro.example.test/hooks',
  eventTypes: [],
  isActive: true,
  consecutiveFailures: 0,
  disabledAt: null,
  disabledReason: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
} as WebhookEndpoint

const delivered = {
  _id: 'd1',
  endpoint: 'e1',
  eventId: 'evt-1',
  eventType: 'TICKET_CREATED',
  status: 'DELIVERED' as const,
  attempts: [{ at: '2026-08-26T10:00:00.000Z', httpStatus: 200, error: '', durationMs: 34 }],
  nextRetryAt: null,
  createdAt: '2026-08-26T10:00:00.000Z',
}

const failed = {
  ...delivered,
  _id: 'd2',
  eventId: 'evt-2',
  status: 'FAILED' as const,
  attempts: [{ at: '2026-08-26T11:00:00.000Z', httpStatus: 500, error: 'HTTP 500', durationMs: 120 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  services.listDeliveries.mockResolvedValue({
    deliveries: [delivered, failed],
    total: 2,
    page: 1,
    pages: 1,
  })
  services.getDelivery.mockResolvedValue({
    delivery: { ...failed, payload: { id: 'evt-2', type: 'TICKET_CREATED', title: 'Ticket' } },
  })
})

function renderLog() {
  return render(<DeliveryLog endpoints={[endpoint]} selected={endpoint} onSelect={vi.fn()} />)
}

describe('journal des livraisons', () => {
  it('charge le journal de l’endpoint sélectionné', async () => {
    renderLog()

    await waitFor(() => expect(services.listDeliveries).toHaveBeenCalledWith('e1', { page: 1 }))
    expect(await screen.findByText('evt-1')).toBeInTheDocument()
    expect(screen.getByText('Livré')).toBeInTheDocument()
    expect(screen.getByText('Échoué')).toBeInTheDocument()
  })

  it('filtre par statut', async () => {
    const user = userEvent.setup()
    renderLog()
    await screen.findByText('evt-1')

    await user.selectOptions(screen.getByLabelText(/Statut/i), 'FAILED')

    await waitFor(() =>
      expect(services.listDeliveries).toHaveBeenLastCalledWith('e1', { page: 1, status: 'FAILED' }),
    )
  })

  it('ouvre le détail avec le payload et les tentatives', async () => {
    const user = userEvent.setup()
    renderLog()
    await screen.findByText('evt-2')

    await user.click(screen.getAllByRole('button', { name: /Détail/i })[1]!)

    await waitFor(() => expect(services.getDelivery).toHaveBeenCalledWith('d2'))
    expect(await screen.findByText(/"type": "TICKET_CREATED"/)).toBeInTheDocument()
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
  })

  it('rejoue une livraison et rafraîchit le journal', async () => {
    const user = userEvent.setup()
    services.replayDelivery.mockResolvedValue({
      delivery: { ...failed, _id: 'd3' },
      outcome: { ok: true, httpStatus: 200, error: '', durationMs: 20, status: 'DELIVERED' },
    })
    renderLog()
    await screen.findByText('evt-2')

    await user.click(screen.getAllByRole('button', { name: /Rejouer/i })[1]!)

    await waitFor(() => expect(services.replayDelivery).toHaveBeenCalledWith('d2'))
    await waitFor(() => expect(services.listDeliveries).toHaveBeenCalledTimes(2))
  })

  it('invite à choisir un endpoint quand aucun n’est sélectionné', () => {
    render(<DeliveryLog endpoints={[endpoint]} selected={null} onSelect={vi.fn()} />)

    expect(screen.getByText(/Sélectionnez un endpoint/i)).toBeInTheDocument()
    expect(services.listDeliveries).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2 : Vérifier que le test échoue**

Run: `npx vitest run src/test/webhooksDeliveryLog.test.tsx`
Expected: FAIL — le squelette rend `null`, donc `evt-1` est introuvable.

- [ ] **Step 3 : Implémenter `src/pages/admin/webhooks/DeliveryLog.tsx`**

```tsx
import React, { useCallback, useEffect, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { getDelivery, listDeliveries, replayDelivery } from '../../../services/webhooks'
import {
  eventTypeLabel,
  formatDateTime,
  statusLabel,
  type WebhookDelivery,
  type WebhookEndpoint,
} from './types'

interface Props {
  endpoints: WebhookEndpoint[]
  selected: WebhookEndpoint | null
  onSelect: (endpoint: WebhookEndpoint | null) => void
}

/**
 * Journal des livraisons d'un endpoint : filtres statut/type, pagination,
 * panneau de détail (payload figé + historique des tentatives) et rejeu.
 */
export default function DeliveryLog({ endpoints, selected, onSelect }: Props) {
  const { showToast } = useToast()

  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WebhookDelivery | null>(null)
  const [replayingId, setReplayingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    try {
      const data = await listDeliveries(selected._id, {
        page,
        ...(status ? { status } : {}),
        ...(eventType ? { eventType } : {}),
      })
      setDeliveries(data.deliveries || [])
      setPages(data.pages || 1)
      setTotal(data.total || 0)
    } catch (err) {
      showToast((err as Error).message || 'Erreur de chargement du journal', 'error')
    } finally {
      setLoading(false)
    }
  }, [selected, page, status, eventType, showToast])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (delivery: WebhookDelivery) => {
    try {
      const data = await getDelivery(delivery._id)
      setDetail(data.delivery)
    } catch (err) {
      showToast((err as Error).message || 'Détail indisponible', 'error')
    }
  }

  const replay = async (delivery: WebhookDelivery) => {
    setReplayingId(delivery._id)
    try {
      const { outcome } = await replayDelivery(delivery._id)
      showToast(
        outcome?.ok ? `Rejeu réussi (HTTP ${outcome.httpStatus})` : 'Rejeu échoué, une reprise est planifiée',
        outcome?.ok ? 'success' : 'error',
      )
      await load()
    } catch (err) {
      showToast((err as Error).message || 'Rejeu impossible', 'error')
    } finally {
      setReplayingId(null)
    }
  }

  const availableTypes = Array.from(new Set(deliveries.map((delivery) => delivery.eventType))).sort()

  if (!selected) {
    return (
      <div style={{ marginTop: 32 }}>
        <h2>Journal des livraisons</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Sélectionnez un endpoint (bouton « Journal ») pour consulter ses livraisons.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div className="admin-header">
        <h2>Journal — {selected.name}</h2>
        <button type="button" className="admin-card-btn" onClick={() => onSelect(null)}>
          Fermer le journal
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label>
          <span style={{ marginRight: 6 }}>Statut</span>
          <select
            className="portal-input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Tous</option>
            <option value="PENDING">En attente</option>
            <option value="DELIVERED">Livré</option>
            <option value="FAILED">Échoué</option>
          </select>
        </label>
        <label>
          <span style={{ marginRight: 6 }}>Type</span>
          <select
            className="portal-input"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Tous</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>
          {total} livraison{total > 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Chargement…</div>
      ) : deliveries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Aucune livraison</div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Événement</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Statut</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tentatives</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Durée</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => {
                const last = delivery.attempts[delivery.attempts.length - 1]
                return (
                  <tr key={delivery._id}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {formatDateTime(delivery.createdAt)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div>{eventTypeLabel(delivery.eventType)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {delivery.eventId}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="admin-badge">{statusLabel(delivery.status)}</span>
                      {delivery.status === 'PENDING' && delivery.nextRetryAt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          reprise {formatDateTime(delivery.nextRetryAt)}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{delivery.attempts.length}</td>
                    <td style={{ padding: '10px 12px' }}>{last ? `${last.durationMs} ms` : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="admin-card-btn" onClick={() => void openDetail(delivery)}>
                          Détail
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={replayingId === delivery._id}
                          onClick={() => void replay(delivery)}
                        >
                          Rejouer
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="admin-card-btn"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Précédent
          </button>
          <span style={{ padding: '6px 14px', color: 'var(--text-muted)' }}>
            {page} / {pages}
          </span>
          <button
            type="button"
            className="admin-card-btn"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Suivant
          </button>
        </div>
      )}

      {detail && (
        <div className="confirm-modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="confirm-modal"
            style={{ maxWidth: 760, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirm-modal__header">
              <h2 className="confirm-modal__title">
                {eventTypeLabel(detail.eventType)} · {statusLabel(detail.status)}
              </h2>
              <button
                type="button"
                className="confirm-modal__close"
                onClick={() => setDetail(null)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="confirm-modal__body">
              <h3 style={{ marginTop: 0 }}>Payload envoyé</h3>
              <pre
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: 12,
                  overflowX: 'auto',
                  fontSize: '0.8rem',
                }}
              >
                {JSON.stringify(detail.payload ?? {}, null, 2)}
              </pre>

              <h3>Tentatives</h3>
              {detail.attempts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Aucune tentative enregistrée.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {detail.attempts.map((attempt, index) => (
                    <li key={`${attempt.at}-${index}`}>
                      {formatDateTime(attempt.at)} —{' '}
                      {attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : attempt.error || 'erreur réseau'} (
                      {attempt.durationMs} ms)
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="confirm-modal__footer">
              <button type="button" className="confirm-modal__btn" onClick={() => setDetail(null)}>
                Fermer
              </button>
              <button
                type="button"
                className="confirm-modal__btn confirm-modal__btn--confirm"
                onClick={() => void replay(detail)}
              >
                Rejouer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `npx vitest run src/test/webhooksDeliveryLog.test.tsx src/test/webhooksAdmin.test.tsx`
Expected: PASS — 5 + 7 tests verts.

- [ ] **Step 5 : Commit**

```bash
git add src/pages/admin/webhooks/DeliveryLog.tsx src/test/webhooksDeliveryLog.test.tsx && git commit -m "feat(webhooks): journal des livraisons avec detail et rejeu"
```

---

### Task 12 : Documentation du contrat et récepteur de référence

**Files:**
- Create: `docs/webhooks-sortants.md`
- Modify: `README.md` (section variables d'environnement — ajouter `CREDENTIALS_KEY` si absente)

**Interfaces:**
- Consumes: le contrat livré par les Tasks 4 et 8.
- Produces: documentation lisible par l'équipe Kuro (aucun code côté Kuro dans ce chantier).

- [ ] **Step 1 : Créer `docs/webhooks-sortants.md`**

```markdown
# Webhooks sortants Venio

Venio pousse vers chaque endpoint actif les événements qui produisent une
notification admin. Configuration : `/admin/webhooks` (permission
`view_webhooks` en lecture, `manage_webhooks` en écriture).

## Requête

`POST <url de l'endpoint>` · `Content-Type: application/json` · timeout 10 s ·
aucune redirection suivie (toute réponse 3xx est comptée comme un échec).

| En-tête | Contenu |
|---|---|
| `X-Venio-Event` | type de l'événement (ex. `TICKET_CREATED`) |
| `X-Venio-Delivery` | identifiant de la livraison (unique par tentative de rejeu) |
| `X-Venio-Timestamp` | horodatage Unix en secondes |
| `X-Venio-Signature` | `sha256=` + HEX(HMAC_SHA256(secret, `timestamp + "." + rawBody`)) |

Corps :

```json
{
  "id": "b3c1e0e4-…",
  "type": "TICKET_CREATED",
  "occurredAt": "2026-08-26T10:00:00.000Z",
  "title": "Nouveau ticket",
  "message": "Ticket #12",
  "link": "/admin/tickets",
  "metadata": {}
}
```

`id` est stable pour un même événement logique : il est partagé entre les
endpoints destinataires et conservé par un rejeu. C'est la clé de
déduplication côté récepteur.

## Réponses et reprises

- **Succès** : tout statut 2xx. Répondez immédiatement et traitez en
  asynchrone : le compteur d'échecs de l'endpoint est remis à zéro.
- **Échec** (réseau, timeout, 3xx, 4xx, 5xx) : Venio réessaie selon
  1 min → 5 min → 30 min → 2 h → 12 h, puis marque la livraison `FAILED`.
- **20 échecs consécutifs** sur un endpoint : désactivation automatique et
  alerte aux super admins. La réactivation depuis `/admin/webhooks` remet le
  compteur à zéro.
- **Rattrapage** : après une indisponibilité, `GET /api/v1/agent/notifications`
  (API agent existante) permet de réconcilier.

## Récepteur de référence

```js
import crypto from 'node:crypto'
import express from 'express'

const app = express()
const SECRET = process.env.VENIO_WEBHOOK_SECRET
const TOLERANCE_SECONDS = 300

app.post('/hooks/venio', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.get('X-Venio-Timestamp') || ''
  const provided = req.get('X-Venio-Signature') || ''

  // Fenêtre d'horloge : une signature rejouée plus tard est refusée.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return res.status(401).end()
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', SECRET).update(`${timestamp}.${req.body}`).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).end()

  const event = JSON.parse(req.body.toString('utf8'))
  // Déduplication par event.id, puis traitement asynchrone.
  queue.push(event)
  return res.status(202).end()
})
```

## Configuration serveur

Le secret de chaque endpoint est chiffré en base (AES-256-GCM) avec la clé
dérivée de `CREDENTIALS_KEY` (à défaut `JWT_SECRET`). **`CREDENTIALS_KEY` doit
être définie et stable en production** : la changer rend illisibles les
secrets existants, qu'il faut alors régénérer depuis `/admin/webhooks`.

La reprise des livraisons échues est portée par l'automation
`webhooks.delivery_retry` (moteur d'automations, tick toutes les minutes) ;
elle est visible et désactivable depuis `/admin/automations`.
```

- [ ] **Step 2 : Vérifier la documentation de `CREDENTIALS_KEY`**

Run: `grep -n "CREDENTIALS_KEY" README.md docs/*.md .env.example 2>/dev/null`
Expected: si aucune occurrence hors `docs/webhooks-sortants.md`, ajouter la ligne dans la section des variables d'environnement du `README.md` :

```markdown
| `CREDENTIALS_KEY` | Clé de chiffrement des secrets stockés (identifiants de filiales, secrets de webhooks sortants). Doit rester stable : la changer rend les secrets existants illisibles. |
```

Si le README utilise un autre format (liste à puces), suivre le format existant plutôt que ce tableau.

- [ ] **Step 3 : Commit**

```bash
git add docs/webhooks-sortants.md README.md && git commit -m "docs(webhooks): contrat de livraison et recepteur de reference"
```

---

### Task 13 : Vérification finale

**Files:** aucun (vérification uniquement ; corriger sur place ce qui casse).

- [ ] **Step 1 : Typecheck complet**

Run: `npm run typecheck:all`
Expected: PASS — aucune sortie d'erreur.

- [ ] **Step 2 : Lint**

Run: `npm run lint && npm --prefix backend run lint`
Expected: PASS — aucune erreur (les warnings préexistants restent tolérés, aucun nouveau).

- [ ] **Step 3 : Suite backend complète**

Run: `npm run test:backend`
Expected: PASS — en particulier `webhook-*.test.ts`, `rbac-matrix.test.ts`, `notifications-dedup.test.ts`, `automation.test.ts`, `admin-role-recipe.test.ts`, `permissions.test.ts`.

- [ ] **Step 4 : Suite frontend complète**

Run: `npm run test:frontend`
Expected: PASS — en particulier `webhooksAdmin`, `webhooksDeliveryLog`, `adminNavigation`, `admin-role-recipe`, `AdminSidebar`.

- [ ] **Step 5 : Revue de la surface de conflit**

Run: `git diff main --stat -- backend/src/types/enums.ts backend/src/models/Notification.ts backend/src/models/AuditLog.ts rbac-matrix.json`
Expected: uniquement des ajouts (aucune ligne supprimée ni déplacée) dans ces quatre fichiers partagés avec les chantiers parallèles.

- [ ] **Step 6 : Vérification par le skill**

Appliquer `superpowers:verification-before-completion` : ne déclarer le chantier terminé qu'avec la sortie réelle des Steps 1 à 5 sous les yeux. Toute étape non exécutée doit être annoncée comme telle.

---

## Points de vigilance (issus de la spec)

1. **Cas limite `dedupeKey` + préférence in-app coupée** : aucune ligne de notification n'existe pour porter la dédup, donc une alerte récurrente réémet à chaque exécution. Assumé en V1, documenté dans la spec — ne pas « corriger » sans arbitrage.
2. **Cycle de modules** : `deliver.ts` importe `notifyHelpers` **dynamiquement** (Task 4). Ne pas convertir en import statique.
3. **Ordre des routes Express** : `/deliveries/:deliveryId` est déclarée avant `/:id/…` (Task 8). Ne pas réordonner.
4. **Émission non bloquante** : ne jamais `await emitWebhookEventInBackground(...)` ni transformer `void Promise.allSettled(...)` en `await` dans `emitWebhookEvent` — la latence du réseau remonterait jusqu'aux routes métier.
5. **Filtre du pipeline** : les préférences de notification sont par utilisateur et ne filtrent **pas** le pipeline ; seul `eventTypes` de l'endpoint le fait.
