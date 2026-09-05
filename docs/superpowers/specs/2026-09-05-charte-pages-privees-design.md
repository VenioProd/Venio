# Design — Charte des pages privées (« Console adoucie »)

**Date** : 2026-09-05
**Objectif** : donner aux pages privées (back-office et espace client) une charte unique,
tenable sur une journée de travail, et l'appliquer écran par écran en remplacement du
thème Monolithe Portail posé le 2026-06-23.

## 1. Décision de cadrage

Trois directions ont été maquettées sur la page « Suivi développement » : Console (densité
et clavier), Flux (file de traitement à trois volets), Ateliers (un espace par métier).
**La Console est retenue**, avec quatre adoucissements :

1. **Typographie Manrope** pour l'interface, **DM Mono** pour les identifiants, horodatages,
   montants et noms de branche. Archivo quitte le portail.
2. **Aucune capitale forcée** et aucun interlettrage étiré.
3. **Angles arrondis** sur tout ce qui se clique ou se pose sur le fond.
4. **Contrastes de statut désaturés** : le rouge, l'ambre et le vert perdent leur saturation
   d'alerte pure.

### L'accent ne change pas

La maquette intermédiaire proposait un accent lime `#ccff00`. **Cette proposition est
abandonnée.** L'accent reste le bleu ciel déjà en place : `monolithe-portal.css` déclare
`--primary-rgb: 14, 165, 233`, `src/lib/chartColors.ts` définit `ACCENT = '#0ea5e9'` et
`ACCENT_BRIGHT = '#38bdf8'`. Les graphiques n'en étaient jamais sortis.

Seul ajustement retenu : le portail relève sa teinte de remplissage d'un cran, de `sky-500`
à `sky-400`, pour coller à la maquette validée (voir §4). Le `lime` de `theme.css` reste ce
qu'il est aujourd'hui — une option d'accent par utilisateur, neutralisée dans le portail.

### Ce qui survit du Monolithe Portail

Le fond sombre imposé, la densité, l'absence de glow, de dégradé décoratif et d'ombre
portée, le mode clair et les accents personnalisés neutralisés dans le portail.

### Ce qui est abandonné

Archivo, les capitales, l'interlettrage positif, les angles vifs, et la bordure nette comme
unique moyen de séparer deux zones.

### Divergence avec le site public — assumée

Le site public garde Monolithe : Archivo, capitales, angles vifs. Le portail est un outil
utilisé plusieurs heures par jour, le site est une affirmation de deux minutes. La couture
se voit sur `/admin/login` et `/espace-client/login`, qui basculent côté portail.

## 2. Périmètre

