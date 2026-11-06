# Architecture du CRM Venio

Vue technique du CRM tel qu'il est codé sur `main` (commit `2c764cb1`). Les automatisations (règles, planificateur, jobs, conversion) sont détaillées dans [CRM_AUTOMATISATIONS.md](./CRM_AUTOMATISATIONS.md). Chaque affirmation renvoie à son fichier, chemins relatifs à `backend/src/` sauf mention contraire.

---

## 1. Vue d'ensemble

```
 Fiche admin ─┐                              ┌─> LeadActivity (journal)
 Action groupée ─┤                           ├─> CrmRuleRun (journal des règles)
 API agent ───┼─> applyLeadChange ───────────┼─> Lead (écriture)
 Formulaire public ─┤  (lib/crmLeadService)  ├─> User CLIENT + Project (si WON)
 Espace commercial ─┤                        └─> notifications / e-mails
 Règles (actions) ───┘                              ▲
                                                    │ événements (emitLeadChanges)
 Planificateur (lib/crmScheduler, chaque minute) ───┤
 Jobs moteur (automation/jobs/crm*) ────────────────┘
```

Le **point d'entrée unique** des écritures de lead est `applyLeadChange` (`lib/crmLeadService.ts`). Les différences voulues entre canaux sont dans `SOURCE_POLICY` (même fichier). Exceptions connues : voir §7.

---

## 2. Modules

### 2.1 Services et logique (`lib/`)

| Fichier | Rôle |
|---|---|
| `crmLeadService.ts` | Point d'entrée unique : `applyLeadChange`, `createLead`, `deleteLeadCascade`, `normalizeLeadPatch`, `SOURCE_POLICY`, `LeadChangeError` |
| `crmDedup.ts`, `crmLeadMerge.ts` | Normalisation e-mail / téléphone / entreprise (champs `*Normalized` de `Lead`) ; fusion de deux leads (`mergeLeads`) |
| `crmLeadFields.ts` | Normalisation des champs enrichis (`normalizeEnrichedLeadFields`), dont `automationPaused` |
| `crmAutomations.ts` | Round-robin (`getRoundRobinAssignee`), journal (`logLeadActivity`), score, auto-qualification, doublons, file de travail (`buildWorklist`), projet issu d'un lead gagné |
| `crmClientConversion.ts` | Conversion WON idempotente : `processWonLead`, `ensureClientForWonLead`, `ensureProjectForWonLead` |
| `crmRules.ts` | Moteur de règles, règles prédéfinies (`SEED_RULES`), garde `isCoveredByActiveRule`, validation et rejeu |
| `crmScheduler.ts` | Planificateur (`runScheduledJobs`, `startScheduler`), tâches quotidiennes et hebdomadaires, verrous |
| `crmScope.ts` | Périmètre de lecture et d'écriture (`readsWholeCrm`, `writesWholeCrm`), `administersCrm`, `isAssignableCrmUser` |
| `crmBulkEmailGuard.ts` | Envoi groupé libre : retrait des destinataires « ne pas contacter » (`screenBulkRecipients`) et journal (`logBlockedRecipients`) |
| `crmProposalReminder.ts` | Seuil unique de relance de proposition (`proposalReminderDays`), partagé par le job et le planificateur |
| `crmPilotage.ts` | Calculs purs du pilotage (entonnoir, vitesses, groupes) : aucune écriture |
| `crmRevenue.ts` | Chiffre d'affaires rattaché aux leads (calculs purs, comme `crmPilotage.ts`) |
| `crmPrivacy.ts` | RGPD : opposition et liste de suppression (`checkProspectContact`), lien de désinscription signé, anonymisation (`anonymizeLead`), export des données (`buildPersonalDataExport`), migration 010 |
| `crmSequences.ts` | Séquences d'e-mails (lot 5) : validation, inscription et refus (`enrollLeads`), désinscription, moteur (`runSequenceTick`, `processEnrollment`), calendrier jours ouvrés / heure de Paris (`computeNextRunAt`, `isInSendWindow`), arrêts automatiques (`stopSequencesOnLeadChange`, `stopSequencesOnInboundInteraction`), statistiques, migration 011 |
| `crmRetention.ts` | Durée de conservation : sélection des leads à anonymiser (`runRetentionPurge`), simulation tant que la purge n'est pas activée |
| `permissions.ts` | Permissions par rôle (`view_crm`, `manage_crm`) et `ADMIN_ROLES` |
| `agent/scopes.ts` | Scopes agent (`read:crm`, `write:crm`, `admin:*`) |

