# Spec #25 — Cadrage produit messagerie interne

> Issue : [VenioProd/Venio#25](https://github.com/VenioProd/Venio/issues/25)
> Owner : Claude (Opus 4.7)
> Phase : P0 Cadrage

## 1. Objectif et hors-scope

**Objectif.** Donner à l'équipe interne Venio un canal de discussion type
Slack, **réservé aux utilisateurs admin** (rôles `SUPER_ADMIN`, `ADMIN`,
`VIEWER`). Pas de chat client, pas de messagerie projet.

**Hors-scope explicite :**
- Pas d'accès pour les utilisateurs `CLIENT`. Une conversation entre un
  admin et un client passe par les outils existants (mail, espace client,
  futur chat projet) — pas par la messagerie interne.
- Pas de fédération externe (Slack Connect, email-in, SMS).
- Pas d'appels audio/vidéo, pas d'écran partagé.
- Pas de webhooks ni d'apps tierces au MVP.
- Pas de chiffrement E2E (les messages sont stockés en clair en base ; voir
  [02 sécurité](./02-securite-permissions-retention.md)).
- Pas de bot ni d'intégration LLM au MVP.

## 2. Types de conversations

Trois types au MVP. Le type est figé à la création (on ne convertit pas un
DM en channel).

| Type | Code interne | Membres | Visibilité | Découverte |
|---|---|---|---|---|
| **Channel public** | `CHANNEL_PUBLIC` | 2 → N | Tous les admins peuvent lire et rejoindre | Listé dans le "browse channels" |
| **Channel privé** | `CHANNEL_PRIVATE` | 2 → N | Seuls les membres voient l'existence | Sur invitation uniquement |
| **DM** | `DM` | 2 → N (jusqu'à 8 au MVP) | Seuls les participants | Création directe entre admins |

Notes :
- Les "DMs de groupe" (3+ personnes) sont des `DM` avec plusieurs membres.
  On ne crée **pas** de quatrième type "GROUP". La distinction front se fait
  sur `members.length > 2`.
- Un channel a un `slug` unique (kebab-case, ≤ 40 car.) et un `name` lisible
  (≤ 60 car.). Les DMs n'ont ni slug ni name (le titre affiché est dérivé
  des participants).
- Pas de "channel par défaut #general" auto-créé au MVP. À évaluer post-MVP
  si les usages le réclament.

## 3. Actions et qui peut quoi

Les permissions formelles (mapping rôle ↔ permission) sont dans
[02 sécurité §2](./02-securite-permissions-retention.md). Vue produit ici.

### Création
- **Channel public/privé** : tout admin avec la permission
  `MANAGE_INTERNAL_CHANNELS` (par défaut `SUPER_ADMIN` + `ADMIN`, voir [02]).
  Le créateur devient le premier membre **avec rôle "owner" de la
  conversation** (concept *local* à la conversation, distinct du rôle global).
- **DM** : tout admin avec la permission `SEND_INTERNAL_MESSAGES`. Pas de
  validation, ouverture immédiate.

### Inviter
- **Channel public** : tout membre peut inviter n'importe quel admin.
- **Channel privé** : seul un *owner* de la conversation peut inviter.
- **DM** : on **n'invite pas** dans un DM existant. Pour ajouter quelqu'un,
  on ouvre un nouveau DM groupé incluant les anciens participants + le
  nouveau. Justification : pas d'historique partiel, pas de surprise sur ce
  que le nouveau peut lire rétroactivement.

### Quitter
- **Channel public/privé** : oui, n'importe quel membre. Si le dernier
  *owner* quitte, l'ancienneté (ordre `joinedAt` croissant) promeut un nouvel
  *owner* automatiquement. Si plus aucun membre, le channel est archivé
  (voir §5).
- **DM** : on ne quitte pas un DM ; on le "masque" (champ
  `hiddenAt` côté membership). Il réapparaît au prochain message reçu.

### Archiver
- **Channel public/privé** : un *owner* de la conversation ou un
  `SUPER_ADMIN` peut archiver. Le channel devient lecture seule pour tout
  le monde et disparaît des listes par défaut (filtre "Archivés" pour le
  retrouver). **Pas de suppression dure** (voir [02 §4 rétention]).
- **DM** : pas d'archivage. Le "masquage" suffit.

### Supprimer une conversation
- Seul `SUPER_ADMIN` peut supprimer **et uniquement un channel déjà
  archivé** depuis ≥ 30 jours. Action soft (`deletedAt`/`deletedBy`),
  inaccessible côté API, restaurable par un `SUPER_ADMIN`.

## 4. Règles de messages au MVP

### Édition
- **Auteur uniquement**, pendant 15 minutes après l'envoi. Au-delà,
  édition interdite (lisibilité de l'historique, pas de surprise sur les
  citations / quotes). Tag visuel `(modifié)` affiché après édition.
- Pas d'édition rétroactive du contenu d'autrui, même par `SUPER_ADMIN` —
  uniquement suppression (voir [02 §3]).

### Suppression
- **Auteur** : peut supprimer son propre message à tout moment (soft).
- **Owner de la conversation** : peut supprimer n'importe quel message de
  la conversation (modération channel).
- **SUPER_ADMIN** : peut supprimer n'importe quel message, n'importe où.
- Suppression = soft (`deletedAt`/`deletedBy`). Le message est remplacé par
  un placeholder `[message supprimé]` côté UI. L'audit log conserve qui,
  quand, pourquoi (champ optionnel `reason`).

### Mentions
- `@nom` mentionne un utilisateur. Le système de mentions est détaillé
  dans [04 mentions/unread/notifs](./04-mentions-unread-notifications.md).
- `@channel` et `@here` sont **hors-scope MVP** (à n'autoriser que dans
  les channels publics si on les active plus tard, jamais en DM groupé,
  pour éviter le spam de notifs).

### Threads
- **Hors-scope MVP**. Ré-évalué en P5 (voir issue
  [#34](https://github.com/VenioProd/Venio/issues/34)). Le composer du
  MVP n'expose pas l'action "répondre dans un thread".

### Réactions emoji
- **Hors-scope MVP**. Idem #34.

### Pièces jointes
- **Hors-scope MVP** (voir issue
  [#35](https://github.com/VenioProd/Venio/issues/35)). Le composer du
  MVP accepte uniquement du texte. La détection d'URL est triggers une
  *unfurl* simple côté front (juste le lien cliquable, pas de prévisu).

### Limites de contenu
- Texte : 4 000 caractères max par message (rejet HTTP 400 côté API et
  garde côté composer).
- Pas de Markdown étendu au MVP. Support minimal : `**gras**`, `*italique*`,
  `\`code inline\``, blocs ``` ```code``` ```, listes `- ` et `1. `, et
  liens auto-détectés. Pas d'images inline, pas de tables.
- Pas de mentions externes (emails non-admin, URLs slack), juste le texte
  brut tel quel.

## 5. Cycle de vie d'une conversation

```
[créée] → [active] → [archivée] → [supprimée soft]
              ↑          |
              └──────────┘   (désarchivage par owner ou SUPER_ADMIN)
```

- Une conversation active sans message depuis **180 jours** passe en
  archivée automatiquement (job nightly). Les owners reçoivent une notif
  15 jours avant.
- Une conversation archivée reste lisible (lecture seule) indéfiniment
  pour ses membres. Elle est supprimable hard manuellement par
  `SUPER_ADMIN` après 30 jours d'archivage (voir [02 §4]).

## 6. Articulation avec l'existant

**Ne pas confondre avec :**
- `ProjectUpdate` (`backend/src/models/ProjectUpdate.js`) — log d'updates
  de projet pour les clients. Reste dédié à son usage.
- Le futur "chat projet client/admin" évoqué dans les issues : ce chat
  n'existe pas encore en code. Quand il sera construit, il aura son propre
  domaine (collections séparées) ; la messagerie interne ne s'y mélange
  jamais.

**Cohabite avec :**
- `User` (`backend/src/models/User.js`) — la liste des admins (rôles
  `SUPER_ADMIN`/`ADMIN`/`VIEWER`) alimente le "people picker" du composer
  et du new-DM.
- `AdminShell` (`src/components/AdminShell.jsx`) — la page messagerie
  s'intègre **dans** la nav top admin (point d'entrée nouveau lien
  "Messages" + badge unread). Pas de second shell.
- `AuditLog` (`backend/src/models/AuditLog.js`) — utilisé pour tracer
  suppressions et changements de membership (voir [02 §3]).

## 7. Critères d'acceptation de la spec

- [x] Types de conversations listés, distinction figée à la création.
- [x] Permissions de création/invitation/quitte/archive/suppression par
      type, alignées avec les rôles réels du repo.
- [x] Règles d'édition (auteur + 15 min) et suppression (soft, qui peut).
- [x] Mentions/threads/réactions/PJ explicitement situés MVP / hors-MVP.
- [x] Limites de contenu (4 000 car., Markdown minimal).
- [x] Cycle de vie d'une conversation et job d'archivage auto.
- [x] Hors-scope explicite (E2E, fédération, bots, audio/vidéo).
- [x] Articulation avec `ProjectUpdate`, `User`, `AdminShell`, `AuditLog`.

## 8. Décisions à valider explicitement (avant impl Codex)

À demander à l'utilisateur :

1. **Délai d'édition** : 15 min suffit ? Slack = illimité, Teams = illimité,
   Discord = illimité. J'ai choisi un délai court pour préserver
   l'historique en cas de modération.
2. **Auto-archivage à 180 j** : ok ou retirer ? Évite la pollution de
   sidebar mais peut surprendre.
3. **`@channel`/`@here` au MVP** : on garde hors-scope ou besoin urgent ?
4. **DM groupés** : limite à 8 ok, ou plus large (Slack = 9) ?
