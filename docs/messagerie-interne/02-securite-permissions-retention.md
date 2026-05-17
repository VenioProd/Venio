# Spec #26 — Sécurité, permissions, rétention

> Issue : [VenioProd/Venio#26](https://github.com/VenioProd/Venio/issues/26)
> Owner : Claude (Opus 4.7)
> Phase : P0 Cadrage
> S'appuie sur : [01 cadrage produit](./01-cadrage-produit.md)

## 1. Modèle d'accès

### Principe : membership-driven
**Aucun message n'est lisible si l'utilisateur n'est pas membre de la
conversation.** Le rôle global (`SUPER_ADMIN`/`ADMIN`/`VIEWER`) ne donne
**jamais** d'accès passif au contenu d'autres conversations. Un
`SUPER_ADMIN` qui veut lire un channel privé doit y être ajouté
explicitement (audit log à la clé).

Cette règle est centralisée dans un helper unique côté backend, à utiliser
dans **toutes** les routes et **tous** les handlers socket :

```js
// backend/src/lib/messaging/access.js
export async function assertConversationAccess(userId, conversationId, {
  requireOwner = false,
} = {}) {
  // 1. Charger la conversation (non supprimée).
  // 2. Charger le membership { userId, conversationId, leftAt: null }.
  // 3. Si pas de membership → 403 Forbidden.
  // 4. Si requireOwner et membership.role !== 'OWNER' → 403.
  // 5. Retourner { conversation, membership }.
}
```

### Visibilité d'un channel privé
Un non-membre **ne doit pas pouvoir détecter** l'existence d'un channel
privé : les endpoints de listing/recherche filtrent côté serveur sur
`membership.exists`. La recherche full-text [#33] ne retourne que les
messages des conversations dont l'utilisateur est membre.

## 2. Permissions globales (rôle ↔ permission)

Nouvelles permissions à ajouter dans
[`backend/src/lib/permissions.js`](../../backend/src/lib/permissions.js) :

```js
VIEW_INTERNAL_MESSAGING:    'view_internal_messaging',
SEND_INTERNAL_MESSAGES:     'send_internal_messages',
MANAGE_INTERNAL_CHANNELS:   'manage_internal_channels',
MODERATE_INTERNAL_MESSAGES: 'moderate_internal_messages',
```

Mapping aux rôles existants du repo :

| Permission | SUPER_ADMIN | ADMIN | VIEWER | CLIENT |
|---|:---:|:---:|:---:|:---:|
| `VIEW_INTERNAL_MESSAGING` | ✅ | ✅ | ✅ | ❌ |
| `SEND_INTERNAL_MESSAGES` | ✅ | ✅ | ❌ | ❌ |
| `MANAGE_INTERNAL_CHANNELS` | ✅ | ✅ | ❌ | ❌ |
| `MODERATE_INTERNAL_MESSAGES` | ✅ | ❌ | ❌ | ❌ |

Notes :
- `VIEWER` lit (utile pour observateurs/auditeurs internes) mais ne poste
  pas et ne crée pas de conversation. S'il est ajouté à un DM, il peut le
  lire mais le composer est désactivé côté front et l'API renvoie 403.
- `CLIENT` n'a aucune permission. Toute route messagerie répond 403 pour
  un `CLIENT` même si la conversation existe.
- **Pas de rôle `RH`** : le repo n'en a pas. Si besoin d'un rôle "RH"
  plus tard, l'ajouter dans `ROLE_PERMISSIONS` avec les mêmes permissions
  qu'`ADMIN` (ou un sous-ensemble), sans impact sur la messagerie.

## 3. Permissions locales à la conversation

Concept *owner de conversation* (champ `role` sur `InternalConversationMember` :
`'OWNER'` ou `'MEMBER'`). Indépendant du rôle global.

| Action | Auteur du message | Member | Owner conv | SUPER_ADMIN global |
|---|:---:|:---:|:---:|:---:|
| Lire les messages | ✅ si membre | ✅ | ✅ | ✅ si membre |
| Envoyer un message | ✅ | ✅ | ✅ | ✅ si membre |
| Éditer son message (≤ 15 min) | ✅ | — | — | — |
| Éditer un message d'autrui | ❌ | ❌ | ❌ | ❌ |
| Supprimer son message | ✅ | — | — | — |
| Supprimer un message d'autrui | ❌ | ❌ | ✅ (modération) | ✅ (`MODERATE_INTERNAL_MESSAGES`) |
| Inviter (channel public) | — | ✅ | ✅ | ✅ |
| Inviter (channel privé) | — | ❌ | ✅ | ✅ |
| Retirer un membre | — | ❌ | ✅ | ✅ |
| Archiver une conversation | — | ❌ | ✅ | ✅ |
| Désarchiver | — | ❌ | ✅ | ✅ |
| Supprimer hard une conv archivée | — | ❌ | ❌ | ✅ (≥ 30 j d'archive) |

Toute mutation côté API doit passer par `assertConversationAccess`
**puis** vérifier la matrice ci-dessus, **puis** logguer dans `AuditLog`
si l'action est dans la liste §6.

## 4. Suppression et rétention

### Soft-delete par défaut
Tous les objets (`InternalConversation`, `InternalConversationMember`,
`InternalMessage`) ont `deletedAt: Date | null` et `deletedBy: ObjectId | null`.
Les requêtes API filtrent `deletedAt: null` par défaut.

### Conservation
- **Messages actifs** : conservés indéfiniment (jusqu'à archivage manuel
  ou suppression).
- **Messages soft-deleted** : conservés **90 jours**, puis purgés par job
  nightly. La purge supprime le document Mongo (hard) ; l'`AuditLog`
  garde une trace de l'action de suppression (pas du contenu).
- **Conversations archivées** : restent lisibles indéfiniment pour les
  membres (lecture seule). Suppression hard possible par `SUPER_ADMIN`
  après ≥ 30 jours d'archivage.
- **Conversations soft-deleted** : conservées **90 jours** comme les
  messages, puis purge complète (conv + memberships + messages).

### Pas d'export utilisateur au MVP
Pas de "request my data" exposé au MVP. Si un `SUPER_ADMIN` doit extraire
les messages d'un utilisateur (départ, contentieux), il passe par un
script ad-hoc à écrire avec accès Mongo direct, **avec entrée AuditLog
obligatoire**.

### RGPD — droit à l'effacement
Quand un `User` est supprimé (compte clos), un job de nettoyage :
1. Conserve les `InternalMessage` du user (l'historique reste cohérent
   pour les autres membres), mais **anonymise** côté API :
   `author: { _id: <stable>, name: 'Utilisateur supprimé', email: null }`.
2. Marque le membership avec `leftAt: Date.now()` dans toutes ses
   conversations.
3. Ne supprime **pas** le contenu textuel (le message reste lisible pour
   les autres). Justification : conserver un échange professionnel
   ressemble à conserver un email professionnel ; le contenu n'appartient
   pas exclusivement à l'auteur.

À valider explicitement avec l'utilisateur (voir §7).

## 5. Anti-abus

### Limites de taille / volume
| Limite | Valeur MVP | Réponse en cas de dépassement |
|---|---|---|
| Taille d'un message texte | 4 000 caractères | HTTP 400 `MESSAGE_TOO_LONG` |
| Messages par minute par user | 30 | HTTP 429 `RATE_LIMITED`, retry-after 30s |
| Créations de conversation par heure par user | 20 | HTTP 429 |
| Invitations par minute par user (toutes conv confondues) | 30 | HTTP 429 |
| Taille pièce jointe (P5) | 10 MiB | HTTP 413 |
| Types MIME autorisés (P5) | `image/*`, `application/pdf`, `application/zip`, types Office, `text/*` | HTTP 415 |
| Total PJ par message (P5) | 5 fichiers | HTTP 400 |

Les rate limits sont par `req.user.userId`. Implémentation suggérée :
middleware in-memory (token bucket) pour le MVP, à migrer vers Redis si
le backend devient multi-instance.

### Anti-flood socket
Un socket émet au max **100 événements client→serveur / minute**.
Au-delà : kick socket avec event `kicked:rate_limited`, l'utilisateur
doit reconnecter manuellement.

### Validation d'entrée
Toutes les routes valident le body via un schéma simple (helper maison
ou Joi si déjà introduit) :
- IDs Mongo : `mongoose.Types.ObjectId.isValid()`.
- Texte : trim + longueur.
- Énums (`type`, `role`) : whitelist stricte.

### Pas de HTML brut
Le composer envoie du **texte brut**. Le rendu côté front parse le
Markdown minimal (voir [01 §4]) avec une lib safe (DOMPurify si on
génère du HTML, sinon rendu via composant React qui n'injecte jamais
`dangerouslySetInnerHTML`).

## 6. Audit

Entries `AuditLog` obligatoires pour :

| Action | Entité | Acteur | Champs |
|---|---|---|---|
| Création de channel | `InternalConversation` | tout admin | type, name, slug |
| Archivage | `InternalConversation` | owner / SUPER_ADMIN | reason? |
| Suppression hard | `InternalConversation` | SUPER_ADMIN | conv.name, message count |
| Ajout d'un membre dans un channel privé | `InternalConversationMember` | inviteur | invité, role |
| Retrait d'un membre | `InternalConversationMember` | owner / SUPER_ADMIN | retiré |
| Suppression d'un message d'autrui | `InternalMessage` | owner conv / SUPER_ADMIN | author, conv, reason? |
| Action d'un SUPER_ADMIN sur un message dont il n'est pas auteur ni owner | `InternalMessage` | SUPER_ADMIN | always logged |

Les autres actions courantes (envoi de message, lecture, édition par
l'auteur, ajout dans channel public) ne sont **pas** loggées (volume
trop élevé). Volume estimé : ≤ quelques dizaines d'entries/jour.

## 7. Authentification socket

Détaillé dans la spec d'impl
[#29](https://github.com/VenioProd/Venio/issues/29). Règles posées ici :

- Socket handshake **doit** fournir le JWT (header `Authorization: Bearer`
  ou auth payload Socket.IO). Pas de token → refus immédiat (pas de mode
  anonyme, pas de fallback cookie).
- Le payload JWT est vérifié avec le même `JWT_SECRET` que le middleware
  `auth.js`. La signature et `exp` sont vérifiés.
- Au handshake, on charge `User` depuis Mongo pour vérifier
  `role ∈ ADMIN_ROLES` ET `hasPermission(role, VIEW_INTERNAL_MESSAGING)`.
  Un user qui a perdu son rôle entre l'émission du token et la connexion
  est refusé même si le token est valide.
- Le token est **revérifié toutes les 15 minutes** côté serveur (timer
  par socket). Si invalide/expiré → kick + event `kicked:auth_expired`.
- Le front re-connecte automatiquement après refresh du token (mécanisme
  d'`apiFetch` existant). À nous d'ajouter un refresh JWT si pas déjà
  présent (à vérifier avec Codex).

### Isolation des rooms
- Une room Socket.IO par conversation : `conv:<conversationId>`.
- Au connect, le serveur join automatiquement le socket aux rooms de
  **toutes** les conversations dont l'user est membre (typiquement < 100
  par user au MVP, négligeable).
- Les events `join` côté client ne sont pas auto-trustés : le serveur
  rejoint lui-même la room après vérification membership.
- Les events `message:created`, `message:updated`, `message:deleted`,
  `member:added`, `member:removed`, `typing:start`, `typing:stop`,
  `read:update` sont émis **uniquement à la room** correspondante.
  Jamais en broadcast global.

## 8. Risques principaux et mitigations

| Risque | Mitigation |
|---|---|
| Fuite cross-conversation via socket mal scopé | `assertConversationAccess` côté handler socket, jamais de broadcast global |
| Récupération d'un message supprimé via cache front | Soft-delete renvoie `{ deletedAt, content: null }` côté API, jamais le contenu original |
| Brute force d'IDs de conversation (privée) | Listing filtré côté serveur ; un GET direct par ID répond 404 si non-membre (pas 403, pour ne pas confirmer l'existence) |
| Spam / harcèlement | Rate limits §5, modération owner + SUPER_ADMIN, audit log |
| Tokens JWT volés réutilisés sur socket | Re-vérification 15 min, possibilité de "kick all sessions of user X" par SUPER_ADMIN (post-MVP) |
| Croissance non bornée de la collection messages | Index temporel + archivage auto 180 j (voir [01 §5]), purge soft-deleted à 90 j |
| Markdown malicieux / XSS | Pas d'HTML brut, parsing Markdown via lib safe, jamais de `dangerouslySetInnerHTML` |
| `VIEWER` qui peut envoyer via API en bypassant le front | Middleware `requirePermission(SEND_INTERNAL_MESSAGES)` sur POST messages |

## 9. Critères d'acceptation

- [x] Permissions globales mappées aux rôles **réels** du repo.
- [x] Helper `assertConversationAccess` défini comme point d'entrée unique.
- [x] Règles d'accès applicables côté REST **et** socket (même helper).
- [x] Soft-delete + purge 90 j explicités.
- [x] Anti-abus chiffrés (rate limits, taille, types MIME) prêts pour
      implémentation.
- [x] AuditLog : liste précise des actions à tracer.
- [x] Auth socket : JWT obligatoire, revérif 15 min, isolation par room.
- [x] Risques listés avec mitigations.

## 10. Décisions à valider explicitement

1. **Comportement RGPD à la suppression d'un user** (§4) : on garde le
   contenu textuel et on anonymise l'auteur ? Ou on supprime tout son
   contenu ? Slack/Teams gardent le contenu (vision "communication
   professionnelle"). À confirmer.
2. **Permission `VIEWER` en lecture** : on autorise un `VIEWER` à être
   ajouté à une conversation et à lire, ou on l'exclut totalement ?
   J'ai supposé "oui à la lecture, non à l'écriture". Confirmer.
3. **Re-vérification JWT toutes les 15 min** : ok ou trop souvent ?
   Slack rafraîchit beaucoup moins, mais on n'a pas (encore) de refresh
   token côté Venio.
4. **Pas de rate limit "par IP"** : on rate-limite par `userId` (un user
   authentifié), pas par IP. OK ?