### 2.2 Jobs du moteur (`automation/jobs/`)

| Fichier | Rôle |
|---|---|
| `crmParisTime.ts` | Heure de Paris : `parisParts`, `parisDateKey`, `parisWeekKey`, `parseHHMM`, `serverScheduleForParis` |
| `crmJobGuards.ts` | `crmJobAbstention` : abstention d'un job au profit de la règle active ou du planificateur |
| `crmLeadScope.ts` | Filtre `withActiveLeads` (hors archivés et automatisation suspendue) |
| `crmInactiveLeadFollowup.ts`, `crmPostDemoFollowup.ts`, `crmProposalFollowup.ts`, `crmHotLeadAlert.ts`, `crmAutoArchiveLost.ts`, `crmConversionDropAlert.ts`, `crmRetentionPurge.ts`, `crmSequences.ts` | Jobs CRM enregistrés par `automation/index.ts` |

### 2.3 Modèles (`models/`)

| Modèle | Rôle | Points clés |
|---|---|---|
| `Lead` | Prospect et pipeline | statuts `LEAD`, `QUALIFIED`, `CONTACTED`, `DEMO`, `PROPOSAL`, `WON`, `LOST` ; `score`, `probability`, `leadTemperature`, `lastContactAt`, `lastInteractionAt`, `statusChangedAt`, `nextActionAt`, `archivedAt`, `automationPausedAt`, `clientAccountId`, `tags`, `externalRep` ; RGPD : `consent` (`status`, `basis`, `source`, `at`), `doNotContact`, `doNotContactAt`, `doNotContactReason`, `anonymizedAt` |
| `SuppressionEntry` | Liste « ne pas contacter » globale | `emailNormalized` (unique), `reason` (`UNSUBSCRIBE`, `MANUAL`, `OPPOSITION`, `ANONYMIZED`), `createdBy`, `leadId` ; survit à l'anonymisation du lead |
| `LeadActivity` | Historique d'un lead | `type` est une chaîne libre ; valeurs écrites par le code : `CREATED`, `STATUS_CHANGE`, `ASSIGNED`, `ARCHIVED`, `RESTORED`, `CONVERTED`, `ESCALATION_REASSIGN`, et pour le RGPD `CONSENT_CHANGED`, `DO_NOT_CONTACT`, `DO_NOT_CONTACT_LIFTED`, `EMAIL_BLOCKED`, `ANONYMIZED` (`models/LeadActivity.ts`, `lib/crmLeadService.ts`, `lib/crmClientConversion.ts`, `lib/crmScheduler.ts`) |
| `CrmSettings` | Réglages (singleton) | `getSettings()`, `updateSettings()` ; liste complète dans CRM_AUTOMATISATIONS.md §2 |
| `CrmRule` | Règle d'automatisation | `status` `DRAFT`/`ACTIVE`/`PAUSED`, `systemKey`, `system`, `trigger`, `conditions`, `actions`, `limits`, `requireApproval`, `stats` |
| `CrmRuleRun` | Exécution d'une règle | `eventKey` **unique**, `steps`, `status` `OK`/`ERR`/`SKIP`/`SIM`/`PENDING`/`RUNNING` (`RUN_STATUSES`), TTL 90 jours sur `createdAt` |
| `CrmView` | Vue enregistrée | `scope` `PRIVATE`/`TEAM`, `filters`, `columns`, `sort`, `mode` `table`/`kanban`, `pinned` |
| `SchedulerLock` | Verrous et curseurs | un document par occurrence (clé `_id`), TTL sur `expiresAt` ; curseur `crm:round-robin` sans expiration |
| `Interaction` | Échanges (appels, e-mails) liés à un lead | `subjectType: 'LEAD'` ; purgé avec le lead |
| `PersonalTask` | Tâches personnelles | peut porter `leadId`, `ruleId` et `sequenceId` (tâche créée par une étape de séquence) ; purgées avec le lead |
| `CrmSequence` | Séquence d'e-mails (lot 5) | `name`, `entity` (optionnelle), `status` `DRAFT`/`ACTIVE`/`PAUSED`, `steps[]` (`type` `EMAIL`/`TASK`/`WAIT`, `delayDays`, `sendHourParis` 8–19, `subject`, `body`, `taskTitle`), `stopOn` (`reply`, `statusChange`, `statuses` défaut `WON`/`LOST`), `createdBy`, `activatedAt` |
| `CrmSequenceEnrollment` | Inscription d'un lead à une séquence | `sequence`, `lead`, `currentStep`, `status` `ACTIVE`/`COMPLETED`/`STOPPED`/`PAUSED`, `nextRunAt`, `stoppedReason`, `attempts`, `history[]` ; index `{status, nextRunAt}` ; `openKey` (posé tant que l'inscription est ouverte) sous index unique partiel : une inscription ouverte par couple séquence / lead ; supprimées avec le lead |

