# Migrations one-shot

Scripts à exécuter une fois par environnement (idempotents : ré-exécutables sans risque).

Les anciennes migrations étaient câblées au démarrage du serveur dans `backend/src/index.ts`.
Elles ont été sorties d'ici pour ne plus pénaliser le boot et faciliter le replay/audit.

## Lister les migrations

| Fichier                                                                        | Date       | Description                                                                                                                              |
| ------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`001-unset-plain-password.ts`](./001-unset-plain-password.ts)                 | 2024       | Retire le champ `plainPassword` de tous les `User` (sécurité).                                                                           |
| [`002-unset-conversation-slug-null.ts`](./002-unset-conversation-slug-null.ts) | 2024       | Retire `slug: null` sur les conversations DM/GROUP (fix index sparse unique).                                                            |
| [`003-notes-to-interactions.ts`](./003-notes-to-interactions.ts)               | 2026-08-27 | Reprend les `ClientNote` et les `LeadActivity` de type `NOTE` dans le journal des échanges (`Interaction`). Les sources sont conservées. |
| [`004-crm-enrich.ts`](./004-crm-enrich.ts) | 2026-11-01 | Remplit `probability`, `lastInteractionAt`, `interactionsCount` des leads et crée les règles CRM prédéfinies (brouillons). |
| [`005-crm-form-rule-source.ts`](./005-crm-form-rule-source.ts) | 2026-11-06 | Ajoute la source `FORMULAIRE_SITE` à la condition de la règle prédéfinie « nouveau-lead-formulaire » déjà en base. |
| [`006-crm-post-demo-rule.ts`](./006-crm-post-demo-rule.ts) | 2026-11-06 | Insère en brouillon la règle prédéfinie « relance-post-demo » (et toute règle prédéfinie absente). Quand elle est active, le job `crm.post_demo_followup` s'abstient. |
| [`007-crm-lead-entity.ts`](./007-crm-lead-entity.ts) | 2026-11-06 | Pose `entity` (entité du groupe) sur les leads qui n'en ont pas, d'après `project` : `ARROW` → `ARROW`, le reste (dont `ARTOSERA`) → `VENIO`. N'écrase jamais une entité déjà posée ; `--dry-run` pour compter. |
| [`008-crm-dedup-normalized.ts`](./008-crm-dedup-normalized.ts) | 2026-11-06 | Remplit `contactEmailNormalized`, `contactPhoneNormalized` et `companyNormalized` des leads (détection de doublons, chantier 3B) et crée leurs index. À lancer avant ou avec le déploiement. Idempotente (ne réécrit que les valeurs absentes ou périmées) ; `--dry-run` pour compter. |

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
