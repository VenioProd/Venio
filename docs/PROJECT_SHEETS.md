# Fiches projets — le réceptacle de connaissance du groupe

Une **fiche projet** explique, à n'importe quel membre de l'équipe, ce que fait un projet ou une filiale du groupe (Venio, Arrow, Creatio, Decisio, Formatio, Virendys, Artosera…) : offre, cibles, ton, tarifs, outils, équipe, avancement, FAQ prospect, glossaire, accès démo.

Écran : **Projets → Fiches** (`/admin/projets/fiches`, fiche : `/admin/projets/fiches/:slug`).

## À ne pas confondre

| Objet | Rôle | Accès |
| --- | --- | --- |
| `ProjectSheet` (ce document) | connaissance partagée, Markdown | lecture : rôles admin ; écriture : SUPER_ADMIN, ADMIN |
| `Subsidiary` (Projets → Plateformes, `/admin/filiales`) | dossier de pilotage : trésorerie, KPIs, coffre d'identifiants réels | SUPER_ADMIN uniquement |
| `Project` | projets clients | permissions projets |
| `projectSheetPdf` | « fiche projet » PDF de la comptabilité | comptabilité |

Une fiche peut être reliée à une filiale (`subsidiary`, unique) ; elle n'en recopie **jamais** les données confidentielles. Seul un SUPER_ADMIN voit le lien vers le dossier et peut poser ce rattachement. Le modèle est séparé de `Subsidiary` justement pour que les deux niveaux d'accès ne cohabitent pas dans un même document.

## Modèle (`backend/src/models/ProjectSheet.ts`)

- Identité : `name`, `slug` (stable : un renommage ne change pas l'URL), `logoUrl`, `accentColor`, `status` (`ACTIVE` · `LAUNCHING` · `PAUSED`), `archived`, `websites[]`, `legalEntity` (entité du groupe, `lib/groupEntities.ts`), `leadProject` (`Lead.project`, ex. `ARTOSERA`).
- Relecture : `reviewStatus` (`DRAFT` « Brouillon à relire par Raphael » · `TO_COMPLETE` · `VALIDATED`).
- `oneLiner` (≤ 300 car.) et onze sections Markdown (≤ 20 000 car.) : `whatWeDo`, `audience`, `positioning`, `brandVoice`, `offers`, `keyFigures`, `stack`, `roadmap`, `decisions`, `prospectFaq`, `glossary`.
- `links[]` (repo, app, docs, nextcloud, design, other — http/https uniquement), `referent`, `team[] {user, role}` (membres internes uniquement), `devProject`.
- `demoAccesses[]` : URL, rôle du compte, identifiant, `passwordEnc` (chiffré, `select: false`), notes.
- `history[]` : qui, quand, quels champs (200 dernières entrées). Jamais de valeur.

Le Markdown est rendu côté front par `SafeMarkdown` : éléments React uniquement, aucun HTML brut interprété, liens http(s)/mailto seulement.

## API (`/api/admin/project-sheets`, `routes/admin/projectSheets.ts`)

| Route | Accès |
| --- | --- |
| `GET /meta` | rôles admin (membres et projets dev seulement pour les éditeurs) |
| `GET /?q=&archived=true` | rôles admin — cartes ; `q` : recherche plein texte (tous les mots, sans casse ni accent, extraits) |
| `GET /:idOrSlug` | rôles admin — fiche, compteurs CRM si `view_crm` |
| `POST /`, `PATCH /:id` | SUPER_ADMIN, ADMIN — `baseUpdatedAt` facultatif → `409 SHEET_CONFLICT` si la fiche a changé |
| `POST/PATCH/DELETE /:id/demo-accesses[/:accessId]` | SUPER_ADMIN, ADMIN |
| `POST /:id/demo-accesses/:accessId/reveal` | rôles admin (jamais CLIENT, COMMERCIAL_EXTERNE, AGENT) — `Cache-Control: no-store` |

« Rôles admin » = SUPER_ADMIN, ADMIN, MANAGER, RH, COMMERCIAL, COMPTABLE, VIEWER, STAGIAIRE (`requireAdmin`, MFA comprise).

Lien CRM : `/admin/crm?entity=<legalEntity>&project=<leadProject>`, compteurs des leads ouverts et gagnés (non archivés). Il n'existe pas de relation entre une fiche et les projets clients (`Project` n'a pas d'entité) : rien n'est affiché à ce titre.

## Accès démo

> Uniquement des comptes de démonstration à données fictives. Jamais d'identifiants réels de production, de clients ou d'outils internes.

- Mot de passe chiffré au repos (AES-256-GCM, `lib/secretBox.ts`, clé `CREDENTIALS_KEY`), exclu des requêtes par défaut, absent de toutes les réponses (drapeau `hasPassword`).
- Révélation par route dédiée, journalisée (`PROJECT_SHEET_DEMO_ACCESS_REVEAL` : qui, quand, quel accès — jamais le mot de passe).
- Ajout, modification, suppression : audités (`PROJECT_SHEET_DEMO_ACCESS_CREATE|UPDATE|DELETE`) ; l'historique de la fiche note seulement « accès démo modifié ».
- Exclus de la recherche plein texte et des cartes de la liste ; la fiche n'est exposée ni par l'API agent ni par un export.

## Audit

`PROJECT_SHEET_CREATE`, `PROJECT_SHEET_UPDATE` (champs modifiés, sans valeurs) et les quatre actions d'accès démo ci-dessus, dans `AuditLog` (`metadata.entityType = 'ProjectSheet'`).

## Contenu initial — migration 012

`backend/scripts/migrations/012-project-sheets.ts` (logique : `lib/projectSheetSeed.ts`) crée les index, puis les fiches Venio, Creatio, Decisio, Formatio, Arrow, Virendys et Artosera à partir du brouillon de Raphael (`DRAFT`), rattachées à la filiale de même slug si elle existe (`sukuna` → Virendys). Sur une fiche existante, elle ne remplit que les champs vides. Chaque autre filiale active du dossier reçoit une fiche vide `TO_COMPLETE`. Aucun accès démo n'est créé. Idempotente ; `--dry-run` pour voir le rapport.
