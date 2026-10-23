# API mobile des apps natives Venio

Contrat entre le backend Venio et les apps natives Apple (iOS, iPadOS, watchOS, macOS). L'app est réservée à l'équipe interne (rôles admin, dont `COMMERCIAL`). Cadrage métier : `espace-commercial.md` ; thèmes : `themes.md`.

Toutes les réponses sont en JSON. Une erreur a la forme `{ "error": "<message lisible>", "code": "<CODE_MACHINE>" }` ; `code` est présent quand l'app doit réagir à un cas précis. Les dates sont en ISO 8601 UTC.

## 1. Authentification

### Les jetons

| Jeton | Préfixe | Durée | Où il va |
| --- | --- | --- | --- |
| Access token | `vnm_at_` | 15 minutes | En-tête `Authorization: Bearer <access>` de chaque appel |
| Refresh token | `vnm_rt_` | 30 jours, renouvelés à chaque rotation, dans la limite de 180 jours après la connexion | Corps de `/refresh` et `/logout` seulement |

Les deux sont opaques : l'app ne les décode pas. Le serveur n'en garde que l'empreinte. L'app les range dans le Keychain (accessibilité « après le premier déverrouillage », sans synchronisation iCloud).

Un appareil connecté est un `device`. Ses jetons forment une famille : révoquer l'appareil coupe tous ses jetons et ses notifications push.

### Cycle de vie

1. **Connexion** : `POST /api/auth/mobile/login` renvoie un couple de jetons et l'appareil créé.
2. **Appels** : `Authorization: Bearer <access>`. Un `401` veut dire « access expiré ou révoqué » : l'app fait **un** refresh, puis rejoue l'appel. Si le refresh échoue aussi, retour à l'écran de connexion.
3. **Rotation** : `POST /api/auth/mobile/refresh` consomme le refresh et en renvoie un nouveau, avec un nouvel access. L'ancien refresh est mort.
4. **Rejeu** : présenter un refresh déjà consommé révoque tout l'appareil, car l'un des deux porteurs est illégitime. Conséquence pour l'app : **un seul refresh à la fois** (file unique), et le nouveau refresh est écrit dans le Keychain avant tout autre appel. Si la réponse d'un refresh se perd sur le réseau, l'utilisateur devra se reconnecter : c'est voulu.
5. **Fin** : l'appareil tombe à la déconnexion, à sa révocation (depuis l'app ou le web), au changement de mot de passe, à un changement de rôle ou de droits, à la désactivation du compte, au réarmement de la double authentification si la connexion ne l'avait pas passée, ou 180 jours après la connexion.

### `POST /api/auth/mobile/login`

Pas d'authentification. Même quota que le login web : 5 échecs par 15 minutes et par IP, partagés entre web et app.

```json
{
  "email": "camille@venio.paris",
  "password": "…",
  "totpCode": "123456",
  "recoveryCode": "ABCDE-12345",
  "device": {
    "name": "iPhone de Camille",
    "platform": "ios",
    "model": "iPhone17,1",
    "osVersion": "26.1",
    "appVersion": "1.0.0",
    "installationId": "3F2A…"
  }
}
```

- `platform` : `ios`, `ipados`, `watchos` ou `macos`. `name` : 1 à 100 caractères. `model`, `osVersion`, `appVersion` : 40 caractères au plus.
- `installationId` (facultatif, 8 à 100 caractères `[A-Za-z0-9-]`) : un UUID généré au premier lancement et gardé dans le Keychain. Une reconnexion depuis la même installation remplace l'ancien appareil au lieu d'en ajouter un.
- `totpCode` / `recoveryCode` : seulement au second envoi, quand la double authentification est demandée.

Réponses :

| Statut | Corps | Sens |
| --- | --- | --- |
| `200` | `{ "requires2FA": true }` | Renvoyer la même requête avec `totpCode` ou `recoveryCode`. Aucun jeton émis. |
| `200` | voir ci-dessous | Connecté. |
| `400` | `code: VALIDATION_ERROR` | Champ manquant ou invalide. |
| `401` | `{ "error": "Identifiants invalides" }` ou `"Code 2FA invalide"` | |
| `403` | `{ "error": "Votre accès a été désactivé…" }` | Compte désactivé ou archivé. |
| `403` | `code: MOBILE_ROLE_NOT_ALLOWED` | Compte client : l'app est réservée à l'équipe. |
| `403` | `code: MFA_SETUP_REQUIRED` | La double authentification doit d'abord être configurée depuis le navigateur. |
| `429` | `{ "error": "Trop de tentatives…" }` | Quota atteint. |

