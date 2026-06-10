# Améliorations UX espaces Suivi de dev & Pédagogie — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Implémenter le top 5 d'améliorations UX validé : file de revue dev (« À valider »), bulk actions issues, drag-and-drop sur les deux kanbans (dev + devoirs), mode Séance live avec présence en un tap, fiche étudiant — plus deux quick wins (bouton cockpit cassé, persistance des filtres dev).

**Architecture :** Frontend React 18 + TypeScript (Vite), pas de lib DnD (HTML5 natif, pattern déjà présent dans `src/pages/admin/crm-board/`). Les modes plein écran suivent le pattern `CorrectionMode.tsx` (overlay fixe + raccourcis clavier + état local). Aucune modification backend : toutes les features s'appuient sur les endpoints existants (`updateDevIssue`, `updateAttendance` bulk, `updateAssignment`, `listSessions`, `getAssignment`).

**Tech Stack :** React 18, TypeScript, react-router-dom 7, lucide-react, vitest. Vérification : `npm run typecheck && npm run lint && npm run test`.

**Découpage :** Deux volets indépendants (fichiers disjoints) :
- Volet A (dev workspace) : tâches A1–A4 — fichiers sous `src/pages/admin/dev-workspace/`
- Volet B (pédagogie) : tâches B1–B3 — fichiers sous `src/pages/admin/education/` + `src/services/education.ts`

⚠️ Les fichiers `src/pages/admin/dev-workspace/views/*.tsx` sont du **code mort** (aucun import) — ne pas les modifier, tout se passe dans `index.tsx`.

---

## Volet A — Suivi de dev

### Task A1 : File de revue « À valider » (ReviewQueue)

**Files:**
- Create: `src/pages/admin/dev-workspace/ReviewQueue.tsx`
- Create: `src/pages/admin/dev-workspace/ReviewQueue.css`
- Modify: `src/pages/admin/dev-workspace/index.tsx` (bouton header + rendu du composant)

**Contexte :** 384 issues ouvertes dont ~130 coincées en IN_REVIEW. Objectif : triage séquentiel rapide — une issue à la fois, `a` = approuver (DONE), `r` = renvoyer (IN_PROGRESS + commentaire obligatoire), `j`/`k` = naviguer.

- [ ] **Step 1 : Créer `ReviewQueue.tsx`**

Structure (pattern CorrectionMode : overlay plein écran, état local, raccourcis clavier) :

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Check, Undo2, ChevronDown, ChevronUp, GitPullRequest, Keyboard } from 'lucide-react'
import {
  listDevIssues, getDevIssue, updateDevIssue, addDevIssueComment,
  STATUS_LABEL, PRIORITY_LABEL, PRIORITY_COLOR, TYPE_LABEL, TYPE_COLOR,
  type DevIssue, type DevIssueComment, type DevProject,
} from '../../../services/dev'
import { formatRelative, ciStatusTone } from './helpers'
import './ReviewQueue.css'