Modèles des types : `types/models/crm.ts`, `types/models/lead.ts`, `types/models/index.ts`.

---

## 3. Flux d'une écriture de lead

1. La route normalise le corps (`normalizeLeadPatch`) et contrôle le périmètre (`isLeadOutOfScope`, `administersCrm`).
2. `applyLeadChange(target, patch, { actor, source })` :
   - validation (motif de perte, assigné habilité) ;
   - transitions de statut et automatisations de statut ;
   - auto-qualification (si la politique le permet) ;
   - score (si activé) ;
   - sauvegarde du lead ;
   - journal (`LeadActivity`) ;
   - notifications selon `SOURCE_POLICY` ;
   - si WON : `processWonLead` (compte client et projet, une fois) ;
   - événements de règles via `emitLeadChanges` (sauf `emit: false`).
3. Les règles déclenchées passent par `fireLeadEvent` : filtre, conditions, limite par lead, `CrmRuleRun`, actions.

Pour le détail des effets et de l'anti-boucle, voir CRM_AUTOMATISATIONS.md §3 et §4.

---

## 4. Routes

Les routeurs sont montés dans `backend/src/index.ts` :

| Montage | Routeur |
|---|---|
| `/api/admin/crm` | `routes/admin/crmExtras.ts` (puis `routes/admin/crm.ts`) |
| `/api/v1/agent` (routes `/clients`, `/leads`) | `routes/agent/crm.ts` (via `routes/agent/index.ts`) |
| `/api/v1/agent/crm` | `routes/agent/crmExtras.ts` (via `routes/agent/index.ts`) |

`routes/crmExtras.ts` est une fabrique `createCrmExtrasRouter(adapters)` partagée par l'admin et l'agent : seules les gardes changent.

Route publique : `GET`/`POST /api/public/unsubscribe?token=…` (`routes/public/unsubscribe.ts`) — lien de désinscription signé des e-mails envoyés par les règles ; pose `doNotContact`, inscrit l'adresse dans la liste de suppression, page HTML de confirmation (audit `CRM_LEAD_UNSUBSCRIBE`).

### 4.0 Liste « ne pas contacter » — `routes/admin/crmSuppression.ts` (`/api/admin/crm/suppression`)

Montée avant `crmExtras` et `crm` dans `index.ts`. Écran : réglages CRM, section « Liste “ne pas contacter” » (`pages/admin/crm-settings/SuppressionSection.tsx`).

| Méthode | Chemin | Permission | Rôle |
|---|---|---|---|
| GET | `/?q=&page=&limit=` | `view_crm` | liste paginée (25 par défaut, 100 max, du plus récent au plus ancien) ; `q` : fragment d'adresse, insensible à la casse ; `canAdminister` indique si l'appelant peut modifier |
| POST | `/` | `manage_crm` + `administersCrm` | ajout manuel `{ email, reason: MANUAL (défaut) ou OPPOSITION }` ; 409 si l'adresse existe déjà ; audit `CRM_SUPPRESSION_ADD` |
| DELETE | `/:id` | `manage_crm` + `administersCrm` | retrait ; audit `CRM_SUPPRESSION_REMOVE` |

