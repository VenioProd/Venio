# VENIO-137 — Tracker dev et espace pédagogique

## Comportements livrés

- Les blocages sont comptés par statut `BLOCKED` ou label `blocked`/`blocker`, sans doublon et hors tickets fermés ou archivés. Les totaux du cockpit ne dépendent plus des listes d’alertes limitées à huit lignes.
- La liste admin expose `total`, `page`, `pageSize` et `nextPage`, avec un tri stable. Le client parcourt toutes les pages pour conserver des tableaux et une recherche complets. Une erreur ou une liste incohérente est affichée avec une action de reprise. Les graphiques de vélocité et de modèles sont agrégés côté serveur sur la collection filtrée, indépendamment des pages.
- La revue permet de cocher les critères et de consigner des commentaires `EVIDENCE`. L’approbation relit le statut et les critères avant de terminer la tâche. Le plan de vérification, la PR, la CI, la fusion et les observations de production sont distingués. Un déploiement exige une observation explicite et un SHA concordant ; la disponibilité reste datée.
- Les modifications de classe, de note et de compte-rendu sont regroupées puis envoyées dans l’ordre, y compris lors d’une fermeture ou d’une navigation. Les échecs conservent une version en mémoire et un brouillon local par compte et entité, avec reprise explicite. Un rafraîchissement de liste ne remplace plus la note en cours de rédaction.
- Le filtre école s’applique aux copies à corriger et en retard. La liste des devoirs à corriger exige une copie non notée. Les réponses obsolètes d’un précédent filtre école sont ignorées.
- Le cockpit ouvre directement une séance, le mode live ou la correction, avec des boutons accessibles au clavier et un accès secondaire à la classe. Le cockpit conserve son contexte lors de ces ouvertures et restaure sa position après une visite de classe.
- Les templates proposent des champs adaptés aux séances, devoirs, classes et notes, un aperçu, la duplication et la création de contenus dans une classe. Les devoirs créés ainsi restent en brouillon. Les propriétés inconnues sont conservées à l’édition ; le JSON demeure accessible dans les options avancées.
- Les fenêtres de revue, de correction, de séance et de templates sont rendues hors des contextes de superposition de la navigation admin. Leur entête et leurs actions restent accessibles, y compris sur mobile.

## Validation locale

- TypeScript : frontend et backend.
- Tests ciblés : 97 tests backend et 46 tests frontend (143 au total).
- Construction Vite et génération des pages publiques.
- ESLint sur les fichiers TypeScript concernés : aucune erreur bloquante ; le dépôt conserve des avertissements.
- Recette navigateur sur une base MongoDB temporaire, avec deux écoles et 602 tickets : filtre école, fermeture immédiate et réouverture d’un compte-rendu, ouverture directe de la correction, édition/application d’un template, critères et preuve de revue.
- Rendu vérifié à 1280 × 720 et 390 × 844 pour les fenêtres modifiées.

## Limites explicites

Le parcours des pages n’est pas un instantané transactionnel. Une modification concurrente détectée dans la pagination demande un rechargement plutôt que de présenter une liste partielle comme complète. Les brouillons locaux dépendent du stockage du navigateur ; une erreur de sauvegarde demeure visible et n’est pas assimilée à un succès. Cette validation locale n’atteste pas d’un déploiement en production.
