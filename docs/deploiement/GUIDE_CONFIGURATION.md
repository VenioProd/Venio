# Guide de configuration

Les fichiers d'exemple sont les références pour les noms de variables :
`.env.example` à la racine pour Vite et `backend/.env.example` pour Express.
Créer des fichiers `.env` locaux à partir de ces exemples, sans jamais les
committer ni publier leurs valeurs.

## Développement local

Le frontend Vite écoute sur le port 5501. Sa seule variable de connectivité
locale est :

| Variable | Rôle | Valeur par défaut |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | Cible du proxy Vite pour `/api` et `/socket.io` | `http://localhost:3000` |

Le backend Express écoute sur le port 3000 par défaut. `MONGODB_URI` est requis
au démarrage. `PORT` peut modifier le port d'écoute ; dans ce cas, adapter aussi
`VITE_API_PROXY_TARGET` si le frontend est lancé localement.

Les paramètres d'observabilité frontend (`VITE_SENTRY_DSN`, `VITE_SENTRY_ENV`,
`VITE_APP_VERSION`) sont optionnels. Le monitoring frontend reste désactivé si
son DSN est vide.

## Backend

La configuration backend est chargée depuis `backend/.env` en local. Regrouper
les variables suivant leur fonction et ne renseigner que les intégrations
utilisées :

| Groupe | Variables concernées |
| --- | --- |
| Runtime | `PORT`, `MONGODB_URI`, `CORS_ORIGIN` |
| Bootstrap administrateur | `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Observabilité | `SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_RELEASE`, `LOG_LEVEL` |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Stockage distant optionnel | `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_APP_PASSWORD`, `NEXTCLOUD_BASE_PATH` |
| Comptabilité | `ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS`, `FACTUR_X_ENABLED` |

Les valeurs de bootstrap, SMTP, push, stockage distant et DSN sont sensibles.
Ne pas les afficher dans les logs, issues, captures ou documentation.

`ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS` est lu par le scheduler : 0 désactive le
verrouillage automatique des écritures validées ; sans surcharge, la valeur
interne est 30 jours.

## Production Docker

`docker-compose.prod.yml` charge un `.env` à la racine du checkout VPS pour le
conteneur `venio`. Le workflow de déploiement sauvegarde ce fichier avant son
`git reset --hard` puis le restaure. Vérifier ses permissions sur le VPS et
conserver une copie chiffrée hors du dépôt.

Le compose utilise le réseau hôte et le backend écoute par défaut sur 3000. Les
fichiers applicatifs sont montés dans le volume Docker `venio-uploads` vers
`/app/uploads`. La base MongoDB et le reverse proxy ne sont pas provisionnés
par ce compose : leur configuration relève de l'environnement VPS.

Après tout changement de configuration, reconstruire/recréer le service puis
vérifier le healthcheck :

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl -fsS http://localhost:3000/api/health
```

## Nettoyage des données de démo

Le serveur ne supprime aucune donnée de démo à son démarrage. Le nettoyage est
une opération manuelle, disponible dans `backend/src/scripts/cleanupDemoData.ts`.

Le script cible uniquement les comptes, activités, leads et projets identifiés
comme données de démo. Il exige `MONGODB_URI` ainsi qu'une confirmation explicite
par `ALLOW_DEMO_CLEANUP=true`.

Depuis le dossier `backend`, commencer systématiquement par simuler l'opération :

```bash
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry
```

Le mode `--dry-run` liste les données ciblées sans effectuer de suppression.
Après vérification de cette liste et d'un backup MongoDB utilisable, lancer le
nettoyage réel uniquement si cela est intentionnel :

```bash
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo
```

Sans `ALLOW_DEMO_CLEANUP=true`, le script s'arrête avant toute connexion ou
modification de la base. La suppression réelle est irréversible.
