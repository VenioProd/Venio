# Design — File de travail commerciale dans le board CRM

**Date** : 2026-08-27
**Objectif** : donner au commercial une réponse à « que dois-je faire maintenant ? » sans quitter le
CRM, et faire enfin obéir les seuils d'alerte configurés dans `/admin/crm/settings` — dont quatre
des cinq réglages ne sont aujourd'hui lus par aucune ligne de code.

**Périmètre** : premier des quatre chantiers d'amélioration du CRM identifiés le 2026-08-27. Les
trois suivants (traçabilité des échanges, pilotage/funnel, chaîne lead → devis → CA) font l'objet de
specs distincts et ne sont pas couverts ici.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Emplacement | **Troisième mode du board CRM**, à côté de Tableau et Kanban. Écarté : une page dédiée `/admin/crm/aujourdhui` — ce serait une quatrième surface affichant les mêmes leads que le dashboard, le Centre d'activité et le board. Écarté aussi : enrichir le Centre d'activité, qui déséquilibrerait une page volontairement transversale. |
| Contenu | **Échéances + signaux de dérive** : quatre groupes — en retard, aujourd'hui, à venir 7 j, à ne pas laisser filer (froids et bloqués). Écarté : une file de rattrapage stricte (retards seuls), qui se vide quand tout va bien et ne remplace donc pas le board au quotidien. |
| Lieu du calcul | **Serveur**, dans `crmAutomations.ts`. Le calcul client aurait exigé d'exposer `/crm/settings` (réservé `MANAGE_CRM`) à une vue qui doit fonctionner en `VIEW_CRM`, et aurait dupliqué la logique de signaux entre le front et le scheduler. |
| Actions inline | Reporter, marquer contacté, changer le statut, ajouter une note. Écarté : l'envoi d'email depuis la file — l'envoi traçable relève du chantier traçabilité et serait à refaire. |
| Stockage des notes | **`LeadActivity` de type `NOTE`**, pas de concaténation dans `Lead.notes` ni `Lead.interactionNotes`. Première brique de la timeline du chantier suivant. |
| Nouvelles permissions | **Aucune.** Lecture `VIEW_CRM`, actions `MANAGE_CRM`, `scopeFilter` inchangé — comme le reste du board. |
| Migration | **Aucune.** Aucun champ ajouté au modèle `Lead`. |

## Le problème, vérifié dans le code

### Les réglages d'alerte ne pilotent rien

`CrmSettings` expose cinq réglages d'alerte et `/admin/crm/settings` affiche cinq contrôles pour les
piloter ([`crm-settings/AlertsSection.tsx`](../../../src/pages/admin/crm-settings/AlertsSection.tsx)).
Un seul est lu par le code.

| Réglage | Lu par | Effet réel |
|---|---|---|
| `coldLeadThresholdDays` | [`crmScheduler.ts:107`](../../../backend/src/lib/crmScheduler.ts) | Emails de relance uniquement |
| `coldLeadAlertEnabled` | — | **Aucun** |
| `overdueAlertEnabled` | — | **Aucun** |
| `staleLeadAlertEnabled` | — | **Aucun** |
| `staleLeadThresholdDays` | — | **Aucun** |

Les seuils sont écrits en dur à deux endroits : `7` et `14` dans
[`crm-board/constants.ts:58`](../../../src/pages/admin/crm-board/constants.ts) (badges du tableau et
du kanban) et dans [`admin/crm.ts:493`](../../../backend/src/routes/admin/crm.ts) (endpoint
`/alerts`). Un admin qui règle le seuil de froideur à 3 jours ne change donc rien à ce qu'il voit.

### `GET /crm/alerts` est mort

Aucun consommateur front — `grep -rn "crm/alerts" src/` ne retourne rien. L'endpoint hardcode ses
seuils, ignore les drapeaux `*Enabled`, et renvoie les documents `Lead` complets sans `.limit()`.

### Le Centre d'activité ne voit qu'un tiers du signal

[`getOverdueLeads`](../../../backend/src/routes/admin/activityCenter.ts) ne remonte que les
`nextActionAt` dépassés — ni les froids, ni les bloqués. Ses entrées pointent toutes vers
`/admin/crm` sans filtre, et la section plafonne à `DEFAULT_LIMIT = 5`. C'est un aperçu, pas une
file.

