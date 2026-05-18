# Agent API × Messagerie interne — Design (V1)

Date : 2026-05-18
Auteur : design issu d'une session de brainstorming (skill `superpowers:brainstorming`).
Statut : validé section par section avec l'utilisateur, en attente d'implémentation via `superpowers:writing-plans`.

## 1. Contexte et problème

L'API agents (`/api/v1/agent/*`) couvre déjà 10 lots fonctionnels (CRM, projets, billing, documents, compta read-only, tasks, tickets, messages projet, notifications, calendar, qualiopi, interns, toolaccess, resources, gestion, arrow, analytics, audit, automations, backup, users, 2FA, OpenAPI dynamique).

**Gap identifié** : la route `backend/src/routes/agent/messages.ts` ne couvre QUE le modèle `Message` (fils de discussion par projet entre admin et client). La **messagerie interne** (`InternalConversation`, `InternalConversationMember`, `InternalMessage` — refonte UI néon récente) n'est exposée nulle part côté agent. Un agent externe (Kuro, intégrations tierces) ne peut donc PAS lire ou écrire dans les conversations internes.

**Objectif V1** : permettre à un agent externe authentifié de lire et écrire dans la messagerie interne, avec parité fonctionnelle complète vs les 13 endpoints admin existants ([backend/src/routes/admin/messaging.ts](../../../backend/src/routes/admin/messaging.ts)).

## 2. Décisions structurantes (validées)

| Sujet | Décision |
|---|---|
| Sender mapping | 1 user système (role `AGENT`) auto-créé par AgentToken, lifecycle synchronisé |
| Bidirectionnel | Oui — l'agent apparaît dans GET /users, peut recevoir DM/mentions |
| Scopes | `read:internal-messaging`, `write:internal-messaging` (nouveaux, dédiés) |
| Périmètre V1 | Full parity — 13 endpoints portés |
| Attachments | Base64 dans body JSON, cap 5 Mo par fichier, max 5 fichiers (parité multer admin) |
| ACL conversations | Comme un user normal — channels PUBLIC + memberships uniquement |
| ACL création tokens | Durcissement de `requireAdmin` → `requireSuperAdmin` sur `/api/admin/agent-tokens` (inclus dans la spec) |
| Approche d'implémentation | Service `internalMessaging.ts` inchangé sauf adaptation de `assertInternalUser` pour accepter le role AGENT ; les routes agent construisent un `JwtPayload` fantôme à partir du user système |

## 3. Modèle de données

### 3.1 Modifications minimales

- **`User.role`** (enum) : ajouter `'AGENT'`.
- **`User`** : nouveau champ optionnel `agentTokenId?: ObjectId → AgentToken` (null pour humains, set pour users agent).
- **`AgentToken`** : nouveau champ `userId: ObjectId → User` (set au create, immuable).
- **`lib/permissions.ts`** : nouveau predicate `isInternalRole(role) = isAdminRole(role) || role === 'AGENT'`. `isAdminRole` reste inchangé — un AGENT n'est PAS un admin et n'hérite d'aucune permission admin.
- **`services/internalMessaging.ts`** : remplacer dans `assertInternalUser` la condition `!isAdminRole(user.role)` par `!isInternalRole(user.role)`. Une seule ligne touchée.
- **Aucun changement** sur `InternalConversation`, `InternalConversationMember`, `InternalMessage`.

### 3.2 Indexes

Pas de nouvel index requis. L'accès `User.findOne({ agentTokenId, isActive: true })` est rare (1× par requête agent messagerie) — l'index `{ email: 1 }` existant et la sélectivité de `agentTokenId` rendent la recherche acceptable. Un index sparse sur `agentTokenId` pourra être ajouté si la latence devient mesurable.

## 4. Cycle de vie AgentToken ↔ User système

### 4.1 Création (`POST /api/admin/agent-tokens`)

1. Génération du secret (inchangé).
2. Création du `User` :
   - `name` = `name` du token (ex. "Kuro Prod")
   - `email` = `agent-<tokenId>@venio.internal` (généré, unique, non envoyable)
   - `role = 'AGENT'`, `isActive: true`, `customPermissions: null`
   - `password` = hash bcrypt d'une chaîne aléatoire (le user agent ne se connecte jamais via password — champ rempli pour respecter le schema existant)
   - `agentTokenId` = laissé null temporairement (chicken-and-egg).
