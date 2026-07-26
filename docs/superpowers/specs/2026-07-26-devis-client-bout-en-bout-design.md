# Design — Devis client de bout en bout

**Date** : 2026-07-26
**Objectif** : permettre à un client connecté de recevoir une proposition commerciale, répondre
aux questions de cadrage, arbitrer les options, signer en ligne, puis télécharger son devis et
ses factures depuis l'espace client.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Public visé | Clients **déjà connectés**. Aucun parcours public/anonyme dans ce lot. |
| Modèle de prix | Venio prépare le devis. Le client arbitre uniquement les lignes **optionnelles**. Les prix sont visibles. |
| Cadrage projet | **Un seul parcours guidé** : questions → options → récapitulatif → signature. |
| Signature | **Signature simple maison** (consentement, horodatage, IP, user-agent, empreinte SHA-256 du PDF). Pas de prestataire eIDAS dans ce lot. |
| Périmètre | Devis de bout en bout, **vitrine facturation incluse**. Le suivi de chantier enrichi (jalons, timeline) fait l'objet d'une spec séparée. |

## Contexte : ce qui existe déjà

- [`BillingDocument`](../../../backend/src/models/BillingDocument.ts) gère `QUOTE` et `INVOICE`,
  avec numérotation, lignes, TVA, statuts et relances.
- [`pdfBilling.ts`](../../../backend/src/lib/pdfBilling.ts) produit un PDF **Factur-X**.
- Un devis accepté déclenche une écriture comptable (`createSaleEntryFromBilling`).
- `getNextSequence('quoteNumber')` consomme un numéro **dès la création** du document.
- **Aucune route client n'expose la facturation.** `/api/admin/billing` est derrière
  `VIEW_BILLING`. Un client ne voit aujourd'hui ni devis ni facture.

Ces deux derniers points fondent l'architecture retenue : `BillingDocument` est une pièce de
registre, pas un brouillon de négociation.

## Architecture

### Principe

Un nouvel objet **`QuoteProposal`** porte tout ce qui est mouvant et orienté client. Il ne
devient une pièce comptable qu'à la signature, où il **produit** un `BillingDocument`.

```
QuoteProposal (négociation, mutable)
    │  signature du client
    ▼
BillingDocument QUOTE (registre, figé)  →  PDF Factur-X  →  circuit comptable existant
```

`BillingDocument`, `pdfBilling` et le module comptable **ne sont pas modifiés**. Le lot n'ajoute
que des lectures scopées côté client.

### Modèle `QuoteProposal`

Fichier : `backend/src/models/QuoteProposal.ts`

| Champ | Type | Rôle |
|---|---|---|
| `project` | ref Project | Rattachement |
| `client` | ref User | Destinataire (redondant avec `project.client`, indexé pour les listes) |
| `title` | String | Intitulé commercial |
| `status` | enum | `DRAFT`, `SENT`, `SIGNED`, `EXPIRED`, `CANCELLED` |
| `expiresAt` | Date | Validité de l'offre |
| `intro` | String | Mot d'accompagnement |
| `questions[]` | sous-doc | `{ type, label, help, options[], required, order }` |
| `answers[]` | sous-doc | `{ question: ObjectId, value: String }` |
| `lines[]` | sous-doc | `{ description, detail, quantity, unitPrice, taxRate, isOptional, isSelectedByDefault, group, order }` |
| `selectedOptionalLineIds[]` | [ObjectId] | Arbitrage du client |
| `specification` | sous-doc | `{ content: String, updatedAt }` — cahier des charges en markdown |
| | | Généré par le serveur à partir des réponses (une section par question, puis le périmètre retenu), régénéré à chaque `PATCH /answers`, et éditable par l'admin tant que la proposition est en `DRAFT`. Une édition manuelle pose `specification.isManual` et suspend la régénération automatique, pour ne jamais écraser un texte rédigé à la main. |
| `signature` | sous-doc | `{ signedAt, signerUserId, signerName, signerEmail, ip, userAgent, consentText, documentHash, proofVersion }` |
| `billingDocument` | ref BillingDocument | `null` tant que non signé |
| `createdBy` | ref User | Auteur admin |

Types de question supportés : `text`, `longtext`, `choice`, `multichoice`, `boolean`, `number`.

Index : `{ project: 1, status: 1 }`, `{ client: 1, status: 1 }`.

### Machine à états

```
        admin envoie              client signe
DRAFT ──────────────► SENT ──────────────────► SIGNED
  │                    │
  │  admin annule      │  expiresAt dépassé
  ▼                    ▼
CANCELLED            EXPIRED
```

Règles :

- `DRAFT` n'est **jamais** exposé au client, sur aucune route.
- Le client ne peut muter `answers` et `selectedOptionalLineIds` **qu'en `SENT`**.
- `SIGNED` est **immuable** : aucune route, admin comprise, n'accepte de mutation. C'est ce qui
  donne sa valeur au `documentHash`.
- `EXPIRED` est calculé paresseusement à la lecture : une proposition `SENT` dont `expiresAt`
  est dépassé est basculée puis refusée à la signature.

