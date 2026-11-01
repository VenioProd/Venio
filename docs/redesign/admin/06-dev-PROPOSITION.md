# Dev tracker — vue d'ensemble + boîte à idées (proposition)

Maquettes : `06-dev-desktop.html`, `06-dev-tablette.html`, `06-dev-mobile.html` (mêmes composants, 3 gabarits).

## Principes
1. Vue d'ensemble actionnable : En revue / Bloqué / Sprint, chaque ligne porte son action (Approuver, Débloquer).
2. Une suggestion n'est pas une issue : elle vit dans sa propre collection, pour que les commerciaux n'encombrent pas le tracker. Elle ne devient `DevIssue` qu'à l'acceptation.
3. Soumission en moins de 30 s (titre + problème client obligatoires, le reste optionnel).
4. L'impact commercial (€ + niveau) pilote le tri ; les appuis (1 par utilisateur) servent de signal secondaire.
5. Le demandeur est toujours notifié (cloche + e-mail) à chaque changement de statut ; un refus exige un motif.
6. Sélection multiple identique sur suggestions et issues ; la suppression demande confirmation.
7. Rétro-compatible : aucune route ni scope existants ne change ; le routeur agent reste une extension.

## Modèle de données (nouveau) — `DevSuggestion`
| Champ | Type | Note |
|---|---|---|
| `title` | string ≤160 | requis |
| `problem` | string ≤4000 | requis (problème client) |
| `project` | ObjectId→DevProject \| null | plateforme/projet |
| `link` | `{ kind:'lead'\|'client', ref: ObjectId }` \| null | Lead / Client lié |
| `requester` | `{ user: ObjectId\|null, name: string }` | demandeur (externe ou agent : nom libre) |
| `impact` | `{ amountEur: number\|null, level: 'LOW'\|'MEDIUM'\|'HIGH'\|'CRITICAL' }` | tri par défaut |
| `status` | `NEW\|STUDIED\|ACCEPTED\|REJECTED` | |
| `rejectionReason` | string \| null | requis si REJECTED |
| `voters` | ObjectId[] (+ `voteCount` dénormalisé) | 1 appui / utilisateur |
| `issue` | ObjectId→DevIssue \| null | posé à la conversion |
| `source` | `{kind:'manual'\|'agent', name}` | comme DevIssue |
| `archivedAt` | Date \| null | |
| `statusHistory[]` | `{status, by, at, note}` | alimente la timeline |
Index : `{status, archivedAt, 'impact.amountEur':-1}`, `{project}`, `{'link.ref'}`.

## Flux suggestion → issue
1. Soumise (NEW) → notification aux membres `MANAGE_DEV` (et au lead du projet).
2. Étudiée (STUDIED) : estimation/commentaire optionnel → demandeur notifié.
3. Acceptée : `POST …/convert` crée une `DevIssue` (type FEATURE, backlog, `source.name='suggestion'`, description pré-remplie : problème, lead/client, impact, demandeur ; priorité déduite du niveau d'impact), pose `suggestion.issue`, statut ACCEPTED, demandeur notifié avec l'identifiant (ex. ARR-142). Idempotent (comme `promote` de la bêta) : 201 la 1re fois, 200 ensuite.
4. Refusée : motif obligatoire, visible du demandeur.
5. Quand l'issue passe DONE, le demandeur reçoit « livrée » (réutilise le hook existant de fin d'issue).

## Endpoints
Admin (`/api/admin/dev/suggestions`, permission `VIEW_DEV` en lecture, `MANAGE_DEV` en écriture ; les commerciaux n'ont que la création et l'appui via `POST` / `vote`) :
- `GET /suggestions?status&project&sort=impact|votes|recent&q` · `GET /suggestions/:id`
- `POST /suggestions` · `PATCH /suggestions/:id` (statut, motif, projet, lien, impact)
- `POST /suggestions/:id/vote` (bascule)
- `POST /suggestions/:id/convert` → DevIssue
- `POST /suggestions/bulk` `{ ids, action:'archive'|'delete'|'status'|'convert', status?, assignee? }`
- `POST /issues/bulk` `{ ids, action:'archive'|'delete'|'status'|'assign', … }` (nouveau, l'existant ne change pas)

Agent (`/api/v1/agent/dev/...`, `Idempotency-Key` sur les mutations, apparaissent dans l'OpenAPI par introspection) :
- `GET /dev/suggestions`, `GET /dev/suggestions/:id` — scope `read:dev`
- `POST /dev/suggestions` (créer), `PATCH /dev/suggestions/:id`, `POST /dev/suggestions/:id/vote`, `POST /dev/suggestions/:id/convert`, `POST /dev/suggestions/bulk`, `POST /dev/issues/bulk` — scope `write:dev`
Les tokens existants `read:dev`/`write:dev` y accèdent sans nouveau scope (pas d'accès retiré). Le champ `requester.name` permet à un agent de créer au nom d'un commercial.

## À trancher
- Les commerciaux externes peuvent-ils voir toutes les suggestions ou seulement les leurs ? (recommandé : voir tout + voter, éditer les leurs)
- Impact : montant libre + niveau, ou niveau seul ?
- Notification e-mail dès la v1 ou cloche seulement ?
