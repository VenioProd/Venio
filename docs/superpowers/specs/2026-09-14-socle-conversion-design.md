# Design — Socle de conversion du site public (lot 1)

**Date** : 2026-09-14
**Ticket** : VENIO-139
**Objectif** : donner au site public les mécanismes de conversion qui lui manquent — un
bandeau de preuve, un double appel à l'action, une barre flottante, une ligne de
réassurance et une FAQ — sans toucher à la voix Venio ni au thème Monolithe.

## 1. Cadrage

L'inspiration est le **système** d'une agence concurrente (preuve immédiate, friction
retirée, une page par expertise, FAQ), pas son esthétique. Venio avait le positionnement
et aucun de ces mécanismes : la home n'a **aucun CTA avant son pied de page**
(`src/pages/Home.tsx:326`), et rien n'accompagne le visiteur qui hésite.

Le lot 1 pose le socle. Les lots suivants (pages offres, prix planchers, preuve chiffrée,
ancrage local) s'appuieront dessus.

### Arbitrages du 14/09/2026 qui contraignent ce lot

| Décision | Conséquence directe |
|---|---|
| **Pas de téléphone public** | Aucun CTA « Appeler ». La barre flottante est Réserver / Être rappelé. Aucun `telephone` dans le JSON-LD. |
| **Zéro mention d'IA** | Purge des 9 occurrences publiques (`Legal.tsx:56-57`, `CGV.tsx:41-42`, `StructuredData.tsx:112`, composant mort `Expertises.tsx`). |
| **H1 home géo-ancré** | « Sites web et plateformes sur mesure, à Paris. » La promesse descend en sous-titre. |
| **Pas de page équipe** | Aucun visage, aucun nom. La preuve repose sur les engagements et, plus tard, les résultats chiffrés. |
| **Réservation maison** | Aucun outil tiers. Deux modales Venio sur `POST /api/contact`. |
| **Prix « à partir de »** | **Hors lot 1** — traité au lot 3 avec les montants fournis. |

### Ce que le lot 1 ne fait pas

Les pages offres, la grille tarifaire chiffrée, les fiches projets, les témoignages, la
page `/agence-web-paris` et le blog. Aucun chiffre inventé : tant que le lot 0 de données
n'est pas fourni, le socle ne contient **aucune statistique**.

## 2. Écarts entre le brief et le code réel

Trois prémisses du brief étaient fausses. Elles sont corrigées ici pour que personne ne
reparte dessus.

