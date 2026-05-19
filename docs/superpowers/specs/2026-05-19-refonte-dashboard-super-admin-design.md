# Refonte du dashboard super admin Venio — design

> **Date** : 2026-05-19
> **Auteur** : Raphaël Bentvelzen (brainstorming avec Claude)
> **Statut** : ✅ Livré le 2026-05-19 via PRs [#46](https://github.com/VenioProd/Venio/pull/46) (Phase 1 — fondations), [#47](https://github.com/VenioProd/Venio/pull/47) (Phase 2 — sidebar pivot), [#48](https://github.com/VenioProd/Venio/pull/48) (Phase 3 — analytics), [#49](https://github.com/VenioProd/Venio/pull/49) (Phase 4 — inbox backend), [#53](https://github.com/VenioProd/Venio/pull/53) (Phase 5 — inbox frontend), Phase 6 (layout final + cleanup) dans la PR courante.
> **Worktrees** : `claude/xenodochial-mclean-73615e` (Phases 1–4), worktrees Claude par phase ensuite.
> **Follow-up connu** : le `PeriodSelector` est wire côté frontend (state + localStorage + query param `?period=`), mais le backend `/api/admin/dashboard/super` ignore actuellement le param — support `period` au backend à ajouter en suivi pour que le sélecteur pilote vraiment les données.

## Contexte

Le dashboard super admin actuel ([SuperAdminDashboard.tsx](../../../src/pages/admin/SuperAdminDashboard.tsx)) a été refondu récemment (commit `af3fe6c`). Il contient 8 sections empilées verticalement, avec une bonne couverture fonctionnelle mais une **hiérarchie plate** : tout a le même poids visuel, les KPIs sont statiques (pas de deltas, pas de période), les insights sont bruts (chiffres au lieu de "ce qu'il faut faire aujourd'hui"), et les styles inline omniprésents empêchent toute réutilisation.

L'objectif de la refonte :
1. Transformer le dashboard d'un **tableau de chiffres** en **outil de décision quotidien**.
2. Aligner sur le **langage visuel néon Venio** existant (fond `#000`, accent `#0ea5e9`, glows, coins néon, KPI cards à border-left coloré).
3. Donner aux KPIs une **vraie valeur analytique** (période sélectionnable, deltas, sparklines, charts style "financial timeline").
4. Poser un **système de widget réutilisable** pour éviter les styles inline et permettre la réutilisation ailleurs (compta, CRM).

## Décisions UX validées (brainstorming visuel)

| # | Décision |
|---|---|
| 1 | Archétype **hybride équilibré** : zone Action côte à côte avec zone Analytics |
| 2 | Macro-layout **2 colonnes** au-dessus du fold, sections résiduelles empilées en dessous |
| 3 | Colonne gauche = **Inbox unifiée Linear-style** (cartes mixtes, snooze, raccourcis clavier) |
| 4 | 8 sources alimentent l'inbox : Décisions, Briefs P1, Leads chauds, Messages (DM + @), Tickets internes, Tâches en retard, Alertes système, Items épinglés |
| 5 | Colonne droite = **Pulse status** (checks règles vert/orange/rouge) + **KPI grille 2x2** + **1 chart financial** |
| 6 | Style visuel **néon Venio existant** (cf. [theme.css](../../../src/styles/theme.css), [AdminPortal.css `admin-stat-card`](../../../src/pages/admin/AdminPortal.css)) |
| 7 | Add-on : **bouton flottant pivot Linear-style** pour rétractation sidebar admin desktop (remplace le bouton actuel discret en bas) |

Les mockups de la phase de brainstorming sont dans `.superpowers/brainstorm/70212-1779185883/content/` (non commit, ignoré via `.gitignore`).

## Architecture composants

Tous les nouveaux composants vivent dans `src/components/dashboard/` (déjà initialisé avec `DashKpiCard`, `DashSection`, `DashAlertBanner`).

### Génériques (réutilisables hors dashboard)

| Composant | Rôle | Existe ? |
|---|---|---|
| `DashWidget` | Wrapper standard : titre/icône, action optionnelle, states (loading / empty / error / refreshing), padding cohérent | À créer |
| `DashKpiCard` | Carte KPI avec border-left coloré, valeur + glow text-shadow | **Étendre** : ajouter `delta`, `objective`, `sparkline?`, `accentColor` (au lieu de `:nth-child` actuel) |
| `DashSection` | Section dépliable avec titre | Existant, garder |
| `FinancialChart` | Area chart cyan + volume bars + crosshair + grille (style trading) ; accepte 1 ou 2 séries ; props `data`, `seriesA`, `seriesB?`, `period`, `currentValue`, `label` | À créer |
| `PeriodSelector` | Chips `7j / 30j / 90j / YTD`, contrôlé par prop `value` + `onChange` | À créer |
| `Sparkline` | Mini SVG inline pour intégrer dans `DashKpiCard` | À créer |

### Spécifiques Inbox (colonne gauche)

| Composant | Rôle |
|---|---|
| `InboxStream` | Orchestrateur : fetch source unifiée, applique filtre actif, gère raccourcis clavier globaux (↑↓ A R S ⏎ F), focus state |
| `InboxCard` | Carte universelle : `tag` (URG/P1/CRM/MSG/TKT/TSK/SYS/PIN) avec couleur dédiée, `title`, `meta[]`, `actions[]` (boutons inline contextuels selon type) |
| `InboxFilters` | Chips tabs : Tout / Décisions / Briefs / CRM / Messages / Tickets / Tâches / Snoozées + compteurs |
| `SnoozePopover` | Quick options : 1h / Ce soir 18h / Demain 9h / Lundi 9h / Custom (date+heure picker) |

### Spécifiques Analytics (colonne droite)

| Composant | Rôle |
|---|---|
| `PulseStatus` | Liste de checks dot+label+statut. Props : `checks: Array<{id, label, status: 'ok'\|'warn'\|'bad', detail?}>` |
| `KpiGrid2x2` | Composition de 4 `DashKpiCard` en grille |

### Transverse (sidebar)

| Composant | Rôle |
|---|---|
| `SidebarCollapseToggle` | Bouton flottant pivot accroché au bord droit de la sidebar, demi-cercle, glow cyan au hover, chevron qui pivote selon `collapsed`. Greffé dans [AdminShell.tsx](../../../src/components/AdminShell.tsx) (qui possède déjà l'état). Visible desktop uniquement (mobile = drawer existant). |

### Page `SuperAdminDashboard.tsx` après refonte

Devient un simple compositeur (~80 lignes au lieu de ~500) :

```
<PageHeader title="Pilotage Venio" period={period} onPeriodChange={setPeriod} onRefresh={...} />
<TwoColumnGrid>
  <LeftColumn>
    <InboxStream period={period} />
  </LeftColumn>
  <RightColumn>
    <PulseStatus checks={pulseData} />
    <KpiGrid2x2 kpis={kpisData} period={period} />
    <FinancialChart data={chartData} period={period} label="CA + Volume" />
  </RightColumn>
</TwoColumnGrid>

<DashSection title="Opérations" icon={<FolderKanban />}>
  <ProjectsByStatusPie /> + <BriefsByPriorityList />
</DashSection>
<DashSection title="Équipe" icon={<Users />}>
  <TeamLoadBarChart />
</DashSection>
<DashSection title="Raccourcis" icon={<Plus />}>
  <ShortcutButtons />
</DashSection>
```

Tous les styles inline disparaissent, remplacés par classes CSS dans `src/components/dashboard/dashboard.css` (à créer).

## Data layer

### Endpoint actuel à étendre

[`backend/src/routes/admin/dashboard.ts`](../../../backend/src/routes/admin/dashboard.ts) — la route `GET /api/admin/dashboard/super` reste mais devient un méta-endpoint léger qui retourne uniquement :
- `pulseChecks: Array<{id, label, status, detail?}>` (calculé en service à partir des règles métier — voir §Règles Pulse)
- `kpis: { ca: {value, delta, objective, sparkline}, pipeline: {...}, hotLeads: {...}, activeProjects: {...} }`
- `chartCA: Array<{ts, value, volume}>` selon période demandée

**Query param** : `?period=7d|30d|90d|ytd` (default `30d`).

### Nouvel endpoint Inbox

`GET /api/admin/inbox` — agrège les 8 sources, applique scoring d'urgence, retourne un flux unifié.

**Response shape** :
```ts
{
  items: InboxItem[],
  counts: { all: number, decisions: number, briefs: number, ... },
  snoozedCount: number
}

InboxItem = {
  id: string,                          // composite: `${type}:${sourceId}`
  type: 'decision' | 'brief' | 'lead' | 'message' | 'ticket' | 'task' | 'system' | 'pin',
  sourceId: string,                    // id Mongo du doc d'origine
  title: string,
  meta: string[],                      // ex: ["Sarah · il y a 2h", "échéance demain"]
  urgency: number,                     // score 0-100 calculé
  tag: { label: string, color: string },
  actions: InboxAction[],              // ex: [{kind: 'approve', label: 'A ✓', shortcut: 'a'}]
  link?: string,                       // navigation profonde (ex: /admin/decisions/xxx)
}
```

**Sources mappées** :

| Type | Model | Sélection | Tag | Actions |
|---|---|---|---|---|
| `decision` | `Decision` | `status === 'PENDING'` | URG/HAUTE/NORMALE selon `priority` | Valider (A), Rejeter (R) |
| `brief` | `MissionBrief` | `priority === 'P1'` && deadline ≤ J+0 | P1 | Ouvrir (⏎) |
| `lead` | `Lead` | `temperature === 'HOT'` && `lastContactAt < now - 7d` | CRM | Email, Snooze |
| `message` | `InternalMessage` + `InternalConversation` | DM non lus OR @mention dans canal | MSG | Lire (⏎) |
| `ticket` | `InternalTicket` | `status !== 'CLOSED'` && `assignee === me` | TKT | Ouvrir |
| `task` | `Task` | `dueDate < now - 2d` && `assignee === me` | TSK | Ouvrir, Marquer fait (F) |
| `system` | (calculé) | Règles : backup K.O. dernières 24h, audit RGPD trimestriel J-7, signatures Qualiopi J-14 | SYS | Ouvrir |
| `pin` | `InboxPin` (nouveau) | `userId === me` && pas expiré | PIN (couleur custom selon source pinned) | Ouvrir, Désépingler |

**Scoring d'urgence** (algo simple, à itérer) :
- Base par type (URG = 100, P1 = 80, CRM hot tardif = 70, etc.)
- Bonus si deadline dépassée (+20)
- Bonus si snoozed-reveille (+10)
- Items snoozés masqués par défaut, visibles via filtre dédié

**Tri par défaut** : `urgency DESC`, secondaire `createdAt DESC`.

### Nouveaux models

#### `backend/src/models/InboxSnooze.ts`
```ts
{
  userId: ObjectId,
  itemType: string,        // 'decision' | 'brief' | ...
  sourceId: ObjectId,
  snoozedUntil: Date,
  createdAt: Date,
}
```
Index unique sur `(userId, itemType, sourceId)`. TTL index sur `snoozedUntil` pour cleanup auto.

#### `backend/src/models/InboxPin.ts`
```ts
{
  userId: ObjectId,
  refType: string,         // type d'objet pinné ('project'|'client'|'brief'|...)
  refId: ObjectId,
  title: string,           // snapshot du titre (peut décorréler si renommé)
  link: string,            // URL vers l'objet
  color?: string,          // accent custom optionnel
  createdAt: Date,
  expiresAt?: Date,        // optionnel: auto-unpin
}
```

### Nouvelles routes

| Route | Méthode | Auth | Rôle |
|---|---|---|---|
| `/api/admin/inbox` | GET | admin | Liste agrégée |
| `/api/admin/inbox/snooze` | POST | admin | Body: `{itemType, sourceId, snoozedUntil}` |
| `/api/admin/inbox/snooze/:id` | DELETE | admin | Annule snooze |
| `/api/admin/inbox/pin` | POST | admin | Pinner |
| `/api/admin/inbox/pin/:id` | DELETE | admin | Dépinglier |

### Service d'agrégation

Fichier : `backend/src/lib/inbox/aggregator.ts` (nouveau)
- `buildInbox(userId, opts): Promise<InboxItem[]>` — orchestrateur
- Une fonction par source : `getDecisionItems(userId)`, `getBriefP1Items(userId)`, etc.
- `scoreUrgency(item): number` — pure function
- `applySnoozes(items, snoozes): InboxItem[]` — filtre + ajoute flag

Couvre un seul concern, testable indépendamment.

### Règles Pulse

Fichier : `backend/src/lib/dashboard/pulseRules.ts` (nouveau). Chaque règle est un objet :
```ts
type PulseRule = {
  id: string,
  label: string,
  check: (ctx: DashboardContext) => Promise<{status: 'ok'|'warn'|'bad', detail?: string}>,
}
```

Règles initiales (modifiables sans toucher au front) :
- `ca-on-track` : CA mois ≥ 70% objectif → ok, ≥ 40% → warn, < 40% → bad
- `pipeline-growing` : delta pipeline 30j positif → ok, stable → warn, négatif → bad
- `hot-leads-followup` : aucun lead hot sans contact 7j+ → ok, 1-3 → warn, 4+ → bad
- `team-balanced` : aucun admin > 10 tâches ouvertes → ok, 1 admin → warn, 2+ → bad
- `briefs-p1-on-time` : tous briefs P1 dans les temps → ok, 1 dépassé → warn, 2+ → bad
- `backup-success` : backup ≤ 24h OK → ok, 24-48h → warn, > 48h ou échoué → bad
- `qualiopi-compliant` : aucune signature à renouveler avant J+30 → ok, sinon warn

## State & personnalisation

### Period (global)

Stocké dans un **Context React** simple `PeriodContext` (`src/context/PeriodContext.tsx`, nouveau) :
```ts
{ period: '7d' | '30d' | '90d' | 'ytd', setPeriod }
```
Lu par `KpiGrid2x2`, `FinancialChart`, `InboxStream` (pour les seuils "lead chaud non contacté X jours" qui dépendent de la période courante ? → à confirmer : probablement pas, l'inbox a sa propre logique).

Persisté en `localStorage` `venio-admin-dashboard-period`.

### Snooze

Géré côté backend (model `InboxSnooze`), pas de state frontend persistant — l'inbox se recharge après une action snooze.

### Sidebar collapse

Existant, conservé tel quel ([AdminShell.tsx:14](../../../src/components/AdminShell.tsx)). Le nouveau `SidebarCollapseToggle` consomme le même `onCollapseToggle`.

### Personnalisation modules (différée)

L'ordre/visibilité des sections résiduelles (Opérations, Équipe, Raccourcis) est **fixe en V1**. La personnalisation (drag-drop, masquer) est marquée comme évolution V2 — pas dans cette spec.

## Style & design system

### Tokens utilisés

Tous depuis [src/styles/theme.css](../../../src/styles/theme.css) :
- `--bg-primary` = `#000`
- `--primary` = `#0ea5e9`, avec dérivés `--primary-rgb`, `--accent-glow`, `--primary-shadow`
- `--text-primary`, `--text-secondary`, `--text-muted`
- `--border-color`

### Palette KPI (cohérent avec `admin-stat-card` existant)

| Card position | Couleur néon |
|---|---|
| 1 (CA) | `#ff0080` (pink) |
| 2 (Pipeline) | `#8b5cf6` (violet) |
| 3 (Leads) | `#f59e0b` (amber) |
| 4 (Projets) | `#22c55e` (green) |

Pattern : `border-left: 3px solid <couleur>` + `text-shadow: 0 0 20px rgba(<couleur>, 0.5)` sur la valeur.

### Coins néon

Les wrappers (`DashWidget`, `InboxStream` container, `FinancialChart`) ont des coins néon haut-gauche / bas-droite reprenant le pattern de [NeonCorners.css](../../../src/components/NeonCorners.css) — pseudo-éléments `::before` / `::after` avec border + drop-shadow glow.

### CSS file

`src/components/dashboard/dashboard.css` (nouveau) — toutes les classes regroupées par composant. Bannit les styles inline.

## Mobile / responsive

- **Sidebar** : pas de changement (drawer mobile existant).
- **Layout 2 colonnes** : se transforme en **2 onglets** (`Action` / `Analytics`) en `< 900px` via media query CSS + composant `TabbedView` léger. Pas de stack vertical (perd le bénéfice du parallèle).
- **Sections résiduelles** : déjà responsive (grid auto-fit).
- **Inbox raccourcis clavier** : désactivés sur mobile (pas de clavier physique).

## Plan d'implémentation (préliminaire — détaillé dans writing-plans)

Phases pensées pour livrer de la valeur de manière incrémentale, chaque phase autonome et déployable :

1. **Phase 1 — fondations design system** : `DashWidget`, étendre `DashKpiCard`, `PeriodSelector`, `Sparkline`, `FinancialChart`, `dashboard.css`, refacto styles inline existants. *Aucun changement de comportement utilisateur, prépare le terrain.*
2. **Phase 2 — Sidebar pivot toggle** : `SidebarCollapseToggle` flottant, masquage de l'ancien bouton, animation chevron. *Indépendant, livrable séparément.*
3. **Phase 3 — Analytics colonne droite** : `PulseStatus`, `KpiGrid2x2` avec deltas/objectifs, chart financial, endpoint dashboard/super enrichi avec règles Pulse + KPIs avec delta. *Dashboard déjà meilleur même sans inbox.*
4. **Phase 4 — Inbox backend** : models `InboxSnooze` / `InboxPin`, service `aggregator`, routes `/api/admin/inbox`. Tests d'agrégation et de scoring.
5. **Phase 5 — Inbox frontend** : `InboxStream`, `InboxCard`, `InboxFilters`, `SnoozePopover`, raccourcis clavier. Remplace les sections "Mon activité" + "Décisions" + "Messages en attente" du dashboard.
6. **Phase 6 — Layout 2 colonnes** : composer la nouvelle page `SuperAdminDashboard` avec `TwoColumnGrid`, déplacer les sections résiduelles en dessous, responsive tabs mobile.

## Tests

Stratégie alignée sur les patterns Venio existants ([isolate frontend/backend test suites](../../../backend/) commit `72b67f4`) :

- **Backend** :
  - `aggregator.ts` — tests vitest unitaires par source (mock des collections, vérifier filtrage), test du scoring d'urgence (cas limites), test de l'apply-snoozes.
  - Routes inbox — tests d'intégration vitest avec mongo in-memory, vérifier auth admin requise.
  - `pulseRules.ts` — chaque règle testée isolément avec contextes simulés.
- **Frontend** :
  - `InboxStream` — test des raccourcis clavier (jsdom), focus state, comportement filtres.
  - `FinancialChart` — test des props 1 série vs 2 séries (vérifier nombre de paths rendus), test du formatter d'axe Y.
  - `SidebarCollapseToggle` — test du toggle, persistance localStorage (déjà testée pour l'existant, conserver).

## Hors-scope (V1)

- Drag-and-drop pour réordonner les widgets
- Vues sauvegardées multiples (mode "compact" / "détaillé")
- Forecast cash prévisionnel (envisagé en alternative au Pulse, gardé pour V2)
- Digest IA quotidien ("ce qui a bougé depuis hier")
- Notifications push pour nouvelles décisions urgentes (couvert ailleurs par socket commit `6364952`, à intégrer mais pas dans cette spec)
- Top clients à risque (intéressant, mais à scoper séparément avec la définition métier de "client à risque")

## Open questions

1. **Seuil "lead chaud sans contact"** : on a mis 7j par défaut. À confirmer avec l'usage réel.
2. **Seuil "tâche en retard"** : 2j par défaut (pour éviter de polluer l'inbox avec toutes les tâches dépassées de quelques heures). Configurable ?
3. **Pulse rules** : 7 règles initiales — il en manque probablement (Qualiopi formations, audit accounting, etc.). Liste à étoffer après V1 sur retour terrain.
4. **`FinancialChart` lib** : on continue avec `recharts` (déjà utilisé) en custom-stylant l'AreaChart, ou on écrit du SVG pur ? **Recommandation** : `recharts` pour la cohérence et le hover/tooltip natif, surcouche CSS pour le look financial.
5. **Mode "Vue compacte"** : non prévu V1. Si un jour pertinent, c'est un toggle qui contracte les KPI grids et masque les sections résiduelles.

## Références code

- Dashboard actuel : [SuperAdminDashboard.tsx](../../../src/pages/admin/SuperAdminDashboard.tsx)
- Composants dashboard : [src/components/dashboard/](../../../src/components/dashboard/)
- Theme : [theme.css](../../../src/styles/theme.css)
- Style néon de référence : [NeonCorners.css](../../../src/components/NeonCorners.css), [NeonDivider.css](../../../src/components/NeonDivider.css)
- Style KPI néon : [AdminPortal.css `.admin-stat-card`](../../../src/pages/admin/AdminPortal.css) (lignes ~526-566)
- Shell admin (sidebar collapse) : [AdminShell.tsx](../../../src/components/AdminShell.tsx)
- Route dashboard backend : [dashboard.ts `/super`](../../../backend/src/routes/admin/dashboard.ts) (ligne 114)
- Route décisions backend : [decisions.ts](../../../backend/src/routes/admin/decisions.ts)
- Socket notifications (commit récent) : `6364952`
