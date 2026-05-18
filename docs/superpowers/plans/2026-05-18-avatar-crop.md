# Recadrage avatar — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une modal de recadrage (drag + zoom) entre la sélection du fichier et l'upload d'avatar.

**Architecture:** Composant `AvatarCropModal` autonome — reçoit un `File`, affiche un aperçu interactif (drag via mouse events, zoom via wheel), exporte un Blob JPEG 300×300 via Canvas, et le transmet au parent via callback. Les deux pages profil ouvrent cette modal au lieu d'uploader directement.

**Tech Stack:** React, HTML5 Canvas, CSS (aucune nouvelle dépendance)

---

## Carte des fichiers

| Fichier | Action |
|---|---|
| `src/components/AvatarCropModal.tsx` | Créer — composant modal de recadrage |
| `src/components/AvatarCropModal.test.tsx` | Créer — tests |
| `src/pages/espace-client/Profile.tsx` | Modifier — ouvrir modal au lieu d'upload direct |
| `src/pages/admin/AdminProfile.tsx` | Modifier — idem |

---

## Task 1 — Composant AvatarCropModal

**Files:**
- Create: `src/components/AvatarCropModal.tsx`
- Create: `src/components/AvatarCropModal.test.tsx`

- [ ] **Étape 1 — Écrire les tests**

```typescript
// src/components/AvatarCropModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AvatarCropModal from './AvatarCropModal'

beforeEach(() => {
  // jsdom ne charge pas les images — on simule l'URL
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  })
})

const mockFile = new File([''], 'avatar.jpg', { type: 'image/jpeg' })

describe('AvatarCropModal', () => {
  it('affiche le titre', () => {
    render(<AvatarCropModal file={mockFile} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Cadrer la photo')).toBeTruthy()
  })

  it('affiche les boutons Annuler et Confirmer', () => {
    render(<AvatarCropModal file={mockFile} onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Annuler')).toBeTruthy()
    expect(screen.getByText('Confirmer')).toBeTruthy()
  })

  it('appelle onCancel au clic sur Annuler', () => {
    const onCancel = vi.fn()
    render(<AvatarCropModal file={mockFile} onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Annuler'))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Étape 2 — Vérifier que les tests échouent**

```bash
npx vitest run src/components/AvatarCropModal.test.tsx
```
Résultat attendu : **FAIL** — `AvatarCropModal` n'existe pas.

- [ ] **Étape 3 — Créer `src/components/AvatarCropModal.tsx`**

```typescript
import { useEffect, useRef, useState } from 'react'

const CANVAS_SIZE = 300

interface AvatarCropModalProps {
  file: File
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

const AvatarCropModal = ({ file, onConfirm, onCancel }: AvatarCropModalProps) => {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    const img = new Image()
    img.onload = () => {
      const minScale = Math.max(CANVAS_SIZE / img.naturalWidth, CANVAS_SIZE / img.naturalHeight)
      setImgEl(img)
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setScale(minScale)
      setOffset({ x: 0, y: 0 })
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const clamp = (ox: number, oy: number, s: number) => {
    const sw = imgNatural.w * s
    const sh = imgNatural.h * s
    const mx = Math.max(0, (sw - CANVAS_SIZE) / 2)
    const my = Math.max(0, (sh - CANVAS_SIZE) / 2)
    return { x: Math.min(mx, Math.max(-mx, ox)), y: Math.min(my, Math.max(-my, oy)) }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy, scale))
  }