1. **EmailJS n'existe plus.** Le commit `9050481` a supprimé `@emailjs/browser`, les
   variables `VITE_EMAILJS_*` et a détaché `MathCaptcha` (aujourd'hui orphelin). Le
   formulaire passe par `apiFetch('/api/contact')` avec honeypot `website`, `startedAt` et
   `consent` (`src/pages/Contact.tsx:60-73`). C'est ce mécanisme que les modales reprennent.
2. **`ServicePageMono.tsx` n'existe pas.** Les trois gabarits publics sont `.mh-home`
   (`monolithe-home.css`), `.mp-page` (`monolithe-pages.css`) et `.ms-page`
   (`monolithe-sites.css`), avec des tokens locaux cloisonnés et des `max-width` divergentes
   (1240 / 1400 / 1400).
3. **Le H1 actuel** est « Un site fait pour vous. Pas pour tout le monde. », pas la
   formulation adoucie de la maquette v2.

## 3. Architecture

### 3.1 Un socle autonome en tokens

Les tokens `--mh-*`, `--mp-*` et `--ms-*` sont invisibles hors de leur conteneur. Un
composant partagé qui les consommerait s'effondrerait sur deux gabarits sur trois, et la
barre flottante — montée hors de tout gabarit — n'en verrait aucun.

**Règle** : le socle ne lit que les tokens globaux de `theme-monolithe.css`
(`--bg-primary`, `--bg-secondary`, `--border-color`, `--text-primary/secondary/muted`,
`--primary`, `rgba(var(--primary-rgb), …)`, `--accent-soft`, `--accent-surface`,
`--font-heading`) et ses propres tokens `--mc-*`, déclarés dans
`src/styles/monolithe-socle.css` sous `html.theme-monolithe`.

Préfixe de classe : **`mc-`** (mono / conversion), cohérent avec `mh-` / `mp-` / `ms-`.

### 3.2 Rayons — nouvelle charte publique

La v2 validée demande des angles adoucis. L'état actuel est 8 px / 5 px sur la home et 0
partout ailleurs, avec quatre `border-radius: 0` défensifs dans `monolithe-sites.css`.
Trois tokens sont posés dans `theme-monolithe.css` et consommés partout :

```
--r-btn:  10px   /* boutons, champs */
--r-card: 14px   /* cartes, encarts, modales */
--r-pill: 999px  /* gélules, filtres, badges */
```

`--mh-r` et `--mh-r-node` sont remappés dessus, `.mp-btn` / `.mp-filter` / `.ms-cta-go` en
héritent, et les quatre `border-radius: 0` sont retirés. Le brutalisme survit dans la
grille, la typo et les filets — pas dans les angles vifs.

### 3.3 Composants

| Composant | Rôle | Monté où |
|---|---|---|
| `PublicModal` | Primitive de dialogue publique : portail, focus trap, Échap, scroll lock, `role="dialog"` | À la demande |
| `ProofBar` | Bandeau de 4 engagements sous le hero | Home, `/services/sites`, `/au-dela-du-site` |
| `DualCta` | « Réserver 30 minutes » + « Être rappelé » | Hero de la home, bas des pages offres |
| `TrustLine` | « Sans engagement · Réponse sous 48 h ouvrées · Devis écrit » | Sous chaque `DualCta` |
| `StickyCta` | Barre flottante persistante, apparaît après le premier écran | `App.tsx`, sous `isPublicSite` |
| `Faq` | Accordéon + JSON-LD `FAQPage` | Home (6 questions) |

Il n'existe **aucune primitive de modale publique** : `ConfirmModal` et `PromptModal` sont
admin de sémantique et de style. En revanche `src/hooks/useModalA11y.ts:23-74` fournit déjà
le focus trap, l'`inert` sur `#root` et la restauration du focus — `PublicModal` le
réutilise et ajoute Échap et le scroll lock, que le hook ne gère pas.

### 3.4 Les deux modales

Les deux tapent `POST /api/contact` et se distinguent par `subject`, qui est stocké dans
`Lead.serviceType` et remonte donc dans le CRM.

| | Réserver 30 minutes | Être rappelé |
|---|---|---|
| `subject` | `Réservation 30 minutes` | `Demande de rappel` |
| Champs | Prénom, Nom, Email, Créneau souhaité (texte libre) | Prénom, Nom, Email, Téléphone |
| `message` | Le créneau, préfixé « Créneau souhaité : » | « Demande de rappel. » + créneau si fourni |
| Consentement | Case obligatoire, même libellé que Contact | idem |

**Le téléphone devient un champ de premier ordre.** Le contrat backend n'en a pas
(`backend/src/lib/publicContact.ts`, `backend/src/models/Lead.ts`) : plutôt que de le noyer
dans le `message`, on ajoute `phone` — optionnel, normalisé NFKC, longueur bornée, jamais
requis. Une demande de rappel sans numéro structuré serait invendable côté CRM.

L'email reste requis dans les deux cas : il porte l'accusé de réception SMTP.

**Pièges backend à respecter** : `startedAt` est posé au montage de la modale (le serveur
rejette toute soumission < 1,5 s), le honeypot `website` est conservé avec son
`aria-hidden` + `tabIndex={-1}`, et le rate-limit de 5 requêtes / 15 min par IP est
**partagé** avec la page Contact.

**Analytics** : aucun nouvel événement. Les modales réutilisent `contact_form_started`,
`contact_form_submitted`, `contact_form_succeeded`, `contact_form_failed` en passant le
`cta` pour se distinguer (`booking_modal` / `callback_modal`), et chaque bouton porte un
`data-analytics-cta` capté par le listener global de `PublicAnalytics.tsx:17-27`. Les deux
énumérations (front `src/lib/publicAnalytics.ts`, backend `DailyPublicMetric.ts`) restent
intactes.

### 3.5 Le hero de la home

Le hero devient un lieu d'action. Les trois repères `mh-cotes` quittent le hero : ils
disaient déjà ce que dit le `ProofBar`, en moins complet.

```
eyebrow : Venio — studio web à Paris
H1      : Sites web et plateformes sur mesure, à Paris.
sous-titre : Faits pour vous, et qui vous ressemblent. On dessine et on code votre site
             à partir de ce que vous avez à dire. Pas à partir d'un modèle acheté dans
             lequel on glisserait vos textes.
DualCta + TrustLine
```

Puis, juste après `</section>` du hero, le `ProofBar` — l'emplacement hérite
automatiquement du filet de séparation (`monolithe-home.css:49-53`).

Les quatre engagements, repris des repères existants et élargis, **sans aucun chiffre** :

```
01 Le design    — Dessiné pour vous
02 Le code      — Il vous appartient
03 Vos demandes — Rien n'est bloqué
04 La réponse   — Sous 48 h ouvrées
```

### 3.6 La barre flottante

Montée dans `App.tsx` juste après `<CookieConsent />`, sous le prédicat `isPublicSite`
(`App.tsx:168`) qui garantit déjà l'isolation admin / espace-client / questionnaire / beta.

Trois contraintes de superposition : `z-index` de 900 (sous la navbar à 1000 et ses menus à
10000), **masquée tant que le bandeau cookies est affiché** (celui-ci est à 9998 et occupe
le même bas d'écran), et compensation d'un `padding-bottom` global sur le footer pour ne
pas manger la fin de page. Elle n'apparaît qu'après le premier écran (`IntersectionObserver`
sur une sentinelle, ou seuil de scroll) pour ne pas doubler le `DualCta` du hero.

Elle ne s'affiche pas pour un admin connecté qui navigue sur la vitrine
(`PublicHeader.tsx:16-23` fournit le test).

### 3.7 La FAQ et son JSON-LD

Six questions sur la home, dans `src/content/faq.ts` — source unique. Accordéon natif
`<details>`/`<summary>` : accessible par défaut, ouvrable sans JS, et le validateur statique
exige de toute façon un nom accessible sur chaque `<button>`
(`scripts/validate-public-recipe.js:47-51`).

Le JSON-LD `FAQPage` est injecté **au runtime** via `StructuredData.tsx`, pas dans le
prérendu : `scripts/validate-prerender.js:34-44` impose **exactement un**
`<script type="application/ld+json">` dans le HTML statique. Injecter la FAQ là ferait
passer à deux et casserait `npm run validate:seo`.

> **Dette assumée** : les crawlers qui n'exécutent pas JS ne verront pas le `FAQPage`.
> Le correctif propre — fusionner toutes les entités dans un `@graph` unique au prérendu
> (`scripts/generate-prerender.js:47-53`) — est un chantier à part, hors lot 1.

Les titres de la FAQ sont des `h2`/`h3` : `e2e/public-site.spec.ts` et
`validate-public-recipe.js:41` exigent **un seul `h1`** par page.

## 4. Verrous de test à respecter

Ce chantier passe à travers un champ de mines. Chaque verrou, et ce qui le déclenche :

| Test | Ce qu'il exige | Piège |
|---|---|---|
| `src/test/prerenderRoutes.test.ts:92` | Le `h1` de `scripts/public-routes.js` doit se retrouver dans le source de la page | **Modifier `Home.tsx` sans modifier `public-routes.js` casse immédiatement.** Les dérogations sont plafonnées à 3 et déjà à 2. |
| `src/styles/__tests__/themeAccentTokens.test.ts:56` | Aucun bleu Venio en dur dans 21 CSS listés | Le nouveau `monolithe-socle.css` doit y être **ajouté**, et n'utiliser que `var(--primary)` / `rgba(var(--primary-rgb), …)`. |
| `src/styles/__tests__/neutralRampTokens.test.ts:66` | Aucun hex slate dans **tous** les `src/**/*.css` | Un `#64748b` dans un CSS de socle casse le test. |
| `scripts/validate-prerender.js:34` | Exactement un `ld+json`, un `title`, un `canonical`, un `og:title` | Voir §3.7. |
| `scripts/validate-public-recipe.js` | Un seul `h1`, tout `<button>` nommé, tout `<img>` avec `alt`, JS ≤ 450 Ko gz / CSS ≤ 100 Ko gz | La croix de fermeture des modales a besoin d'un `aria-label`. |
| `e2e/public-site.spec.ts:20-49` | Champs Contact nommés `Prénom` / `Nom` / `Email` / `Votre message`, bouton `Demander l'appel` | **Les modales ne doivent être montées que lorsqu'elles sont ouvertes**, sinon des champs homonymes cassent les sélecteurs `exact`. |
| `src/test/servicesSites.test.tsx:41` | Au moins un « Sur devis » exact, suffixe « /mois HT » | Concerne le lot 3, à ne pas casser par ricochet. |
| `backend/src/__tests__/public-contact.test.ts` | Honeypot, consentement, `too_fast`, rate-limit | L'ajout de `phone` doit laisser ces quatre comportements intacts. |

## 5. Vérification

```
npm run typecheck && npm run lint && npm run test && npm run test:public
npm --prefix backend test
```

Puis vérification visuelle en navigateur, desktop et mobile (390 px) : home, une page
`.mp-page`, `/services/sites` — ouverture des deux modales, parcours au clavier
(Tab / Shift+Tab / Échap), et absence de la barre flottante sur `/admin`.

## 6. Découpage d'exécution

| Chantier | Périmètre | Fichiers propres |
|---|---|---|
| Fondations | Tokens de rayon, feuille de socle, harmonisation des gabarits | `theme-monolithe.css`, `monolithe-socle.css`, les 3 CSS de gabarit |
| A — Modales | `PublicModal`, les deux formulaires, `phone` backend | `PublicModal.*`, `BookingModal.*`, `CallbackModal.*`, `publicContact.ts`, `Lead.ts` |
| B — Socle visuel | `ProofBar`, `DualCta`, `TrustLine`, `StickyCta`, montage | `ProofBar.*`, `DualCta.*`, `TrustLine.*`, `StickyCta.*`, `App.tsx` |
| C — FAQ & contenu | `Faq`, JSON-LD, H1, purge IA, title dupliqué | `Faq.*`, `faq.ts`, `StructuredData.tsx`, `public-routes.js`, `Legal/CGV` |

Les chantiers A, B et C n'écrivent dans aucun fichier commun. L'inscription du CSS de socle
dans `themeAccentTokens.test.ts` et l'intégration finale dans `Home.tsx` sont faites à part,
après reprise des trois.
