# Design — Preuve des livrables attestés par une validation d'étape

**Date** : 2026-08-26
**Objectif** : rendre durable ce qu'atteste une validation client d'étape de production. Aujourd'hui
une `ProjectPhase` ne stocke que des **références** vers des `ProjectItem`, et les lectures
repopulent leur version courante : après validation, un admin peut modifier, masquer ou supprimer
les livrables que l'étape atteste. La mention « Validée par X le … » survit, mais ce que le client
a réellement examiné, non. Ce chantier fige la preuve (snapshot horodaté + empreinte) et rend
indestructibles les octets attestés, sans introduire de versionnement des livrables.

**Prérequis** : ce chantier s'applique par-dessus le pipeline d'étapes
([`2026-08-26-pipeline-etapes-design.md`](2026-08-26-pipeline-etapes-design.md), branche
`claude/nervous-bouman-403846`). Il n'est pas autonome.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Option retenue | **Snapshot scellé + immutabilité des octets attestés** : snapshot des métadonnées + empreinte SHA-256 au moment de la validation, et refus des deux seuls gestes qui détruisent les octets attestés (`DELETE` d'item, remplacement de fichier par `PATCH`). |
| Option écartée | **Versionnement des `ProjectItem`** : nouveau modèle, abandon du `unlink`, migration, volumétrie disque × N révisions, impact sur toutes les routes items. Disproportionné pour des jalons de production, et ne dispense pas du snapshot (il faudrait quand même figer *quelle* révision). Chantier séparé si le besoin apparaît. |
| Fenêtre de gel | **À la validation seule.** Le snapshot est pris au clic du client. Geler dès `EN_ATTENTE_VALIDATION` fermerait la fenêtre de substitution mais ajouterait un second état verrouillé et empêcherait l'admin de corriger un livrable pendant l'attente. Trou résiduel assumé, documenté § Limites assumées. |
| Soupape | **Purge tracée réservée au SUPER_ADMIN** (`?force=true` + motif obligatoire). Le snapshot reste en place, marqué « retiré le … par … » : la preuve devient explicitement incomplète plutôt que silencieusement vide. |
| Champ modifiable | Les champs **cosmétiques** d'un item attesté (`title`, `description`, `isVisible`, `status`, `order`, `section`) restent modifiables : le snapshot les conserve, la divergence est signalée. Seuls les octets sont verrouillés. |
| Nouvelles permissions | **Aucune.** Réutilisation de `VIEW_PHASES` / `EDIT_CONTENT` ; la purge ajoute un contrôle de rôle `SUPER_ADMIN`, pas une entrée `rbac-matrix.json`. |
| Migration | **Aucune.** La branche du pipeline d'étapes n'est pas mergée : aucune étape validée n'existe en base. Le rendu dégrade proprement si `attestedItems` est vide (§ Lecture). |

## Le problème, vérifié dans le code

`ProjectPhase.linkedItems` est un `[ObjectId ref 'ProjectItem']`
([`backend/src/models/ProjectPhase.ts`](../../../backend/src/models/ProjectPhase.ts)) et toutes les
lectures le repeuplent. Le pipeline interdit déjà de modifier `linkedItems` sur une étape validée
(`409 VALIDATED_PHASE_IMMUTABLE`), mais cette immutabilité porte sur **la liste**, pas sur **le
contenu** de ce qu'elle désigne.

| Geste | Route | Effet sur la preuve |
|---|---|---|
| `PATCH` avec un nouveau fichier | [`admin/projects/items.ts:205`](../../../backend/src/routes/admin/projects/items.ts) | `fs.unlinkSync` de l'ancien fichier — **octets attestés détruits**, irrécupérables |
| `DELETE` | [`admin/projects/items.ts:245`](../../../backend/src/routes/admin/projects/items.ts) | Item supprimé + fichier unlinké. `linkedItems` garde un ObjectId mort, et `populate` **retire silencieusement** l'entrée : l'étape validée affiche une liste amputée, sans signal |
| `DELETE` (API agent) | [`agent/projects.ts:537`](../../../backend/src/routes/agent/projects.ts) | Idem, sans même supprimer le fichier disque |
| `PATCH isVisible: false` | admin ou agent | Le `populate({ match: { isVisible: true } })` de [`client/projectPhases.ts`](../../../backend/src/routes/client/projectPhases.ts) fait disparaître le livrable de la vue client — **sans aucune suppression** |
| `PATCH title` / `description` / `content` / `url` | admin ou agent | Contenu attesté réécrit en place. Pour un item `NOTE` ou `LIEN`, c'est *tout* le livrable |

