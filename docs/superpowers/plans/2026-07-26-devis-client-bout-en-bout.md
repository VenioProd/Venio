# Devis client de bout en bout — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un client connecté de recevoir une proposition commerciale, répondre aux questions de cadrage, arbitrer les lignes optionnelles, signer en ligne, puis télécharger son devis et ses factures depuis l'espace client.

**Architecture:** Un nouveau modèle `QuoteProposal` porte toute la négociation (questions, réponses, lignes obligatoires et optionnelles, cahier des charges, signature). Il ne devient une pièce comptable qu'à la signature, où il produit un `BillingDocument` de type `QUOTE` via la mécanique existante. `BillingDocument`, `pdfBilling` et le module comptable ne sont jamais modifiés — le lot n'y ajoute que des lectures scopées côté client.

**Tech Stack:** TypeScript, Express 5, Mongoose, Vitest + supertest + mongodb-memory-server côté backend. React 18, react-router-dom 7, Vitest + Testing Library côté frontend.

**Spec:** [`docs/superpowers/specs/2026-07-26-devis-client-bout-en-bout-design.md`](../specs/2026-07-26-devis-client-bout-en-bout-design.md)

## Global Constraints

- **Le client ne transmet jamais de montant.** Toute route acceptant une entrée client recalcule les totaux côté serveur. Un `total`, `subtotal` ou `unitPrice` présent dans un corps de requête client est ignoré, jamais persisté.
- **`DRAFT` et `CANCELLED` ne sont jamais exposés au client**, ni en liste ni en détail — répondre 404, pas 403, pour ne pas révéler leur existence.
- **`SIGNED` est immuable.** Aucune route, admin comprise, n'accepte de mutation d'une proposition signée.
- **Seul le propriétaire du projet arbitre et signe.** `getProjectAccess(...).role === 'OWNER'`. Un collaborateur `EDITOR` ou `VIEWER` peut consulter uniquement.
- Tous les messages d'erreur destinés à l'utilisateur sont en **français**, avec les accents.
- Les commentaires de code suivent la densité du fichier environnant : rares, et uniquement pour expliquer un *pourquoi* non évident.
- Montants en euros décimaux, arrondis au centime (`Math.round(x * 100) / 100`) à chaque étape de calcul.
- Les tests backend tournent depuis `backend/` : `npx vitest run src/__tests__/<fichier>`.
- Les tests frontend tournent depuis la racine : `npx vitest run src/<chemin>`.

---

## File Structure

**Backend — créés**

| Fichier | Responsabilité |
|---|---|
| `backend/src/types/models/quote.ts` | Types `IQuoteQuestion`, `IQuoteAnswer`, `IQuoteLine`, `IQuoteSignature`, `IQuoteProposal` |
| `backend/src/models/QuoteProposal.ts` | Schéma Mongoose et index |
| `backend/src/lib/quoteTotals.ts` | Calcul pur des totaux et validation d'une sélection |
| `backend/src/lib/quoteSpecification.ts` | Génération markdown du cahier des charges |
| `backend/src/lib/quoteSignature.ts` | Verrou de signature, production du `BillingDocument`, empreinte du PDF |
| `backend/src/routes/client/quotes.ts` | Routes client : propositions + vitrine facturation |
| `backend/src/routes/admin/quoteProposals.ts` | Routes admin : CRUD, envoi, annulation, reprise |
| `backend/src/__tests__/quote-totals.test.ts` | Tests unitaires du calcul |
| `backend/src/__tests__/quote-proposal-client.test.ts` | Tests d'intégration des routes client |
| `backend/src/__tests__/quote-proposal-signature.test.ts` | Tests de la signature et de la reprise |
| `backend/src/__tests__/quote-proposal-admin.test.ts` | Tests des routes admin |

**Backend — modifiés**

| Fichier | Modification |
|---|---|
| `backend/src/types/models/index.ts` | Ré-export des types de `quote.ts` |
| `backend/src/index.ts` | Montage des deux routeurs + limiteur de signature |

**Frontend — créés**

| Fichier | Responsabilité |
|---|---|
| `src/types/quote.types.ts` | Types partagés du portail |
| `src/services/quotes.ts` | Appels API client |
| `src/pages/espace-client/Billing.tsx` | Vitrine devis et factures |
| `src/pages/espace-client/QuoteProposal.tsx` | Wizard en quatre étapes |
| `src/pages/espace-client/QuoteProposal.test.tsx` | Tests du wizard |

**Frontend — modifiés**

| Fichier | Modification |
|---|---|
| `src/App.tsx` | Routes `/espace-client/facturation` et `/espace-client/propositions/:id` |
| `src/pages/espace-client/Dashboard.tsx` | Encart « Propositions à valider » |

Les tâches 1 à 9 forment la moitié backend et sont livrables indépendamment ; les tâches 10 à 12 s'appuient dessus.

---

### Task 1: Modèle `QuoteProposal`

**Files:**
- Create: `backend/src/types/models/quote.ts`
- Create: `backend/src/models/QuoteProposal.ts`
- Modify: `backend/src/types/models/index.ts`
- Test: `backend/src/__tests__/quote-proposal-model.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: le modèle par défaut de `models/QuoteProposal.js`, et les types `IQuoteProposal`, `IQuoteLine`, `IQuoteQuestion`, `IQuoteAnswer`, `IQuoteSignature` exportés depuis `types/models/index.js`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/quote-proposal-model.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import QuoteProposal from '../models/QuoteProposal.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('modèle QuoteProposal', () => {
  it('crée une proposition en DRAFT avec des lignes obligatoires et optionnelles', async () => {
    const proposal = await QuoteProposal.create({
      project: new mongoose.Types.ObjectId(),
      client: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
      title: 'Refonte du site',
      lines: [
        { description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false, order: 0 },
        { description: 'Rédaction', quantity: 1, unitPrice: 600, taxRate: 20, isOptional: true, order: 1 },
      ],
      questions: [{ type: 'text', label: 'Quel est votre délai ?', required: true, order: 0 }],
    })

    expect(proposal.status).toBe('DRAFT')
    expect(proposal.billingDocument).toBeNull()
    expect(proposal.lines[0]!.isOptional).toBe(false)
    expect(proposal.lines[1]!._id).toBeDefined()
    expect(proposal.specification.isManual).toBe(false)
  })

  it('refuse un statut hors énumération', async () => {
    await expect(
      QuoteProposal.create({
        project: new mongoose.Types.ObjectId(),
        client: new mongoose.Types.ObjectId(),
        createdBy: new mongoose.Types.ObjectId(),
        title: 'Invalide',
        status: 'PENDING',
      }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-model.test.ts`
Attendu : ÉCHEC — `Cannot find module '../models/QuoteProposal.js'`.

- [ ] **Step 3: Écrire les types**

Créer `backend/src/types/models/quote.ts` :

```ts
import type { Document, Types } from 'mongoose'

export type QuoteProposalStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED'
export type QuoteQuestionType = 'text' | 'longtext' | 'choice' | 'multichoice' | 'boolean' | 'number'

export interface IQuoteQuestion {
  _id: Types.ObjectId
  type: QuoteQuestionType
  label: string
  help: string
  options: string[]
  required: boolean
  order: number
}

export interface IQuoteAnswer {
  question: Types.ObjectId
  value: string
}

export interface IQuoteLine {
  _id: Types.ObjectId
  description: string
  detail: string
  quantity: number
  unitPrice: number
  taxRate: number
  isOptional: boolean
  isSelectedByDefault: boolean
  group: string
  order: number
}

export interface IQuoteSignature {
  signedAt: Date | null
  signerUserId: Types.ObjectId | null
  signerName: string
  signerEmail: string
  ip: string
  userAgent: string
  consentText: string
  documentHash: string
  proofVersion: number
}

export interface IQuoteSpecification {
  content: string
  isManual: boolean
  updatedAt: Date | null
}

export interface IQuoteProposal extends Document {
  _id: Types.ObjectId
  project: Types.ObjectId
  client: Types.ObjectId
  createdBy: Types.ObjectId
  title: string
  intro: string
  status: QuoteProposalStatus
  expiresAt: Date | null
  questions: Types.DocumentArray<IQuoteQuestion>
  answers: Types.DocumentArray<IQuoteAnswer>
  lines: Types.DocumentArray<IQuoteLine>
  selectedOptionalLineIds: Types.ObjectId[]
  specification: IQuoteSpecification
  signature: IQuoteSignature
  billingDocument: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 4: Écrire le modèle**

Créer `backend/src/models/QuoteProposal.ts` :

```ts
import mongoose from 'mongoose'
import type { IQuoteProposal } from '../types/models/index.js'

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['text', 'longtext', 'choice', 'multichoice', 'boolean', 'number'],
      required: true,
    },
    label: { type: String, required: true, trim: true },
    help: { type: String, default: '' },
    options: { type: [String], default: [] },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { _id: true },
)

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, required: true },
    value: { type: String, default: '' },
  },
  { _id: false },
)

const lineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    detail: { type: String, default: '' },
    quantity: { type: Number, required: true, default: 1, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
    isOptional: { type: Boolean, default: false },
    isSelectedByDefault: { type: Boolean, default: false },
    group: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: true },
)

const signatureSchema = new mongoose.Schema(
  {
    signedAt: { type: Date, default: null },
    signerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    signerName: { type: String, default: '' },
    signerEmail: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    consentText: { type: String, default: '' },
    documentHash: { type: String, default: '' },
    proofVersion: { type: Number, default: 1 },
  },
  { _id: false },
)

const quoteProposalSchema = new mongoose.Schema<IQuoteProposal>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    intro: { type: String, default: '' },
    status: {
      type: String,
      enum: ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED'],
      default: 'DRAFT',
    },
    expiresAt: { type: Date, default: null },
    questions: { type: [questionSchema], default: [] },
    answers: { type: [answerSchema], default: [] },
    lines: { type: [lineSchema], default: [] },
    selectedOptionalLineIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    specification: {
      content: { type: String, default: '' },
      isManual: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null },
    },
    signature: { type: signatureSchema, default: () => ({}) },
    billingDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingDocument', default: null },
  },
  { timestamps: true },
)

quoteProposalSchema.index({ project: 1, status: 1 })
quoteProposalSchema.index({ client: 1, status: 1 })

