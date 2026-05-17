# Spec #32 — Mentions, unread, notifications

> Issue : [VenioProd/Venio#32](https://github.com/VenioProd/Venio/issues/32)
> Owner : Claude (Opus 4.7)
> Phase : P4 Notifications
> S'appuie sur : [01](./01-cadrage-produit.md), [02](./02-securite-permissions-retention.md), [03](./03-ux-admin.md)

## 1. Vocabulaire

- **Unread** : message non lu par un utilisateur dans une conversation
  dont il est membre. Calcul basé sur le couple
  `(InternalConversationMember.lastReadAt, InternalMessage.createdAt)`.
- **Mention** : occurrence dans un message d'un pattern résolu à un
  utilisateur ciblé. Au MVP, uniquement `@<userId>` (mention directe
  d'un membre de la conv).
- **Notification** : entrée persistée dans la collection `Notification`
  (à créer, voir §6) qui matérialise une raison pour alerter un user
  hors de la conversation courante. Visible dans un panneau global
  (P4, voir [03 §13]). À ne pas confondre avec un *toast* éphémère
  ou un email.

## 2. Règles de mention

### Pattern stocké
Côté serveur, on stocke le message avec son **texte brut intact**.
Une table dérivée `mentions: [{ userId, offset, length }]` est calculée
au moment du `POST /messages` :

```js
// pseudo
const mentions = []
for (const match of body.match(/@<([0-9a-f]{24})>/g) || []) {
  const userId = match.slice(2, -1)
  if (await isMemberOfConversation(userId, conversationId)) {
    mentions.push({ userId, offset: match.index, length: match.length })
  }
}
```

Règles :
- **Seuls les membres** de la conversation peuvent être mentionnés. Une
  tentative de mention d'un non-membre est silencieusement ignorée
  côté serveur (pas d'erreur, le pattern reste affiché tel quel).
- **Doublons** : `@<id>` 5 fois dans le même message = 1 seule mention
  (et 1 seule notification). Dédup côté serveur.
- **Auto-mention** : si l'auteur se mentionne lui-même, la mention
  est **ignorée** (pas d'unread auto, pas de notif).
- **`@channel` et `@here`** : hors-scope MVP (voir [01 §4]). Le pattern
  `@channel` reste affiché tel quel comme texte simple. Si on l'active
  plus tard : autorisé uniquement par owner conv ou `SUPER_ADMIN`, et
  jamais dans un DM.

### Pattern saisi
Le composer affiche `@Nom Prénom` à l'utilisateur mais envoie
`@<userId>` dans le body (résolution côté client à l'insertion via
l'autocomplete people picker, voir [03 §8]). C'est la même approche
que Slack, garantit la stabilité face aux renommages.

### Rendu front
Au rendu, `@<userId>` est remplacé par un chip cliquable :
```
@<641a...e5b>  →  [Alice Martin]  (chip cyan, ouvre profil/DM au clic)
```
- Si `userId` ne résout pas (user supprimé, anonymisé), rendu
  `@Utilisateur supprimé` en gris.
- Le chip est **plus saillant** si le viewer est lui-même la cible
  (fond cyan plus marqué).

## 3. Règles unread

### Modèle
Sur chaque `InternalConversationMember` :
```
lastReadAt: Date              // timestamp du dernier message lu
lastReadMessageId: ObjectId?  // optionnel, dénormalisation utile
hasUnreadMention: boolean     // flag rapide pour badge rouge sidebar
mutedUntil: Date | null       // post-MVP (notifs/DnD)
```

`hasUnreadMention` est dénormalisé pour éviter un scan des messages
non lus à chaque rendu sidebar. Recalculé :
- À `true` quand un message non lu mentionne l'user (au moment du
  fan-out, voir §6).
- À `false` au `POST /conversations/:id/read`.

### Marquage "lu"
- **Auto** : ouvrir la conversation et que le **dernier** message soit
  visible (intersect observer sur le dernier `MessageItem`) déclenche
  `POST /conversations/:id/read` avec `lastReadAt = now()` (debounce
  500 ms pour éviter la rafale).
- **Manuel** : pas d'action explicite "marquer comme lu" au MVP.
- **Marquer comme non lu** : action contextuelle sur un message
  (menu kebab → "Marquer comme non lu à partir d'ici") qui fixe
  `lastReadAt = message.createdAt - 1ms`. Disponible mais pas mis en
  avant.

### Compteur unread
- Affiché par conv dans la sidebar (voir [03 §5]).
- Calculé côté serveur dans la réponse à `GET /conversations` :
  ```
  unreadCount = InternalMessage.count({
    conversation: convId,
    createdAt: { $gt: member.lastReadAt },
    author: { $ne: userId },         // pas son propre dernier message
    deletedAt: null,
  })
  ```
- Plafond affichage front à `99+` (mais valeur réelle envoyée au socket).
- Le total **global** (badge `AdminNav`) = somme `unreadCount` sur
  toutes les conv non mutées.

### Pas de "unread" via socket spammé
La conversation courante n'incrémente **pas** son compteur unread
quand un message arrive et que le composer/le list a le focus : on
émet directement `read:update` au serveur si l'user lit en temps réel.

## 4. Règles de notification (in-app)

### Quand crée-t-on une notification ?
| Évènement | Crée-t-on une notif ? |
|---|---|
| Mention directe `@<userId>` d'un user | **Oui**, type `INTERNAL_MENTION` |
| Nouveau message dans un DM (1:1 ou groupé) où le user n'est pas en focus | **Oui**, type `INTERNAL_DM` |
| Nouveau message dans un channel sans mention | **Non** (juste unread + badge sidebar) |
| Ajout dans un channel privé | **Oui**, type `INTERNAL_INVITED` |
| Retrait d'un channel | Non |
| Archivage d'une conv dont je suis owner | **Oui**, type `INTERNAL_CONV_ARCHIVED` |
| Message édité me mentionnant après coup | **Oui** (mention diff calc, voir §5) |
| Message supprimé | Non, mais retirer notifs `INTERNAL_MENTION`/`INTERNAL_DM` associées (cascade) |

### Quand l'auteur est-il exclu ?
**Toujours**. Un user ne se notifie jamais lui-même, même via auto-mention
(§2) ou si quelqu'un cite son propre message.

### Dédoublonnage avec l'event socket
Le user destinataire reçoit potentiellement deux signaux pour la même
mention :
1. L'event socket `message:created` (qui rafraîchit la conv si ouverte).
2. La notification persistée (visible dans le panneau global).

**Règle** : la notif est **toujours créée** côté serveur, mais le
panneau notifs côté front la marque automatiquement comme **lue**
si l'user a la conversation courante ouverte ET visible (page non
hidden, focus). Ça évite les "blink" intempestifs sans perdre la
trace historique.

### Notifs hors in-app
**Aucun email, push web, ou desktop notification au MVP.** L'utilisateur
voit les notifs uniquement quand l'admin est ouvert dans un onglet.
Évolutions possibles post-MVP : push web notification opt-in,
notification par email si offline > X minutes.

## 5. Cas particulier — édition introduisant une mention

Scénario : Alice envoie "salut tout le monde", ne mentionne personne.
30 secondes plus tard, elle édite et écrit "salut @Bob".

- Au moment de l'édition, on **recalcule** la liste `mentions`.
- Pour chaque mention **nouvelle** (présente dans la version éditée,
  absente de la version précédente) → on crée la notif `INTERNAL_MENTION`
  pour le destinataire.
- Pour chaque mention **retirée** par l'édition → on supprime la notif
  associée (si elle existait et n'a pas été lue ; si elle a été lue,
  on la laisse pour préserver l'historique).
- L'unread/`hasUnreadMention` du destinataire est mis à jour en
  conséquence.

Ça évite un trou (édition pour mentionner discrètement = pas de notif)
sans permettre l'abus inverse (mentionner puis éditer pour faire
disparaître la notif déjà lue).

## 6. Backend — modèle `Notification`

À créer dans `backend/src/models/Notification.js`. Schéma minimal :

```js
{
  recipient:    ObjectId ref User,  // pour qui
  type:         enum [
                  'INTERNAL_MENTION',
                  'INTERNAL_DM',
                  'INTERNAL_INVITED',
                  'INTERNAL_CONV_ARCHIVED',
                ],
  conversation: ObjectId ref InternalConversation,
  message:      ObjectId ref InternalMessage,   // null pour INVITED/ARCHIVED
  actor:        ObjectId ref User,               // qui a déclenché
  readAt:       Date | null,                     // null = non lu
  createdAt:    Date (timestamps),
}
```

Index :
- `{ recipient: 1, readAt: 1, createdAt: -1 }` pour le listing
  "mes notifs non lues" et "mes notifs récentes".
- `{ message: 1 }` pour la cascade au soft-delete.

API associées (incluses dans le scope #33) :
- `GET /api/admin/notifications?unread=1&limit=50&before=<cursor>`
- `POST /api/admin/notifications/:id/read`
- `POST /api/admin/notifications/read-all`

Fan-out :
- À la création/édition d'un message, le handler back appelle
  `createNotificationsForMessage(msg)` qui :
  1. Calcule destinataires (mentions résolues + autres membres DM).
  2. Filtre auteur, filtre déjà mutés (post-MVP).
  3. Insère N entries `Notification` (un seul `insertMany`).
  4. Émet `notification:created` à `user:<recipientId>` rooms.

## 7. Frontend — NotificationContext

À créer dans `src/context/NotificationContext.jsx` (n'existe pas
encore dans le repo). Expose :

```js
{
  notifications: Notification[],        // 50 dernières, triées desc
  unreadCount: number,                  // total non lues
  loading: bool,
  markAsRead: (id) => Promise<void>,
  markAllAsRead: () => Promise<void>,
  loadMore: () => Promise<void>,
}
```

Comportement :
- Au mount : `GET /notifications?unread=1&limit=50`.
- À l'event socket `notification:created` : prepend dans la liste,
  incrémente `unreadCount`.
- À `notification:read` (multi-onglets) : marque la notif locale comme
  lue.

**Le NotificationContext est consommé** :
- Par `AdminNav` pour afficher un nouveau bouton "🔔 N" à droite,
  ouvrant un dropdown (panneau notif global).
- Par `MessagingContext` pour décider du badge mention sidebar (lecture
  de `hasUnreadMention` + comparaison de fraîcheur).
- Par le browser tab title pour préfixer `(N) Venio Admin` quand non
  lues > 0 (utile en multi-onglets).

## 8. Liens profonds

Chaque notif `INTERNAL_MENTION` ou `INTERNAL_DM` doit pouvoir ouvrir
**la bonne conversation au bon message** au clic.

URL cible :
```
/admin/messages/c/<conversationId>/m/<messageId>
```

Comportement front :
- Page Messages détecte `messageId` dans l'URL.
- Charge la conversation en demandant `?around=<messageId>` (curseur
  centré, à exposer dans `GET /messages` côté Codex).
- Scroll auto au message, ajoute une highlight cyan pendant 2 s.
- Si user n'est plus membre → toast d'erreur (voir [03 §10]) +
  redirige vers `/admin/messages`.
- Marque la notif comme lue au clic (avant même la navigation,
  optimiste).

## 9. Edge cases

| Cas | Comportement |
|---|---|
| User mentionné quitte la conv avant d'avoir lu | Notif reste, mais clic → 403, on supprime la notif et toaste "Conv inaccessible" |
| Message contenant une mention est supprimé | Toutes les notifs `INTERNAL_MENTION` non lues liées sont supprimées (cascade backend) ; les lues sont conservées pour historique |
| User mentionné est supprimé (cf §4 RGPD [02]) | Notifs lui appartenant sont purgées avec son compte |
| Channel archivé pendant qu'on l'a ouvert | Toast "Cette conversation a été archivée" + composer disable, scroll/lecture conservés |
| Membre invité à un channel privé puis retiré avant ouverture | Notif `INTERNAL_INVITED` est conservée mais marque "Vous n'avez plus accès" au clic |
| Plusieurs onglets ouverts, l'un marque "lu" | Émettre `read:update` au room user, les autres onglets mettent à jour leur UI optimistement |
| Notif `INTERNAL_DM` mais l'user est en focus sur la conv | Notif marquée lue à la création (voir §4 dédoublonnage) ; pas de badge clignotant |

## 10. Compteurs et performance

- Le calcul `unreadCount` est fait côté API uniquement dans
  `GET /conversations` (vue sidebar) ; ailleurs, on s'appuie sur le
  delta socket.
- Au connect socket, le serveur émet un event `unread:snapshot` une
  fois avec la map `{ convId: count, hasMention }` pour tous les
  channels de l'user. Évite N round-trips REST.
- Aucun polling REST récurrent : pas de "tick 30s qui rafraîchit les
  unread". Tout passe par socket. Si la socket est down, on accepte
  un état figé jusqu'à reconnexion (banner [03 §10]).
- L'index `{ conversation: 1, createdAt: -1 }` sur `InternalMessage`
  (voir #27) suffit pour le count incremental ; on évite un
  `count()` complet à chaque hit en mémorisant le dernier seen côté
  `MessagingContext`.

## 11. Critères d'acceptation

- [x] Pattern mention `@<userId>` défini, résolution serveur + rendu
      front.
- [x] Auto-mention et mention d'un non-membre explicitement ignorées.
- [x] `@channel`/`@here` hors-scope MVP, comportement futur cadré.
- [x] Modèle unread `lastReadAt` + `hasUnreadMention` dénormalisé,
      règles de marquage "lu" auto + manuel.
- [x] Notifications : matrice "quand crée-t-on une notif", auteur
      toujours exclu, dédoublonnage avec socket.
- [x] Cas édition introduisant/retirant une mention traité.
- [x] Modèle `Notification` posé (schéma, index, API).
- [x] `NotificationContext` côté front décrit, intégration `AdminNav`.
- [x] Liens profonds vers message précis, fallback membre retiré.
- [x] Edge cases couverts (suppression, archivage, multi-onglets).
- [x] Pas de polling REST, fan-out via socket uniquement.

## 12. Décisions à valider explicitement

1. **Pas de notifs email/desktop au MVP** : confirmer que c'est OK et
   pas un blocker fonctionnel (équipe interne ≤ 20 personnes).
2. **Mention introduite par édition crée une notif** : Slack se
   comporte comme ça, j'ai aligné. Confirmer.
3. **Notif `INTERNAL_DM`** sur chaque message d'un DM, ou seulement
   le premier de la session ? J'ai choisi "chaque message" pour
   alignement Slack. Si trop bruyant → règle "1 notif par DM jusqu'à
   ce qu'elle soit lue, ensuite la suivante", post-MVP.
4. **Préfixer `(N)` dans le tab title** : ok ou trop intrusif ?