```json
{
  "accessToken": "vnm_at_…",
  "accessTokenExpiresAt": "2026-10-23T21:15:00.000Z",
  "refreshToken": "vnm_rt_…",
  "refreshTokenExpiresAt": "2026-11-22T21:00:00.000Z",
  "device": {
    "id": "6719…",
    "name": "iPhone de Camille",
    "platform": "ios",
    "model": "iPhone17,1",
    "osVersion": "26.1",
    "appVersion": "1.0.0",
    "createdAt": "…",
    "lastSeenAt": "…",
    "expiresAt": "2027-04-21T21:00:00.000Z",
    "pushEnabled": false,
    "current": true
  },
  "user": {
    "id": "…",
    "name": "Camille",
    "email": "camille@venio.paris",
    "role": "COMMERCIAL",
    "permissions": ["view_crm", "manage_crm", "manage_quotes", "…"]
  }
}
```

L'app règle son interface sur `permissions`, jamais sur `role` seul : un administrateur peut retirer ou ajouter des droits à une personne.

### `POST /api/auth/mobile/refresh`

Pas d'authentification. Corps : `{ "refreshToken": "vnm_rt_…" }`.

- `200` : `{ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }`.
- `401` `code: INVALID_REFRESH_TOKEN` : refresh inconnu, expiré, déjà utilisé, ou appareil révoqué. Retour à l'écran de connexion.

### `POST /api/auth/mobile/logout`

Pas d'authentification : le refresh suffit, pour qu'une app dont l'access a expiré puisse se déconnecter. Corps : `{ "refreshToken": "vnm_rt_…" }`. Toujours `204`, que le jeton soit valide ou non. L'app efface ensuite ses jetons locaux.

### Appareils connectés

Accessibles en Bearer depuis l'app et en session depuis le navigateur.

- `GET /api/auth/mobile/devices` → `{ "devices": [Device, …] }`, appareils actifs, du plus récemment vu au plus ancien. `current` vaut `true` pour l'appareil qui appelle.
- `DELETE /api/auth/mobile/devices/:id` → `204`. `404 DEVICE_NOT_FOUND` si l'appareil n'existe pas, n'appartient pas à l'utilisateur ou est déjà révoqué. Révoquer l'appareil courant revient à se déconnecter.
- `POST /api/auth/mobile/devices/revoke-all` → `{ "revoked": <nombre> }`. Depuis l'app, déconnecte tous les **autres** appareils ; depuis le navigateur, tous les appareils.

### Routes existantes en Bearer

Les routes protégées par une session acceptent `Authorization: Bearer <access>`, avec exactement les droits de la personne connectée, **si elles figurent dans la liste blanche ci-dessous**. Quand l'en-tête `Authorization` est présent, le cookie est ignoré.

```
/api/auth/me                    /api/auth/mobile/*        /api/mobile/*
/api/notification-preferences   /api/admin/crm            /api/admin/interactions
/api/admin/clients              /api/admin/projects       /api/admin/quote-proposals
/api/admin/quote-templates      /api/admin/billing        /api/admin/notifications
/api/admin/dashboard            /api/admin/analytics      /api/admin/calendar
/api/admin/tickets              /api/admin/change-requests
/api/admin/messaging            /api/admin/activity-center
/api/admin/inbox                /api/admin/search
```

Tout le reste répond `403 BROWSER_SESSION_REQUIRED` en Bearer : création de comptes (administrateurs, stagiaires), identifiants, MFA, jetons agent, coffre d'outils, sauvegardes, comptabilité, webhooks, profil et mot de passe. C'est une liste blanche : une route ajoutée plus tard reste fermée à l'app tant qu'on ne l'y ajoute pas. Dans `/api/admin/clients`, choisir le mot de passe d'un compte client ou changer son email (son identifiant) reste aussi réservé au navigateur.

