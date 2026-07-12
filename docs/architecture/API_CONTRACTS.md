# Conventions API Venio

## Authentification

- JWT Bearer pour les humains (login `/api/auth/login` → `{ token, user }`)
- Token stocké en `localStorage` clé `auth_token` (manipulé uniquement via `src/lib/api.ts` côté frontend)
- Réponse 401 sur n'importe quelle route → frontend efface le token + redirige vers `/admin/login` ou `/espace-client/login`

## Helpers frontend (`src/lib/api.ts`)

| Helper | Usage |
|---|---|
| `apiFetch<T>(path, options?)` | JSON request/response, throw `ApiError` |
| `apiUpload<T>(path, formData, options?)` | Multipart upload, ne force pas `Content-Type` |
| `apiDownload(path, options?)` | Renvoie `{ blob, filename, contentType }` |
| `getToken()` / `setToken(t)` | Accès au token (utiliser EXCLUSIVEMENT via ces helpers) |
| `ApiError` | `{ status, message, payload }` |

Toutes les requêtes vers `/api/*` passent par ces helpers. Ne jamais appeler `fetch` directement pour des routes authentifiées.

## API agent (Bearer tokens)

Voir [api-agent.md](../api-agent.md). Points clés :

- Header `Authorization: Bearer <agent_token>`
- Header `Idempotency-Key: <uuid>` pour les écritures (POST/PATCH)
- Scopes par token, contrôlés en base (`AgentToken.scopes`)
- Pas de permissions par rôle (les agents ne sont pas des admins humains)
- Base path : `/api/v1/agent`

## API d'ingestion comptable (HMAC)

Distincte de l'API agent. Base path `/api/external/:sourceSlug/*`. Auth par HMAC (signature de la requête). Voir [accounting/ARROW_INGESTION_API.md](../accounting/ARROW_INGESTION_API.md).

## Conventions de réponse

- Succès JSON : `{ data?: ..., <ressource>: ..., ... }`
- Erreurs : `{ error: string, code?: string }`, status HTTP approprié
- Pagination : `{ items, total, page, pageSize }` (à généraliser progressivement)
- Downloads : `Content-Disposition: attachment; filename="..."` (ou `filename*=UTF-8''...`)

## Permissions

`rbac-matrix.json` est la source de vérité des rôles, permissions et navigations. Le frontend l'importe directement ; `backend/src/__tests__/rbac-matrix.test.ts` vérifie l'application de la matrice côté backend et `src/lib/__tests__/permissions-sync.test.ts` contrôle l'absence de dérive des valeurs frontend/backend.

Côté frontend : wrapper `<RequirePermission permission={PERMISSIONS.X} redirectTo="/admin">`.

Côté backend : filtre middleware (`requireAdmin`) + filtres applicatifs dans les routes (ex : tickets filtrés par `authorId` pour non-SUPER_ADMIN).

## Uploads

- Utiliser `apiUpload` côté frontend — ne jamais forcer `Content-Type: multipart/form-data` manuellement (le navigateur doit poser le boundary lui-même).
- Les fichiers uploadés sont stockés dans `backend/uploads/` et servis par des routes Express dédiées avec vérification de chemin (protection contre directory traversal).
- Sync optionnelle vers Nextcloud via `backend/src/lib/nextcloud.ts`.
