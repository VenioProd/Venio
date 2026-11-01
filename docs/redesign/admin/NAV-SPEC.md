# Navigation admin — proposition (33 entrées → 13)

Arrow prospection est supprimé : un seul CRM.

## Nouvelle sidebar

| Zone | Entrée | Fusionne | Forme dans la page |
| --- | --- | --- | --- |
| Pilotage | **Accueil** | Mon espace, Vue business, Décisions | Cockpit par rôle. Les décisions en attente deviennent un bloc « À arbitrer » ; la vue business devient des widgets du cockpit (super admin). |
| Pilotage | **Inbox** | Messages, Centre d’activité, Emails | Onglets : Conversations · Activité · Envoi groupé. La cloche du topbar ouvre l’onglet Activité. |
| Pilotage | **Analytics** | Analytics, Mes rapports | Onglets : Business · Projets · Site public · Rapports. |
| Commercial | **CRM** | CRM, Clients, Commerciaux externes, ~~Arrow prospection~~ | Onglets : Pipeline · Comptes clients · Partenaires. |
| Production | **Projets** | Projets, Projets internes, Templates | Onglets : Clients · Internes · Modèles. |
| Production | **Demandes** | Demandes clients, Tickets | Une file unique, filtre Source : Client / Équipe. |
| Production | **Calendrier** | — | — |
| Production | **Dev** | Dev workspace, Beta tests | Onglets : Workspace · Recette (beta). |
| Production | **Ressources** | Ressources | — |
| Organisation | **Comptabilité** | — | — |
| Organisation | **Équipe** | Équipe, Comptes admin, Accès outils | Onglets : Membres · Rôles & comptes · Accès outils (onglets filtrés par permission). |
| Organisation | **Formation** | Qualiopi, Pédagogie | Onglets : Qualiopi · Pédagogie. |
| Organisation | **Système** | Santé système, Audit, Agents API, Webhooks | Onglets : Santé · Journal d’audit · Intégrations (API + webhooks). Super admin. |

Hors sidebar :

- **Filiales** → sélecteur d’espace en haut de la sidebar (« Venio · Paris ▾ » liste les filiales + « Vue portefeuille »).
- **Guide** → menu « ? » du topbar et palette ⌘K.
- **Profil** → carte utilisateur en bas de sidebar.

Mobile (barre d’onglets) : Accueil · Inbox · Projets · CRM · Plus.

## Ce qui ne change pas

Les droits restent définis par `rbac-matrix.json` : une entrée fusionnée apparaît si l’utilisateur a accès à au moins un de ses onglets, et chaque onglet reste filtré par sa permission d’origine. Les anciennes URL redirigent vers l’onglet correspondant.
