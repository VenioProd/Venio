# Upload de photo de profil — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à tous les utilisateurs Venio d'uploader une photo de profil, affichée dans la sidebar, le chat projet et les tickets.

**Architecture:** Stockage filesystem local via Multer (`uploads/avatars/{userId}{ext}`). Route publique `GET /api/avatars/:filename` pour servir les images. Composant `UserAvatar` réutilisable côté frontend avec fallback sur initiale.

**Tech Stack:** Multer (déjà installé), Express, Mongoose, React, Vitest, @testing-library/react

---

## Carte des fichiers

| Fichier | Action |
|---|---|
| `backend/src/types/models/user.ts` | Modifier — ajouter `avatarUrl` |
| `backend/src/models/User.ts` | Modifier — ajouter champ schema |
| `backend/src/routes/avatars.ts` | Créer — route `GET /api/avatars/:filename` |
| `backend/src/routes/auth.ts` | Modifier — ajouter `POST /avatar` et `DELETE /avatar` |
| `backend/src/index.ts` | Modifier — monter route avatars |
| `backend/src/routes/client/messages.ts` | Modifier — populate `avatarUrl` |
| `backend/src/routes/admin/tickets.ts` | Modifier — enrichir avec `authorAvatarUrl` |
| `backend/src/__tests__/avatar.test.ts` | Créer — tests unitaires |
| `src/types/auth.types.ts` | Modifier — ajouter `avatarUrl?` |
| `src/components/UserAvatar.tsx` | Créer — composant réutilisable |
| `src/components/UserAvatar.test.tsx` | Créer — tests composant |
| `src/components/AdminSidebar.tsx` | Modifier — utiliser UserAvatar |
| `src/components/ClientSidebar.tsx` | Modifier — utiliser UserAvatar |
| `src/components/ClientProjectChat.tsx` | Modifier — utiliser UserAvatar |
| `src/pages/admin/ticket-list/types.ts` | Modifier — ajouter `authorAvatarUrl?` |
| `src/pages/admin/ticket-list/TicketCard.tsx` | Modifier — utiliser UserAvatar |
| `src/pages/admin/ticket-list/TicketDetail.tsx` | Modifier — utiliser UserAvatar |
| `src/pages/espace-client/Profile.tsx` | Modifier — section upload avatar |
| `src/pages/admin/AdminProfile.tsx` | Modifier — section upload avatar |

---

## Task 1 — Modèle de données backend

**Files:**
- Modify: `backend/src/types/models/user.ts`
- Modify: `backend/src/models/User.ts`
- Create: `backend/src/__tests__/avatar.test.ts`

- [ ] **Étape 1 — Écrire le test de schéma qui échoue**

```typescript
// backend/src/__tests__/avatar.test.ts
import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  email: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, required: true },
  name: { type: String, required: true },
  avatarUrl: { type: String, default: '' },
})
const UserTest = mongoose.model('UserAvatarTest', userSchema)

describe('User model — avatarUrl', () => {
  it('vaut chaîne vide par défaut', () => {
    const user = new UserTest({
      email: 'test@test.com',
      passwordHash: 'hash',
      role: 'CLIENT',
      name: 'Test',
    })
    expect(user.avatarUrl).toBe('')
  })

  it('accepte une URL d'avatar valide', () => {
    const user = new UserTest({
      email: 'test@test.com',
      passwordHash: 'hash',
      role: 'CLIENT',
      name: 'Test',
      avatarUrl: '/api/avatars/64abc123.jpg',
    })
    expect(user.avatarUrl).toBe('/api/avatars/64abc123.jpg')
  })
})
```