**Deux surfaces d'API, pas une** : l'API agent expose `PATCH` et `DELETE` sur les items. Le garde-fou
doit donc vivre dans un helper partagé. À noter : le `PATCH` agent refuse déjà l'upload de fichier
(`FILE_UPLOAD_NOT_SUPPORTED`), il ne peut donc pas détruire d'octets — seul son `DELETE` le peut.

## Ce qui existe et qu'on transpose : le `signatureSchema` de `QuoteProposal`

[`backend/src/models/QuoteProposal.ts`](../../../backend/src/models/QuoteProposal.ts) stocke déjà
`documentHash` et `proofVersion`. **Le pattern ne se transpose pas mécaniquement** : ce `documentHash`
est le SHA-256 d'un **PDF généré par le système et jamais réécrit**
([`lib/quoteSignature.ts:94`](../../../backend/src/lib/quoteSignature.ts)). Le hash *scelle* un
artefact déjà figé ; il ne le fige pas. Posé seul sur un `ProjectItem` mutable, il reproduirait la
moitié du pattern : on détecterait la substitution sans pouvoir restituer l'original.

Ce qu'on reprend :

1. **`proofVersion`** — versionnement du bloc de preuve, pour faire évoluer le format sans casser les
   preuves anciennes.
2. **La dénormalisation** de l'identité et du contexte dans le document au moment de la preuve
   (déjà appliquée par `validation.validatedByName`).
3. **Le principe** : *figer l'artefact, puis le sceller*. Ici, « figer » se fait par le snapshot pour
   les métadonnées et le contenu textuel, et par le verrou pour les octets ; le hash scelle.
4. **Le verrou par prédicat d'état** de `lockProposalForSignature`
   ([`lib/quoteSignature.ts:29`](../../../backend/src/lib/quoteSignature.ts)), appliqué ici à la
   validation d'étape (§ Écriture du snapshot).

## Modèle de données

### `ProjectPhase.validation` étendu

Fichier : `backend/src/models/ProjectPhase.ts`. Interfaces `IAttestedItem` (+ `IPhaseValidation`
étendue) dans `backend/src/types/models/project.ts`.

```ts
const attestedItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectItem', required: true },
    title: { type: String, default: '' },
    type: { type: String, default: '' },
    description: { type: String, default: '' },
    url: { type: String, default: '' },
    content: { type: String, default: '' },
    file: {
      originalName: { type: String, default: '' },
      mimeType: { type: String, default: '' },
      size: { type: Number, default: 0 },
    },
    isVisible: { type: Boolean, default: true },
    isDownloadable: { type: Boolean, default: true },
    status: { type: String, default: '' },
    contentHash: { type: String, default: '' },
    purgedAt: { type: Date, default: null },
    purgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    purgedByName: { type: String, default: '' },
    purgeReason: { type: String, default: '' },
  },
  { _id: false },
)
```

Ajouts au `validationSchema` existant :

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `attestedItems` | `[attestedItemSchema]` | `[]` | Snapshot des livrables au moment de la validation |
| `proofVersion` | Number | `1` | Format du bloc de preuve. `1` = SHA-256, snapshot des champs ci-dessus |

**`storagePath` n'est délibérément pas snapshoté** : il n'a aucune valeur probante, il rend la
sanitisation client fragile, et la re-vérification du hash lit le chemin de l'item vivant.

**Index** : `projectPhaseSchema.index({ 'validation.attestedItems.item': 1 })` — le verrou interroge
cet ensemble à chaque mutation d'item.

### Ce qui est snapshoté

**Tous** les `linkedItems`, y compris ceux à `isVisible: false`, avec leur drapeau tel qu'il était.
Le client n'a vu que les visibles : son rendu filtre le snapshot sur `isVisible === true`, ce qui
reproduit exactement sa vue. L'admin voit l'ensemble, avec la mention « non visible par le client au
moment de la validation ». Aucune perte d'information des deux côtés.

### Calcul de `contentHash`

Charge utile canonique, par ordre de priorité :