Retirer une adresse ne modifie **pas** `doNotContact` des leads : l'opposition posée sur une fiche reste en vigueur (rappelé dans l'interface). Les raisons `UNSUBSCRIBE` et `ANONYMIZED` ne s'ajoutent pas à la main.

Périmètre par entité : le super-admin renseigne `crmEntities` d'un membre dans la page d'édition (`pages/admin/AdminEdit.tsx`, cases Venio/Creatio/Decisio/Formatio/Arrow ; vide = toutes les entités) ; la liste des membres affiche un badge pour les membres restreints.

### 4.1 Admin — `routes/admin/crm.ts` (`/api/admin/crm`)

Toutes les routes exigent `auth` + `requireAdmin` et la permission indiquée.

| Méthode | Chemin | Permission | Rôle |
|---|---|---|---|
| GET | `/leads` | `view_crm` | liste des leads (périmètre) |
| GET | `/pipeline` | `view_crm` | leads groupés par statut |
| POST | `/leads` | `manage_crm` | création (`source: admin`) |
| PATCH | `/leads/:id` | `manage_crm` | modification |
| GET | `/leads/:id` | `view_crm` | fiche |
| DELETE | `/leads/:id` | `manage_crm` | suppression en cascade (`deleteLeadCascade`) |
| GET | `/leads/:id/activities` | `view_crm` | historique |
| GET | `/leads/:id/privacy` | `view_crm` (périmètre de lecture) | consentement, opposition, présence dans la liste de suppression |
| GET | `/leads/:id/personal-data` | `view_crm` + `administersCrm` | export JSON des données personnelles (audit `CRM_LEAD_PERSONAL_DATA_EXPORT`) |
| POST | `/leads/:id/anonymize` | `manage_crm` + `administersCrm` | anonymisation à la demande (audit `CRM_LEAD_ANONYMIZE`) |
| GET | `/leads/:id/revenue` | `view_crm` | chiffre d'affaires du lead |
| GET | `/leads/:id/project-candidates` | `view_crm` | projets rattachables |
| POST | `/leads/:id/projects/:projectId` | `manage_crm` + écriture sur le lead + projet lisible | rattachement à un projet |
| DELETE | `/leads/:id/projects/:projectId` | `manage_crm` + écriture sur le lead + projet lisible | détachement |
| GET | `/pilotage` | `view_crm` | indicateurs de pilotage |
| GET | `/forecast?months=&from=&entity=&userId=` | `view_crm` | prévision mensuelle (mois d'Europe/Paris de `expectedCloseAt`) : ouverts, brut, pondéré, catégories, réalisé, objectif |
| GET | `/goals?period=&from=&to=` | `view_crm` | objectifs mensuels (cachés : entités hors périmètre, objectifs personnels d'un collègue) |
| POST / PATCH / DELETE | `/goals`, `/goals/:id` | `manage_crm` + `administersCrm` | objectifs ; PATCH ne change que les cibles ; un administrateur restreint par entité reste dans ses entités |
| GET | `/worklist` | `view_crm` | file de travail + seuils effectifs |
| POST | `/leads/:id/convert-to-client` | `manage_crm` | conversion manuelle |
| GET | `/settings` | `manage_crm` | lecture des réglages |
| PATCH | `/settings` | `manage_crm` + `administersCrm` | modification des réglages |
| POST | `/check-duplicate` | `manage_crm` | recherche de doublons (champs normalisés, périmètre de lecture dans la requête) |
| POST | `/leads/:id/merge` | `manage_crm` + écriture sur les deux leads | fusion : `:id` (cible) absorbe `sourceId`, puis la source est supprimée (`lib/crmLeadMerge.ts`) |

### 4.2 Admin — `routes/crmExtras.ts` (monté sous `/api/admin/crm`)

Lecture : `auth` + `requireAdmin` + `view_crm`. Écriture : `auth` + `requireAdmin` + `manage_crm` (+ `idempotentRequest` sur les écritures). Gestion des règles : `administersCrm` (SUPER_ADMIN, ADMIN).

| Méthode | Chemin | Garde | Rôle |
|---|---|---|---|
| GET | `/views` | lecture | vues enregistrées |
| POST | `/views` | écriture | créer une vue |
| PATCH | `/views/:id` | écriture | modifier une vue |
| DELETE | `/views/:id` | écriture | supprimer une vue |
| POST | `/leads/bulk` | écriture | action groupée (`source: bulk`) |
| GET | `/leads/export` | lecture | export CSV (5000 lignes au plus, en-tête `X-Export-Truncated` si atteint ; audit `CRM_LEADS_EXPORT`) |
| GET | `/leads/:id/timeline` | lecture | fil de la fiche |
| GET | `/leads/:id/tasks` | lecture | tâches du lead |
| GET | `/leads/:id/documents` | lecture | documents du lead |
| GET | `/rules/catalog` | lecture | catalogue des déclencheurs, conditions, actions |
| GET | `/rules` | lecture | liste des règles |
| POST | `/rules` | `administersCrm` | créer (toujours en `DRAFT`) |
| GET | `/rules/runs` | lecture | journal des exécutions (`status`, pagination) |
| POST | `/rules/runs/:id/approve` | `administersCrm` | valider l'envoi d'un e-mail en attente |
| POST | `/rules/runs/:id/reject` | `administersCrm` | refuser |
| POST | `/rules/runs/:id/retry` | `administersCrm` | rejouer une exécution en erreur |
| GET | `/rules/:id` | lecture | détail |
| PATCH | `/rules/:id` | `administersCrm` | modifier ; activation réservée à `administersCrm` |
| DELETE | `/rules/:id` | `administersCrm` | supprimer |
| POST | `/rules/:id/simulate` | écriture | simulation (`record` pour journaliser en `SIM`) |

### 4.3 Agent — `routes/agent/crm.ts` (`/api/v1/agent`)

Garde : `requireScope('read:crm')` pour les GET, `requireScope('write:crm')` pour le reste.

| Méthode | Chemin | Scope | Rôle |
|---|---|---|---|
| GET | `/clients` | read:crm | liste des clients |
| GET | `/clients/:id` | read:crm | fiche client |
| POST | `/clients` | write:crm | créer un client |
| PATCH | `/clients/:id` | write:crm | modifier un client |
| GET | `/leads` | read:crm | liste des leads |
| GET | `/leads/:id` | read:crm | fiche lead |
| POST | `/leads` | write:crm | créer un lead (`source: agent`) |
| PATCH | `/leads/:id` | write:crm | modifier un lead (`source: agent`) |
| DELETE | `/leads/:id` | write:crm | supprimer |
| GET | `/clients/:id/contacts` | read:crm | contacts d'un client |
| POST | `/clients/:id/contacts` | write:crm | ajouter un contact |
| PATCH | `/clients/:id/contacts/:contactId` | write:crm | modifier un contact |
| DELETE | `/clients/:id/contacts/:contactId` | write:crm | supprimer un contact |
| GET | `/clients/:id/notes` | read:crm | notes d'un client |
| POST | `/clients/:id/notes` | write:crm | ajouter une note |
| DELETE | `/clients/:id/notes/:noteId` | write:crm | supprimer une note |
| GET | `/clients/:id/activities` | read:crm | activités d'un client |
| GET | `/leads/:id/activities` | read:crm | activités d'un lead |

Il n'existe **pas** de route `/leads/:id/notes` : la note de lead passe par `PATCH /leads/:id` (champ `notes`) ou par `interactionNotes`.

### 4.4 Agent — `routes/crmExtras.ts` (monté sous `/api/v1/agent/crm`)

Garde : `read:crm` pour les GET, `write:crm` pour le reste. Les vues appartiennent au créateur du token. Activer une règle exige le scope `admin:*`.

| Méthode | Chemin | Rôle |
|---|---|---|
| GET / POST | `/views` | vues |
| PATCH / DELETE | `/views/:id` | modifier, supprimer une vue |
| POST | `/leads/bulk` | action groupée |
| GET | `/leads/export` | export |
| GET | `/leads/:id/timeline`, `/tasks`, `/documents` | fiche du lead |
| GET | `/rules/catalog`, `/rules`, `/rules/runs`, `/rules/:id` | lecture des règles |
| POST | `/rules` | créer (brouillon) |
| PATCH / DELETE | `/rules/:id` | modifier, supprimer |
| POST | `/rules/:id/simulate` | simulation |
| POST | `/rules/runs/:id/approve`, `/reject`, `/retry` | validation des exécutions (voir §7) |

### 4.5 Séquences d'e-mails — `routes/crmSequences.ts` (monté par `crmExtras`, admin et agent)

Lecture : garde `read` (`view_crm` ; agent `read:crm`). Inscription : garde `write` (`manage_crm` ; agent `write:crm`) + périmètre d'écriture des leads (`writeScope`, un lead hors périmètre est refusé `NOT_FOUND`). Conception : `canAdministerSequences` (`administersCrm` côté admin, scope `admin:*` côté agent ; refusé si l'adaptateur ne le fournit pas).

| Méthode | Chemin | Garde | Rôle |
|---|---|---|---|
| GET | `/sequences` | lecture | liste + `stats` (inscrits, en cours, terminés, arrêtés par raison ; restreintes aux leads lisibles) + `canAdminister` |
| GET | `/sequences/:id` | lecture | détail + `stats` |
| POST | `/sequences` | conception | création, toujours en `DRAFT` |
| PATCH | `/sequences/:id` | conception | modification ; `status` `ACTIVE` (409 `EMPTY_SEQUENCE` sans étape), `PAUSED`, `DRAFT` |
| DELETE | `/sequences/:id` | conception | 409 `HAS_OPEN_ENROLLMENTS` tant que des leads sont inscrits |
| POST | `/sequences/:id/enroll` | écriture | `{ leadIds }` (200 au plus) → `enrolled[]`, `refused[] { leadId, reason }` |
| POST | `/sequences/:id/unenroll` | écriture | arrêt `MANUAL` des inscriptions ouvertes des leads donnés |
| GET | `/sequences/:id/enrollments?status=&page=&pageSize=` | lecture | inscriptions (leads lisibles seulement) |
| GET | `/leads/:id/sequences` | lecture | inscriptions d'un lead |

---

### Chiffre d'affaires, valeur pondérée, prévisions (chantier 3C)

Définitions uniques, documentées en tête de `lib/crmRevenue.ts` :

- **Valeur pondérée** d'un lead = budget × probabilité / 100, pour un lead ouvert (ni WON, ni LOST, ni archivé) avec un budget > 0, sinon 0. Probabilité du lead, à défaut celle de son étape (`STATUS_PROBABILITY`), à défaut 10. Utilisée par le pipeline du pilotage, la prévision et la colonne « Pondéré » de l'export CSV (`weightedOf` côté liste applique la même formule). Les taux observés de l'entonnoir restent affichés (`observedRate`) mais ne pondèrent plus rien.
- **Signé / encaissé** : devis acceptés (`BillingDocument` QUOTE) et factures payées des projets rattachés par `Project.sourceLead`, **plus** les devis `QuoteProposal` SIGNED rattachés au lead par `leadId` sans être déjà couverts (document de facturation déjà compté, ou projet rattaché au lead). Montant d'un devis sans projet : ses lignes (`computeQuoteTotals`, TTC).
- **Devises** : jamais additionnées. `revenue.signed/collected` = EUR ; `revenue.byCurrency` (et `byCurrency` de `/leads/:id/revenue`) rend un résumé par devise. Les budgets de leads n'ont pas de devise : EUR.
- **Prévision** : mois d'Europe/Paris ; réalisé = leads WON du mois par `statusChangedAt` (budget). Retards (clôture prévue avant la fenêtre) et affaires sans date sont rendus à part (`overdue`, `unscheduled`). Catégories : engagé ≥ 70, probable 40–69, pipeline < 40.
- **Objectifs** (`CrmGoal`, migration `009-crm-revenue`) : un par (mois, entité ou groupe, commercial ou équipe) ; la prévision joint l'objectif du périmètre exact demandé, jamais une somme d'autres objectifs.

## 5. Permissions et périmètre (résumé)

Détail par rôle dans CRM_AUTOMATISATIONS.md §8.

| Élément | Source |
|---|---|
| `view_crm` / `manage_crm` par rôle | `lib/permissions.ts` (`ROLE_PERMISSIONS`) |
| Lecture de tout le CRM : `SUPER_ADMIN`, `ADMIN`, `COMMERCIAL` | `lib/crmScope.ts` (`readsWholeCrm`) |
| Écriture sur tout le CRM : `SUPER_ADMIN`, `ADMIN` | `lib/crmScope.ts` (`writesWholeCrm`, `isLeadOutOfScope`) |
| Restriction par entité (`crmEntities`) : tous sauf `SUPER_ADMIN`, y compris `ADMIN` | `lib/crmScope.ts` (`crmEntityRestriction`) |
| Réglages et règles (administration du groupe) : `SUPER_ADMIN`, `ADMIN` | `lib/crmScope.ts` (`administersCrm`) |
| Assignables : rôles admin sauf `VIEWER` et `COMPTABLE` | `lib/crmScope.ts` (`CRM_ASSIGNABLE_ROLES`) |

---

## 6. Frontend (pour référence)

| Chemin | Rôle |
|---|---|
| `src/pages/admin/CrmBoard.tsx`, `src/pages/admin/crm-board/` | tableau, kanban, file de travail (`worklist/`), fiche, règles (`automations/`) |
| `src/pages/admin/crm-settings/` | réglages (`/admin/crm/settings`), importé par `src/App.tsx` |

Le front appelle les routes des sections 4.1 et 4.2.

---

## 7. Points d'attention

Constats issus du code à la date de rédaction. Ils ne sont pas corrigés ici.

| Sujet | Constat | Fichier |
|---|---|---|
| Validation des e-mails par agent | Le contrôle `administersRules` vaut `true` quand l'adaptateur n'en fournit pas : l'agent avec `write:crm` peut approuver, rejeter et rejouer les exécutions. Seule l'activation exige `admin:*`. | `routes/crmExtras.ts` (`administersRules`), `routes/agent/crmExtras.ts` (pas de `canAdministerRules`) |
| Envoi groupé libre | `POST /api/admin/email-composer/send` n'exige que `requireAdmin` (tout rôle d'admin, y compris `VIEWER`) ; les destinataires « ne pas contacter » sont retirés depuis le chantier 4A, mais aucune permission n'est contrôlée. | `routes/admin/emailComposer.ts` |