export default mongoose.model<IQuoteProposal>('QuoteProposal', quoteProposalSchema)
```

- [ ] **Step 5: Ré-exporter les types**

Dans `backend/src/types/models/index.ts`, ajouter après la ligne exportant les types de facturation :

```ts
export type {
  QuoteProposalStatus,
  QuoteQuestionType,
  IQuoteQuestion,
  IQuoteAnswer,
  IQuoteLine,
  IQuoteSignature,
  IQuoteSpecification,
  IQuoteProposal,
} from './quote.js'
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-model.test.ts`
Attendu : SUCCÈS, 2 tests.

- [ ] **Step 7: Vérifier le typage**

Depuis la racine : `npm --prefix backend run typecheck`
Attendu : aucune sortie d'erreur.

- [ ] **Step 8: Commit**

```bash
git add backend/src/types/models/quote.ts backend/src/models/QuoteProposal.ts backend/src/types/models/index.ts backend/src/__tests__/quote-proposal-model.test.ts
git commit -m "feat(devis): modele QuoteProposal"
```

---

### Task 2: Calcul des totaux côté serveur

**Files:**
- Create: `backend/src/lib/quoteTotals.ts`
- Test: `backend/src/__tests__/quote-totals.test.ts`

**Interfaces:**
- Consumes: `IQuoteLine` de la tâche 1.
- Produces:
  - `resolveSelectedLines(lines, selectedIds): IQuoteLine[]`
  - `computeQuoteTotals(lines, selectedIds): { subtotal: number; taxTotal: number; total: number; lines: IQuoteLine[] }`
  - `validateSelection(lines, selectedIds): { valid: true } | { valid: false; invalidIds: string[] }`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/quote-totals.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { computeQuoteTotals, validateSelection } from '../lib/quoteTotals.js'

const id = () => new mongoose.Types.ObjectId()
const mandatoryId = id()
const optionalAId = id()
const optionalBId = id()

const lines = [
  { _id: mandatoryId, description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false },
  { _id: optionalAId, description: 'Rédaction', quantity: 2, unitPrice: 300, taxRate: 20, isOptional: true },
  { _id: optionalBId, description: 'Photos', quantity: 1, unitPrice: 450, taxRate: 10, isOptional: true },
] as never[]

describe('computeQuoteTotals', () => {
  it('ne compte que les lignes obligatoires quand rien n’est retenu', () => {
    const totals = computeQuoteTotals(lines, [])
    expect(totals.subtotal).toBe(2000)
    expect(totals.taxTotal).toBe(400)
    expect(totals.total).toBe(2400)
    expect(totals.lines).toHaveLength(1)
  })

  it('ajoute les optionnelles retenues, avec leur propre taux de TVA', () => {
    const totals = computeQuoteTotals(lines, [optionalAId, optionalBId])
    expect(totals.subtotal).toBe(3050)
    expect(totals.taxTotal).toBe(565)
    expect(totals.total).toBe(3615)
    expect(totals.lines).toHaveLength(3)
  })

  it('arrondit au centime sans dériver', () => {
    const centimes = [
      { _id: id(), description: 'Tiers', quantity: 3, unitPrice: 33.333, taxRate: 20, isOptional: false },
    ] as never[]
    const totals = computeQuoteTotals(centimes, [])
    expect(totals.subtotal).toBe(100)
    expect(totals.taxTotal).toBe(20)
    expect(totals.total).toBe(120)
  })
})

describe('validateSelection', () => {
  it('accepte une sélection ne portant que sur des optionnelles', () => {
    expect(validateSelection(lines, [optionalAId])).toEqual({ valid: true })
  })

  it('rejette un identifiant inconnu', () => {
    const unknown = id()
    expect(validateSelection(lines, [unknown])).toEqual({ valid: false, invalidIds: [String(unknown)] })
  })

  it('rejette la sélection d’une ligne obligatoire', () => {
    expect(validateSelection(lines, [mandatoryId])).toEqual({ valid: false, invalidIds: [String(mandatoryId)] })
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis `backend/` : `npx vitest run src/__tests__/quote-totals.test.ts`
Attendu : ÉCHEC — `Cannot find module '../lib/quoteTotals.js'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `backend/src/lib/quoteTotals.ts` :

```ts
import type { Types } from 'mongoose'
import type { IQuoteLine } from '../types/models/index.js'

export interface QuoteTotals {
  subtotal: number
  taxTotal: number
  total: number
  lines: IQuoteLine[]
}

type LineId = Types.ObjectId | string

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Les lignes obligatoires sont toujours retenues. Les optionnelles ne le sont
 * que si le client les a explicitement cochées : une sélection vide est une
 * intention, pas une absence de réponse.
 */
export function resolveSelectedLines(lines: IQuoteLine[], selectedIds: LineId[]): IQuoteLine[] {
  const selected = new Set(selectedIds.map(String))
  return lines.filter((line) => !line.isOptional || selected.has(String(line._id)))
}

export function computeQuoteTotals(lines: IQuoteLine[], selectedIds: LineId[]): QuoteTotals {
  const retained = resolveSelectedLines(lines, selectedIds)

  let subtotal = 0
  let taxTotal = 0
  for (const line of retained) {
    const lineSubtotal = roundCents(line.quantity * line.unitPrice)
    subtotal = roundCents(subtotal + lineSubtotal)
    taxTotal = roundCents(taxTotal + roundCents((lineSubtotal * line.taxRate) / 100))
  }

  return { subtotal, taxTotal, total: roundCents(subtotal + taxTotal), lines: retained }
}

export function validateSelection(
  lines: IQuoteLine[],
  selectedIds: LineId[],
): { valid: true } | { valid: false; invalidIds: string[] } {
  const optional = new Set(lines.filter((line) => line.isOptional).map((line) => String(line._id)))
  const invalidIds = selectedIds.map(String).filter((id) => !optional.has(id))
  return invalidIds.length === 0 ? { valid: true } : { valid: false, invalidIds }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Depuis `backend/` : `npx vitest run src/__tests__/quote-totals.test.ts`
Attendu : SUCCÈS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/quoteTotals.ts backend/src/__tests__/quote-totals.test.ts
git commit -m "feat(devis): calcul serveur des totaux et validation de selection"
```

---

### Task 3: Génération du cahier des charges

**Files:**
- Create: `backend/src/lib/quoteSpecification.ts`
- Test: `backend/src/__tests__/quote-specification.test.ts`

**Interfaces:**
- Consumes: `IQuoteQuestion`, `IQuoteAnswer`, `IQuoteLine` de la tâche 1 ; `resolveSelectedLines` de la tâche 2.
- Produces: `buildSpecificationMarkdown(input): string` où `input` est `{ title, questions, answers, lines, selectedOptionalLineIds }`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/quote-specification.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { buildSpecificationMarkdown } from '../lib/quoteSpecification.js'

const questionId = new mongoose.Types.ObjectId()
const optionalId = new mongoose.Types.ObjectId()