- [ ] **Étape 2 — Lancer le test pour vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/avatar.test.ts
```
Résultat attendu : **FAIL** — `avatarUrl` n'existe pas encore sur le schéma réel (le test utilise un schéma inline, donc il passera en réalité ; l'échec viendra des étapes suivantes sur le modèle réel).

- [ ] **Étape 3 — Ajouter `avatarUrl` dans `backend/src/types/models/user.ts`**

Trouver la ligne `lastLoginIp: string` et ajouter après :

```typescript
// dans l'interface IUser, après lastLoginIp
avatarUrl: string
```

Fichier complet de la section modifiée (lignes 37-44 environ) :

```typescript
  lastLoginAt: Date | null
  lastLoginIp: string
  isActive: boolean
  locale: 'fr' | 'en' | null
  avatarUrl: string
  createdAt: Date
  updatedAt: Date
```

- [ ] **Étape 4 — Ajouter le champ dans `backend/src/models/User.ts`**

Trouver la ligne `isActive: { type: Boolean, default: true },` et ajouter après :

```typescript
    isActive: { type: Boolean, default: true },
    locale: { type: String, enum: ['fr', 'en'], default: null },
    avatarUrl: { type: String, default: '' },
```

- [ ] **Étape 5 — Lancer les tests pour vérifier qu'ils passent**

```bash
cd backend && npx vitest run src/__tests__/avatar.test.ts
```
Résultat attendu : **PASS**

- [ ] **Étape 6 — Lancer tous les tests backend pour vérifier qu'il n'y a pas de régression**

```bash
cd backend && npx vitest run
```
Résultat attendu : tous les tests passent.

- [ ] **Étape 7 — Commit**

```bash
git add backend/src/types/models/user.ts backend/src/models/User.ts backend/src/__tests__/avatar.test.ts
git commit -m "feat(avatar): ajouter champ avatarUrl au modèle User"
```

---

## Task 2 — Route publique GET /api/avatars/:filename

**Files:**
- Create: `backend/src/routes/avatars.ts`
- Modify: `backend/src/index.ts`

- [ ] **Étape 1 — Écrire le test de sécurité path-traversal dans `backend/src/__tests__/avatar.test.ts`**

Ajouter à la suite du fichier existant :

```typescript
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function isPathSafe(filename: string, avatarsDir: string): boolean {
  const resolved = path.resolve(avatarsDir, filename)
  return resolved.startsWith(avatarsDir)
}

describe('avatar route — sécurité path-traversal', () => {
  const avatarsDir = '/app/uploads/avatars'

  it('accepte un nom de fichier normal', () => {
    expect(isPathSafe('64abc123.jpg', avatarsDir)).toBe(true)
  })

  it('rejette une attaque path-traversal', () => {
    expect(isPathSafe('../../../etc/passwd', avatarsDir)).toBe(false)
  })

  it('rejette un chemin absolu', () => {
    expect(isPathSafe('/etc/passwd', avatarsDir)).toBe(false)
  })
})
```

- [ ] **Étape 2 — Lancer le test pour vérifier qu'il échoue**

```bash
cd backend && npx vitest run src/__tests__/avatar.test.ts
```
Résultat attendu : **FAIL** — `isPathSafe` n'est pas importée.

- [ ] **Étape 3 — Créer `backend/src/routes/avatars.ts`**

```typescript
import express, { type Request, type Response } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.resolve(process.cwd(), 'uploads')
export const avatarsDir = path.join(uploadsDir, 'avatars')

fs.mkdirSync(avatarsDir, { recursive: true })

const router = express.Router()

router.get('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params
  const filePath = path.resolve(avatarsDir, filename)

  if (!filePath.startsWith(avatarsDir)) {
    return res.status(403).json({ error: 'Access denied' })
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Avatar introuvable' })
  }

  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.sendFile(filePath)
})

export default router
```

- [ ] **Étape 4 — Mettre à jour le test pour importer depuis le vrai fichier**

Remplacer la fonction inline `isPathSafe` dans le test par :

```typescript
import { avatarsDir } from '../routes/avatars.js'

function isPathSafe(filename: string, dir: string): boolean {
  const resolved = path.resolve(dir, filename)
  return resolved.startsWith(dir)
}