1. item avec `file.storagePath` → **octets du fichier**, hachés en **flux** (`fs.createReadStream`
   → `crypto.createHash('sha256')`), **séquentiellement** sur les items d'une étape. Un fichier fait
   jusqu'à 20 Mo ([`items.ts`](../../../backend/src/routes/admin/projects/items.ts), limite multer) ;
   un `Promise.all` sur `readFile` chargerait N × 20 Mo en mémoire dans la requête de validation ;
2. sinon `url` non vide → SHA-256 de `url` en UTF-8 ;
3. sinon `content` non vide → SHA-256 de `content` en UTF-8 ;
4. sinon → `contentHash: ''`.

Pour les items `NOTE`/`LIEN`, le hash fait doublon avec le snapshot qui contient déjà le contenu
verbatim : c'est voulu, la règle de vérification reste unique quel que soit le type.

**Un échec de hachage ne fait jamais échouer la validation.** Fichier absent ou illisible →
`contentHash: ''` et `logger.warn`. Le geste du client ne doit pas être bloqué par un problème de
stockage côté serveur. Un `contentHash` vide vaut « non vérifiable », jamais « modifié ».

## Écriture du snapshot

Route `POST /api/projects/:projectId/phases/:phaseId/validate`
([`client/projectPhases.ts`](../../../backend/src/routes/client/projectPhases.ts)). Séquence :

1. Garde-fous existants inchangés (`CLIENT`, `getProjectAccess`, `OWNER_REQUIRED`).
2. Charger l'étape **avec `linkedItems` peuplés sans `match`** (tous les items, visibles ou non).
   Le `findPhaseForUpdate` actuel charge sans populate précisément pour éviter qu'un `save()` après
   un populate filtré n'efface les items non visibles de `linkedItems` : cette précaution reste
   valable, on lit donc les items par une requête séparée `ProjectItem.find({ _id: { $in: … } })`
   plutôt qu'en peuplant le document qu'on va sauvegarder.
3. Refuser si `status !== 'EN_ATTENTE_VALIDATION'` (`409 INVALID_TRANSITION`).
4. Construire `attestedItems` (snapshot + hachage séquentiel).
5. **Écrire sous verrou par prédicat d'état** — remplace le `phase.save()` actuel :

```ts
const updated = await ProjectPhase.findOneAndUpdate(
  { _id: phaseId, project: projectId, status: 'EN_ATTENTE_VALIDATION' },
  { $set: { status: 'TERMINEE', validation: { …, attestedItems, proofVersion: 1 } } },
  { new: true },
)
if (!updated) return res.status(409).json({ error: '…', code: 'INVALID_TRANSITION' })
```

Le hachage prend du temps : sans ce verrou, deux validations concurrentes écriraient deux snapshots
successifs et la seconde identité écraserait la première. C'est un correctif ciblé du code que ce
chantier modifie, pas un élargissement de périmètre.

Notification et `logActivity` inchangés.

## Verrou des octets attestés

Nouveau helper `backend/src/lib/attestedItems.ts` :

```ts
/** Un item est « attesté » dès qu'une étape validée le référence dans son snapshot. */
export async function isItemAttested(projectId: string, itemId: string): Promise<boolean> {
  return Boolean(
    await ProjectPhase.exists({ project: projectId, 'validation.attestedItems.item': itemId }),
  )
}
```

Le prédicat porte sur `validation.attestedItems.item`, pas sur `linkedItems` : c'est exactement
l'ensemble de ce qui a été attesté, et c'est directement indexable.

Points d'application :

| Route | Règle |
|---|---|
| `PATCH /api/admin/projects/:projectId/items/:itemId` | Si item attesté **et** `req.file` présent → `409 { error, code: 'ITEM_ATTESTED' }`, **avant** toute écriture disque. Les autres champs passent normalement. |
| `DELETE /api/admin/projects/:projectId/items/:itemId` | Si item attesté → `409 ITEM_ATTESTED`, sauf purge forcée (§ ci-dessous). |
| `DELETE /api/v1/agent/projects/:id/items/:itemId` | Si item attesté → `respondError(res, 409, 'ITEM_ATTESTED', …)`. **Pas de purge forcée par l'API agent.** |
| `PATCH /api/v1/agent/projects/:id/items/:itemId` | Rien à faire : la route refuse déjà l'upload de fichier (`FILE_UPLOAD_NOT_SUPPORTED`). |
| `DELETE /api/v1/agent/projects/:id` (cascade projet) | **Non couvert, volontairement** : supprimer le projet supprime aussi ses étapes ; il ne reste aucune preuve à protéger. |