## Architecture

### Backend

**`buildWorklist(leads, settings, now)`** — nouveau, dans
[`crmAutomations.ts`](../../../backend/src/lib/crmAutomations.ts), à côté des helpers existants
`isNextActionOverdue()`, `isLeadCold(lead, days)` et `isLeadStale(lead, days)`, qui acceptent déjà
leur seuil en paramètre et n'attendent que de le recevoir depuis `CrmSettings`.

Retourne quatre groupes. Un lead n'apparaît qu'une fois, dans le premier groupe qui le réclame,
selon cet ordre de priorité :

| Groupe | Critère | Respecte |
|---|---|---|
| `overdue` | `nextActionAt` strictement avant le début du jour courant | `overdueAlertEnabled` |
| `today` | `nextActionAt` dans le jour courant | toujours actif |
| `upcoming` | `nextActionAt` dans les 7 jours suivants | toujours actif |
| `drifting` | froid **ou** bloqué, sans échéance qui l'ait déjà classé | `coldLeadAlertEnabled`, `staleLeadAlertEnabled` |

Règles communes : les leads `WON` et `LOST` sont exclus de tous les groupes. Un drapeau `*Enabled` à
`false` vide le groupe correspondant sans affecter les autres. « Aujourd'hui » se calcule sur les
bornes du jour civil local, pas sur un delta de 24 h — sinon une échéance de ce matin bascule en
retard selon l'heure de consultation.

Tri dans chaque groupe : `nextActionAt` croissant, puis priorité décroissante (URGENTE → BASSE),
puis `score` décroissant. Pas de score composite : un commercial doit pouvoir expliquer pourquoi une
ligne est au-dessus d'une autre.

