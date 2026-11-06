# Automatisations du CRM Venio

Ce document décrit les automatisations **telles qu'elles sont codées** sur `main` (commit `2c764cb1`, lots 1 et 2 en production). Chaque affirmation renvoie au fichier source. Pour l'architecture générale, les modèles et la liste complète des routes, voir [CRM_ARCHITECTURE.md](./CRM_ARCHITECTURE.md).

---

## 1. Principe : une source par comportement

Trois mécanismes peuvent relancer un lead : le **planificateur CRM**, les **jobs du moteur d'automatisations** et les **règles CRM** (`CrmRule`). Pour un même comportement, une seule source agit, dans cet ordre :

1. la **règle prédéfinie** correspondante, si elle est `ACTIVE` ;
2. sinon le **planificateur**, si son réglage est activé ;
3. sinon le **job** du moteur.

Source : table de correspondance en tête de `backend/src/lib/crmScheduler.ts`, garde `isCoveredByActiveRule` dans `backend/src/lib/crmRules.ts`, abstention des jobs dans `backend/src/automation/jobs/crmJobGuards.ts`.

Les règles ne consultent jamais les tâches : l'inverse seul est vrai.

---

## 2. Réglages (`CrmSettings`)

Document singleton, lu par `CrmSettings.getSettings()` (`backend/src/models/CrmSettings.ts`). Modifiable par `PATCH /api/admin/crm/settings`, réservé à `SUPER_ADMIN` et `ADMIN` (`administersCrm`, `backend/src/routes/admin/crm.ts`). L'écran est `/admin/crm/settings` (`src/pages/admin/crm-settings/`).

### 2.1 Réglages qui pilotent les automatisations de lead

| Réglage | Défaut | Effet | Où c'est appliqué |
|---|---|---|---|
| `roundRobinEnabled` | `true` | Attribution tournante | `crmAutomations.ts` (`getRoundRobinAssignee`) |
| `autoQualifyEnabled` | `true` | LEAD → QUALIFIED (budget > 0 et source renseignés) | `crmLeadService.ts` (`applyLeadChange`) |
| `autoLastContactOnContacted` | `true` | Pose `lastContactAt` à l'arrivée en CONTACTED | `crmLeadService.ts` (`applyStatusAutomations`) |
| `autoNextActionOnDemo` / `demoFollowUpDays` | `true` / `1` | Pose `nextActionAt` à J+n à l'arrivée en DEMO | idem |
| `autoNextActionOnProposal` / `proposalFollowUpDays` | `true` / `3` | Pose `nextActionAt` à J+n à l'arrivée en PROPOSAL | idem |
| `clearNextActionOnClose` | `true` | Vide `nextActionAt` à WON / LOST | idem |
| `emailOnAssignment` | `true` | E-mail au commercial nouvellement assigné (canal `admin` seulement) | `crmLeadService.ts` |
| `activityLogging` | `true` | Journalise création, statut, assignation, archivage, conversion | `crmLeadService.ts`, `crmClientConversion.ts` |
| `scoringEnabled` / `scoringWeights` | `false` / voir §2.3 | Calcule `score` à chaque écriture | `crmAutomations.ts` (`calculateLeadScore`) |
| `duplicateDetectionEnabled`, `duplicateCheckEmail`, `duplicateCheckCompany` (`true`), `duplicateCheckPhone` (`false`), `duplicateBlockOnCreate` (`false`) | voir colonne | Détection de doublons : égalité exacte sur les champs normalisés `contactEmailNormalized`, `contactPhoneNormalized`, `companyNormalized` (`lib/crmDedup.ts`, migration 008). À la création admin et agent : doublons renvoyés dans `duplicates` (409 `DUPLICATE_LEAD` si `duplicateBlockOnCreate`) ; formulaire public : jamais refusé, activité `POSSIBLE_DUPLICATE` | `crmAutomations.ts` (`checkDuplicateLead`), `POST /api/admin/crm/check-duplicate`, `routes/admin/crm.ts`, `routes/agent/crm.ts`, `routes/public/contact.ts`, `routes/commercial/index.ts` |
| `lostReasons` | `Prix`, `Délai`, `Concurrent`, `Sans réponse`, `Hors cible`, `Projet annulé` | Liste fermée des motifs de perte | `crmLeadService.ts` (`assertLostReason`) |
| `defaultCloserId` | `null` | Destinataire des dossiers « prêts à closer » (vide : super-admins) | `models/CrmSettings.ts` |

### 2.2 Réglages des tâches planifiées