describe('buildSpecificationMarkdown', () => {
  it('restitue les réponses puis le périmètre retenu', () => {
    const markdown = buildSpecificationMarkdown({
      title: 'Refonte du site',
      questions: [{ _id: questionId, label: 'Quel est votre délai ?', order: 0 }],
      answers: [{ question: questionId, value: 'Trois mois' }],
      lines: [
        { _id: new mongoose.Types.ObjectId(), description: 'Conception', isOptional: false, order: 0 },
        { _id: optionalId, description: 'Rédaction', isOptional: true, order: 1 },
      ],
      selectedOptionalLineIds: [optionalId],
    } as never)

    expect(markdown).toContain('# Cahier des charges — Refonte du site')
    expect(markdown).toContain('## Quel est votre délai ?')
    expect(markdown).toContain('Trois mois')
    expect(markdown).toContain('- Conception')
    expect(markdown).toContain('- Rédaction')
  })

  it('signale explicitement une question restée sans réponse', () => {
    const markdown = buildSpecificationMarkdown({
      title: 'Site vitrine',
      questions: [{ _id: questionId, label: 'Budget ?', order: 0 }],
      answers: [],
      lines: [],
      selectedOptionalLineIds: [],
    } as never)

    expect(markdown).toContain('_Sans réponse_')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis `backend/` : `npx vitest run src/__tests__/quote-specification.test.ts`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3: Écrire l'implémentation**

Créer `backend/src/lib/quoteSpecification.ts` :

```ts
import type { Types } from 'mongoose'
import type { IQuoteAnswer, IQuoteLine, IQuoteQuestion } from '../types/models/index.js'
import { resolveSelectedLines } from './quoteTotals.js'

export interface SpecificationInput {
  title: string
  questions: IQuoteQuestion[]
  answers: IQuoteAnswer[]
  lines: IQuoteLine[]
  selectedOptionalLineIds: (Types.ObjectId | string)[]
}

export function buildSpecificationMarkdown(input: SpecificationInput): string {
  const answerByQuestion = new Map(input.answers.map((answer) => [String(answer.question), answer.value]))
  const sections = [...input.questions]
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const value = answerByQuestion.get(String(question._id))?.trim()
      return `## ${question.label}\n\n${value || '_Sans réponse_'}`
    })

  const retained = resolveSelectedLines(input.lines, input.selectedOptionalLineIds)
    .sort((a, b) => a.order - b.order)
    .map((line) => `- ${line.description}`)

  const perimeter = retained.length > 0 ? retained.join('\n') : '_Aucune prestation retenue_'

  return [`# Cahier des charges — ${input.title}`, ...sections, '## Périmètre retenu', perimeter].join('\n\n') + '\n'
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Depuis `backend/` : `npx vitest run src/__tests__/quote-specification.test.ts`
Attendu : SUCCÈS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/quoteSpecification.ts backend/src/__tests__/quote-specification.test.ts
git commit -m "feat(devis): generation markdown du cahier des charges"
```

---

### Task 4: Routes client de lecture

**Files:**
- Create: `backend/src/routes/client/quotes.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/quote-proposal-client.test.ts`

**Interfaces:**
- Consumes: `QuoteProposal` (tâche 1), `computeQuoteTotals` (tâche 2), `getProjectAccess` de `lib/projectAccess.js`.
- Produces: le routeur par défaut de `routes/client/quotes.js`, monté sur `/api/projects`. Les réponses `GET` exposent `{ proposal, totals }` où `totals` a la forme `{ subtotal, taxTotal, total }`.

Le routeur expose une fonction interne `loadProposalForClient(req, res)` réutilisée par les tâches 5, 6 et 8 ; elle résout l'accès projet, charge la proposition, applique l'expiration paresseuse, et masque `DRAFT`/`CANCELLED`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/quote-proposal-client.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientQuoteRoutes from '../routes/client/quotes.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import QuoteProposal from '../models/QuoteProposal.js'

let app: Express
let ownerId: string
let viewerId: string
let outsiderId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createProposal(overrides: Record<string, unknown> = {}) {
  return QuoteProposal.create({
    project: projectId,
    client: ownerId,
    createdBy: ownerId,
    title: 'Refonte',
    status: 'SENT',
    lines: [
      { description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false, order: 0 },
      { description: 'Rédaction', quantity: 1, unitPrice: 600, taxRate: 20, isOptional: true, order: 1 },
    ],
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, viewer, outsider] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Outsider', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
  ])
  ownerId = String(owner._id)
  viewerId = String(viewer._id)
  outsiderId = String(outsider._id)
  const project = await Project.create({ name: 'Site', client: owner._id })
  projectId = String(project._id)
  await ProjectMember.create({ project: project._id, user: viewer._id, role: 'VIEWER', createdBy: owner._id })
})

describe('lecture des propositions côté client', () => {
  it('liste les propositions envoyées avec leurs totaux serveur', async () => {
    await createProposal()
    const response = await request(app)
      .get(`/api/projects/${projectId}/proposals`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.proposals).toHaveLength(1)
    expect(response.body.proposals[0].totals).toEqual({ subtotal: 2000, taxTotal: 400, total: 2400 })
  })

  it('masque un DRAFT et un CANCELLED', async () => {
    const draft = await createProposal({ status: 'DRAFT' })
    await createProposal({ status: 'CANCELLED' })

    const list = await request(app)
      .get(`/api/projects/${projectId}/proposals`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(list.body.proposals).toHaveLength(0)

    await request(app)
      .get(`/api/projects/${projectId}/proposals/${draft._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(404)
  })

  it('autorise un collaborateur invité à consulter', async () => {
    const proposal = await createProposal()
    await request(app)
      .get(`/api/projects/${projectId}/proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(200)
  })

  it('refuse un client étranger au projet', async () => {
    const proposal = await createProposal()
    await request(app)
      .get(`/api/projects/${projectId}/proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  it('bascule en EXPIRED une proposition dont la date de validité est dépassée', async () => {
    const proposal = await createProposal({ expiresAt: new Date(Date.now() - 1000) })
    const response = await request(app)
      .get(`/api/projects/${projectId}/proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.proposal.status).toBe('EXPIRED')
    expect((await QuoteProposal.findById(proposal._id))!.status).toBe('EXPIRED')
  })

  it('exige une session', async () => {
    await request(app).get(`/api/projects/${projectId}/proposals`).expect(401)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-client.test.ts`
Attendu : ÉCHEC — `Cannot find module '../routes/client/quotes.js'`.

- [ ] **Step 3: Écrire le routeur**

Créer `backend/src/routes/client/quotes.ts` :

```ts
import express, { type NextFunction, type Request, type Response } from 'express'
import { param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import AuditLog from '../../models/AuditLog.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { getProjectAccess } from '../../lib/projectAccess.js'
import { computeQuoteTotals } from '../../lib/quoteTotals.js'
import type { IQuoteProposal } from '../../types/models/index.js'

const router = express.Router()

router.use(auth)

const CLIENT_VISIBLE_STATUSES = ['SENT', 'SIGNED', 'EXPIRED']

export function validationFailed(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (errors.isEmpty()) return false
  res.status(400).json({ error: errors.array()[0]?.msg ?? 'Requête invalide' })
  return true
}

function totalsOf(proposal: IQuoteProposal) {
  const { subtotal, taxTotal, total } = computeQuoteTotals(
    proposal.lines.toObject(),
    proposal.selectedOptionalLineIds,
  )
  return { subtotal, taxTotal, total }
}

/**
 * Une offre dont la validité est dépassée bascule à la lecture plutôt que via
 * une tâche planifiée : l'état reste juste sans dépendre d'un ordonnanceur.
 */
async function applyExpiry(proposal: IQuoteProposal): Promise<IQuoteProposal> {
  if (proposal.status !== 'SENT') return proposal
  if (!proposal.expiresAt || proposal.expiresAt.getTime() > Date.now()) return proposal
  proposal.status = 'EXPIRED'
  await proposal.save()
  AuditLog.create({ action: 'QUOTE_PROPOSAL_EXPIRED', metadata: { proposalId: String(proposal._id) } }).catch(() => {})
  return proposal
}

export async function loadProposalForClient(req: Request, res: Response) {
  if (req.user!.role !== 'CLIENT') {
    res.status(403).json({ error: 'Forbidden' })
    return null
  }
  const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
  if (!access) {
    res.status(404).json({ error: 'Projet non trouvé' })
    return null
  }
  const proposal = await QuoteProposal.findOne({ _id: req.params.id, project: access.project._id })
  // 404 plutôt que 403 : un brouillon ne doit pas révéler son existence.
  if (!proposal || !CLIENT_VISIBLE_STATUSES.includes(proposal.status)) {
    res.status(404).json({ error: 'Proposition non trouvée' })
    return null
  }
  return { access, proposal: await applyExpiry(proposal) }
}

router.get('/:projectId/proposals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
    if (!access) return res.status(404).json({ error: 'Projet non trouvé' })

    const found = await QuoteProposal.find({
      project: access.project._id,
      status: { $in: CLIENT_VISIBLE_STATUSES },
    }).sort({ createdAt: -1 })

    const proposals = []
    for (const proposal of found) {
      const fresh = await applyExpiry(proposal)
      proposals.push({ ...fresh.toObject(), totals: totalsOf(fresh) })
    }
    return res.json({ proposals })
  } catch (err) {
    return next(err)
  }
})

router.get(
  '/:projectId/proposals/:id',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadProposalForClient(req, res)
      if (!loaded) return

      AuditLog.create({
        userId: req.user!.id,
        email: req.user!.email,
        action: 'QUOTE_PROPOSAL_VIEWED',
        ip: req.headers['x-forwarded-for'] || req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        metadata: { proposalId: String(loaded.proposal._id) },
      }).catch(() => {})

      return res.json({ proposal: loaded.proposal.toObject(), totals: totalsOf(loaded.proposal) })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
```

- [ ] **Step 4: Étendre l'énumération d'`AuditLog`**

`backend/src/models/AuditLog.ts` contraint `action` par une énumération. Sans cette étape, les
écritures de journal échoueraient en silence — elles sont volontairement en `.catch(() => {})`
pour ne jamais bloquer une requête utilisateur.

Ajouter les trois valeurs à la fin de l'énumération `action` :

```ts
        'QUOTE_PROPOSAL_VIEWED',
        'QUOTE_PROPOSAL_SIGNED',
        'QUOTE_PROPOSAL_EXPIRED',
```

Vérifier ensuite que `IAuditLog` dans `backend/src/types/models/` n'impose pas une union de
littéraux à part ; si c'est le cas, y ajouter les mêmes trois valeurs.

- [ ] **Step 5: Monter le routeur**

Dans `backend/src/index.ts`, ajouter l'import à côté des autres routeurs client (vers la ligne 77) :

```ts
import clientQuoteRoutes from './routes/client/quotes.js'
```

Puis, à côté du montage des autres routeurs client, ajouter :

```ts
app.use('/api/projects', clientQuoteRoutes)
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-client.test.ts`
Attendu : SUCCÈS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/client/quotes.ts backend/src/models/AuditLog.ts backend/src/index.ts backend/src/__tests__/quote-proposal-client.test.ts
git commit -m "feat(devis): routes client de lecture des propositions"
```

---

### Task 5: Mutations client (réponses et arbitrage)

**Files:**
- Modify: `backend/src/routes/client/quotes.ts`
- Modify: `backend/src/__tests__/quote-proposal-client.test.ts`

**Interfaces:**
- Consumes: `loadProposalForClient` (tâche 4), `validateSelection` (tâche 2), `buildSpecificationMarkdown` (tâche 3).
- Produces: `PATCH /:projectId/proposals/:id/answers` et `PATCH /:projectId/proposals/:id/selection`, renvoyant tous deux `{ proposal, totals }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/__tests__/quote-proposal-client.test.ts` :

```ts
describe('mutations client', () => {
  it('enregistre les réponses et régénère le cahier des charges', async () => {
    const proposal = await createProposal({
      questions: [{ type: 'text', label: 'Délai ?', required: true, order: 0 }],
    })
    const questionId = String(proposal.questions[0]!._id)

    const response = await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/answers`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ answers: [{ question: questionId, value: 'Trois mois' }] })
      .expect(200)

    expect(response.body.proposal.answers[0].value).toBe('Trois mois')
    expect(response.body.proposal.specification.content).toContain('Trois mois')
  })

  it('recalcule le total après un arbitrage et ignore tout montant posté', async () => {
    const proposal = await createProposal()
    const optionalId = String(proposal.lines[1]!._id)

    const response = await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [optionalId], total: 1 })
      .expect(200)

    expect(response.body.totals).toEqual({ subtotal: 2600, taxTotal: 520, total: 3120 })
  })

  it('rejette la sélection d’une ligne obligatoire', async () => {
    const proposal = await createProposal()
    const mandatoryId = String(proposal.lines[0]!._id)

    const response = await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [mandatoryId] })
      .expect(422)

    expect(response.body.code).toBe('INVALID_LINE_SELECTION')
  })

  it('interdit à un collaborateur invité d’arbitrer', async () => {
    const proposal = await createProposal()
    await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(viewerId))
      .send({ selectedOptionalLineIds: [] })
      .expect(403)
  })

  it('refuse toute mutation sur une proposition signée', async () => {
    const proposal = await createProposal({ status: 'SIGNED' })
    await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [] })
      .expect(409)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-client.test.ts`
Attendu : ÉCHEC — les cinq nouveaux tests reçoivent 404 (routes absentes).

- [ ] **Step 3: Implémenter les deux routes**

Dans `backend/src/routes/client/quotes.ts`, ajouter les imports :

```ts
import { body } from 'express-validator'
import { computeQuoteTotals, validateSelection } from '../../lib/quoteTotals.js'
import { buildSpecificationMarkdown } from '../../lib/quoteSpecification.js'
```

(remplacer l'import existant de `quoteTotals` par celui-ci)

Puis, avant `export default router`, ajouter :

```ts
/**
 * Arbitrer et signer engagent financièrement : réservé au propriétaire, même
 * si un collaborateur EDITOR peut par ailleurs modifier le contenu du projet.
 */
async function loadEditableProposal(req: Request, res: Response) {
  const loaded = await loadProposalForClient(req, res)
  if (!loaded) return null
  if (loaded.access.role !== 'OWNER') {
    res.status(403).json({ error: 'Seul le propriétaire du projet peut valider une proposition', code: 'OWNER_REQUIRED' })
    return null
  }
  if (loaded.proposal.status === 'EXPIRED') {
    res.status(410).json({ error: 'Cette proposition a expiré', code: 'PROPOSAL_EXPIRED' })
    return null
  }
  if (loaded.proposal.status !== 'SENT') {
    res.status(409).json({ error: 'Cette proposition n’est plus modifiable', code: 'PROPOSAL_ALREADY_SIGNED' })
    return null
  }
  return loaded
}

function refreshSpecification(proposal: IQuoteProposal): void {
  if (proposal.specification.isManual) return
  proposal.specification.content = buildSpecificationMarkdown({
    title: proposal.title,
    questions: proposal.questions.toObject(),
    answers: proposal.answers.toObject(),
    lines: proposal.lines.toObject(),
    selectedOptionalLineIds: proposal.selectedOptionalLineIds,
  })
  proposal.specification.updatedAt = new Date()
}

router.patch(
  '/:projectId/proposals/:id/answers',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  body('answers').isArray().withMessage('answers doit être un tableau'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadEditableProposal(req, res)
      if (!loaded) return
      const { proposal } = loaded

      const knownQuestions = new Set(proposal.questions.map((question) => String(question._id)))
      const incoming = req.body.answers as { question?: string; value?: unknown }[]
      const unknown = incoming.filter((answer) => !knownQuestions.has(String(answer.question)))
      if (unknown.length > 0) {
        return res.status(422).json({ error: 'Question inconnue', code: 'UNKNOWN_QUESTION' })
      }

      proposal.set(
        'answers',
        incoming.map((answer) => ({ question: answer.question, value: String(answer.value ?? '') })),
      )
      refreshSpecification(proposal)
      await proposal.save()

      return res.json({ proposal: proposal.toObject(), totals: totalsOf(proposal) })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:projectId/proposals/:id/selection',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  body('selectedOptionalLineIds').isArray().withMessage('selectedOptionalLineIds doit être un tableau'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadEditableProposal(req, res)
      if (!loaded) return
      const { proposal } = loaded

      const selection = (req.body.selectedOptionalLineIds as string[]).map(String)
      const check = validateSelection(proposal.lines.toObject(), selection)
      if (!check.valid) {
        return res
          .status(422)
          .json({ error: 'Sélection invalide', code: 'INVALID_LINE_SELECTION', invalidIds: check.invalidIds })
      }

      // Le corps de requête peut contenir un total : il n'est jamais lu.
      proposal.set('selectedOptionalLineIds', selection)
      refreshSpecification(proposal)
      await proposal.save()

      return res.json({ proposal: proposal.toObject(), totals: totalsOf(proposal) })
    } catch (err) {
      return next(err)
    }
  },
)
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-client.test.ts`
Attendu : SUCCÈS, 11 tests.

- [ ] **Step 5: Vérifier le typage**

Depuis la racine : `npm --prefix backend run typecheck`
Attendu : aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/client/quotes.ts backend/src/__tests__/quote-proposal-client.test.ts
git commit -m "feat(devis): arbitrage des options et reponses de cadrage"
```

---

### Task 6: Signature

**Files:**
- Create: `backend/src/lib/quoteSignature.ts`
- Modify: `backend/src/routes/client/quotes.ts`
- Test: `backend/src/__tests__/quote-proposal-signature.test.ts`

**Interfaces:**
- Consumes: `computeQuoteTotals` (tâche 2), `loadProposalForClient` (tâche 4), `getNextSequence` de `models/Sequence.js`, `generateBillingPdf` de `lib/pdfBilling.js`.
- Produces:
  - `lockProposalForSignature(proposalId, signature): Promise<IQuoteProposal | null>` — verrou atomique, `null` si déjà signée.
  - `buildBillingDocumentForProposal(proposal): Promise<IBillingDocument>` — idempotent : renvoie le document existant si `proposal.billingDocument` est déjà renseigné.
  - `POST /:projectId/proposals/:id/sign`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/quote-proposal-signature.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientQuoteRoutes from '../routes/client/quotes.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import QuoteProposal from '../models/QuoteProposal.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectItem from '../models/ProjectItem.js'

let app: Express
let ownerId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createProposal(overrides: Record<string, unknown> = {}) {
  return QuoteProposal.create({
    project: projectId,
    client: ownerId,
    createdBy: ownerId,
    title: 'Refonte',
    status: 'SENT',
    lines: [
      { description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false, order: 0 },
      { description: 'Rédaction', quantity: 1, unitPrice: 600, taxRate: 20, isOptional: true, order: 1 },
    ],
    ...overrides,
  })
}

const CONSENT = { signerName: 'Jean Client', consent: true }

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const owner = await User.create({ name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' })
  ownerId = String(owner._id)
  const project = await Project.create({ name: 'Site', client: owner._id })
  projectId = String(project._id)
})

describe('signature d’une proposition', () => {
  it('produit un BillingDocument avec les seules lignes retenues', async () => {
    const proposal = await createProposal()
    const optionalId = String(proposal.lines[1]!._id)
    await QuoteProposal.findByIdAndUpdate(proposal._id, { selectedOptionalLineIds: [optionalId] })

    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    expect(response.body.billingDocument.type).toBe('QUOTE')
    expect(response.body.billingDocument.number).toMatch(/^DEV-/)
    expect(response.body.billingDocument.lines).toHaveLength(2)
    expect(response.body.billingDocument.total).toBe(3120)

    const signed = await QuoteProposal.findById(proposal._id)
    expect(signed!.status).toBe('SIGNED')
    expect(signed!.signature.signerName).toBe('Jean Client')
    expect(signed!.signature.signedAt).toBeInstanceOf(Date)
    expect(signed!.signature.ip).not.toBe('')
    expect(signed!.billingDocument).not.toBeNull()
  })

  it('annexe le cahier des charges figé au projet', async () => {
    const proposal = await createProposal()
    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    const item = await ProjectItem.findOne({ project: projectId, type: 'CAHIER_DES_CHARGES' })
    expect(item).not.toBeNull()
  })

  it('refuse sans consentement explicite', async () => {
    const proposal = await createProposal()
    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ signerName: 'Jean Client', consent: false })
      .expect(422)
  })

  it('refuse tant qu’une question requise est sans réponse', async () => {
    const proposal = await createProposal({
      questions: [{ type: 'text', label: 'Délai ?', required: true, order: 0 }],
    })
    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(422)

    expect(response.body.code).toBe('MISSING_REQUIRED_ANSWERS')
    expect(response.body.missingQuestionIds).toHaveLength(1)
  })

  it('refuse une proposition expirée', async () => {
    const proposal = await createProposal({ expiresAt: new Date(Date.now() - 1000) })
    const response = await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(410)

    expect(response.body.code).toBe('PROPOSAL_EXPIRED')
  })

  it('ne signe qu’une fois malgré deux appels concurrents', async () => {
    const proposal = await createProposal()
    const cookie = await cookieFor(ownerId)

    const results = await Promise.all([
      request(app).post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`).set('Cookie', cookie).send(CONSENT),
      request(app).post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`).set('Cookie', cookie).send(CONSENT),
    ])

    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 409])
    expect(await BillingDocument.countDocuments({ project: projectId })).toBe(1)
  })

  it('rend la proposition immuable après signature', async () => {
    const proposal = await createProposal()
    await request(app)
      .post(`/api/projects/${projectId}/proposals/${proposal._id}/sign`)
      .set('Cookie', await cookieFor(ownerId))
      .send(CONSENT)
      .expect(201)

    await request(app)
      .patch(`/api/projects/${projectId}/proposals/${proposal._id}/selection`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ selectedOptionalLineIds: [] })
      .expect(409)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-signature.test.ts`
Attendu : ÉCHEC — la route `/sign` renvoie 404.

- [ ] **Step 3: Écrire la bibliothèque de signature**

Créer `backend/src/lib/quoteSignature.ts` :

```ts
import crypto from 'crypto'
import fsp from 'fs/promises'
import path from 'path'
import QuoteProposal from '../models/QuoteProposal.js'
import BillingDocument from '../models/BillingDocument.js'
import ProjectItem from '../models/ProjectItem.js'
import Project from '../models/Project.js'
import User from '../models/User.js'
import { getNextSequence } from '../models/Sequence.js'
import { generateBillingPdf } from './pdfBilling.js'
import { computeQuoteTotals } from './quoteTotals.js'
import type { IQuoteProposal } from '../types/models/index.js'

export interface SignatureInput {
  signerUserId: string
  signerName: string
  signerEmail: string
  ip: string
  userAgent: string
  consentText: string
}

/**
 * Verrou par prédicat d'état : deux signatures concurrentes deviennent
 * mutuellement exclusives, y compris entre processus. Même mécanique que
 * l'acceptation d'invitation projet.
 */
export async function lockProposalForSignature(
  proposalId: string,
  input: SignatureInput,
): Promise<IQuoteProposal | null> {
  return QuoteProposal.findOneAndUpdate(
    { _id: proposalId, status: 'SENT' },
    {
      $set: {
        status: 'SIGNED',
        'signature.signedAt': new Date(),
        'signature.signerUserId': input.signerUserId,
        'signature.signerName': input.signerName,
        'signature.signerEmail': input.signerEmail,
        'signature.ip': input.ip,
        'signature.userAgent': input.userAgent,
        'signature.consentText': input.consentText,
        'signature.proofVersion': 1,
      },
    },
    { new: true },
  )
}

/**
 * Idempotent : rejouable si la génération a échoué après la pose du verrou.
 * Ne consomme un numéro de séquence que lorsqu'aucun document n'existe encore.
 */
export async function buildBillingDocumentForProposal(proposal: IQuoteProposal) {
  if (proposal.billingDocument) {
    const existing = await BillingDocument.findById(proposal.billingDocument)
    if (existing) return existing
  }

  const totals = computeQuoteTotals(proposal.lines.toObject(), proposal.selectedOptionalLineIds)
  const { formatted } = await getNextSequence('quoteNumber', { prefix: 'DEV-', padding: 3 })

  const document = await BillingDocument.create({
    type: 'QUOTE',
    number: formatted,
    project: proposal.project,
    client: proposal.client,
    status: 'ACCEPTED',
    issuedAt: new Date(),
    lines: totals.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      total: Math.round(line.quantity * line.unitPrice * 100) / 100,
    })),
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    note: proposal.intro,
    createdBy: proposal.createdBy,
  })

  const [project, client] = await Promise.all([
    Project.findById(proposal.project).lean(),
    User.findById(proposal.client).lean(),
  ])
  const filename = `QUOTE-${formatted.replace(/\//g, '-')}.pdf`
  const storagePath = path.join('uploads', 'billing', String(proposal.project), filename)
  await generateBillingPdf(document.toObject(), client, project, storagePath)

  const buffer = await fsp.readFile(path.resolve(process.cwd(), storagePath))
  const documentHash = crypto.createHash('sha256').update(buffer).digest('hex')

  document.pdfStoragePath = storagePath
  await document.save()

  await ProjectItem.create({
    project: proposal.project,
    type: 'CAHIER_DES_CHARGES',
    title: `Cahier des charges — ${proposal.title}`,
    content: proposal.specification.content,
    isVisible: true,
    isDownloadable: false,
    order: 0,
  })

  await QuoteProposal.findByIdAndUpdate(proposal._id, {
    billingDocument: document._id,
    'signature.documentHash': documentHash,
  })

  return document
}
```

- [ ] **Step 4: Écrire la route de signature**

Dans `backend/src/routes/client/quotes.ts`, ajouter les imports :

```ts
import AuditLog from '../../models/AuditLog.js'
import { buildBillingDocumentForProposal, lockProposalForSignature } from '../../lib/quoteSignature.js'
```

Puis, avant `export default router`, ajouter :

```ts
const CONSENT_TEXT =
  'Je reconnais avoir pris connaissance du périmètre et du montant de cette proposition, et je l’accepte sans réserve.'

router.post(
  '/:projectId/proposals/:id/sign',
  param('projectId').isMongoId(),
  param('id').isMongoId(),
  body('signerName').trim().isLength({ min: 2 }).withMessage('Nom du signataire requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      const loaded = await loadEditableProposal(req, res)
      if (!loaded) return
      const { proposal } = loaded

      if (req.body.consent !== true) {
        return res.status(422).json({ error: 'Consentement explicite requis', code: 'CONSENT_REQUIRED' })
      }

      const answered = new Map(proposal.answers.map((answer) => [String(answer.question), answer.value.trim()]))
      const missingQuestionIds = proposal.questions
        .filter((question) => question.required && !answered.get(String(question._id)))
        .map((question) => String(question._id))
      if (missingQuestionIds.length > 0) {
        return res.status(422).json({
          error: 'Certaines questions obligatoires sont sans réponse',
          code: 'MISSING_REQUIRED_ANSWERS',
          missingQuestionIds,
        })
      }

      const ipHeader = req.headers['x-forwarded-for'] || req.ip || 'inconnue'
      const ip = Array.isArray(ipHeader) ? ipHeader[0]! : String(ipHeader)
      const locked = await lockProposalForSignature(String(proposal._id), {
        signerUserId: req.user!.id,
        signerName: String(req.body.signerName).trim(),
        signerEmail: req.user!.email,
        ip,
        userAgent: String(req.headers['user-agent'] || ''),
        consentText: CONSENT_TEXT,
      })
      if (!locked) {
        return res.status(409).json({ error: 'Cette proposition a déjà été signée', code: 'PROPOSAL_ALREADY_SIGNED' })
      }

      const billingDocument = await buildBillingDocumentForProposal(locked)

      AuditLog.create({
        userId: req.user!.id,
        email: req.user!.email,
        action: 'QUOTE_PROPOSAL_SIGNED',
        ip,
        userAgent: req.headers['user-agent'] || '',
        metadata: { proposalId: String(locked._id), billingDocumentId: String(billingDocument._id) },
      }).catch(() => {})

      return res.status(201).json({ billingDocument: billingDocument.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)
```

- [ ] **Step 5: Ajouter le limiteur de signature**

Dans `backend/src/index.ts`, à côté des autres limiteurs (vers la ligne 260), ajouter :

```ts
// Signature de devis : 10 tentatives /15 min /IP, aligné sur l'acceptation d'invitation.
const quoteSignatureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de signature. Réessayez plus tard.' },
})
```

Puis, **avant** le montage de `clientQuoteRoutes` :

```ts
app.use('/api/projects/:projectId/proposals/:id/sign', quoteSignatureLimiter)
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-signature.test.ts`
Attendu : SUCCÈS, 7 tests.

Si le test « produit un BillingDocument » échoue sur la lecture du PDF, vérifier que le dossier `backend/uploads/billing/` est bien créé par `generateBillingPdf` — il fait déjà un `mkdir` récursif, donc l'échec indiquerait un chemin relatif incorrect.

- [ ] **Step 7: Lancer toute la suite pour vérifier l'absence de régression**

Depuis la racine : `npm --prefix backend test`
Attendu : aucun échec nouveau. Les échecs préexistants d'`education-routes` et `permissions-ticket-scope` sont hors périmètre.

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib/quoteSignature.ts backend/src/routes/client/quotes.ts backend/src/index.ts backend/src/__tests__/quote-proposal-signature.test.ts
git commit -m "feat(devis): signature client et production du document de facturation"
```

---

### Task 7: Reprise sur échec

**Files:**
- Create: `backend/src/routes/admin/quoteProposals.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/src/__tests__/quote-proposal-admin.test.ts`

**Interfaces:**
- Consumes: `buildBillingDocumentForProposal` (tâche 6).
- Produces: `POST /api/admin/quote-proposals/:id/rebuild-document`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `backend/src/__tests__/quote-proposal-admin.test.ts` :

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminQuoteRoutes from '../routes/admin/quoteProposals.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import QuoteProposal from '../models/QuoteProposal.js'
import BillingDocument from '../models/BillingDocument.js'

let app: Express
let adminId: string
let clientId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/quote-proposals', adminQuoteRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, client] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Client', email: 'client@example.test', passwordHash, role: 'CLIENT' },
  ])
  adminId = String(admin._id)
  clientId = String(client._id)
  const project = await Project.create({ name: 'Site', client: client._id })
  projectId = String(project._id)
})

describe('reprise de génération', () => {
  it('reconstruit le document manquant d’une proposition signée', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Refonte',
      status: 'SIGNED',
      billingDocument: null,
      lines: [{ description: 'Conception', quantity: 1, unitPrice: 1000, taxRate: 20, isOptional: false, order: 0 }],
    })

    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', await cookieFor(adminId))
      .expect(201)

    expect((await QuoteProposal.findById(proposal._id))!.billingDocument).not.toBeNull()
    expect(await BillingDocument.countDocuments({ project: projectId })).toBe(1)
  })

  it('est idempotent et ne consomme pas un second numéro', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Refonte',
      status: 'SIGNED',
      lines: [{ description: 'Conception', quantity: 1, unitPrice: 1000, taxRate: 20, isOptional: false, order: 0 }],
    })
    const cookie = await cookieFor(adminId)

    const first = await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', cookie)
      .expect(201)
    const second = await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', cookie)
      .expect(201)

    expect(second.body.billingDocument.number).toBe(first.body.billingDocument.number)
    expect(await BillingDocument.countDocuments({ project: projectId })).toBe(1)
  })

  it('refuse une proposition non signée', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Brouillon',
      status: 'DRAFT',
    })
    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', await cookieFor(adminId))
      .expect(409)
  })

  it('refuse une session client', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId,
      client: clientId,
      createdBy: adminId,
      title: 'Refonte',
      status: 'SIGNED',
    })
    await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/rebuild-document`)
      .set('Cookie', await cookieFor(clientId))
      .expect(403)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-admin.test.ts`
