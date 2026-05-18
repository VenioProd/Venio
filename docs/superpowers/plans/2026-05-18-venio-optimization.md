# Plan d'optimisation Venio — Audit 2026-05-18

Source Linear: https://linear.app/venio/document/plan-doptimisation-venio-audit-2026-05-18-002c1d5f8a31
Ticket parent: VEN-351

## Objectif

Stabiliser, sécuriser et optimiser Venio après audit du dépôt local le 18 mai 2026.

## État vérifié au 18/05/2026

* `npm run typecheck`: OK
* `npm run build`: OK (warning asset `/realisations/ecole-image.jpg`)
* `cd backend && npm run typecheck`: OK
* `cd backend && npm run build`: OK
* `cd backend && npm test`: OK, 50 fichiers, 622 tests
* `npm test`: échec car la suite racine exécute aussi `backend/src`, `backend/dist`

## Risques principaux

1. Vitest racine scanne trop large, résultats trompeurs.
2. `backend/src/index.ts` supprime des données demo/test au démarrage — dangereux en prod.
3. Permissions dupliquées entre `backend/src/lib/permissions.ts` et `src/lib/permissions.ts`.
4. Routes admin frontend sous-protégées: tickets, accès outils, projets internes, ressources, arrow-prospection, rapports, guide.
5. Endpoints admin exposent des agrégats sans filtrage équivalent à la liste principale (tickets stats/KPI/archives).
6. Mongoose signale des index dupliqués `slug` et `number`.
7. Fichiers frontend de 700 à 1800 lignes.
8. Chunks PDF/canvas/comptabilité lourds: AccountingDashboard ~392 kB, jspdf ~390 kB, html2canvas ~201 kB.
9. Appels API frontend alternent entre `apiFetch` et `fetch` directs.
10. Documentation projet pas alignée avec l'architecture réelle.

---

# Phase 1 — Séparer et stabiliser les suites de tests (VEN-352, High, 2pts)

## Constat

Le test racine lance aussi des tests backend et `backend/dist`. Source de deux échecs:
- duplicate billing number attendu en 409 mais reçu 201
- compteur `totalRequests` agent resté à 0

Backend seul passe, donc le problème est l'isolation de suite.

## Fichiers

* `vite.config.ts`
* `backend/vitest.config.ts`
* `package.json`
* `backend/package.json`
* `.github/workflows/*`

## Travail

1. Dans `vite.config.ts`, exclure:
```ts
exclude: [
  '**/node_modules/**',
  '**/.git/**',
  '**/.claude/**',
  '**/.superpowers/**',
  '**/dist/**',
  '**/backend/**',
]
```

2. Dans `backend/vitest.config.ts`, exclure:
```ts
exclude: [
  '**/node_modules/**',
  '**/dist/**',
  '**/uploads/**',
  '**/.git/**',
]
```

3. Clarifier les scripts racine:
```json
"test:frontend": "vitest run",
"test:backend": "npm --prefix backend test",
"test:all": "npm run test:frontend && npm run test:backend"
```

4. Mettre à jour la CI pour lancer frontend et backend séparément.

## Critères d'acceptation

* `npm test` n'affiche plus de logs MongoMemoryServer/backend.
* `cd backend && npm test` n'exécute plus `backend/dist/__tests__`.
* `npm run test:all` passe.
* Les résultats locaux et CI sont cohérents.

---

# Phase 2 — Sortir le cleanup démo du démarrage serveur (VEN-353, Urgent, 2pts)

## Constat

`backend/src/index.ts` supprime des comptes/projets/leads demo ou fictifs au démarrage. Risque data en prod.

## Fichiers

* `backend/src/index.ts`
* `backend/src/scripts/cleanupDemoData.ts`
* `backend/package.json`
* `docs/deploiement/GUIDE_CONFIGURATION.md`

## Travail

1. Retirer du boot le bloc `// Cleanup fictional/test data`.
2. Créer `backend/src/scripts/cleanupDemoData.ts`.
3. Garde explicite:
```ts
if (process.env.ALLOW_DEMO_CLEANUP !== 'true') {
  throw new Error('Set ALLOW_DEMO_CLEANUP=true to run demo cleanup')
}
```
4. Dry-run:
```ts
const dryRun = process.argv.includes('--dry-run')
```
5. Scripts backend:
```json
"cleanup:demo": "tsx src/scripts/cleanupDemoData.ts",
"cleanup:demo:dry": "tsx src/scripts/cleanupDemoData.ts --dry-run"
```

## Critères d'acceptation

* Serveur démarre sans suppression auto.
* `ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry` liste les suppressions.
* Mode réel uniquement sur action explicite.
* Doc à jour.

---

# Phase 3 — Durcir permissions, routes admin et visibilité tickets (VEN-354, Urgent, 5pts)

## Constat

