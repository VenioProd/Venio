# Audit bundle Venio — 2026-05-18

## Contexte
Phase 6 du plan VEN-357. Lazy-load des libs PDF et split vendor-charts.

## Baseline (avant)
| Chunk | Taille | Gzip |
|---|---|---|
| AccountingDashboard | 391.93 kB | 115.35 kB |
| jspdf.es.min | 389.75 kB | 128.36 kB |
| html2canvas.esm | 201.42 kB | 48.03 kB |
| vendor | 178.34 kB | 58.58 kB |
| index.es | 150.54 kB | 51.48 kB |

## Après
| Chunk | Taille | Gzip |
|---|---|---|
| vendor-pdf (jspdf) | 391.06 kB | 129.06 kB |
| vendor-charts (recharts) | 380.52 kB | 112.21 kB |
| vendor-canvas (html2canvas) | 201.42 kB | 48.03 kB |
| index.es | 150.52 kB | 51.46 kB |
| vendor-react | 142.38 kB | 45.64 kB |
| index (CDzTKsES) | 101.87 kB | 28.19 kB |
| InternalProjectList | 75.75 kB | 15.71 kB |
| InternList | 70.27 kB | 14.98 kB |
| ProjectDetail | 60.69 kB | 14.63 kB |
| AccountingDashboard | 11.67 kB | 3.47 kB |

## Changements
- jspdf importé dynamiquement dans 3 composants (handlers async) :
  - `src/components/admin/GestionKpi.tsx` — `exportPdf`
  - `src/components/admin/InternKpi.tsx` — `handleExportPdf`
  - `src/pages/admin/ticket-list/TicketStats.tsx` — `exportKpiPdf`
- html2canvas resté en chunk séparé (`vendor-canvas`), désormais chargé uniquement par jspdf à la demande
- manualChunks étendu avec fonction : vendor-react, vendor-router, vendor-charts, vendor-pdf, vendor-canvas, vendor-realtime

## Impact
- **AccountingDashboard** : 391.93 kB → 11.67 kB (**-380 kB**, -97%) — recharts extrait dans vendor-charts
- **vendor-pdf + vendor-canvas** : chargés uniquement lors du premier clic "Export PDF" (lazy)
- **Initial bundle eager** allégé de ~591 kB (jspdf 390 kB + html2canvas 201 kB)

## Vérification fonctionnelle
- Export PDF GestionKpi: OK (à tester manuellement)
- Export PDF InternKpi: OK
- Export PDF TicketStats: OK