Attendu : ÉCHEC — `Cannot find module '../routes/admin/quoteProposals.js'`.

- [ ] **Step 3: Écrire le routeur admin**

Créer `backend/src/routes/admin/quoteProposals.ts` :

```ts
import express, { type NextFunction, type Request, type Response } from 'express'
import { param, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import QuoteProposal from '../../models/QuoteProposal.js'
import { buildBillingDocumentForProposal } from '../../lib/quoteSignature.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.post(
  '/:id/rebuild-document',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: 'Identifiant invalide' })
      }
      const proposal = await QuoteProposal.findById(req.params.id)
      if (!proposal) return res.status(404).json({ error: 'Proposition non trouvée' })
      if (proposal.status !== 'SIGNED') {
        return res
          .status(409)
          .json({ error: 'Seule une proposition signée produit un document', code: 'PROPOSAL_NOT_SIGNED' })
      }

      const billingDocument = await buildBillingDocumentForProposal(proposal)
      return res.status(201).json({ billingDocument: billingDocument.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
```

- [ ] **Step 4: Monter le routeur**

Dans `backend/src/index.ts`, ajouter l'import à côté des autres routeurs admin :

```ts
import adminQuoteProposalRoutes from './routes/admin/quoteProposals.js'
```

Puis à côté des autres montages `/api/admin/...` :