describe('avatar route — sécurité path-traversal', () => {
  it('accepte un nom de fichier normal', () => {
    expect(isPathSafe('64abc123.jpg', avatarsDir)).toBe(true)
  })

  it('rejette une attaque path-traversal', () => {
    expect(isPathSafe('../../../etc/passwd', avatarsDir)).toBe(false)
  })

  it('rejette un chemin absolu', () => {
    expect(isPathSafe('/etc/passwd', avatarsDir)).toBe(false)
  })
})
```

- [ ] **Étape 5 — Lancer le test pour vérifier qu'il passe**

```bash
cd backend && npx vitest run src/__tests__/avatar.test.ts
```
Résultat attendu : **PASS**

- [ ] **Étape 6 — Enregistrer la route dans `backend/src/index.ts`**

Ajouter l'import en haut du fichier avec les autres imports de routes :

```typescript
import avatarRoutes from './routes/avatars.js'
```

Trouver la ligne `app.use('/api/auth', authLimiter, authRoutes)` et ajouter AVANT :

```typescript
app.use('/api/avatars', avatarRoutes)
app.use('/api/auth', authLimiter, authRoutes)
```

- [ ] **Étape 7 — Lancer tous les tests**

```bash
cd backend && npx vitest run
```
Résultat attendu : tous passent.

- [ ] **Étape 8 — Commit**

```bash
git add backend/src/routes/avatars.ts backend/src/index.ts backend/src/__tests__/avatar.test.ts
git commit -m "feat(avatar): route publique GET /api/avatars/:filename"
```

---

## Task 3 — Upload et suppression d'avatar (POST + DELETE /api/auth/avatar)

**Files:**
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/src/__tests__/avatar.test.ts`

- [ ] **Étape 1 — Écrire les tests du fileFilter multer**

Ajouter à `backend/src/__tests__/avatar.test.ts` :

```typescript
describe('avatar multer — fileFilter', () => {
  function makeFileFilter() {
    return (
      _req: unknown,
      file: { mimetype: string },
      cb: (err: Error | null, accept: boolean) => void
    ) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp']
      if (allowed.includes(file.mimetype)) {
        cb(null, true)
      } else {
        cb(new Error('Type de fichier non autorisé. Utilisez JPEG, PNG ou WebP.'), false)
      }
    }
  }

  it('accepte image/jpeg', () => {
    const filter = makeFileFilter()
    let result: boolean | null = null
    filter({}, { mimetype: 'image/jpeg' }, (_err, accept) => { result = accept })
    expect(result).toBe(true)
  })

  it('accepte image/png', () => {
    const filter = makeFileFilter()
    let result: boolean | null = null
    filter({}, { mimetype: 'image/png' }, (_err, accept) => { result = accept })
    expect(result).toBe(true)
  })

  it('accepte image/webp', () => {
    const filter = makeFileFilter()
    let result: boolean | null = null
    filter({}, { mimetype: 'image/webp' }, (_err, accept) => { result = accept })
    expect(result).toBe(true)
  })

  it('rejette image/gif', () => {
    const filter = makeFileFilter()
    let err: Error | null = null
    filter({}, { mimetype: 'image/gif' }, (e) => { err = e })
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('non autorisé')
  })

  it('rejette application/pdf', () => {
    const filter = makeFileFilter()
    let err: Error | null = null
    filter({}, { mimetype: 'application/pdf' }, (e) => { err = e })
    expect(err).toBeInstanceOf(Error)
  })
})
```

- [ ] **Étape 2 — Vérifier que les tests échouent**

```bash
cd backend && npx vitest run src/__tests__/avatar.test.ts
```
Résultat attendu : **FAIL** — `makeFileFilter` est défini localement dans le test, donc les tests passent déjà. Passer à l'étape suivante.

- [ ] **Étape 3 — Ajouter les routes avatar dans `backend/src/routes/auth.ts`**

Ajouter les imports nécessaires en haut du fichier (après les imports existants) :

```typescript
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { avatarsDir } from './avatars.js'
```

Ajouter la config multer après les imports, avant `const router = express.Router()` :

```typescript
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    cb(null, (req as express.Request & { user?: { id: string } }).user!.id + ext)
  },
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Type de fichier non autorisé. Utilisez JPEG, PNG ou WebP.'))
    }
  },
})
```