**Inclus** : toutes les routes `/admin/**` (53 déclarations de route, 229 fichiers d'écran),
`/espace-client/**` (13 routes, 14 fichiers) et `/beta/:token` (espace testeur, qui ne
reçoit aujourd'hui aucun thème et doit donc s'y raccrocher).

**Exclu** : le site public, `/questionnaire/**`, les e-mails transactionnels et les rapports
PDF (jspdf), qui ont leur propre mise en page.

**Volume mesuré** : 36 feuilles de style, 33 522 lignes, 138 règles
`text-transform: uppercase`, 318 règles `border-radius: 0`, 121 couleurs hexadécimales
distinctes.

## 3. Mécanique

- Renommage `theme-monolithe-portal` → `theme-portail` et
  `src/styles/monolithe-portal.css` → `src/styles/portail.css`. Trois points de contact :
  `src/App.tsx` (pose et retrait de la classe), `src/main.tsx` (import, après `theme.css`),
  `src/styles/__tests__/themeAccentTokens.test.ts` (chemin dans la liste surveillée).
- Le sélecteur reste `html.theme-portail`, volontairement plus spécifique que `[data-theme]`
  et `[data-accent]` : le mode clair et les accents par utilisateur restent sans effet.
- Polices : ajouter Manrope et DM Mono au lien Google Fonts de `index.html` (ligne 39), à
  côté d'Archivo qui reste chargé pour le public. Les `preconnect` existent déjà.
  `family=Manrope:wght@400;500;600;700;800&family=DM+Mono:wght@400;500`
- Les jetons de police existants sont réutilisés tels quels, sans nouveau nom :
  `--font-heading` et `--font-body` pointent tous deux sur Manrope dans le portail, et un
  seul jeton est ajouté, `--font-mono`.

## 4. Contrat de jetons

Tous déclarés sous `html.theme-portail`. **Aucune valeur bleue en dur** : le test
`themeAccentTokens` interdit déjà `#0ea5e9`, `#7dd3fc`, `#0284c7`, `#38bdf8` et `#22d3ee`
dans ces feuilles. L'accent passe donc exclusivement par les triplets RGB.

### Fonds et filets

| Jeton | Valeur | Emploi |
| --- | --- | --- |
| `--bg-primary` | `#0a0c0f` | fond d'application |
| `--bg-card` / `--bg-secondary` | `#141a20` | cartes, panneaux, champs |
| `--bg-card-hover` | `#1b242c` | survol, touches clavier, segment actif |
| `--surface-raised` | `#202a33` | avatars neutres, barres inactives |
| `--border-color` | `rgba(224,238,247,.09)` | filet standard |
| `--line-strong` | `rgba(224,238,247,.16)` | contour de bouton secondaire |

### Encres — contrastes mesurés sur `#0a0c0f`

| Jeton | Valeur | Contraste | Emploi |
| --- | --- | --- | --- |
| `--text-primary` | `#e8eef3` | 16,8:1 | titres, valeurs, texte de liste |
| `--text-secondary` | `#9daab3` | 8,2:1 | texte de soutien |
| `--text-muted` | `#7b8894` | 5,4:1 | libellés, méta, horodatages |

`--text-muted` est **relevé** par rapport à la maquette (`#6b7883`, 4,3:1), qui passait sous
le seuil AA pour du texte de 11,5 px.

### Accent

| Jeton | Valeur | Emploi |
| --- | --- | --- |
| `--primary-rgb` | `56, 189, 248` | remplissages : bouton primaire, filtre actif, logo, barre d'élément actif |
| `--primary-light-rgb` | `125, 211, 252` | texte et icônes accentués sur fond sombre (11,8:1) |
| `--primary-dark-rgb` | `14, 165, 233` | survol et pression du bouton primaire |
| `--primary-fg` | `#06202b` | texte posé sur un aplat d'accent (7,9:1) |
| `--accent-surface` | `rgba(var(--primary-rgb), .09)` | ligne de liste sélectionnée, zone active du rail |
| `--accent-medium` | `rgba(var(--primary-rgb), .14)` | bouton doux, icône de rail active |
| `--accent-border` | `rgba(var(--primary-rgb), .34)` | contour de bouton doux |
| `--accent-ring` | `rgba(var(--primary-rgb), .55)` | anneau de focus |

Le passage de `14, 165, 233` à `56, 189, 248` sur `--primary-rgb` est le seul changement de
couleur de la charte. Il est local au portail : `theme.css` n'est pas touché.

### Statut — désaturés

| Jeton | Avant | Après |
| --- | --- | --- |
| `--critical` | `#ef4444` | `#ff8a8a` |
| `--serious` | `#f97316` | `#f4a06a` |
| `--warning` | `#f59e0b` | `#f7c268` |
| `--good` | `#22c55e` | `#7fdba0` |

Ces quatre-là restent réservés à l'état. Ils ne servent jamais de série de graphique et ne
sont jamais employés seuls : toujours accompagnés d'une icône ou d'un libellé.

### Rayons

| Jeton | Valeur | Emploi |
| --- | --- | --- |
| `--r-sm` | `6px` | touches clavier, mini-badges, cases à cocher |
| `--r-md` | `10px` | boutons, champs, sélecteurs, lignes de liste |
| `--r-lg` | `13px` | cartes, panneaux, bandeaux, modales |
| `--r-pill` | `999px` | filtres, vues rapides, étiquettes de type |
| — | `50%` | avatars, pastilles de statut |

### Typographie

| Jeton | Valeur |
| --- | --- |
| `--font-heading` / `--font-body` | `'Manrope', 'Cabinet Grotesk', sans-serif` |
| `--font-mono` | `'DM Mono', ui-monospace, monospace` |

Échelle, en pixels et en graisse :

| Rôle | Taille | Graisse | Interlettrage |
| --- | --- | --- | --- |
| Titre de page | 26 | 800 | −0,025 em |
| Titre de panneau ou de section | 17 | 800 | −0,02 em |
| Sous-titre, chiffre de carte | 25 | 800 | −0,03 em |
| Ligne de liste, corps | 12,5 | 500 | 0 |
| Bouton | 12 | 700 | 0 |
| Libellé, méta | 11,5 | 600 | 0 |
| Identifiant, horodatage, montant | 11,5 | 400 (DM Mono) | 0 |

Les chiffres qui s'alignent en colonne portent `font-variant-numeric: tabular-nums`.

## 5. Contrat de composants

| Composant | Contrat |
| --- | --- |
| Bouton primaire | aplat `--primary`, texte `--primary-fg`, rayon `--r-md`, 7×13 px, graisse 700 |
| Bouton secondaire | fond transparent, filet `--line-strong`, texte `--text-primary` |
| Bouton doux | fond `--accent-medium`, filet `--accent-border`, texte `--primary-light` |
| Bouton danger | fond `rgba(255,138,138,.10)`, filet `rgba(255,138,138,.32)`, texte `--critical` |
| Bouton fantôme | sans filet, texte `--text-secondary` |
| Bouton compact | 5×10 px, 11,5 px, rayon `--r-sm` |
| Vue rapide, filtre | gélule, 5×13 px ; actif = aplat d'accent ; « + filtre » en filet pointillé |
| Segmenté (liste/kanban) | conteneur `--bg-card` rayon `--r-md`, segment actif `--bg-card-hover` rayon `--r-sm` |
| Champ, sélecteur | fond `--bg-card`, filet `--border-color`, rayon `--r-md`, focus = anneau `--accent-ring` |
| Ligne de commande | 460×34 px, rayon `--r-md`, icône de recherche à gauche, touche `⌘K` à droite |
| Carte, panneau, bandeau | fond `--bg-card`, filet `rgba(224,238,247,.07)`, rayon `--r-lg` |
| Bandeau d'alerte | fond de statut à 7 %, filet de statut à 26 %, rayon `--r-lg` |
| Ligne de liste | rayon `--r-md`, marge horizontale 12 px, sélection = `--accent-surface` + trait interne 3 px |
| En-tête de groupe | pastille de statut + libellé 12 px graisse 600 + compteur `--text-muted` |
| Étiquette de type | gélule, fond `color-mix(in srgb, <teinte> 15%, var(--bg-primary))`, texte de la teinte |
| Pastille de statut | cercle 9 px, contour 1,5 px ; plein quand l'état est terminal |
| Avatar | cercle, aplat d'accent + initiales `--primary-fg` ; non assigné = filet pointillé |
| Touche clavier | fond `--bg-card-hover`, rayon `--r-sm`, texte `--text-secondary` |
| Panneau de détail | filet gauche, fond `#0d1115`, propriétés en paires libellé/valeur séparées par un filet |
| Tableau | filets horizontaux uniquement, en-tête `--text-muted` graisse 600, survol de ligne `--bg-card` |
| Modale | rayon `--r-lg`, filet `--border-color`, voile `rgba(0,0,0,.6)` sans flou décoratif |
| État vide | icône `--text-muted`, phrase en casse normale, action primaire en dessous |
| Barre latérale | fond `--bg-primary`, filet droit, élément actif = `--accent-surface` + trait 3 px arrondi |

## 6. Règles mécaniques de migration

1. Aucune règle `text-transform: uppercase` dans le portail. Les libellés qui perdent leur
   capitalisation gagnent `font-weight: 600` et `color: var(--text-muted)` — c'est la
   graisse et la couleur qui portent la hiérarchie, plus la casse.
2. `letter-spacing` positif interdit. Le négatif est réservé aux titres de 17 px et plus.
3. Aucun `border-radius: 0` : tout passe par l'échelle de la §4.
4. Aucune couleur en dur : les 121 hexadécimaux distincts se réduisent à la palette de jetons.
5. Une séparation se fait par un fond **ou** par un filet, jamais les deux.
6. Les icônes de rail et de barre latérale perdent leurs libellés en capitales au profit
   d'icônes `lucide-react` avec un `title` et un `aria-label`.

## 7. Lots

| Lot | Contenu | Fichiers principaux | Terminé quand |
| --- | --- | --- | --- |
| 0 | Fondation : renommage, jetons, polices, primitives partagées | `portail.css` (719 l.), `index.html`, `App.tsx`, `main.tsx` | tous les écrans changent d'aspect sans casse de mise en page ; `typecheck`, `lint` et `test:all` verts |
| 1 | Coque | `AdminShell.css`, `AdminSidebar.css`, `ClientShell.css`, `ClientSidebar.css`, `Breadcrumb.css`, `AdminCommandPalette.css` | navigation, palette, fil d'Ariane et barre mobile conformes ; `test:admin-accessibility` vert |
| 2 | Écran pilote : suivi développement | `DevWorkspace.css` (3 112 l.), `DevProjectCockpit.css` (1 891 l.), `ReviewQueue.css`, `RecommendationsPanel.css` | l'écran est superposable à la maquette ; `TYPE_COLOR` corrigé (voir §8) |
| 3 | Tableaux de bord | `dashboard.css`, `MonEspace.css`, `AdminDashboard`, `SuperAdminDashboard`, `analytics` | graphes sur `ACCENT` et `CHART_CATEGORICAL`, aucune couleur de statut employée comme série |
| 4 | Socle admin, en quatre passes : listes et tableaux, puis formulaires, puis fiches et panneaux, puis modales, toasts et états vides | `AdminPortal.css` (9 517 l.) | chaque passe close indépendamment |
| 5 | CRM et gestion | `crm-board`, `gestion.css` (1 711 l.), `task-board.css`, `calendar.css`, `activity-timeline.css` | |
| 6 | Finance et conformité | comptabilité, Qualiopi, audit, `RevenueChain.css` | |
| 7 | Messagerie | `Messaging.css` (2 537 l.), `project-chat.css` | |
| 8 | Espace client | `ClientPortal.css` (1 961 l.), facturation, documents, demandes, guide, proposition de devis | |
| 9 | Surfaces annexes | `Beta.css`, `BetaTester.css`, `EducationWorkspace.css` (1 969 l.), `notifications.css`, `search-modal.css`, `file-dropzone.css` | l'espace testeur reçoit enfin un thème |

Les lots 0 à 2 forment la première livraison : ils suffisent à juger la charte sur un écran
réel. Les suivants sont interchangeables dans l'ordre.

## 8. Graphiques et couleurs de données

`src/lib/chartColors.ts` n'est pas modifié. Les règles qu'il porte déjà restent la loi :

- `ACCENT` (`#0ea5e9`) sert à l'identité et à la série unique mise en avant.
- `CHART_CATEGORICAL` sert aux séries multiples, dans son ordre fixe, sans cycler.
- `STATUS` ne devient jamais une série.

Deux points de vigilance :

1. `CHART_CATEGORICAL[0]` vaut `#0284c7`, très proche de l'accent. Ne pas mêler dans un même
   graphique une série d'accent et la première série catégorielle.
2. `TYPE_COLOR` dans `src/services/dev.ts` attribue **la même couleur `#22c55e` à `FEATURE`
   et à `DEPLOY`**, et emploie des teintes saturées d'alerte pour des types qui ne sont pas
   des alertes. Palette douce proposée, à trancher au lot 2 :
   `FEATURE #7dd3fc`, `BUG #ff8a8a`, `SECURITY #f0a3c8`, `DEPLOY #f7c268`, `DOC #c9b8e8`,
   `CHORE`, `TASK`, `REFACTOR`, `CI` en neutres `#93a1ab`.

Le style « timeline financière » (aire, volume, réticule, sélecteur de période) reste la
référence pour les graphiques de pilotage.

## 9. Accessibilité

- Contrastes : tous les couples texte/fond de la §4 sont au-dessus de 4,5:1, y compris les
  libellés de 11,5 px.
- Focus : anneau de 2 px en `--accent-ring`, décalage de 2 px, rayon aligné sur celui du
  composant. Les 19 règles `focus-visible` existantes servent de base, à généraliser.
- Mouvement : 9 règles `prefers-reduced-motion` existent ; toute transition ajoutée doit y
  être neutralisée.
- Cibles tactiles : le minimum de 44 px sur mobile est conservé, y compris sur les gélules
  de filtre qui sont visuellement plus fines.
- Les couleurs de statut ne portent jamais seules le sens : icône ou libellé obligatoire.

## 10. Garde-fous automatisés

Un nouveau test `src/styles/__tests__/portalStyleContract.test.ts`, sur le modèle de
`themeAccentTokens.test.ts`, échoue si l'une des 36 feuilles du portail contient :

- une règle `text-transform: uppercase` ;
- un `border-radius: 0` ;
- une famille de police autre que `var(--font-heading)`, `var(--font-body)` ou `var(--font-mono)` ;
- un hexadécimal absent de la palette de la §4.

Une liste d'exceptions (`portal-style-allowlist.json`) recense au départ les fichiers non
encore migrés et se vide lot après lot. Le test fait partie de `npm test`, donc de la CI,
sans nouveau script npm. La liste surveillée de `themeAccentTokens.test.ts` est étendue aux
mêmes 36 fichiers.

## 11. Vérification

- `npm run typecheck:all`, `npm run lint`, `npm run test:all`.
- `npm run test:admin-accessibility` après le lot 1.
- `npm run test:public` à chaque lot : le site public ne doit pas bouger d'un pixel, c'est le
  filet de sécurité de la divergence assumée en §1.
- Revue navigateur, par lot, d'une liste d'écrans fixée à l'avance, en 1440 px et en 390 px.

## 12. Décisions ouvertes

1. Auto-héberger Manrope et DM Mono comme Cabinet Grotesk, ou rester sur Google Fonts comme
   Archivo et Satoshi ? Question de performance et de durcissement CSP, pas de style.
2. Rouvrir un mode clair du portail plus tard ? La charte est écrite en sombre d'abord, mais
   les jetons sont structurés pour accueillir un miroir clair sans réécriture.
3. Palette des types d'issue (§8) : à valider au lot 2.
4. Le rail de navigation passe d'un panneau de 200 px à un rail d'icônes de 52 px dans la
   maquette. Ce changement d'information est **hors charte** : il relève de la piste Console
   complète, pas du style. À trancher séparément.

## 13. Hors scope

La refonte fonctionnelle esquissée dans les trois pistes — file de traitement universelle,
fil du projet côté client, ateliers par métier — n'est pas couverte ici. Chacune fera sa
propre spécification. Le site public, les e-mails et les PDF ne sont pas touchés.
