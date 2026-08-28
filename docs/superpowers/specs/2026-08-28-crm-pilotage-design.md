# Design — Pilotage commercial

**Date** : 2026-08-28
**Objectif** : répondre à « où perd-on des affaires, et pourquoi ». Le CRM sait tout ce qu'il faut
pour l'expliquer — l'historique des transitions de chaque lead est déjà journalisé — mais n'en fait
rien : les statistiques commerciales se résument à quatre `countDocuments`, l'« entonnoir » affiché
n'en est pas un, et le taux de conversion envoyé chaque semaine par email est faux.

**Périmètre** : troisième des quatre chantiers d'amélioration du CRM identifiés le 2026-08-27, après
la file de travail commerciale et le journal des échanges. Le dernier — chaîne lead → devis → CA —
reste hors sujet.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Emplacement | **Section CRM dans la page Analytics existante**, affichée sous condition de `VIEW_CRM`. Écarté : une page dédiée `/admin/crm/pilotage`, qui aurait évité de charger une page déjà dense mais ajouté une surface de plus. |
| Taux de passage | **Par cohorte** : les leads créés dans la période, suivis via leurs transitions. Un taux calculé sur des populations différentes ne veut rien dire — c'est l'erreur du rapport hebdomadaire actuel. |
| Vélocité | **Sur les transitions observées**, indépendamment de la cohorte : durée passée dans chaque étape et durée du cycle complet. |
| Couverture | **Affichée, jamais masquée.** Les leads sans historique exploitable sont comptés et montrés comme tels. |
| Motifs de perte | **Liste fermée configurable** dans `CrmSettings` + commentaire libre. Obligatoire **dans l'interface**, optionnel **côté API** — voir § Le motif obligatoire. |
| Indicateurs | Funnel, vélocité, motifs de perte, performance par source **et** par commercial. |
| Rendu | `FinancialChart` et `PeriodSelector` existants. Aucun second langage graphique. |
| Hors périmètre | Prévisionnel pondéré (probabilité × budget) : relève du chantier lead → devis → CA. |

## Le problème, vérifié dans le code

### La donnée existe déjà

Chaque changement de statut écrit une `LeadActivity` de type `STATUS_CHANGE` avec
`payload: { from, to }` et sa date ([`admin/crm.ts:330`](../../../backend/src/routes/admin/crm.ts)).
Le parcours complet d'un lead à travers les étapes est donc reconstituable, sans rien instrumenter.

### L'« entonnoir » n'en est pas un

[`Analytics.tsx:251`](../../../src/pages/admin/Analytics.tsx) affiche Total, Actifs, Gagnés, Perdus.
Ces trois dernières catégories **partitionnent** le total : ce sont des parts d'un camembert, pas des
étapes successives. Aucune déperdition entre QUALIFIED et DEMO n'y est visible, alors que c'est
précisément ce qu'un entonnoir sert à montrer.

### Le taux de conversion hebdomadaire est faux

[`crmScheduler.ts:363`](../../../backend/src/lib/crmScheduler.ts) :

```js
const conversionRate = newLeads > 0 ? Math.round((won / newLeads) * 100) : 0
```

`won` compte les leads passés à WON pendant la semaine ; `newLeads` compte ceux **créés** pendant la
semaine. Deux cohortes distinctes : un lead gagné lundi a souvent été créé des mois plus tôt. Le
ratio peut dépasser 100 % et ne mesure rien.

Le même rapport compte les « qualifiés » par `status: 'QUALIFIED'` avec `statusChangedAt` récent : un
lead passé QUALIFIED puis DEMO dans la même semaine n'est jamais compté.

### Les statistiques CRM sont hors périmètre et hors permission

[`analytics.ts:167`](../../../backend/src/routes/admin/analytics.ts) exécute quatre
`countDocuments` sans aucun filtre de périmètre, sous permission `VIEW_PROJECTS`. Un utilisateur
autorisé à voir les projets lit donc les chiffres commerciaux de tout le monde.

## Architecture

### Les calculs

**`lib/crmPilotage.ts`** — fonctions **pures**, sur des tableaux de leads et de transitions. Aucune
requête : c'est ce qui permet de tester la méthodologie sans base, et c'est là qu'elle doit être
vérifiable.

| Fonction | Réponse |
|---|---|
| `buildFunnel(leads, transitions)` | Combien de leads de la cohorte ont **atteint** chaque étape, et le taux de passage d'une étape à la suivante |
| `computeVelocity(leads, transitions)` | Durée médiane passée dans chaque étape, et durée du cycle création → signature |
| `buildLossBreakdown(leads, transitions)` | Répartition des pertes par motif, et étape à laquelle elles surviennent |
| `groupPerformance(leads, key)` | Volume, gagnés, perdus, taux de conversion et budget gagné, par source ou par commercial |
| `assessCoverage(leads, transitions)` | Part de la cohorte réellement exploitable |

**« Atteint une étape »** se déduit des transitions : un lead LEAD → QUALIFIED → DEMO → WON a atteint
les quatre, même s'il n'est plus dans les trois premières. Sans cette reconstruction, un funnel ne
peut que compter des statuts courants, ce que fait l'affichage actuel.

