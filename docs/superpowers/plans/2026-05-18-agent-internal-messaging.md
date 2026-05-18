# Agent × Messagerie interne — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre aux agents externes authentifiés (Kuro, intégrations tierces) de lire et écrire dans la messagerie interne Venio via 13 endpoints REST avec parité fonctionnelle vs admin, en suivant les patterns établis de l'API agent (Bearer + scopes + audit + idempotency).

**Architecture:** Le service `services/internalMessaging.ts` reste source unique de vérité (une seule ligne modifiée). Chaque AgentToken se voit auto-attribuer un `User` système (role `AGENT`) à la création — à chaque requête agent messagerie, on charge ce user et on construit un `JwtPayload` fantôme passé au service. ACL conversation = comme un user normal (channels PUBLIC + memberships). Création de token durcie à `SUPER_ADMIN`.

**Tech Stack:** Express 5 + Mongoose (TypeScript), `express-validator`, `bcryptjs`, `tsx --watch`, tests `vitest` + `supertest`. Stockage attachments : disque local sous `uploads/agent/internal-messaging/<conversationId>/`.

**Spec:** [docs/superpowers/specs/2026-05-18-agent-internal-messaging-design.md](../specs/2026-05-18-agent-internal-messaging-design.md) (commit 8895dc6).

---

## File Structure

**Modifications de fichiers existants :**
- `backend/src/types/enums.ts` — ajouter `'AGENT'` au type `UserRole`
- `backend/src/types/models/index.ts` (ou fichier user) — ajouter `agentTokenId?` à `IUser`, `userId` à `IAgentToken`
- `backend/src/models/User.ts` — enum role + champ `agentTokenId`
- `backend/src/models/AgentToken.ts` — champ `userId`
- `backend/src/lib/permissions.ts` — ajouter `isInternalRole`
- `backend/src/services/internalMessaging.ts` — `assertInternalUser` utilise `isInternalRole`
- `backend/src/lib/agent/scopes.ts` — ajouter 2 nouveaux scopes
- `backend/src/middleware/role.ts` — ajouter `requireSuperAdmin`
- `backend/src/routes/admin/agentTokens.ts` — `requireSuperAdmin` au lieu de `requireAdmin`, création/patch/revoke du User AGENT
- `backend/src/routes/admin/messaging.ts:37-49` — élargir whitelist `GET /users` à inclure `AGENT`
- `backend/src/routes/agent/index.ts` — monter le nouveau routeur

**Nouveaux fichiers :**
- `backend/src/routes/agent/_middleware/asUser.ts` — helper `loadAgentUserPayload`
- `backend/src/routes/agent/messaging.ts` — 13 endpoints
- `backend/scripts/backfill-agent-users.ts` — script de migration prod (idempotent)
- `backend/src/__tests__/agent-internal-messaging-integration.test.ts` — tests d'intégration
- `backend/src/__tests__/agent-admin-supadmin.test.ts` — test du durcissement ACL tokens

---

## Phase 1 — Fondations (modèles, role, scopes)

### Task 1: Ajouter role 'AGENT' au type UserRole

**Files:**
- Modify: `backend/src/types/enums.ts`

- [ ] **Step 1: Localiser l'enum UserRole**

Run: `grep -n "UserRole\|SUPER_ADMIN" backend/src/types/enums.ts`

Expected: Une ligne définit `UserRole` comme une union de string literals incluant `'SUPER_ADMIN' | 'ADMIN' | 'RH' | 'VIEWER' | 'CLIENT'`.

- [ ] **Step 2: Ajouter `'AGENT'` au type**

Édition : ajouter `| 'AGENT'` à la fin de l'union `UserRole`. Si une constante `USER_ROLES` array existe à côté (pour validation), ajouter `'AGENT'` aussi. Si un type `AdminRole` existe distinct, **ne pas** y ajouter `'AGENT'` — un agent n'est pas un admin.

- [ ] **Step 3: Compiler le projet**

Run: `cd backend && npx tsc --noEmit`

Expected: Pas d'erreur. Si des switch exhaustifs sur `UserRole` cassent, ajouter le case `AGENT` (probablement avec un `return false` ou équivalent au cas par cas).

- [ ] **Step 4: Commit**

```bash
git add backend/src/types/enums.ts
git commit -m "feat(types): ajoute role AGENT à UserRole"
```

---

### Task 2: Ajouter `agentTokenId` au modèle User

**Files:**
- Modify: `backend/src/models/User.ts`
- Modify: `backend/src/types/models/index.ts` (ou le fichier de type d'User selon l'arborescence)

- [ ] **Step 1: Localiser l'interface IUser**

Run: `grep -rn "interface IUser\|IUser " backend/src/types/`

Expected: Un fichier expose `IUser`. Lire ce fichier.

- [ ] **Step 2: Ajouter `agentTokenId` à l'interface**

Édition dans le fichier de type :
```ts
agentTokenId?: mongoose.Types.ObjectId | null
```

- [ ] **Step 3: Ajouter le champ au schema Mongoose**

Édition dans `backend/src/models/User.ts`, dans la définition du schema (après les champs existants, avant les options) :
```ts
agentTokenId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'AgentToken',
  default: null,
  index: true,
},
```

- [ ] **Step 4: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/User.ts backend/src/types/
git commit -m "feat(user): ajoute agentTokenId pour lier les users AGENT à leur token"
```

---

### Task 3: Ajouter `userId` au modèle AgentToken

**Files:**
- Modify: `backend/src/models/AgentToken.ts`
- Modify: `backend/src/types/models/index.ts` (interface `IAgentToken`)

- [ ] **Step 1: Lire l'interface IAgentToken**

Run: `grep -rn "interface IAgentToken" backend/src/types/`

- [ ] **Step 2: Ajouter `userId` à l'interface**

```ts
userId: mongoose.Types.ObjectId
```

(non-optionnel : tout nouveau token aura un User auto-créé)

- [ ] **Step 3: Ajouter le champ au schema**

Dans `backend/src/models/AgentToken.ts`, ajouter dans le schema (après `tokenHash`) :
```ts
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: false, // required côté code seulement — laisse possible la migration des tokens existants
  default: null,
  index: true,
},
```

Note : `required: false` au schema mais on traite l'absence comme une incohérence dans `loadAgentUserPayload` (cf. Task 19). Ça permet aux tokens existants en prod de continuer à booter pendant le backfill (Task 35).

- [ ] **Step 4: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/AgentToken.ts backend/src/types/
git commit -m "feat(agent-token): ajoute userId pour lier au User AGENT système"
```

---

### Task 4: Ajouter `isInternalRole` dans permissions.ts

**Files:**
- Modify: `backend/src/lib/permissions.ts`
- Test: `backend/src/__tests__/agent-internal-messaging-integration.test.ts` (sera créé en Task 21, on pose juste les prédicats ici)

- [ ] **Step 1: Lire le fichier existant**

Run: `grep -n "isAdminRole\|AdminRole" backend/src/lib/permissions.ts`

- [ ] **Step 2: Ajouter le predicate**

Sous la fonction `isAdminRole`, ajouter :
```ts
/**
 * Un user "interne" est soit un admin humain (SUPER_ADMIN, ADMIN, RH, VIEWER),
 * soit un agent système (AGENT). Utilisé par la messagerie interne pour
 * autoriser à la fois les humains internes et les agents externes à
 * envoyer/lire des messages. N'octroie AUCUNE permission admin par lui-même.
 */
export function isInternalRole(role: UserRole): boolean {
  return isAdminRole(role) || role === 'AGENT'
}
```

