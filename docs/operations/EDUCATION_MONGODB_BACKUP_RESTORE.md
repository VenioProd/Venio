# Sauvegarde et restauration du workspace pédagogique MongoDB

Ce runbook couvre les données du workspace pédagogique. Il impose une restauration vérifiée sur un environnement isolé. **Ne jamais exécuter `mongorestore` contre la production.** Une restauration de production relève d'une procédure d'incident distincte et approuvée.

## Périmètre et prérequis

Collections MongoDB :

- `educationclasses`, `educationstudents`, `educationsessions` ;
- `educationassignments`, `educationsubmissions` ;
- `educationnotes`, `educationdocuments`, `educationtemplates` ;
- `educationactivitylogs`, `educationaigenerations`.

`educationdocuments` contient les métadonnées seulement. Pour rendre les documents restaurés lisibles, sauvegarder aussi `uploads/education` (en production, il appartient au volume persistant `venio-uploads`). Ces fichiers peuvent contenir des données personnelles et doivent être chiffrés et protégés comme la base.

Exécuter depuis un hôte d'administration de confiance avec MongoDB Database Tools (`mongodump`, `mongorestore`), `mongosh`, `sha256sum`, `tar`, `jq` et `age`. Le compte de dump est lecture seule sur la base ; celui de restauration n'a des droits d'écriture que sur le cluster isolé. Ne jamais activer `set -x`, ne pas inscrire l'URI dans un script, ni la copier dans les logs ou un historique partagé.

## Revue index/performance (VENIO-26 lot 2)

La revue des routes classes, étudiants, séances, devoirs, notes et documents a conservé les index existants et ajoute uniquement :

| Collection | Index | Pattern existant | Impact opérationnel |
| --- | --- | --- | --- |
| `educationsessions` | `{ owner: 1, deletedAt: 1, date: 1 }` | cockpit/calendrier, plage de dates toutes classes | évite scan et tri inter-classes ; index à maintenir à chaque écriture |
| `educationsessions` | `{ owner: 1, "attendance.studentId": 1, deletedAt: 1 }` | recalcul des compteurs après une présence | évite de relire toutes les séances du propriétaire ; index multiclés proportionnel aux présences |
| `educationassignments` | `{ owner: 1, deletedAt: 1, status: 1, deadline: 1 }` | devoirs ouverts du cockpit, toutes classes, triés par échéance | réduit la lecture du tableau de bord ; index à maintenir à chaque écriture |
| `educationsubmissions` | `{ owner: 1, studentId: 1, deletedAt: 1 }` | moyenne et suivi d'un étudiant sur tous ses devoirs | évite un scan des soumissions du propriétaire ; index à maintenir à chaque écriture |

Les listes par classe, recherches `$text`, liens notes/documents et contraintes d'unicité sont déjà couverts. Aucun index n'est supprimé et aucune migration de données n'est nécessaire. Après déploiement, vérifier la création non destructive avec `db.educationsessions.getIndexes()` et surveiller taille des index et latence d'écriture avant toute autre modification.

## Sauvegarde cohérente

1. Prévoir une courte fenêtre sans import ni modification pédagogique, ou placer l'application en maintenance, afin que MongoDB et les uploads soient capturés au même instant logique.
2. Préparer les variables. `MONGODB_URI` et la clé publique `age` viennent du gestionnaire de secrets et ne sont pas imprimés par ces commandes.

```bash
set -euo pipefail
umask 077
export MONGODB_DB='venio'
export BACKUP_ROOT='/var/backups/venio/education'
export BACKUP_LABEL="$(date -u +%Y%m%dT%H%M%SZ)"
export EDUCATION_UPLOADS_DIR='/chemin/vers/uploads/education'
export MONGODB_URI       # injecté par le gestionnaire de secrets
export AGE_RECIPIENT     # clé publique age d'exploitation

: "${MONGODB_URI:?MONGODB_URI doit être injecté}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT requis}"
backup_dir="$BACKUP_ROOT/$BACKUP_LABEL"
mkdir -p "$backup_dir/mongo"
collections=(
  educationclasses educationstudents educationsessions
  educationassignments educationsubmissions educationnotes educationdocuments
  educationtemplates educationactivitylogs educationaigenerations
)
```

3. Capturer les métadonnées : versions, date UTC, base et décompte par collection. Elles forment le contrat de contrôle post-restauration.

```bash
mongodump --version >"$backup_dir/mongodump-version.txt"
mongosh "$MONGODB_URI/$MONGODB_DB" --quiet --eval '
  const names = ["educationclasses", "educationstudents", "educationsessions", "educationassignments", "educationsubmissions", "educationnotes", "educationdocuments", "educationtemplates", "educationactivitylogs", "educationaigenerations"];
  print(JSON.stringify({ capturedAt: new Date().toISOString(), serverVersion: db.version(), collections: Object.fromEntries(names.map((name) => [name, db.getCollection(name).countDocuments({})])) }, null, 2));
' >"$backup_dir/mongo-inventory.json"
```

4. Dumper explicitement le périmètre, archiver les uploads et générer les empreintes. Une erreur interrompt la procédure : ne pas publier une sauvegarde partielle.