---

## 8. Tests et références

- Tests CRM dans `backend/src/__tests__/` : `crm-routes-admin-leads`, `crm-routes-agent-leads`, `crm-routes-scope`, `crm-extras-routes`, `crm-delete-cascade`, `crm-permissions-governance`, `crm-lead-service`, `crm-automation-unify`, `crm-rules-engine`, `crm-scheduler-lead-exclusion`, `crm-jobs-lead-exclusion`, `agent-crm-integration`, `agent-crm-extras-integration`.
- Lancer la suite : `docs/TESTS.md`.
- Migrations : `backend/scripts/migrations/004-crm-enrich.ts`, `005-crm-form-rule-source.ts`, `006-crm-post-demo-rule.ts`, `008-crm-dedup-normalized.ts` (détail dans CRM_AUTOMATISATIONS.md §10).
- Migrations : `backend/scripts/migrations/004-crm-enrich.ts`, `005-crm-form-rule-source.ts`, `006-crm-post-demo-rule.ts`, `009-crm-revenue.ts` (objectifs ; détail dans CRM_AUTOMATISATIONS.md §10).
- Tests du périmètre ADMIN, du rattachement de projet, de l'envoi groupé et du seuil de relance de proposition (chantier 4A) : `crm-admin-scope`.
- Tests RGPD : `crm-rgpd-privacy`, `crm-rgpd-rules`, `crm-rgpd-routes`, `crm-rgpd-retention`.
- Tests des séquences (lot 5) : `crm-sequences-engine` (calendrier, inscription, moteur, arrêts), `crm-sequences-routes` (droits, refus, agent).
- Migration `backend/scripts/migrations/011-crm-sequences.ts` (index des séquences ; logique `ensureSequenceIndexes`).
- Migrations : `backend/scripts/migrations/004-crm-enrich.ts`, `005-crm-form-rule-source.ts`, `006-crm-post-demo-rule.ts`, `010-crm-rgpd.ts` (détail dans CRM_AUTOMATISATIONS.md §10).
