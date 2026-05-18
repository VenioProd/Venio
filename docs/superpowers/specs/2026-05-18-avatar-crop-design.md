# Recadrage avatar — Design Spec

**Date :** 2026-05-18  
**Statut :** Approuvé

---

## Contexte

L'upload d'avatar existant envoie la photo brute immédiatement après sélection. Cette spec ajoute une étape intermédiaire de recadrage : l'utilisateur peut glisser pour repositionner et zoomer avant de confirmer l'envoi.

---

## Périmètre

- Modal de recadrage client-side (HTML5 Canvas)
- Drag pour repositionner, molette pour zoomer
- Masque circulaire en overlay
- Export JPEG via Canvas → envoi au endpoint existant `POST /api/auth/avatar`
- Zéro nouvelle dépendance
- S'applique aux deux pages profil (client et admin)

---

## Architecture

### Flux utilisateur

1. L'utilisateur clique "Modifier la photo" → file input s'ouvre
2. Fichier sélectionné → validation MIME + taille (comme avant)
3. **Nouveau :** ouverture de `AvatarCropModal` avec la photo
4. L'utilisateur glisse / zoome pour cadrer
5. "Confirmer" → Canvas recadre → Blob JPEG → `POST /api/auth/avatar`
6. "Annuler" → modal fermée, pas d'upload

### Composant `AvatarCropModal`

**Fichier :** `src/components/AvatarCropModal.tsx`

**Props :**
```ts
interface AvatarCropModalProps {
  file: File                         // fichier image sélectionné
  onConfirm: (blob: Blob) => void    // appelé avec le crop JPEG
  onCancel: () => void               // ferme la modal sans upload
}
```

**Internals :**
- `canvasSize = 300` — taille du carré d'affichage (px)
- État `offset: { x: number, y: number }` — position de l'image dans le cadre
- État `scale: number` — facteur de zoom (min 1, max 4)
- `<canvas>` en `display: none` pour le rendu final (hors-écran)
- Zone d'aperçu : `<div>` avec `overflow: hidden`, `border-radius: 50%`, image positionnée via `transform: translate(x, y) scale(s)`

**Interactions :**
- `mousedown` sur l'image → début du drag, mémorise position initiale
- `mousemove` (avec bouton tenu) → met à jour `offset`
- `mouseup` / `mouseleave` → fin du drag
- `wheel` sur la zone → `scale += delta * 0.001`, clampé entre 1 et 4
- Contrainte : l'image ne peut pas être déplacée au point de laisser des bords vides dans le cercle (clamp offset en fonction de scale et des dimensions de l'image)

**Rendu d'aperçu :**
```
┌──────────────────────────────┐
│  overlay sombre               │
│    ╭──────────────╮           │
│    │  image cadré  │          │  ← cercle 300px, overflow hidden
│    │    (drag)     │          │
│    ╰──────────────╯           │
│  overlay sombre               │
│  [Annuler]    [Confirmer]     │
└──────────────────────────────┘
```

**Export Canvas (onConfirm) :**
1. Créer un `<canvas>` 300×300 hors-écran
2. `ctx.beginPath(); ctx.arc(150, 150, 150, 0, 2*Math.PI); ctx.clip()`
3. Dessiner l'image avec la position et le scale courants
4. `canvas.toBlob(callback, 'image/jpeg', 0.92)`
5. Appeler `onConfirm(blob)`

### Modifications pages profil

Dans `handleAvatarChange` de `Profile.tsx` et `AdminProfile.tsx` :
- **Avant :** validation → upload immédiat
- **Après :** validation → mémoriser le `File` dans l'état → ouvrir `AvatarCropModal`

Nouveau état : `cropFile: File | null` (null = modal fermée)

Handler `handleCropConfirm(blob: Blob)` :
1. Construire `FormData` avec le blob (en tant que fichier `avatar.jpg`)
2. Appeler `POST /api/auth/avatar`
3. `refreshUser()`, fermer modal, feedback succès

---

## Contraintes

- Le recadrage est **client-side uniquement** — le backend ne change pas
- L'image exportée est toujours JPEG 0.92 qualité, 300×300px
- Le zoom minimal est 1 (image remplit au moins le cercle en largeur)
- La contrainte de bord empêche les zones vides dans le cercle

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `src/components/AvatarCropModal.tsx` | Créer |
| `src/pages/espace-client/Profile.tsx` | Modifier — ouvrir modal au lieu d'upload direct |
| `src/pages/admin/AdminProfile.tsx` | Modifier — idem |
