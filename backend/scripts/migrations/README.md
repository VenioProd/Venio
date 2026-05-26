# Migrations one-shot

Scripts à exécuter une fois par environnement (idempotents : ré-exécutables sans risque).

Les anciennes migrations étaient câblées au démarrage du serveur dans `backend/src/index.ts`.
Elles ont été sorties d'ici pour ne plus pénaliser le boot et faciliter le replay/audit.

## Lister les migrations

| Fichier | Date | Description |
|---|---|---|
| [`001-unset-plain-password.ts`](./001-unset-plain-password.ts) | 2024 | Retire le champ `plainPassword` de tous les `User` (sécurité). |
| [`002-unset-conversation-slug-null.ts`](./002-unset-conversation-slug-null.ts) | 2024 | Retire `slug: null` sur les conversations DM/GROUP (fix index sparse unique). |

## Exécuter une migration

```bash
cd backend
# dev
MONGODB_URI=... npx tsx scripts/migrations/001-unset-plain-password.ts
# prod (depuis le container)
docker compose -f docker-compose.prod.yml exec venio node \
  --experimental-strip-types --experimental-detect-module \
  scripts/migrations/001-unset-plain-password.ts
```

Chaque script log le nombre de documents modifiés et exit `0` si tout va bien.
