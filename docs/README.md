# Documentation Venio

Index de la documentation. Pour le démarrage rapide (install, scripts, stack), voir le [README racine](../README.md).

## Index par dossier

| Dossier / Fichier | Contenu |
|---|---|
| [accounting/](./accounting/) | API d'ingestion comptable (Arrow/HMAC), FEC, TVA, Factur-X |
| [admin/](./admin/) | Design et contenu de l'interface back-office |
| [api-agent.md](./api-agent.md) | API agent (Bearer + scopes + idempotency) |
| [architecture/](./architecture/) | Conventions d'API, contrats frontend/backend |
| [CRM_AUTOMATISATIONS.md](./CRM_AUTOMATISATIONS.md) | Automatisations CRM |
| [deploiement/](./deploiement/) | Déploiement VPS (Docker + GitHub Actions), debug, secrets |
| [design/](./design/) | Arrière-plans, gradients, évolutions visuelles |
| [operations/](./operations/) | Runbook exploitation, incidents, cleanup, conf nginx |
| [operations/ADMIN_ROLE_RECIPE.md](./operations/ADMIN_ROLE_RECIPE.md) | Recette de release admin multi-rôles (VENIO-104) |
| [optimisation/](./optimisation/) | Performance GPU, SEO, bundles |
| [public/ANALYTICS_SEO_QUALITY.md](./public/ANALYTICS_SEO_QUALITY.md) | Mesure privacy-first, Search Console et recette publique |
| [security/DATA_GOVERNANCE.md](./security/DATA_GOVERNANCE.md) | Registre des données admin, rétention, exports, RGPD et réponse à incident |
| [PARALLAX.md](./PARALLAX.md) | Effet parallax |
| [projet/](./projet/) | Contenu projet, éditorial, tests |
| [roadmap/](./roadmap/) | Feuille de route produit |
| [superpowers/](./superpowers/) | Notes Claude / superpowers |

## Cible de déploiement

Le site est déployé sur **VPS Docker** via le workflow GitHub Actions [`.github/workflows/deploy-ionos.yml`](../.github/workflows/deploy-ionos.yml) (nom historique — la cible réelle est SSH + `docker compose -f docker-compose.prod.yml`).

- Dockerfile : [`/Dockerfile`](../Dockerfile)
- Compose prod : [`/docker-compose.prod.yml`](../docker-compose.prod.yml)
- Reverse proxy nginx (référence prod, hors repo Docker) : [`operations/nginx-venio.paris.conf`](./operations/nginx-venio.paris.conf)

Pour la configuration des secrets GitHub Actions et le debug, voir [`deploiement/`](./deploiement/).