**`GET /api/admin/crm/worklist`** — permission `VIEW_CRM`, `scopeFilter(req)` inchangé (un non
super-admin ne voit que les leads qu'il s'est vu assigner ou qu'il a créés). Charge les leads actifs
du scope, lit `CrmSettings`, renvoie :

```
{ groups: { overdue, today, upcoming, drifting }, thresholds: { coldDays, staleDays, coldEnabled, overdueEnabled, staleEnabled }, counts }
```

`thresholds` sert au front à afficher « Froid (12 j) » et à alimenter `getLeadAlerts` sans jamais
recalculer un seuil de son côté.

**`GET /api/admin/crm/alerts`** — **supprimé**. Aucun consommateur, seuils faux, pas de limite. Son
rôle est repris par `/worklist`. Le type front `CrmAlerts` disparaît avec lui.

**`POST /api/admin/crm/leads/:id/notes`** — permission `MANAGE_CRM`, scope vérifié comme sur le
`PATCH` existant. Corps `{ text }`, non vide, borné à 2000 caractères. Crée une `LeadActivity` de
type `NOTE`. Retourne l'activité créée.

**`getOverdueLeads`** du Centre d'activité réutilise `buildWorklist` : il cesse d'ignorer les seuils
et remonte désormais retards + dérives dans sa section CRM. Ses entrées pointent vers
`/admin/crm?mode=file`.

Reporter, marquer contacté et changer le statut passent par le `PATCH /leads/:id` existant, qui
accepte déjà `nextActionAt` et `lastContactAt`
([`normalizeLeadPayload`](../../../backend/src/routes/admin/crm.ts)) et déclenche les automatisations
de statut. Aucun endpoint d'action n'est ajouté.

### Frontend

**`getLeadAlerts(lead, thresholds)`** — la signature gagne les seuils, les constantes `7` et `14`
disparaissent de [`constants.ts`](../../../src/pages/admin/crm-board/constants.ts). Les badges du
tableau et du kanban obéissent enfin aux réglages. Les appelants existants sont
[`LeadCard.tsx`](../../../src/pages/admin/crm-board/LeadCard.tsx) et
[`LeadTableRow.tsx`](../../../src/pages/admin/crm-board/LeadTableRow.tsx).

**`crm-board/worklist/`** — nouveau dossier :

| Fichier | Rôle |
|---|---|
| `WorklistView.tsx` | Les quatre groupes, leurs en-têtes et compteurs, les états vide et chargement |
| `WorklistRow.tsx` | Une ligne : identité du lead, motif de présence, barre d'actions |
| `PostponeMenu.tsx` | +1 j / +3 j / +1 sem. / date au choix |
| `LogContactPanel.tsx` | Panneau « marquer contacté » |
| `types.ts` | `WorklistGroups`, `WorklistThresholds`, `WorklistResponse` |

[`index.tsx`](../../../src/pages/admin/crm-board/index.tsx) gagne le mode, l'appel réseau et les
handlers d'action — pas la logique de rendu. Il porte déjà 627 lignes et l'ensemble d'Arrow
Prospection.

Le mode est réglable par l'URL (`?mode=file`) pour que le Centre d'activité puisse y renvoyer.

## Les quatre gestes

**Reporter** — +1 j, +3 j, +1 sem. ou date au choix. `PATCH { nextActionAt }`.

**Marquer contacté** — panneau court, et c'est le geste central. Il écrit `lastContactAt` à
maintenant **et** repositionne `nextActionAt`, pré-rempli selon le statut du lead en réutilisant les
réglages existants `demoFollowUpDays` (DEMO) et `proposalFollowUpDays` (PROPOSAL), 3 jours ailleurs.
Sans cette reprogrammation, la ligne resterait en retard et reviendrait dans la file le lendemain :
la file ne se viderait jamais. Une note facultative accompagne le geste.

**Statut** — select inline, `PATCH { status }`, qui déclenche les automatisations de statut
existantes (rappel post-démo, rappel proposition, nettoyage à WON/LOST).

**Note** — texte court, `POST /leads/:id/notes`.

Chaque geste est journalisé : les trois premiers par la journalisation déjà en place dans le `PATCH`,
la note par sa propre `LeadActivity`.

## Erreurs et rechargement

Mise à jour optimiste locale, retour arrière visible et bandeau d'erreur si l'appel échoue. Le board
actuel avale ses erreurs dans des `catch {}` vides
([`index.tsx:69`](../../../src/pages/admin/crm-board/index.tsx) et suivants) ; la file ne reproduit
pas ce défaut.

Après une action réussie, seule la file est rechargée — pas le pipeline entier — pour que traiter dix
lignes ne déclenche pas dix rechargements complets du board.

## Tests

**Unitaires** — `buildWorklist` : classement dans le bon groupe, exclusion des `WON`/`LOST`, non
duplication d'un lead entre groupes, bascule sur seuil configuré (3 j au lieu de 7), `*Enabled` à
`false` qui vide son groupe sans toucher aux autres, bornes du jour civil (échéance à 23 h 59
aujourd'hui = `today`, à 00 h 01 aujourd'hui = `today` et non `overdue`), ordre de tri.

**Intégration** — `GET /worklist` : `VIEW_CRM` requis, scope respecté pour un non super-admin, seuils
de `CrmSettings` réellement appliqués. `POST /leads/:id/notes` : `MANAGE_CRM` requis, texte vide
refusé en 400, `LeadActivity` créée avec le bon `leadId` et le bon `actorId`.

**Front** — rendu des quatre groupes et de l'état vide, un aller-retour d'action (reporter → `PATCH`
émis → ligne retirée), et `getLeadAlerts` qui suit un seuil non standard.

## Limites assumées

- La file ne montre que les leads du scope de l'utilisateur. Un super-admin voit tout, sans bascule
  « mes leads / tous » : le board offre déjà un filtre par assignation.
- Les leads sans `nextActionAt` et sans dérive n'apparaissent nulle part dans la file. C'est
  volontaire — la file répond à « qu'est-ce qui m'attend », pas « qu'est-ce que je possède ».
- Pas de pagination : le volume actuel des leads ne la justifie pas, et `/crm/pipeline` charge déjà
  l'intégralité du scope sans limite. À revoir si le CRM dépasse quelques centaines de leads actifs.
- Aucun envoi d'email depuis la file, aucune timeline d'échanges : chantier traçabilité.