```ts
app.use('/api/admin/quote-proposals', adminQuoteProposalRoutes)
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-admin.test.ts`
Attendu : SUCCÈS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/quoteProposals.ts backend/src/index.ts backend/src/__tests__/quote-proposal-admin.test.ts
git commit -m "feat(devis): reprise idempotente de generation du document"
```

---

### Task 8: Vitrine facturation client

**Files:**
- Modify: `backend/src/routes/client/quotes.ts`
- Test: `backend/src/__tests__/quote-proposal-client.test.ts`

**Interfaces:**
- Consumes: `getProjectAccess`, `BillingDocument`.
- Produces: `GET /:projectId/billing` renvoyant `{ documents }`, et `GET /:projectId/billing/:documentId/pdf` renvoyant le fichier.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/__tests__/quote-proposal-client.test.ts` :

```ts
describe('vitrine facturation', () => {
  it('expose les documents émis et masque brouillons et annulés', async () => {
    const BillingDocument = (await import('../models/BillingDocument.js')).default
    await BillingDocument.create([
      { type: 'INVOICE', number: 'FAC-001', project: projectId, client: ownerId, status: 'PAID', createdBy: ownerId },
      { type: 'QUOTE', number: 'DEV-001', project: projectId, client: ownerId, status: 'DRAFT', createdBy: ownerId },
      { type: 'QUOTE', number: 'DEV-002', project: projectId, client: ownerId, status: 'CANCELLED', createdBy: ownerId },
    ])

    const response = await request(app)
      .get(`/api/projects/${projectId}/billing`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.documents).toHaveLength(1)
    expect(response.body.documents[0].number).toBe('FAC-001')
  })

  it('refuse un client étranger au projet', async () => {
    await request(app)
      .get(`/api/projects/${projectId}/billing`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  it('renvoie 404 quand le PDF n’a pas été généré', async () => {
    const BillingDocument = (await import('../models/BillingDocument.js')).default
    const doc = await BillingDocument.create({
      type: 'INVOICE', number: 'FAC-010', project: projectId, client: ownerId, status: 'SENT', createdBy: ownerId,
    })

    await request(app)
      .get(`/api/projects/${projectId}/billing/${doc._id}/pdf`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(404)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-client.test.ts`