Autres limites :

- `/api/auth/logout` est la déconnexion du navigateur : l'app utilise `/api/auth/mobile/logout`.
- Les actions qui exigent une vérification MFA récente (`MFA_STEP_UP_REQUIRED`) ne sont pas faisables depuis l'app.
- La messagerie temps réel (Socket.IO) reste authentifiée par cookie : l'app interroge les routes REST de la messagerie.
- `/api/auth/me` ne renvoie jamais le secret TOTP ni les empreintes des codes de secours.

### Erreurs d'authentification communes

| Statut | `code` | Réaction de l'app |
| --- | --- | --- |
| `401` | `INVALID_ACCESS_TOKEN` | Un refresh, puis rejouer l'appel. |
| `403` | `BROWSER_SESSION_REQUIRED` | Proposer d'ouvrir la page web. |
| `403` | `{ "error": "Forbidden" }` | Droit manquant : masquer l'action. |
| `429` | — | Attendre ; `RateLimit-Reset` donne le délai. Quota global : 200 requêtes par minute et par IP ; `/api/auth/*` : 20 par minute. |

## 2. Préférences : thème et langue

Partagées entre les appareils de l'utilisateur. Clés autorisées : `themes.md` et `langues.md`.

- `GET /api/mobile/preferences` → `{ "theme": "glass", "background": "mist", "accent": "sky", "locale": "system" }`. Valeurs par défaut quand rien n'est enregistré : `glass`, `mist`, `sky`, `system`.
- `PUT /api/mobile/preferences` : les quatre champs sont requis, la réponse renvoie la valeur enregistrée.
  - `theme` : `glass` ou `neon`. `background` et `accent` doivent appartenir au thème choisi : `400 INVALID_THEME` sinon.
  - `locale` : `system`, `fr` ou `en`. `400 INVALID_LOCALE` sinon.

| Thème | Fonds | Accents |
| --- | --- | --- |
| `glass` | `mist`, `dawn`, `lagoon`, `lavender`, `night` | `sky`, `violet`, `mint`, `coral`, `amber` |
| `neon` | `black`, `graphite`, `abyss`, `plum`, `forest` | `cyan`, `magenta`, `violet`, `acid`, `orange` |

`locale` est la langue de l'app. Elle est distincte de la langue de l'interface web (`PATCH /api/auth/locale`), qui ne sert que de repli pour les notifications.

## 3. Notifications push (APNs)

### Enregistrer l'appareil

- `PUT /api/mobile/push/apns` (Bearer uniquement) : `{ "token": "<hex>", "environment": "sandbox" | "production", "language": "fr" | "en" }` → `204`.
  - `token` : le device token APNs en hexadécimal, 64 à 200 caractères.
  - `environment` : `sandbox` pour une build Xcode de développement, `production` pour TestFlight et l'App Store.
  - `language` (facultatif) : la langue du système de l'appareil, utilisée quand `locale` vaut `system`.
  - Un même jeton n'appartient qu'à un appareil : il est retiré de tout autre appareil.
  - Erreurs : `400 INVALID_APNS`, `403 DEVICE_REQUIRED` (session navigateur, ou appareil révoqué), `409 APNS_TOKEN_CONFLICT` (course avec un autre enregistrement : réessayer).
- `DELETE /api/mobile/push/apns` → `204`. À appeler quand l'utilisateur coupe les notifications dans l'app.

L'app réenregistre son jeton à chaque lancement : Apple peut le changer. La déconnexion et la révocation de l'appareil coupent les notifications.

### Ce que reçoit l'app

```json
{
  "aps": {
    "alert": { "title": "Devis signé", "body": "Refonte du site Dupont" },
    "sound": "default",
    "badge": 3,
    "thread-id": "QUOTE_PROPOSAL_SIGNED"
  },
  "type": "QUOTE_PROPOSAL_SIGNED",
  "link": "/admin/projets/6719…",
  "notificationId": "6719…"
}
```

- `type` : le type de notification. `link` : la route web équivalente, que l'app traduit vers son écran. `badge` : le nombre de notifications non lues.
- Aucune autre donnée : l'app recharge l'objet par l'API à l'ouverture.
- Les préférences de notification (`/api/notification-preferences`, canal `push`) s'appliquent : un type coupé n'envoie ni Web Push ni APNs.

