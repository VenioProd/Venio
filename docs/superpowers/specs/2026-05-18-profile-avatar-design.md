# Upload de photo de profil — Design Spec

**Date :** 2026-05-18  
**Statut :** Approuvé

---

## Contexte

Les utilisateurs Venio (clients et admins) n'ont pas de photo de profil. Les sidebars et le chat affichent actuellement des initiales CSS. Cette spec couvre l'ajout de l'upload de photo de profil pour tous les rôles.

---

## Périmètre

- Upload et suppression d'avatar depuis la page profil (clients et admins)
- Affichage dans : sidebar, page profil, messagerie projet, tickets
- Stockage sur le filesystem local (pattern existant Multer)
- Aucune dépendance supplémentaire

---

## Section 1 — Modèle de données

### Backend (`IUser` / `userSchema`)

Nouveau champ dans `backend/src/types/models/user.ts` :

```ts
avatarUrl: string
```

Nouveau champ dans `backend/src/models/User.ts` :

```ts
avatarUrl: { type: String, default: '' },
```

Le champ contient un chemin absolu accessible par le navigateur, ex. `/api/avatars/64abc123.jpg`.

### Frontend (`src/types/auth.types.ts`)

Ajout dans l'interface `User` :

```ts
avatarUrl?: string
```

---

## Section 2 — Backend

### Structure des fichiers uploadés

- Répertoire : `uploads/avatars/`
- Nom de fichier : `{userId}{ext}` (ex. `64abc123.jpg`)
- Un seul fichier par utilisateur — le nouveau upload écrase l'ancien automatiquement

### Route `POST /api/auth/avatar`

- Middleware : `auth` (JWT requis)
- Parser : Multer `diskStorage` vers `uploads/avatars/`
- Validation :
  - MIME acceptés : `image/jpeg`, `image/png`, `image/webp`
  - Taille max : 2 Mo
  - Rejet si fichier absent ou MIME invalide (400)
- Traitement :
  1. Supprimer l'ancien fichier si `user.avatarUrl` est déjà renseigné
  2. Mettre à jour `user.avatarUrl = '/api/avatars/{filename}'`
  3. Sauvegarder
- Réponse : `{ avatarUrl: string }`

### Route `DELETE /api/auth/avatar`

- Middleware : `auth`
- Supprime le fichier disque si présent
- Remet `user.avatarUrl = ''`
- Réponse : `{ success: true }`

### Route `GET /api/avatars/:filename`

- Publique (pas d'auth)
- Sert les fichiers depuis `uploads/avatars/` via `res.sendFile`
- Protection path-traversal : `path.resolve` + vérification que le chemin commence par le répertoire cible (même pattern que `backend/src/routes/documents.ts`)
- Header : `Cache-Control: public, max-age=86400`

### Enregistrement des routes

Dans `backend/src/index.ts` :
- Monter `GET /api/avatars/:filename` avant les middlewares d'auth
- Ajouter la route avatar dans le router `auth`

### Populate messagerie

Dans la route de récupération des messages du projet, étendre le `.populate('sender', 'name role avatarUrl')` pour inclure `avatarUrl`.

### Populate tickets

Même ajout sur les routes de tickets qui renvoient `createdBy` ou `author` peuplé.

---

## Section 3 — Composant `UserAvatar`

### Fichier : `src/components/UserAvatar.tsx`

```tsx
interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size?: number
}
```

- Si `avatarUrl` est non vide → `<img src={avatarUrl} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} onError={fallbackToInitial} />`
- Sinon → `<div>` avec l'initiale (style identique aux `.admin-sb-avatar` / `.client-sb-avatar` existants)
- `onError` : bascule sur l'initiale si l'image est introuvable (pas de boucle infinie)
- `size` défaut : `36`

### Intégrations

| Fichier | Changement |
|---|---|
| `src/components/AdminSidebar.tsx` | Remplace `<div className="admin-sb-avatar">{initial}</div>` par `<UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={36} />` |
| `src/components/ClientSidebar.tsx` | Même remplacement avec `.client-sb-avatar` |
| `src/components/ClientProjectChat.tsx` | Étendre `MessageSender` avec `avatarUrl?`, remplacer `<div className="project-chat-avatar">` par `<UserAvatar>` |
| Composant(s) de tickets | Même pattern après populate |

---

## Section 4 — Pages de profil

### `src/pages/espace-client/Profile.tsx` et `src/pages/admin/AdminProfile.tsx`

Ajouter une section "Photo de profil" en haut du formulaire d'informations générales :

- Affiche `<UserAvatar name={user.name} avatarUrl={user.avatarUrl} size={80} />`
- Bouton "Modifier la photo" → déclenche un `<input type="file" accept="image/jpeg,image/png,image/webp" />` caché
- À la sélection du fichier :
  1. Validation client : type MIME + taille ≤ 2 Mo (message d'erreur si dépassé)
  2. `POST /api/auth/avatar` avec `FormData`
  3. Appel `refreshUser()` pour mettre à jour le contexte global
- Bouton "Supprimer la photo" (visible uniquement si `user.avatarUrl` est renseigné) → `DELETE /api/auth/avatar` + `refreshUser()`
- Feedback visuel : spinner pendant l'upload, message de succès/erreur cohérent avec le reste de la page

---

## Contraintes et règles

- **Pas de preview optimiste** : l'avatar s'actualise via `refreshUser()` après confirmation serveur, évitant les désynchronisations
- **Un seul fichier par utilisateur** : le fichier est nommé `{userId}{ext}`, tout nouvel upload supprime d'abord l'ancien
- **Fallback toujours présent** : `UserAvatar` affiche toujours une initiale si l'image est absente ou en erreur
- **Pas de redimensionnement** : l'image est stockée telle quelle dans la limite des 2 Mo ; Sharp peut être ajouté plus tard
- **Route avatars publique** : les avatars ne sont pas des données sensibles, une URL directe suffît sans token

---

## Fichiers touchés

| Fichier | Type de changement |
|---|---|
| `backend/src/types/models/user.ts` | Ajout champ `avatarUrl` |
| `backend/src/models/User.ts` | Ajout champ `avatarUrl` |
| `backend/src/routes/auth.ts` | Nouvelles routes `POST /avatar` et `DELETE /avatar` |
| `backend/src/index.ts` | Route `GET /api/avatars/:filename` + déclaration |
| `backend/src/routes/client/messages.ts` | Populate `avatarUrl` dans sender |
| `backend/src/routes/client/tickets.ts` | Populate `avatarUrl` dans author/createdBy |
| `src/types/auth.types.ts` | Ajout `avatarUrl?` dans `User` |
| `src/components/UserAvatar.tsx` | Nouveau composant |
| `src/components/AdminSidebar.tsx` | Intégration `UserAvatar` |
| `src/components/ClientSidebar.tsx` | Intégration `UserAvatar` |
| `src/components/ClientProjectChat.tsx` | Intégration `UserAvatar` + type `MessageSender` |
| `src/pages/espace-client/Profile.tsx` | Section upload avatar |
| `src/pages/admin/AdminProfile.tsx` | Section upload avatar |