Attendu : ÉCHEC — les trois nouveaux tests reçoivent 404 sur une route absente.

- [ ] **Step 3: Implémenter les routes**

Dans `backend/src/routes/client/quotes.ts`, ajouter les imports :

```ts
import fs from 'fs'
import path from 'path'
import BillingDocument from '../../models/BillingDocument.js'
```

Puis, avant `export default router` :

```ts
const CLIENT_VISIBLE_BILLING_STATUSES = ['ISSUED', 'SENT', 'ACCEPTED', 'PAID']

router.get('/:projectId/billing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
    const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
    if (!access) return res.status(404).json({ error: 'Projet non trouvé' })

    const documents = await BillingDocument.find({
      project: access.project._id,
      status: { $in: CLIENT_VISIBLE_BILLING_STATUSES },
    })
      .sort({ issuedAt: -1, createdAt: -1 })
      .select('-pdfStoragePath -createdBy')
      .lean()

    return res.json({ documents })
  } catch (err) {
    return next(err)
  }
})

router.get(
  '/:projectId/billing/:documentId/pdf',
  param('projectId').isMongoId(),
  param('documentId').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (validationFailed(req, res)) return
      if (req.user!.role !== 'CLIENT') return res.status(403).json({ error: 'Forbidden' })
      const access = await getProjectAccess(req.params.projectId as string, req.user!.id)
      if (!access) return res.status(404).json({ error: 'Projet non trouvé' })

      const document = await BillingDocument.findOne({
        _id: req.params.documentId,
        project: access.project._id,
        status: { $in: CLIENT_VISIBLE_BILLING_STATUSES },
      }).lean()
      if (!document?.pdfStoragePath) {
        return res.status(404).json({ error: 'Document non disponible' })
      }

      const uploadsDir = path.resolve(process.cwd(), 'uploads')
      const filePath = path.resolve(process.cwd(), document.pdfStoragePath)
      if (!filePath.startsWith(uploadsDir + path.sep) || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Document non disponible' })
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${document.number}.pdf"`)
      return fs.createReadStream(filePath).pipe(res)
    } catch (err) {
      return next(err)
    }
  },
)
```

Le flux est servi par `createReadStream` plutôt que `res.download`, qui refuse tout chemin absolu contenant un segment commençant par un point — ce qui casse en développement dès que le dépôt vit sous un dossier masqué.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-client.test.ts`
Attendu : SUCCÈS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/client/quotes.ts backend/src/__tests__/quote-proposal-client.test.ts
git commit -m "feat(devis): vitrine facturation cote client"
```

---

### Task 9: Administration des propositions

**Files:**
- Modify: `backend/src/routes/admin/quoteProposals.ts`
- Modify: `backend/src/__tests__/quote-proposal-admin.test.ts`

**Interfaces:**
- Consumes: `QuoteProposal`, `buildSpecificationMarkdown`.
- Produces: `GET /`, `POST /`, `PATCH /:id`, `POST /:id/send`, `POST /:id/cancel`.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/__tests__/quote-proposal-admin.test.ts` :

```ts
describe('administration des propositions', () => {
  it('crée un brouillon puis l’envoie', async () => {
    const cookie = await cookieFor(adminId)
    const created = await request(app)
      .post('/api/admin/quote-proposals')
      .set('Cookie', cookie)
      .send({
        project: projectId,
        title: 'Refonte',
        lines: [{ description: 'Conception', quantity: 1, unitPrice: 1000, taxRate: 20, isOptional: false }],
      })
      .expect(201)

    expect(created.body.proposal.status).toBe('DRAFT')

    const sent = await request(app)
      .post(`/api/admin/quote-proposals/${created.body.proposal._id}/send`)
      .set('Cookie', cookie)
      .expect(200)

    expect(sent.body.proposal.status).toBe('SENT')
  })

  it('refuse de modifier une proposition signée', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId, client: clientId, createdBy: adminId, title: 'Signée', status: 'SIGNED',
    })
    await request(app)
      .patch(`/api/admin/quote-proposals/${proposal._id}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ title: 'Modifiée' })
      .expect(409)
  })

  it('annule une proposition envoyée', async () => {
    const proposal = await QuoteProposal.create({
      project: projectId, client: clientId, createdBy: adminId, title: 'À annuler', status: 'SENT',
    })
    const response = await request(app)
      .post(`/api/admin/quote-proposals/${proposal._id}/cancel`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body.proposal.status).toBe('CANCELLED')
  })

  it('liste les propositions d’un projet, tous statuts confondus', async () => {
    await QuoteProposal.create([
      { project: projectId, client: clientId, createdBy: adminId, title: 'A', status: 'DRAFT' },
      { project: projectId, client: clientId, createdBy: adminId, title: 'B', status: 'SENT' },
    ])
    const response = await request(app)
      .get(`/api/admin/quote-proposals?project=${projectId}`)
      .set('Cookie', await cookieFor(adminId))
      .expect(200)

    expect(response.body.proposals).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-admin.test.ts`
Attendu : ÉCHEC — 404 sur les routes absentes.

- [ ] **Step 3: Implémenter les routes**

Dans `backend/src/routes/admin/quoteProposals.ts`, ajouter les imports :

```ts
import { body } from 'express-validator'
import Project from '../../models/Project.js'
import { buildSpecificationMarkdown } from '../../lib/quoteSpecification.js'
```

Puis, avant `export default router` :

```ts
async function loadEditable(res: Response, id: string) {
  const proposal = await QuoteProposal.findById(id)
  if (!proposal) {
    res.status(404).json({ error: 'Proposition non trouvée' })
    return null
  }
  if (proposal.status === 'SIGNED') {
    res.status(409).json({ error: 'Une proposition signée est figée', code: 'PROPOSAL_ALREADY_SIGNED' })
    return null
  }
  return proposal
}

router.get('/', requirePermission(PERMISSIONS.MANAGE_BILLING), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {}
    if (req.query.project) filter.project = req.query.project
    const proposals = await QuoteProposal.find(filter).sort({ createdAt: -1 }).lean()
    return res.json({ proposals })
  } catch (err) {
    return next(err)
  }
})

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  body('project').isMongoId().withMessage('Projet invalide'),
  body('title').trim().isLength({ min: 1 }).withMessage('Titre requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validationResult(req).isEmpty()) {
        return res.status(400).json({ error: validationResult(req).array()[0]!.msg })
      }
      const project = await Project.findById(req.body.project).lean()
      if (!project) return res.status(404).json({ error: 'Projet non trouvé' })

      const proposal = await QuoteProposal.create({
        project: project._id,
        client: project.client,
        createdBy: req.user!.id,
        title: String(req.body.title).trim(),
        intro: req.body.intro ?? '',
        expiresAt: req.body.expiresAt ?? null,
        questions: req.body.questions ?? [],
        lines: req.body.lines ?? [],
      })

      proposal.selectedOptionalLineIds = proposal.lines
        .filter((line) => line.isOptional && line.isSelectedByDefault)
        .map((line) => line._id)
      proposal.specification.content = buildSpecificationMarkdown({
        title: proposal.title,
        questions: proposal.questions.toObject(),
        answers: [],
        lines: proposal.lines.toObject(),
        selectedOptionalLineIds: proposal.selectedOptionalLineIds,
      })
      await proposal.save()

      return res.status(201).json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await loadEditable(res, req.params.id as string)
      if (!proposal) return
      for (const field of ['title', 'intro', 'expiresAt', 'questions', 'lines'] as const) {
        if (req.body[field] !== undefined) proposal.set(field, req.body[field])
      }
      if (req.body.specification !== undefined) {
        proposal.specification.content = String(req.body.specification)
        proposal.specification.isManual = true
        proposal.specification.updatedAt = new Date()
      }
      await proposal.save()
      return res.json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/send',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await loadEditable(res, req.params.id as string)
      if (!proposal) return
      if (proposal.status !== 'DRAFT') {
        return res.status(409).json({ error: 'Seul un brouillon peut être envoyé', code: 'PROPOSAL_NOT_DRAFT' })
      }
      proposal.status = 'SENT'
      await proposal.save()
      return res.json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.MANAGE_BILLING),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const proposal = await loadEditable(res, req.params.id as string)
      if (!proposal) return
      proposal.status = 'CANCELLED'
      await proposal.save()
      return res.json({ proposal: proposal.toObject() })
    } catch (err) {
      return next(err)
    }
  },
)
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Depuis `backend/` : `npx vitest run src/__tests__/quote-proposal-admin.test.ts`
Attendu : SUCCÈS, 8 tests.

- [ ] **Step 5: Vérifier typage et lint**

Depuis la racine :
```bash
npm --prefix backend run typecheck && npx eslint backend/src/routes/admin/quoteProposals.ts backend/src/routes/client/quotes.ts backend/src/lib/quoteSignature.ts
```
Attendu : aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin/quoteProposals.ts backend/src/__tests__/quote-proposal-admin.test.ts
git commit -m "feat(devis): administration des propositions"
```

---

### Task 10: Service API et types frontend

**Files:**
- Create: `src/types/quote.types.ts`
- Create: `src/services/quotes.ts`
- Test: `src/services/quotes.test.ts`

**Interfaces:**
- Consumes: `apiFetch` de `src/lib/api.ts`.
- Produces: `listProposals`, `getProposal`, `saveAnswers`, `saveSelection`, `signProposal`, `listBillingDocuments`, `billingPdfUrl`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/services/quotes.test.ts` :

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as api from '../lib/api'
import { saveSelection, signProposal, billingPdfUrl } from './quotes'

