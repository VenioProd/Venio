# Gouvernance des données administratives

Ce registre est la référence opérationnelle de VENIO-103. Il décrit les traitements observés dans le dépôt au 12 juillet 2026, les règles de conservation décidées pour le produit et les écarts à résorber. Il ne remplace ni une analyse juridique, ni le registre légal du responsable de traitement, ni les instructions du DPO/conseil compétent.

Les durées indiquées ci-dessous sont des **politiques produit à faire approuver par le responsable de traitement**. Elles ne prétendent pas constituer une obligation légale. En cas de demande, litige, contrôle, obligation contractuelle ou instruction légale contradictoire, la mise en purge est suspendue et le référent désigné tranche avant toute suppression.

## Statuts utilisés

| Statut | Sens |
| --- | --- |
| Politique | Règle décidée pour le produit ; elle attend l’approbation formelle indiquée dans la colonne pilote. |
| Configuration | Paramètre, TTL ou ordonnanceur effectivement configuré. |
| Appliqué | Comportement vérifié dans le code de cette branche. |
| Écart | Point non automatisé ou à confirmer ; il ne doit pas être présenté comme effectif. |

## Registre de données

| Domaine | Données principales et finalité opérationnelle | Accès appliqué | Politique de conservation / purge | État appliqué et pilote |
| --- | --- | --- | --- | --- |
| CRM | Leads, contacts, comptes client, emails/téléphones, notes, historique d’interaction, budget. Prospection, relation et exécution client. | RBAC CRM (`view_crm`/`manage_crm`) ; API agent par scopes CRM. | Prospects non convertis : 24 mois après la dernière interaction significative. Clients et dossiers liés : durée de la relation puis 36 mois, sauf conservation justifiée. Purge/anonymisation par dossier, après revue des dépendances. | **Écart** : aucune purge planifiée trouvée. Pilote : commercial + référent données. |
| Finance | Factures, règlements, écritures, pièces/références comptables, TVA, FEC, sources externes. Gestion financière et traçabilité. | RBAC comptabilité ; FEC réservé à `export_fec`. Les écritures verrouillées sont protégées par le domaine comptable. | 10 ans après la clôture de l’exercice comme politique comptable interne, puis purge soumise à validation finance. Les brouillons peuvent être supprimés selon les routes existantes. | **Partiel** : verrous et restrictions de suppression appliqués ; aucune purge programmée. Pilote : finance. |
| Pédagogie | Étudiants, coordonnées, identifiants externes, présence, évaluations, feedback, travaux et documents. Suivi pédagogique. | Routeur administration restreint à `SUPER_ADMIN`, avec filtrage par propriétaire et `deletedAt` sur les entités concernées. | 36 mois après la fin de la dernière classe/session de l’étudiant. Suppression logique immédiate si validée, purge physique après expiration et contrôle des documents/travaux associés. | **Partiel** : suppression logique disponible sur plusieurs modèles ; pas de purge physique ni de job TTL. Pilote : responsable pédagogique. |
| Messages et documents | Messages internes/client, conversations, pièces jointes et documents projet. Coordination et preuve de service. | Permissions messagerie/projet/document ; API agent par scopes. | 24 mois après clôture de la conversation ou du projet, puis suppression des messages et objets de stockage associés après vérification des dépendances. | **Écart** : pas de politique de purge automatisée ; téléchargements de PJ hors des exports enrôlés restent à inventorier. Pilote : opérations. |
| Sécurité et audit | Événements de connexion, actions sensibles, métadonnées de requête et mutations agent. Investigation et sécurité. | Lecture audit réservée aux droits d’administration/scopes audit. Pas de route d’écriture/suppression exposée. | 24 mois à compter de l’événement, sauf conservation plus longue explicitement décidée pour un incident ouvert. Revue trimestrielle du volume et de la minimisation. | **Écart** : aucune TTL/purge constatée. Certains audits de mutation agent stockent aujourd’hui `before`/`after` et peuvent dupliquer des données métier : dette à corriger avant d’étendre ce mécanisme. Pilote : sécurité. |
| Technique | Sessions, clés d’idempotence, jetons d’agent (hachés), sauvegardes et journaux techniques. Sécurité et fiabilité. | Accès restreint à l’administration et aux opérations. | Clés d’idempotence : durée configurée par le modèle, à ne pas confondre avec la rétention comptable. Jetons révoqués/sauvegardes : durée à valider par sécurité/opérations. | **Appliqué** : TTL de 24 h pour `AgentIdempotencyKey`. **Écart** : documentation comptable historique à réaligner ; aucune rétention globale des sauvegardes n’est attestée ici. |

## Exports sensibles et audit

Un export sensible est une réponse téléchargeable qui contient des données financières, identifiantes, de présence, d’évaluation ou de contenu non public. Le RBAC existant reste le premier contrôle : la gouvernance ne l’élargit pas.

