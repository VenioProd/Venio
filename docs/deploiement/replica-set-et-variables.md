# Replica set MongoDB et variables d'env (PR #293)

À faire sur le VPS **avant** de merger la PR des apps natives et de la compta par projet. Merger déclenche le déploiement automatique. Sans replica set, toute écriture comptable répond 503.

Durée : environ 30 minutes, dont une coupure de la base d'une ou deux minutes. À faire à une heure creuse.

## 0. Se connecter et faire l'inventaire

```bash
ssh <utilisateur>@<vps>
cat /opt/docker/venio-shared/.env | grep -E '^MONGODB_URI=' | sed 's#//[^@]*@#//***@#'
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i mongo
systemctl status mongod --no-pager 2>/dev/null | head -3
```

- **`docker ps` affiche un conteneur `mongo`** : suis le cas A.
- **`systemctl` affiche `mongod` actif** : suis le cas B.
- **L'URI pointe vers `mongodb+srv://…mongodb.net`**, c'est-à-dire MongoDB Atlas : c'est déjà un replica set. Passe directement à l'étape 4.

Vérifie aussi si l'authentification est active. Si l'URI contient `utilisateur:motdepasse@`, elle l'est, et il faudra un fichier de clé, décrit à l'étape 2.

## 1. Sauvegarder

```bash
mkdir -p /opt/backups && cd /opt/backups
mongodump --uri "<MONGODB_URI actuelle>" --archive=venio-avant-replicaset-$(date +%F).gz --gzip
ls -lh venio-avant-replicaset-*.gz
```

Si `mongodump` n'est pas installé sur l'hôte, lance-le dans le conteneur : `docker exec <conteneur-mongo> mongodump --archive --gzip > venio-avant-replicaset-$(date +%F).gz`. Ne continue pas sans une archive de taille cohérente.

## 2. Activer le replica set

### Avec authentification uniquement : le fichier de clé

```bash
openssl rand -base64 756 > /opt/docker/mongo-keyfile
chmod 400 /opt/docker/mongo-keyfile
# Cas A (Docker) : chown 999:999 /opt/docker/mongo-keyfile
# Cas B (système) : chown mongodb:mongodb /opt/docker/mongo-keyfile
```

### Cas A : MongoDB en conteneur Docker

Dans le compose ou la commande qui lance le conteneur Mongo, ajoute :

```yaml
    command: ["mongod", "--replSet", "rs0", "--bind_ip_all"]
    # avec authentification, ajouter : "--keyFile", "/etc/mongo-keyfile"
    # et le volume : - /opt/docker/mongo-keyfile:/etc/mongo-keyfile:ro
```

Recrée ensuite le conteneur, avec `docker compose up -d <service-mongo>` dans le dossier de son compose. Garde le **même volume de données** : ne fais pas de `down -v`.

### Cas B : `mongod` installé sur le système

Dans `/etc/mongod.conf` :

```yaml
replication:
  replSetName: rs0
# avec authentification, ajouter :
security:
  authorization: enabled
  keyFile: /opt/docker/mongo-keyfile
```

Puis :

```bash
sudo systemctl restart mongod
```

## 3. Initialiser le replica set (une seule fois)

```bash
mongosh "<MONGODB_URI actuelle>" --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "127.0.0.1:27017"}]})'
sleep 5
mongosh "<MONGODB_URI actuelle>" --eval 'db.adminCommand({hello: 1}).setName + " / primaire: " + db.adminCommand({hello: 1}).isWritablePrimary'
```

Attendu : `rs0 / primaire: true`. En cas de conteneur, préfixe ces commandes par `docker exec -it <conteneur-mongo>`.

Le site reste en ligne, puisque l'URI actuelle continue de fonctionner. Vérifie quand même `https://venio.paris/api/health`.

## 4. Poser les variables d'env

Le fichier est `/opt/docker/venio-shared/.env`, en `chmod 600`. Le déploiement le relie au conteneur. Garde une copie avant de l'éditer :

```bash
cp /opt/docker/venio-shared/.env /opt/docker/venio-shared/.env.avant-pr293
nano /opt/docker/venio-shared/.env
```

