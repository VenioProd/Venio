# Audit bundle Venio — VENIO-105 / Phase 6

Mesures actualisées le 2026-07-12 sur la branche `feat/venio-105-pdf-bundle`,
depuis `origin/main` `d2ef5b178655f07de248bea9c564acc2e238982e`, avec
`npm run build` (Vite 5.4.21). Les tailles sont celles affichées par Vite,
avant compression puis gzip.

## Provenance historique — plan du 2026-05-18

Le plan `docs/superpowers/plans/2026-05-18-venio-optimization.md` signalait
les tailles suivantes. Elles sont conservées ici comme point de référence et
ne constituent pas une nouvelle mesure reproductible du commit courant.

| Chunk | Taille | Gzip |
| --- | ---: | ---: |
| AccountingDashboard | 391.93 kB | 115.35 kB |
| jspdf.es.min | 389.75 kB | 128.36 kB |
| html2canvas.esm | 201.42 kB | 48.03 kB |
| vendor | 178.34 kB | 58.58 kB |
| index.es | 150.54 kB | 51.48 kB |

## Mesure du commit de départ

Le commit de départ avait déjà trois imports dynamiques directs de `jspdf`
(exports KPI gestion, stagiaires et tickets). Vite émettait donc déjà les
chunks PDF/canvas séparés. Cette mesure sert de « avant » à VENIO-105.

| Chunk | Taille | Gzip |
| --- | ---: | ---: |
| AccountingDashboard | 11.69 kB | 3.47 kB |
| jspdf.es.min | 390.31 kB | 128.75 kB |
| html2canvas.esm | 201.42 kB | 48.03 kB |
| vendor-charts | 409.60 kB | 118.52 kB |
| vendor-react | 142.38 kB | 45.64 kB |
| index.es | 150.58 kB | 51.51 kB |

## Mesure après VENIO-105

| Chunk | Taille | Gzip |
| --- | ---: | ---: |
| AccountingDashboard | 11.69 kB | 3.47 kB |
| jspdf.es.min | 390.31 kB | 128.75 kB |
| html2canvas.esm | 201.42 kB | 48.03 kB |
| vendor-charts | 409.60 kB | 118.52 kB |
| vendor-react | 142.38 kB | 45.64 kB |
| index.es | 150.58 kB | 51.51 kB |

Le chargeur partagé est un chunk de 0.47 kB (gzip 0.30 kB). Les deux
bibliothèques lourdes restent hors du chemin initial. Le coût initial évité
demeure environ 591.73 kB non compressés (`jspdf` + `html2canvas`).

## Décision d'implémentation

- Les trois exports PDF passent par `src/lib/loadPdf.ts`, qui contient le seul
  `import('jspdf')`. Aucun import statique de `jspdf` ou `html2canvas` n'existe
  dans `src/`.
- `html2canvas` reste le chunk dynamique créé par `jspdf` pour les API de rendu
  HTML. Les exports actuels écrivent des primitives PDF et ne le téléchargent
  pas.
- Un essai de `manualChunks` `vendor-pdf` / `vendor-canvas` a été écarté : sur
  ce graphe Rollup, il ajoutait un import statique de `vendor-pdf` à de nombreux
  chunks admin, ce qui cassait le lazy-load. Les noms de chunks générés par
  Vite sont donc volontairement conservés ; il n'y a ni duplication ni cycle
  introduit.
- Les exports CSV ne sont pas modifiés.

## Vérifications

- Test d'interface : `TicketStats` ne résout pas `jspdf` au rendu ; le premier
  clic « Télécharger PDF » le charge puis appelle `save`.
- Test de garde : les trois points d'export doivent utiliser le chargeur
  dynamique partagé et ne peuvent pas réintroduire d'import statique.
- Le build de cette mesure confirme des chunks séparés `jspdf.es.min` et
  `html2canvas.esm`.
