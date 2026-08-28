# Automatisations CRM Venio

Ce document liste toutes les automatisations implémentées dans le CRM Venio, ainsi que les automatisations potentielles à envisager pour de futures améliorations.

---

## Système de configuration

**Toutes les automatisations sont désactivables** via l'interface de configuration accessible depuis le CRM (`/admin/crm/settings`). Les paramètres sont stockés dans la collection MongoDB `CrmSettings`.

### Modèle de configuration

Le modèle `CrmSettings` est un singleton qui contient tous les paramètres d'automatisation :

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `roundRobinEnabled` | Boolean | `true` | Attribution round-robin |
| `autoQualifyEnabled` | Boolean | `true` | Auto-qualification |
| `autoLastContactOnContacted` | Boolean | `true` | Màj date contact |
| `autoNextActionOnDemo` | Boolean | `true` | Rappel post-démo |
| `demoFollowUpDays` | Number | `1` | Délai rappel démo (jours) |
| `autoNextActionOnProposal` | Boolean | `true` | Rappel post-proposition |
| `proposalFollowUpDays` | Number | `3` | Délai rappel proposition |
| `clearNextActionOnClose` | Boolean | `true` | Nettoyer action à WON/LOST |
| `emailOnAssignment` | Boolean | `true` | Email d'assignation |
| `activityLogging` | Boolean | `true` | Journalisation activités |
| `coldLeadAlertEnabled` | Boolean | `true` | Alerte leads froids |
| `coldLeadThresholdDays` | Number | `7` | Seuil lead froid |
| `coldLeadEmailEnabled` | Boolean | `false` | Email rappel leads froids |
| `overdueAlertEnabled` | Boolean | `true` | Alerte actions en retard |
| `dailyOverdueEmailEnabled` | Boolean | `false` | Email quotidien retards |
| `dailyOverdueEmailTime` | String | `"08:00"` | Heure email quotidien |
| `staleLeadAlertEnabled` | Boolean | `true` | Alerte leads bloqués |
| `staleLeadThresholdDays` | Number | `14` | Seuil lead bloqué |
| `escalationEnabled` | Boolean | `false` | Escalade sur inactivité |
| `escalationThresholdDays` | Number | `10` | Seuil escalade |
| `escalationAction` | Enum | `"NOTIFY_MANAGER"` | Action : NOTIFY_MANAGER, REASSIGN, BOTH |
| `escalationManagerId` | ObjectId | `null` | Manager à notifier |
| `scoringEnabled` | Boolean | `false` | Scoring automatique |
| `scoringWeights` | Object | (voir ci-dessous) | Pondérations du scoring |
| `duplicateDetectionEnabled` | Boolean | `true` | Détection doublons |
| `duplicateCheckEmail` | Boolean | `true` | Vérifier email |
| `duplicateCheckCompany` | Boolean | `true` | Vérifier entreprise |
| `duplicateCheckPhone` | Boolean | `false` | Vérifier téléphone |
| `proposalReminderEnabled` | Boolean | `false` | Rappel proposition |
| `proposalReminderDays` | Number | `7` | Délai rappel proposition |
| `weeklyReportEnabled` | Boolean | `false` | Rapport hebdomadaire |
| `weeklyReportDay` | Number | `1` | Jour (0=Dim, 1=Lun...) |
| `weeklyReportTime` | String | `"09:00"` | Heure envoi |
| `weeklyReportRecipients` | Array | `[]` | Emails destinataires |

---

## Automatisations implémentées

### 1. Assignation automatique (Round-robin)

**Déclencheur :** Création d'un lead sans assignation  
**Action :** Assigne automatiquement le lead au prochain admin dans la rotation  
**Configurable :** `roundRobinEnabled`  
**Fichier :** `backend/src/lib/crmAutomations.js` → `getRoundRobinAssignee()`

### 2. Auto-qualification

**Déclencheur :** Lead avec budget ET source renseignés  
**Action :** Passe automatiquement le statut de LEAD à QUALIFIED  
**Configurable :** `autoQualifyEnabled`  
**Fichier :** `backend/src/routes/admin/crm.js`

### 3. Date de dernier contact (CONTACTED)

**Déclencheur :** Statut passe à CONTACTED  
**Action :** Met à jour `lastContactAt` à la date actuelle (si non défini)  
**Configurable :** `autoLastContactOnContacted`  
**Fichier :** `backend/src/routes/admin/crm.js`

### 4. Rappel post-démo

**Déclencheur :** Statut passe à DEMO  
**Action :** Définit `nextActionAt` à J+X (configurable, défaut 1 jour)  
**Configurable :** `autoNextActionOnDemo`, `demoFollowUpDays`  
**Fichier :** `backend/src/routes/admin/crm.js`

### 5. Rappel proposition commerciale