**Médiane et non moyenne** pour les durées : un lead oublié six mois dans une étape déplacerait une
moyenne au point de la rendre inutile. La moyenne est renvoyée à côté, pour comparaison.

### La couverture, affichée

Un lead n'entre dans le funnel que si ses transitions sont connues. Deux cas le rendent inexploitable
et sont comptés séparément :

- créé avant que la journalisation n'existe ;
- créé pendant que `activityLogging` était désactivé dans les réglages.

`assessCoverage` renvoie `{ total, withHistory, withoutHistory, ratio }`, affiché en clair au-dessus
du funnel. Un lead sans historique est **exclu des taux** et **signalé**, jamais compté comme un
échec silencieux.

### Le motif obligatoire

Deux champs sur `Lead` : `lostReason` (String, valeur de la liste configurée) et `lostComment`
(String libre). `CrmSettings` gagne `lostReasons: [String]` avec pour valeurs par défaut : Prix,
Délai, Concurrent, Sans réponse, Hors cible, Projet annulé.

Le motif est **exigé par l'interface** et **accepté sans lui par l'API**. Le rendre obligatoire dans
le modèle casserait l'API agent (`PATCH /agent/crm/leads/:id`) et les automatisations qui passent
déjà des leads à LOST — un chantier de pilotage ne doit pas provoquer de panne ailleurs. Le tableau
de bord affiche donc explicitement la part de « motif non renseigné » : la pression vient de la
mesure, pas d'une erreur 400.

Le `PATCH` admin valide en revanche la valeur reçue : un `lostReason` hors de la liste configurée est
refusé en 400, sans quoi la liste fermée ne fermerait rien.

### L'endpoint

**`GET /api/admin/crm/pilotage?period=30d|90d|ytd|12m`** — permission `VIEW_CRM`, `leadScopeFilter`
appliqué comme partout ailleurs dans le CRM. Renvoie `funnel`, `velocity`, `losses`, `bySource`,
`byOwner`, `coverage` et la période résolue.

`byOwner` n'est renvoyé qu'aux utilisateurs qui voient l'ensemble des leads : pour un commercial
limité à son périmètre, la ventilation par personne n'aurait qu'une ligne — la sienne — et
donnerait l'illusion d'une comparaison.

### Le rapport hebdomadaire, corrigé

`processWeeklyReport` cesse de calculer son propre taux et appelle `groupPerformance` sur la cohorte
des leads créés dans la période de référence. Le « qualifiés » compté par statut courant devient un
« qualifiés » compté par transition atteinte.

### Frontend

`Analytics.tsx` (340 lignes, un seul bloc) est découpé en `pages/admin/analytics/`, comme l'a été le
board CRM :

| Fichier | Rôle |
|---|---|
| `index.tsx` | Chargement, période, agencement |
| `ProjectSection.tsx` | Blocs projets et tâches existants, déplacés sans changement |
| `PublicSiteSection.tsx` | Bloc site public existant, déplacé sans changement |
| `crm/FunnelChart.tsx` | Entonnoir par étape, avec taux de passage |
| `crm/VelocityPanel.tsx` | Durées par étape et cycle complet |
| `crm/LossPanel.tsx` | Motifs de perte et étape de sortie |
| `crm/PerformanceTable.tsx` | Ventilation par source et par commercial |
| `crm/CoverageNotice.tsx` | Part de la cohorte exploitable |

La section CRM n'est montée que si l'utilisateur a `VIEW_CRM`. L'ancien « Entonnoir CRM » est
supprimé : le conserver à côté du vrai laisserait deux chiffres contradictoires à l'écran.

La saisie du motif se fait dans un dialogue déclenché par tout passage à LOST — depuis le tableau, le
kanban, la file de travail et le détail du lead. Un seul composant `LostReasonDialog`, appelé par les
quatre.

## Tests

**Unitaires** (le cœur, sans base) — `buildFunnel` : lead ayant sauté une étape, lead revenu en
arrière, lead encore en cours, cohorte vide. `computeVelocity` : médiane insensible à une valeur
aberrante, étape jamais quittée exclue du calcul, un seul lead. `buildLossBreakdown` : motif absent
regroupé sous « non renseigné », étape de sortie déduite de la dernière transition.
`groupPerformance` : source vide regroupée, taux à dénominateur nul. `assessCoverage` : ratio exact.

**Intégration** — `VIEW_CRM` requis, périmètre respecté, `byOwner` absent pour un non super-admin,
`lostReason` hors liste refusé en 400, période invalide repliée sur la valeur par défaut.

**Régression** — le rapport hebdomadaire ne peut plus produire un taux supérieur à 100 %.

**Front** — rendu du funnel avec taux, avis de couverture visible quand des leads manquent
d'historique, dialogue de motif déclenché au passage à LOST, section CRM absente sans permission.

## Limites assumées

- Le funnel ne remonte pas avant la journalisation des transitions ; la couverture le dit.
- Les leads en cours de parcours abaissent mécaniquement les taux d'une cohorte récente. La période
  par défaut est 90 jours pour limiter l'effet, et le nombre de leads encore actifs est affiché.
- Aucun objectif ni prévisionnel : le tableau de bord décrit ce qui s'est passé, il ne projette pas.
- `lostReason` reste vide sur tout l'historique existant : les motifs ne diront quelque chose
  qu'après quelques semaines de saisie.
