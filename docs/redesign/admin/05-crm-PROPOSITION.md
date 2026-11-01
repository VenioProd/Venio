# CRM enrichi — proposition (à valider avant implémentation)

Maquettes : `05-crm-desktop.html`, `05-crm-tablette.html`, `05-crm-mobile.html` (même page responsive, état initial propre à chaque format ; ancres `#auto`, `#journal`, `#regle`, `#fiche`, `#colonnes`). Tout ce qui est marqué **Nouveau** n'existe pas aujourd'hui.

## Principes
1. Une seule source de vérité : le tableau, le kanban et la fiche lisent le même `Lead` ; le tableau est la vue de travail, le kanban une autre présentation des mêmes filtres.
2. Colonnes configurables par vue ; une vue enregistrée = filtres + colonnes + tri + mode (privée ou équipe).
3. Valeur chiffrée partout : montant × probabilité = pondéré (probabilité par défaut selon l'étape, modifiable).
4. Moteur d'automatisation simple : déclencheur → conditions (ET/OU) → actions. Pas de code, journal complet, simulation avant activation.
5. Sûr par défaut : e-mail sortant soumis à validation humaine, anti-boucle, idempotence, plafond, limite par lead, suspension par lead.
6. Additif : aucune route ni scope retiré ; les 6 jobs `crm*` existants restent actifs tant que la règle équivalente n'est pas activée (sinon doublons).

## Champs ajoutés
**Lead** : `probability` (0-100), `expectedCloseAt`, `tags[]`, `linkedProject` (réf. Project, rempli à « Gagné »), `sourceDetail`, `utm{}`, `sector`, `companySize`, `nextActionLabel`, `nextActionType`, `lastInteractionAt` + `interactionsCount` (dénormalisés depuis Interaction ; `lastContactAt` reste), `archivedAt`, `automationPausedAt`. Calculés : `weightedAmount`, `daysInStage` (depuis `statusChangedAt`). Plateforme liée = `project` existant, rapprochée de `Subsidiary.leadProject`.
**Task / PersonalTask** et **Document** : `leadId` (réf. Lead, indexé).
**Nouveaux modèles** : `CrmView` (owner, name, scope PRIVATE|TEAM, filters, columns, sort, mode, pinned), `CrmRule` (name, enabled, status DRAFT|SIM|ACTIVE, system, trigger{type,params}, conditions{op,items[]}, actions[], limits{perLead,maxPerRun}, requireApproval), `CrmRuleRun` (rule, lead, eventKey unique, status OK|ERR|SKIP|SIM, steps[], durationMs ; TTL 90 j).
**Migration** : `probability` ← barème par statut (10/25/35/50/65/100/0), `lastInteractionAt` ← dernier Interaction, `archivedAt` ← leads archivés par `crmAutoArchiveLost`, règles système seedées (équivalents des jobs `crm*`, désactivées).

## Automatisations proposées
| Règle | Déclencheur | Actions |
|---|---|---|
| Relance 7 j sans activité | inactif ≥ 7 j (09:00) | tâche « Relancer {contact} » J+1, notification |
| Gagné → compte + projet | statut → WON | compte client, projet (modèle de la plateforme), liens, notification |
| Lead de formulaire | création, source formulaire | assignation round-robin par plateforme, accusé de réception, tâche « Qualifier sous 24 h » |
| Proposition sans réponse 5 j | inactif en PROPOSAL | e-mail de relance (validation), tâche d'appel |
| Lead chaud non traité 48 h | score ≥ 70 | alerte (ex-`crmHotLeadAlert`) |
| Perdu → archiver + relance 6 mois | statut → LOST | tag, archivage J+30, tâche J+180 |
Déclencheurs : lead créé, statut changé, assigné, inactif N j, action en retard, score franchi, interaction consignée, formulaire reçu. Actions : assigner, statut, champ/tag, tâche, notifier, e-mail, compte client, projet, archiver, webhook.

## Endpoints nouveaux (admin → agent, `/api/admin/crm/*` → `/api/v1/agent/crm/*`)
| Admin | Agent | Scope |
|---|---|---|
| GET/POST/PATCH/DELETE `/crm/views` | idem | read:crm / write:crm |
| POST `/crm/leads/bulk` `{ids≤200, action: assign\|status\|tag\|archive\|restore\|delete, payload}` | idem (delete exige `confirm:true`) | write:crm |
| GET `/crm/leads/export?columns=&format=csv` | idem | read:crm |
| GET `/crm/leads/:id/timeline`, `/tasks`, `/documents` | idem | read:crm |
| PATCH `/crm/leads/:id` (champs ajoutés) | PATCH `/crm/leads/:id` | write:crm |
| GET `/crm/rules/catalog` | idem | read:crm |
| GET/POST `/crm/rules`, GET/PATCH/DELETE `/crm/rules/:id` | idem | read:crm / write:crm |
| POST `/crm/rules/:id/simulate`, `/toggle` | idem | write:crm |
| GET `/crm/rules/runs`, POST `/crm/rules/runs/:id/retry` | idem | read:crm / write:crm |
Aucun nouveau scope : les tokens `read:crm`/`write:crm` existants gardent leur accès. Mutations avec `Idempotency-Key`, OpenAPI par introspection, tests vitest (bulk, vues, moteur, anti-boucle, idempotence, scopes).

## Points à trancher
1. E-mails automatiques : validation humaine par défaut (recommandé) ou envoi direct ?
2. Règles système : migrer les 6 jobs `crm*` en règles éditables (recommandé) ou les laisser tels quels ?
3. Une règle créée par un agent doit-elle être limitée à DRAFT/simulation jusqu'à activation par un humain ?