Sur le `PATCH` admin, multer a déjà écrit le fichier de remplacement sur disque quand le handler
s'exécute (§ Frictions connues) : le refus `ITEM_ATTESTED` doit donc **supprimer ce fichier fraîchement
uploadé** avant de répondre, sinon chaque tentative refusée laisse un orphelin dans `uploads/items`.

## Purge tracée (soupape)

`DELETE /api/admin/projects/:projectId/items/:itemId?force=true`, corps `{ reason }`.

| Condition | Réponse |
|---|---|
| `req.user.role !== 'SUPER_ADMIN'` | `403 { code: 'SUPER_ADMIN_REQUIRED' }` |
| `reason` vide après `trim` | `422 { code: 'REASON_REQUIRED' }` |
| Item non attesté | Le `?force=true` est ignoré : suppression normale |

Le motif circule dans le **corps**, pas dans l'URL : il peut nommer une personne (« données
personnelles de … ») et n'a rien à faire dans les logs d'accès.

Effet : suppression de l'item et de son fichier (comportement actuel), puis marquage de **chaque**
entrée de snapshot qui le référence, dans toutes les étapes validées du projet :

```ts
await ProjectPhase.updateMany(
  { project: projectId, 'validation.attestedItems.item': itemId },
  { $set: {
      'validation.attestedItems.$[entry].purgedAt': new Date(),
      'validation.attestedItems.$[entry].purgedBy': req.user!.id,
      'validation.attestedItems.$[entry].purgedByName': req.user!.name || '',
      'validation.attestedItems.$[entry].purgeReason': reason,
  } },
  { arrayFilters: [{ 'entry.item': new mongoose.Types.ObjectId(itemId) }] },
)
```

Puis `logActivity` avec la nouvelle action `PHASE_ATTESTED_ITEM_PURGED` (§ Traçabilité).

## Lecture et affichage

### État d'intégrité, calculé à la lecture

Chaque entrée de snapshot est servie avec un champ dérivé `integrity` :

| Valeur | Condition |
|---|---|
| `PURGED` | `purgedAt !== null`, **ou** l'item n'existe plus en base |
| `MODIFIED` | L'item existe et `item.updatedAt > validation.validatedAt` |
| `UNVERIFIABLE` | `contentHash === ''` (rien de hachable au moment de la validation, ou hachage en échec) |
| `INTACT` | Sinon |

`updatedAt` (le `timestamps: true` de `ProjectItem`) est le signal **gratuit** : tout `save()` le
bump, quel que soit le champ touché. Recalculer les hachages à chaque lecture de timeline serait
hors de proportion ; le hash sert à la vérification explicite (§ ci-dessous) et à la valeur probante
en cas de litige.

Avec le verrou en place, les octets d'un fichier attesté ne peuvent plus changer par l'API : un
`MODIFIED` sur un item fichier signale une modification **cosmétique** (titre, description,
visibilité). Pour un `NOTE`/`LIEN`, dont le `PATCH` reste ouvert, il peut signaler une réécriture du
contenu — le snapshot conserve alors la version attestée, qui est celle affichée.

### Client — `GET /api/projects/:projectId/phases`

Pour une étape **validée** (`validation.validatedAt !== null`) avec `attestedItems` non vide :

- `linkedItems` **n'est plus peuplé** ; la liste servie est `attestedItems` filtré sur
  `isVisible === true` (reproduction exacte de la vue au moment de la validation) ;
- les entrées purgées **restent listées** avec `integrity: 'PURGED'` — c'est tout l'objet du
  chantier : la liste ne rétrécit plus jamais en silence ;
- champs retirés côté client : `purgedBy`, `purgedByName`, `purgeReason` (motif interne), et
  `contentHash` (aucun usage client, bruit inutile). `purgedAt` **est** exposé : le client doit
  pouvoir constater le retrait.

Pour une étape non validée, ou validée avec `attestedItems` vide (preuve antérieure au déploiement) :
comportement actuel inchangé, `linkedItems` peuplé et filtré, aucun badge d'intégrité.