- [ ] **Step 3: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/permissions.ts
git commit -m "feat(permissions): ajoute isInternalRole (admin humain OU agent)"
```

---

### Task 5: Adapter `assertInternalUser` dans le service

**Files:**
- Modify: `backend/src/services/internalMessaging.ts:34-40`

- [ ] **Step 1: Remplacer la condition**

Édition de la fonction `assertInternalUser` ligne 34-40 :

Avant :
```ts
export function assertInternalUser(user: JwtPayload): void {
  if (!isAdminRole(user.role)) {
    const err = new Error('Forbidden')
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
}
```

Après :
```ts
export function assertInternalUser(user: JwtPayload): void {
  if (!isInternalRole(user.role)) {
    const err = new Error('Forbidden')
    ;(err as Error & { status?: number }).status = 403
    throw err
  }
}
```

Et adapter l'import en haut du fichier :
```ts
import { isInternalRole } from '../lib/permissions.js'
```

(remplace `import { isAdminRole } ...`)

- [ ] **Step 2: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 3: Lancer les tests existants de la messagerie interne**

Run: `cd backend && npx vitest run internalMessaging.test.ts`

Expected: Tous passent (les tests existants utilisent des users admin humains — la modif ne casse rien pour eux).

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/internalMessaging.ts
git commit -m "feat(messaging): assertInternalUser accepte aussi le role AGENT"
```

---

### Task 6: Ajouter les scopes `read/write:internal-messaging`

**Files:**
- Modify: `backend/src/lib/agent/scopes.ts:31`

- [ ] **Step 1: Modifier la liste AGENT_SCOPES**

Dans `backend/src/lib/agent/scopes.ts`, remplacer la ligne 31 :
```ts
  'read:messages', 'write:messages',
```

Par :
```ts
  'read:messages', 'write:messages',
  'read:internal-messaging', 'write:internal-messaging',
```

- [ ] **Step 2: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 3: Lancer le test de scopes**

Run: `cd backend && npx vitest run agent-scopes`

Expected: PASS (le test vérifie typiquement le format et l'unicité — on n'a fait que rallonger la liste).

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/agent/scopes.ts
git commit -m "feat(agent-scopes): ajoute read/write:internal-messaging"
```

---

## Phase 2 — Cycle de vie AgentToken ↔ User système

### Task 7: Test : POST /api/admin/agent-tokens crée un User AGENT lié

**Files:**
- Create: `backend/src/__tests__/agent-admin-token-user.test.ts`

- [ ] **Step 1: Écrire le test failing**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp } from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import jwt from 'jsonwebtoken'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

async function loginAsSuperAdmin(): Promise<string> {
  const admin = await User.create({
    email: 'super@venio.test',
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Super',
    role: 'SUPER_ADMIN',
  })
  return jwt.sign(
    { id: String(admin._id), email: admin.email, name: admin.name, role: 'SUPER_ADMIN' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  )
}

describe('AgentToken ↔ User AGENT lifecycle', () => {
  it('POST /agent-tokens crée un User AGENT lié et l\'ajoute à #general', async () => {
    const jwtTok = await loginAsSuperAdmin()

    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({
        name: 'Kuro Prod',
        scopes: ['read:internal-messaging', 'write:internal-messaging'],
      })

    expect(res.status).toBe(201)
    expect(res.body.plainSecret).toMatch(/^vno_pat_/)
    const tokenId = res.body.token._id

    const tokenInDb = await AgentToken.findById(tokenId).lean()
    expect(tokenInDb!.userId).toBeTruthy()

    const userInDb = await User.findById(tokenInDb!.userId).lean()
    expect(userInDb).toBeTruthy()
    expect(userInDb!.role).toBe('AGENT')
    expect(userInDb!.name).toBe('Kuro Prod')
    expect(userInDb!.isActive).toBe(true)
    expect(userInDb!.agentTokenId!.toString()).toBe(String(tokenId))
    expect(userInDb!.email).toMatch(/^agent-.+@venio\.internal$/)
  })
})
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: FAIL — `tokenInDb.userId` est `null` (le code POST actuel ne crée pas de User).

- [ ] **Step 3: Implémenter la création**

Modifier `backend/src/routes/admin/agentTokens.ts`, dans le handler `POST /` (entre les lignes 99 et 110 actuelles) :

Avant `const token = await AgentToken.create(...)` :
```ts
// Génère un email unique non-routable pour le User AGENT
const agentEmail = `agent-${new mongoose.Types.ObjectId().toString()}@venio.internal`

// Création du User AGENT en premier (pas d'agentTokenId encore — chicken-and-egg)
const agentUser = await User.create({
  email: agentEmail,
  passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
  name: String(name).trim(),
  role: 'AGENT',
  isActive: true,
})
```

Modifier `AgentToken.create(...)` pour inclure `userId: agentUser._id`.

Après `AgentToken.create(...)`, patcher le User :
```ts
agentUser.agentTokenId = token._id as mongoose.Types.ObjectId
await agentUser.save()
```

Imports à ajouter en haut du fichier :
```ts
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import User from '../../models/User.js'
import { ensureGeneralChannel } from '../../services/internalMessaging.js'
```

Et après la création complète du User+Token, ajouter (avant `recordAudit`) :
```ts
// Ajoute l'agent au channel #general
try {
  await ensureGeneralChannel({
    id: String(agentUser._id),
    name: agentUser.name,
    email: agentUser.email,
    role: 'AGENT',
  })
} catch (err) {
  console.warn('[agent-token-create] ensureGeneralChannel failed:', (err as Error).message)
}
```

- [ ] **Step 4: Lancer le test à nouveau**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin/agentTokens.ts backend/src/__tests__/agent-admin-token-user.test.ts
git commit -m "feat(agent-token): auto-crée le User AGENT à la création du token"
```

---

### Task 8: Test + impl : Rollback du User si la création du Token échoue

**Files:**
- Modify: `backend/src/__tests__/agent-admin-token-user.test.ts` (ajout d'un `it`)
- Modify: `backend/src/routes/admin/agentTokens.ts`

- [ ] **Step 1: Ajouter le test failing**

Dans le `describe(...)`, ajouter :
```ts
it('supprime le User AGENT si la création du Token échoue', async () => {
  const jwtTok = await loginAsSuperAdmin()

  // Provoque une erreur en envoyant un scope inconnu, qui passe les validators
  // mais déclenche findUnknownScopes côté handler.
  const res = await request(app)
    .post('/api/admin/agent-tokens')
    .set('Authorization', `Bearer ${jwtTok}`)
    .send({ name: 'Bad', scopes: ['scope:inexistant'] })

  expect(res.status).toBe(400)
  // Pas de user orphelin avec role AGENT
  const agentUsers = await User.find({ role: 'AGENT' }).lean()
  expect(agentUsers).toHaveLength(0)
})
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: FAIL — actuellement la validation des scopes s'exécute AVANT la création du User, donc le user n'est pas créé du tout dans ce cas. Mais si tu as déplacé `User.create` après la validation, il devrait passer. Vérifier l'ordre.

⚠️ Si le test passe sans changement de code, c'est OK — ça signifie que la validation des scopes vient avant `User.create` (cf. Task 7 step 3 : on a mis `User.create` après `findUnknownScopes` ? À vérifier dans ton implémentation).

**Si test FAIL** : reorder. Mettre la création de User APRÈS `findUnknownScopes`, ou wrap dans un try/catch :
```ts
try {
  const token = await AgentToken.create({ ..., userId: agentUser._id })
  agentUser.agentTokenId = token._id as mongoose.Types.ObjectId
  await agentUser.save()
} catch (err) {
  await User.deleteOne({ _id: agentUser._id }).catch(() => {})
  throw err
}
```

- [ ] **Step 3: Test PASS**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: PASS pour les 2 tests du describe.

- [ ] **Step 4: Commit**

```bash
git add backend/src/__tests__/agent-admin-token-user.test.ts backend/src/routes/admin/agentTokens.ts
git commit -m "fix(agent-token): rollback User AGENT si AgentToken.create échoue"
```

---

### Task 9: Test + impl : PATCH propage le rename au User

**Files:**
- Modify: `backend/src/__tests__/agent-admin-token-user.test.ts` (nouveau `it`)
- Modify: `backend/src/routes/admin/agentTokens.ts` (handler PATCH)

- [ ] **Step 1: Test failing**

```ts
it('PATCH renomme aussi le User AGENT lié', async () => {
  const jwtTok = await loginAsSuperAdmin()
  const created = await request(app)
    .post('/api/admin/agent-tokens')
    .set('Authorization', `Bearer ${jwtTok}`)
    .send({ name: 'Old name', scopes: ['read:crm'] })
  const tokenId = created.body.token._id
  const userId = (await AgentToken.findById(tokenId).lean())!.userId

  const patchRes = await request(app)
    .patch(`/api/admin/agent-tokens/${tokenId}`)
    .set('Authorization', `Bearer ${jwtTok}`)
    .send({ name: 'New name' })
  expect(patchRes.status).toBe(200)

  const user = await User.findById(userId).lean()
  expect(user!.name).toBe('New name')
})
```

- [ ] **Step 2: Vérifier FAIL**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: FAIL — `user.name` est encore "Old name".

- [ ] **Step 3: Implémenter**

Dans le handler PATCH de `backend/src/routes/admin/agentTokens.ts`, après `await token.save()` (vers ligne 223 actuelle) :
```ts
// Propage le rename au User AGENT lié, s'il y a eu un changement de nom.
if (typeof req.body.name === 'string' && token.userId) {
  await User.updateOne(
    { _id: token.userId },
    { $set: { name: token.name } }
  ).catch((err) => console.warn('[agent-token-patch] user rename failed:', (err as Error).message))
}
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/__tests__/agent-admin-token-user.test.ts backend/src/routes/admin/agentTokens.ts
git commit -m "feat(agent-token): propage le rename au User AGENT lié"
```

---

### Task 10: Test + impl : Revoke désactive le User AGENT

**Files:**
- Modify: `backend/src/__tests__/agent-admin-token-user.test.ts` (nouveau `it`)
- Modify: `backend/src/routes/admin/agentTokens.ts` (handler revoke)

- [ ] **Step 1: Test failing**

```ts
it('revoke désactive le User AGENT lié et préfixe son nom', async () => {
  const jwtTok = await loginAsSuperAdmin()
  const created = await request(app)
    .post('/api/admin/agent-tokens')
    .set('Authorization', `Bearer ${jwtTok}`)
    .send({ name: 'ToRevoke', scopes: ['read:crm'] })
  const tokenId = created.body.token._id
  const userId = (await AgentToken.findById(tokenId).lean())!.userId

  const revokeRes = await request(app)
    .post(`/api/admin/agent-tokens/${tokenId}/revoke`)
    .set('Authorization', `Bearer ${jwtTok}`)
    .send({})
  expect(revokeRes.status).toBe(200)

  const user = await User.findById(userId).lean()
  expect(user!.isActive).toBe(false)
  expect(user!.name).toBe('[Révoqué] ToRevoke')
})
```

- [ ] **Step 2: Vérifier FAIL**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: FAIL — user encore actif, name inchangé.

- [ ] **Step 3: Implémenter**

Dans le handler `POST /:id/revoke` de `agentTokens.ts`, après `await token.save()` (vers ligne 281) :
```ts
// Désactive le User AGENT lié et marque son nom.
if (token.userId) {
  await User.updateOne(
    { _id: token.userId },
    { $set: { isActive: false, name: `[Révoqué] ${token.name}` } }
  ).catch((err) => console.warn('[agent-token-revoke] user deactivate failed:', (err as Error).message))
}
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-admin-token-user`

Expected: PASS pour les 4 tests du describe.

- [ ] **Step 5: Commit**

```bash
git add backend/src/__tests__/agent-admin-token-user.test.ts backend/src/routes/admin/agentTokens.ts
git commit -m "feat(agent-token): révocation désactive le User AGENT lié"
```

---

### Task 11: Test + impl : GET /admin/messaging/users inclut les AGENT actifs

**Files:**
- Modify: `backend/src/routes/admin/messaging.ts:37-49`
- Test: integration test à venir en Task 21 — pas de test dédié ici (couvert par les tests messagerie agent)

- [ ] **Step 1: Modifier le filtre**

Dans `backend/src/routes/admin/messaging.ts:37-49`, remplacer :
```ts
const users = await User.find({
  role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER'] },
  isActive: true,
})
```

Par :
```ts
const users = await User.find({
  role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER', 'AGENT'] },
  isActive: true,
})
```

- [ ] **Step 2: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 3: Lancer les tests messagerie admin existants**

Run: `cd backend && npx vitest run internalMessaging.test.ts`
Expected: PASS (les agents ne sont pas créés dans ces tests donc le résultat est identique).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/admin/messaging.ts
git commit -m "feat(messaging): GET /users inclut les users AGENT actifs"
```

---

## Phase 3 — Durcissement SUPER_ADMIN sur /api/admin/agent-tokens

### Task 12: Ajouter `requireSuperAdmin` au middleware role

**Files:**
- Modify: `backend/src/middleware/role.ts`
- Create: `backend/src/__tests__/agent-admin-supadmin.test.ts`

- [ ] **Step 1: Test failing**

Créer `backend/src/__tests__/agent-admin-supadmin.test.ts` :
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp } from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(async () => teardownMongo())
beforeEach(async () => clearDb())

async function loginAs(role: 'SUPER_ADMIN' | 'ADMIN' | 'RH' | 'VIEWER'): Promise<string> {
  const u = await User.create({
    email: `${role.toLowerCase()}@venio.test`,
    passwordHash: await bcrypt.hash('x', 10),
    name: role,
    role,
  })
  return jwt.sign(
    { id: String(u._id), email: u.email, name: u.name, role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  )
}

describe('Durcissement /api/admin/agent-tokens à SUPER_ADMIN', () => {
  it('rejette ADMIN avec 403', async () => {
    const tok = await loginAs('ADMIN')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(403)
  })

  it('rejette RH avec 403', async () => {
    const tok = await loginAs('RH')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(403)
  })

  it('rejette VIEWER avec 403', async () => {
    const tok = await loginAs('VIEWER')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(403)
  })

  it('accepte SUPER_ADMIN avec 200', async () => {
    const tok = await loginAs('SUPER_ADMIN')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Vérifier FAIL**

Run: `cd backend && npx vitest run agent-admin-supadmin`

Expected: 3 premiers tests FAIL (ADMIN/RH/VIEWER renvoient 200 actuellement), 4ème PASS.

- [ ] **Step 3: Ajouter `requireSuperAdmin`**

Dans `backend/src/middleware/role.ts`, après `requireAdmin` (vers ligne 22) :
```ts
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}
```

- [ ] **Step 4: Remplacer dans agentTokens.ts**

Dans `backend/src/routes/admin/agentTokens.ts` :

Ligne 4 :
```ts
import { requireSuperAdmin } from '../../middleware/role.js'
```

Ligne 36 :
```ts
router.use(requireSuperAdmin)
```

Mettre à jour le commentaire d'en-tête (ligne 17-19) :
```ts
 * Auth : JWT SUPER_ADMIN uniquement (middleware auth + requireSuperAdmin).
 * Les ADMIN/RH/VIEWER reçoivent 403. Le createdBy garde trace de l'admin
 * émetteur.
```

- [ ] **Step 5: PASS**

Run: `cd backend && npx vitest run agent-admin-supadmin agent-admin-token-user`

Expected: Tous les tests passent. (Le test précédent `agent-admin-token-user` utilise déjà SUPER_ADMIN donc reste vert.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/role.ts backend/src/routes/admin/agentTokens.ts backend/src/__tests__/agent-admin-supadmin.test.ts
git commit -m "feat(admin): durcit /agent-tokens à SUPER_ADMIN only"
```

---

### Task 13: Masquer le lien sidebar `/admin/agents` pour les non-SUPER_ADMIN (frontend)

**Files:**
- Modify: composant sidebar à identifier (probablement `src/components/admin/AdminShell.tsx` ou `src/components/admin/AdminSidebar.tsx`)

- [ ] **Step 1: Localiser le composant sidebar**

Run: `grep -rln "admin/agents\|AdminNav\|AdminSidebar" src/components/admin/ src/pages/admin/ 2>/dev/null | head -10`

- [ ] **Step 2: Identifier l'entrée du menu `/admin/agents`**

Run: `grep -rn "admin/agents" src/ 2>/dev/null | head`

- [ ] **Step 3: Conditionner l'affichage**

Identifier comment le user courant est récupéré dans le composant (probablement un `useAuth()` ou `useUser()`). Wrapper l'item de menu dans :
```tsx
{user?.role === 'SUPER_ADMIN' && (
  // ... item de menu pour /admin/agents ...
)}
```

Si le menu est défini par un array de items, ajouter un filtre par `requiredRole` :
```tsx
const items = [
  // ...
  { label: 'Agents', path: '/admin/agents', requiredRole: 'SUPER_ADMIN' },
]
const visibleItems = items.filter((i) => !i.requiredRole || user?.role === i.requiredRole)
```

- [ ] **Step 4: Vérifier visuellement**

Run: `cd /Users/raphaelbentvelzen/Dev/Venio && npm run dev` (le projet — pas dans le worktree backend)

Se connecter comme ADMIN (créer un user de test si besoin), vérifier que le lien Agents n'apparaît pas. Se reconnecter comme SUPER_ADMIN, vérifier qu'il apparaît.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/
git commit -m "feat(admin): masque l'entrée /admin/agents pour les non-SUPER_ADMIN"
```

---

## Phase 4 — Helper `loadAgentUserPayload`

### Task 14: Étendre le typage Express pour `req.agentUser`

**Files:**
- Modify: `backend/src/types/express.d.ts` (ou `backend/src/types/express.ts`)

- [ ] **Step 1: Trouver le fichier**

Run: `grep -rln "agentToken?:\|interface Request" backend/src/types/`

- [ ] **Step 2: Ajouter le champ**

Dans la déclaration `declare global { namespace Express { interface Request { ... } } }`, ajouter :
```ts
agentUser?: JwtPayload
```

(import de `JwtPayload` à ajouter si absent)

- [ ] **Step 3: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 4: Commit**

```bash
git add backend/src/types/
git commit -m "feat(types): expose req.agentUser pour le pipeline messagerie"
```

---

### Task 15: Helper `loadAgentUserPayload`

**Files:**
- Create: `backend/src/routes/agent/_middleware/asUser.ts`
- Test: `backend/src/__tests__/agent-internal-messaging-integration.test.ts` (sera créé en Task 17 — pas de test isolé ici, le helper est testé indirectement)

- [ ] **Step 1: Écrire le helper**

```ts
import type { Request } from 'express'
import User from '../../../models/User.js'
import type { JwtPayload } from '../../../types/express.js'
import { AgentApiError } from './errors.js'

/**
 * Charge le User AGENT associé au token courant et construit un JwtPayload
 * compatible avec le service `internalMessaging.ts`.
 *
 * Cache par requête : si déjà résolu, retourne `req.agentUser`.
 *
 * Erreurs :
 *   - AGENT_USER_MISSING (500) : token sans User lié (incohérence DB ; tokens
 *     pré-existants avant le backfill, ou User supprimé manuellement).
 *   - AGENT_USER_CORRUPT (500) : User trouvé mais role ≠ AGENT.
 */
export async function loadAgentUserPayload(req: Request): Promise<JwtPayload> {
  if (req.agentUser) return req.agentUser
  const tokenId = req.agentToken?.id
  if (!tokenId) {
    throw new AgentApiError(500, 'NO_TOKEN', 'Token absent du contexte (bug ordre middleware)')
  }
  const user = await User.findOne({ agentTokenId: tokenId, isActive: true })
    .select('_id name email role')
    .lean()
  if (!user) {
    throw new AgentApiError(
      500,
      'AGENT_USER_MISSING',
      'Aucun User AGENT actif associé à ce token — backfill peut-être nécessaire'
    )
  }
  if (user.role !== 'AGENT') {
    throw new AgentApiError(500, 'AGENT_USER_CORRUPT', `User lié a un role inattendu : ${user.role}`)
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

- [ ] **Step 2: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/agent/_middleware/asUser.ts
git commit -m "feat(agent-mw): helper loadAgentUserPayload"
```

---

## Phase 5 — Routes agent messagerie

### Task 16: Squelette + montage du sous-routeur

**Files:**
- Create: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/routes/agent/index.ts`

- [ ] **Step 1: Créer le squelette**

`backend/src/routes/agent/messaging.ts` :
```ts
import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { body, param, query, validationResult } from 'express-validator'
import User from '../../models/User.js'
import InternalMessage from '../../models/InternalMessage.js'
import {
  createConversation,
  createMessage,
  listConversations,
  listMessages,
  markConversationRead,
  searchMessages,
  softDeleteMessage,
  toggleReaction,
  updateMessage,
} from '../../services/internalMessaging.js'
import { requireScope } from './_middleware/auth.js'
import { respondError, AgentApiError } from './_middleware/errors.js'
import { loadAgentUserPayload } from './_middleware/asUser.js'

/**
 * Routes agent pour la messagerie interne (InternalConversation /
 * InternalMessage). Parité fonctionnelle vs admin/messaging.ts.
 *
 * Scopes :
 *   - GET → read:internal-messaging
 *   - POST/PATCH/DELETE → write:internal-messaging
 *
 * Auth : Bearer agent token (cf. index.ts). Identité du sender résolue via
 * loadAgentUserPayload (User AGENT lié au token).
 *
 * ACL conversation : identique aux humains — PUBLIC channels + memberships.
 *
 * Attachments : base64 dans body JSON, cap 5 Mo/fichier, max 5/message,
 * storage `uploads/agent/internal-messaging/<conversationId>/`.
 */

const router = express.Router()

// ── Helpers ────────────────────────────────────────────────────────────────

const RAW_LIMIT_MB = 5
const RAW_LIMIT_BYTES = RAW_LIMIT_MB * 1024 * 1024

function isValidObjectId(id: unknown): boolean {
  return typeof id === 'string' && mongoose.isValidObjectId(id)
}

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads')
}

function safeFilename(originalName: string): string {
  return originalName
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-100)
}

// ── Routes (ajoutées dans les tâches suivantes) ────────────────────────────

export default router
```

- [ ] **Step 2: Monter dans index.ts**

Dans `backend/src/routes/agent/index.ts` :

Après ligne 33 (`import usersRoutes ...`) :
```ts
import messagingRoutes from './messaging.js'
```

Après ligne 131 (`router.use('/', usersRoutes)`) :
```ts
router.use('/messaging', messagingRoutes)
```

- [ ] **Step 3: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/routes/agent/index.ts
git commit -m "feat(agent-messaging): squelette du sous-routeur + montage"
```

---

### Task 17: Setup du fichier de tests d'intégration messagerie agent

**Files:**
- Create: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Squelette du fichier**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import InternalConversation from '../models/InternalConversation.js'
import InternalConversationMember from '../models/InternalConversationMember.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => teardownMongo())

beforeEach(async () => clearDb())

/**
 * Helper : crée un token agent ET son User AGENT lié, comme le ferait le
 * handler POST /admin/agent-tokens.
 */
async function createAgentTokenWithUser(scopes: string[], name = 'Test Agent') {
  const { token, plainSecret } = await createAgentTokenInDb(scopes)
  const agentUser = await User.create({
    email: `agent-${token._id.toString()}@venio.internal`,
    passwordHash: await bcrypt.hash('random', 10),
    name,
    role: 'AGENT',
    isActive: true,
    agentTokenId: token._id,
  })
  await AgentToken.updateOne({ _id: token._id }, { $set: { userId: agentUser._id } })
  return { token, plainSecret, agentUser }
}

async function createInternalHuman(role: 'SUPER_ADMIN' | 'ADMIN' = 'ADMIN', name = 'Human') {
  return User.create({
    email: `${name.toLowerCase()}@venio.test`,
    passwordHash: await bcrypt.hash('x', 10),
    name,
    role,
    isActive: true,
  })
}

describe('Agent × Messagerie interne', () => {
  it('placeholder pour structure — sera remplacé', () => {
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Vérifier que la suite tourne**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`

Expected: PASS (placeholder).

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "test(agent-messaging): squelette de la suite d'intégration"
```

---

### Task 18: GET /messaging/users

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Test failing**

Remplacer le `it('placeholder...')` par :
```ts
it('GET /messaging/users liste les users internes (humains + agents)', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging'])
  await createInternalHuman('ADMIN', 'Alice')
  await createInternalHuman('SUPER_ADMIN', 'Bob')

  const res = await request(app)
    .get('/api/v1/agent/messaging/users')
    .set('Authorization', `Bearer ${plainSecret}`)

  expect(res.status).toBe(200)
  expect(Array.isArray(res.body.users)).toBe(true)
  const names = res.body.users.map((u: { name: string }) => u.name)
  expect(names).toContain('Alice')
  expect(names).toContain('Bob')
  expect(names).toContain('Test Agent') // l'agent lui-même
})

it('GET /messaging/users sans scope read renvoie 403', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:crm']) // pas read:internal-messaging
  const res = await request(app)
    .get('/api/v1/agent/messaging/users')
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(res.status).toBe(403)
  expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
})
```

- [ ] **Step 2: Vérifier FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL — 404 sur les deux routes (handler pas encore défini).

- [ ] **Step 3: Implémenter dans messaging.ts**

Ajouter avant `export default router` :
```ts
// ── GET /users ─────────────────────────────────────────────────────────────

router.get('/users', requireScope('read:internal-messaging'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await User.find({
      role: { $in: ['SUPER_ADMIN', 'ADMIN', 'RH', 'VIEWER', 'AGENT'] },
      isActive: true,
    })
      .select('name email role')
      .sort({ name: 1 })
      .lean()
    res.json({ users })
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 2 it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): GET /messaging/users"
```

---

### Task 19: GET /messaging/conversations + POST /messaging/conversations + POST /messaging/direct

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Tests failing**

Ajouter dans le `describe(...)` :
```ts
it('GET /messaging/conversations retourne #general pour un nouveau token', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging'])

  const res = await request(app)
    .get('/api/v1/agent/messaging/conversations')
    .set('Authorization', `Bearer ${plainSecret}`)

  expect(res.status).toBe(200)
  expect(Array.isArray(res.body.conversations)).toBe(true)
  const slugs = res.body.conversations.map((c: { slug: string | null }) => c.slug)
  expect(slugs).toContain('general')
})

it('POST /messaging/conversations crée un channel privé et l\'agent est OWNER', async () => {
  const { plainSecret, agentUser } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Bob')

  const res = await request(app)
    .post('/api/v1/agent/messaging/conversations')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({
      type: 'CHANNEL',
      name: 'Agents Channel',
      visibility: 'PRIVATE',
      participantIds: [String(human._id)],
    })

  expect(res.status).toBe(201)
  expect(res.body.conversation.name).toBe('Agents Channel')

  const members = await InternalConversationMember.find({ conversation: res.body.conversation._id }).lean()
  expect(members).toHaveLength(2)
  const owner = members.find((m) => m.user.toString() === String(agentUser._id))
  expect(owner?.role).toBe('OWNER')
})

it('POST /messaging/direct crée un DM idempotent (memberKey)', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Carol')

  const r1 = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  expect(r1.status).toBe(201)
  const convId1 = r1.body.conversation._id

  const r2 = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  expect(r2.status).toBe(201)
  expect(r2.body.conversation._id).toBe(convId1)
})
```

- [ ] **Step 2: FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL (404 sur les 3 nouveaux endpoints).

- [ ] **Step 3: Implémenter**

Ajouter dans `messaging.ts` :
```ts
// ── GET /conversations ─────────────────────────────────────────────────────

router.get('/conversations', requireScope('read:internal-messaging'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadAgentUserPayload(req)
    const conversations = await listConversations(user)
    res.json({ conversations })
  } catch (err) {
    next(err)
  }
})

// ── POST /conversations ────────────────────────────────────────────────────

router.post(
  '/conversations',
  requireScope('write:internal-messaging'),
  body('type').isIn(['CHANNEL', 'DM', 'GROUP']).withMessage('type CHANNEL/DM/GROUP requis'),
  body('name').optional().isString().trim(),
  body('visibility').optional().isIn(['PUBLIC', 'PRIVATE']),
  body('participantIds').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const conversation = await createConversation(user, {
        type: req.body.type,
        name: req.body.name,
        visibility: req.body.visibility,
        participantIds: req.body.participantIds,
      })
      res.locals.audit = {
        entityType: 'InternalConversation',
        entityId: String(conversation._id),
        summary: `Création conversation ${conversation.type} "${conversation.name || conversation.slug || ''}"`,
        after: { type: conversation.type, name: conversation.name, slug: conversation.slug },
      }
      res.status(201).json({ conversation })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /direct ───────────────────────────────────────────────────────────

router.post(
  '/direct',
  requireScope('write:internal-messaging'),
  body('participantId').custom((v) => isValidObjectId(v)).withMessage('participantId (ObjectId) requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const conversation = await createConversation(user, {
        type: 'DM',
        participantIds: [String(req.body.participantId)],
      })
      res.locals.audit = {
        entityType: 'InternalConversation',
        entityId: String(conversation._id),
        summary: `DM agent → ${req.body.participantId}`,
        after: { type: 'DM' },
      }
      res.status(201).json({ conversation })
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 5 it (les 2 précédents + 3 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): GET/POST /conversations + POST /direct"
```

---

### Task 20: GET /messaging/conversations/:id/messages + POST envoi texte

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Tests failing**

Ajouter dans le describe :
```ts
it('Envoi puis lecture d\'un message texte dans une conv', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Dana')

  // 1. Créer un DM
  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  expect(dm.status).toBe(201)
  const convId = dm.body.conversation._id

  // 2. Envoyer un message
  const send = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${convId}/messages`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'Hello world' })
  expect(send.status).toBe(201)
  expect(send.body.message.content).toBe('Hello world')

  // 3. Lire les messages
  const list = await request(app)
    .get(`/api/v1/agent/messaging/conversations/${convId}/messages`)
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(list.status).toBe(200)
  expect(list.body.messages).toHaveLength(1)
  expect(list.body.messages[0].content).toBe('Hello world')
})

it('Channel privé non-membre → 404', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging'])
  const stranger = await createInternalHuman('ADMIN', 'Stranger')

  // Créer un channel privé sans l'agent
  const channel = await InternalConversation.create({
    type: 'CHANNEL',
    name: 'secret',
    slug: 'secret',
    visibility: 'PRIVATE',
    createdBy: stranger._id,
  })
  await InternalConversationMember.create({ conversation: channel._id, user: stranger._id, role: 'OWNER' })

  const res = await request(app)
    .get(`/api/v1/agent/messaging/conversations/${channel._id}/messages`)
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL (handlers manquants).

- [ ] **Step 3: Implémenter**

Ajouter dans `messaging.ts` :
```ts
// ── GET /conversations/:id/messages ────────────────────────────────────────

router.get(
  '/conversations/:conversationId/messages',
  requireScope('read:internal-messaging'),
  param('conversationId').isMongoId(),
  query('before').optional().isISO8601(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const messages = await listMessages(user, String(req.params.conversationId), {
        before: req.query.before ? String(req.query.before) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      })
      res.json({ messages })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /conversations/:id/messages ───────────────────────────────────────

router.post(
  '/conversations/:conversationId/messages',
  requireScope('write:internal-messaging'),
  param('conversationId').isMongoId(),
  body('content').isString().trim().isLength({ min: 1, max: 4000 }),
  body('parentMessage').optional({ nullable: true }).custom((v) => v === null || isValidObjectId(v)),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const message = await createMessage(user, String(req.params.conversationId), {
        content: req.body.content,
        parentMessage: req.body.parentMessage || null,
      })
      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(message._id),
        summary: `Message dans conv ${req.params.conversationId} (${String(req.body.content).slice(0, 60)}…)`,
        after: { id: String(message._id) },
      }
      res.status(201).json({ message })
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 7 it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): GET messages + POST message texte"
```

---

### Task 21: POST /conversations/:id/read + GET /search

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Tests**

```ts
it('POST /read remet le unreadCount à 0', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Eve')

  // Crée DM, envoie depuis l'humain (pour générer un unread côté agent)
  const dm = await InternalConversation.create({ type: 'DM', visibility: 'PRIVATE', memberKey: 'x', createdBy: human._id })
  await InternalConversationMember.create({ conversation: dm._id, user: human._id, role: 'OWNER' })

  // Trouver l'agent user et l'ajouter en membre du DM (sinon ACL bloque)
  const agentUser = await User.findOne({ role: 'AGENT' })
  await InternalConversationMember.create({ conversation: dm._id, user: agentUser!._id, role: 'MEMBER' })

  // Message de l'humain
  await InternalMessage.create({ conversation: dm._id, sender: human._id, content: 'Coucou agent', mentions: [] })

  // GET conversations : unread = 1
  const before = await request(app)
    .get('/api/v1/agent/messaging/conversations')
    .set('Authorization', `Bearer ${plainSecret}`)
  const dmBefore = before.body.conversations.find((c: { _id: string }) => c._id === String(dm._id))
  expect(dmBefore?.unreadCount).toBe(1)

  // POST /read
  const read = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm._id}/read`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({})
  expect(read.status).toBe(200)

  // GET conversations : unread = 0
  const after = await request(app)
    .get('/api/v1/agent/messaging/conversations')
    .set('Authorization', `Bearer ${plainSecret}`)
  const dmAfter = after.body.conversations.find((c: { _id: string }) => c._id === String(dm._id))
  expect(dmAfter?.unreadCount).toBe(0)
})

it('GET /search trouve un message par contenu', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Frank')

  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'mot-clef-trouvable' })

  const res = await request(app)
    .get('/api/v1/agent/messaging/search?q=mot-clef')
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(res.status).toBe(200)
  expect(res.body.results.length).toBeGreaterThan(0)
})
```

Imports à ajouter en haut du fichier test :
```ts
import InternalMessage from '../models/InternalMessage.js'
```

- [ ] **Step 2: FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
// ── POST /conversations/:id/read ───────────────────────────────────────────

router.post(
  '/conversations/:conversationId/read',
  requireScope('write:internal-messaging'),
  param('conversationId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      await markConversationRead(user, String(req.params.conversationId))
      res.locals.audit = {
        entityType: 'InternalConversation',
        entityId: String(req.params.conversationId),
        summary: `Marqué lu`,
      }
      res.json({ success: true })
    } catch (err) {
      next(err)
    }
  }
)

// ── GET /search ────────────────────────────────────────────────────────────

router.get(
  '/search',
  requireScope('read:internal-messaging'),
  query('q').isString().trim().isLength({ min: 2 }).withMessage('q (min 2 chars) requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const results = await searchMessages(user, String(req.query.q))
      res.json({ results })
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 9 it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): POST /read + GET /search"
```

---

### Task 22: PATCH / DELETE message + POST /reactions

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Tests**

```ts
it('PATCH message : agent peut éditer SES messages', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Gina')

  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  const send = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'Avant édition' })

  const patch = await request(app)
    .patch(`/api/v1/agent/messaging/messages/${send.body.message._id}`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'Après édition' })
  expect(patch.status).toBe(200)
  expect(patch.body.message.content).toBe('Après édition')
  expect(patch.body.message.editedAt).toBeTruthy()
})

it('PATCH message d\'un autre user → 404', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Hugo')

  // L'humain envoie un message dans un DM
  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  const humanMsg = await InternalMessage.create({
    conversation: dm.body.conversation._id,
    sender: human._id,
    content: 'message humain',
  })

  const patch = await request(app)
    .patch(`/api/v1/agent/messaging/messages/${humanMsg._id}`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'tentative' })
  expect(patch.status).toBe(404)
})

it('DELETE message : soft delete sur SON message', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Ida')

  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  const send = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'Sera supprimé' })

  const del = await request(app)
    .delete(`/api/v1/agent/messaging/messages/${send.body.message._id}`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
  expect(del.status).toBe(200)
  expect(del.body.message.deletedAt).toBeTruthy()
  expect(del.body.message.content).toBe('Message supprimé')
})

it('POST /messages/:id/reactions toggle on/off', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Jane')

  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })
  const send = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'react me' })

  const on = await request(app)
    .post(`/api/v1/agent/messaging/messages/${send.body.message._id}/reactions`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ emoji: '👍' })
  expect(on.status).toBe(200)
  expect(on.body.message.reactions).toHaveLength(1)

  const off = await request(app)
    .post(`/api/v1/agent/messaging/messages/${send.body.message._id}/reactions`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ emoji: '👍' })
  expect(off.status).toBe(200)
  expect(off.body.message.reactions).toHaveLength(0)
})
```

- [ ] **Step 2: FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
// ── PATCH /messages/:id ────────────────────────────────────────────────────

router.patch(
  '/messages/:messageId',
  requireScope('write:internal-messaging'),
  param('messageId').isMongoId(),
  body('content').isString().trim().isLength({ min: 1, max: 4000 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const message = await updateMessage(user, String(req.params.messageId), req.body.content)
      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(req.params.messageId),
        summary: `Édition message`,
        after: { editedAt: message.editedAt },
      }
      res.json({ message })
    } catch (err) {
      next(err)
    }
  }
)