export function ReviewQueue({ projects, onClose, onChanged }: {
  projects: DevProject[]
  onClose: () => void
  onChanged: () => void   // recharge issues/stats/overview du parent
}) { /* ... */ }
```

Comportement précis :
1. Au montage : `listDevIssues({ status: 'IN_REVIEW' })`, trier par `updatedAt` **ascendant** (les plus anciennes d'abord). Filtre projet optionnel (select en tête, valeur `''` = tous).
2. État : `queue: DevIssue[]`, `activeIndex: number`, `detail: { issue: DevIssue; comments: DevIssueComment[] } | null` (chargé via `getDevIssue` à chaque changement d'issue active), `rejectOpen: boolean`, `rejectDraft: string`, `processed: number` (compteur de la session de triage).
3. Layout 2 colonnes : gauche = liste (identifier, titre, projet coloré, ancienneté), droite = détail de l'issue active : titre, identifier, badges type/priorité, description (`white-space: pre-wrap`), bloc GitHub si `issue.github?.prUrl` (lien PR + branche + `ciStatus` avec `ciStatusTone`), commentaires (les 5 derniers, auteur + date relative + body).
4. Footer d'actions : `✓ Approuver (a)` / `↩ Renvoyer (r)` / navigation `↑k ↓j` / compteur `X traitées · Y restantes`.
5. **Approuver** : `updateDevIssue(id, { status: 'DONE' })`, retirer de `queue`, `processed+1`, sélectionner l'issue suivante (même index, ou dernier si fin), `onChanged()`.
6. **Renvoyer** : ouvre une textarea inline (autofocus). Validation (bouton ou Cmd+Enter) exige un texte non vide → `addDevIssueComment(id, draft)` puis `updateDevIssue(id, { status: 'IN_PROGRESS' })`, retirer de la file, `onChanged()`. Escape referme la textarea sans envoyer.
7. Raccourcis clavier (listener `window`, ignorer si `e.target` est `INPUT`/`TEXTAREA`/`SELECT`) : `j`/`ArrowDown` suivant, `k`/`ArrowUp` précédent, `a` approuver, `r` ouvrir renvoi, `Escape` fermer la file.
8. File vide : état « 🎉 Rien à valider » + bouton fermer.
9. Erreurs : bannière en haut avec message + bouton réessayer (pattern `dev-empty`).

- [ ] **Step 2 : Créer `ReviewQueue.css`**

S'inspirer de `CorrectionMode.css` : `.review-queue-overlay { position: fixed; inset: 0; z-index: 1000; background: #0b0f1a; display: flex; flex-direction: column; }`, header avec titre + compteur + close, body en grid `280px 1fr`, footer sticky avec les boutons d'action. Réutiliser les variables sombres du dev workspace (fond `#0b0f1a`, bordures `rgba(255,255,255,0.08)`).

- [ ] **Step 3 : Brancher dans `index.tsx`**

- State : `const [showReviewQueue, setShowReviewQueue] = useState(false)`
- Dans `.dev-header-actions`, avant le bouton « Projet » :

```tsx
{(stats?.byStatus?.IN_REVIEW ?? 0) > 0 && (
  <button className="dev-btn review" onClick={() => setShowReviewQueue(true)}>
    <Check size={13} /> À valider ({stats!.byStatus.IN_REVIEW})
  </button>
)}
```

- En fin de JSX : `{showReviewQueue && <ReviewQueue projects={projects} onClose={() => setShowReviewQueue(false)} onChanged={() => { loadIssues(); loadStats(); loadOverview() }} />}`
- Ajouter la classe `.dev-btn.review` dans `DevWorkspace.css` (accent violet `#a78bfa`, la couleur IN_REVIEW).

- [ ] **Step 4 : Vérifier** — `npm run typecheck && npm run lint` → PASS

---

### Task A2 : Bulk actions sur les issues

**Files:**
- Modify: `src/pages/admin/dev-workspace/index.tsx`
- Modify: `src/pages/admin/dev-workspace/DevWorkspace.css`

- [ ] **Step 1 : Sélection multiple**

Dans `DevWorkspace` (`index.tsx`) :
- State : `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())` + `const [lastClickedId, setLastClickedId] = useState<string | null>(null)`.
- Dans `renderRow`, ajouter en premier enfant une checkbox :

```tsx
<input
  type="checkbox"
  className="dev-row-check"
  checked={selectedIds.has(issue._id)}
  onClick={(e) => e.stopPropagation()}
  onChange={(e) => toggleSelect(issue._id, (e.nativeEvent as MouseEvent).shiftKey)}
/>
```

- `toggleSelect(id, shift)` : si `shift && lastClickedId`, sélectionner la plage entre les deux ids dans l'ordre plat des issues visibles (`grouped.flatMap(g => g.issues)`) ; sinon toggle simple. Mémoriser `lastClickedId`.
- Réinitialiser `selectedIds` quand `filters` change (`useEffect` sur `filters`).

- [ ] **Step 2 : Barre d'actions flottante**

Rendue quand `selectedIds.size > 0`, en bas de l'écran (`position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%)`) :

```tsx
<div className="dev-bulk-bar">
  <span>{selectedIds.size} sélectionnée(s)</span>
  <select value={bulkStatus} onChange={...}><option value="">Statut…</option>{STATUS_ORDER.map(...)}</select>
  <select value={bulkPriority} onChange={...}><option value="">Priorité…</option>{PRIORITY_ORDER.map(...)}</select>
  <input placeholder="+ label" value={bulkLabel} onKeyDown={Enter → applique} />
  <button className="dev-btn primary" onClick={applyBulk} disabled={!bulkStatus && !bulkPriority && !bulkLabel.trim()}>Appliquer</button>
  <button className="dev-btn subtle" onClick={() => setSelectedIds(new Set())}><X size={12} /></button>
</div>
```

- `applyBulk` : construit le patch (status et/ou priority ; pour le label : `labels = [...issue.labels, label]` dédupliqué par issue), puis `await Promise.allSettled([...selectedIds].map(id => updateDevIssue(id, patchFor(id))))`, compte les échecs (si > 0, `console.error` + bannière), puis `loadIssues(); loadStats(); loadOverview()`, vide la sélection et les champs bulk.
- CSS `.dev-bulk-bar` : fond `#141a2a`, bordure `rgba(255,255,255,0.12)`, radius 10, shadow, flex gap 8, z-index 60. `.dev-row-check` : 14px, accent `#7c5cff`.

- [ ] **Step 3 : Vérifier** — `npm run typecheck && npm run lint` → PASS

---

### Task A3 : Drag-and-drop kanban dev

**Files:**
- Modify: `src/pages/admin/dev-workspace/index.tsx` (bloc `viewMode === 'kanban'`, lignes ~683-738)
- Modify: `src/pages/admin/dev-workspace/DevWorkspace.css`

- [ ] **Step 1 : Rendre les cartes draggables et les colonnes droppables**

Sur chaque `.dev-kanban-card` (c'est un `<button>` — ajouter les props) :

```tsx
draggable={canManage}
onDragStart={(e) => { e.dataTransfer.setData('text/plain', issue._id); e.dataTransfer.effectAllowed = 'move' }}
```

Sur chaque `.dev-kanban-col` :

```tsx
onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCol(status) }}
onDragLeave={() => setDragOverCol((c) => (c === status ? null : c))}
onDrop={(e) => {
  e.preventDefault()
  setDragOverCol(null)
  const id = e.dataTransfer.getData('text/plain')
  const issue = issues.find((i) => i._id === id)
  if (id && issue && issue.status !== status) handlePatchIssue(id, { status })
}}
className={'dev-kanban-col' + (dragOverCol === status ? ' drag-over' : '')}
```

State : `const [dragOverCol, setDragOverCol] = useState<DevIssueStatus | null>(null)`.
`handlePatchIssue` met déjà à jour `issues` de façon optimiste — la carte change de colonne immédiatement.

- [ ] **Step 2 : CSS feedback**

```css
.dev-kanban-col.drag-over { outline: 2px dashed var(--col-color, #7c5cff); outline-offset: -2px; background: rgba(124, 92, 255, 0.05); }
.dev-kanban-card[draggable='true'] { cursor: grab; }
.dev-kanban-card[draggable='true']:active { cursor: grabbing; }
```

- [ ] **Step 3 : Vérifier** — `npm run typecheck && npm run lint` → PASS, puis test manuel rapide en local si possible

---

### Task A4 : Quick wins — bouton cockpit + persistance filtres

**Files:**
- Modify: `src/pages/admin/dev-workspace/DevProjectCockpit.tsx` (~ligne 306)
- Modify: `src/pages/admin/dev-workspace/index.tsx`

- [ ] **Step 1 : Réparer « Voir les issues » du cockpit**

Le bouton est `disabled` car la route n'existe pas. Remplacer par une navigation vers le workspace filtré :

```tsx
<button className="cockpit-btn" onClick={() => navigate(`/admin/dev?project=${projectId}`)}>
  Voir les issues
</button>
```

(supprimer `disabled` et le title obsolète ; `navigate` et `projectId` existent déjà dans le composant).

- [ ] **Step 2 : Persister filtres + préférences d'affichage**

Dans `index.tsx` :

```tsx
const FILTERS_KEY = 'dev-workspace-prefs-v1'
// init paresseuse
const [filters, setFilters] = useState<IssueFilters>(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}')
    return { status: 'open', ...stored.filters, project: deepProjectId ?? stored.filters?.project }
  } catch { return { status: 'open', project: deepProjectId } }
})
```

Idem pour `groupBy`, `viewMode`, `quickView` (mêmes clés dans l'objet stocké). Puis :

```tsx
useEffect(() => {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ filters, groupBy, viewMode, quickView })) } catch { /* quota */ }
}, [filters, groupBy, viewMode, quickView])
```

Attention : le deep link `?project=` doit garder priorité sur la valeur stockée (déjà géré par l'init ci-dessus + l'effet existant ligne 184-188).

- [ ] **Step 3 : Vérifier** — `npm run typecheck && npm run lint` → PASS

---

## Volet B — Pédagogie

### Task B1 : Mode Séance live (présence un-tap)

**Files:**
- Create: `src/pages/admin/education/SessionLiveMode.tsx`
- Create: `src/pages/admin/education/SessionLiveMode.css`
- Modify: `src/services/education.ts` (helper `nextAttendanceState` + test)
- Create: `src/services/education.test.ts`
- Modify: `src/pages/admin/education/SessionDetailDrawer.tsx` (bouton d'entrée)
- Modify: `src/pages/admin/education/session-parts.tsx` (bouton « Live » sur les séances du jour dans SessionsView)

- [ ] **Step 1 : TDD — helper de cycle de présence**

Test d'abord (`src/services/education.test.ts`, suivre le pattern de `src/services/dev.test.ts`) :

```ts
import { describe, expect, it } from 'vitest'
import { nextAttendanceState } from './education'

describe('nextAttendanceState', () => {
  it('passe NON_RENSEIGNE → PRESENT', () => expect(nextAttendanceState('NON_RENSEIGNE')).toBe('PRESENT'))
  it('cycle PRESENT → RETARD → ABSENT → EXCUSE → PRESENT', () => {
    expect(nextAttendanceState('PRESENT')).toBe('RETARD')
    expect(nextAttendanceState('RETARD')).toBe('ABSENT')
    expect(nextAttendanceState('ABSENT')).toBe('EXCUSE')
    expect(nextAttendanceState('EXCUSE')).toBe('PRESENT')
  })
})
```

Run : `npm run test -- education` → FAIL (fonction absente). Implémenter dans `education.ts` :

```ts
const ATTENDANCE_CYCLE: AttendanceState[] = ['PRESENT', 'RETARD', 'ABSENT', 'EXCUSE']
export function nextAttendanceState(current: AttendanceState): AttendanceState {
  const idx = ATTENDANCE_CYCLE.indexOf(current)
  return ATTENDANCE_CYCLE[(idx + 1) % ATTENDANCE_CYCLE.length] ?? 'PRESENT'
}
```

Run : `npm run test -- education` → PASS.

- [ ] **Step 2 : Créer `SessionLiveMode.tsx`**

```tsx
export function SessionLiveMode({ sessionId, onClose, onChanged }: {
  sessionId: string
  onClose: () => void
  onChanged: () => void
}) { /* ... */ }
```

Comportement :
1. Au montage : `getSession(sessionId)`. Si `status === 'PLANIFIEE'` → `updateSession(id, { status: 'EN_COURS' })` automatique (et refléter localement).
2. **Grille de présence** : une carte par entrée d'`attendance` (nom + état coloré `ATTENDANCE_COLOR`). Tap/clic → mise à jour **optimiste** de l'état local avec `nextAttendanceState(a.state)` puis `updateAttendance(sessionId, [{ studentId, state }])` en arrière-plan (rollback + bannière si erreur). Premier tap depuis `NON_RENSEIGNE` = `PRESENT`.
3. Bouton **« Tous présents »** : collecte tous les `NON_RENSEIGNE` → un seul appel `updateAttendance(sessionId, entries)` (l'API accepte un tableau).
4. **Recap** : textarea pleine largeur sous la grille, autosave debouncé 800 ms (copier exactement le pattern de `SessionDetailDrawer.tsx` lignes 56-73, avec `SaveIndicator` — extraire/dupliquer le petit composant localement).
5. **Chrono** : header affiche `durée restante` = `session.date + durationMin − now` (tick 30 s via `setInterval`), format `1h05 restantes` / `dépassé de 12 min` si négatif.
6. Bouton **« Terminer la séance »** (primaire, footer) : `updateSession(id, { status: 'TERMINEE' })` → `onChanged()` → `onClose()`.
7. Compteur header : `présents x · absents y · retard z / total`.
8. Layout plein écran : overlay `position: fixed; inset: 0; z-index: 1100` (au-dessus du drawer), header (titre, classe, chrono, compteurs, close), corps scrollable : grille de cartes (`grid-template-columns: repeat(auto-fill, minmax(170px, 1fr))`, cartes hautes ~64px, gros target tactile), puis recap. Escape ferme (ignorer si focus textarea).

- [ ] **Step 3 : `SessionLiveMode.css`**

Cartes étudiant : fond `rgba(255,255,255,0.04)`, bordure 1.5px de la couleur de l'état (`ATTENDANCE_COLOR`), radius 10, transition 0.12s, `cursor: pointer`, `user-select: none`. État `NON_RENSEIGNE` : bordure pointillée grise. Nom en 13.5px, état en 11px sous le nom.

- [ ] **Step 4 : Points d'entrée**

- `SessionDetailDrawer.tsx` : dans `edu-drawer-head`, à côté du select statut : `<button className="edu-btn" onClick={() => setLiveOpen(true)}>▶ Mode séance</button>` + rendu `{liveOpen && <SessionLiveMode sessionId={session._id} onClose={() => { setLiveOpen(false); refresh() }} onChanged={onChanged} />}`.
- `session-parts.tsx` (`SessionsView`) : sur chaque ligne dont la date est aujourd'hui et `status !== 'TERMINEE' && status !== 'ANNULEE'`, bouton « ▶ Live » (stopPropagation) ouvrant directement le live mode (state local `liveId`).

- [ ] **Step 5 : Vérifier** — `npm run test -- education && npm run typecheck && npm run lint` → PASS

---

### Task B2 : Fiche étudiant (StudentProfileDrawer)

**Files:**
- Create: `src/pages/admin/education/StudentProfileDrawer.tsx`
- Modify: `src/pages/admin/education/student-parts.tsx` (ouverture au clic sur une ligne)

- [ ] **Step 1 : Créer `StudentProfileDrawer.tsx`**

```tsx
export function StudentProfileDrawer({ student, onClose, onChanged }: {
  student: EducationStudent
  onClose: () => void
  onChanged: () => void
}) { /* ... */ }
```

Données chargées au montage (le `classId` vient de `student.classId`, gérer string | objet) :
1. `listSessions({ classId })` → **historique de présence** : pour chaque séance (triée par date desc), retrouver `attendance.find(a => idOf(a.studentId) === student._id)` → tableau Date · Séance · État (badge `ATTENDANCE_COLOR`). Limiter l'affichage aux 30 dernières.
2. `listAssignments({ classId })` puis `Promise.all(assignments.slice(0, 20).map(a => getAssignment(a._id)))` → pour chaque devoir, la soumission de l'étudiant → tableau **Notes** : Devoir · Statut (`SUBMISSION_STATUS_LABEL`) · Note `x / maxGrade` · Feedback (tronqué 80 chars, title complet).
3. Si plus de 20 devoirs, afficher « (20 plus récents) ».

Sections du drawer (réutiliser `edu-drawer` large `min(720px, 96vw)`) :
- **Head** : nom complet, email/téléphone, select statut étudiant (ACTIVE/PAUSE/ABANDON/TERMINE → `updateStudent` direct), close.
- **KPIs** (composant `Kpi` de `class-parts`) : Présences, Absences, Retards, Moyenne (`averageGrade`).
- **Notes par devoir** (tableau ci-dessus, état vide « Aucun devoir noté »).
- **Historique de présence** (tableau, état vide « Aucune séance »).
- **Notes libres** : textarea init `student.notes`, save `onBlur` via `updateStudent(student._id, { notes })` + mini indicateur Sauvegardé.

Chargements en parallèle avec états `loading` distincts (squelette « Chargement… » par section), erreurs par section (bannière + réessayer).

- [ ] **Step 2 : Ouverture depuis `StudentsTab`**

Dans `student-parts.tsx` : state `const [profileStudent, setProfileStudent] = useState<EducationStudent | null>(null)` ; sur chaque `<tr>` : `onClick={() => setProfileStudent(s)}` + `style={{ cursor: 'pointer' }}` (le bouton supprimer fait déjà son propre travail — ajouter `e.stopPropagation()` sur son onClick). Rendu : `{profileStudent && <StudentProfileDrawer student={profileStudent} onClose={() => setProfileStudent(null)} onChanged={async () => { await refresh(); onChanged() }} />}`.

- [ ] **Step 3 : Vérifier** — `npm run typecheck && npm run lint` → PASS

---

### Task B3 : Drag-and-drop kanban devoirs (factorisé)

**Files:**
- Modify: `src/pages/admin/education/assignment-parts.tsx`
- Modify: `src/pages/admin/education/EducationWorkspace.css`

- [ ] **Step 1 : Extraire un composant `AssignmentKanban` partagé**

`AssignmentsTab` et `AssignmentsView` rendent le même kanban (4 colonnes DRAFT/OUVERT/EN_CORRECTION/CLOS) — factoriser dans `assignment-parts.tsx` :

```tsx
function AssignmentKanban({ items, onOpen, onMoved, showClassDot }: {
  items: EducationAssignment[]
  onOpen: (id: string) => void
  onMoved: () => void          // refresh après déplacement
  showClassDot?: boolean       // pastille classe (vue globale uniquement)
}) {
  const [dragOver, setDragOver] = useState<EducationAssignmentStatus | null>(null)
  const [local, setLocal] = useState(items)
  useEffect(() => setLocal(items), [items])

  async function drop(status: EducationAssignmentStatus, id: string) {
    const a = local.find((x) => x._id === id)
    if (!a || a.status === status) return
    setLocal((prev) => prev.map((x) => (x._id === id ? { ...x, status } : x)))  // optimiste
    try { await updateAssignment(id, { status }); onMoved() }
    catch { setLocal(items) }  // rollback
  }
  /* colonnes : même markup qu'avant + draggable / onDragOver / onDrop comme Task A3 */
}
```

Cartes : `draggable`, `onDragStart` avec `e.dataTransfer.setData('text/plain', a._id)`. Colonnes : `onDragOver` preventDefault + `drag-over`, `onDrop` → `drop(col.status, id)`.
Remplacer les deux blocs kanban dupliqués par `<AssignmentKanban …/>`.

- [ ] **Step 2 : CSS**

```css
.edu-kanban-col.drag-over { outline: 2px dashed rgba(255,255,255,0.35); outline-offset: -2px; background: rgba(255,255,255,0.03); }
.edu-kanban-card[draggable='true'] { cursor: grab; }
```

- [ ] **Step 3 : Vérifier** — `npm run typecheck && npm run lint` → PASS

---

## Finalisation

- [ ] `npm run typecheck && npm run lint && npm run test` → tout PASS
- [ ] Commits par tâche (conventional commits, ex. `feat(dev): file de revue "À valider" avec triage clavier`)
- [ ] Mise à jour tracker Venio (issue VENIO, statut IN_REVIEW + commentaire récap)
- [ ] PR vers `main`