**Déclencheur :** Statut passe à PROPOSAL  
**Action :** Définit `nextActionAt` à J+X (configurable, défaut 3 jours)  
**Configurable :** `autoNextActionOnProposal`, `proposalFollowUpDays`  
**Fichier :** `backend/src/routes/admin/crm.js`

### 6. Nettoyage des rappels (WON/LOST)

**Déclencheur :** Statut passe à WON ou LOST  
**Action :** Supprime `nextActionAt` (plus besoin de relance)  
**Configurable :** `clearNextActionOnClose`  
**Fichier :** `backend/src/routes/admin/crm.js`

### 7. Log d'activité automatique

**Déclencheur :** Création de lead, changement de statut, réassignation  
**Action :** Crée une entrée dans `LeadActivity` avec le type, label et payload  
**Configurable :** `activityLogging`  
**Fichier :** `backend/src/lib/crmAutomations.js` → `logLeadActivity()`

### 8. Email de notification d'assignation

**Déclencheur :** Lead assigné à un commercial  
**Action :** Envoie un email au commercial avec les détails du lead  
**Configurable :** `emailOnAssignment`  
**Fichier :** `backend/src/lib/email.js` → `sendLeadAssignmentEmail()`

### 9. Alertes visuelles (Frontend)

**Types d'alertes :**
- **Lead froid** : Pas de contact depuis X jours (badge gris) - `coldLeadAlertEnabled`, `coldLeadThresholdDays`
- **Action en retard** : `nextActionAt` dépassé (badge rouge) - `overdueAlertEnabled`
- **Lead bloqué** : Même statut depuis X jours (badge orange) - `staleLeadAlertEnabled`, `staleLeadThresholdDays`

**Affichage :** Badges dans le tableau, les cartes Kanban et les lignes de la file de travail  
**Fichier :** `src/pages/admin/crm-board/constants.ts` → `getLeadAlerts(lead, thresholds)`  
**Seuils :** servis par `GET /crm/worklist` et distribués via `CrmThresholdsContext`. Les valeurs ne
sont plus codées en dur : les réglages de `/admin/crm/settings` s'appliquent réellement.

### 10. File de travail commerciale

**Déclencheur :** Ouverture du mode « File » du board CRM (`/admin/crm?mode=file`)  
**Action :** Range les leads actifs en quatre groupes — en retard, aujourd'hui, à venir 7 j, à ne pas
laisser filer — et permet de reporter, marquer contacté, changer le statut et ajouter une note sans
quitter la vue  
**Fichier :** `backend/src/lib/crmAutomations.js` → `buildWorklist()`, `src/pages/admin/crm-board/worklist/`  
**Partagée avec :** le Centre d'activité (`/admin/centre-activite`), qui en tire sa section « Relances CRM »

### 11. Conversion lead WON → Client

**Déclencheur :** Clic sur "Créer client" pour un lead WON  
**Action :** Crée un utilisateur CLIENT avec les infos du lead pré-remplies  
**Endpoint :** `POST /api/admin/crm/leads/:id/convert-to-client`

### 12. Scoring automatique des leads

**Déclencheur :** Création ou mise à jour d'un lead  
**Action :** Calcul d'un score 0-100 basé sur budget, source, priorité, infos contact  
**Configurable :** `scoringEnabled`, `scoringWeights`  
**Fichier :** `backend/src/lib/crmAutomations.js` → `calculateLeadScore()`

**Pondérations par défaut :**
| Critère | Points |
|---------|--------|
| Budget > 10K€ | 30 |
| Budget 1K-10K€ | 15 |
| Budget < 1K€ | 5 |
| Source : Recommandation | 25 |
| Source : Publicité | 15 |
| Source : Autre | 10 |
| Priorité : Urgente | 20 |
| Priorité : Haute | 15 |
| Priorité : Normale | 5 |
| Email renseigné | 10 |
| Téléphone renseigné | 10 |

### 13. Détection de doublons

**Déclencheur :** Création d'un lead  
**Action :** Vérifie si un lead similaire existe (email, entreprise, téléphone)  
**Configurable :** `duplicateDetectionEnabled`, `duplicateCheckEmail`, `duplicateCheckCompany`, `duplicateCheckPhone`  
**Endpoint :** `POST /api/admin/crm/check-duplicate`  
**Fichier :** `backend/src/lib/crmAutomations.js` → `checkDuplicateLead()`

### 14. Email de rappel leads froids

**Déclencheur :** Job quotidien (scheduler)  
**Action :** Envoie un email aux commerciaux listant leurs leads sans contact récent  
**Configurable :** `coldLeadEmailEnabled`, `coldLeadThresholdDays`  
**Fichier :** `backend/src/lib/crmScheduler.js` → `processColdLeads()`

### 15. Email quotidien des actions en retard

**Déclencheur :** Job quotidien à l'heure configurée  
**Action :** Email récapitulatif au commercial avec ses leads en retard  
**Configurable :** `dailyOverdueEmailEnabled`, `dailyOverdueEmailTime`  
**Fichier :** `backend/src/lib/crmScheduler.js` → `processOverdueActions()`