| Réglage | Défaut | Tâche concernée |
|---|---|---|
| `coldLeadEmailEnabled` / `coldLeadThresholdDays` | `false` / `7` | E-mail « leads froids » (`processColdLeads`) |
| `dailyOverdueEmailEnabled` / `dailyOverdueEmailTime` | `false` / `08:00` | E-mail « actions en retard » (`processOverdueActions`) et heure de la série quotidienne |
| `escalationEnabled` / `escalationThresholdDays` / `escalationAction` / `escalationManagerId` | `false` / `10` / `NOTIFY_MANAGER` / `null` | Escalade (`processEscalations`) |
| `proposalReminderEnabled` / `proposalReminderDays` | `false` / `7` | Rappel de proposition (`processProposalReminders`) |
| `weeklyReportEnabled`, `weeklyReportDay` (0 = dimanche), `weeklyReportTime`, `weeklyReportRecipients` | `false`, `1`, `09:00`, `[]` | Rapport hebdomadaire (`processWeeklyReport`) |
| `invoiceRemindersEnabled` / `invoiceReminderDays` | `true` / `7` | Relances de factures (`processInvoiceReminders`) |
| `taskRemindersEnabled` | `true` | Rappels d'échéance de tâches (`processTaskDeadlineReminders`) |
| `projectNotificationsEnabled` | `true` | Alertes d'échéance de projet (`processProjectDeadlineAlerts`) |
| `briefRemindersEnabled` | `true` | Rappels d'échéance de brief (`processBriefDeadlineReminders`) |
| `clientHealthAutoUpdate` | `true` | Mise à jour automatique de la santé client (`processClientHealthAutoUpdate`) |

Les tâches `processOverdueTasks` (tâches en retard) et `processLeadFollowUps` (relances à effectuer) n'ont pas de réglage propre : elles tournent toujours (`backend/src/lib/crmScheduler.ts`).

### 2.2 bis Données personnelles (RGPD)

| Réglage | Défaut | Effet | Où c'est appliqué |
|---|---|---|---|
| `retentionMonths` | `36` (6 à 120) | Durée sans interaction ni modification au-delà de laquelle un lead non gagné est anonymisé | `lib/crmRetention.ts` |
| `retentionPurgeEnabled` | `false` | Faux : le job `crm.retention_purge` ne fait que compter (simulation). Vrai : il anonymise | idem |

### 2.3 Pondérations du score (défaut)

| Critère | Points |
|---|---|
| Budget > 10 000 € (`budgetHigh`) | 30 |
| Budget 1 000 – 10 000 € (`budgetMedium`) | 15 |
| Budget < 1 000 € (`budgetLow`) | 5 |
| Source recommandation / publicité / autre | 25 / 15 / 10 |
| Priorité urgente / haute / normale | 20 / 15 / 5 |
| E-mail / téléphone renseigné | 10 / 10 |

### 2.4 Alertes de la file de travail

`coldLeadAlertEnabled`, `coldLeadThresholdDays` (7), `overdueAlertEnabled`, `staleLeadAlertEnabled`, `staleLeadThresholdDays` (14) ne déclenchent aucun envoi. Ils servent les badges de la file (`buildWorklist`, `backend/src/lib/crmAutomations.ts`) et sont distribués à l'interface par `GET /api/admin/crm/worklist`.

---

## 3. Point d'entrée unique : `applyLeadChange`

Toute modification de lead passe par `applyLeadChange` (`backend/src/lib/crmLeadService.ts`) : fiche admin, action groupée, API agent, formulaire public, règles, planificateur et archivage automatique. Une même modification produit donc partout les mêmes effets : historique des statuts, automatisations de statut, score, conversion d'un lead gagné, événements de règles.

### 3.1 Politique par canal (`SOURCE_POLICY`)

| Source (`LeadChangeSource`) | Appelant (fichier) | Auto-qualification | E-mail d'assignation | Notification de statut |
|---|---|---|---|---|
| `admin` | fiche (`routes/admin/crm.ts`) | oui | oui | oui |
| `agent` | API agent (`routes/agent/crm.ts`) | oui | non | oui |
| `form` | formulaire public (`routes/public/contact.ts`) | oui | non | non |
| `bulk` | action groupée (`routes/crmExtras.ts`), espace commercial (`routes/commercial/index.ts`) | non | non | non |
| `rule` | actions `SET_STATUS`, `ASSIGN`, `SET_FIELD`, `ADD_TAG`, `ARCHIVE` (`lib/crmRules.ts`) | non | non | non |
| `scheduler` | escalade, archivage des perdus | non | non | non |

Motif donné dans le code : une action groupée ou une règle ne doit pas produire 200 messages pour 200 leads ; une règle garde la main sur ses propres notifications.

### 3.2 Effets appliqués à chaque écriture