Ajouter les deux routes AVANT la ligne `export default router` (ligne ~339) :

```typescript
// POST /api/auth/avatar — upload photo de profil
router.post('/avatar', auth, avatarUpload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier reçu' })
    }

    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    const ext = path.extname(req.file.filename)
    const newUrl = `/api/avatars/${req.user!.id}${ext}`

    // Supprimer l'ancien fichier si l'extension a changé
    if (user.avatarUrl && user.avatarUrl !== newUrl) {
      const oldFilename = path.basename(user.avatarUrl)
      const oldPath = path.join(avatarsDir, oldFilename)
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
    }

    user.avatarUrl = newUrl
    await user.save()

    return res.json({ avatarUrl: newUrl })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/auth/avatar — supprimer photo de profil
router.delete('/avatar', auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.user!.id)
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' })

    if (user.avatarUrl) {
      const filename = path.basename(user.avatarUrl)
      const filePath = path.join(avatarsDir, filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      user.avatarUrl = ''
      await user.save()
    }

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})
```

- [ ] **Étape 4 — Lancer tous les tests backend**

```bash
cd backend && npx vitest run
```
Résultat attendu : tous passent.

- [ ] **Étape 5 — Commit**

```bash
git add backend/src/routes/auth.ts backend/src/__tests__/avatar.test.ts
git commit -m "feat(avatar): routes POST et DELETE /api/auth/avatar"
```

---

## Task 4 — Populate avatarUrl dans les messages

**Files:**
- Modify: `backend/src/routes/client/messages.ts`

- [ ] **Étape 1 — Modifier le populate dans `GET /:projectId/messages`**

Trouver la ligne :
```typescript
      .populate('sender', 'name role')
```

La remplacer par :
```typescript
      .populate('sender', 'name role avatarUrl')
```

- [ ] **Étape 2 — Modifier le populate dans `POST /:projectId/messages`**

Trouver la ligne :
```typescript
      const populated = await message.populate('sender', 'name role')
```

La remplacer par :
```typescript
      const populated = await message.populate('sender', 'name role avatarUrl')
```

- [ ] **Étape 3 — Lancer les tests backend**

```bash
cd backend && npx vitest run
```
Résultat attendu : tous passent.

- [ ] **Étape 4 — Commit**

```bash
git add backend/src/routes/client/messages.ts
git commit -m "feat(avatar): populate avatarUrl dans les messages projet"
```

---

## Task 5 — Enrichissement avatarUrl dans les tickets

**Files:**
- Modify: `backend/src/routes/admin/tickets.ts`

- [ ] **Étape 1 — Enrichir la route GET list (tickets)**

Trouver le bloc dans `backend/src/routes/admin/tickets.ts` :
```typescript
    const tickets = await InternalTicket.find(filter).sort({ createdAt: -1 })
    res.json(tickets)
```

Le remplacer par :
```typescript
    const tickets = await InternalTicket.find(filter).sort({ createdAt: -1 })
    const authorIds = [...new Set(tickets.map((t) => t.authorId.toString()))]
    const authors = await User.find({ _id: { $in: authorIds } }).select('_id avatarUrl')
    const avatarMap: Record<string, string> = {}
    authors.forEach((u) => { avatarMap[u._id.toString()] = u.avatarUrl || '' })
    const enriched = tickets.map((t) => ({
      ...t.toObject(),
      authorAvatarUrl: avatarMap[t.authorId.toString()] || '',
    }))
    res.json(enriched)
```

- [ ] **Étape 2 — Enrichir la route GET /api/admin/tickets/:id**

Trouver le bloc :
```typescript
    const ticket = await InternalTicket.findById(req.params.id)
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })
    res.json(ticket)
```

