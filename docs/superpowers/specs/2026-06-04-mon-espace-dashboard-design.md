# Mon Espace — Tableau de bord personnel par utilisateur

> Design validé le 2026-06-04. Périmètre : back-office Venio (app admin). Direction de layout : **Bento modulaire (A)**.

## 1. Objectif

Donner à **chaque utilisateur back-office** un espace de travail personnel et personnalisable : un tableau de bord « bien fourni » regroupant ses tâches, ses notes, ses post-it, son notebook de brouillons, ses idées, et un ensemble de widgets de pilotage et d'ambiance. L'espace est propre à chaque utilisateur (chacun ne voit que ses propres données) et son agencement est sauvegardé par utilisateur.

Cette fonctionnalité est distincte de l'**espace pédagogique** (workspace education), qui reste réservé au super admin et n'est pas modifié ici.

## 2. Périmètre & accès

- Nouvelle page **« Mon Espace »**, route `/admin/mon-espace`, ajoutée à la navigation back-office.
- **Accessible à tous les rôles back-office** : `ADMIN`, `MANAGER`, `RH`, `COMMERCIAL`, `COMPTABLE`, `VIEWER`, `STAGIAIRE`, **et `SUPER_ADMIN`** (le super admin conserve en plus son espace pédagogique).
- Non concernés : `CLIENT` (dispose déjà de l'espace-client), `AGENT` (API).
- **« Mon Espace » devient la page d'accueil par défaut** au login back-office. L'`AdminDashboard` actuel (vue business/ops) reste accessible via la navigation, inchangé.

## 3. Layout — Bento modulaire

- Grille CSS responsive : **12 colonnes** en desktop, repli progressif jusqu'à **1 colonne** en mobile.
- Chaque widget est une **tuile** définie par `{ x, y, w, h }` où `w`/`h` correspondent à des **presets de taille S / M / L** (pas de resize libre au pixel).
- **Mode « Personnaliser »** : un bouton bascule la grille en édition →
  - déplacer une tuile (**drag & drop HTML5 natif**, cohérent avec `TaskBoard`, `GestionKanban`, `crm-board`),
  - changer sa taille (S/M/L),
  - activer/désactiver un widget depuis un tiroir « Ajouter un widget ».
  - Hors mode édition, la grille est figée (lecture/interaction normale des widgets).
- Look Venio dark : fond navy (`#01040e`), cartes glassmorphism, accent `--primary` piloté par le `colorTheme` de l'utilisateur, titres en dégradé, police Cabinet Grotesk.
- L'agencement est **persisté côté serveur par utilisateur** (`WorkspaceLayout`). Au premier accès, un layout par défaut est généré (tous widgets activés, disposition raisonnable).

## 4. Catalogue de widgets (15)

Tous activés par défaut. Chaque utilisateur peut en masquer/réafficher.

**Productivité & tâches**
1. **Tâches à faire** — todos perso (`PersonalTask` statut `A_FAIRE`) **fusionnés** avec les tâches projet assignées à l'utilisateur (`Task.assignee`, statut `A_FAIRE`). Création rapide inline d'un todo perso.
2. **Tâches en cours** — idem statut `EN_COURS`, avec barre d'avancement et passage « terminé » en 1 clic.
3. **En retard** — tâches dont `dueDate` est passée (perso + projet). Accent rouge.
4. **Cette semaine / échéances** — mini-agenda 7 jours des `dueDate` à venir (tâches + briefs).

**Notes & créativité**
5. **Notes** — `WorkspaceNote` type `NOTE` : édition markdown léger (réutilise `NoteEditor` de l'espace education), recherche, épinglage.
6. **Mur de post-it** — `WorkspaceNote` type `POSTIT` : pense-bêtes courts colorés, déplaçables dans la tuile.
7. **Notebook de brouillons** — `WorkspaceNote` type `DRAFT` : carnet libre multi-pages, auto-save.
8. **Boîte à idées / backlog perso** — `WorkspaceNote` type `IDEA` : liste taggable, **convertible en `PersonalTask` en 1 clic** (statut `NEW` → `CONVERTED`).

**Pilotage perso**
9. **KPIs selon le rôle** — chiffres clés filtrés par rôle (voir §7).
10. **Épinglés** — réutilise `InboxPin` (déjà owner-scoped via `userId`).
11. **Activité & mentions** — dernières `Notification` de l'utilisateur (assignations, mentions, commentaires).
12. **Raccourcis rapides** — liens vers les outils les plus utilisés, personnalisables (`WorkspaceLayout.shortcuts`).

**Ambiance & focus** (pur client, aucun aller-retour serveur sauf `dailyGoal`)
13. **Horloge & date** — heure, date, salutation contextuelle.
14. **Minuteur focus (Pomodoro)** — timer 25/5, état en `localStorage`, optionnellement lié à la tâche en cours.
15. **Objectif / citation du jour** — objectif perso (`WorkspaceLayout.dailyGoal`) + citation tirée d'une liste statique côté client.

## 5. Modèles backend (3 nouveaux)

Tous **owner-scoped** : chaque document porte un `userId` et les routes filtrent systématiquement dessus. Aucun utilisateur ne peut lire/écrire les données d'un autre.

### `WorkspaceLayout` (un document par utilisateur)
```
userId: ObjectId(User) (unique, index)
widgets: [{ key: string, enabled: boolean, x: number, y: number, w: number, h: number }]
shortcuts: [{ label: string, link: string, icon?: string }]
dailyGoal: { text: string, date: Date } | null
timestamps
```

### `PersonalTask`
```
userId: ObjectId(User) (index)
title: string (required)
description: string (default '')
status: 'A_FAIRE' | 'EN_COURS' | 'TERMINE' (default 'A_FAIRE')
priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE' (default 'NORMALE')
dueDate: Date | null
order: number (default 0)
isArchived: boolean (default false)
sourceIdeaId: ObjectId(WorkspaceNote) | null   // si convertie depuis une idée
timestamps
```
> Modèle **distinct** de `Task` (qui exige un `project`). On ne touche pas à `Task`.

### `WorkspaceNote` (discriminateur `type`)
```
userId: ObjectId(User) (index)
type: 'NOTE' | 'POSTIT' | 'DRAFT' | 'IDEA' (index)
title: string (default '')
content: string (default '')          // markdown léger pour NOTE/DRAFT, texte court pour POSTIT
color: string (default '')            // surtout POSTIT
pinned: boolean (default false)       // NOTE
status: 'NEW' | 'CONVERTED' (IDEA uniquement, default 'NEW')
order: number (default 0)
tags: [string]
timestamps
```

## 6. Routes backend `/admin/workspace/*`

Nouveau fichier `backend/src/routes/admin/workspace.ts`, monté sous le routeur admin authentifié. `userId` toujours pris depuis le token (jamais depuis le body).

- `GET  /layout` — layout de l'utilisateur (crée le défaut si absent).
- `PUT  /layout` — sauvegarde widgets/shortcuts/dailyGoal.
- `GET  /tasks` — todos perso **fusionnés** avec les `Task` assignées (paramètre `?status=`). Réponse normalisée `{ source: 'PERSONAL'|'PROJECT', ... }`.
- `POST /tasks` · `PATCH /tasks/:id` · `DELETE /tasks/:id` — CRUD `PersonalTask` (uniquement les siens).
- `GET  /notes?type=` · `POST /notes` · `PATCH /notes/:id` · `DELETE /notes/:id` — CRUD `WorkspaceNote`.
- `POST /notes/:id/convert` — convertit une idée (`type IDEA`) en `PersonalTask`.
- `GET  /overview` — **agrégat en un seul appel** : compteurs KPIs (selon rôle), tâches en retard, échéances de la semaine, épinglés (`InboxPin`), activité récente (`Notification`). Optimise le chargement initial du dashboard.

## 7. KPIs par rôle

Mapping basé sur les modèles existants. Chaque entrée = compteur + lien.

| Rôle | KPIs |
|---|---|
| COMMERCIAL | Leads chauds (`Lead`), séquences actives (`Sequence`) |
| RH | Stagiaires actifs (`Intern`), rapports d'activité en attente (`ActivityReport`) |
| COMPTABLE | Écritures à valider (`AccountingEntry`), déclarations TVA à venir (`VatDeclaration`) |
| MANAGER / ADMIN / SUPER_ADMIN | Projets actifs (`Project`), tâches équipe en cours (`Task`) |
| STAGIAIRE | Mes tâches assignées, mes rapports |
| VIEWER | Vue lecture seule (compteurs projets/tâches visibles) |

Le calcul vit dans un helper dédié (`backend/src/services/workspaceKpis.ts`) qui prend `(userId, role)` et renvoie un tableau normalisé.

## 8. Frontend

Dossier `src/pages/admin/mon-espace/` :
- `index.tsx` — page + grille bento + mode personnaliser + persistance layout.
- `BentoGrid.tsx` — moteur de grille (positionnement, drag natif, presets S/M/L).
- Un composant par widget : `TodoWidget`, `DoingWidget`, `OverdueWidget`, `WeekWidget`, `NotesWidget`, `PostItWall`, `NotebookWidget`, `IdeasWidget`, `KpiWidget`, `PinnedWidget`, `ActivityWidget`, `ShortcutsWidget`, `ClockWidget`, `PomodoroWidget`, `GoalWidget`.
- `MonEspace.css` — styles dark/glassmorphism cohérents avec `AdminPortal.css`.
- Réutilisation : `NoteEditor` (education) pour l'édition markdown ; `apiFetch`/`useAuth`/`hasPermission` existants.
- Horloge / Pomodoro / citation : logique 100 % client.

## 9. Tests

**Backend** (`backend/src/__tests__/`)
- Modèles : création + validation des 3 nouveaux modèles.
- Routes : CRUD complet ET **vérification stricte du owner-scoping** (un user A ne peut lire/modifier/supprimer les données d'un user B → 403/404).
- Conversion idée → tâche.
- `GET /overview` renvoie une structure cohérente par rôle.

**Frontend** (`src/test/`)
- Rendu de chaque widget avec données mockées.
- Persistance du layout (mode personnaliser → PUT layout).
- Fusion todos perso + tâches projet dans le widget Tâches.

## 10. Hors périmètre (YAGNI)

- Pas de partage de notes/tâches entre utilisateurs (strictement personnel).
- Pas de vote/collaboration sur la boîte à idées (perso uniquement).
- Pas de resize libre au pixel (presets S/M/L suffisent).
- Pas de nouvelle dépendance npm (drag HTML5 natif).
- Aucune modification de l'espace pédagogique ni du modèle `Task`.