### Client — UI

[`src/pages/espace-client/ProjectDetail.tsx`](../../../src/pages/espace-client/ProjectDetail.tsx),
onglet `progress`. Sous une étape validée :

- rendu des livrables à partir du snapshot (titre, type, taille — les champs déjà attendus par
  `ItemCard`) ;
- `integrity: 'MODIFIED'` → mention **« Modifié depuis votre validation »** sous la carte ; le
  contenu affiché reste celui du snapshot ;
- `integrity: 'PURGED'` → carte grisée, **« Ce livrable a été retiré le {purgedAt} »**, aucun
  bouton de téléchargement ;
- `integrity: 'INTACT'` ou `'UNVERIFIABLE'` → rendu normal, téléchargement via la route existante
  `GET /api/projects/:projectId/items/:itemId/download`.

Pour un item `INTACT`, le téléchargement sert bien les octets attestés — c'est la garantie qu'apporte
le verrou.

### Admin

[`ProjectPhasesTab.tsx`](../../../src/pages/admin/project-detail/ProjectPhasesTab.tsx) : sous une
étape validée, la liste complète du snapshot (y compris les entrées `isVisible: false`, marquées
« non visible par le client au moment de la validation ») avec l'état d'intégrité, le motif et
l'auteur d'une purge, et un bouton **« Vérifier l'intégrité »**.

`GET /api/admin/projects/:projectId/phases/:phaseId/verify-integrity`
(permission `VIEW_PHASES`, pas de nouvelle permission) : recalcule les hachages des items encore
présents et renvoie
`{ results: [{ item, title, expectedHash, currentHash, matches: boolean | null }] }` — `null` quand
l'item est purgé ou le hash attendu vide. Route de lecture seule : aucune écriture, aucun
`ActivityLog` (une vérification n'est pas un événement du projet).

## Sécurité & traçabilité

- **Aucune nouvelle permission**, donc aucune modification de `rbac-matrix.json` ni de
  `backend/src/lib/permissions.ts`. Le verrou et la purge s'appliquent sur des routes déjà gardées
  par `EDIT_CONTENT` ; la purge ajoute un contrôle de rôle `SUPER_ADMIN` dans le corps de la route.
- **Nouvelle action `ActivityLog`** : `PHASE_ATTESTED_ITEM_PURGED`, à ajouter aux **deux** endroits
  (enum du modèle [`ActivityLog.ts`](../../../backend/src/models/ActivityLog.ts) et `ActivityAction`
  dans `backend/src/types/enums.ts`). `summary` : « Livrable "X" attesté par l'étape "Y" purgé par Z
  — motif : … ». **Non ajoutée à `clientVisibleActions`** : le motif est interne. Le client constate
  le retrait par le badge `PURGED`, pas par le fil d'activité.
- **Sanitisation client** : `sanitizePhase` retire `purgedBy`, `purgedByName`, `purgeReason` et
  `contentHash` de chaque entrée. `storagePath` n'étant jamais snapshoté, il n'y a rien à masquer.
- **Aucune donnée personnelle nouvelle** : le snapshot ne copie que des métadonnées de livrables déjà
  visibles par le client.

## Limites assumées

1. **Fenêtre `EN_ATTENTE_VALIDATION`.** Entre la demande de validation et le clic du client, l'admin
   peut encore modifier ou remplacer les livrables. Le snapshot atteste ce que le serveur servait au
   moment du clic, pas ce que le navigateur du client affichait s'il avait chargé la page plus tôt.
   Arbitrage retenu : le gel dès `EN_ATTENTE_VALIDATION` coûterait un second état verrouillé et
   empêcherait toute correction pendant l'attente.
2. **Modèle de menace limité à l'API.** Un accès direct à Mongo ou au disque contourne le verrou. Le
   `contentHash` est précisément le filet pour ce cas : il ne l'empêche pas, il le **détecte**.
3. **Contenu textuel modifiable.** Le `PATCH` d'un `NOTE`/`LIEN` attesté reste autorisé (aucun octet
   détruit, le snapshot conserve le contenu verbatim). La version attestée reste affichée ; la
   version courante diverge silencieusement pour les autres usages de l'item.