// ── DELETE /messages/:id ───────────────────────────────────────────────────

router.delete(
  '/messages/:messageId',
  requireScope('write:internal-messaging'),
  param('messageId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const message = await softDeleteMessage(user, String(req.params.messageId))
      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(req.params.messageId),
        summary: `Suppression message`,
      }
      res.json({ message })
    } catch (err) {
      next(err)
    }
  }
)

// ── POST /messages/:id/reactions ───────────────────────────────────────────

router.post(
  '/messages/:messageId/reactions',
  requireScope('write:internal-messaging'),
  param('messageId').isMongoId(),
  body('emoji').isString().trim().isLength({ min: 1, max: 16 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const message = await toggleReaction(user, String(req.params.messageId), req.body.emoji)
      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(req.params.messageId),
        summary: `Toggle réaction ${req.body.emoji}`,
      }
      res.json({ message })
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 13 it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): PATCH/DELETE messages + reactions"
```

---

### Task 23: POST /messaging/conversations/:id/attachments (base64)

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Tests**

```ts
it('POST /attachments accepte un fichier base64 < 5 Mo', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Ken')
  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })

  const tinyPdfBase64 = Buffer.from('%PDF-1.4 tiny').toString('base64')

  const res = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/attachments`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({
      content: 'voici le doc',
      files: [{ filename: 'tiny.pdf', mimeType: 'application/pdf', contentBase64: tinyPdfBase64 }],
    })
  expect(res.status).toBe(201)
  expect(res.body.message.attachments).toHaveLength(1)
  expect(res.body.message.attachments[0].originalName).toBe('tiny.pdf')
  expect(res.body.message.attachments[0].mimeType).toBe('application/pdf')
})

it('POST /attachments refuse > 5 Mo avec 413', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Lily')
  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })

  const big = Buffer.alloc(6 * 1024 * 1024).toString('base64') // 6 Mo brut

  const res = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/attachments`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({
      content: 'gros',
      files: [{ filename: 'big.bin', mimeType: 'application/octet-stream', contentBase64: big }],
    })
  expect(res.status).toBe(413)
  expect(res.body.code).toBe('FILE_TOO_LARGE')
})

