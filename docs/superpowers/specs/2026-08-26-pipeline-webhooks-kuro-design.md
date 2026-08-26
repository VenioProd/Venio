# Pipeline d'événements sortant — webhooks vers Kuro

**Date** : 2026-08-26 · **Statut** : validé en brainstorming, à implémenter

## Objectif

Pousser en temps réel vers Kuro (et tout autre consommateur externe) les événements
qui produisent aujourd'hui une notification admin dans Venio, via des webhooks HTTP
signés, configurables et rejouables depuis l'espace admin. L'espace admin, lui,
continue d'être servi par le système de notifications existant (in-app + web push +
socket) : ce chantier n'y ajoute que la configuration des endpoints et le journal
des livraisons.

## Décisions de cadrage (validées)

1. **Canal** : webhook signé poussé par Venio (pas de polling imposé — le pull
   existant `GET /api/v1/agent/notifications` reste le canal de rattrapage de Kuro).
2. **Périmètre** : miroir des notifications admin — tout événement qui crée une
   notification devient éligible, filtrable par type sur chaque endpoint.
3. **Côté admin** : page « Webhooks » (CRUD endpoints + journal des livraisons +
   rejeu manuel). Aucun changement aux notifications admin elles-mêmes.
4. **Généricité** : Kuro est le premier endpoint, le mécanisme est multi-endpoints.

## Contexte : ce qui existe et qui est réutilisé

- `backend/src/lib/notifications.ts` — `createNotification` (in-app + push + socket,
  préférences par type via `shouldNotify`, dédup par `dedupeKey`). **Point d'émission.**
- `backend/src/lib/notifyHelpers.ts` — `notifySuperAdmins`, `notifyInternalAdmins`,
  `notifyUsers` : broadcasts qui appellent `createNotification` N fois (une par
  destinataire). **Source du problème de dédup traité ci-dessous.**
- `backend/src/lib/external/hmac.ts` — signature HMAC style Stripe déjà spécifiée
  (`payload = timestamp.rawBody`, header `X-Venio-Signature: sha256=<hex>`,
  `X-Venio-Timestamp`, comparaison timing-safe). Utilisée aujourd'hui en entrant ;
  le pipeline réutilise la même convention en **sortant** (fonction de calcul
  partagée, pas de duplication).
