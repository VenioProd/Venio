# Messagerie interne Venio — specs

Specs produit/sécurité/UX/notifications pour la messagerie interne Slack-like
de l'admin Venio. Référentiel commun pour les issues du projet GitHub
[Venio — Messagerie interne Slack-like](https://github.com/orgs/VenioProd/projects/5).

| Fichier | Issue | Sujet |
|---|---|---|
| [01-cadrage-produit.md](./01-cadrage-produit.md) | [#25](https://github.com/VenioProd/Venio/issues/25) | Cadrage produit, types de conversations, MVP |
| [02-securite-permissions-retention.md](./02-securite-permissions-retention.md) | [#26](https://github.com/VenioProd/Venio/issues/26) | Permissions, accès, suppression, anti-abus |
| [03-ux-admin.md](./03-ux-admin.md) | [#30](https://github.com/VenioProd/Venio/issues/30) | UX, structure de l'app, états, conventions visuelles |
| [04-mentions-unread-notifications.md](./04-mentions-unread-notifications.md) | [#32](https://github.com/VenioProd/Venio/issues/32) | Règles mentions, unread, notifications in-app |

## Écarts entre les issues et la réalité du repo

Issues rédigées en supposant TypeScript et un modèle `Message` existant.
Réalité du repo au moment de la rédaction (commit `eee90ce`) :

- **Le backend est en JavaScript ESM** (`backend/src/*.js`), pas TypeScript.
  Les modèles Mongoose sont en JS. Les types TS mentionnés dans #27 sont à
  comprendre comme « schémas Mongoose + JSDoc si besoin ».
- **Le frontend est en JSX** (`src/**/*.jsx`), pas TS. Le fichier
  `src/types/messaging.types.ts` mentionné dans #31 sera donc
  `src/lib/messaging.types.js` (ou un JSDoc inline).
- **Il n'existe aucun modèle `Message`** (le seul modèle proche est
  `ProjectUpdate.js`, un log d'updates de projet, pas un chat). La consigne
  "ne pas modifier le modèle Message projet existant" est sans objet :
  partir de zéro avec `InternalConversation`, `InternalConversationMember`,
  `InternalMessage`.
- **Les rôles réels** (`backend/src/lib/permissions.js`) sont
  `SUPER_ADMIN`, `ADMIN`, `VIEWER` et `CLIENT`. **Il n'y a pas de rôle `RH`.**
  Les specs ci-dessous utilisent les rôles réels. Si un rôle `RH` est ajouté
  plus tard, l'extension est triviale (nouvelle entrée dans `ROLE_PERMISSIONS`).
- **Il n'y a pas de `NotificationContext`**. La spec #33 le fait créer ; les
  règles définies dans [04](./04-mentions-unread-notifications.md) en
  tiennent compte.
- **Socket.IO n'est pas installé.** L'installation est dans le scope de #29.

Ces specs s'alignent sur le repo réel et **prévalent** sur le wording des
issues en cas d'ambiguïté.
