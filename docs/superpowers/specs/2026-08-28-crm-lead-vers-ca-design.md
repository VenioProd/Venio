# Design — Chaîne lead → devis → chiffre d'affaires

**Date** : 2026-08-28
**Objectif** : savoir ce qu'un lead a réellement rapporté. Aujourd'hui le CRM sait qu'une affaire est
gagnée, mais pas ce qu'elle a produit : le `budget` saisi à la création reste déclaratif et n'est
jamais confronté au montant signé.

**Périmètre** : dernier des quatre chantiers d'amélioration du CRM identifiés le 2026-08-27, après la
file de travail, le journal des échanges et le pilotage
([`2026-08-28-crm-pilotage-design.md`](2026-08-28-crm-pilotage-design.md)). Il s'appuie sur le
chantier devis client de bout en bout
([`2026-07-26-devis-client-bout-en-bout-design.md`](2026-07-26-devis-client-bout-en-bout-design.md)),
déjà livré.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Mesure | **Signé et encaissé, côte à côte.** Le signé mesure la performance commerciale, l'encaissé ce qui est rentré ; l'écart entre les deux est lui-même une information. |
| Historique | **Rattachement manuel assisté.** Le CRM propose les projets du même client non rattachés, l'utilisateur confirme. Écarté : le rapprochement automatique par client et date, qui se tromperait en silence dès qu'un client a eu plusieurs affaires. |
| Prévisionnel | **Pondéré par les taux observés**, tirés du funnel déjà calculé. Écarté : des probabilités saisies à la main, qui sont une opinion figée que personne ne corrige. |
| Sens du lien | **`Project.sourceLead`**, une seule direction. Un lead peut engendrer plusieurs projets ; un projet vient d'au plus un lead. |
| Nouvelles permissions | **Aucune.** Lecture `VIEW_CRM`, rattachement `MANAGE_CRM`. |
| Hors périmètre | Objectifs commerciaux et suivi de marge. Réconciliation devis ↔ factures ligne à ligne. |

## Le problème, vérifié dans le code

La chaîne est presque complète. Un seul maillon manque, et il casse toute la remontée.

| Maillon | État |
|---|---|
| `Lead` (WON) → compte client | **Relié** — `lead.clientAccountId`, posé par `ensureClientForWonLead` |
| `Lead` (WON) → projet | **Créé mais anonyme** — `autoCreateProjectFromLead` ([`crmAutomations.ts`](../../../backend/src/lib/crmAutomations.ts)) crée le projet avec `tags: ['auto-crm']` et rien d'autre |
| `Project` → devis | **Relié** — `QuoteProposal.project` |
| Devis signé → document de facturation | **Relié** — `proposal.billingDocument` ([`quoteSignature.ts`](../../../backend/src/lib/quoteSignature.ts)) |
| Document → écriture comptable | **Relié** |

[`Project`](../../../backend/src/models/Project.ts) ne porte **aucune référence vers `Lead`**. Le tag
`'auto-crm'` dit qu'un projet vient du CRM, jamais de quel lead. Impossible donc de remonter d'un
euro facturé au lead qui l'a apporté, ni de savoir si un lead gagné a produit quoi que ce soit.

### Ce qui distingue le signé de l'encaissé

`buildBillingDocumentForProposal` crée, à la signature, un `BillingDocument` de type **`QUOTE`** au
statut `ACCEPTED`. Les factures sont des documents de type **`INVOICE`**. Les deux mesures ont donc
des sources distinctes et **ne peuvent pas se compter deux fois** :

- **signé** = somme des `QUOTE` en `ACCEPTED` ou `PAID` ;
- **encaissé** = somme des `INVOICE` en `PAID`.

Ces deux montants ne s'égalisent pas et n'ont pas à le faire : une facture d'acompte ne couvre qu'une
part du devis, et une facture peut exister sans devis. Chacun répond à sa propre question.

## Architecture

### Le lien

`Project.sourceLead` — `ObjectId`, `ref: 'Lead'`, `default: null`, index partiel sur les valeurs
renseignées. Posé automatiquement par `autoCreateProjectFromLead`, qui dispose déjà du lead.

Le lien va du projet vers le lead, et pas l'inverse : un lead peut engendrer plusieurs projets
(tranches, avenants), un projet vient d'au plus un lead. Un champ `Lead.projectIds` obligerait à
tenir deux listes cohérentes pour la même information.

### Les calculs

**`lib/crmRevenue.ts`** — comme pour le pilotage, une fonction **pure** au centre, testable sans base.