vi.mock('../lib/api')

beforeEach(() => vi.resetAllMocks())

describe('service quotes', () => {
  it('n’envoie que les identifiants retenus, jamais de montant', async () => {
    vi.mocked(api.apiFetch).mockResolvedValue({ proposal: {}, totals: { subtotal: 0, taxTotal: 0, total: 0 } } as never)
    await saveSelection('p1', 'q1', ['line-a'])

    expect(api.apiFetch).toHaveBeenCalledWith('/api/projects/p1/proposals/q1/selection', {
      method: 'PATCH',
      body: JSON.stringify({ selectedOptionalLineIds: ['line-a'] }),
    })
  })

  it('transmet le consentement à la signature', async () => {
    vi.mocked(api.apiFetch).mockResolvedValue({ billingDocument: {} } as never)
    await signProposal('p1', 'q1', 'Jean Client')

    expect(api.apiFetch).toHaveBeenCalledWith('/api/projects/p1/proposals/q1/sign', {
      method: 'POST',
      body: JSON.stringify({ signerName: 'Jean Client', consent: true }),
    })
  })

  it('construit l’URL de téléchargement du PDF', () => {
    expect(billingPdfUrl('p1', 'd1')).toBe('/api/projects/p1/billing/d1/pdf')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis la racine : `npx vitest run src/services/quotes.test.ts`
Attendu : ÉCHEC — module `./quotes` introuvable.

- [ ] **Step 3: Écrire les types**

Créer `src/types/quote.types.ts` :

```ts
export type QuoteProposalStatus = 'SENT' | 'SIGNED' | 'EXPIRED'
export type QuoteQuestionType = 'text' | 'longtext' | 'choice' | 'multichoice' | 'boolean' | 'number'

export interface QuoteQuestion {
  _id: string
  type: QuoteQuestionType
  label: string
  help: string
  options: string[]
  required: boolean
  order: number
}

export interface QuoteAnswer {
  question: string
  value: string
}

export interface QuoteLine {
  _id: string
  description: string
  detail: string
  quantity: number
  unitPrice: number
  taxRate: number
  isOptional: boolean
  group: string
  order: number
}

export interface QuoteTotals {
  subtotal: number
  taxTotal: number
  total: number
}

export interface QuoteProposal {
  _id: string
  title: string
  intro: string
  status: QuoteProposalStatus
  expiresAt: string | null
  questions: QuoteQuestion[]
  answers: QuoteAnswer[]
  lines: QuoteLine[]
  selectedOptionalLineIds: string[]
  specification: { content: string }
  signature: { signedAt: string | null; signerName: string }
  totals?: QuoteTotals
}

export interface ClientBillingDocument {
  _id: string
  type: 'QUOTE' | 'INVOICE'
  number: string
  status: string
  total: number
  currency: string
  issuedAt: string | null
  dueAt: string | null
}
```

- [ ] **Step 4: Écrire le service**

Créer `src/services/quotes.ts` :

```ts
import { apiFetch } from '../lib/api'
import type { ClientBillingDocument, QuoteProposal, QuoteTotals } from '../types/quote.types'

interface ProposalResponse {
  proposal: QuoteProposal
  totals: QuoteTotals
}

export function listProposals(projectId: string): Promise<{ proposals: QuoteProposal[] }> {
  return apiFetch(`/api/projects/${projectId}/proposals`)
}

export function getProposal(projectId: string, proposalId: string): Promise<ProposalResponse> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}`)
}

export function saveAnswers(
  projectId: string,
  proposalId: string,
  answers: { question: string; value: string }[],
): Promise<ProposalResponse> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}/answers`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  })
}

// Seuls les identifiants voyagent : le total affiché vient toujours du serveur.
export function saveSelection(
  projectId: string,
  proposalId: string,
  selectedOptionalLineIds: string[],
): Promise<ProposalResponse> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}/selection`, {
    method: 'PATCH',
    body: JSON.stringify({ selectedOptionalLineIds }),
  })
}

export function signProposal(
  projectId: string,
  proposalId: string,
  signerName: string,
): Promise<{ billingDocument: ClientBillingDocument }> {
  return apiFetch(`/api/projects/${projectId}/proposals/${proposalId}/sign`, {
    method: 'POST',
    body: JSON.stringify({ signerName, consent: true }),
  })
}

export function listBillingDocuments(projectId: string): Promise<{ documents: ClientBillingDocument[] }> {
  return apiFetch(`/api/projects/${projectId}/billing`)
}