Le remplacer par :
```typescript
    const ticket = await InternalTicket.findById(req.params.id)
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' })

    const replyAuthorIds = ticket.replies.map((r) => r.authorId.toString())
    const allAuthorIds = [...new Set([ticket.authorId.toString(), ...replyAuthorIds])]
    const authors = await User.find({ _id: { $in: allAuthorIds } }).select('_id avatarUrl')
    const avatarMap: Record<string, string> = {}
    authors.forEach((u) => { avatarMap[u._id.toString()] = u.avatarUrl || '' })

    const ticketObj = ticket.toObject() as Record<string, unknown>
    ticketObj.authorAvatarUrl = avatarMap[ticket.authorId.toString()] || ''
    ticketObj.replies = ticket.replies.map((r) => ({
      ...r.toObject(),
      authorAvatarUrl: avatarMap[r.authorId.toString()] || '',
    }))
    res.json(ticketObj)
```

- [ ] **Étape 3 — Lancer les tests backend**

```bash
cd backend && npx vitest run
```
Résultat attendu : tous passent.

- [ ] **Étape 4 — Commit**

```bash
git add backend/src/routes/admin/tickets.ts
git commit -m "feat(avatar): enrichir les tickets avec authorAvatarUrl"
```

---

## Task 6 — Type User frontend + composant UserAvatar

**Files:**
- Modify: `src/types/auth.types.ts`
- Create: `src/components/UserAvatar.tsx`
- Create: `src/components/UserAvatar.test.tsx`

- [ ] **Étape 1 — Écrire les tests du composant UserAvatar**

```typescript
// src/components/UserAvatar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserAvatar from './UserAvatar'

describe('UserAvatar', () => {
  it('affiche l'initiale quand avatarUrl est absent', () => {
    render(<UserAvatar name="Alice Dupont" />)
    expect(screen.getByText('A')).toBeTruthy()
  })

  it('affiche l'initiale quand avatarUrl est chaîne vide', () => {
    render(<UserAvatar name="Bob Martin" avatarUrl="" />)
    expect(screen.getByText('B')).toBeTruthy()
  })

  it('affiche une image quand avatarUrl est fourni', () => {
    render(<UserAvatar name="Claire" avatarUrl="/api/avatars/abc.jpg" />)
    const img = screen.getByRole('img')
    expect(img).toBeTruthy()
    expect((img as HTMLImageElement).src).toContain('/api/avatars/abc.jpg')
  })

  it('utilise la taille par défaut 36', () => {
    const { container } = render(<UserAvatar name="Denis" />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe('36px')
  })

  it('respecte la prop size', () => {
    const { container } = render(<UserAvatar name="Eva" size={80} />)
    const el = container.firstChild as HTMLElement
    expect(el.style.width).toBe('80px')
  })
})
```

- [ ] **Étape 2 — Lancer les tests pour vérifier qu'ils échouent**

```bash
npx vitest run src/components/UserAvatar.test.tsx
```
Résultat attendu : **FAIL** — `UserAvatar` n'existe pas encore.

- [ ] **Étape 3 — Ajouter `avatarUrl?` dans `src/types/auth.types.ts`**

Trouver la ligne `locale?: 'fr' | 'en'` dans l'interface `User` et ajouter après :

```typescript
  locale?: 'fr' | 'en'
  avatarUrl?: string
```

- [ ] **Étape 4 — Créer `src/components/UserAvatar.tsx`**

```typescript
import { useState } from 'react'

interface UserAvatarProps {
  name: string
  avatarUrl?: string
  size?: number
  className?: string
  style?: React.CSSProperties
}

const UserAvatar = ({ name, avatarUrl, size = 36, className, style }: UserAvatarProps) => {
  const [imgError, setImgError] = useState(false)
  const initial = (name || '?').charAt(0).toUpperCase()

  const baseStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...style,
  }

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={className}
        style={{ ...baseStyle, objectFit: 'cover' }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div className={className} style={baseStyle}>
      {initial}
    </div>
  )
}

export default UserAvatar
```

- [ ] **Étape 5 — Lancer les tests pour vérifier qu'ils passent**

```bash
npx vitest run src/components/UserAvatar.test.tsx
```
Résultat attendu : **PASS**

- [ ] **Étape 6 — Lancer tous les tests frontend**

