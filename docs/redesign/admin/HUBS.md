# Hubs admin — contrat d’intégration

Les hubs assemblent les composants existants, chargés avec `lazyWithRetry`. Les droits et rôles restent ceux de `rbac-matrix.json`, via `isNavigationItemVisible`. Une URL d’onglet interdit se replie sur le premier onglet autorisé ; un hub sans onglet autorisé revient à l’accueil. Les deux sous-sections Intégrations sont aussi filtrées séparément.

Le détail de ce chantier suit la demande : Analytics garde **Projets & site** dans un onglet (la page Analytics possède ses vues internes), Projets ajoute **Plateformes**, Demandes garde provisoirement deux onglets.

## Titres enfants en double

Chaque panneau porte **`.admin-hub-panel`**, avec `data-hub-tab="<slug>"`. Cette classe constitue le contexte à utiliser lors de la refonte des pages enfants. Aucun titre enfant n’est supprimé ou masqué par ce chantier.

Dans la feuille de la page concernée, cibler précisément son titre, par exemple :

```css
.admin-hub-panel .ma-page__titre-principal {
  display: none;
}
```

Ne pas masquer tous les `h1`, `h2` ni le bloc d’en-tête complet : des actions ou des titres de sous-sections pourraient disparaître. L’en-tête du hub est hors de `.admin-hub-panel`. Pour Intégrations, garder les deux titres de sous-sections « Agents API » et « Webhooks » du hub et cibler les titres propres aux composants enfants.

## Primitives

`PageHeader` accepte `eyebrow`, `title`, `subtitle`, `actions` et `tabs`. `HubTabs` reçoit une liste `{ id, label, to, count?, allowed?, content }` ; `allowed` vient de la politique du module d’origine, et vaut `false` pour un onglet interdit. Son enfant fonctionnel permet de placer le tablist dans le slot de `PageHeader`.

Les onglets suivent l’URL (y compris précédent/suivant), gardent query string et fragment, et relient les tabs et tabpanels par leurs identifiants ARIA. Flèches gauche/droite avec bouclage, Home/End, Entrée/Espace et focus unique au clavier. Seul le contenu actif est monté. Sur petit écran, seule la barre défile horizontalement ; le focus utilise `preventScroll` et App conserve le scroll entre onglets du même hub.

Accueil enveloppe MonEspace sans le réécrire et insère `DecisionsDigest` une seule fois. Le digest reprend `GET /api/admin/decisions?status=PENDING`, utilisé par DecisionsList, avec chargement, état vide, erreur et relance. La liste complète reste `/admin/decisions`.

## Redirections

Toutes les redirections utilisent `Navigate replace`, conservent la query string et le fragment. Arrow conserve `project=ARROW` par défaut ; une valeur déjà présente dans l’URL prime. Les routes de détail et de création restent à leurs adresses d’origine.

| Ancienne URL | Nouvelle URL |
| --- | --- |
| `/admin/dashboard` | `/admin/analytics/business` |
| `/admin/centre-activite` | `/admin/inbox/activite` |
| `/admin/messages` | `/admin/inbox/conversations` |
| `/admin/comptes-clients` | `/admin/crm/comptes` |
| `/admin/commerciaux-externes` | `/admin/crm/partenaires` |
| `/admin/gestion` | `/admin/projets/clients` |
| `/admin/stagiaires` | `/admin/equipe/membres` |
| `/admin/emails` | `/admin/inbox/envoi-groupe` |
| `/admin/templates` | `/admin/projets/modeles` |
| `/admin/acces-outils` | `/admin/equipe/acces-outils` |
| `/admin/mes-rapports` | `/admin/analytics/rapports` |
| `/admin/analytics` | `/admin/analytics/projets` |
| `/admin/qualiopi` | `/admin/formation/qualiopi` |
| `/admin/tickets` | `/admin/demandes/equipe` |
| `/admin/demandes-clients` | `/admin/demandes/clients` |
| `/admin/audit` | `/admin/systeme/audit` |
| `/admin/projets-internes` | `/admin/projets/internes` |
| `/admin/dev` | `/admin/dev/workspace` |
| `/admin/beta` | `/admin/dev/recette` |
| `/admin/education` | `/admin/formation/pedagogie` |
| `/admin/filiales` | `/admin/projets/plateformes` |
| `/admin/comptes-admin` | `/admin/equipe/comptes` |
| `/admin/agents` | `/admin/systeme/integrations` |
| `/admin/health` | `/admin/systeme/sante` |
| `/admin/webhooks` | `/admin/systeme/integrations` |
| `/admin/projects` | `/admin/projets/clients` |
| `/admin/arrow-prospection` | `/admin/crm?project=ARROW` |