export function billingPdfUrl(projectId: string, documentId: string): string {
  return `/api/projects/${projectId}/billing/${documentId}/pdf`
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Depuis la racine : `npx vitest run src/services/quotes.test.ts`
Attendu : SUCCÈS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/quote.types.ts src/services/quotes.ts src/services/quotes.test.ts
git commit -m "feat(devis): service API cote portail client"
```

---

### Task 11: Wizard de proposition

**Files:**
- Create: `src/pages/espace-client/QuoteProposal.tsx`
- Create: `src/pages/espace-client/QuoteProposal.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: le service de la tâche 10.
- Produces: le composant par défaut `ClientQuoteProposal`, monté sur `/espace-client/projets/:projectId/propositions/:proposalId`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/pages/espace-client/QuoteProposal.test.tsx` :

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as quotes from '../../services/quotes'
import ClientQuoteProposal from './QuoteProposal'

vi.mock('../../services/quotes')

const proposal = {
  _id: 'q1',
  title: 'Refonte',
  intro: '',
  status: 'SENT' as const,
  expiresAt: null,
  questions: [{ _id: 'question-1', type: 'text' as const, label: 'Délai ?', help: '', options: [], required: true, order: 0 }],
  answers: [],
  lines: [
    { _id: 'line-1', description: 'Conception', detail: '', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false, group: '', order: 0 },
    { _id: 'line-2', description: 'Rédaction', detail: '', quantity: 1, unitPrice: 600, taxRate: 20, isOptional: true, group: '', order: 1 },
  ],
  selectedOptionalLineIds: [],
  specification: { content: '' },
  signature: { signedAt: null, signerName: '' },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/espace-client/projets/p1/propositions/q1']}>
      <Routes>
        <Route path="/espace-client/projets/:projectId/propositions/:proposalId" element={<ClientQuoteProposal />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(quotes.getProposal).mockResolvedValue({
    proposal,
    totals: { subtotal: 2000, taxTotal: 400, total: 2400 },
  })
})

describe('wizard de proposition', () => {
  it('affiche le total renvoyé par le serveur, jamais un calcul local', async () => {
    vi.mocked(quotes.saveSelection).mockResolvedValue({
      proposal: { ...proposal, selectedOptionalLineIds: ['line-2'] },
      totals: { subtotal: 2600, taxTotal: 520, total: 3120 },
    })
    renderPage()

    await screen.findByText('Refonte')
    await userEvent.click(screen.getByRole('button', { name: /options/i }))
    await userEvent.click(screen.getByLabelText(/Rédaction/))

    await waitFor(() => expect(screen.getByTestId('quote-total')).toHaveTextContent('3 120,00'))
  })

  it('bloque la signature tant qu’une question requise est vide', async () => {
    renderPage()
    await screen.findByText('Refonte')

    await userEvent.click(screen.getByRole('button', { name: /signature/i }))
    expect(screen.getByText(/question obligatoire/i)).toBeInTheDocument()
    expect(quotes.signProposal).not.toHaveBeenCalled()
  })

  it('ouvre une proposition signée en lecture seule', async () => {
    vi.mocked(quotes.getProposal).mockResolvedValue({
      proposal: { ...proposal, status: 'SIGNED', signature: { signedAt: '2026-07-26T10:00:00.000Z', signerName: 'Jean' } },
      totals: { subtotal: 2000, taxTotal: 400, total: 2400 },
    })
    renderPage()

    await screen.findByText(/signée par Jean/i)
    expect(screen.queryByRole('button', { name: /signer/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis la racine : `npx vitest run src/pages/espace-client/QuoteProposal.test.tsx`
Attendu : ÉCHEC — module `./QuoteProposal` introuvable.

- [ ] **Step 3: Écrire le composant**

Créer `src/pages/espace-client/QuoteProposal.tsx` :

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getProposal, saveAnswers, saveSelection, signProposal } from '../../services/quotes'
import type { QuoteProposal, QuoteTotals } from '../../types/quote.types'
import './ClientPortal.css'

type Step = 'cadrage' | 'options' | 'recapitulatif' | 'signature'

const STEPS: { key: Step; label: string }[] = [
  { key: 'cadrage', label: 'Cadrage' },
  { key: 'options', label: 'Options' },
  { key: 'recapitulatif', label: 'Récapitulatif' },
  { key: 'signature', label: 'Signature' },
]

const euros = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)

const ClientQuoteProposal = () => {
  const { projectId = '', proposalId = '' } = useParams()
  const [proposal, setProposal] = useState<QuoteProposal | null>(null)
  const [totals, setTotals] = useState<QuoteTotals | null>(null)
  const [step, setStep] = useState<Step>('cadrage')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [signerName, setSignerName] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [signedNumber, setSignedNumber] = useState('')

  useEffect(() => {
    getProposal(projectId, proposalId)
      .then(({ proposal: loaded, totals: loadedTotals }) => {
        setProposal(loaded)
        setTotals(loadedTotals)
        setAnswers(Object.fromEntries(loaded.answers.map((a) => [a.question, a.value])))
      })
      .catch((err: Error) => setError(err.message || 'Proposition indisponible'))
  }, [projectId, proposalId])

  const readOnly = proposal?.status !== 'SENT'

  const missingRequired = useMemo(() => {
    if (!proposal) return []
    return proposal.questions.filter((q) => q.required && !(answers[q._id] ?? '').trim())
  }, [proposal, answers])

  const persistAnswers = useCallback(async () => {
    if (!proposal || readOnly) return
    const payload = proposal.questions.map((q) => ({ question: q._id, value: answers[q._id] ?? '' }))
    const result = await saveAnswers(projectId, proposalId, payload)
    setProposal(result.proposal)
    setTotals(result.totals)
  }, [proposal, readOnly, answers, projectId, proposalId])

  const toggleOption = async (lineId: string) => {
    if (!proposal || readOnly) return
    const current = new Set(proposal.selectedOptionalLineIds)
    if (current.has(lineId)) current.delete(lineId)
    else current.add(lineId)
    const result = await saveSelection(projectId, proposalId, [...current])
    setProposal(result.proposal)
    setTotals(result.totals)
  }

  const goTo = async (next: Step) => {
    setError('')
    if (next === 'signature' && missingRequired.length > 0) {
      setStep('cadrage')
      setError('Répondez à chaque question obligatoire avant de signer.')
      return
    }
    if (step === 'cadrage' && !readOnly) await persistAnswers().catch(() => {})
    setStep(next)
  }

  const handleSign = async () => {
    setError('')
    try {
      const { billingDocument } = await signProposal(projectId, proposalId, signerName.trim())
      setSignedNumber(billingDocument.number)
      const refreshed = await getProposal(projectId, proposalId)
      setProposal(refreshed.proposal)
      setTotals(refreshed.totals)
    } catch (err) {
      setError((err as Error).message || 'Signature impossible')
    }
  }

  if (error && !proposal) return <div className="portal-container"><p>{error}</p></div>
  if (!proposal) return <div className="portal-container"><div className="portal-spinner" /></div>

  return (
    <div className="portal-container">
      <h1>{proposal.title}</h1>

      {proposal.status === 'SIGNED' && (
        <p role="status">
          Proposition signée par {proposal.signature.signerName} le{' '}
          {proposal.signature.signedAt ? new Date(proposal.signature.signedAt).toLocaleDateString('fr-FR') : ''}
          {signedNumber ? ` — devis ${signedNumber}` : ''}
        </p>
      )}
      {proposal.status === 'EXPIRED' && <p role="status">Cette proposition a expiré.</p>}

      <nav className="portal-list">
        {STEPS.map((entry) => (
          <button key={entry.key} type="button" onClick={() => goTo(entry.key)} aria-current={step === entry.key}>
            {entry.label}
          </button>
        ))}
      </nav>

      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      {step === 'cadrage' && (
        <section>
          {proposal.questions.map((question) => (
            <label key={question._id} className="portal-list">
              {question.label}
              {question.required && ' *'}
              <input
                className="portal-input"
                value={answers[question._id] ?? ''}
                disabled={readOnly}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [question._id]: e.target.value }))}
                onBlur={() => persistAnswers().catch(() => {})}
              />
            </label>
          ))}
          {missingRequired.length > 0 && <p>Il reste une question obligatoire sans réponse.</p>}
        </section>
      )}

      {step === 'options' && (
        <section>
          {proposal.lines.map((line) => (
            <div key={line._id}>
              {line.isOptional ? (
                <label>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={proposal.selectedOptionalLineIds.includes(line._id)}
                    onChange={() => toggleOption(line._id)}
                  />
                  {line.description} — {euros(line.unitPrice)}
                </label>
              ) : (
                <p>{line.description} — {euros(line.unitPrice)} (inclus)</p>
              )}
            </div>
          ))}
        </section>
      )}

      {step === 'recapitulatif' && (
        <section>
          <pre>{proposal.specification.content}</pre>
        </section>
      )}

      {step === 'signature' && !readOnly && (
        <section>
          <label>
            Nom du signataire
            <input className="portal-input" value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Je reconnais avoir pris connaissance du périmètre et du montant, et j’accepte cette proposition.
          </label>
          <button
            className="portal-button"
            type="button"
            disabled={!consent || signerName.trim().length < 2}
            onClick={handleSign}
          >
            Signer
          </button>
        </section>
      )}

      <p data-testid="quote-total">Total TTC : {totals ? euros(totals.total) : '—'}</p>
    </div>
  )
}

export default ClientQuoteProposal
```

- [ ] **Step 4: Déclarer la route**

Dans `src/App.tsx`, ajouter près des autres imports paresseux de l'espace client :

```tsx
const ClientQuoteProposal = lazy(() => import('./pages/espace-client/QuoteProposal'))
```

Puis, à l'intérieur du bloc `<Route path="/espace-client" …>`, à côté de `projets/:id` :

```tsx
<Route path="projets/:projectId/propositions/:proposalId" element={<ClientQuoteProposal />} />
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Depuis la racine : `npx vitest run src/pages/espace-client/QuoteProposal.test.tsx`
Attendu : SUCCÈS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/pages/espace-client/QuoteProposal.tsx src/pages/espace-client/QuoteProposal.test.tsx src/App.tsx
git commit -m "feat(devis): wizard client de proposition"
```

---

### Task 12: Vitrine facturation et points d'entrée

**Files:**
- Create: `src/pages/espace-client/Billing.tsx`
- Create: `src/pages/espace-client/Billing.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/espace-client/Dashboard.tsx`

**Interfaces:**
- Consumes: `listBillingDocuments`, `billingPdfUrl`, `listProposals` (tâche 10).
- Produces: le composant `ClientBilling`, monté sur `/espace-client/projets/:projectId/facturation`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/pages/espace-client/Billing.test.tsx` :

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as quotes from '../../services/quotes'
import ClientBilling from './Billing'

vi.mock('../../services/quotes')

beforeEach(() => vi.resetAllMocks())

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/espace-client/projets/p1/facturation']}>
      <Routes>
        <Route path="/espace-client/projets/:projectId/facturation" element={<ClientBilling />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('vitrine facturation', () => {
  it('liste les documents avec un lien de téléchargement', async () => {
    vi.mocked(quotes.listBillingDocuments).mockResolvedValue({
      documents: [
        { _id: 'd1', type: 'INVOICE', number: 'FAC-001', status: 'PAID', total: 1200, currency: 'EUR', issuedAt: '2026-07-01T00:00:00.000Z', dueAt: null },
      ],
    })
    vi.mocked(quotes.billingPdfUrl).mockReturnValue('/api/projects/p1/billing/d1/pdf')

    renderPage()

    expect(await screen.findByText('FAC-001')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /télécharger/i })).toHaveAttribute(
      'href',
      '/api/projects/p1/billing/d1/pdf',
    )
  })

  it('affiche un message quand il n’y a aucun document', async () => {
    vi.mocked(quotes.listBillingDocuments).mockResolvedValue({ documents: [] })
    renderPage()
    expect(await screen.findByText(/aucun document/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Depuis la racine : `npx vitest run src/pages/espace-client/Billing.test.tsx`
Attendu : ÉCHEC — module `./Billing` introuvable.

- [ ] **Step 3: Écrire le composant**

Créer `src/pages/espace-client/Billing.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { billingPdfUrl, listBillingDocuments } from '../../services/quotes'
import type { ClientBillingDocument } from '../../types/quote.types'
import './ClientPortal.css'

const euros = (value: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)

const TYPE_LABELS: Record<string, string> = { QUOTE: 'Devis', INVOICE: 'Facture' }

const ClientBilling = () => {
  const { projectId = '' } = useParams()
  const [documents, setDocuments] = useState<ClientBillingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listBillingDocuments(projectId)
      .then((data) => setDocuments(data.documents))
      .catch((err: Error) => setError(err.message || 'Chargement impossible'))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return <div className="portal-container"><div className="portal-spinner" /></div>
  if (error) return <div className="portal-container"><p>{error}</p></div>

  return (
    <div className="portal-container">
      <h1>Devis et factures</h1>
      {documents.length === 0 ? (
        <p>Aucun document disponible pour le moment.</p>
      ) : (
        <ul className="portal-list">
          {documents.map((document) => (
            <li key={document._id}>
              <strong>{document.number}</strong> — {TYPE_LABELS[document.type] ?? document.type} —{' '}
              {euros(document.total)}
              {document.issuedAt && ` — émis le ${new Date(document.issuedAt).toLocaleDateString('fr-FR')}`}
              <a href={billingPdfUrl(projectId, document._id)}>Télécharger</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ClientBilling
```

- [ ] **Step 4: Déclarer la route et le point d'entrée**

Dans `src/App.tsx`, ajouter l'import paresseux :

```tsx
const ClientBilling = lazy(() => import('./pages/espace-client/Billing'))
```

Puis, dans le bloc `<Route path="/espace-client" …>` :

```tsx
<Route path="projets/:projectId/facturation" element={<ClientBilling />} />
```

Dans `src/pages/espace-client/Dashboard.tsx`, à l'intérieur de la carte de chaque projet rendue par `filteredProjects.map(...)`, ajouter les deux liens :

```tsx
<Link to={`/espace-client/projets/${p._id}/facturation`}>Devis et factures</Link>
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Depuis la racine : `npx vitest run src/pages/espace-client/`
Attendu : SUCCÈS pour `Billing.test.tsx`, `QuoteProposal.test.tsx` et `ProjectInvitationAccept.test.tsx`.

- [ ] **Step 6: Vérifier typage, lint et suite complète**

Depuis la racine :
```bash
npm run typecheck && npx eslint src/pages/espace-client src/services/quotes.ts && npm run test:frontend
```
Attendu : aucune erreur, aucun échec nouveau.

- [ ] **Step 7: Commit**

```bash
git add src/pages/espace-client/Billing.tsx src/pages/espace-client/Billing.test.tsx src/App.tsx src/pages/espace-client/Dashboard.tsx
git commit -m "feat(devis): vitrine facturation et points d'entree du portail"
```

---

## Vérification finale

- [ ] Depuis la racine : `npm run typecheck:all`
- [ ] Depuis la racine : `npm run test:all`
- [ ] Attendu : aucun échec nouveau. Les échecs préexistants d'`education-routes` (Quickfind) et `permissions-ticket-scope` sont hors périmètre de ce plan et documentés dans l'audit du 2026-07-26.

## Hors périmètre

Conformément à la spec : aucun parcours public, aucune intégration eIDAS, aucun paiement en ligne, aucune modification de `BillingDocument`, `pdfBilling` ou du module comptable, pas de suivi de chantier enrichi, pas de versionnage des propositions. L'écran admin de construction des propositions (formulaire de lignes et de questions) n'est pas couvert : les routes admin de la tâche 9 sont pilotables à l'API en attendant, et l'interface fera l'objet d'un lot dédié.