it('POST /attachments refuse > 5 fichiers', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Max')
  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })

  const tiny = Buffer.from('x').toString('base64')
  const files = Array.from({ length: 6 }, (_, i) => ({
    filename: `f${i}.txt`, mimeType: 'text/plain', contentBase64: tiny,
  }))

  const res = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/attachments`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'beaucoup', files })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
// ── POST /conversations/:id/attachments ────────────────────────────────────

router.post(
  '/conversations/:conversationId/attachments',
  requireScope('write:internal-messaging'),
  param('conversationId').isMongoId(),
  body('content').optional().isString().trim().isLength({ max: 4000 }),
  body('files').isArray({ min: 1, max: 5 }).withMessage('files : 1 à 5 fichiers'),
  body('files.*.filename').isString().trim().isLength({ min: 1, max: 200 }),
  body('files.*.mimeType').isString().trim().isLength({ min: 3, max: 100 }),
  body('files.*.contentBase64').isString().isLength({ min: 1 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const conversationId = String(req.params.conversationId)
      const files = req.body.files as Array<{ filename: string; mimeType: string; contentBase64: string }>

      const attachments: Array<{ originalName: string; storagePath: string; mimeType: string; size: number }> = []
      const relDir = path.join('uploads', 'agent', 'internal-messaging', conversationId)
      const absDir = path.resolve(process.cwd(), relDir)
      await fs.mkdir(absDir, { recursive: true })

      for (const file of files) {
        const buffer = Buffer.from(file.contentBase64, 'base64')
        if (buffer.length === 0) {
          return respondError(res, 400, 'INVALID_BASE64', `contentBase64 vide pour ${file.filename}`)
        }
        if (buffer.length > RAW_LIMIT_BYTES) {
          return respondError(
            res,
            413,
            'FILE_TOO_LARGE',
            `${file.filename} dépasse ${RAW_LIMIT_MB} Mo (reçu ${(buffer.length / 1024 / 1024).toFixed(2)} Mo)`
          )
        }
        const stored = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeFilename(file.filename)}`
        const relPath = path.join(relDir, stored)
        const absPath = path.resolve(process.cwd(), relPath)
        if (!absPath.startsWith(uploadsRoot())) {
          return respondError(res, 400, 'INVALID_PATH', 'Path traversal détecté')
        }
        await fs.writeFile(absPath, buffer)
        attachments.push({
          originalName: file.filename,
          storagePath: relPath,
          mimeType: file.mimeType,
          size: buffer.length,
        })
      }

      const message = await createMessage(user, conversationId, {
        content: String(req.body.content || 'Pièce jointe').trim() || 'Pièce jointe',
        attachments,
      })

      res.locals.audit = {
        entityType: 'InternalMessage',
        entityId: String(message._id),
        summary: `Message + ${attachments.length} attachment(s) dans conv ${conversationId}`,
        after: { attachments: attachments.map((a) => a.originalName) },
      }
      res.status(201).json({ message })
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 16 it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): POST /attachments (base64, cap 5 Mo, max 5 fichiers)"
```

---

### Task 24: GET /messaging/messages/:id/attachments/:idx/download

**Files:**
- Modify: `backend/src/routes/agent/messaging.ts`
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Test**

```ts
it('GET /attachments/:idx/download renvoie le fichier', async () => {
  const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
  const human = await createInternalHuman('ADMIN', 'Nina')
  const dm = await request(app)
    .post('/api/v1/agent/messaging/direct')
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ participantId: String(human._id) })

  const payload = Buffer.from('hello downloadable').toString('base64')
  const send = await request(app)
    .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/attachments`)
    .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ content: 'fichier', files: [{ filename: 'note.txt', mimeType: 'text/plain', contentBase64: payload }] })
  expect(send.status).toBe(201)
  const messageId = send.body.message._id

  const dl = await request(app)
    .get(`/api/v1/agent/messaging/messages/${messageId}/attachments/0/download`)
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(dl.status).toBe(200)
  expect(dl.headers['content-disposition']).toContain('note.txt')
  expect(dl.text).toBe('hello downloadable')
})
```