1. **Validation** avant écriture : motif de perte dans la liste fermée, assigné actif et habilité (`CRM_ASSIGNABLE_ROLES`). Erreur `LeadChangeError` (400) ou 404.
2. **Transition de statut** : enregistrée dans `transitions`, puis `statusChangedAt` mis à jour et automatisations de statut appliquées (voir §2.1).
3. **Auto-qualification** si la politique l'autorise, le réglage est actif, le lead est en LEAD et `shouldAutoQualify` est vrai (budget > 0 et source renseignée).
4. **Score** recalculé si `scoringEnabled`.
5. **Historique** (`LeadActivity`) : `CREATED`, `STATUS_CHANGE` (toujours consigné, même si `activityLogging` est coupé), `ASSIGNED`, `ARCHIVED` / `RESTORED`.
6. **Notifications** : e-mail d'assignation (`notifyAssignment`) ; notification au créateur et à l'assigné à chaque changement de statut hors WON ; notification `CRM_LEAD_CONVERTED` aux super-admins à la première passe en WON.
7. **Conversion WON** : `processWonLead` (§6).
8. **Événements de règles** émis via `emitLeadChanges` (sauf si `emit: false`).

---

## 4. Moteur de règles (`CrmRule`)

Code : `backend/src/lib/crmRules.ts` ; modèles `models/CrmRule.ts` et `models/CrmRuleRun.ts` ; routes `routes/crmExtras.ts` (§8).

### 4.1 Vocabulaire

| Élément | Valeurs (source) |
|---|---|
| Déclencheurs | `LEAD_CREATED`, `STATUS_CHANGED`, `LEAD_ASSIGNED`, `INTERACTION_LOGGED` (événements) ; `LEAD_INACTIVE`, `ACTION_OVERDUE`, `SCORE_AT_LEAST` (balayage quotidien) — `models/CrmRule.ts` |
| Conditions (champs) | `status`, `project`, `source`, `budget`, `probability`, `leadTemperature`, `score`, `tags`, `assignedTo`, `externalRep`, `daysSinceActivity`, `daysInStage`, `archived` |
| Opérateurs | `eq`, `neq`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `contains`, `empty`, `notEmpty` ; groupe `AND` ou `OR` |
| Actions | `CREATE_TASK`, `NOTIFY`, `ASSIGN`, `SET_STATUS`, `ADD_TAG`, `SET_FIELD`, `SEND_EMAIL`, `CREATE_CLIENT`, `CREATE_PROJECT`, `ARCHIVE` |
| Champs modifiables (`SET_FIELD`) | `priority`, `leadTemperature`, `probability`, `nextActionLabel`, `sector` |
| Statuts d'une règle | `DRAFT` (défaut), `ACTIVE`, `PAUSED` |
| Limites | `perLead` : `ONCE`, `DAYS` (défaut), `NONE` ; `days` (1–365, défaut 7) ; `maxPerRun` (1–500, défaut 50) |

Modèles de texte : `{contact}`, `{company}`, `{amount}` (`renderTemplate`).

### 4.2 Cycle d'exécution

- **Filtre** : déclencheur (`matchesTrigger`), puis conditions (`evaluateConditions`).
- **Lead ignoré** s'il est archivé ou si `automationPausedAt` est posé (`fireLeadEvent`, `candidatesFor`).
- **Limite par lead** (`throttled`) : une exécution `OK`, `PENDING`, `RUNNING` ou `ERR` existante dans la fenêtre bloque la suivante.
- **Journal** : une `CrmRuleRun` par exécution, avec une étape par action (`OK`, `SKIP`, `PENDING`, `ERR`). Une action en `ERR` interrompt la liste d'actions. Pendant le balayage quotidien, un lead bloqué par la limite par lead n'écrit pas de ligne `SKIP` (`quietSkip`).
- **Statistiques** : `stats.runs`, `stats.ok`, `stats.errors`, `stats.lastRunAt` sur la règle.

### 4.3 Anti-boucle

| Garde | Mécanisme | Fichier |
|---|---|---|
| Profondeur | `MAX_RULE_DEPTH = 3` : une chaîne règle → action → règle s'arrête au-delà | `crmRules.ts` |
| Pas de rebouclage | une règle déjà présente dans `chain` n'est pas réexécutée | `fireLeadEvent` |
| Idempotence | clé `eventKey` = règle + lead + événement, **index unique** : un rejeu n'exécute rien | `models/CrmRuleRun.ts`, `runRule` |
| Actions idempotentes | `CREATE_TASK` ignore une tâche du même titre encore ouverte ; `ADD_TAG` ignore un tag présent ; `SET_FIELD` ignore une valeur inchangée | `runAction` |
| Écritures sans événement | les actions qui écrivent le lead passent par `applyLeadChange` avec `emit: false` ; seules `ASSIGN` et `SET_STATUS` émettent leur événement, avec la profondeur de la chaîne | `writeByRule`, `runAction` |
| Simulation | `simulate: true` n'écrit rien | `simulateRule` |

### 4.3 bis Opposition et désinscription (RGPD)