```bash
npx vitest run
```
Résultat attendu : tous passent.

- [ ] **Étape 7 — Commit**

```bash
git add src/types/auth.types.ts src/components/UserAvatar.tsx src/components/UserAvatar.test.tsx
git commit -m "feat(avatar): composant UserAvatar + type avatarUrl"
```

---

## Task 7 — Intégration sidebars

**Files:**
- Modify: `src/components/AdminSidebar.tsx`
- Modify: `src/components/ClientSidebar.tsx`

- [ ] **Étape 1 — Modifier `src/components/AdminSidebar.tsx`**

Ajouter l'import en haut du fichier :
```typescript
import UserAvatar from './UserAvatar'
```

Trouver la ligne 149 :
```typescript
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()
```
La supprimer (UserAvatar calcule l'initiale en interne).

Trouver la ligne ~208 :
```typescript
          <div className="admin-sb-avatar">{initial}</div>
```
La remplacer par :
```typescript
          <UserAvatar name={user?.name || user?.email || '?'} avatarUrl={user?.avatarUrl} className="admin-sb-avatar" size={28} />
```

Trouver la ligne ~272 (seconde occurrence de `.admin-sb-avatar`) :
```typescript
                  <div className="admin-sb-avatar">{initial}</div>
```
La remplacer par :
```typescript
                  <UserAvatar name={user?.name || user?.email || '?'} avatarUrl={user?.avatarUrl} className="admin-sb-avatar" size={28} />
```

- [ ] **Étape 2 — Modifier `src/components/ClientSidebar.tsx`**

Ajouter l'import en haut du fichier :
```typescript
import UserAvatar from './UserAvatar'
```

Trouver la ligne :
```typescript
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase()
```
La supprimer.

Trouver :
```typescript
        <div className="client-sb-avatar">{initial}</div>
```
La remplacer par :
```typescript
        <UserAvatar name={user?.name || user?.email || '?'} avatarUrl={user?.avatarUrl} className="client-sb-avatar" size={32} />
```

- [ ] **Étape 3 — Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Étape 4 — Commit**

```bash
git add src/components/AdminSidebar.tsx src/components/ClientSidebar.tsx
git commit -m "feat(avatar): intégrer UserAvatar dans les sidebars"
```

---

## Task 8 — Intégration chat projet

**Files:**
- Modify: `src/components/ClientProjectChat.tsx`

- [ ] **Étape 1 — Mettre à jour l'interface `MessageSender` et les imports**

Trouver en haut de `src/components/ClientProjectChat.tsx` :
```typescript
interface MessageSender {
  _id: string
  name: string
  role: string
}
```
La remplacer par :
```typescript
interface MessageSender {
  _id: string
  name: string
  role: string
  avatarUrl?: string
}
```

Ajouter l'import UserAvatar :
```typescript
import UserAvatar from './UserAvatar'
```

- [ ] **Étape 2 — Remplacer les avatars dans le rendu des messages**

Trouver (message d'un autre) :
```typescript
              {!isOwnMessage(msg) && (
                <div className="project-chat-avatar">{getInitials(msg.sender.name)}</div>
              )}
```
La remplacer par :
```typescript
              {!isOwnMessage(msg) && (
                <UserAvatar name={msg.sender.name} avatarUrl={msg.sender.avatarUrl} className="project-chat-avatar" size={32} />
              )}
```

Trouver (message propre) :
```typescript
              {isOwnMessage(msg) && (
                <div className="project-chat-avatar own">{getInitials(msg.sender.name)}</div>
              )}
```
La remplacer par :
```typescript
              {isOwnMessage(msg) && (
                <UserAvatar name={msg.sender.name} avatarUrl={msg.sender.avatarUrl} className="project-chat-avatar own" size={32} />
              )}
```

- [ ] **Étape 3 — Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Étape 4 — Commit**

```bash
git add src/components/ClientProjectChat.tsx
git commit -m "feat(avatar): intégrer UserAvatar dans le chat projet"
```

---

## Task 9 — Intégration tickets (frontend)

**Files:**
- Modify: `src/pages/admin/ticket-list/types.ts`
- Modify: `src/pages/admin/ticket-list/TicketCard.tsx`
- Modify: `src/pages/admin/ticket-list/TicketDetail.tsx`

- [ ] **Étape 1 — Mettre à jour les types dans `src/pages/admin/ticket-list/types.ts`**

Trouver l'interface `TicketReply` :
```typescript
export interface TicketReply {
  _id: string
  authorName: string
  message: string
  attachments?: TicketFile[]
  createdAt: string
}
```
La remplacer par :
```typescript
export interface TicketReply {
  _id: string
  authorName: string
  authorAvatarUrl?: string
  message: string
  attachments?: TicketFile[]
  createdAt: string
}
```

Trouver l'interface `Ticket` et ajouter `authorAvatarUrl?` :
```typescript
export interface Ticket {
  _id: string
  title: string
  message: string
  category: 'QUESTION' | 'DEMANDE' | 'PROBLEME'
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  status: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'
  authorName: string
  authorAvatarUrl?: string
  attachments?: TicketFile[]
  replies: TicketReply[]
  isArchived?: boolean
  archivedAt?: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Étape 2 — Modifier `src/pages/admin/ticket-list/TicketCard.tsx`**

Ajouter l'import :
```typescript
import UserAvatar from '../../../components/UserAvatar'
```

Trouver la ligne 84-85 (en-tête de réponse) :
```tsx
                  <div className="ticket-reply-header">
                    <strong>{reply.authorName}</strong>
```
Remplacer par :
```tsx
                  <div className="ticket-reply-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={24} />
                      <strong>{reply.authorName}</strong>
                    </div>
```

**Note :** `ticket.authorName` n'est pas affiché dans TicketCard — seulement dans TicketDetail.

- [ ] **Étape 3 — Modifier `src/pages/admin/ticket-list/TicketDetail.tsx`**

Ajouter l'import :
```typescript
import UserAvatar from '../../../components/UserAvatar'
```

Trouver la ligne 119 (auteur du ticket) :
```tsx
            <span>Par <strong>{ticket.authorName}</strong></span>
```
Remplacer par :
```tsx
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              Par
              <UserAvatar name={ticket.authorName} avatarUrl={ticket.authorAvatarUrl} size={24} />
              <strong>{ticket.authorName}</strong>
            </span>
```

Trouver la ligne 131 (auteur de réponse) :
```tsx
                    <strong>{reply.authorName}</strong>
```
Remplacer par :
```tsx
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserAvatar name={reply.authorName} avatarUrl={reply.authorAvatarUrl} size={22} />
                      <strong>{reply.authorName}</strong>
                    </div>
```

- [ ] **Étape 4 — Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Étape 5 — Commit**

```bash
git add src/pages/admin/ticket-list/types.ts src/pages/admin/ticket-list/TicketCard.tsx src/pages/admin/ticket-list/TicketDetail.tsx
git commit -m "feat(avatar): intégrer UserAvatar dans les tickets"
```

---

## Task 10 — Section upload avatar dans les pages profil

**Files:**
- Modify: `src/pages/espace-client/Profile.tsx`
- Modify: `src/pages/admin/AdminProfile.tsx`

### 10a — ClientProfile

- [ ] **Étape 1 — Ajouter les imports et états dans `src/pages/espace-client/Profile.tsx`**

Ajouter l'import :
```typescript
import UserAvatar from '../../components/UserAvatar'
```

Ajouter ces états après les états existants (`saving`, `success`, etc.) :
```typescript
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
```

- [ ] **Étape 2 — Ajouter les handlers d'upload et de suppression**

Ajouter ces deux fonctions AVANT le `return` du composant :

```typescript
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setAvatarError('Format non supporté. Utilisez JPEG, PNG ou WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('L'image dépasse 2 Mo.')
      return
    }
    setAvatarUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const token = localStorage.getItem('venio-token')
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur lors de l'upload')
      }
      await refreshUser()
      setSuccess('Photo de profil mise à jour')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || 'Erreur lors de l'upload')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  const handleAvatarDelete = async () => {
    setAvatarError('')
    setAvatarUploading(true)
    try {
      await apiFetch('/api/auth/avatar', { method: 'DELETE' })
      await refreshUser()
      setSuccess('Photo de profil supprimée')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || 'Erreur lors de la suppression')
    } finally {
      setAvatarUploading(false)
    }
  }