- [ ] **Step 2: FAIL**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

```ts
// ── GET /messages/:id/attachments/:idx/download ───────────────────────────

router.get(
  '/messages/:messageId/attachments/:index/download',
  requireScope('read:internal-messaging'),
  param('messageId').isMongoId(),
  param('index').isInt({ min: 0, max: 4 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const user = await loadAgentUserPayload(req)
      const message = await InternalMessage.findById(req.params.messageId)
      const index = Number(req.params.index)
      const attachment = message?.attachments[index]
      if (!message || !attachment) {
        return respondError(res, 404, 'NOT_FOUND', 'Fichier non trouvé')
      }
      // Vérifie l'ACL via le service (lancera 404 si non accessible)
      await listMessages(user, message.conversation.toString(), { limit: 1 })

      const safeRoot = path.resolve(process.cwd(), 'uploads', 'agent', 'internal-messaging')
      const safeRootLegacy = path.resolve(process.cwd(), 'uploads', 'internal-messaging') // côté admin
      const filePath = path.resolve(process.cwd(), attachment.storagePath)
      if (!filePath.startsWith(safeRoot) && !filePath.startsWith(safeRootLegacy)) {
        return respondError(res, 403, 'ACCESS_DENIED', 'Accès refusé')
      }
      res.setHeader('Content-Type', attachment.mimeType)
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName.replace(/"/g, '_')}"`)
      createReadStream(filePath).pipe(res)
    } catch (err) {
      next(err)
    }
  }
)
```

- [ ] **Step 4: PASS**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS pour les 17 it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/agent/messaging.ts backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "feat(agent-messaging): GET download attachment (path-traversal safe)"
```