- `SEND_EMAIL` vérifie `lead.doNotContact` et la liste de suppression (`SuppressionEntry`) avant de mettre l'e-mail en attente et de nouveau au moment de l'envoyer (`deliverEmail`) : si la personne s'est opposée, l'étape passe `SKIP` avec `payload.reason = 'DO_NOT_CONTACT'` (et `via` : `LEAD` ou `SUPPRESSION_LIST`) ; rien ne part.
- Chaque e-mail envoyé par une règle porte un lien de désinscription signé (HMAC dérivé de `CREDENTIALS_KEY`, sinon `JWT_SECRET`, valable 365 jours) vers `GET /api/public/unsubscribe`, en pied de message et dans les en-têtes `List-Unsubscribe` / `List-Unsubscribe-Post`.
- L'envoi manuel depuis la fiche (`POST /api/admin/interactions/:type/:id/email`) est limité à 10 destinataires ; pour un lead, il est refusé en entier (409 `DO_NOT_CONTACT`, activité `EMAIL_BLOCKED`) si le lead est opposé ou si une adresse figure dans la liste.
- L'envoi groupé libre (`POST /api/admin/email-composer/send`) contrôle chaque destinataire (`lib/crmBulkEmailGuard.ts`) : une adresse de la liste de suppression ou portée par un lead opposé (`doNotContact`) est retirée de l'envoi, l'envoi continue pour les autres ; la réponse liste les adresses retirées dans `blocked` (`email`, `reason: DO_NOT_CONTACT`, `via`). Chaque lead concerné reçoit une activité `EMAIL_BLOCKED` (`payload.channel = 'email_composer'`) et le serveur journalise le nombre d'adresses retirées (sans les adresses). Les destinataires sont normalisés (minuscules) et dédoublonnés.
- Le planificateur et les jobs `crm*` n'écrivent qu'à l'équipe (et aux clients pour les factures), jamais directement à un prospect : un test statique le vérifie (`crm-rgpd-rules.test.ts`). Seule exception, le job `crm.sequences` (§7.5) : il délègue à `lib/crmSequences.ts`, qui revérifie l'opposition avant chaque e-mail et envoie par `deliverEmail` (même fonction que les règles, lien de désinscription compris) ; un test statique le vérifie (`crm-sequences-engine.test.ts`).

### 4.4 Validation humaine

- Seule l'action **`SEND_EMAIL`** est soumise à validation : si `requireApproval` est vrai (défaut, et forcé à `true` au seed), l'étape passe `PENDING` et le payload est conservé. Les autres actions s'exécutent directement.
- `POST /rules/runs/:id/approve` envoie l'e-mail (`deliverEmail`, trace dans la timeline). `POST /rules/runs/:id/reject` passe les étapes en `SKIP`. `POST /rules/runs/:id/retry` rejoue une exécution en `ERR` (`retryRun`).
- Administration des règles (création, modification, suppression, validation, rejet, rejeu) : `administersRules`, réservée à `SUPER_ADMIN` et `ADMIN` côté admin (`routes/admin/crmExtras.ts`).
- Activation (`status: ACTIVE`) : `canActivateRules`, mêmes rôles côté admin ; côté agent, le scope `admin:*` (voir §8.3). Modifier les actions, le déclencheur ou les conditions d'une règle active la repasse en `PAUSED` si l'auteur n'a pas le droit d'activer.

---

## 5. Règles prédéfinies

Catalogue `SEED_RULES` dans `backend/src/lib/crmRules.ts`. Insérées par `seedCrmRules()` en **brouillon** (`status: DRAFT`, `requireApproval: true`) et jamais modifiées ensuite (`$setOnInsert`). Rien ne se déclenche avant activation humaine.

| `systemKey` | Déclencheur | Conditions | Actions | Comportement remplacé (source désactivée quand la règle est ACTIVE) |
|---|---|---|---|---|
| `relance-7j` | `LEAD_INACTIVE` 7 j, statuts CONTACTED / DEMO / PROPOSAL | aucune | tâche « Relancer {contact} » (J+1) ; notification au responsable | Relance de lead inactif (`crm.inactive_lead_followup`, `processColdLeads`) |
| `proposition-sans-reponse` | `LEAD_INACTIVE` 5 j, statut PROPOSAL | budget ≥ 10 000 | e-mail de relance (**validé avant envoi**) ; tâche « Appeler {contact} » | Relance de proposition (`crm.proposal_followup`, `processProposalReminders`) |
| `relance-post-demo` (système) | `LEAD_INACTIVE` 3 j, statut DEMO | aucune | tâche « Relancer {contact} après la démo » ; notification | Relance post-démo (`crm.post_demo_followup`) |
| `lead-chaud-48h` (système) | `SCORE_AT_LEAST` 70 | `daysSinceActivity` ≥ 2 | notification aux admins | Alerte lead chaud (`crm.hot_lead_untreated_alert`) |
| `gagne-client-projet` | `STATUS_CHANGED` vers WON | aucune | création du compte client, du projet, notification aux admins | aucune source de relance : la conversion WON est aussi faite par `processWonLead` (§6), idempotente |
| `nouveau-lead-formulaire` | `LEAD_CREATED` | source ∈ {`Site web`, `Formulaire`, `Site`, `FORMULAIRE_SITE`} | assignation tournante ; e-mail d'accusé de réception (**validé avant envoi**) ; tâche « Qualifier {company} sous 24 h » | — |
| `perdu-archiver` | `STATUS_CHANGED` vers LOST | aucune | tag `recontacter-6m` ; tâche « Reprendre contact » à J+180 | — |

