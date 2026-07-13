# Carte de déploiement du cockpit dev

La carte « Déploiement production » du cockpit projet présente uniquement des
observations déjà persistées côté Venio. Sa source de vérité est la timeline
technique (`DevIssueEvent`) : un événement `deployed` avec
`metadata.environment: "production"` (ou `"prod"`) peut fournir le commit,
l’état du déploiement, un `runId` GitHub Actions et un healthcheck ; un
événement `ci_changed` peut fournir `ciStatus` et `runId`. À défaut, le dernier
`github.ciStatus` associé à une issue reste visible comme métadonnée CI locale.

Les valeurs attendues sont volontairement petites et explicites :

- `status` de déploiement : `success`, `succeeded`, `completed`, `failure`,
  `failed`, `error`, `pending`, `running` ou `in_progress` ;
- `healthcheck.status` : `healthy`, `degraded` ou `unhealthy` ;
- `github.commitSha` : SHA Git valide ; `github.runId` : entier positif.

Une absence de donnée reste « Inconnu » : un déploiement staging, un événement
sans statut, ou l’absence de healthcheck n’est jamais considéré sain. Les
observations sont signalées « anciennes » après 24 h.

La carte n’exécute pas de sonde HTTP, commande shell ni appel à un fournisseur
depuis le navigateur. Aucun URL provenant d’une métadonnée d’événement n’est
renvoyé au client : les liens commit/run sont reconstruits côté serveur vers
`github.com/<owner>/<repo>` à partir de la configuration du projet, après
validation de `owner`, `repo`, SHA et `runId`. Les détails restent derrière le
RBAC existant `view_dev` de l’espace Dev.