---

### Task 25: Test : token sans userId → 500 AGENT_USER_MISSING

**Files:**
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Test**

```ts
it('Token sans userId (legacy / non backfillé) → 500 AGENT_USER_MISSING', async () => {
  // createAgentTokenInDb crée un token MAIS pas de User AGENT — pile le cas legacy.
  const { plainSecret } = await createAgentTokenInDb(['read:internal-messaging'])

  const res = await request(app)
    .get('/api/v1/agent/messaging/conversations')
    .set('Authorization', `Bearer ${plainSecret}`)

  expect(res.status).toBe(500)
  expect(res.body.code).toBe('AGENT_USER_MISSING')
})
```

- [ ] **Step 2: PASS (devrait être déjà OK avec l'impl de Task 15)**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "test(agent-messaging): token legacy non-backfillé → 500 explicite"
```

---

### Task 26: Test : révocation token désactive l'accès

**Files:**
- Modify: `backend/src/__tests__/agent-internal-messaging-integration.test.ts`

- [ ] **Step 1: Test**

```ts
it('Token révoqué → 401 INVALID_TOKEN', async () => {
  const { plainSecret, token } = await createAgentTokenWithUser(['read:internal-messaging'])

  // Pré-vérif : actuellement marche
  const ok = await request(app)
    .get('/api/v1/agent/messaging/conversations')
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(ok.status).toBe(200)

  // Révoque + désactive le user
  await AgentToken.updateOne({ _id: token._id }, { $set: { status: 'REVOKED' } })
  await User.updateOne({ agentTokenId: token._id }, { $set: { isActive: false } })

  const after = await request(app)
    .get('/api/v1/agent/messaging/conversations')
    .set('Authorization', `Bearer ${plainSecret}`)
  expect(after.status).toBe(401)
  expect(after.body.code).toBe('INVALID_TOKEN')
})
```

- [ ] **Step 2: PASS (déjà couvert par agentAuth qui filtre status=ACTIVE)**

Run: `cd backend && npx vitest run agent-internal-messaging-integration`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/__tests__/agent-internal-messaging-integration.test.ts
git commit -m "test(agent-messaging): token révoqué bloque l'accès"
```

---

## Phase 6 — Script de backfill

### Task 27: Script `backfill-agent-users.ts`

**Files:**
- Create: `backend/scripts/backfill-agent-users.ts`

- [ ] **Step 1: Écrire le script**

```ts
/**
 * Backfill : crée un User AGENT pour chaque AgentToken existant sans userId.
 * Idempotent — peut être relancé sans risque.
 *
 * Usage :
 *   npx tsx backend/scripts/backfill-agent-users.ts
 *
 * Sortie : journal en stdout, code de sortie 0 si OK.
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import AgentToken from '../src/models/AgentToken.js'
import User from '../src/models/User.js'

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('MONGO_URI manquant.')
    process.exit(1)
  }
  await mongoose.connect(mongoUri)
  console.log('Connecté à Mongo.')

  const tokens = await AgentToken.find({ $or: [{ userId: null }, { userId: { $exists: false } }] })
  console.log(`Tokens à traiter : ${tokens.length}`)

  let created = 0
  let skipped = 0

  for (const token of tokens) {
    // Cas 1 : un User AGENT existe déjà pour ce token (run précédent partiel)
    const existing = await User.findOne({ agentTokenId: token._id })
    if (existing) {
      await AgentToken.updateOne({ _id: token._id }, { $set: { userId: existing._id } })
      console.log(`  ↺ ${token.name} : User déjà créé, lien remis (${existing._id}).`)
      skipped++
      continue
    }

    // Cas 2 : nouvelle création
    const email = `agent-${token._id.toString()}@venio.internal`
    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
      name: token.status === 'REVOKED' ? `[Révoqué] ${token.name}` : token.name,
      role: 'AGENT',
      isActive: token.status === 'ACTIVE',
      agentTokenId: token._id,
    })
    await AgentToken.updateOne({ _id: token._id }, { $set: { userId: user._id } })
    console.log(`  + ${token.name} → User ${user._id}`)
    created++
  }

  console.log(`\nTerminé. Créés : ${created}, déjà liés : ${skipped}.`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Erreur backfill :', err)
  process.exit(1)
})
```

- [ ] **Step 2: Compiler**

Run: `cd backend && npx tsc --noEmit`
Expected: Pas d'erreur.

- [ ] **Step 3: Test à blanc en dev**

Run: `cd backend && npx tsx scripts/backfill-agent-users.ts`

(Si tu n'as pas de tokens dev sans userId, le script log "Tokens à traiter : 0" et termine.)

Expected: code de sortie 0.

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/backfill-agent-users.ts
git commit -m "feat(scripts): backfill-agent-users pour tokens pré-existants"
```

---

## Phase 7 — OpenAPI + finalisation

### Task 28: Vérifier le test OpenAPI sync

**Files:**
- Possibly modify: `backend/src/lib/agent/openapi.ts`

- [ ] **Step 1: Lancer le test sync**

Run: `cd backend && npx vitest run agent-openapi-sync`

Expected: Si l'extraction est purement dynamique → PASS. Si l'OpenAPI a un mapping statique modules → routes (à vérifier dans `openapi.ts`), le test peut signaler les nouvelles routes non documentées. Suivre l'erreur.

- [ ] **Step 2: Si FAIL, ajouter les routes au mapping**

Ouvrir `backend/src/lib/agent/openapi.ts`. Chercher un objet `MODULE_DESCRIPTIONS`, `MODULE_TAGS`, ou similaire qui mappe les paths agent vers des tags / descriptions. Ajouter une entrée pour `/messaging/...` avec le tag `Internal Messaging`.

Code exemple à adapter selon ce que tu trouves :
```ts
{ pathPrefix: '/messaging', tag: 'Internal Messaging', description: 'Messagerie interne (DM, channels, groupes) — InternalConversation/InternalMessage.' }
```

- [ ] **Step 3: Re-run et PASS**

Run: `cd backend && npx vitest run agent-openapi-sync`
Expected: PASS.

- [ ] **Step 4: Commit (si modif)**

```bash
git add backend/src/lib/agent/openapi.ts
git commit -m "docs(openapi): ajoute le module messagerie interne agent"
```

---

### Task 29: Suite de tests complète + lint

- [ ] **Step 1: Lancer toute la suite agent**

Run: `cd backend && npx vitest run agent-`

Expected: Tous les `agent-*-integration.test.ts` passent, plus les nouveaux.

- [ ] **Step 2: Lancer le lint si configuré**

Run: `cd backend && npm run lint 2>/dev/null || npx eslint src/routes/agent/messaging.ts src/routes/admin/agentTokens.ts src/routes/agent/_middleware/asUser.ts`

Expected: 0 erreur. Corriger les warnings si non triviaux.

- [ ] **Step 3: Build TypeScript final**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Commit si correctifs**

```bash
git commit -am "chore(agent-messaging): lint + types"
```

---

### Task 30: Documentation API publique

**Files:**
- Modify: `backend/docs/api-agent.md` (si présent)

- [ ] **Step 1: Vérifier la doc**

Run: `ls backend/docs/ 2>/dev/null || find . -name "api-agent.md" -not -path "*/node_modules/*" 2>/dev/null`

- [ ] **Step 2: Ajouter une section "Internal Messaging" si la doc existe**

Suivre la structure existante. Documenter chaque endpoint avec :
- méthode + path
- scope requis
- body / query attendu
- exemple de réponse
- codes d'erreur spécifiques (`AGENT_USER_MISSING`, `FILE_TOO_LARGE`, etc.)

Si pas de doc statique, la spec OpenAPI dynamique (`/api/v1/agent/openapi.json`) suffit.

- [ ] **Step 3: Commit (si modif)**

```bash
git add backend/docs/
git commit -m "docs(api): documente les endpoints messagerie interne agent"
```

---

## Self-review

Done after writing the plan — checked inline.

**Spec coverage :**
- ✅ §3.1 Modèles : Tasks 1, 2, 3
- ✅ §3.1 isInternalRole + assertInternalUser : Tasks 4, 5
- ✅ §4.1 Création (création User, lien, #general, atomicité) : Tasks 7, 8
- ✅ §4.2 Renommage : Task 9
- ✅ §4.3 Révocation : Task 10
- ✅ §4.4 Backfill : Task 27
- ✅ §5 Helper loadAgentUserPayload : Tasks 14, 15
- ✅ §6.1-6.3 Routes + montage + délégation : Tasks 16-22
- ✅ §6.4 Attachments base64 : Task 23
- ✅ §6.5 Download : Task 24
- ✅ §6.6 Erreurs : couvert dans chaque task de route + Tasks 25, 26
- ✅ §7.1 Scopes : Task 6
- ✅ §7.2 GET /users élargi : Task 11
- ✅ §7.3 Durcissement SUPER_ADMIN : Tasks 12, 13
- ✅ §7.4 OpenAPI : Task 28
- ✅ §7.5 Audit : intégré à chaque mutation via `res.locals.audit`
- ✅ §8 Tests : intégrés à chaque task (TDD)
- ✅ §9 Déploiement : Tasks 27 + 30

**Placeholder scan :** Aucun TBD/TODO. Tous les blocs de code sont complets.

**Type consistency :** `loadAgentUserPayload` retourne `JwtPayload` partout, `requireScope('write:internal-messaging')` est cohérent entre routes et tests.

---

## Execution Handoff

Plan complet et sauvegardé. Pour l'exécution, deux options :

1. **Subagent-Driven (recommandé)** — Un subagent frais par task, review entre tasks, itération rapide.
2. **Inline Execution** — Exécution dans cette session avec checkpoints à intervalles.

Lequel choisis-tu ?