### MongoDB

Ajoute `replicaSet=rs0` à l'URI. Ne fais pas ce changement sur Atlas.

```
MONGODB_URI=mongodb://<…>@127.0.0.1:27017/venio?authSource=admin&replicaSet=rs0
```

### Clé de chiffrement : attention

`CREDENTIALS_KEY` chiffre les secrets stockés en base : liens de paiement Stripe, secrets de webhooks, identifiants des filiales. **Tant que cette variable est absente, ces secrets sont chiffrés avec `JWT_SECRET`.** En poser une nouvelle valeur rendrait les secrets existants illisibles.

```bash
grep -c '^CREDENTIALS_KEY=' /opt/docker/venio-shared/.env
```

- **Résultat `1`** : la variable existe, n'y touche pas.
- **Résultat `0`** : ajoute `CREDENTIALS_KEY=` avec **exactement la même valeur que `JWT_SECRET`**. Les secrets existants restent lisibles, et la création des liens de paiement est débloquée.

### Stripe

Commence en **mode test** : clés `sk_test_…`, bascule « Test » dans le tableau de bord.

1. Récupère la clé secrète dans Stripe, rubrique Développeurs › Clés API.
2. Crée le webhook dans Stripe, rubrique Développeurs › Webhooks › Ajouter un endpoint :
   - URL : `https://venio.paris/api/stripe/webhook` ;
   - événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.refund.updated`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `payout.paid`, `payout.failed` ;
   - récupère le secret de signature `whsec_…`.

```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
PUBLIC_APP_URL=https://venio.paris
```

### APNs (notifications de l'app)

À poser une fois le compte Apple Developer créé, rubrique Certificates, IDs & Profiles › Keys › nouvelle clé avec « Apple Push Notifications service ». Le fichier `.p8` ne se télécharge qu'une seule fois.

```bash
awk 'NF {printf "%s\\n", $0}' AuthKey_XXXXXXXXXX.p8   # met la clé sur une seule ligne
```

```
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=<Team ID Apple>
APNS_BUNDLE_ID=paris.venio.app
APNS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGT…\n-----END PRIVATE KEY-----\n
```

Sans ces quatre variables, les notifications de l'app sont simplement désactivées. Le reste fonctionne.

### Appliquer

```bash
cd /opt/docker/openclaw/config/workspace/projects/venio
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate venio
docker logs --tail 50 venio-app
curl -fsS https://venio.paris/api/health
```

Le code actuel de la prod ignore ces nouvelles variables. Seule `MONGODB_URI` change réellement quelque chose, et le site doit rester sain.

## 5. Merger la PR

Passer la PR #293 en « prête », puis la merger. La CI puis le déploiement partent tout seuls.

## 6. Après le déploiement

Le conteneur ne contient que le code compilé (`dist/`), sans `tsx`. On lance donc les scripts compilés :

```bash
docker exec venio-app node dist/scripts/backfillProjectUpdateTimestamps.js --dry-run
docker exec venio-app node dist/scripts/backfillProjectUpdateTimestamps.js
docker exec venio-app node dist/scripts/backfillQuoteReferences.js --dry-run
docker exec venio-app node dist/scripts/backfillQuoteReferences.js
```

Lis la sortie du `--dry-run` avant de lancer la vraie reprise. Ensuite :

- **Écriture comptable de test** dans l'espace compta par projet : elle ne doit pas répondre 503.
- **Paiement Stripe en mode test**, avec la carte `4242 4242 4242 4242` sur une facture de test : il doit apparaître encaissé.
- **Comptes commerciaux** : cocher « Associé » sur ceux qui doivent lire tous les projets.

## Retour arrière

- **Base** : retirer `replicaSet=rs0` de l'URI suffit pour que l'ancien code retrouve son comportement. Le replica set lui-même ne gêne pas l'ancien code.
- **Variables d'env** : restaurer `/opt/docker/venio-shared/.env.avant-pr293`.
- **Données** : restaurer l'archive de l'étape 1 avec `mongorestore --uri "<URI>" --archive=<fichier>.gz --gzip --drop`, uniquement en dernier recours.