### Événements commerciaux

| Type | Destinataire | Quand |
| --- | --- | --- |
| `CRM_LEAD_CREATED` | Super-admins | Un contact arrive par le formulaire du site. |
| `CRM_LEAD_ASSIGNED` | Le nouvel assigné | Un lead lui est assigné (création ou changement), sauf s'il s'est assigné lui-même. |
| `LEAD_FOLLOW_UP_DUE` | L'assigné | La relance (`nextActionAt`) d'un lead ouvert arrive à échéance. Une seule fois par échéance ; reporter la relance réarme l'alerte. |
| `QUOTE_PROPOSAL_VIEWED` | L'auteur du devis | Première consultation par le client. |
| `QUOTE_PROPOSAL_SIGNED` | L'auteur du devis | Signature par le client. |
| `PHASE_VALIDATED`, `PHASE_REVISION_REQUESTED` | Responsable du projet et super-admins | Le client valide une étape ou demande des retouches. |
| `CHANGE_REQUEST_CREATED` | Super-admins | Le client soumet une demande de modification. |
| `TICKET_CREATED` | Super-admins | Un ticket est ouvert. |

Un commercial reçoit les événements projet s'il est responsable du projet. Les demandes de modification et les tickets ne lui sont pas envoyés aujourd'hui.

### Langue des notifications

Le serveur rédige le texte dans la langue de l'utilisateur : `locale` de l'app si elle vaut `fr` ou `en`, sinon la `language` déclarée par l'appareil, sinon la langue de l'interface web, sinon le français. Les types du tableau ci-dessus ont une version anglaise ; les autres partent en français. Les noms et les titres saisis par les gens (nom d'un lead, titre d'un devis) ne sont jamais traduits par le serveur.

## 4. Devis

Permission `manage_quotes`, donnée au rôle `COMMERCIAL`. Elle permet de suivre les devis, d'en créer depuis un modèle et d'envoyer les siens. Elle ne donne rien d'autre de la facturation : pas de factures, pas de comptabilité, pas de modification des lignes ni des prix. Les routes ci-dessous sont aussi ouvertes à `manage_billing`.

| Route | Droit | Effet |
| --- | --- | --- |
| `GET /api/admin/quote-templates` | `manage_quotes` ou `manage_billing` | `{ templates: [QuoteTemplate] }`, modèles actifs, par nom. |
| `GET /api/admin/quote-proposals?project=<id>` | idem | `{ proposals: [QuoteProposal] }`, du plus récent au plus ancien. |
| `GET /api/admin/quote-proposals/:id` | idem | `{ proposal }`. `404` si absent. |
| `POST /api/admin/quote-proposals/from-template` | idem | Crée un brouillon. `201 { proposal }`. |
| `POST /api/admin/quote-proposals/:id/send` | idem | `DRAFT` → `SENT`. `200 { proposal }`. |

`POST /from-template` : `{ "templateId": "…", "project": "…", "title": "…" }` (`title` facultatif, sinon celui du modèle). L'introduction, les questions et les lignes viennent du modèle ; `expiresAt` = maintenant + `validityDays` du modèle. Tout autre champ envoyé est ignoré. Sans `manage_billing`, le projet doit être dans son portefeuille : on en est responsable, ou il est issu d'un lead qui nous est assigné ou qu'on a créé. Erreurs : `400` (identifiants invalides), `403 PROJECT_OUT_OF_SCOPE`, `404` (modèle inactif ou projet absent).

`POST /:id/send` : sans `manage_billing`, on n'envoie que les devis dont on est l'auteur (`403 NOT_PROPOSAL_OWNER`). Erreurs : `409 PROPOSAL_ALREADY_SIGNED`, `409 PROPOSAL_NOT_DRAFT`, `404`.

Un `QuoteTemplate` : `{ _id, name, title, intro, questions[], lines[], validityDays, isActive, createdBy, createdAt, updatedAt }`, avec `questions` et `lines` au format de `QuoteProposal`. Les modèles se gèrent depuis le web (`manage_billing`).