### Calcul des totaux

Le client ne transmet **jamais** de montant, uniquement des identifiants de lignes optionnelles.
Le serveur recalcule systématiquement :

```
retenues   = lignes non optionnelles + lignes optionnelles dont l'id ∈ selectedOptionalLineIds
subtotal   = Σ (quantity × unitPrice)
taxTotal   = Σ (quantity × unitPrice × taxRate / 100)
total      = subtotal + taxTotal
```

Les identifiants inconnus ou correspondant à des lignes non optionnelles sont rejetés en 422,
plutôt qu'ignorés silencieusement — une sélection invalide traduit un bug ou une manipulation,
pas une intention.

Les montants sont stockés en euros décimaux, comme `BillingDocument` aujourd'hui. Les totaux
sont arrondis au centime à chaque étape pour éviter toute dérive d'affichage entre l'aperçu du
wizard et le PDF.

### Signature : déroulé et atomicité

Reprend le pattern déjà éprouvé pour les invitations projet
([`collaboration.ts`](../../../backend/src/routes/client/collaboration.ts)) : verrouiller par
prédicat d'état **avant** tout effet de bord.

1. Contrôles : le demandeur est le **propriétaire** du projet, la proposition est `SENT`, non
   expirée, et toutes les questions `required` ont une réponse non vide.
2. Verrou atomique : `findOneAndUpdate({ _id, status: 'SENT' }, { status: 'SIGNED', signature })`.
   Un second appel concurrent ne matche plus et reçoit un 409 — y compris depuis un autre
   processus.
3. Création du `BillingDocument` : `getNextSequence('quoteNumber', { prefix: 'DEV-' })`, type
   `QUOTE`, statut `ACCEPTED`, lignes = celles retenues, totaux recalculés côté serveur.
4. Génération du PDF via `generateBillingPdf`, puis `pdfStoragePath`.
5. `documentHash` = SHA-256 du PDF produit, écrit sur la proposition.
6. Création d'un `ProjectItem` de type `CAHIER_DES_CHARGES` portant la spécification figée.
7. `AuditLog` : `QUOTE_PROPOSAL_SIGNED`, avec IP et user-agent.

**Reprise sur échec.** Les étapes 3 à 6 suivent le verrou. Si l'une échoue, la proposition reste
`SIGNED` avec `billingDocument: null` — un état détectable. Une route admin
`POST /:id/rebuild-document`, idempotente, rejoue les étapes 3 à 6. On ne perd jamais le
consentement du client, qui est l'information juridiquement critique ; on peut toujours
reconstruire la pièce comptable.

Ce choix est délibéré : plutôt qu'une transaction Mongo (qui impose un replica set, absent de
l'environnement de test actuel), on rend l'échec partiel visible et rejouable.

### Journal de preuve

Réutilise `AuditLog`, déjà en place, avec trois nouvelles actions :
`QUOTE_PROPOSAL_VIEWED`, `QUOTE_PROPOSAL_SIGNED`, `QUOTE_PROPOSAL_EXPIRED`.

Le dossier de preuve d'une signature est donc : l'entrée `AuditLog` horodatée, le sous-document
`signature` immuable, et le PDF dont l'empreinte SHA-256 est scellée. `proofVersion` est fixé à
`1` pour permettre de faire évoluer le format sans réinterpréter les preuves anciennes.

## API

### Routes client

Nouveau routeur `backend/src/routes/client/quotes.ts`, monté sur `/api/projects` comme les
autres routeurs client. Toutes les routes exigent `role === 'CLIENT'` et passent par
`getProjectAccess`.

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| GET | `/:projectId/proposals` | tout accès projet | Liste (`SENT`, `SIGNED`, `EXPIRED` uniquement) |
| GET | `/:projectId/proposals/:id` | tout accès projet | Détail complet |
| PATCH | `/:projectId/proposals/:id/answers` | **OWNER** | Enregistre les réponses (autosave) |
| PATCH | `/:projectId/proposals/:id/selection` | **OWNER** | Enregistre l'arbitrage |
| POST | `/:projectId/proposals/:id/sign` | **OWNER** | Signe |
| GET | `/:projectId/billing` | tout accès projet | Devis et factures visibles |
| GET | `/:projectId/billing/:documentId/pdf` | tout accès projet | Téléchargement du PDF |

`DRAFT` et `CANCELLED` sont exclus de la liste comme du détail : une proposition annulée
disparaît de l'espace client plutôt que d'y rester barrée.

Les deux routes `PATCH` renvoient les **totaux recalculés** en plus de l'objet mis à jour. Le
navigateur affiche ce que le serveur lui répond, et ne calcule jamais de montant lui-même —
c'est ce qui garantit que l'aperçu du wizard et le PDF final ne peuvent pas diverger.

**Décision d'accès** : consulter est ouvert à tout membre du projet (propriétaire ou
collaborateur invité) ; **arbitrer et signer sont réservés au propriétaire**. Engager
financièrement l'entreprise cliente n'est pas une opération d'édition ordinaire — un `EDITOR`
invité ne doit pas pouvoir le faire.

