# VENIO-49 — lancement d’agent cadré

Le cockpit Dev expose le lancement uniquement aux `SUPER_ADMIN` et seulement si le serveur peut construire un périmètre complet : projet actif, dépôt configuré, branche par défaut configurée et bridge HTTPS configuré.

## Configuration serveur

Ces variables restent strictement côté serveur. Elles ne doivent jamais être ajoutées au frontend ni à un fichier suivi.

```bash
DEV_AGENT_ALLOWED_TARGETS=madara:gpt-5.6-terra
DEV_AGENT_BRIDGE_URL=https://bridge.example.internal/v1/dev-runs
DEV_AGENT_BRIDGE_TOKEN=<secret-optionnel-du-bridge>
```

`DEV_AGENT_ALLOWED_TARGETS` est une allowlist explicite : sans cible valide, le bouton est absent et l’API retourne un état indisponible. Le premier couple valide est retenu ; le navigateur ne choisit ni l’agent ni le modèle.

Le bridge reçoit un objet JSON `venio.dev-agent-run.v1` contenant l’identifiant d’exécution, la cible allowlistée et un contexte structuré (projet, issue, recommandation validée, dépôt et branche). Il ne reçoit aucun prompt système, commande shell ou credential issu du navigateur. Un éventuel token du bridge est injecté seulement dans l’en-tête HTTP serveur.

## Comportement et audit

- Chaque `POST /api/admin/dev/projects/:id/agent-runs` exige `Idempotency-Key` et persiste une exécution locale avant toute tentative de dispatch.
- Le retour est immédiat (`QUEUED`) : le dispatch HTTP s’effectue hors du cycle de réponse.
- Si le bridge n’est pas configuré/disponible, l’exécution reste `BRIDGE_UNAVAILABLE`, est renvoyée en `503` avec son identifiant local et produit une trace `agent_blocked` + un commentaire sur l’issue. Ce n’est pas un succès simulé.
- Un lancement accepté produit une trace `agent_started` + un commentaire sur l’issue. Les échecs de dispatch passent à `DISPATCH_FAILED` et sont aussi tracés.

## Reliquat assumé

Le dépôt ne fournit pas de queue ni de bridge d’agent existant à réutiliser. Le socle ajoute donc un adaptateur HTTPS injectable et un enregistrement durable, mais ne crée pas de faux worker local. Il manque encore une décision produit et un contrat d’intégration pour :

1. choisir/installer le bridge ou la queue durable qui consommera les exécutions `QUEUED` ;
2. définir son mécanisme d’authentification de callback serveur à serveur ;
3. appeler `recordDevAgentRunStatus` depuis ce callback/worker afin de tracer les statuts `RUNNING`, `SUCCEEDED` et `FAILED` dans la timeline et les commentaires.

Tant que ce bridge n’est pas fourni et configuré, l’action reste cachée dans l’interface et aucune tâche externe ne part.
