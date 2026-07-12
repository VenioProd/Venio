# Recette administrateur multi-rôles (VENIO-104)

Cette recette vérifie la politique de `rbac-matrix.json` pour les rôles
humains demandés : `SUPER_ADMIN`, `ADMIN`, `COMMERCIAL`, `RH`, `COMPTABLE`,
`VIEWER` et `STAGIAIRE`. Elle ne couvre pas Arrow et ne doit jamais être
étendue à ses routes dans le cadre de cette recette.

## Lancer la recette de release

```bash
npm run recipe:admin-roles
```

La commande arrête la recette dès qu'un test échoue. Si tous les tests passent,
elle écrit un rapport JSON horodaté dans `artifacts/admin-role-recipe/`.
Ce dossier est ignoré par Git : joindre le fichier généré à la preuve de
release, sans y ajouter de secrets.

Commandes séparées :

```bash
# Tests UI + backend isolés
npm run test:admin-role-recipe

# Instantané descriptif seulement (résultat DRAFT)
npm run report:admin-role-recipe
```

Le statut `PASS` du rapport n'est émis que par `npm run recipe:admin-roles`,
après le succès des deux suites. Le rapport contient la révision Git, la
matrice effective, les couvertures automatisées et le statut du smoke
production.

## Matrice des scénarios

| Rôle | Connexion / MFA | UI attendue | Backend autorisé | Refus et périmètre à vérifier |
| --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | Cookie de session ; TOTP obligatoire | CRM, comptabilité, comptes admin et agents visibles | Toutes permissions de la matrice ; lecture CRM/tickets globale | Session privilégiée sans step-up MFA refusée sur comptabilité sensible ; les opérations P0 conservent confirmation et step-up |
| `ADMIN` | Cookie de session ; TOTP obligatoire | CRM, comptabilité et clients visibles ; comptes admin/agents absents | CRM, comptabilité et opérations de gestion prévues par la matrice | `manage_admins` refusé ; aucune élévation implicite au rôle super-admin |
| `COMMERCIAL` | Cookie de session ; pas de MFA obligatoire par la politique actuelle | Clients, CRM, projets et tickets visibles ; comptabilité absente | Lecture/gestion CRM, clients, projets, tickets | Comptabilité et administration refusées ; CRM limité aux leads créés ou assignés à l'utilisateur |
| `RH` | Cookie de session ; pas de MFA obligatoire par la politique actuelle | Équipe, e-mails, Qualiopi, projets et tickets visibles | Qualiopi, contenu, projets, tickets | CRM, comptabilité et administration refusés ; tickets limités à l'auteur |
| `COMPTABLE` | Cookie de session ; pas de MFA obligatoire par la politique actuelle | Comptabilité, projets et messages visibles | Lecture/gestion comptable selon matrice | CRM et tickets refusés ; ne pas supposer de droit sur les données commerciales |
| `VIEWER` | Cookie de session ; pas de MFA obligatoire par la politique actuelle | Projets, comptabilité en lecture, tickets et Dev visibles | Lectures prévues, création de ticket | CRM, clients, administration et mutations comptables refusés ; tickets limités à l'auteur |
| `STAGIAIRE` | Cookie de session ; pas de MFA obligatoire par la politique actuelle | CRM, projets, ressources et tickets visibles | CRM, tâches, contenu, tickets | Comptabilité, clients et administration refusés ; CRM et tickets limités à l'utilisateur |

Les permissions détaillées restent celles de `rbac-matrix.json`, source de
vérité importée par le frontend et vérifiée par les tests backend. La suite UI
contrôle les entrées de navigation autorisées et interdites ; la suite backend
contrôle les routes CRM, comptabilité, tickets et comptes administrateur avec
la même session navigateur.

## Données de recette et nettoyage

Les tests n'utilisent ni environnement partagé ni données réelles :

- MongoMemoryServer démarre une base temporaire dédiée au fichier de test.
- Les sept utilisateurs, mots de passe, secrets TOTP, leads et tickets sont
  synthétiques et générés à l'exécution.
- Les mots de passe et TOTP sont aléatoires, restent en mémoire et ne sont ni
  affichés ni écrits dans le rapport.
- La base mémoire est vidée avant chaque scénario et arrêtée après la suite.

La recette ne lance pas `cleanup:demo`, ne touche pas Mongo de production et
ne crée aucun compte dans un environnement externe.

## Smoke production contrôlé restant

Le smoke de production est volontairement **non exécuté** tant qu'une
autorisation explicite et des comptes synthétiques dédiés ne sont pas fournis.
Quand ils le sont, le responsable de recette doit :

1. Obtenir une fenêtre approuvée, sept comptes synthétiques isolés et un plan
   de nettoyage validé.
2. Configurer MFA uniquement pour les comptes synthétiques `SUPER_ADMIN` et
   `ADMIN`, dans le gestionnaire approuvé ; ne jamais copier le secret dans un
   ticket, terminal partagé ou artefact.
3. Vérifier login, challenge MFA, navigation, refus de routes et scoping CRM/
   tickets avec les seules données marquées pour la recette.
4. Exécuter le nettoyage approuvé, conserver le rapport JSON de la release et
   marquer le smoke comme exécuté avec son horodatage et son responsable.

Sans ces prérequis, le rapport doit conserver `productionSmoke.status` à
`NOT_EXECUTED`. Aucun succès de production ne doit être déduit de la recette
locale/CI.
