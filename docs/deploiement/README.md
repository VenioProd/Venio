# Déploiement Venio

La cible est un VPS Docker. Le workflow conserve le chemin historique
`deploy-ionos.yml`, mais déploie par SSH avec
`docker compose -f docker-compose.prod.yml`.

## Chaîne de livraison

1. La CI s'exécute sur les pull requests vers `main`, les pushes sur `main` et
   sur déclenchement manuel.
2. Après une CI réussie sur `main`, ou lors d'un dispatch manuel,
   `deploy-ionos.yml` se connecte au VPS.
3. Le workflow préserve le `.env` local, récupère `origin/main`, construit une
   nouvelle image sans cache puis recrée le conteneur.
4. Après 20 secondes, il vérifie que `https://venio.paris` répond HTTP 200.

Le remplacement du conteneur entraîne une brève interruption. Le workflow ne
fait pas de rollback automatique après le swap.

## Composition de l'image

Le [Dockerfile](../../Dockerfile) est multi-stage : build du frontend Vite,
compilation TypeScript du backend, puis image Node de production qui sert les
assets Vite avec Express. Le service Compose utilise le réseau hôte et le port
3000 par défaut. Le healthcheck Docker appelle `/api/health`.

| Fichier | Rôle |
| --- | --- |
| [Dockerfile](../../Dockerfile) | Build frontend/backend et image d'exécution |
| [docker-compose.prod.yml](../../docker-compose.prod.yml) | Service `venio`, environnement et volume uploads |
| [deploy-ionos.yml](../../.github/workflows/deploy-ionos.yml) | Déploiement SSH après CI ou manuel |
| [GUIDE_CONFIGURATION.md](./GUIDE_CONFIGURATION.md) | Variables, volumes et cleanup démo |
| [RUNBOOK.md](../operations/RUNBOOK.md) | Health checks, sauvegardes, incidents et rollback |

## Secrets GitHub Actions

Le workflow nécessite uniquement les secrets de connexion SSH configurés dans
GitHub : `SSH_PRIVATE_KEY`, `SSH_HOST` et `SSH_USER`. Ne pas copier leurs
valeurs dans le dépôt ou dans une documentation.

## Opérations manuelles

Exécuter les diagnostics, le déploiement manuel et le rollback depuis le
checkout VPS indiqué dans le [runbook](../operations/RUNBOOK.md). Avant toute
opération destructive, sauvegarder MongoDB et le volume `venio-uploads`.