3. Création de l'`AgentToken` avec `userId = <newUserId>`.
4. Patch du User : `agentTokenId = <newTokenId>`.
5. `ensureGeneralChannel(asUser)` pour ajouter l'agent au channel `#general`.

**Atomicité** : ordonnancement choisi pour qu'un échec à toute étape ≥ 3 laisse au pire un User orphelin facile à nettoyer. En cas d'échec étape 3, supprimer le User créé en 2 (best-effort, log si échec). Pas de transaction Mongo nécessaire en V1 (le projet n'en utilise pas systématiquement).

### 4.2 Renommage (`PATCH /api/admin/agent-tokens/:id`)

Si `name` change, propager à `User.name`. Silencieux — l'UI messagerie affichera le nouveau nom dès la prochaine requête. Pas de notification, pas d'historisation.

### 4.3 Révocation (`POST /api/admin/agent-tokens/:id/revoke`)

1. `AgentToken.status = 'REVOKED'` (inchangé).
2. `User.isActive = false` → l'agent disparaît automatiquement de `GET /users` (filtre déjà sur `isActive: true`).
3. `User.name = "[Révoqué] <name>"` pour signaler dans les historiques de messages.

Pas de delete dur. Cohérent avec la politique existante "tokens révoqués conservés pour traçabilité audit".

### 4.4 Backfill (tokens existants en prod)

Script idempotent `backend/scripts/backfill-agent-users.ts` :
- Pour chaque `AgentToken` sans `userId`, créer le User correspondant via la même séquence que 4.1.
- Tourne 1 fois en prod avant déploiement.
- Tant que le script n'a pas tourné, les routes messagerie agent répondent 500 `AGENT_USER_MISSING` (les autres routes agent non concernées continuent de fonctionner).

## 5. Construction du contexte agent

### 5.1 Helper `loadAgentUserPayload`

Nouveau fichier : `backend/src/routes/agent/_middleware/asUser.ts`.

```ts
import type { Request } from 'express'
import User from '../../../models/User.js'
import type { JwtPayload } from '../../../types/express.js'

export async function loadAgentUserPayload(req: Request): Promise<JwtPayload> {
  if (req.agentUser) return req.agentUser
  const tokenId = req.agentToken!.id
  const user = await User.findOne({ agentTokenId: tokenId, isActive: true })
    .select('_id name email role')
    .lean()
  if (!user) {
    throw Object.assign(new Error('Agent user introuvable'), {
      status: 500, code: 'AGENT_USER_MISSING',
    })
  }
  if (user.role !== 'AGENT') {
    throw Object.assign(new Error('Agent user corrompu'), {
      status: 500, code: 'AGENT_USER_CORRUPT',
    })
  }
  const payload: JwtPayload = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: 'AGENT',
  }
  req.agentUser = payload
  return payload
}
```

### 5.2 Typage Express

Étendre `backend/src/types/express.d.ts` (ou équivalent) :
```ts
declare global {
  namespace Express {
    interface Request {
      agentUser?: JwtPayload
    }
  }
}
```

### 5.3 Pourquoi pas un middleware global

Seules les routes messagerie ont besoin du payload. Les autres routes agent (CRM, projets, etc.) n'utilisent pas `JwtPayload`. On évite donc 1 DB round-trip inutile sur 90% des requêtes.

## 6. Routes agent messagerie

### 6.1 Nouveau fichier

`backend/src/routes/agent/messaging.ts` (~250 lignes, miroir structuré de `admin/messaging.ts`).

**Montage** dans `agent/index.ts` :
```ts
import messagingRoutes from './messaging.js'
router.use('/messaging', messagingRoutes)
```

Toutes les routes préfixées `/api/v1/agent/messaging/...`.

### 6.2 Mapping endpoints → scopes

| Méthode | Path | Scope | Idempotency-Key |
|---|---|---|---|
| GET | `/users` | `read:internal-messaging` | — |
| GET | `/conversations` | `read:internal-messaging` | — |
| POST | `/conversations` | `write:internal-messaging` | requis |
| POST | `/direct` | `write:internal-messaging` | requis |
| GET | `/search?q=` | `read:internal-messaging` | — |
| GET | `/conversations/:id/messages?before=&limit=` | `read:internal-messaging` | — |
| POST | `/conversations/:id/messages` | `write:internal-messaging` | requis |
| POST | `/conversations/:id/attachments` | `write:internal-messaging` | requis |
| GET | `/messages/:id/attachments/:idx/download` | `read:internal-messaging` | — |
| POST | `/conversations/:id/read` | `write:internal-messaging` | requis |
| PATCH | `/messages/:id` | `write:internal-messaging` | requis |
| DELETE | `/messages/:id` | `write:internal-messaging` | requis |
| POST | `/messages/:id/reactions` | `write:internal-messaging` | requis |

Cohérent avec [scopes.ts](../../../backend/src/lib/agent/scopes.ts) — `admin:*` bypass tout.

### 6.3 Délégation

Chaque handler suit le pattern :
```ts
router.post('/conversations/:id/messages',
  requireScope('write:internal-messaging'),
  body('content').isString().trim().isLength({ min: 1 }),
  async (req, res, next) => {
    try {
      if (emit(req, res)) return
      const user = await loadAgentUserPayload(req)
      const message = await createMessage(user, req.params.id, {
        content: req.body.content,
        parentMessage: req.body.parentMessage || null,
      })
      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(message._id),
        summary: `Message dans conv ${req.params.id}`,
        after: { id: String(message._id) },
      }
      res.status(201).json({ message })
    } catch (err) { next(err) }
  }
)
```

Le service [`internalMessaging.ts`](../../../backend/src/services/internalMessaging.ts) reste la source unique de vérité. Aucun code dupliqué.

### 6.4 Attachments — pattern base64

Body JSON :
```json
{
  "content": "Voici les specs",
  "files": [
    { "filename": "spec.pdf", "contentBase64": "JVBERi0xLj...", "mimeType": "application/pdf" }
  ]
}
```

Validation :
- `files` : max 5 éléments
- Chaque `contentBase64` décodé : max 5 Mo (5 × 1024 × 1024 bytes)
- `filename` : sanitisé via `safeFilename()` (réutilisé depuis `agent/documents.ts`)
- `mimeType` : string, max 100 chars

Storage : `uploads/agent/internal-messaging/<conversationId>/<timestamp>-<random>-<safeFilename>`. Path-traversal protégé via `path.resolve` + `startsWith(uploadsRoot)`.

Le service `createMessage` reçoit ensuite le tableau `attachments` au format `IInternalMessageAttachment` — déjà supporté natif.

### 6.5 Pagination messages

`GET /conversations/:id/messages?before=<ISO date>&limit=<n>` (max 100, default 50).

Pagination par curseur (différent du `?page=&pageSize=` standard agent). Justifié par la nature flux de messages — la pagination par page produit des résultats incohérents quand de nouveaux messages arrivent. À documenter explicitement dans l'OpenAPI.

### 6.6 Erreurs

Les `Object.assign(new Error, { status })` levés par le service sont déjà gérés par le error handler agent — on les laisse remonter via `next(err)`. Codes spécifiques :
- 401 `INVALID_TOKEN` (auth)
- 403 `INSUFFICIENT_SCOPE` (scope manquant)
- 404 `NOT_FOUND` (conversation ou message inexistant / non accessible)
- 400 `VALIDATION_ERROR` (express-validator)
- 413 `PAYLOAD_TOO_LARGE` (attachment > 5 Mo après décodage base64)
- 500 `AGENT_USER_MISSING` ou `AGENT_USER_CORRUPT` (incohérence DB)

## 7. Évolutions transverses

### 7.1 Scopes

[`lib/agent/scopes.ts:31`](../../../backend/src/lib/agent/scopes.ts) : ajouter `'read:internal-messaging', 'write:internal-messaging'` dans `AGENT_SCOPES`.

Pas de `manage:internal-messaging` séparé en V1 — la création de channel/groupe est sous `write:internal-messaging`. Granularité à ajouter en V2 sans casser (nouveau scope = strict subset).

### 7.2 GET /users côté admin

[`admin/messaging.ts:37-49`](../../../backend/src/routes/admin/messaging.ts) : élargir la whitelist `role: { $in: [...] }` à `['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER', 'AGENT']`. Les humains voient ainsi les agents dans la liste des interlocuteurs.

### 7.3 Durcissement SUPER_ADMIN

[`middleware/role.ts`](../../../backend/src/middleware/role.ts) : nouveau middleware `requireSuperAdmin` (~6 lignes).

[`admin/agentTokens.ts:36`](../../../backend/src/routes/admin/agentTokens.ts) : remplacer `router.use(requireAdmin)` par `router.use(requireSuperAdmin)`. Mettre à jour le commentaire d'en-tête (ligne 17-19).

UI admin : masquer le lien `/admin/agents` dans la sidebar si `user.role !== 'SUPER_ADMIN'`. Composant à identifier à l'implémentation.

### 7.4 OpenAPI

[`lib/agent/openapi.ts`](../../../backend/src/lib/agent/openapi.ts) : intégrer les 13 routes messagerie dans la génération dynamique. Le test [`agent-openapi-sync.test.ts`](../../../backend/src/__tests__/agent-openapi-sync.test.ts) garantit la cohérence schéma ↔ routes — devra passer pour le merge.

### 7.5 Audit

POST/PATCH/DELETE remplissent `res.locals.audit` (pattern identique aux autres routes agent — cf. [`agent/messages.ts:89-94`](../../../backend/src/routes/agent/messages.ts)). Le middleware audit existant côté agent capture automatiquement `actor.type = 'AGENT'`, `tokenId`, IP, user-agent. Pas de log GET (cohérent politique agent).

## 8. Tests

Suite vitest existante, patterns `agent-*-integration.test.ts`.

### 8.1 Nouveau fichier `agent-internal-messaging-integration.test.ts`

Couverture minimale :
- Création token → User AGENT auto-créé, lié, actif, ajouté à #general
- `GET /conversations` : nouveau token voit #general uniquement
- `POST /direct` création DM, idempotence sur memberKey (2× même participant → même conv)
- Envoi message texte (`POST /conversations/:id/messages`), récupération via `GET`, `lastMessageAt` mis à jour
- `POST /conversations/:id/read` → unread count = 0
- Attachment base64 : upload OK, payload > 5 Mo → 413, mimeType préservé, sanitisation filename
- Download attachment : path-traversal bloqué (filename `../../../etc/passwd` ne s'échappe pas)
- Mentions `@(<userId>)` → `Notification` créée pour l'humain mentionné
- Réactions toggle on/off
- Edit/delete : agent ne peut éditer/supprimer que SES messages (assertion existante du service)
- Channel privé : agent non-membre → 404 (ACL préservé)
- Révocation token → user désactivé, scope refusé (401 sur la requête suivante)

### 8.2 Modifications de tests existants

- `agent-scopes.test.ts` : ajouter `read:internal-messaging` et `write:internal-messaging` à la liste des scopes connus.
- `agent-admin-routes.test.ts` : test `requireSuperAdmin` rejette ADMIN/RH/VIEWER (403), accepte SUPER_ADMIN (200).
- `agent-openapi-sync.test.ts` : passe automatiquement (vérification auto).

## 9. Plan de déploiement

1. Migration code (ce chantier).
2. Backfill prod : `npm run script -- backfill-agent-users` (script idempotent).
3. Mise à jour de la doc OpenAPI publique (`/api/v1/agent/openapi.json`).
4. Communication aux consommateurs API (Kuro) : nouveaux endpoints + nouveaux scopes à ajouter aux tokens existants si besoin.

Pas de feature flag — l'API est versionnée (`v1`), un nouveau endpoint = ajout non-breaking.

## 10. Non-objectifs (V2+)

- **Realtime / WebSocket / SSE** pour agents : la V1 est pull-only. Si Kuro doit réagir aux nouveaux messages, il poll (`GET /conversations` + `lastMessageAt`).
- **Granularité scope channel/dm** (`read:channels`, `read:dm` séparés) : reportée à V2 si besoin métier.
- **Multipart upload** : reportée à V2 (cohérent avec la roadmap `agent/documents.ts`).
- **Rate limit spécifique messagerie** : reste le rate limit global du token (120/min default, configurable par token).
- **Permissions internes (`PERMISSIONS.VIEW_MESSAGING`, `SEND_MESSAGES`, `MANAGE_CHANNELS`)** : non appliquées côté agent — le scope OAuth est la barrière. Les permissions internes restent uniquement sur les routes admin (couche route, pas service).