Les lignes « système » sont celles pour lesquelles `system: true` est posé ; `SYSTEM_RULE_FOR` (`crmRules.ts`) indique quelles relances sont couvertes par une règle.

---

## 6. Conversion d'un lead gagné

Code : `backend/src/lib/crmClientConversion.ts`.

- Déclenchée par `applyLeadChange` dès qu'un lead est en WON (quel que soit le canal).
- **Au plus une fois** : verrou atomique sur `wonProcessedAt` (`findOneAndUpdate` conditionnel). Un second passage rend `processed: false` sans rien créer.
- Crée ou rattache le **compte client** (`ensureClientForWonLead`) : recherche par `clientAccountId`, puis par e-mail (rôle `CLIENT`) ; sinon création avec `role: CLIENT`, `status: ACTIF`, et dossiers Nextcloud en arrière-plan.
- Crée le **projet** « auto-crm » (`ensureProjectForWonLead`), un seul par lead (`sourceLead`).
- En cas d'échec du compte client, le verrou est relâché et l'erreur remonte. En cas d'échec du projet, le lead reste à jour et le verrou est relâché pour une nouvelle tentative.
- Le verrou est le champ `wonProcessedAt` du schéma `Lead` (`models/Lead.ts`, défaut `null`) ; les écritures passent par le schéma (plus de `strict: false`).

---

## 7. Planificateur et jobs

### 7.1 Heures : fuseau de Paris

Toutes les heures et toutes les notions de « jour » ou de « semaine » sont celles de **Europe/Paris**, quel que soit le fuseau du serveur (`backend/src/automation/jobs/crmParisTime.ts` : `parisParts`, `parisDateKey`, `parisWeekKey`, `parseHHMM`, `serverScheduleForParis`).

### 7.2 Planificateur (`backend/src/lib/crmScheduler.ts`)

`startScheduler()` (appelé au démarrage dans `backend/src/index.ts`) lance `runScheduledJobs()` chaque minute.

| Moment (Paris) | Tâche | Réglage | Abstention par règle |
|---|---|---|---|
| Chaque minute | `processLeadFollowUps` : notification in-app `LEAD_FOLLOW_UP_DUE` quand `nextActionAt` est échue (une fois par échéance, via `followUpNotifiedFor`) | aucun | non |
| Chaque jour, dès 09:00 | `sweepRules` : balayage des règles à déclencheur d'état | règles ACTIVE | — |
| Chaque jour à `dailyOverdueEmailTime` (08:00), rattrapage 120 min | `processOverdueActions` | `dailyOverdueEmailEnabled` | non |
| idem | `processColdLeads` | `coldLeadEmailEnabled` | oui : `inactiveLeadFollowUp` |
| idem | `processEscalations` | `escalationEnabled` | non |
| idem | `processProposalReminders` | `proposalReminderEnabled` | oui : `proposalFollowUp` |
| idem | `processOverdueTasks` | aucun | non |
| idem | `processTaskDeadlineReminders` | `taskRemindersEnabled` | non |
| idem | `processProjectDeadlineAlerts` | `projectNotificationsEnabled` | non |
| idem | `processBriefDeadlineReminders` | `briefRemindersEnabled` | non |
| Chaque jour à 09:00 | `processInvoiceReminders` | `invoiceRemindersEnabled` | — |
| Jour du rapport, 06:00 | `processClientHealthAutoUpdate` | `clientHealthAutoUpdate` | — |
| Jour du rapport, `weeklyReportTime` | `processWeeklyReport` | `weeklyReportEnabled` | — |

**Escalade** (`processEscalations`) :
- inactivité mesurée sur `lastInteractionAt`, `lastContactAt`, `statusChangedAt`, `createdAt` (jamais `updatedAt`) ;
- `escalationAction` : `NOTIFY_MANAGER` (e-mail au manager), `REASSIGN` (réattribution tournante), `BOTH` ;
- **une seule** réattribution automatique par lead (activité `ESCALATION_REASSIGN`) ; ensuite seule l'alerte au manager reste possible ;
- la réattribution passe par `applyLeadChange` (source `scheduler`) ;
- un e-mail au manager par lead et par épisode d'inactivité ; la fenêtre reste ouverte si rien n'est parti.