Permissions dupliquées front/back. Routes admin sans `RequirePermission`. Endpoints tickets agrégés ne filtrent pas comme la liste principale.

## Fichiers

* `backend/src/lib/permissions.ts`
* `src/lib/permissions.ts`
* `src/lib/__tests__/permissions-sync.test.ts`
* `src/App.tsx`
* `backend/src/routes/admin/tickets.ts`
* `backend/src/routes/admin/arrowProspection.ts`
* `backend/src/routes/admin/resources.ts`
* `backend/src/routes/admin/internalProjects.ts`
* `backend/src/routes/admin/toolAccess.ts`

## Travail

1. Source de vérité ou test de sync pour permissions.
2. Liste canonique:
```ts
[
  'manage_admins', 'manage_clients', 'view_crm', 'manage_crm',
  'view_messaging', 'send_messages', 'manage_channels',
  'view_projects', 'edit_projects', 'view_content', 'edit_content',
  'view_billing', 'manage_billing', 'manage_tasks',
  'view_qualiopi', 'manage_qualiopi', 'view_tickets',
  'create_tickets', 'manage_tickets', 'view_accounting',
  'manage_accounting', 'lock_accounting', 'view_vat', 'manage_vat',
  'export_fec', 'manage_external_sources'
]
```
3. Dans `src/App.tsx`, protéger:
* `tickets` → `VIEW_TICKETS`
* `acces-outils` → permission dédiée ou `MANAGE_ADMINS`
* `projets-internes` → `VIEW_PROJECTS` ou dédiée
* `ressources` → `VIEW_CONTENT` ou dédiée
* `arrow-prospection` → `VIEW_CRM` / `MANAGE_CRM`
* `mes-rapports` selon rôle
* `guide` peut rester ouvert aux admins
4. `backend/src/routes/admin/tickets.ts`: même filtre auteur/permissions sur stats, archives, KPI, détails.

## Critères d'acceptation

* Toute route admin sensible protégée UI.
* Toute route API sensible protégée et testée.
* Non-SUPER_ADMIN ne voit pas tickets d'autres auteurs via stats/archives/KPI/détails sans permission.
* Dérive permissions front/back fait échouer les tests.

---

# Phase 4 — Nettoyer warnings Mongoose et intégrité données (VEN-355, Medium, 2pts)

## Constat

Index dupliqués sur `slug` et `number`.

## Fichiers

* `backend/src/models/ExternalSource.ts`
* `backend/src/models/QualiopiCriterion.ts`
* `backend/src/models/InternalConversation.ts`
* `backend/src/models/BillingDocument.ts`
* `backend/src/__tests__/agent-billing-documents-integration.test.ts`

## Travail

1. Supprimer index explicites quand champ porte déjà `unique: true` ou `index: true`.
2. Garder index composés utiles.
3. Relancer `cd backend && npm test`.
4. Conserver test duplicate billing number:
```ts
expect(r2.status).toBe(409)
expect(r2.body.code).toBe('NUMBER_ALREADY_EXISTS')
```

## Critères d'acceptation

* Plus de warning Mongoose duplicate index.
* Tests backend passent sans bruit.
* Contraintes uniques actives.

---

# Phase 5 — Centraliser les appels API frontend (VEN-356, Medium, 5pts)

## Constat

`src/lib/api.ts` existe mais services/pages utilisent `fetch` direct pour uploads/downloads.

## Fichiers

* `src/lib/api.ts`
* `src/services/accounting.ts`
* `src/services/adminTasks.ts`
* `src/services/messaging.ts`
* `src/pages/espace-client/Profile.tsx`
* `src/pages/admin/project-detail/index.tsx`
* `src/pages/admin/qualiopi-board/index.tsx`
* `src/pages/admin/intern-list/index.tsx`

## Travail

1. `ApiError` avec `status`, `message`, `payload`.
2. `apiUpload(path, formData, options)` sans forcer `Content-Type: application/json`.
3. `apiDownload(path, options)` renvoyant `Blob` + filename via `Content-Disposition`.
4. Migrer services transverses d'abord: accounting, adminTasks, messaging.
5. Migrer ensuite pages upload/download.

## Critères d'acceptation

* Plus de lecture directe de `localStorage.getItem('auth_token')` hors `src/lib/api.ts`.
* Uploads/downloads gardent comportement.
* Erreurs API typées.
* `npm run typecheck` et `npm test` passent.

---

# Phase 6 — Optimiser bundle, PDF et chunks lourds (VEN-357, Medium, 3pts)

## Baseline build

* `AccountingDashboard`: ~391.93 kB, gzip ~115.35 kB
* `jspdf.es.min`: ~389.75 kB, gzip ~128.36 kB
* `html2canvas.esm`: ~201.42 kB, gzip ~48.03 kB
* `vendor`: ~178.34 kB, gzip ~58.58 kB
* `index.es`: ~150.54 kB, gzip ~51.48 kB

## Fichiers

