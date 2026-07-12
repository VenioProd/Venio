# Guide de configuration

## Nettoyage des données de démo

Le serveur ne supprime aucune donnée de démo à son démarrage. Le nettoyage est
une opération manuelle, disponible dans `backend/src/scripts/cleanupDemoData.ts`.

Le script cible uniquement les comptes, activités, leads et projets identifiés
comme données de démo. Il exige `MONGODB_URI` ainsi qu'une confirmation explicite
par `ALLOW_DEMO_CLEANUP=true`.

Depuis le dossier `backend`, commencez toujours par simuler l'opération :

```bash
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo:dry
```

Le mode `--dry-run` liste les données ciblées sans effectuer de suppression.
Après vérification de cette liste, lancez le nettoyage réel uniquement si cela
est intentionnel :

```bash
ALLOW_DEMO_CLEANUP=true npm run cleanup:demo
```

Sans `ALLOW_DEMO_CLEANUP=true`, le script s'arrête avant toute connexion ou
modification de la base. La suppression réelle est irréversible : effectuez un
backup MongoDB avant de l'exécuter en production.