4. **Demandes de retouches non snapshotées.** Une demande de retouches porte sur un état des
   livrables qui n'est pas figé. Volontaire : l'enjeu probant est du côté de l'acceptation.

## Tests

Backend (vitest, patterns existants : `backend/src/__tests__/project-phases-client.test.ts`) :

1. **Snapshot à la validation** : une étape liant 3 items (dont un `isVisible: false`) → `attestedItems`
   contient les 3 entrées avec `title`/`type`/`isVisible` conformes et `proofVersion: 1`.
2. **Hachage** : item fichier → `contentHash` = SHA-256 des octets ; item `NOTE` → SHA-256 du
   `content` ; item `LIEN` → SHA-256 de l'`url` ; fichier absent du disque → `contentHash: ''` **et
   validation en succès** (200).
3. **Verrou** : sur un item attesté, `PATCH` avec fichier → `409 ITEM_ATTESTED` et l'ancien fichier
   toujours présent sur disque ; `PATCH` du seul `title` → `200` ; `DELETE` → `409` ; `DELETE` agent
   → `409 ITEM_ATTESTED`. Sur un item non attesté, les trois gestes restent autorisés.
4. **Purge** : `?force=true` par un ADMIN → `403 SUPER_ADMIN_REQUIRED` ; par un SUPER_ADMIN sans
   motif → `422 REASON_REQUIRED` ; avec motif → item supprimé, `purgedAt`/`purgedBy`/`purgeReason`
   renseignés sur l'entrée de snapshot, `ActivityLog` `PHASE_ATTESTED_ITEM_PURGED` écrit.
5. **La liste ne rétrécit plus** : après purge, le `GET` client de l'étape validée renvoie toujours
   3 entrées, dont une à `integrity: 'PURGED'` ; `purgeReason`, `purgedBy` et `contentHash` absents
   de la réponse client ; `purgedAt` présent.
6. **Divergence cosmétique** : après un `PATCH` du titre d'un item attesté, l'entrée passe
   `integrity: 'MODIFIED'` et le titre servi reste **celui du snapshot**.
7. **`verify-integrity`** : hachages concordants → `matches: true` ; après altération directe du
   fichier sur disque (hors API) → `matches: false` ; entrée purgée → `matches: null`.
8. **Concurrence** : deux `validate` simultanés sur la même étape → un seul `200`, l'autre
   `409 INVALID_TRANSITION`, un seul snapshot en base.
9. **Non-régression** : une étape non validée, et une étape validée à `attestedItems: []`, servent
   toujours `linkedItems` peuplés et filtrés `isVisible: true`, sans champ `integrity`.

Frontend (`src/test/`) : rendu client d'une étape validée — badges `MODIFIED` et `PURGED`, absence du
bouton de téléchargement sur une entrée purgée ; rendu admin — entrées `isVisible: false` marquées,
motif de purge affiché.

## Hors périmètre

- **Versionnement des `ProjectItem`** (option écartée, § Décisions de cadrage).
- **Gel des livrables pendant `EN_ATTENTE_VALIDATION`** (arbitré : non).
- **Snapshot lors d'une demande de retouches.**
- **Purge par l'API agent** : l'agent peut refuser, jamais forcer.
- **Migration rétroactive** : sans objet, aucune étape validée n'existe en base.
- **Rouvrir ou invalider une étape déjà validée** : reste hors périmètre, comme dans le chantier
  pipeline d'étapes.
- **Resynchronisation complète de l'enum du modèle `Notification`** : friction connue du chantier
  pipeline, sans lien avec ce lot (aucune nouvelle notification ici).

## Frictions connues du code existant

1. **`DELETE` agent d'un item ne supprime pas le fichier disque**
   ([`agent/projects.ts:550`](../../../backend/src/routes/agent/projects.ts)), contrairement à la
   route admin : chaque suppression par agent laisse un orphelin dans `uploads/items`. Sans effet sur
   ce chantier (le verrou refuse la suppression avant d'y arriver), mais à corriger ailleurs.
2. **Le `PATCH` admin traite le fichier avant toute validation métier** : multer a déjà écrit le
   nouveau fichier sur disque quand le handler s'exécute. Le refus `ITEM_ATTESTED` doit donc être posé
   dans le handler **et** supprimer le fichier fraîchement uploadé, ou passer par un `fileFilter`
   conscient de la route. La spec retient la première option, plus simple et locale.