**Rapport hebdomadaire** : nouveaux leads de la semaine, qualifications (transitions vers QUALIFIED), gains et pertes de la semaine, pipeline actif et valeur, taux de conversion = gains / (gains + pertes) sur la semaine.

### 7.3 Verrous et « une seule exécution »

- Chaque occurrence est protégée par un document `SchedulerLock` de clé `crm-scheduler:<tâche>:<jour ou semaine de Paris>` (`backend/src/models/SchedulerLock.ts`, `runOnce`). Insertion unique : une seule instance ou un seul passage l'obtient, y compris après redémarrage.
- TTL du verrou : 3 jours pour une tâche quotidienne, 14 jours pour une tâche hebdomadaire, 365 jours pour une fenêtre d'escalade (`crm-scheduler:escalation:<lead>:<dernier signe de vie>`).
- Une erreur levée par la tâche libère le verrou (retentative au passage suivant). Une erreur rendue par la tâche le conserve, car des e-mails ont pu partir.
- Rattrapage : une tâche quotidienne manquée (serveur arrêté) part dans les `CATCH_UP_MINUTES` = 120 minutes qui suivent son heure.

### 7.4 Jobs du moteur d'automatisations (`backend/src/automation/jobs/crm*.ts`)

Enregistrés par `initAutomationEngine()` (`backend/src/automation/index.ts`). Les heures sont traduites en heure du serveur à chaque passage (`serverScheduleForParis`).

| Clé | Heure (Paris) | Seuil | Canaux | Abstention |
|---|---|---|---|---|
| `crm.inactive_lead_followup` | 09:00 quotidien | 7 j (`config.inactiveDays`) | in_app, e-mail | règle `relance-7j` ou `coldLeadEmailEnabled` |
| `crm.post_demo_followup` | 09:00 quotidien | 3 j après passage en DEMO | in_app | règle `relance-post-demo` |
| `crm.proposal_followup` | 09:00 quotidien | `proposalReminderDays` (7 j par défaut) après passage en PROPOSAL, même seuil que `processProposalReminders` (`lib/crmProposalReminder.ts`) | in_app | règle `proposition-sans-reponse` ou `proposalReminderEnabled` |
| `crm.hot_lead_untreated_alert` | 08:30 quotidien | lead chaud sans activité 48 h | in_app, e-mail | règle `lead-chaud-48h` |
| `crm.auto_archive_lost` | 03:00 quotidien | LOST depuis 30 j (`statusChangedAt`) | système | aucune |
| `crm.conversion_drop_alert` | lundi 08:00 | chute du taux de conversion | in_app | aucune |
| `crm.sequences` | toutes les 5 minutes | étapes échues des inscriptions actives (§7.5) | e-mail au prospect, tâche | séquence non `ACTIVE` ; verrou par étape |
| `crm.retention_purge` | 04:00 quotidien | lead non gagné sans interaction ni modification depuis `retentionMonths` | système | simulation tant que `retentionPurgeEnabled` est faux ; verrou `crm-scheduler:retentionPurge:<jour>` |

Les abstentions sont évaluées par `crmJobAbstention` (`crmJobGuards.ts`) : la règle active prime, puis le réglage du planificateur. La clé d'idempotence de chaque job est une clé de jour ou de semaine de Paris (`buildIdempotencyKey`).

Note : `crm.auto_archive_lost` et `crm.retention_purge` sont les seuls jobs de `automation/jobs/crm*.ts` qui écrivent sur les leads ; ils passent par `applyLeadChange` (source `scheduler`). L'anonymisation vide nom, e-mail, téléphone et notes (« Anonymisé (conservation) »), neutralise le journal des échanges et les données personnelles de l'historique, pose `anonymizedAt` ; une adresse opposée reste dans la liste de suppression.

### 7.5 Séquences d'e-mails (`lib/crmSequences.ts`, lot 5)