| Export | Garde-fous appliqués | Trace créée |
| --- | --- | --- |
| FEC | Permission `export_fec`, confirmation `X-Venio-Confirm: FEC_EXPORT`, step-up MFA récent. | `SENSITIVE_ACTION_EXECUTED`, sans corps de requête ni contenu exporté. |
| Rapports comptables CSV | Permission `view_accounting` existante, confirmation `ACCOUNTING_REPORT_EXPORT`, step-up MFA récent. Les réponses JSON de consultation ne sont pas affectées. | `SENSITIVE_ACTION_EXECUTED`, chemin et méthode uniquement. |
| Corrections pédagogiques CSV | `SUPER_ADMIN` existant, confirmation `EDUCATION_ASSIGNMENT_EXPORT`, step-up MFA récent. | `SENSITIVE_ACTION_EXECUTED`, chemin et méthode uniquement. |
| Présences pédagogiques CSV | `SUPER_ADMIN` existant, confirmation `EDUCATION_SESSION_EXPORT`, step-up MFA récent. | `SENSITIVE_ACTION_EXECUTED`, chemin et méthode uniquement. |

Les traces sont append-only au niveau applicatif : aucune route d’écriture/suppression du journal n’est exposée. Elles n’emportent ni CSV, ni nom de fichier, ni liste d’étudiants, ni période de rapport. Les exports CSV construits uniquement dans le navigateur (notamment certaines vues CRM) ne peuvent pas être journalisés côté serveur : ils constituent un **écart à inventorier** avant toute déclaration de couverture exhaustive.

La recette automatisée `backend/src/__tests__/data-governance-export.integration.test.ts` vérifie pour les exports pédagogiques l’absence de confirmation, la confirmation erronée, le step-up, la trace de succès et l’absence de `before`/`after` dans cette nouvelle trace.

## Procédure d’accès et de suppression

Cette procédure est volontairement opérable sans exposer de donnée personnelle dans un ticket ou un chat. Créer un identifiant de dossier interne et conserver les preuves minimales dans un espace d’accès restreint.

1. Réceptionner la demande par un canal identifié, dater la demande et vérifier l’identité de manière proportionnée. Ne pas inclure les données fournies par le demandeur dans le titre du ticket.
2. Qualifier la demande : accès, rectification, suppression, limitation ou opposition. Le référent données contrôle le périmètre et les éventuelles restrictions légales/contractuelles avant toute action.
3. Rechercher par catégorie du registre (CRM, finance, pédagogie, messages/documents, audit/technique) et relever uniquement les identifiants internes, systèmes sources et volumes. Le propriétaire de chaque domaine valide l’exhaustivité.
4. Pour l’accès, préparer une copie intelligible avec minimisation des données de tiers, secrets, notes internes et éléments hors périmètre. Toute exportation utilise le parcours sensible applicable et laisse une trace d’audit.
5. Pour la suppression, documenter les objets à supprimer, les dépendances et le choix : suppression logique, anonymisation ou refus motivé/suspension. Les données finance/audit sous conservation ne sont pas supprimées sans validation du pilote ; les autres données suivent la règle de la catégorie.
6. Exécuter une vérification après action : recherche par identifiant, contrôle des objets de stockage associés, absence d’accès dans l’interface autorisée et cohérence des traces. Ne jamais utiliser un environnement de production pour tester la procédure.
7. Clore avec la date, le périmètre, le résultat, les exceptions et l’approbateur, sans joindre le contenu personnel ou l’export au dossier courant.

### Recette répétable sur données de test

Avant une mise en production qui modifie ce parcours, exécuter dans une base de test jetable :

1. Créer un sujet de test et des données CRM, pédagogiques, messages et une référence finance simulée ; noter seulement leurs identifiants de test.
2. Parcourir les étapes 1 à 6 pour une demande d’accès, en vérifiant la minimisation de la copie produite.
3. Rejouer pour une demande de suppression : confirmer le soft-delete pédagogique, l’absence de purge automatique et la conservation/suspension finance-audit lorsque la politique l’exige.
4. Exécuter `npm --prefix backend test -- data-governance-export.integration.test.ts` : le test atteste le parcours technique d’export sensible (confirmation, MFA et journal minimal) sans donnée de production.
5. Attacher au dossier de recette seulement le résultat des contrôles, les identifiants de test et la décision ; supprimer les fixtures de test à la fin.

## Réponse à incident

1. Contenir : suspendre le compte/session/jeton concerné, révoquer l’accès si nécessaire et préserver les journaux ; ne pas supprimer les traces.
2. Évaluer : identifier les catégories, la période, les personnes potentiellement concernées, les exports/téléchargements et les systèmes tiers. Marquer les conclusions comme hypothèses tant qu’elles ne sont pas vérifiées.
3. Coordonner : prévenir le responsable sécurité et le responsable de traitement ; solliciter le DPO/conseil compétent pour les obligations de notification. Ce document ne fixe aucun délai légal.
4. Corriger : retirer l’accès, corriger la cause, faire valider les changements et exécuter les tests ciblés.
5. Clore : consigner la chronologie, le périmètre, les décisions, les preuves minimales et les actions de prévention, avec une revue de ce registre si une catégorie ou un flux a changé.

## Revue et prochaines actions

Le référent données revoit ce registre chaque trimestre et avant tout nouveau connecteur, export ou changement de stockage. Priorités actuelles : obtenir l’approbation formelle des durées, planifier les purges avec dry-run et preuve, minimiser les `before`/`after` des audits agent, inventorier les exports navigateur et aligner la documentation Arrow sur le TTL effectif des clés d’idempotence.
