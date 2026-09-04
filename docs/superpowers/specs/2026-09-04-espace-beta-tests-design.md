# Espace beta tests — design

> 2026-09-04. Nouvel espace Venio dédié aux campagnes de beta test, calqué sur
> le patron du dev workspace mais ouvert à des testeurs externes invités.

## Objectif

Piloter des campagnes de recette : une liste de démarches à tester, un verdict
par testeur (« ça fonctionne », « ça ne fonctionne pas », « à optimiser »), un
fil de discussion sur chaque retour, et une boucle de correction qui referme le
cycle avec le dev tracker existant.

## Décisions cadrées

| Sujet | Décision |
|---|---|
| Public | Interne (admins Venio) **et** testeurs externes invités par lien nominatif. |
| Verdict | **Un run par testeur et par scénario.** Le scénario porte en plus un statut de synthèse. |
| Dev tracker | Promotion **en un clic** d'un retour vers une `DevIssue`, lien bidirectionnel. |
| Périmètre | Une campagne appartient **toujours** à un `DevProject`. |
| Accès testeur | Lien nominatif secret, révocable, expirant avec la campagne. Pas de mot de passe. |
| Captures | Aperçu inline. Images raster uniquement, validées par magic bytes. SVG refusé. |
| Visibilité | Un testeur voit les retours des autres **anonymisés** (titre, sévérité, statut). |
| Options v1 | Étapes guidées, rapport PDF, trames réutilisables, « moi aussi ». |

## Modèle de données

Six modèles Mongoose, dans `backend/src/models/`.

### `BetaCampaign`
`devProject` (ref `DevProject`, requis, indexé) · `name` · `description` ·
`targetUrl` · `status` `DRAFT|RUNNING|CLOSED` · `startsAt` · `endsAt` ·
`createdBy` · `scenarioCounter` (allocation atomique des numéros, même patron
que `DevProject.issueCounter`) · timestamps.

### `BetaScenario`
`campaign` · `number` · `identifier` (`BETA-12`) · `title` · `description` ·
`steps: [{ order, instruction, expected }]` · `rank` · `summaryStatus`
`NOT_TESTED|OK|KO|TO_OPTIMIZE|TO_RETEST` · `archivedAt` · timestamps.

Index unique `(campaign, number)`.

### `BetaTester`
`campaign` · `name` · `email` · `tokenHash` (SHA-256 d'un secret 256 bits ;
le secret n'est jamais persisté) · `invitedAt` · `lastSeenAt` · `revokedAt` ·
`expiresAt` · timestamps.

Index unique `(campaign, email)` et index sur `tokenHash`.

### `BetaRun`
Le verdict d'un testeur sur un scénario.

`campaign` · `scenario` · `tester` (ref `BetaTester`, nullable) · `user`
(ref `User`, nullable — un admin qui teste lui-même) · `verdict`
`WORKS|BROKEN|TO_OPTIMIZE` · `severity` `BLOCKER|MAJOR|MINOR|COSMETIC` ·
`reproducibility` `ALWAYS|SOMETIMES|ONCE` · `failedStep` · `title` · `body` ·
`context: { url, userAgent, viewportWidth, viewportHeight, isMobile }` ·
`attachments: [{ originalName, storagePath, mimeType, size, uploadedAt }]` ·
`confirmations: [ref BetaTester]` · `devIssue` (ref `DevIssue`, nullable) ·
`status` `OPEN|ACKNOWLEDGED|FIXED|REJECTED` · timestamps.

Contrainte : exactement un de `tester` / `user` est renseigné.
Index unique `(scenario, tester)` et `(scenario, user)` en partiel — un testeur
n'a qu'un run courant par scénario, qu'il révise.

### `BetaComment`
`run` · `campaign` · `authorUser` | `authorTester` · `body` · `attachments` ·
`visibleToTester` (défaut `true`) · timestamps.

### `BetaTemplate`
`name` · `description` · `scenarios: [{ title, description, steps }]` ·
`createdBy` · timestamps.

## Surfaces

### Admin — `/admin/beta`
Module RBAC `beta`, permissions `view_beta` / `manage_beta`, zone
« Contenu & outils ». Routes `/api/admin/beta/*` derrière `auth` +
`requireAdmin`, exactement comme `routes/admin/dev/`.

### Testeur — `/beta/:token`
Route React publique, hors coquille admin. API `/api/beta/:token/*`, sans JWT :
le token porte l'identité. Rate-limitée, réponses uniformes sur token invalide.

## Parcours

**Testeur.** Il ouvre son lien, voit la liste des démarches et sa progression.
Il ouvre une démarche : étapes numérotées avec résultat attendu, cases à cocher,
puis trois boutons de verdict. En cas de problème : étape fautive, description,
sévérité, reproductibilité, captures (glisser-déposer et collage `Ctrl+V`). Le
contexte technique est capturé sans lui demander. Sous le formulaire, les
problèmes déjà signalés sur ce scénario, sans leur auteur, avec « j'ai le même
souci ». Il retrouve ensuite ses retours et les réponses de l'équipe.

**Admin.** La campagne s'ouvre sur la grille de couverture (testeurs × scénarios,
une pastille par verdict), la file des retours triée par sévérité puis
confirmations, et l'avancement. Sur un retour : répondre, ouvrir une issue
pré-remplie, ou classer sans suite.