- **Étapes** : `EMAIL` (objet et texte), `TASK` (tâche personnelle confiée au responsable du lead — `assignedTo`, à défaut `createdBy`), `WAIT` (attente seule). Chaque étape attend `delayDays` jours calendaires depuis l'étape précédente (ou l'inscription) puis s'exécute à `sendHourParis` (8 à 19, défaut 9) heure de Paris, **un jour ouvré** : samedi et dimanche reportent au lundi. Délai nul et heure passée : tout de suite si l'on est dans la plage (lundi–vendredi, 08:00–20:00 Paris), sinon le jour ouvré suivant. Variables : `{contact}`, `{company}`, `{amount}` (comme les règles) et `{owner}` (nom du responsable).
- **Activation** : créer, modifier, activer, suspendre une séquence = `administersCrm` (agent : `admin:*`). Une séquence naît `DRAFT` ; tant qu'elle n'est pas `ACTIVE`, ses inscriptions attendent et rien ne part.
- **Inscription** (`manage_crm` + périmètre d'écriture, 200 leads par appel) : refus motivés — `ANONYMIZED`, `DO_NOT_CONTACT`, `SUPPRESSED` (liste de suppression), `NO_EMAIL` (si la séquence a une étape e-mail), `CLOSED` (WON/LOST), `ARCHIVED`, `ENTITY_MISMATCH` (séquence d'une entité), `ALREADY_ENROLLED`, `NOT_FOUND` (inexistant ou hors périmètre). Une seule inscription ouverte par séquence et lead (index unique partiel `openKey`) ; réinscription possible après arrêt ou fin. Activité `SEQUENCE_ENROLLED`.
- **Moteur** : job `crm.sequences` toutes les 5 minutes → `runSequenceTick` (200 inscriptions échues au plus par passage). Chaque étape est protégée par un `SchedulerLock` `crm-sequence:<inscription>:<étape>` (TTL 60 jours) : deux passages ou deux instances concurrents n'exécutent l'étape qu'une fois, y compris après redémarrage ; l'avancement est conditionnel (`currentStep` inchangé). Un verrou présent depuis plus de 15 minutes sur une inscription non avancée (instance arrêtée pendant l'étape) fait passer l'étape **sans la rejouer** (au plus un envoi). Un envoi refusé par le serveur SMTP rend le verrou : nouvelle tentative une heure plus tard, arrêt `SEND_FAILED` au 3e échec. Lead en automatisation suspendue : report d'un jour ouvré.
- **Avant chaque étape** : arrêt si le lead est anonymisé, opposé, archivé, à un statut d'arrêt (`stopOn.statuses`, défaut WON/LOST), ou si le prospect a répondu (`stopOn.reply` : une `Interaction` `direction: IN` sur le lead datée après l'inscription). **Avant chaque e-mail** : adresse valide et `checkProspectContact` (opposition + liste de suppression) ; puis `deliverEmail` (lien de désinscription, `Interaction` sortante sur le lead). Le moteur n'écrit jamais le lead.
- **Arrêts immédiats** : `applyLeadChange` appelle `stopSequencesOnLeadChange` après chaque écriture (tous canaux, même `emit: false`) — opposition (`DO_NOT_CONTACT`), lien de désinscription (`UNSUBSCRIBE`), anonymisation, archivage, passage à un statut d'arrêt ; `logInteraction` appelle `stopSequencesOnInboundInteraction` pour un échange entrant (`REPLY`). Désinscription manuelle : `MANUAL`. Activités `SEQUENCE_STOPPED`, `SEQUENCE_COMPLETED`.
- **RGPD** : le journal d'une inscription ne contient pas l'adresse ; l'anonymisation vide ses messages ; l'export des données personnelles inclut les inscriptions ; la suppression d'un lead supprime ses inscriptions.
- **Limites connues** : modifier les étapes d'une séquence active s'applique aux inscriptions en cours selon leur index d'étape ; le statut d'inscription `PAUSED` existe dans le modèle mais n'est pas encore exposé par l'API.

---

## 8. Droits et périmètre

Code : `backend/src/lib/permissions.ts`, `backend/src/lib/crmScope.ts`, `backend/src/middleware/role.ts`.

### 8.1 Permissions CRM par rôle

| Rôle | `view_crm` | `manage_crm` | Commentaire (source) |
|---|---|---|---|
| `SUPER_ADMIN` | oui | oui | toutes les permissions |
| `ADMIN` | oui | oui | + `administersCrm` : réglages, règles |
| `MANAGER` | oui | oui | |
| `COMMERCIAL` | oui | oui | lit tout le CRM (§8.2) |
| `STAGIAIRE` | oui | non | consultation seule : « ses leads passent par un commercial ou un administrateur » |
| `RH`, `COMPTABLE`, `VIEWER` | non | non | |
| `COMMERCIAL_EXTERNE` | non | non | espace propre (`/api/commercial`) |

Assignables à un lead (`CRM_ASSIGNABLE_ROLES`) : tous les rôles d'admin sauf `VIEWER` et `COMPTABLE`.

### 8.2 Périmètre