* `src/pages/admin/accounting/AccountingDashboard.tsx`
* Pages/services important `jspdf` ou `html2canvas`
* `vite.config.ts`
* `docs/optimisation/BUNDLE_AUDIT_2026-05-18.md`

## Travail

1. Document baseline bundle.
2. Lazy load:
```ts
const [{ default: jsPDF }, html2canvasModule] = await Promise.all([
  import('jspdf'),
  import('html2canvas'),
])
const html2canvas = html2canvasModule.default
```
3. `manualChunks`:
```ts
manualChunks(id) {
  if (id.includes('node_modules/react')) return 'vendor-react'
  if (id.includes('node_modules/recharts')) return 'vendor-charts'
  if (id.includes('node_modules/jspdf')) return 'vendor-pdf'
  if (id.includes('node_modules/html2canvas')) return 'vendor-canvas'
  if (id.includes('node_modules/socket.io-client')) return 'vendor-realtime'
}
```
4. Vérifier routes compta, dashboard, export PDF, export CSV.

## Critères d'acceptation

* Build OK.
* Exports PDF fonctionnent.
* PDF/canvas pas chargés avant usage.
* Rapport bundle avant/après.

---

# Phase 7 — Découper les gros écrans admin/compta (VEN-358, Medium, 8pts)

## Constat

* `src/pages/admin/accounting/ExternalSourceDetail.tsx`: 1868 lignes
* `src/pages/admin/InternalProjectList.tsx`: 1677 lignes
* `src/pages/admin/accounting/Settings.tsx`: 1617 lignes
* `src/pages/admin/intern-list/index.tsx`: 1292 lignes
* `src/pages/admin/InternalProjectDetail.tsx`: 930 lignes
* `src/pages/admin/project-detail/index.tsx`: 753 lignes
* `src/pages/admin/AgentTokensList.tsx`: 741 lignes

## Travail

1. Dossiers par écran (external-source-detail/, internal-project-list/, etc.).
2. Extraire hooks de données et composants de section.
3. `index.tsx` compatible avec imports existants.
4. Styles inline → CSS dédié.
5. Refactor par petits lots après stabilisation tests.

## Critères d'acceptation

* Aucun écran > 500-700 lignes.
* Responsabilités lisibles.
* Pas de changement fonctionnel.
* Tests/build passent.

---

# Phase 8 — Health page et centre d'activité (VEN-359, Low, 5pts)

## Fichiers

* `backend/src/routes/admin/health.ts`
* `backend/src/routes/admin/activityCenter.ts`
* `backend/src/index.ts`
* `src/pages/admin/SystemHealth.tsx`
* `src/pages/admin/ActivityCenter.tsx`
* `src/services/activityCenter.ts`
* `src/App.tsx`

## Health page

Mongo, email, push, automation engine, upload dirs, dernier check. Protection: `MANAGE_ADMINS`.

## Centre d'activité

Messages non lus, tâches en retard, relances CRM, factures critiques, risques projet, tickets ouverts. Protection permission-aware.

## Critères d'acceptation

* Admin voit état opérationnel sans logs.
* Requêtes paginées/bornées.
* Données filtrées selon permissions.

---

# Phase 9 — Documentation et runbook (VEN-360, Medium, 3pts)

## Fichiers

* `README_PROJET.md`
* `docs/README.md`
* `docs/architecture/API_CONTRACTS.md`
* `docs/operations/RUNBOOK.md`
* `docs/deploiement/GUIDE_CONFIGURATION.md`

## Travail

1. README avec architecture réelle.
2. Ports (Frontend 5501, Backend 3000, VITE_API_PROXY_TARGET).
3. Scripts frontend/backend/test/build.
4. Conventions API: auth, uploads, erreurs, downloads, idempotency agent.
5. Runbook: démarrage, health checks, backups, uploads, jobs, cleanup demo, incidents.

## Critères d'acceptation

* Nouveau contributeur peut démarrer sans contexte oral.
* Doc Linear et repo cohérentes.
* Opérations prod critiques documentées.

---

# Ordre d'exécution

1. Phase 1: rendre vérification fiable
2. Phase 2: supprimer risque data au boot
3. Phase 3: sécuriser permissions et routes
4. Phase 4: nettoyer warnings et contraintes
5. Phase 5: centraliser appels API
6. Phase 6: performance utilisateur
7. Phase 7: découper écrans lourds
8. Phase 8: exploitation et activité
9. Phase 9: documentation et runbooks

# Definition of Done globale

* `npm run typecheck` passe
* `npm test` passe et lance uniquement frontend
* `cd backend && npm run typecheck` passe
* `cd backend && npm test` passe sans exécuter `dist`
* `npm run build` passe
* `cd backend && npm run build` passe
* Plus de warnings Mongoose duplicate index
* Linear reflète l'architecture réelle
* Tickets de phase rattachés au projet Venio