Un `QuoteProposal` porte notamment `status` (`DRAFT`, `SENT`, `SIGNED`, `EXPIRED`, `CANCELLED`), `firstViewedAt` (première consultation par le client, ou `null`), `expiresAt`, `lines[]`, `project`, `client` et `createdBy`.

## 5. Aujourd'hui

`GET /api/mobile/today?tz=Europe/Paris` (droit `view_crm`). `tz` est un fuseau IANA, `Europe/Paris` par défaut : il fixe les bornes du jour, changements d'heure compris. `400 INVALID_TIMEZONE` sinon.

```json
{
  "followUps": { "overdue": Bucket<Lead>, "today": Bucket<Lead> },
  "meetings": Bucket<Event>,
  "hotLeadsWithoutAction": Bucket<Lead>,
  "newInboundLeads": Bucket<Lead>,
  "quotesViewedNotSigned": Bucket<Quote>
}
```

`Bucket<T>` = `{ "items": [T], "total": <nombre> }`. Chaque liste est limitée à 50 éléments ; `total` donne le compte complet.

| Liste | Contenu | Tri |
| --- | --- | --- |
| `followUps.overdue` | Mes leads ouverts dont la relance est avant aujourd'hui. | Plus ancienne relance d'abord. |
| `followUps.today` | Mes leads ouverts dont la relance tombe aujourd'hui. | Par heure de relance. |
| `meetings` | Mes tâches et rendez-vous du calendrier dus aujourd'hui. | Par échéance. |
| `hotLeadsWithoutAction` | Mes leads ouverts `CHAUD` ou `TRES_CHAUD` sans relance prévue. | Plus récemment modifié d'abord. |
| `newInboundLeads` | Leads du formulaire du site créés depuis 7 jours, non assignés ou assignés à moi, dans mon périmètre CRM de lecture. | Plus récent d'abord. |
| `quotesViewedNotSigned` | Mes devis envoyés, déjà consultés, pas encore signés. | Plus récemment modifié d'abord. |

« Mes leads » = `assignedTo` est l'utilisateur. Lead ouvert = statut ni `WON` ni `LOST`.

- `Lead` : `{ _id, company, contactName, contactEmail, contactPhone, status, leadTemperature, nextActionAt, assignedTo, source, createdAt, updatedAt }`.
- `Event` : `{ id, type, title, date, projectId, projectName, metadata }`, la forme du calendrier admin. Si le calendrier est indisponible, la liste est vide et le reste de la réponse arrive quand même.
- `Quote` : `{ _id, project, client, title, status, expiresAt, firstViewedAt, createdBy, createdAt, updatedAt }`.

## 6. Synchronisation hors ligne

`GET /api/mobile/sync/:type?cursor=<curseur>&limit=<1..500>` → `{ "items": [...], "nextCursor": "…" | null, "hasMore": true | false }`. `limit` vaut 200 par défaut.

| `type` | Droit | Éléments |
| --- | --- | --- |
| `leads` | `view_crm` | Leads, forme de `/api/admin/crm/leads/:id`. |
| `interactions` | `view_crm` (et `manage_clients` pour ceux des clients) | Entrées de timeline, plus `subjectType` et `subjectId`. |
| `projects` | `view_projects` | Projets. |
| `projectPhases` | `view_phases` | Étapes de projet (`project` = id du projet). |
| `projectUpdates` | `view_projects` | Mises à jour publiées au client (`project` = id du projet). |
| `quotes` | `manage_quotes` ou `view_billing` | Devis. |
| `deletions` | selon les types lisibles | `{ _id, entityType, entityId, deletedAt }`. |

Le périmètre suit celui du web : un commercial lit tout le CRM ; hors super-admin, les projets sont ceux dont on est responsable ou sur lesquels on a une tâche ou un brief.

Mode d'emploi :

1. **Première synchro** : sans `cursor`. Répéter avec le `nextCursor` reçu tant que `hasMore` vaut `true`.
2. **Synchro suivante** : repartir du dernier `nextCursor` enregistré pour ce type. Un élément peut revenir s'il a encore changé : l'app remplace par `_id` (ou `id` pour les interactions).
3. **Suppressions** : synchroniser `deletions` de la même façon, et supprimer localement chaque `(entityType, entityId)`. Un projet supprimé emporte localement ses étapes et ses mises à jour.
4. **Curseur trop ancien** : `410 SYNC_RESET_REQUIRED` sur `deletions` quand le curseur a plus de 90 jours (les traces de suppression sont purgées). L'app efface alors ses données et refait une première synchro de tous les types.