| Fonction (`crmScope.ts`) | Règle codée |
|---|---|
| `readsWholeCrm` | vrai pour `SUPER_ADMIN`, `ADMIN` et `COMMERCIAL` |
| `writesWholeCrm` | vrai pour `SUPER_ADMIN` et `ADMIN` |
| `leadScopeFilter` (lecture) | les autres rôles ne voient que les leads où ils sont `assignedTo` ou `createdBy` |
| `isLeadOutOfScope`, `leadWriteScopeFilter` (écriture) | `SUPER_ADMIN` et `ADMIN` sortent du périmètre ; pour les autres (dont `COMMERCIAL`), `assignedTo` ou `createdBy` doit être l'utilisateur |
| `crmEntityRestriction` | une liste `crmEntities` non vide restreint lecture et écriture à ces entités, pour tous les rôles sauf `SUPER_ADMIN` (l'`ADMIN` restreint lit et écrit tout le CRM **de ses entités**) |
| `administersCrm` | `SUPER_ADMIN` ou `ADMIN` |

Décision de Raphael (6 novembre 2026) : un `ADMIN` voit et modifie tous les leads, sous réserve de sa restriction d'entités. Conséquences : liste, fiche, modification, suppression, fusion, actions groupées, export, doublons, journal des échanges, prévisions par commercial et objectifs personnels des collègues suivent `readsWholeCrm` / `writesWholeCrm`.

Rattacher ou détacher un projet (`POST`/`DELETE /leads/:id/projects/:projectId`) est une écriture sur le lead : `manage_crm` + périmètre d'écriture du lead (`isLeadOutOfScope`), et le projet doit être lisible (`canReadProject`). Le commercial rattache donc les projets de ses leads ; l'administrateur ceux de tout lead de ses entités. `administersCrm` seul n'aurait pas suffi : il ignorerait la restriction d'entités de l'administrateur et priverait le commercial du rattachement de ses propres leads.

### 8.3 Agents (API Bearer)

Scopes : `read:crm` (lecture), `write:crm` (écriture), `admin:*` (`ADMIN_WILDCARD_SCOPE`, `backend/src/lib/agent/scopes.ts`). Un agent sans `admin:*` peut écrire sur le CRM avec `write:crm`, mais la règle qu'il crée reste en brouillon et il ne peut pas l'activer (voir §11 pour le contrôle des validations).

---

## 9. Suivi à consulter

- Journal des exécutions : `GET /api/admin/crm/rules/runs` (filtre `status`, pagination).
- Journal des événements de lead : `GET /api/admin/crm/leads/:id/activities`.
- Santé du planificateur : `getCrmSchedulerHealth()` (`lib/crmScheduler.ts`), lue par la route de santé admin (`routes/admin/health.ts`).
- Journaux serveur : `logger` (`backend/src/lib/logger.ts`).

---

## 10. Migrations de données

Scripts one-shot, idempotents, dans `backend/scripts/migrations/` (usage : `MONGODB_URI=… npx tsx scripts/migrations/<fichier>` depuis `backend/`).

| Fichier | Objet |
|---|---|
| `004-crm-enrich.ts` | `probability` des leads existants selon l'étape ; `lastInteractionAt` et `interactionsCount` depuis le journal des échanges ; insertion des règles prédéfinies en brouillon. Les jobs historiques restent actifs jusqu'à désactivation manuelle de chaque job. |
| `005-crm-form-rule-source.ts` | ajoute `FORMULAIRE_SITE` à la condition « source » de `nouveau-lead-formulaire` (`$addToSet`), sans toucher au reste. |
| `006-crm-post-demo-rule.ts` | insère la règle `relance-post-demo` (et toute règle prédéfinie absente), en brouillon. |
| `008-crm-dedup-normalized.ts` | remplit `contactEmailNormalized`, `contactPhoneNormalized`, `companyNormalized` des leads et crée leurs index ; idempotente, `--dry-run`. À lancer avant ou avec le déploiement. |
| `011-crm-sequences.ts` | index des séquences et des inscriptions (`{status, nextRunAt}`, unicité partielle `openKey`) ; ne modifie aucun document ; `--dry-run`. À lancer avec le déploiement. |
| `010-crm-rgpd.ts` | base légale par défaut `LEGITIMATE_INTEREST` (et `consent.status: UNKNOWN`, `doNotContact: false`) sur les leads qui n'en ont pas ; index de la liste de suppression. N'écrase rien, ne touche pas `updatedAt` ; `--dry-run`. |

---

## 11. Points d'attention

Écarts entre le code et ce qu'on pourrait attendre. Ils ne sont pas corrigés par ce document.

| Sujet | Constat (fichier) |
|---|---|
| Agent et règles | Le contrôle `administersRules` n'est pas fourni à l'adaptateur agent (`routes/agent/crmExtras.ts`) : un agent avec `write:crm` peut créer, modifier, supprimer et **valider les e-mails en attente**. Seule l'activation exige `admin:*`. |
| Doublon règle / job | `crm.proposal_followup` et `processProposalReminders` partagent `proposalReminderDays` ; la règle `proposition-sans-reponse` (5 j, ses propres conditions) prime sur les deux. |
| Relance post-démo | Aucun réglage du planificateur ; seule la règle `relance-post-demo` ou le job la couvre. |

---

## 12. Pistes non implémentées

Depuis le lot 5, les relances e-mail automatiques en plusieurs étapes existent sous forme de séquences (§7.5). Les autres idées de la version précédente (intégration calendrier, enrichissement externe, prédiction de conversion, workflows par source) ne sont pas dans le code. Elles relèvent d'un futur chantier et ne doivent pas être lues comme des fonctions existantes.
