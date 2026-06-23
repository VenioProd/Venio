# Design — Monolithe Portail (pages privées)

**Date** : 2026-06-23
**Objectif** : appliquer le design « Monolithe » du site public (brutalisme suisse) aux pages
privées (admin + espace client), en remplacement du thème néon actuel.

## Décisions de cadrage

- **Profondeur** : refonte complète, écran par écran à terme — mais découpée en lots. Cette
  passe livre **Lot 0 (fondation tokens)** + **Lot 1 (chrome & primitives partagées)**.
- **Personnalisation** : Monolithe **imposé**. Le mode clair (`ThemeToggle`) et les accents
  perso (`ColorThemePicker`) sont neutralisés dans le portail.
- **Périmètre 1ʳᵉ passe** : fondation + chrome. Les écrans spécifiques (lots 2→9) basculent déjà
  visuellement via les tokens + primitives, leur réécriture fine viendra après.

## Mécanique

- Classe `theme-monolithe-portal` posée sur `<html>` pour toute route `/admin` ou
  `/espace-client` (login inclus), via `App.tsx`. Symétrique de `theme-monolithe` (public).
- Sélecteur `html.theme-monolithe-portal` volontairement plus spécifique que `[data-theme]` et
  `[data-accent]` → gagne la cascade, donc light/accents perso sont sans effet dans le portail.
- Nouveau `src/styles/monolithe-portal.css` importé dans `main.tsx` après `theme.css`.

## Contrat de design (tokens)

Sous `html.theme-monolithe-portal` :

| Token | Valeur |
|---|---|
| `--bg-primary` | `#0a0a0a` |
| `--bg-secondary` / `--bg-card` | `#141414` |
| `--bg-card-hover` | `#1c1c1c` |
| `--text-primary` / `--text-secondary` / `--text-muted` | `#ffffff` / `#9b9b9b` / `#909090` (muted relevé pour WCAG AA) |
| `--border-color` | `rgba(255,255,255,.14)` |
| `--primary` (lime) | `#ccff00` (light `#e2ff6b`, dark `#a5d400`) |
| glows / ombres / mesh | `transparent` / `none` |
| `--admin-shell-bg-base` / `--client-shell-bg-base` | `#0a0a0a`, glows → `transparent` |
| `--font-heading` / `--font-body` | `Archivo` |
| danger | `#ff5c5c` (conservé, sobre) |

## Contrat de design (formes & composants)

- **Formes** : `border-radius: 0` sur surfaces structurelles (cards, boutons, inputs, badges,
  tabs, modals). Exceptions conservées : avatars ronds (`50%`). Aucun `box-shadow`/`blur`
  décoratif ; bordures 1px nettes.
- **Typo** : titres Archivo 900 uppercase, letter-spacing négatif, **couleur pleine** (pas de
  dégradé de texte). Kickers/labels/boutons : uppercase, letter-spacing positif (~.12–.18em),
  poids 800.
- **Sidebars** : fond plat, bordure droite 1px, logo carré lime, items uppercase lettrés ;
  actif = barre lime nette à gauche + fond accent, sans glow.
- **Topbars / mobile nav** : fond plein, filet 1px, pas de blur ; indicateur actif lime net.
- **Page header** : kicker uppercase + H1 Archivo plein + filet lime net.
- **Boutons** : carrés 1px ; primaire lime/noir → hover inversion ; secondaire contour blanc ;
  danger rouge sobre.
- **Inputs/select/textarea** : fond `#141414`, 1px, focus bordure lime nette, carrés.
- **Cards/stat-cards** : carrées 1px ; stat = gros chiffre Archivo + label uppercase muted.
- **Tables** : filets 1px, en-têtes uppercase muted, hover ligne `#141414`.
- **Badges/status, tabs, modals, empty-states, messages, tooltips, breadcrumb** : carrés, 1px,
  accents lime, labels uppercase, couleurs sémantiques aplaties.

## Fichiers (Lot 0 + Lot 1)

- **Nouveau** : `src/styles/monolithe-portal.css` (tokens + overrides primitives).
- **Mécanique** : `src/main.tsx` (import), `src/App.tsx` (classe html).
- **Chrome réécrit en place** : `AdminShell.css`, `AdminSidebar.css`, `ClientShell.css`,
  `ClientSidebar.css`.
- **Masquage thème** : `AdminProfile.tsx`, `espace-client/Profile.tsx`.

## Vérification

- Rendu navigateur : `/admin/login`, `/admin` (dashboard), `/espace-client` (+ login).
- Audit adversarial : résidus néon/glow, contraste/a11y, ruptures de layout, fidélité au public.
- `npm run typecheck`, `npm run lint`, `npm test`.

## Hors scope (lots suivants)

Refonte fine des écrans : dashboards, listes, détails, formulaires, CRM, gestion, comptabilité
(28 écrans), dev-workspace, education (20 écrans), messagerie. Chacun s'appuiera sur ce contrat.