Le curseur est opaque : l'app le stocke tel quel, par type. Le serveur ne renvoie que des modifications vieilles d'au moins 2 secondes, pour ne jamais sauter une écriture en cours : une modification toute récente arrive à la synchro suivante.

Erreurs : `400 INVALID_SYNC_TYPE`, `400 INVALID_CURSOR`, `400` (limite invalide), `403` (droit manquant).

## 7. Interactions saisies sur l'appareil

`POST /api/mobile/interactions` crée un appel, une note ou un rendez-vous. Pensé pour le hors ligne : l'app peut rejouer la requête sans créer de doublon.

En-tête obligatoire : `Idempotency-Key: <UUID>`, généré une fois par interaction et conservé avec elle jusqu'à la confirmation du serveur.

Corps JSON, ou `multipart/form-data` quand un audio accompagne la note :

| Champ | Requis | Valeurs |
| --- | --- | --- |
| `subjectType` | oui | `LEAD` ou `CLIENT` |
| `subjectId` | oui | id du lead ou du compte client |
| `kind` | oui | `CALL`, `NOTE` ou `MEETING` |
| `body` | oui | texte, transcription vocale faite sur l'appareil comprise ; 1 à 20 000 caractères |
| `lang` | non | `fr` ou `en`, langue du texte détectée sur l'appareil |
| `direction` | non | `IN`, `OUT` ou `NONE` (défaut) |
| `occurredAt` | non | date ISO 8601 ; maintenant par défaut |
| `subject` | non | 500 caractères au plus |
| `audio` | non | fichier (multipart) `audio/m4a`, `audio/mp4`, `audio/aac` ou `audio/mpeg`, 15 Mo au plus |

Réponse : `201` à la création, `200` pour un rejeu de la même requête.

```json
{
  "interaction": { "_id": "…", "subjectType": "LEAD", "subjectId": "…", "kind": "NOTE", "body": "…", "lang": "en", "occurredAt": "…", "author": "…", "audio": { "filename": "…", "originalName": "note.m4a", "mimeType": "audio/m4a", "size": 48213 } },
  "audio": { "filename": "…", "originalName": "note.m4a", "mimeType": "audio/m4a", "size": 48213, "url": "/api/mobile/interactions/<id>/audio" }
}
```

Erreurs : `400 IDEMPOTENCY_KEY_REQUIRED`, `400 INVALID_AUDIO`, `400` (champ invalide), `404` (sujet absent ou hors de mon périmètre d'écriture : un commercial écrit sur ses leads), `409 IDEMPOTENCY_CONFLICT` (clé déjà utilisée pour un autre contenu), `413 AUDIO_TOO_LARGE`.

Le rejeu compare le contenu hors audio : renvoyer la même clé avec le même texte rend l'interaction existante, sans stocker un second fichier.

`GET /api/mobile/interactions/:id/audio` renvoie le fichier audio, avec le même contrôle d'accès que la fiche du lead ou du client.

## 8. Langues

- **Interface** : `locale` dans les préférences (section 2).
- **Notifications** : rédigées par le serveur dans la langue de l'utilisateur (section 3).
- **Contenu libre** : le serveur stocke toujours l'original, jamais une traduction, et n'appelle aucun service de traduction. Les interactions portent un `lang` facultatif fourni par l'app ; les entrées de timeline et la synchro le renvoient quand il est connu. Pour les autres textes (messages, tickets, demandes, lignes de devis), l'app détecte la langue à l'affichage.

## 9. Avant la mise en production

- Variables d'environnement APNs : `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` (contenu PEM de la clé `.p8`, les retours à la ligne peuvent être écrits `\n`). Sans elles, l'envoi APNs est désactivé et le reste fonctionne.
- Reprise des données : `npm --prefix backend run migrate:project-update-timestamps:dry`, puis sans `:dry`. Elle date les mises à jour de projet antérieures à la synchro, sans quoi l'app ne les verrait jamais.
