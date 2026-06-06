# Utilisation des tokens API agent Venio

Les tokens API agent permettent à un outil externe d'appeler Venio via l'API REST `/api/v1/agent`. Ils servent aux agents comme Codex, Kuro ou une intégration tierce pour lire, créer et gérer du contenu selon les scopes accordés.

## 1. Principe

- Format du token : `vno_pat_...`
- Header obligatoire :

```http
Authorization: Bearer <VENIO_AGENT_TOKEN>
```

- Base production :

```text
https://venio.paris/api/v1/agent
```

- Le secret complet est affiché une seule fois à la création du token. Ensuite, Venio ne conserve qu'un hash et un préfixe d'affichage.

## 2. Premier test

```bash
curl -sS \
  -H "Authorization: Bearer $VENIO_AGENT_TOKEN" \
  https://venio.paris/api/v1/agent/ping
```

Réponse attendue : `ok: true`, avec le nom du token, son préfixe et ses scopes.

## 3. Lecture de données

Exemple : lire les projets du workspace dev.

```bash
curl -sS \
  -H "Authorization: Bearer $VENIO_AGENT_TOKEN" \
  "https://venio.paris/api/v1/agent/dev/projects?pageSize=50"
```

Une route de lecture exige généralement un scope `read:<module>`, par exemple `read:crm`, `read:projects`, `read:dev`.

## 4. Écriture et idempotence

Toutes les mutations (`POST`, `PATCH`, `PUT`, `DELETE`) doivent inclure une clé `Idempotency-Key`. Utiliser une valeur unique par opération, par exemple un UUID.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $VENIO_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "project": "<DEV_PROJECT_ID>",
    "title": "Titre de la tâche",
    "description": "Créée depuis un agent externe",
    "type": "TASK",
    "status": "TODO",
    "priority": "MEDIUM"
  }' \
  https://venio.paris/api/v1/agent/dev/issues
```

Si la même clé est rejouée avec le même body, Venio renvoie la même réponse. Si elle est rejouée avec un body différent, Venio renvoie `409 IDEMPOTENCY_CONFLICT`.

## 5. Scopes utiles

- `read:crm` / `write:crm` : clients, leads, contacts, notes.
- `read:projects` / `write:projects` : projets client, sections, contenus, updates.
- `read:documents` / `write:documents` : documents et uploads.
- `read:tasks` / `write:tasks` : tâches et commentaires.
- `read:internal-messaging` / `write:internal-messaging` : messagerie interne.
- `read:dev` / `write:dev` : suivi dev Venio.
- `admin:*` : accès total, à réserver aux tokens maîtres.

`write:<module>` n'implique pas `read:<module>` : donner les deux si l'agent doit lire puis modifier.

## 6. Bonnes pratiques

- Ne jamais mettre un token en dur dans le code ou dans un dépôt Git.
- Stocker le token dans une variable d'environnement ou un gestionnaire de secrets.
- Donner le minimum de scopes nécessaires.
- Définir une expiration pour les tokens temporaires.
- Révoquer un token inutilisé ou compromis depuis `/admin/agents`.
- Consulter l'audit pour vérifier les mutations faites par un agent.

## 7. Documentation complète

- Spec API agent : [docs/api-agent.md](./docs/api-agent.md)
- OpenAPI public : `GET https://venio.paris/api/v1/agent/openapi.json`
