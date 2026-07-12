# Actions sensibles

La source de vérité exécutable est `backend/src/lib/security/sensitiveActions.ts`.
Chaque route P0 l'utilise via `sensitiveAction('<ACTION_ID>')` après ses
middlewares RBAC habituels. La politique ne remplace jamais une permission
métier : elle ajoute une preuve d'intention, un step-up et une trace commune.

| Niveau   | Actions P0                                                                                                                     | Garde-fous                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Élevé    | suppressions de projets client/dev, suppression d'écriture brouillon                                                           | confirmation typée, step-up de session                                        |
| Haut     | export FEC, rapports CSV comptables, exports CSV pédagogiques, création/modification d'accès outil                            | confirmation typée, step-up de session, audit ; alerte quand pertinente       |
| Critique | création/modification/révocation de PAT, révélation/suppression d'accès outil, création/rotation/suppression de source externe | confirmation typée, step-up MFA, audit append-only et alerte quand pertinente |

## Contrat HTTP

Les clients authentifiés doivent ajouter l'en-tête suivant à l'action exacte :

```http
X-Venio-Confirm: AGENT_TOKEN_CREATE
```

Une confirmation absente renvoie `428 SENSITIVE_ACTION_CONFIRMATION_REQUIRED` ;
une autre action renvoie `403 SENSITIVE_ACTION_CONFIRMATION_INVALID`. Les
actions avec `SESSION` exigent une session ayant réalisé le step-up MFA dans les
15 dernières minutes. La révélation de secret outil conserve un TOTP présenté à
l'action (`totpCode`), qui est vérifié par le garde-fou central.

Sur succès 2xx, une entrée `SENSITIVE_ACTION_EXECUTED` est ajoutée au journal
d'audit. Elle contient l'identifiant de politique, le niveau, le chemin et la
méthode ; elle ne contient jamais le corps de requête ni un secret. Certaines
politiques envoient également une notification aux super-administrateurs.

## Étendre le catalogue

1. Ajouter la politique dans `SENSITIVE_ACTIONS` avec le niveau, le step-up et
   les rôles éventuellement plus restrictifs.
2. Monter `sensitiveAction` sur la route concernée sans retirer son middleware
   RBAC existant.
3. Faire transmettre l'en-tête depuis le parcours UI/API explicite.
4. Ajouter des tests de permission, confirmation, step-up et audit.

Les suppressions de ressources non-P0 (tickets, tâches, documents, contenus
pédagogiques, etc.) ne sont pas encore enrôlées : elles restent couvertes par
leur RBAC existant et doivent être migrées action par action, avec une décision
produit sur leur niveau de réversibilité.

Le registre des catégories, durées, exports et procédures est dans
[`DATA_GOVERNANCE.md`](./DATA_GOVERNANCE.md). Les exports CSV comptables et
pédagogiques y sont qualifiés sensibles ; le garde-fou n'élargit pas leur RBAC
existant.
