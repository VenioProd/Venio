# VENIO-138 — Intégration des branches et preuve de déploiement

## Travail récupéré

- `feat/education-session-workspace` (avec `feat/education-cockpit-calendar`) : fiches des cours Apple, notes, rappels et devoirs ; bibliothèque documentaire, catégories, statuts, filtres et regroupement des classes par école.
- `feat/education-notion-import` : aperçu sans écriture, import des pages et étudiants, mise à jour sans doublons et historique. La pagination distante échoue explicitement si sa limite de sécurité est atteinte.
- `claude/bold-mirzakhani-cebf6c` : logos Yumi et Jiraya, disponibles également pour les filiales existantes sans migration de données.
- `fix/blank-screen-chunk-recovery` : reprise d'un chargement de module après déploiement, limitée à un rechargement automatique par onglet, puis possibilité de reprise manuelle.
- `feat/venio-ticket-batch-20260522` : test de parité des permissions frontend/backend adapté aux tables actuelles. La centralisation des appels API est déjà présente ; l'ancien README est remplacé par la documentation actuelle.

L'intégration conserve les améliorations de VENIO-137 : sauvegarde avant fermeture, brouillons par compte, filtres école, accès directs aux séances et overlays rendus hors de la navigation. Les documents sont téléchargés avec authentification et paginés. Le rattachement d'un événement calendrier ne peut viser qu'une classe du compte courant et reste conservé lorsqu'il est omis d'une modification.

## Vérifications

- Suite backend complète : 155 fichiers, 1 360 tests réussis.
- Suite frontend complète : 419 tests réussis, un échec de conformité de couleur dans l'écran Notion, corrigé ; relance ciblée après correction : 51 tests réussis, dont les tests de styles, de permissions et d'espace pédagogique.
- TypeScript frontend et backend et construction publique réussis.
- Recette navigateur locale avec MongoDB temporaire : ouverture du cours Apple, fermeture immédiate après saisie et réouverture avec note conservée, bibliothèque documentaire, formulaire d'ajout d'URL et navigation vers Notion.
- Affichage vérifié à 1280 × 720 et 390 × 844 ; viewport restauré et serveurs de recette arrêtés.
- L'import Notion est couvert par des réponses simulées, dont aperçu sans mutation et réimport sans doublon. Aucun import de données Notion réelles n'a été lancé.

## Branches examinées et déjà remplacées

Les branches associées à des PR déjà fusionnées, y compris par squash, ne sont pas de nouvelles fonctionnalités en attente. Les anciens chantiers JavaScript de comptabilité, Nextcloud, interface néon et déploiement sont remplacés par les modules TypeScript, le design et le workflow actuels. Les PR fermées sans fusion ne sont pas réactivées automatiquement. Les anciennes branches d'instructions AGENTS sont remplacées par les instructions actuelles.

Les modifications non commitées des autres worktrees et le stash `codex/pre-pull-venio-audit-2026-09-12` sont conservés. Le stash concerne une ancienne version de la page d'accueil désormais remaniée ; il ne doit pas être réappliqué aveuglément.

## Preuve de production

Le workflow transmet désormais le SHA attendu au build Docker. Le backend publie ce SHA dans `/api/health` et le frontend dans `/version.json`. Le contrôle après déploiement exige leur concordance exacte avec le commit déployé, en plus de la disponibilité publique ; une discordance déclenche le retour arrière prévu par le workflow.

Les URL des CI, de la fusion et du déploiement ainsi que le SHA servi sont consignés dans le ticket VENIO-138 après vérification réelle. Les branches Dependabot restantes font l'objet d'une intégration distincte pour vérifier ensemble leurs contraintes de versions.

## Intégration des 13 branches Dependabot

Les PR #116, #117, #118, #119, #123, #127, #128, #129, #130, #146, #189, #216 et #235 sont réunies dans `codex/dependency-branches-integration`, avec conservation de leur ascendance Git. Les conflits des manifests ont été résolus en conservant chaque mise à jour ; les lockfiles ont été réconciliés, puis validés par une installation `npm ci` des deux applications.

Le plugin React 6 exige Vite 8. La configuration utilise désormais `rolldownOptions.output.codeSplitting`, avec les mêmes groupes de bibliothèques et la même cible de navigateurs qu'avant migration. Node 22.13 minimum est explicité pour satisfaire également jsdom 29. Les versions Node 22 utilisées en CI et dans Docker restent adaptées. Sources : [migration Vite 8](https://vite.dev/guide/migration) et manifests des paquets installés.

Validation locale de cet ensemble :

- 419 tests frontend réussis, TypeScript frontend/backend et ESLint sans erreur.
- Suite backend : 1 359 tests réussis, une erreur de transport `ECONNRESET` dans le test de refus d'accès pédagogique ; les 18 tests du fichier concerné réussissent à la relance isolée, sans modification de code ni assouplissement d'assertions. La suite complète reste exigée en CI avant fusion.
- Build de production réussi avec Vite 8.3 ; génération et contrôles SEO/accessibilité/budget du site public réussis.
- Trois scénarios Playwright publics réussis : accueil mobile, accueil desktop et formulaire de contact avec transport de test déterministe.
- Les actions checkout, setup-node et cache sont actualisées, avec cohérence de setup-node dans les trois jobs de CI.