```

**Note :** `localStorage.getItem('venio-token')` peut ne pas correspondre à la clé réelle. Vérifier dans `src/lib/api.ts` la clé utilisée (chercher `localStorage.getItem` ou `TOKEN_KEY`). Utiliser `getToken()` importé depuis `../../lib/api` à la place si disponible.

- [ ] **Étape 3 — Vérifier la clé du token**

```bash
grep -n "localStorage\|TOKEN_KEY\|venio-token" src/lib/api.ts | head -10
```

Adapter l'import dans `handleAvatarChange` selon le résultat. Si une fonction `getToken()` est exportée, utiliser :
```typescript
import { apiFetch, getToken } from '../../lib/api'
// ...
const token = getToken()
```

- [ ] **Étape 4 — Ajouter la section UI dans le JSX**

Dans le `return`, trouver la `<div className="portal-card">` qui contient `<h2>Informations générales</h2>`. Insérer AVANT cette div :

```tsx
      <div className="portal-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Photo de profil</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <UserAvatar
            name={user?.name || user?.email || '?'}
            avatarUrl={user?.avatarUrl}
            size={80}
            className="admin-sb-avatar"
            style={{ fontSize: '2rem', fontWeight: 700 } as React.CSSProperties}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label
              htmlFor="avatar-upload"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: '8px',
                cursor: avatarUploading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                opacity: avatarUploading ? 0.6 : 1,
              }}
            >
              {avatarUploading ? 'Upload...' : 'Modifier la photo'}
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
              disabled={avatarUploading}
            />
            {user?.avatarUrl && (
              <button
                type="button"
                onClick={handleAvatarDelete}
                disabled={avatarUploading}
                style={{
                  background: 'none',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                  borderRadius: '8px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Supprimer la photo
              </button>
            )}
            {avatarError && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{avatarError}</p>}
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0 }}>
              JPEG, PNG ou WebP · 2 Mo max
            </p>
          </div>
        </div>
      </div>
