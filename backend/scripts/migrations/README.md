# Migrations manuelles

Le point d’entrée est compilé avec le backend et présent dans l’image de production.
Aucune migration n’est exécutée au déploiement ou au démarrage du serveur.
La variable `MONGODB_URI` doit être fournie par l’environnement du conteneur ; aucun fichier `.env` n’est chargé par cet exécutable.

Depuis le conteneur (répertoire `/app`) :

```sh
node dist/scripts/migrate.js --list
node dist/scripts/migrate.js --dry-run 007
node dist/scripts/migrate.js 007 # simulation également
node dist/scripts/migrate.js --apply 007
```

En local : `cd backend`, `npm run build`, puis les mêmes commandes `node dist/scripts/migrate.js`.
Sans argument, la commande affiche l’usage et échoue sans connexion. Un identifiant seul simule ; seule l’option `--apply` écrit.
Les simulations ne créent ni collections ni index. Les migrations sont rejouables ; la migration 003 conserve les notes sources.
La commande affiche un résultat JSON, retourne 0 en cas de succès, 1 en cas d’erreur, et ferme la connexion.
Appliquer les migrations requises une par une, après examen de leur simulation. Les règles ajoutées restent en brouillon.

| ID  | Symptôme si la migration n’a pas tourné                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| 001 | Un mot de passe en clair reste stocké dans les anciens comptes.                                                                 |
| 002 | La création de conversations privées peut échouer sur l’index unique de slug.                                                   |
| 003 | Les anciennes notes clients et leads manquent dans le journal des échanges.                                                     |
| 004 | Les probabilités et compteurs du CRM sont incomplets ; les règles prédéfinies manquent.                                         |
| 005 | La règle des nouveaux leads ne reconnaît pas les formulaires du site.                                                           |
| 006 | La règle de relance après démo manque dans le catalogue des brouillons.                                                         |
| 007 | Les anciens leads manquent dans les filtres par entité.                                                                         |
| 008 | La détection de doublons ne retrouve pas les anciens leads.                                                                     |
| 009 | Les objectifs commerciaux ne disposent pas de leur contrainte d’unicité.                                                        |
| 010 | Les anciens leads n’ont pas les valeurs de confidentialité par défaut ; la liste de suppression manque de contrainte d’unicité. |
| 011 | Les séquences manquent de leurs index de file et d’inscription unique.                                                          |
| 012 | Les fiches projets et leurs brouillons de départ manquent.                                                                      |
| 013 | Les jetons de réinitialisation et défis 2FA manquent de leurs index uniques ou TTL.                                             |
| 014 | La liste « ne pas contacter » n'accepte que des adresses : son index unique doit devenir partiel pour inscrire des numéros.     |