### 16. Escalade sur inactivité

**Déclencheur :** Lead non mis à jour depuis X jours  
**Action :** Notifier le manager ET/OU réassigner automatiquement  
**Configurable :** `escalationEnabled`, `escalationThresholdDays`, `escalationAction`, `escalationManagerId`  
**Fichier :** `backend/src/lib/crmScheduler.js` → `processEscalations()`

### 17. Rappel avant expiration proposition

**Déclencheur :** Lead en PROPOSAL depuis X jours  
**Action :** Email de rappel au commercial pour relancer  
**Configurable :** `proposalReminderEnabled`, `proposalReminderDays`  
**Fichier :** `backend/src/lib/crmScheduler.js` → `processProposalReminders()`

### 18. Rapport hebdomadaire automatique

**Déclencheur :** Chaque semaine au jour/heure configurés  
**Action :** Email avec stats : nouveaux leads, conversions, pipeline  
**Configurable :** `weeklyReportEnabled`, `weeklyReportDay`, `weeklyReportTime`, `weeklyReportRecipients`  
**Fichier :** `backend/src/lib/crmScheduler.js` → `processWeeklyReport()`

---

## Automatisations futures (suggestions)

### Haute priorité

#### Auto-relance par email
**Déclencheur :** Lead en statut CONTACTED/DEMO depuis X jours sans réponse  
**Action :** Envoyer un email de relance automatique au contact du lead  
**Complexité :** Élevée (templates email, opt-out, tracking)

### Moyenne priorité

#### Intégration calendrier
**Déclencheur :** Création d'une prochaine action (`nextActionAt`)  
**Action :** Créer un événement dans Google Calendar / Outlook  
**Complexité :** Élevée (OAuth, API externes)

### Basse priorité

#### Prédiction de conversion (ML)
**Déclencheur :** Analyse des leads  
**Action :** Score de probabilité de conversion basé sur l'historique  
**Complexité :** Très élevée (ML, données historiques suffisantes)

#### Enrichissement automatique des leads
**Déclencheur :** Création d'un lead avec email  
**Action :** Récupérer infos entreprise via API (Clearbit, Hunter, etc.)  
**Complexité :** Moyenne (API tierces payantes)

#### Workflow personnalisé par source
**Déclencheur :** Lead créé selon sa source (Ads, Referral, etc.)  
**Action :** Appliquer un workflow différent (délais, templates, assignation)  
**Complexité :** Élevée (configuration UI, moteur de règles)

---

## Architecture technique

### Modèles concernés
- `Lead` : Prospect avec pipeline de vente (inclut maintenant `score`)
- `LeadActivity` : Historique des actions sur un lead
- `CrmSettings` : Configuration des automatisations (singleton)
- `User` : Client converti depuis un lead WON

### Fichiers clés
- `backend/src/models/CrmSettings.js` : Modèle de configuration
- `backend/src/lib/crmAutomations.js` : Helpers d'automatisation
- `backend/src/lib/crmScheduler.js` : Jobs planifiés (emails, escalade, rapports)
- `backend/src/routes/admin/crm.js` : Routes API avec logique d'automatisation
- `backend/src/lib/email.js` : Envoi d'emails
- `src/pages/admin/CrmBoard.jsx` : Interface CRM avec alertes visuelles
- `src/pages/admin/CrmSettings.jsx` : Interface de configuration

### Endpoints API

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/admin/crm/leads` | Liste des leads |
| GET | `/api/admin/crm/pipeline` | Pipeline groupé par statut |
| GET | `/api/admin/crm/worklist` | File de travail groupée + seuils effectifs |
| GET | `/api/admin/crm/leads/:id/activities` | Historique d'un lead |
| POST | `/api/admin/crm/leads/:id/notes` | Ajouter une note datée (LeadActivity) |
| POST | `/api/admin/crm/leads` | Créer un lead |
| PATCH | `/api/admin/crm/leads/:id` | Mettre à jour un lead |
| DELETE | `/api/admin/crm/leads/:id` | Supprimer un lead |
| POST | `/api/admin/crm/leads/:id/convert-to-client` | Convertir en client |
| GET | `/api/admin/crm/settings` | Lire la configuration |
| PATCH | `/api/admin/crm/settings` | Modifier la configuration |
| POST | `/api/admin/crm/check-duplicate` | Vérifier les doublons |

### Scheduler

Le scheduler (`crmScheduler.js`) s'exécute chaque minute et vérifie les conditions pour :
- Emails leads froids (quotidien)
- Emails actions en retard (quotidien à l'heure configurée)
- Escalades (quotidien)
- Rappels proposition (quotidien)
- Rapport hebdomadaire (jour/heure configurés)

Le scheduler démarre automatiquement avec le serveur backend.