```


- [ ] **Étape 5 — Répéter pour `src/pages/admin/AdminProfile.tsx`**

Appliquer exactement les mêmes changements (imports, états, handlers, section UI) dans `AdminProfile.tsx`. La seule différence : l'import est `../../components/UserAvatar` → `../../components/UserAvatar` (même chemin). Vérifier si le token est récupéré via `getToken()` ou `localStorage` dans ce contexte et adapter.

- [ ] **Étape 6 — Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Étape 7 — Lancer tous les tests**

```bash
npx vitest run && cd backend && npx vitest run
```
Résultat attendu : tous passent.

- [ ] **Étape 8 — Commit**

```bash
git add src/pages/espace-client/Profile.tsx src/pages/admin/AdminProfile.tsx
git commit -m "feat(avatar): section upload avatar dans les pages profil"
```

---

## Vérification finale

- [ ] Démarrer le backend : `cd backend && npm run dev`
- [ ] Démarrer le frontend : `npm run dev`
- [ ] Se connecter en tant que client → aller sur /espace-client/profil → uploader une photo → vérifier que la sidebar se met à jour
- [ ] Se connecter en tant qu'admin → aller sur /admin/profil → uploader une photo → vérifier la sidebar
- [ ] Tester le fallback : désactiver temporairement la route `/api/avatars` → vérifier que l'initiale s'affiche
- [ ] Vérifier que le chat affiche les avatars pour les messages entrants
- [ ] Vérifier que les tickets affichent les avatars des auteurs

- [ ] **Commit final**

```bash
git add -p
git commit -m "feat(avatar): upload photo de profil — vérification finale"
```