**Filtrage de la vitrine facturation** : seuls les documents en `ISSUED`, `SENT`, `ACCEPTED` ou
`PAID` sont exposés. Les `DRAFT` et `CANCELLED` restent invisibles du client.

Un limiteur dédié protège `/sign` (10 tentatives / 15 min / IP), aligné sur le limiteur
d'acceptation d'invitation existant.

### Routes admin

Nouveau routeur `backend/src/routes/admin/quoteProposals.ts`, derrière
`requirePermission(PERMISSIONS.MANAGE_BILLING)`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/admin/quote-proposals?project=` | Liste, tous statuts |
| POST | `/api/admin/quote-proposals` | Crée un `DRAFT` |
| PATCH | `/api/admin/quote-proposals/:id` | Édite (refusé si `SIGNED`) |
| POST | `/api/admin/quote-proposals/:id/send` | `DRAFT` → `SENT` |
| POST | `/api/admin/quote-proposals/:id/cancel` | → `CANCELLED` |
| POST | `/api/admin/quote-proposals/:id/rebuild-document` | Reprise idempotente |

## Front

### Espace client

- **`src/pages/espace-client/QuoteProposal.tsx`** — wizard en quatre étapes :
  1. **Cadrage** — les questions, avec sauvegarde automatique à chaque champ quitté.
  2. **Options** — lignes obligatoires en lecture seule, optionnelles cochables, total recalculé
     par le serveur à chaque bascule (jamais côté navigateur).
  3. **Récapitulatif** — périmètre retenu, montants, cahier des charges généré.
  4. **Signature** — case de consentement explicite, saisie du nom, rappel de la valeur
     juridique, bouton de signature.
- **`src/pages/espace-client/Billing.tsx`** — devis et factures du client, statut, montant,
  échéance, téléchargement.
- Entrées ajoutées au tableau de bord client et au détail de projet.

Le wizard reprend le style Monolithe du portail (cf. spec du 2026-06-23). Un devis `SIGNED`
s'ouvre en lecture seule, avec la mention de la date de signature.

### Admin

Un onglet « Propositions » dans le détail de projet : construction des lignes (obligatoires et
optionnelles), des questions, prévisualisation du rendu client, envoi, et suivi de l'état.

## Gestion des erreurs

| Situation | Réponse |
|---|---|
| Proposition `DRAFT` demandée par un client | 404 — ne pas révéler son existence |
| Mutation d'une proposition `SIGNED` | 409 `PROPOSAL_ALREADY_SIGNED` |
| Signature d'une proposition expirée | 410 `PROPOSAL_EXPIRED` |
| Signature concurrente | 409 `PROPOSAL_ALREADY_SIGNED` |
| Signature par un non-propriétaire | 403 `OWNER_REQUIRED` |
| Question requise sans réponse | 422 avec la liste des identifiants manquants |
| Identifiant de ligne inconnu ou non optionnel | 422 `INVALID_LINE_SELECTION` |
| PDF absent au téléchargement | 404, sans exposer de chemin |

## Tests

**Backend** — `backend/src/__tests__/quote-proposal.test.ts` :

- Un `DRAFT` est invisible du client ; un `SENT` est visible.
- Un collaborateur invité consulte mais ne peut ni arbitrer ni signer.
- Un client étranger au projet reçoit 404.
- Les totaux sont recalculés côté serveur : un montant posté par le client est ignoré.
- Une sélection portant sur une ligne non optionnelle est rejetée.
- La signature refuse tant qu'une question requise est sans réponse.
- Deux signatures concurrentes : une seule aboutit, un seul `BillingDocument` est créé, un seul
  numéro de séquence consommé.
- Après signature, toute mutation est refusée.
- Une proposition expirée ne peut pas être signée.
- `rebuild-document` est idempotent et ne consomme pas de second numéro.
- La vitrine facturation masque les `DRAFT` et `CANCELLED`.

**Front** — `src/pages/espace-client/QuoteProposal.test.tsx` : navigation entre étapes, blocage
sur question requise manquante, affichage du total renvoyé par le serveur, mode lecture seule
après signature.

## Ce que ce lot ne fait pas

- Aucun parcours public ou anonyme.
- Aucune intégration eIDAS. Le module de signature reste néanmoins isolé dans
  `backend/src/lib/quoteSignature.ts`, ce qui laisse la porte ouverte.
- Aucun paiement en ligne.
- Aucune modification de `BillingDocument`, de `pdfBilling` ni du module comptable.
- Pas de suivi de chantier enrichi (jalons, timeline) : spec séparée.
- Pas de versionnage des propositions. Une proposition signée étant immuable, une renégociation
  passe par une nouvelle proposition.

## Dette connexe

L'audit du 2026-07-26 a laissé ouverts des points d'authentification indépendants de ce lot,
dont les tokens de réinitialisation stockés en mémoire dans `routes/auth.ts`. Ils ne bloquent
pas ce chantier mais devront être traités avant tout passage multi-instance.
