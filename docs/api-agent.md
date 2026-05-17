# API Agent Venio — Spec V1

API REST de pilotage de Venio par des agents externes (Kuro, intégrations tierces). Distincte de l'API d'ingestion comptable HMAC (`/api/external/:sourceSlug/*`) et de l'API admin classique JWT (`/api/admin/*`).

- **Base path** : `/api/v1/agent`
- **Auth** : Bearer token avec scopes purs (PAT). Token indépendant de tout user.
- **Format** : JSON, objets/tableaux directs (pas d'enveloppe `{ data, meta }`).
- **Pagination** : `?page=1&pageSize=50` → `{ items, page, pageSize, total }`. Cap `pageSize=200`.
- **Rate limit** : 120/min par token, configurable (override par token).
- **OpenAPI** : `GET /api/v1/agent/openapi.json` (sans auth).

## Sommaire

1. [Authentification](#1-authentification)
2. [Idempotency](#2-idempotency)
3. [Audit](#3-audit)
4. [Codes d'erreur](#4-codes-derreur)
5. [Pagination & filtrage](#5-pagination--filtrage)
6. [Catalogue des scopes](#6-catalogue-des-scopes)
7. [Catalogue des endpoints](#7-catalogue-des-endpoints)
8. [Gestion des tokens (admin)](#8-gestion-des-tokens-admin)
9. [Plan d'implémentation](#9-plan-dimpl%C3%A9mentation)

---

## 1. Authentification

Chaque requête doit présenter :

```http
Authorization: Bearer vno_pat_<32 caractères base62>
```

Le secret est généré côté serveur à la création (`POST /api/admin/agent-tokens`) et **affiché une seule fois**. Il est stocké en base sous forme :

- `prefix` : `vno_pat_` + 4 caractères discriminants (12 chars total), **en clair**, sert au lookup et à l'affichage UI.
- `tokenHash` : bcrypt du secret entier.

À chaque requête :

1. Parse `Authorization: Bearer …`. Format invalide → `401 INVALID_TOKEN`.
2. `findOne({ prefix, status: 'ACTIVE' })`.
3. `bcrypt.compare(secret, token.tokenHash)`.
4. Vérifier `expiresAt` (si non null).
5. Attacher `req.agentToken`. Update async de `lastUsedAt / lastUsedIp / lastUsedUserAgent`, `$inc: { totalRequests: 1 }`.

### Scopes

Chaque endpoint déclare les scopes requis via `agentRequireScope('read:crm')`. Sémantique :

- `admin:*` octroie tout.
- Sinon, **tous** les scopes déclarés par l'endpoint doivent être présents sur le token.
- `write:X` n'implique pas `read:X` (ils sont indépendants).
- Scope manquant → `403 INSUFFICIENT_SCOPE` avec `{ required, granted }`.

Catalogue figé dans `_middleware/scopes.ts`. La validation à la création de token rejette les scopes hors catalogue.

## 2. Idempotency

`POST`, `PATCH`, `DELETE` doivent inclure `Idempotency-Key` (UUID v4 recommandé). Absent → `400 MISSING_IDEMPOTENCY_KEY`.

Comportement :

- À l'entrée du handler, `findOne({ tokenId, key })`.
- Si trouvé :
  - `requestHash` identique (sha256 du body) → **rejouer** la réponse stockée (mêmes status + body).
  - `requestHash` différent → `409 IDEMPOTENCY_CONFLICT`.
- Sinon : exécuter, puis stocker `{ status, body }` avec TTL Mongo 24h (`expireAfterSeconds`).

Modèle séparé `AgentIdempotencyKey` avec index unique `(tokenId, key)`.

## 3. Audit

Toute mutation `2xx` est loggée dans `AuditLog` :

```ts
{
  actor: {
    type: 'AGENT',
    agentTokenId,
    agentTokenName,
    ip,
    userAgent,
  },
  action: '<module>.<verb>',   // ex 'crm.client.create', 'projects.update.delete'
  entityType, entityId,
  summary,
  before, after,                // si applicable, fourni par le handler via res.locals.audit
  metadata: { requestId, idempotencyKey, scopes },
}
```

Les `GET` ne sont **pas** loggés (volume).

L'enum `actor.type` du modèle `AuditLog` est étendu pour inclure `'AGENT'`.

## 4. Codes d'erreur

Format uniforme :

```json
{ "error": "Message lisible", "code": "INSUFFICIENT_SCOPE", "requestId": "req_..." }
```

| HTTP | Code                       | Cas                                          |
|------|----------------------------|----------------------------------------------|
| 400  | `MISSING_IDEMPOTENCY_KEY`  | header obligatoire absent sur POST/PATCH/DELETE |
| 400  | `VALIDATION_ERROR`         | body parsé mais champs invalides             |
| 401  | `MISSING_TOKEN`            | Authorization absent ou mal formé            |
| 401  | `INVALID_TOKEN`            | token introuvable / mismatch hash            |
| 401  | `EXPIRED_TOKEN`            | `expiresAt < now`                            |
| 403  | `INSUFFICIENT_SCOPE`       | scope manquant (renvoie `required` + `granted`) |
| 404  | `NOT_FOUND`                | ressource inconnue                           |
| 409  | `IDEMPOTENCY_CONFLICT`     | clé réutilisée avec un body différent        |
| 422  | `UNPROCESSABLE`            | sémantique invalide (ex : doublon contrainte) |
| 429  | `RATE_LIMITED`             | quota dépassé (header `Retry-After`)         |
| 500  | `INTERNAL`                 | erreur serveur                               |

## 5. Pagination & filtrage

Toutes les listes :

```http
GET /api/v1/agent/clients?page=1&pageSize=50&q=acme&sort=-createdAt&status=ACTIVE
```

Réponse :

```json
{
  "items": [...],
  "page": 1,
  "pageSize": 50,
  "total": 248
}
```

- `pageSize` capé à 200, défaut 50.
- `q` : recherche full-text si la ressource supporte (cf. catalogue).
- `sort` : `<field>` ou `-<field>` (descendant). Whitelist par ressource.
- Autres filtres dépendent de la ressource (cf. catalogue).

## 6. Catalogue des scopes

| Scope                      | Sens                                   | Notes                  |
|----------------------------|----------------------------------------|------------------------|
| `read:crm` / `write:crm`   | clients, leads, contacts, notes, activities | —                |
| `read:projects` / `write:projects` | projects, sections, items, updates, briefs, templates, internalProjects | — |
| `read:billing` / `write:billing` | devis, factures, avoirs            | —                |
| `read:accounting`          | toute la comptabilité                  | **lecture seule V1**   |
| `read:documents` / `write:documents` | upload, list, download, delete   | —                |
| `read:tasks` / `write:tasks` | tasks + comments + attachments       | —                |
| `read:tickets` / `write:tickets` | internalTickets                    | —                |
| `read:messages` / `write:messages` | admin + client messages          | —                |
| `read:notifications` / `write:notifications` | notifs send/read         | —                |
| `read:calendar` / `write:calendar` | événements                       | —                |
| `read:qualiopi` / `write:qualiopi` | questionnaires, critères, indicateurs | —             |
| `read:interns` / `write:interns` | stagiaires, missions, rapports     | —                |
| `read:toolaccess` / `write:toolaccess` | credentials tiers            | **sensible**     |
| `read:resources` / `write:resources` | ressources entreprise          | —                |
| `read:gestion` / `write:gestion` | tableaux de gestion                | —                |
| `read:arrow` / `write:arrow` | pilotage + prospection Arrow         | —                |
| `read:analytics`           | snapshots, rapports                    | lecture seule    |
| `read:audit`               | AuditLog                               | **lecture seule** (immuable) |
| `read:automations` / `write:automations` / `trigger:automations` | settings + déclenchement | — |
| `read:backup` / `manage:backup` | trigger + restore                  | **très sensible** |
| `read:2fa` / `manage:2fa`  | activer/désactiver 2FA d'un user       | **très sensible** |
| `read:users` / `write:users` | gestion users                        | —                |
| `admin:*`                  | super-scope (octroie tout)             | tokens master uniquement |

## 7. Catalogue des endpoints

> Le tableau exhaustif des URLs sera tenu à jour dans `backend/src/routes/agent/openapi.json`. Ce qui suit donne la **map module → scopes**.

| Module           | Préfixe                          | Scopes lecture       | Scopes écriture        |
|------------------|----------------------------------|----------------------|------------------------|
| CRM              | `/crm/clients`, `/crm/leads`     | `read:crm`           | `write:crm`            |
| Projets          | `/projects`                      | `read:projects`      | `write:projects`       |
| Billing          | `/billing`                       | `read:billing`       | `write:billing`        |
| Comptabilité     | `/accounting`                    | `read:accounting`    | —                      |
| Documents        | `/documents`                     | `read:documents`     | `write:documents`      |
| Tâches           | `/tasks`                         | `read:tasks`         | `write:tasks`          |
| Tickets          | `/tickets`                       | `read:tickets`       | `write:tickets`        |
| Messages         | `/messages`                      | `read:messages`      | `write:messages`       |
| Notifications    | `/notifications`                 | `read:notifications` | `write:notifications`  |
| Calendrier       | `/calendar`                      | `read:calendar`      | `write:calendar`       |
| Qualiopi         | `/qualiopi`                      | `read:qualiopi`      | `write:qualiopi`       |
| Stagiaires       | `/interns`                       | `read:interns`       | `write:interns`        |
| Tool Access      | `/tool-access`                   | `read:toolaccess`    | `write:toolaccess`     |
| Ressources       | `/resources`                     | `read:resources`     | `write:resources`      |
| Gestion          | `/gestion`                       | `read:gestion`       | `write:gestion`        |
| Arrow            | `/arrow`                         | `read:arrow`         | `write:arrow`          |
| Analytics        | `/analytics`                     | `read:analytics`     | —                      |
| Audit            | `/audit`                         | `read:audit`         | —                      |
| Automations      | `/automations`                   | `read:automations`   | `write:automations` + `trigger:automations` |
| Backup           | `/backup`                        | `read:backup`        | `manage:backup`        |
| 2FA              | `/users/:id/2fa`                 | `read:2fa`           | `manage:2fa`           |
| Users            | `/users`                         | `read:users`         | `write:users`          |

## 8. Gestion des tokens (admin)

Routes JWT classiques sous `/api/admin/agent-tokens` :

| Méthode | Path                                  | Effet                                     |
|---------|---------------------------------------|-------------------------------------------|
| GET     | `/api/admin/agent-tokens`             | Liste (sans secrets)                      |
| POST    | `/api/admin/agent-tokens`             | Crée, renvoie le secret **une seule fois**|
| GET     | `/api/admin/agent-tokens/:id`         | Détail                                    |
| PATCH   | `/api/admin/agent-tokens/:id`         | Renomme, change scopes / rateLimit / expiresAt / notes |
| POST    | `/api/admin/agent-tokens/:id/revoke`  | `status=REVOKED`, `revokedAt`, `revokedBy`|

Pas de suppression dure : la révocation suffit (le token reste consultable dans AuditLog).

UI : page `/admin/agents` avec liste + modal de création (révèle le secret avec bouton "Copier" + warning "Ne sera plus affiché") + édition + révocation.

## 9. Plan d'implémentation

Découpage en lots indépendamment mergeables :

1. **Fondations** : modèles `AgentToken` + `AgentIdempotencyKey`, middleware `auth/scopes/idempotency/audit/pagination/errors`, mount `/api/v1/agent`, route `GET /ping`. Tests d'auth/scopes/idempotency/rate-limit.
2. **Admin tokens** : routes `/api/admin/agent-tokens/*` + UI `/admin/agents`. Tests.
3. **CRM** : `agent/crm.ts`. Tests.
4. **Projets** : `agent/projects.ts`. Tests.
5. **Billing + Documents**. Tests.
6. **Tasks + Tickets + Messages + Notifications + Calendar**. Tests.
7. **Comptabilité (read-only)**. Tests.
8. **Qualiopi + Interns + Resources + Gestion + Arrow + Analytics + ToolAccess**. Tests.
9. **Sensibles : Audit (RO), Automations, Backup, 2FA, Users**. Tests.
10. **OpenAPI complet + test de synchronisation routeur ↔ spec**.

L'API est utilisable dès la fin du lot 1 (avec `ping`). Chaque lot suivant ajoute des modules sans casser les précédents.
