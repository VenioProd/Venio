# Notion-like Personal Workspace — Plan d'implementation

Date: 2026-05-20
Statut: roadmap, non implementee
Cle projet recommandee dans le Dev Workspace: `NOTI`

## Pourquoi

Raphael utilise aujourd'hui plusieurs outils (Notion, Apple Notes, fichiers
Markdown du VPS, dashboard Venio admin) pour suivre :

- ses projets personnels (Arrow, Akatsuki, SEI, Absys, Amaterasu, etc.) ;
- ses classes (EMA, ESVE, MBWAY, Tunon, GGI, ISIFA) — supports, sequencages,
  notation, retours etudiants.

L'objectif est de rapatrier ce travail dans Venio derriere un module dedie qui
n'interfere ni avec `Dev Workspace`, ni avec `Gestion`, ni avec les ressources
clientes existantes. Le module doit ressembler a Notion sur le coeur (pages
imbriquees + databases + vues) sans devenir un clone generaliste.

## Perimetre MVP

Deux espaces racines, isoles l'un de l'autre :

1. **Projets persos** — projets en cours, ideas, OKR, journal de bord.
2. **Suivi classes** — une page par ecole, sous-pages par promotion / matiere /
   sequence, plus une base "Eleves" partagee.

Hors-scope MVP : commentaires temps reel, multi-utilisateurs, IA generative
embarquee (utiliser Akatsuki / Kuro depuis l'exterieur).

## Modeles a creer

### `WorkspacePage`

| Champ | Type | Note |
|---|---|---|
| _id | ObjectId | |
| workspace | enum `PERSONAL` \| `TEACHING` | racines |
| parent | ObjectId `WorkspacePage` \| null | imbrication |
| title | string | |
| icon | string \| null | emoji ou identifiant lucide |
| cover | string \| null | URL ou path Nextcloud |
| createdBy | ObjectId `User` | restreint a SUPER_ADMIN pour MVP |
| archived | boolean | soft delete |
| order | number | pour le tri manuel siblings |
| timestamps | | |

Index : `(workspace, parent, order)`, `(workspace, archived)`.

### `WorkspaceBlock`

Bloc Notion-like. Une page contient une liste ordonnee de blocs.

| Champ | Type | Note |
|---|---|---|
| _id | ObjectId | |
| page | ObjectId `WorkspacePage` | requis |
| order | number | position dans la page |
| type | enum | `paragraph`, `heading_1..3`, `bulleted_list`, `numbered_list`, `todo`, `callout`, `quote`, `divider`, `code`, `image`, `embed`, `database_view`, `subpage` |
| content | object | structure dependant du type (texte rich, src, alt, langage code, etc.) |
| children | ObjectId[] | sous-blocs (toggle, callout, etc.) |
| checked | boolean | pour `todo` |
| timestamps | | |

Index : `(page, order)`.

### `WorkspaceDatabase`

| Champ | Type | Note |
|---|---|---|
| _id | ObjectId | |
| page | ObjectId `WorkspacePage` | conteneur |
| name | string | |
| schema | array `{ id, name, type, options? }` | colonnes |
| views | array `{ id, type, name, filters, sort, groupBy }` | `table`, `kanban`, `calendar`, `gallery` |
| timestamps | | |

Types de colonne MVP : `text`, `number`, `select`, `multi_select`, `status`,
`date`, `person`, `url`, `email`, `phone`, `checkbox`, `relation`,
`rollup` (count uniquement au MVP).

### `WorkspaceRow`

| Champ | Type | Note |
|---|---|---|
| _id | ObjectId | |
| database | ObjectId `WorkspaceDatabase` | |
| fields | Record<colId, valeur> | indexe par schema |
| timestamps | | |

Index : `(database, updatedAt)`, plus un index multikey sur `fields` pour les
filtres rapides.

### Modeles attaches a "Suivi classes"

- `TeachingClass` — ecole, promotion, annee, matiere, lien vers la page racine.
- `TeachingSession` — date, sujet, support PDF, slides, presence (boolean array
  ref `Student`), devoirs.
- `Student` — base partagee entre toutes les classes (prenom, nom, email
  optionnel, ecole, promo).
- `Grade` — note d'un eleve sur une session ou un devoir, ponderation.

Tout reste accessible aussi par `WorkspaceDatabase` / `WorkspaceRow` pour la
souplesse Notion-like, les modeles dedies servent les agregations rapides
(moyenne par eleve, par classe).

## API admin

Route prefixe : `/api/admin/workspace`.

```
GET    /api/admin/workspace/tree?workspace=PERSONAL|TEACHING
GET    /api/admin/workspace/pages/:id
POST   /api/admin/workspace/pages          { workspace, parent?, title }
PATCH  /api/admin/workspace/pages/:id
DELETE /api/admin/workspace/pages/:id      (soft delete -> archived=true)
POST   /api/admin/workspace/pages/:id/move { parent, order }

GET    /api/admin/workspace/pages/:id/blocks
PUT    /api/admin/workspace/pages/:id/blocks   // remplace tout (autosave debounce)
PATCH  /api/admin/workspace/blocks/:id

GET    /api/admin/workspace/databases/:id
POST   /api/admin/workspace/databases
PATCH  /api/admin/workspace/databases/:id
DELETE /api/admin/workspace/databases/:id

GET    /api/admin/workspace/databases/:id/rows?view=<viewId>&filters=...
POST   /api/admin/workspace/databases/:id/rows
PATCH  /api/admin/workspace/rows/:id
DELETE /api/admin/workspace/rows/:id
```

Filtres : reutiliser le pattern `qs()` deja en place pour `/api/admin/dev`.

Permissions : `view_workspace`, `manage_workspace`, ajoutees en parallele de
`view_dev` / `manage_dev`. Roles RH/VIEWER bloques par defaut. Les classes
peuvent etre lues par les enseignants membres si on ajoute plus tard un role
`TEACHER`.

## Frontend

Route : `/admin/workspace`.

Layout principal :

- Barre laterale gauche : arbre des pages (drag-and-drop, deux racines
  `Projets persos` / `Suivi classes`), bouton "Ajouter une page".
- Zone centrale : titre + icone + cover, puis liste des blocs editables
  inline (raccourci `/` pour menu slash a la Notion).
- Pour les pages contenant une `database_view`, render adaptable (table /
  kanban / calendrier).

Composants reutilisables :

- `BlockRenderer` : dispatch sur `block.type`.
- `RichTextEditor` : ContentEditable + commandes (gras, italique, lien) sans
  framework lourd. Pas de TipTap / ProseMirror au MVP pour rester leger.
- `DatabaseView` : header colonnes triables/filtrables, slot par type de vue.
- `SlashMenu` : insertion de blocs.

Stockage local d'un cache (`localStorage` ou IndexedDB plus tard) pour la
liste des pages, debounce sur le PUT blocks (1000 ms).

## Imports / sortie

Apres MVP :

- Export d'une page en Markdown.
- Import d'une zone Notion via `notion-to-md` ou export CSV des bases Notion.
- Mode "presentation" pour projeter une page de classe pendant le cours.

## Decoupage execution

### Phase 0 — Specs detaillees
- [ ] Specs UX (Figma ou maquettes Markdown) — slash menu, layout pages
- [ ] Specs vues database (table / kanban / calendrier)

### Phase 1 — Socle backend
- [ ] Modeles Mongoose `WorkspacePage`, `WorkspaceBlock`, `WorkspaceDatabase`,
      `WorkspaceRow`
- [ ] Permissions `view_workspace` / `manage_workspace`
- [ ] CRUD pages + tree endpoint + tests
- [ ] CRUD blocks avec autosave (PUT replace + PATCH partiel)

### Phase 2 — Frontend pages + blocs
- [ ] Route `/admin/workspace` + sidebar + breadcrumb
- [ ] Editeur de blocs (paragraphes, headings, listes, todos, callouts, code)
- [ ] Slash menu
- [ ] Drag-and-drop entre pages
- [ ] Cover + icone par page

### Phase 3 — Databases
- [ ] CRUD database + schema editable (rename/reorder/add/remove colonnes)
- [ ] Vue table editable inline
- [ ] Vues kanban + calendrier
- [ ] Filtres / tri / regroupement persistes par vue
- [ ] Bloc `database_view` pour reference inline depuis une page

### Phase 4 — Modeles classes
- [ ] `TeachingClass`, `TeachingSession`, `Student`, `Grade`
- [ ] Pages templates : "Nouvelle classe", "Nouvelle session"
- [ ] Vue calendrier des sessions
- [ ] Agregations notes (moyenne par eleve, par classe)
- [ ] Export PDF (jspdf existant) bulletin de note

### Phase 5 — Import / export
- [ ] Export Markdown d'une page
- [ ] Import depuis export Notion zip (best-effort)
- [ ] Backup JSON par workspace

## Criteres d'acceptation MVP

- Raphael peut creer une page de projet perso, y ajouter blocs et database, et
  retrouver le tout apres reload.
- Il peut creer une page "Classe ESVE 2025-2026" contenant une database des
  eleves et des sessions.
- L'authentification reste celle de Venio (JWT existant).
- Les permissions empechent un compte client/RH d'acceder au workspace.
- Le module n'introduit aucune regression sur `/admin/dev`, `/admin/gestion`,
  `/admin/projets-internes`.

## Risques a eviter

- Construire un editeur trop ambitieux (collaboration temps reel, IA inline,
  AI blocks) avant que le socle pages + blocs + databases ne tienne.
- Reutiliser les modeles `Task` ou `InternalProject` pour stocker des pages
  Notion — ils ne sont pas faits pour ca.
- Sauter Phase 0 specs et improviser l'UX en code : le slash menu et la
  navigation arborescente meritent une vraie maquette.
- Tenter de reproduire toutes les colonnes Notion dans le MVP — limiter aux
  types listes plus haut.

## Liens

- Dev Workspace existant : [`dev-workspace-linear-like.md`](./dev-workspace-linear-like.md)
- CLAUDE / methodologie : `../../README_PROJET.md`

Une fois ce plan accepte, creer un projet `NOTI` dans `/admin/dev` et
generer la liste d'issues (une par check-list ci-dessus) pour suivre
l'avancement comme n'importe quel autre projet Venio.
