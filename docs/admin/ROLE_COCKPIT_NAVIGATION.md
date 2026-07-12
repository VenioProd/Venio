# Navigation et cockpit par rôle

VENIO-99 conserve `rbac-matrix.json` comme seule source des autorisations. La
présente couche ne crée ni permission, ni route : elle organise uniquement les
modules déjà autorisés.

## Zones de navigation

1. **Pilotage** : accueil, vue business, messages, rapports, analytics,
   décisions et guide.
2. **Relation & projets** : clients, CRM, projets, calendrier, templates,
   ressources, tickets et projets internes.
3. **Conformité & finance** : comptabilité, Qualiopi et audit.
4. **Équipe & produit** : équipe, e-mails, développement, pédagogie et
   filiales.
5. **Console système** : accès outils, comptes administrateur et agents API.

La Console système n'est affichée que si `manage_admins` est accordée. Dans la
matrice actuelle, cela revient au seul rôle `SUPER_ADMIN`. Les garde-fous de
route existants restent la protection d'autorité ; ni le menu, ni la palette ne
leur servent de substitut.

## Priorités du cockpit

| Rôle | Priorités affichées |
| --- | --- |
| SUPER_ADMIN | Vue business, décisions, analytics, comptes administrateur |
| ADMIN / MANAGER | Projets, CRM, tickets, messages |
| COMMERCIAL | CRM, clients, projets, tickets |
| RH | Équipe, Qualiopi, tickets, projets |
| COMPTABLE | Comptabilité, projets, messages |
| VIEWER | Projets, comptabilité, tickets, développement |
| STAGIAIRE | Projets, ressources, tickets, CRM |

Avant affichage, chaque raccourci est recoupé avec la navigation RBAC effective
(y compris les permissions accordées ou refusées individuellement).

## Palette et instrumentation

`⌘K` / `Ctrl+K` et le bouton Recherche ouvrent une palette qui ne contient que
les modules visibles ainsi que quatre actions dont la permission et la
destination sont toutes deux autorisées. La navigation mobile est dérivée de
la même liste.

Les évènements `admin_*` sont des compteurs quotidiens agrégés : type
d'évènement, chemin de module et identifiant d'action fixe. Aucun identifiant
utilisateur, rôle, texte recherché, cookie, session, adresse IP ou donnée
personnelle n'est transmis par le navigateur.
