# Documentation Venio

Index de la documentation. Pour le démarrage rapide, voir le [README racine](../README.md) ; pour l'architecture, les ports et les scripts, voir [README_PROJET.md](../README_PROJET.md).

## Index par dossier

| Dossier / Fichier | Contenu |
|---|---|
| [README_PROJET.md](../README_PROJET.md) | Point d'entrée technique : architecture Vite/Express/Mongo, ports, scripts et livraison |
| [accounting/](./accounting/) | API d'ingestion comptable (Arrow/HMAC), FEC, TVA, Factur-X |
| [admin/](./admin/) | Design et contenu de l'interface back-office |
| [api-agent.md](./api-agent.md) | API agent (Bearer + scopes + idempotency) |
| [architecture/API_CONTRACTS.md](./architecture/API_CONTRACTS.md) | Sessions, erreurs, uploads/downloads, API agent et limites applicatives |
| [CRM_AUTOMATISATIONS.md](./CRM_AUTOMATISATIONS.md) | Automatisations CRM |
| [deploiement/](./deploiement/) | Déploiement VPS, configuration et nettoyage démo |
| [design/](./design/) | Arrière-plans, gradients, évolutions visuelles |
| [operations/RUNBOOK.md](./operations/RUNBOOK.md) | Startup, health checks, backups, uploads, jobs, incidents et rollback |
| [operations/ADMIN_ROLE_RECIPE.md](./operations/ADMIN_ROLE_RECIPE.md) | Recette de release admin multi-rôles (VENIO-104) |
| [optimisation/](./optimisation/) | Performance GPU, SEO, bundles |
| [public/ANALYTICS_SEO_QUALITY.md](./public/ANALYTICS_SEO_QUALITY.md) | Mesure privacy-first, Search Console et recette publique |
| [security/DATA_GOVERNANCE.md](./security/DATA_GOVERNANCE.md) | Registre des données admin, rétention, exports, RGPD et réponse à incident |
| [PARALLAX.md](./PARALLAX.md) | Effet parallax |
| [projet/](./projet/) | Contenu projet, éditorial, tests |
| [roadmap/](./roadmap/) | Feuille de route produit |
| [superpowers/](./superpowers/) | Notes Claude / superpowers |

## Cible de déploiement

- [Carte de déploiement du cockpit dev](operations/DEV_DEPLOYMENT_CARD.md) — sources, états inconnus et limites

Le site est déployé sur **VPS Docker** via le workflow GitHub Actions [`.github/workflows/deploy-ionos.yml`](../.github/workflows/deploy-ionos.yml) (nom historique — la cible réelle est SSH + `docker compose -f docker-compose.prod.yml`). Le workflow suit une CI réussie sur `main` ou peut être lancé manuellement.

- Dockerfile : [`/Dockerfile`](../Dockerfile)
- Compose prod : [`/docker-compose.prod.yml`](../docker-compose.prod.yml)
- Reverse proxy nginx (référence prod, hors repo Docker) : [`operations/nginx-venio.paris.conf`](./operations/nginx-venio.paris.conf)

Pour la configuration, le debug, les backups et le rollback, voir [`deploiement/`](./deploiement/) et le [runbook](./operations/RUNBOOK.md).