- `backend/src/lib/secretBox.ts` — `encryptSecret`/`decryptSecret` (chiffrement
  symétrique par clé d'environnement). **Stockage du secret d'endpoint** : le secret
  doit rester déchiffrable pour signer chaque envoi (contrairement aux tokens
  entrants, hashés).
- `backend/src/automation/` — moteur d'automations : `registerAutomation` (registry),
  scheduler à tick (`CHECK_INTERVAL_MS`) supportant les expressions cron,
  `AutomationDefinition` (`triggerType: 'cron'`, `retryable`, `maxRetries`).
  **Porte le job de retry des livraisons.**
- `backend/src/types/enums.ts` (union `NotificationType`), modèle
  `backend/src/models/Notification.ts` (enum Mongoose), préférences
  `lib/notificationPreferences.ts` — **les trois registres à synchroniser** pour tout
  nouveau type (bug connu : l'enum du modèle est désynchronisée et fait échouer
  silencieusement certains types ; ne pas reproduire).
- `rbac-matrix.json` ↔ `backend/src/lib/permissions.ts` — synchro verrouillée par
  `backend/src/__tests__/rbac-matrix.test.ts` ; la navigation admin dérive de
  `matrix.navigation`.
- `backend/src/lib/audit/auditHelpers.ts` + modèle `AuditLog` — traçabilité des
  actions admin (CRUD endpoints, rejeu).

## Modèle de données

### `WebhookEndpoint` (nouveau, `backend/src/models/WebhookEndpoint.ts`)

| Champ | Type | Notes |
|---|---|---|
| `name` | string, requis | ex. « Kuro » |
| `url` | string, requis | `https://` obligatoire (exception : `http://localhost` et `http://127.0.0.1` hors production) |
| `secretEncrypted` | string, requis | secret généré serveur (32 octets aléatoires, hex), chiffré via `secretBox.encryptSecret` ; affiché en clair **une seule fois** à la création/régénération |
| `eventTypes` | string[] | filtre sur `NotificationType` ; tableau vide = tous les types |
| `isActive` | boolean, défaut `true` | togglable dans l'UI |
| `consecutiveFailures` | number, défaut 0 | remis à 0 à chaque livraison réussie |
| `disabledAt` / `disabledReason` | Date / string, null | posés par l'auto-désactivation (`AUTO_FAILURES`) ou le toggle manuel (`MANUAL`) |
| `lastSuccessAt` / `lastFailureAt` | Date, null | affichage santé dans l'UI |
| `createdBy` | ObjectId → User | |
| timestamps | | |

### `WebhookDelivery` (nouveau, `backend/src/models/WebhookDelivery.ts`)

| Champ | Type | Notes |
|---|---|---|
| `endpoint` | ObjectId → WebhookEndpoint, requis, indexé | |
| `eventId` | string, requis | UUID généré à l'émission, partagé entre les livraisons d'un même événement vers plusieurs endpoints |
| `eventType` | string, requis, indexé | `NotificationType` |
| `payload` | objet figé | le corps JSON exact envoyé |
| `status` | `PENDING` \| `DELIVERED` \| `FAILED`, indexé | `FAILED` = épuisement des retries |
| `attempts` | [{ `at`, `httpStatus`, `error`, `durationMs` }] | max 6 entrées (initiale + 5 retries) |
| `nextRetryAt` | Date, null, indexé | consommé par le job de retry |
| `createdAt` | | **index TTL 30 jours** (purge automatique) |

## Émission — dédup des broadcasts (point délicat)

Un événement logique doit produire **une** livraison par endpoint, pas une par
destinataire de notification.

- Nouveau helper `backend/src/lib/webhookEvents.ts` : `emitWebhookEvent({ type,
  title, message, link, metadata })` — construit le payload, résout les endpoints
  actifs dont le filtre matche `type`, crée les `WebhookDelivery` (statut `PENDING`)
  et déclenche la tentative immédiate (fire-and-forget, `Promise.allSettled`, jamais
  bloquant pour l'appelant).
- `createNotification` gagne un paramètre optionnel `skipWebhook?: boolean` :
  - Les trois broadcasts de `notifyHelpers.ts` appellent `emitWebhookEvent` **une
    fois** en tête de fonction, puis passent `skipWebhook: true` à chacun de leurs
    `createNotification`.
  - Un appel direct à `createNotification` (sans `skipWebhook`) émet lui-même
    l'événement après création réussie de la notification.
- Règles d'émission précises (dans cet ordre) :
  1. `skipWebhook: true` → jamais d'émission (réservé aux broadcasts).
  2. Broadcast (`notifySuperAdmins`/`notifyInternalAdmins`/`notifyUsers`) → émission
     **inconditionnelle** en tête d'appel : les préférences in-app, qui sont par
     utilisateur, ne s'appliquent pas au pipeline (son filtre à lui est
     `eventTypes` sur l'endpoint).
  3. Appel direct à `createNotification` **sans** `dedupeKey` → émission après la
     tentative de création, même si la préférence in-app du destinataire a empêché
     la création de la ligne.
  4. Appel direct **avec** `dedupeKey` (alertes récurrentes) → émission uniquement
     si la résolution du `dedupeKey` a **créé** une nouvelle ligne ; une mise à
     jour d'alerte non lue existante ne réémet rien. Cas limite assumé : si la
     préférence in-app du destinataire est coupée, aucune ligne n'existe pour
     porter la dédup et l'alerte récurrente réémet à chaque exécution — accepté
     en V1 (chemin rarissime : les alertes à `dedupeKey` passent par les
     broadcasts), documenté ici pour ne pas être découvert en prod.

### Payload livré

```json
{
  "id": "<eventId UUID>",
  "type": "<NotificationType>",
  "occurredAt": "<ISO 8601>",
  "title": "…",
  "message": "…",
  "link": "/admin/…",
  "metadata": { }
}
```

`link` est le chemin relatif tel que stocké dans la notification ; `metadata` est
transmis tel quel (les chantiers ultérieurs pourront l'enrichir type par type sans
toucher au pipeline).

## Livraison, signature, retries

- **Requête** : `POST url`, `Content-Type: application/json`, timeout **10 s**,
  **aucune redirection suivie** (`redirect: 'manual'` → toute 3xx est un échec),
  corps = payload sérialisé une seule fois (le même buffer sert à signer et à
  envoyer).
- **Headers** :
  - `X-Venio-Event: <type>`
  - `X-Venio-Delivery: <WebhookDelivery._id>`
  - `X-Venio-Timestamp: <unix seconds>`
  - `X-Venio-Signature: sha256=HEX(HMAC_SHA256(secret, timestamp + "." + rawBody))`
    — exactement la convention documentée dans `lib/external/hmac.ts` ; la fonction
    de calcul est extraite/réutilisée depuis ce module.
- **Succès** : tout statut HTTP 2xx. Effets : delivery `DELIVERED`,
  `endpoint.consecutiveFailures = 0`, `lastSuccessAt` posé.
- **Échec** : réseau, timeout, 3xx/4xx/5xx. Tentative enregistrée dans `attempts`,
  `nextRetryAt` posé selon le backoff : **1 min → 5 min → 30 min → 2 h → 12 h**,
  puis statut `FAILED`.
- **Job de retry** : automation `webhooks.delivery_retry` enregistrée via
  `registerAutomation` (`triggerType: 'cron'`, expression toutes les minutes),
  qui reprend les deliveries `PENDING` avec `nextRetryAt <= now` (lot capé, ex. 50).
- **Auto-désactivation** : à **20** échecs consécutifs sur un endpoint (toutes
  livraisons confondues), `isActive = false`, `disabledReason = 'AUTO_FAILURES'`,
  et notification admin `WEBHOOK_ENDPOINT_DISABLED` via `notifySuperAdmins`
  (émise avec `skipWebhook` implicite — voir Sécurité : jamais de webhook à propos
  des webhooks, pour éviter toute boucle).

## API admin

Routes sous `backend/src/routes/admin/webhooks.ts`, montées comme les autres
routers admin (`auth` + `requireAdmin` + permission par route).

| Méthode & chemin | Permission | Effet |
|---|---|---|
| `GET /api/admin/webhooks` | `VIEW_WEBHOOKS` | liste des endpoints (sans secret) + santé |
| `POST /api/admin/webhooks` | `MANAGE_WEBHOOKS` | crée ; répond avec le **secret en clair, une seule fois** |
| `PATCH /api/admin/webhooks/:id` | `MANAGE_WEBHOOKS` | name/url/eventTypes/isActive (réactivation remet `consecutiveFailures` à 0) |
| `POST /api/admin/webhooks/:id/rotate-secret` | `MANAGE_WEBHOOKS` | régénère, répond une seule fois |
| `POST /api/admin/webhooks/:id/test` | `MANAGE_WEBHOOKS` | envoie un événement `WEBHOOK_TEST` immédiat, répond avec le résultat de la tentative |
| `DELETE /api/admin/webhooks/:id` | `MANAGE_WEBHOOKS` | supprime endpoint + deliveries associées |
| `GET /api/admin/webhooks/:id/deliveries` | `VIEW_WEBHOOKS` | journal paginé, filtres `status`/`eventType` |
| `GET /api/admin/webhooks/deliveries/:deliveryId` | `VIEW_WEBHOOKS` | détail (payload + tentatives) |
| `POST /api/admin/webhooks/deliveries/:deliveryId/replay` | `MANAGE_WEBHOOKS` | rejoue immédiatement (nouvelle delivery liée au même `eventId`) |

Toutes les écritures passent par `auditHelpers` (`AuditLog`).

## UI admin

Page `/admin/webhooks` (entrée de navigation dérivée de `matrix.navigation`,
visible avec `view_webhooks`) :

- **Liste des endpoints** : nom, URL tronquée, filtre de types (badge « Tous » ou
  compteur), santé (dernier succès / échecs consécutifs), toggle actif, actions
  (modifier, tester, régénérer le secret, supprimer). Secret affiché une seule fois
  dans une modale à la création/rotation, avec avertissement explicite.
- **Éditeur d'endpoint** : nom, URL, sélecteur multiple des `NotificationType`
  (vide = tous), avec libellés français lisibles.
- **Journal des livraisons** : table filtrable (endpoint, statut, type), colonnes
  date / type / statut / tentatives / durée ; ligne dépliable ou panneau de détail
  avec payload JSON et historique des tentatives ; bouton « Rejouer ».
- Style : thème MONOLITHE portail (`src/styles/monolithe-portal.css`), primitives
  admin existantes (`admin-table-wrapper`, badges carrés, boutons inversés).

## Nouveaux types de notification

À ajouter aux **trois** registres (`types/enums.ts`, enum du modèle
`Notification.ts`, `NOTIFICATION_TYPES` des préférences) + test de synchro :

- `WEBHOOK_ENDPOINT_DISABLED` — endpoint auto-désactivé après échecs répétés.
- `WEBHOOK_TEST` — type réservé aux envois de test (n'apparaît que dans le
  pipeline, jamais créé comme notification admin).

## Sécurité

- Secret : 32 octets aléatoires (`crypto.randomBytes`), stocké chiffré
  (`secretBox`), jamais loggé, jamais renvoyé après la première réponse.
- `https://` obligatoire hors localhost/dev ; validation d'URL au POST/PATCH
  (refus des adresses non résolvables en URL valide ; pas de suivi de redirection
  à l'envoi).
- **Anti-boucle** : les événements de type `WEBHOOK_*` ne sont jamais réémis dans
  le pipeline (garde dans `emitWebhookEvent`).
- Permissions : `VIEW_WEBHOOKS` / `MANAGE_WEBHOOKS` ajoutées à `rbac-matrix.json`
  **et** `backend/src/lib/permissions.ts` (test de synchro existant) ; attribution
  calquée sur `MANAGE_ADMINS` (SUPER_ADMIN seul en gestion, ADMIN en lecture —
  à confirmer à l'implémentation avec la matrice réelle).
- Variable d'env de `secretBox` documentée dans la config de déploiement.

## Côté Kuro (hors périmètre Venio, à documenter)

- Kuro expose un endpoint HTTPS qui : vérifie `X-Venio-Signature` (recalcul
  timing-safe, tolérance d'horloge ±5 min sur `X-Venio-Timestamp`), répond `2xx`
  immédiatement (traitement asynchrone), déduplique par `id`.
- La spec livre un **récepteur de référence** (~30 lignes, exemple dans la doc de
  la page admin ou le README backend) montrant la vérification de signature — pas
  de code côté Kuro dans ce chantier.
- Rattrapage : `GET /api/v1/agent/notifications` (API agent existante) reste
  disponible si Kuro veut réconcilier après une indisponibilité.

## Tests

- **Signature** : un serveur HTTP de test vérifie que la signature reçue se
  recalcule avec le secret (mêmes conventions que les tests HMAC entrants).
- **Dédup broadcast** : `notifySuperAdmins` avec 3 admins → exactement 1 delivery
  par endpoint ; `createNotification` direct → 1 delivery ; mise à jour par
  `dedupeKey` d'une alerte non lue → 0 nouvelle delivery.
- **Filtres** : endpoint avec `eventTypes` restreint ne reçoit pas les autres types ;
  tableau vide reçoit tout.
- **Backoff & FAILED** : échecs successifs → `nextRetryAt` suit 1 min/5 min/30 min/
  2 h/12 h puis `FAILED` ; le job de retry ne reprend que les `PENDING` échus.
- **Auto-désactivation** : 20 échecs consécutifs → `isActive=false` +
  notification `WEBHOOK_ENDPOINT_DISABLED` (et pas de webhook émis pour elle).
- **Rejeu** : nouvelle delivery avec le même `eventId`, payload identique.
- **Refus d'URL** : `http://` externe rejeté en production, accepté pour localhost
  en dev.
- **RBAC** : routes refusées sans les permissions ; test de synchro matrice mis à
  jour.
- **TTL** : index TTL présent sur `WebhookDelivery.createdAt` (vérification
  d'index, pattern des tests d'intégrité d'index existants).

## Hors périmètre

- Enrichissement structuré des `metadata` par type d'événement (chantier ultérieur,
  le payload transmet déjà `metadata` tel quel).
- Tout code côté Kuro (seul le récepteur de référence est documenté).
- File d'événements consultable par curseur (`/api/v1/agent/events`) — écartée au
  cadrage au profit du webhook + pull existant.
- Webhooks à destination des clients (le pipeline est admin/agent uniquement).
- Nettoyage global de la désynchro d'enum `Notification` préexistante (dette
  signalée, traitée par ailleurs).