**Boucle de correction.** Quand la `DevIssue` liée passe `DONE`, le run passe
`FIXED`, le scénario bascule `TO_RETEST`, et les testeurs concernés sont
notifiés qu'il y a quelque chose à revalider.

## Sécurité

- Token testeur : 256 bits CSPRNG, stocké haché (SHA-256 suffit à cette
  entropie), comparé en temps constant. Révocation et expiration vérifiées à
  chaque requête. Réutilise le patron de `lib/projectInvitations.ts`.
- Surface testeur rate-limitée. Un token inconnu, révoqué ou expiré renvoie la
  même réponse : pas d'énumération de campagnes.
- Uploads par un non-authentifié : whitelist de types **vérifiée sur les magic
  bytes** (PNG, JPEG, WebP, GIF), SVG refusé, taille unitaire plafonnée, et
  **quota par testeur et par campagne** (nombre de fichiers + poids cumulé).
- Lecture d'image : route dédiée servant un `Content-Type` figé issu de la
  détection serveur, avec `X-Content-Type-Options: nosniff`. Les non-images
  restent servies par `serveAttachment` en flux opaque.
- Anonymisation : la sérialisation destinée au testeur ne contient jamais le
  nom, l'email ni l'identifiant d'un autre testeur.

## Tests

- Modèles : contrats d'index (patron `mongoose-index-integrity.test.ts`).
- `lib/beta/tokens` : génération, hachage, rejet des formes invalides.
- Auth testeur : token valide / révoqué / expiré / campagne close / inconnu.
- Runs : unicité par testeur et scénario, révision d'un run, « moi aussi » non
  cumulable par le même testeur.
- Anonymisation : un testeur ne peut pas lire l'identité d'un autre.
- Uploads : magic bytes, SVG refusé, quota atteint.
- Promotion : création de la `DevIssue`, lien bidirectionnel, idempotence.
- Boucle : `DevIssue` `DONE` → run `FIXED` → scénario `TO_RETEST`.
- RBAC : `view_beta` / `manage_beta` respectés sur la surface admin.

## Découpage

```
backend/src/models/Beta{Campaign,Scenario,Tester,Run,Comment,Template}.ts
backend/src/lib/beta/tokens.ts        secret, hachage, validation
backend/src/lib/beta/testerAuth.ts    middleware de résolution du testeur
backend/src/lib/beta/uploads.ts       multer + magic bytes + quota
backend/src/lib/beta/serialize.ts     vues admin et vues anonymisées
backend/src/lib/beta/summary.ts       statut de synthèse, couverture
backend/src/lib/beta/promote.ts       run → DevIssue, et retour DONE → TO_RETEST
backend/src/lib/beta/report.ts        rapport PDF (pdfkit)
backend/src/routes/admin/beta/*.ts    campagnes, scénarios, testeurs, runs, trames, rapport
backend/src/routes/beta/index.ts      surface testeur publique
src/pages/admin/beta/                 cockpit admin
src/pages/beta/                       surface testeur
```

Ordre : modèles et helpers d'abord (testables seuls), puis surface admin, puis
surface testeur, puis promotion et boucle de correction, puis rapport PDF.