| Fonction | Réponse |
|---|---|
| `summariseRevenue(documents)` | Montants signé et encaissé, à partir des documents de facturation d'un ensemble de projets |
| `weightedPipeline(leads, funnel)` | Valeur pondérée du pipeline en cours, par étape |

**`weightedPipeline`** applique à chaque lead actif la probabilité **observée** de passer de son étape
à la signature : `count[WON] / count[stage]`, tirée du funnel déjà calculé par `buildFunnel`.

Deux précautions, parce que ce chiffre est le plus facile à mal lire de tout le tableau de bord :

- Les taux viennent de la **cohorte historique**, ils sont appliqués au **pipeline courant** : deux
  populations distinctes. C'est la méthode habituelle, mais elle suppose que le passé renseigne sur
  le présent, et cela doit être dit.
- En dessous de **20 leads** dans la cohorte de référence, les taux sont trop instables pour porter
  une projection. Le montant reste affiché — le cacher donnerait l'illusion d'une absence de
  pipeline — mais accompagné d'un avertissement explicite, et la réponse porte `reliable: false`.

Un lead sans budget saisi vaut zéro dans la pondération, et le nombre de leads concernés est renvoyé :
un prévisionnel bâti sur des budgets absents est un prévisionnel faux.

### Les routes

| Route | Rôle |
|---|---|
| `GET /crm/leads/:id/revenue` | Ce que ce lead a produit : projets, devis, factures, signé, encaissé |
| `GET /crm/leads/:id/project-candidates` | Projets du même client non encore rattachés |
| `POST /crm/leads/:id/projects/:projectId` | Rattacher un projet à ce lead |
| `DELETE /crm/leads/:id/projects/:projectId` | Détacher |

Lecture en `VIEW_CRM`, rattachement en `MANAGE_CRM`, périmètre du lead vérifié comme partout ailleurs.
Le rattachement refuse un projet déjà rattaché à un autre lead (409) : écraser silencieusement un lien
existant déplacerait du chiffre d'affaires d'un lead à un autre.

Chaque rattachement écrit une `LeadActivity` : c'est une décision humaine sur l'attribution du CA, elle
doit être traçable.

### Le pilotage enrichi

`GET /crm/pilotage` gagne deux blocs :

- `revenue` : signé et encaissé de la cohorte, et **budget déclaré** en regard. L'écart entre budget
  annoncé et montant signé est ce que le CRM n'a jamais su dire.
- `pipeline` : valeur pondérée des affaires en cours, par étape, avec son indicateur de fiabilité.

`groupPerformance` voit son `wonBudget` — qui somme des budgets **déclarés** — doublé d'un
`wonSigned`, montant réellement signé par source et par commercial. Le champ existant est conservé :
la comparaison entre les deux est précisément l'intérêt.

### Frontend

- `crm/RevenueChain.tsx` — dans le détail du lead : projets rattachés, devis, factures, montants, et
  le rattachement d'un projet existant.
- `crm/PipelinePanel.tsx` — dans la section Pilotage : prévisionnel par étape et son avertissement.
- La section Pilotage gagne une ligne « Budget déclaré / Signé / Encaissé » en tête.

## Tests

**Unitaires** — `summariseRevenue` : devis accepté seul, facture payée seule, les deux (aucun double
comptage), document annulé ignoré, ensemble vide. `weightedPipeline` : pondération par étape, lead
sans budget compté à zéro et signalé, cohorte trop petite marquée non fiable, funnel sans aucun gagné
(probabilités nulles, pas de division par zéro).

**Intégration** — rattachement et détachement, refus d'un projet déjà rattaché (409), périmètre du
lead respecté, `sourceLead` posé à la création automatique d'un projet, candidats limités aux projets
du client du lead et non rattachés.

**Front** — chaîne affichée avec ses montants, état vide explicite, avertissement de fiabilité présent
puis absent selon le volume.

## Limites assumées

- Aucun rapprochement rétroactif : les projets antérieurs restent sans lead tant que personne ne les
  rattache. C'est le prix d'un lien fiable.
- Signé et encaissé ne se réconcilient pas ligne à ligne : un acompte apparaît comme un encaissement
  partiel sans que le reste soit qualifié.
- Le prévisionnel ne pondère pas par l'ancienneté : un lead en proposition depuis six mois pèse autant
  qu'un lead entré hier.
- Aucun objectif commercial : le tableau de bord ne compare à rien.
