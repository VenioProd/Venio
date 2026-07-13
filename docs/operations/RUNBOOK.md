# Runbook Venio

Ce runbook décrit les opérations du déploiement actuel. Il ne remplace pas une
stratégie de sauvegarde vérifiée ni la gestion sécurisée des accès VPS.

## Démarrage local

Prérequis : Node.js 22 et MongoDB accessible. Créer les environnements depuis
les exemples, renseigner `MONGODB_URI` dans `backend/.env`, puis lancer :

```bash
# Terminal 1 : backend Express, port 3000 par défaut
npm --prefix backend run dev

# Terminal 2 : frontend Vite, port 5501
npm run dev
```

En développement, Vite envoie `/api` et `/socket.io` vers
`VITE_API_PROXY_TARGET`, qui vaut `http://localhost:3000` sans surcharge. Une
valeur différente se configure dans le `.env` racine. Ne pas déposer de valeur
secrète dans les fichiers suivis par Git.

## Démarrage et déploiement VPS

La production utilise un seul service Compose, `venio`, avec `network_mode:
host`. L'image Docker compile le frontend Vite, compile le backend TypeScript,
puis Express sert les assets générés et l'API sur le port 3000. Le reverse proxy
VPS est la couche d'accès public.

Le workflow [deploy-ionos.yml](../../.github/workflows/deploy-ionos.yml) se
déclenche après une CI réussie sur `main` ou manuellement. Il :

1. se connecte au VPS en SSH ;
2. sauvegarde le `.env` présent, récupère `origin/main` puis le restaure ;
3. construit `docker-compose.prod.yml` sans cache alors que l'ancien
   conteneur reste en ligne ;
4. arrête puis recrée le conteneur ;
5. attend 20 secondes côté GitHub Actions et vérifie `https://venio.paris`.

Le remplacement implique une courte interruption. Le workflow ne restaure pas
automatiquement un commit précédent en cas d'échec après le swap.

Commandes de diagnostic sur le VPS :

```bash
cd /opt/docker/openclaw/config/workspace/projects/venio
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f venio
curl -fsS http://localhost:3000/api/health
```

## Health checks

### Endpoint public

`GET /api/health` est sans authentification. Il répond `200` avec
`status: "ok"` lorsque MongoDB est connecté et que son ping réussit ; sinon il
répond `503` avec `status: "degraded"`. La réponse contient la version,
l'uptime, l'état MongoDB, la latence de ping et la date de contrôle.

```bash
curl -fsS http://localhost:3000/api/health
```

Le Dockerfile et le compose interrogent cet endpoint toutes les 30 secondes
(délai 5 s, trois essais, période de démarrage 20 s).

### Endpoint admin

`GET /api/admin/health` exige une session et la permission de gestion des
administrateurs. Il donne un état sans secrets de MongoDB, email, push,
automatisations, uploads et erreurs récentes. Ne pas l'exposer comme un
healthcheck public.

## Sauvegardes et restauration

Sauvegarder séparément MongoDB et les fichiers uploadés avant une migration,
un cleanup démo ou un rollback risqué.

- MongoDB : exécuter `mongodump` depuis un environnement où l'outil est
  installé et où `MONGODB_URI` est disponible ; stocker le résultat hors du
  conteneur et tester périodiquement un `mongorestore` dans un environnement
  isolé.
- Uploads : sauvegarder le volume Docker `venio-uploads` monté sur
  `/app/uploads`. Il contient les fichiers locaux applicatifs.
- L'endpoint admin de sauvegarde appelle aussi `mongodump`, conserve au plus 7
  sauvegardes par défaut et dépend d'un binaire disponible dans son processus.
  Le compose ne monte pas de volume `backups` : ne pas le considérer comme une
  politique de rétention durable sans configuration complémentaire.

Avant une restauration, arrêter les écritures, conserver l'état à remplacer,
restaurer MongoDB et les uploads cohérents, puis relancer et contrôler
`/api/health` ainsi que les parcours concernés.

## Uploads et espace disque

Les fichiers sont relatifs au répertoire `uploads/` du backend. En production,
le volume nommé `venio-uploads` évite leur perte lors d'une recréation ordinaire
du conteneur ; il n'est pas une sauvegarde.

En cas d'échec d'upload : vérifier l'état de santé admin, l'espace disque, les
droits d'écriture du volume et les logs. Les clients frontend envoient du
multipart via `apiUpload` sans définir le `Content-Type`. Les documents agent
emploient du JSON base64 et sont limités à 5 MiB décodés, dans une requête
agent limitée à 8 MiB.

## Jobs et automatisations

Après la connexion MongoDB et l'écoute HTTP, le backend démarre :

- le planificateur CRM ;
- le moteur d'automatisation ;
- le verrouillage automatique d'écritures comptables validées.

Les deux premiers planificateurs vérifient leurs tâches chaque minute. Le
verrouillage comptable s'exécute au démarrage puis toutes les six heures ; son
seuil dépend de `ACCOUNTING_LOCK_VALIDATED_AFTER_DAYS` (0 le désactive).

Contrôler l'endpoint admin de santé et les logs après un redémarrage. Une
automatisation en erreur ou un scheduler non démarré demande une investigation
avant de déclencher manuellement des opérations métier.

## Nettoyage explicite des données de démo

Le cleanup ne s'exécute jamais au boot. Il cible uniquement les identifiants de
démo définis par son script et exige `MONGODB_URI` ainsi que
`ALLOW_DEMO_CLEANUP=true`.

```bash
cd backend

# Toujours vérifier la sélection d'abord
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry

# Seulement après backup et validation du dry-run
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo
```

Sans cette variable, le script s'arrête avant toute connexion MongoDB. La
suppression réelle est irréversible ; en production, effectuer et vérifier une
sauvegarde MongoDB avant l'opération.

## Incidents usuels

| Symptôme | Première action |
| --- | --- |
| `503` sur `/api/health` | Vérifier la disponibilité/URI MongoDB et les logs du conteneur. |
| Conteneur unhealthy | Consulter `docker compose ... logs venio`, puis l'état MongoDB ; le healthcheck dépend de `/api/health`. |
| 401 utilisateur | Reconnecter l'utilisateur ; la session serveur peut être expirée, révoquée ou invalide. |
| 401/403 agent | Vérifier l'URL `/api/v1/agent`, `Authorization: Bearer …` et les scopes du token. |
| 429 agent | Respecter `Retry-After` et réduire le débit ; le quota est par token et par processus. |
| Upload échoué | Vérifier disque, volume `venio-uploads`, permissions, taille et format attendus par la route. |
| Automatisations absentes | Contrôler `/api/admin/health`, les logs de démarrage et la configuration métier concernée. |

## Rollback applicatif

Le rollback replace le code et le conteneur ; il ne restaure ni MongoDB ni les
uploads. Avant de l'effectuer, noter le SHA actif et confirmer la compatibilité
de schéma avec les données actuelles.

```bash
cd /opt/docker/openclaw/config/workspace/projects/venio
git fetch origin
git reset --hard <sha-déjà-validé>
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --force-recreate
curl -fsS http://localhost:3000/api/health
```

Si le problème vient d'une donnée ou d'une migration, restaurer la sauvegarde
testée plutôt que compter sur un rollback de code seul.

## Vérifications avant livraison

```bash
npm run typecheck:all
npm run test:all
npm run format:check
git diff --check
```

La CI exécute les typechecks, le lint, les tests frontend/backend et la recette
du site public selon le workflow [ci.yml](../../.github/workflows/ci.yml).