```bash
for collection in "${collections[@]}"; do
  mongodump --uri="$MONGODB_URI" --db="$MONGODB_DB" --collection="$collection" \
    --archive="$backup_dir/mongo/$collection.archive.gz" --gzip
done

test -d "$EDUCATION_UPLOADS_DIR"
tar -C "$EDUCATION_UPLOADS_DIR" -czf "$backup_dir/education-uploads.tgz" .
(
  cd "$backup_dir"
  sha256sum mongo/*.archive.gz education-uploads.tgz mongo-inventory.json mongodump-version.txt > SHA256SUMS
)
```

5. Produire un manifeste versionné, chiffrer l'ensemble, puis l'envoyer vers un stockage hors hôte avec rétention documentée et accès minimal. La clé privée `age` n'est jamais sur l'hôte de production ni dans le dépôt.

```bash
jq -n \
  --arg schema 'venio.education.mongo-backup' \
  --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg database "$MONGODB_DB" \
  --arg label "$BACKUP_LABEL" \
  --argjson collections "$(printf '%s\n' "${collections[@]}" | jq -R . | jq -s .)" \
  '{schema: $schema, schemaVersion: 1, createdAt: $createdAt, database: $database, label: $label, collections: $collections, uploadsArchive: "education-uploads.tgz", checksums: "SHA256SUMS"}' \
  >"$backup_dir/manifest.json"
(
  cd "$backup_dir"
  sha256sum manifest.json >> SHA256SUMS
)
(
  cd "$BACKUP_ROOT"
  tar -czf - "$BACKUP_LABEL" | age --recipient "$AGE_RECIPIENT" --output "$BACKUP_LABEL.tar.gz.age"
  sha256sum "$BACKUP_LABEL.tar.gz.age" >"$BACKUP_LABEL.tar.gz.age.sha256"
)
```

Ne supprimer la copie locale qu'après réception et test de lecture de la copie chiffrée distante. Conserver le manifeste, les checksums et le résultat de la dernière restauration testée, sans URI ni secret.

## Vérification et restauration isolée

Répéter cet exercice après un changement de schéma notable et à la cadence RPO de l'équipe.

1. Télécharger l'objet chiffré vers une machine d'administration isolée, déchiffrer avec une identité `age` protégée, puis vérifier les empreintes avant toute restauration.

```bash
age --decrypt --identity "$AGE_IDENTITY_FILE" --output restored.tar.gz "$BACKUP_LABEL.tar.gz.age"
mkdir -p "$BACKUP_ROOT/restore-$BACKUP_LABEL"
tar -C "$BACKUP_ROOT/restore-$BACKUP_LABEL" -xzf restored.tar.gz
restore_dir="$BACKUP_ROOT/restore-$BACKUP_LABEL/$BACKUP_LABEL"
(
  cd "$restore_dir"
  sha256sum --check SHA256SUMS
)
jq . "$restore_dir/manifest.json"
```

2. La cible doit être une instance MongoDB dédiée, vide et isolée du réseau, DNS, comptes et volumes de production, avec la même base que le dump. La garde suivante exige une confirmation explicite, mais ne remplace jamais cette isolation technique.

```bash
export RESTORE_ISOLATED='YES'
export MONGODB_RESTORE_URI  # injecté par le gestionnaire de secrets

test "$RESTORE_ISOLATED" = 'YES'
: "${MONGODB_RESTORE_URI:?URI isolée requise}"
```

3. Restaurer seulement dans cette cible jetable. `--drop` est permis parce que la base cible est isolée ; il est interdit en production.

```bash
for collection in "${collections[@]}"; do
  mongorestore --uri="$MONGODB_RESTORE_URI" --drop \
    --archive="$restore_dir/mongo/$collection.archive.gz" --gzip
done

mkdir -p "$EDUCATION_UPLOADS_DIR"
tar -C "$EDUCATION_UPLOADS_DIR" -xzf "$restore_dir/education-uploads.tgz"
```

4. Comparer les décomptes et index aux métadonnées, démarrer l'application isolée, contrôler `/api/health`, puis ouvrir une classe, ses étudiants, séances, devoirs, une note et un document sauvegardé. Désactiver les envois d'e-mail, webhooks et intégrations externes sur cet environnement.

```bash
mongosh "$MONGODB_RESTORE_URI" --quiet --eval '
  const names = ["educationclasses", "educationstudents", "educationsessions", "educationassignments", "educationsubmissions", "educationnotes", "educationdocuments", "educationtemplates", "educationactivitylogs", "educationaigenerations"];
  print(JSON.stringify(Object.fromEntries(names.map((name) => [name, db.getCollection(name).countDocuments({})])), null, 2));
  printjson(db.educationsessions.getIndexes());
'
jq . "$restore_dir/mongo-inventory.json"
```

Archiver le résultat de l'exercice (date, manifeste, contrôles réussis, durée, opérateur) sans donnée d'accès.

## Échec et rollback

En cas d'échec de dump, checksum, déchiffrement, restauration ou contrôle, arrêter et conserver les artefacts et logs non sensibles pour investigation. Ne pas remplacer la production. Une restauration isolée se rollbacke en supprimant la base et les uploads de cette cible jetable, puis en la recréant.

Pour tout incident qui pourrait exiger une restauration de production : geler les écritures, préserver un nouvel instantané de l'état courant et obtenir une autorisation explicite. Ce runbook ne fournit volontairement aucune commande de restauration de production.
