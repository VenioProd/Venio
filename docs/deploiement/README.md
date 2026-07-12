# Déploiement Venio

Cible unique : **VPS Docker** sur `/opt/docker/openclaw/config/workspace/projects/venio`. Le déclenchement est automatique sur push `main` via GitHub Actions.

## Workflow

[`.github/workflows/deploy-ionos.yml`](../../.github/workflows/deploy-ionos.yml) (nom historique — lit en réalité `docker-compose.prod.yml`).

Étapes :
1. SSH vers le VPS avec `SSH_PRIVATE_KEY` / `SSH_HOST` / `SSH_USER`
2. `git fetch origin main && git reset --hard origin/main` (le `.env` est préservé)
3. `docker compose -f docker-compose.prod.yml build --no-cache`
4. Swap : `down` + `up -d` (≈ quelques secondes de coupure)
5. Healthcheck `curl https://venio.paris`

## Fichiers de référence

| Fichier | Rôle |
|---|---|
| [`/Dockerfile`](../../Dockerfile) | Build multi-stage (frontend Vite + backend tsc) servi par Express |
| [`/docker-compose.prod.yml`](../../docker-compose.prod.yml) | Container unique `venio-app`, `network_mode: host` |
| [`/.github/workflows/deploy-ionos.yml`](../../.github/workflows/deploy-ionos.yml) | Pipeline SSH + docker compose |
| [`GUIDE_CONFIGURATION.md`](./GUIDE_CONFIGURATION.md) | Configuration et nettoyage manuel des données de démo |
| [`operations/nginx-venio.paris.conf`](../operations/nginx-venio.paris.conf) | Reverse proxy nginx (hors repo Docker, sur le VPS) |

## Secrets GitHub Actions requis

- `SSH_PRIVATE_KEY` — clé privée SSH ed25519 sans passphrase
- `SSH_HOST` — IP ou DNS du VPS
- `SSH_USER` — utilisateur déploiement

## Déploiement manuel (si besoin)

```bash
ssh user@vps
cd /opt/docker/openclaw/config/workspace/projects/venio
git pull
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

## Rollback

```bash
git reset --hard <sha-précédent>
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --force-recreate
```