  const handleMouseUp = () => { dragging.current = false }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!imgNatural.w) return
    const minScale = Math.max(CANVAS_SIZE / imgNatural.w, CANVAS_SIZE / imgNatural.h)
    const next = Math.min(4, Math.max(minScale, scale - e.deltaY * 0.001))
    setScale(next)
    setOffset(prev => clamp(prev.x, prev.y, next))
  }

  const handleConfirm = () => {
    if (!imgEl) return
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, 2 * Math.PI)
    ctx.clip()
    const sw = imgEl.naturalWidth * scale
    const sh = imgEl.naturalHeight * scale
    ctx.drawImage(imgEl, (CANVAS_SIZE - sw) / 2 + offset.x, (CANVAS_SIZE - sh) / 2 + offset.y, sw, sh)
    canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.92)
  }

  const sw = imgNatural.w * scale
  const sh = imgNatural.h * scale
  const imgX = (CANVAS_SIZE - sw) / 2 + offset.x
  const imgY = (CANVAS_SIZE - sh) / 2 + offset.y

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card, #1e1e2e)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '28px 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
          Cadrer la photo
        </h2>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted, #888)', textAlign: 'center' }}>
          Glissez pour repositionner · Molette pour zoomer
        </p>

        <div
          style={{
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            borderRadius: '50%',
            overflow: 'hidden',
            cursor: imgEl ? (dragging.current ? 'grabbing' : 'grab') : 'default',
            position: 'relative',
            border: '2px solid var(--primary, #0ea5e9)',
            background: 'rgba(255,255,255,0.04)',
            userSelect: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          {imgUrl && imgEl ? (
            <img
              src={imgUrl}
              alt="aperçu recadrage"
              draggable={false}
              style={{
                position: 'absolute',
                width: sw,
                height: sh,
                left: imgX,
                top: imgY,
                pointerEvents: 'none',
              }}
            />
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--text-muted, #888)' }}>
              Chargement...
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'none',
              color: 'var(--text-secondary, #aaa)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!imgEl}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: imgEl ? 'var(--primary, #0ea5e9)' : 'rgba(14,165,233,0.3)',
              color: '#fff',
              cursor: imgEl ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}

export default AvatarCropModal
```

- [ ] **Étape 4 — Vérifier que les tests passent**

```bash
npx vitest run src/components/AvatarCropModal.test.tsx
```
Résultat attendu : **PASS** (3 tests).

- [ ] **Étape 5 — TypeScript**

```bash
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Étape 6 — Commit**

```bash
git add src/components/AvatarCropModal.tsx src/components/AvatarCropModal.test.tsx
git commit -m "feat(avatar): composant AvatarCropModal drag+zoom"
```

---

## Task 2 — Intégration dans Profile.tsx (client)

**Files:**
- Modify: `src/pages/espace-client/Profile.tsx`

- [ ] **Étape 1 — Ajouter l'import de AvatarCropModal**

Dans `src/pages/espace-client/Profile.tsx`, trouver la ligne :
```typescript
import UserAvatar from '../../components/UserAvatar'
```
Ajouter après :
```typescript
import AvatarCropModal from '../../components/AvatarCropModal'
```

- [ ] **Étape 2 — Ajouter l'état cropFile**

Trouver les états :
```typescript
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
```
Ajouter après :
```typescript
  const [cropFile, setCropFile] = useState<File | null>(null)
```

- [ ] **Étape 3 — Remplacer handleAvatarChange**

Trouver et remplacer toute la fonction `handleAvatarChange` (de la ligne `const handleAvatarChange` jusqu'à la `}` fermante) par :

```typescript
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setAvatarError('Format non supporté. Utilisez JPEG, PNG ou WebP.')
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("L'image dépasse 2 Mo.")
      e.target.value = ''
      return
    }
    setCropFile(file)
    e.target.value = ''
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null)
    setAvatarUploading(true)
    setAvatarError('')
    try {
      const formData = new FormData()
      formData.append('avatar', blob, 'avatar.jpg')
      const token = getToken()
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erreur lors de l'upload")
      }
      await refreshUser()
      setSuccess('Photo de profil mise à jour')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || "Erreur lors de l'upload")
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleCropCancel = () => setCropFile(null)
```

- [ ] **Étape 4 — Ajouter la modal dans le JSX**

Trouver la toute dernière ligne du `return` avant le `}` fermant du composant :
```tsx
    </div>
  )
}
```
Remplacer par :
```tsx
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}
```

- [ ] **Étape 5 — TypeScript**

```bash
npx tsc --noEmit
```
Résultat attendu : aucune erreur.

- [ ] **Étape 6 — Commit**

```bash
git add src/pages/espace-client/Profile.tsx
git commit -m "feat(avatar): ouvrir AvatarCropModal dans ClientProfile"
```

---

## Task 3 — Intégration dans AdminProfile.tsx

**Files:**
- Modify: `src/pages/admin/AdminProfile.tsx`

- [ ] **Étape 1 — Ajouter l'import de AvatarCropModal**

Dans `src/pages/admin/AdminProfile.tsx`, trouver la ligne :
```typescript
import UserAvatar from '../../components/UserAvatar'
```
Ajouter après :
```typescript
import AvatarCropModal from '../../components/AvatarCropModal'
```

- [ ] **Étape 2 — Ajouter l'état cropFile**

Trouver :
```typescript
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
```
Ajouter après :
```typescript
  const [cropFile, setCropFile] = useState<File | null>(null)
```

- [ ] **Étape 3 — Remplacer handleAvatarChange dans AdminProfile**

Trouver et remplacer toute la fonction `handleAvatarChange` (de `const handleAvatarChange` jusqu'à sa `}` fermante) par :

```typescript
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setAvatarError('Format non supporté. Utilisez JPEG, PNG ou WebP.')
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("L'image dépasse 2 Mo.")
      e.target.value = ''
      return
    }
    setCropFile(file)
    e.target.value = ''
  }

  const handleCropConfirm = async (blob: Blob) => {
    setCropFile(null)
    setAvatarUploading(true)
    setAvatarError('')
    try {
      const formData = new FormData()
      formData.append('avatar', blob, 'avatar.jpg')
      const token = getToken()
      const res = await fetch('/api/auth/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Erreur lors de l'upload")
      }
      await refreshUser()
      setSuccess('Photo de profil mise à jour')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err: unknown) {
      setAvatarError((err as Error).message || "Erreur lors de l'upload")
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleCropCancel = () => setCropFile(null)
```

- [ ] **Étape 4 — Ajouter la modal dans le JSX**

Trouver les deux dernières lignes du `return` du composant `AdminProfile` :
```tsx
    </div>
  )
}
```
Remplacer par :
```tsx
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  )
}
```

- [ ] **Étape 5 — TypeScript + tests**

```bash
npx tsc --noEmit
npx vitest run
```
Résultat attendu : aucune erreur TS, tous les tests passent.

- [ ] **Étape 6 — Commit**

```bash
git add src/pages/admin/AdminProfile.tsx
git commit -m "feat(avatar): ouvrir AvatarCropModal dans AdminProfile"
```

---

## Task 4 — Push

- [ ] **Pousser sur main**

```bash
git push origin main
```
Résultat attendu : `main -> main` sur le remote GitHub.