`/admin/crm` reste l’adresse du pipeline. `/admin/crm/pipeline` est un alias explicite vers cette adresse. `/admin` et `/admin/mon-espace` rendent Accueil. Les bases `/admin/inbox`, `/admin/projets`, `/admin/demandes`, `/admin/equipe`, `/admin/formation` et `/admin/systeme` choisissent le premier onglet autorisé.

## Reprise par les autres chantiers

Les fichiers réservés `AdminShell*`, `AdminSidebar*`, `AutoBreadcrumb.tsx`, `AdminPortal.css` et `portail.css` n’ont pas été modifiés. Les liens historiques codés en dur dans AdminSidebar (filiales, dashboard) et AutoBreadcrumb continuent à fonctionner grâce aux redirections ; leur remplacement direct reste au chantier shell. Les 13 destinations de navigation et celles de la palette sont mises à jour dans `adminNavigation.ts`.

La personne qui refait les pages peut maintenant masquer les titres doublons sous `.admin-hub-panel`, ajuster leurs espacements et réaliser la vraie file unique Demandes lors de son chantier dédié.

## Fichiers de ce chantier

Les modifications des pages existantes se limitent aux destinations des liens de liste et à la comparaison du chemin racine dans DevWorkspace. Les composants de contenu ne sont pas réécrits.

Créés :

- `docs/redesign/admin/HUBS.md`
- `src/components/admin/DecisionsDigest.test.tsx`
- `src/components/admin/DecisionsDigest.tsx`
- `src/components/admin/LegacyAdminRedirect.tsx`
- `src/components/admin/ui/AdminHub.css`
- `src/components/admin/ui/AdminHub.test.tsx`
- `src/components/admin/ui/HubTabs.tsx`
- `src/components/admin/ui/PageHeader.tsx`
- `src/lib/adminHubRoutes.ts`
- `src/lib/adminHubs.ts`
- `src/pages/admin/hubs/AccueilHub.tsx`
- `src/pages/admin/hubs/AdminHub.tsx`
- `src/pages/admin/hubs/AnalyticsHub.tsx`
- `src/pages/admin/hubs/CrmHub.tsx`
- `src/pages/admin/hubs/DemandesHub.tsx`
- `src/pages/admin/hubs/DevHub.tsx`
- `src/pages/admin/hubs/EquipeHub.tsx`
- `src/pages/admin/hubs/FormationHub.tsx`
- `src/pages/admin/hubs/Hubs.routing.test.tsx`
- `src/pages/admin/hubs/InboxHub.tsx`
- `src/pages/admin/hubs/ProjetsHub.tsx`
- `src/pages/admin/hubs/SystemeHub.tsx`

Modifiés :

- `src/App.tsx`
- `src/lib/adminNavigation.ts`
- `src/styles/__tests__/portalStyleContract.test.ts`
- `src/test/ambianceWidgets.test.tsx`
- `src/components/Navbar.tsx`
- `src/components/AdminSidebar.changeRequests.test.tsx`
- `src/components/AdminSidebar.test.tsx`
- `src/lib/__tests__/adminNavigation.test.ts`
- `src/pages/admin/SubsidiaryList.tsx`
- `src/pages/admin/ClientAccountNew.tsx`
- `src/pages/admin/AdminEdit.tsx`
- `src/pages/admin/SuperAdminDashboard.tsx`
- `src/pages/admin/InternalProjectDetail.tsx`
- `src/pages/admin/SubsidiaryDetail.tsx`
- `src/pages/admin/AdminNew.tsx`
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/admin/beta/CampaignCockpit.tsx`
- `src/pages/admin/mon-espace/widgets/AmbianceWidgets.tsx`
- `src/pages/admin/mon-espace/widgets/CrossSpaceWidgets.tsx`
- `src/pages/admin/mon-espace/widgets/TaskListWidget.tsx`
- `src/pages/admin/client-detail/index.tsx`
- `src/pages/admin/change-requests/ChangeRequestDetail.tsx`
- `src/pages/admin/dev-workspace/index.tsx`
- `src/pages/admin/dev-workspace/DevProjectCockpit.tsx`
- `src/pages/admin/intern-detail/index.tsx`
- `src/pages/admin/internal-project-detail/MissionsTab.tsx`
- `src/lib/__tests__/rbac.test.ts`

## Vérifications finales

- `npx tsc --noEmit` : code de sortie 0, aucune erreur et aucune sortie.
- `npx vitest run` : démarrage bloqué par EPERM dans `node_modules/.vite-temp` partagé.
- `npx vitest run --configLoader runner --cache=false` : code de sortie 0, **111 fichiers / 668 tests réussis**, durée 31,06 s.
- `npx eslint` sur les **47 fichiers TS/TSX** du manifeste : code de sortie 0, **0 erreur / 78 avertissements** dans les fichiers existants. Le lint séparé des 20 nouveaux fichiers TS/TSX ne produit aucune erreur ni avertissement.

Aucune commande git exécutée, aucun commit créé.
