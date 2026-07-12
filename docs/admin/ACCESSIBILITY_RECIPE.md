# Recette accessibilité du shell admin

## Gate automatisée (VENIO-101)

Exécuter `npm run test:admin-accessibility`. La gate vérifie les violations
critiques couvertes sans dépendance externe : dialogues nommés et modaux,
racine applicative `inert` + `aria-hidden`, focus initial, cycle Tab et
restauration du focus. Elle vérifie aussi que les entrées Accueil sont des
boutons natifs (activation clavier Enter/Espace incluse par le navigateur).

Le parcours reproductible est : focus sur le déclencheur Recherche, ouvrir
avec `Ctrl/⌘+K`, parcourir les résultats avec `↑/↓`, activer avec Entrée,
puis rouvrir et fermer avec Échap ; sur mobile, activer Menu, tabuler depuis
Fermer jusqu'au dernier contrôle puis Tab (retour à Fermer), enfin fermer avec
Échap. Aucun élément du shell sous-jacent ne doit recevoir le focus pendant
un drawer ou la palette.

## Mobile

L'environnement de CI ne dispose pas d'une session admin de démonstration
non-PII pour produire une capture Playwright authentifiée. La recette
automatisée ci-dessus remplace donc la capture de régression : elle monte le
drawer portal, contrôle son rôle modal, son focus trap et son inertie, sans
utiliser de compte ni de donnée de production. Le reliquat est uniquement une
capture visuelle authentifiée à effectuer lors de la recette manuelle de
release (390 × 844 px, drawer ouvert puis palette ouverte).
