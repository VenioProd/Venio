# Design — Journal des échanges (leads et comptes clients)

**Date** : 2026-08-27
**Objectif** : donner au CRM la mémoire de ce qui s'est dit. Aujourd'hui Venio consigne ce que le
*système* a fait — un statut changé, un contact créé — mais jamais un échange : ni appel, ni
rendez-vous, ni email. Le « contact rapide » d'une fiche lead est un `mailto:` qui ne laisse aucune
trace, et l'EmailComposer envoie sans rien écrire.

**Périmètre** : deuxième des quatre chantiers d'amélioration du CRM identifiés le 2026-08-27, après
la file de travail commerciale
([`2026-08-27-crm-file-de-travail-design.md`](2026-08-27-crm-file-de-travail-design.md)). Les deux
suivants — pilotage, chaîne lead → devis → CA — restent hors sujet ici.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Portée | **Leads et comptes clients**, dans un journal unique. Un lead gagné devient client : son passé doit le suivre. Écarté : les leads seuls, qui laisserait deux mondes à réunir plus tard. |
| Email | **Envoi depuis la fiche, journalisé automatiquement.** Écarté : la journalisation manuelle seule, qui ne vaut que ce que vaut l'habitude de saisir. Écarté aussi : la lecture des réponses par IMAP/OAuth, chantier à part entière. |
| Modèle | **Nouveau modèle `Interaction`**, polymorphe sur `subjectType` + `subjectId`. Il ne remplace pas `LeadActivity` ni `ClientActivity` : ce que le système a fait et ce que des humains se sont dit sont deux natures différentes, et les confondre rendrait la timeline illisible. |
| Notes existantes | **`ClientNote` migré** vers `Interaction(NOTE)`, épinglage conservé. Les routes admin et agent `/clients/:id/notes` gardent leur contrat et lisent la nouvelle source. |
| Agrégation | **Côté serveur**, dans un endpoint `timeline`. Le front en a besoin à deux endroits (modal lead, fiche client) : agréger côté client dupliquerait le tri et doublerait les appels. |
| Nouvelles permissions | **Aucune.** `VIEW_CRM` / `MANAGE_CRM` sur un lead, `MANAGE_CLIENTS` sur un client — les permissions des routes remplacées. |
| Hors périmètre | Fusion de `LeadActivity` et `ClientActivity` malgré leur schéma identique (refactoring adjacent, à risque). Contacts multiples sur les leads (chantier modèle de données). |

## Le problème, vérifié dans le code

Venio a **quatre** journaux, et aucun ne consigne un échange.

| Modèle | Rattaché à | Contenu réel |
|---|---|---|
| [`LeadActivity`](../../../backend/src/models/LeadActivity.ts) | `Lead` | `STATUS_CHANGE`, `ASSIGNED`, `CREATED` — événements système |
| [`ClientActivity`](../../../backend/src/models/ClientActivity.ts) | compte client | `CLIENT_UPDATED`, `CONTACT_CREATED`, `NOTE_CREATED` — événements système |
| [`ClientNote`](../../../backend/src/models/ClientNote.ts) | compte client | notes internes libres, épinglables |
| [`ActivityLog`](../../../backend/src/models/ActivityLog.ts) | **`Project`** (requis) | journal projet — inutilisable pour un lead ou un client sans projet |

`LeadActivity` et `ClientActivity` portent **exactement le même schéma** (`type`, `label`, `payload`,
`actorId`, `timestamps`) ; seul le champ de rattachement diffère. Duplication constatée, non traitée
ici.

Côté email, [`emailComposer.ts:100`](../../../backend/src/routes/admin/emailComposer.ts) envoie via
`transporter.sendMail`, compte les succès et les échecs, renvoie le total — et n'écrit rien nulle
part. Impossible de savoir a posteriori qui a reçu quoi. Le composer ne connaît d'ailleurs que les
admins et les clients : un lead n'est pas un destinataire possible.

Côté fiche lead, les seules actions de contact sont un `mailto:` et un `tel:`
([`LeadDetailModal.tsx:55`](../../../src/pages/admin/crm-board/LeadDetailModal.tsx)) : l'échange a
lieu hors de Venio et n'y laisse rien.

## Architecture

### Le modèle

`Interaction` — un échange entre l'équipe et un interlocuteur.

| Champ | Type | Rôle |
|---|---|---|
| `subjectType` | `LEAD` \| `CLIENT` | Nature du rattachement |
| `subjectId` | ObjectId | Le lead ou le compte client |
| `kind` | `EMAIL` \| `CALL` \| `MEETING` \| `NOTE` | Nature de l'échange |
| `direction` | `OUT` \| `IN` \| `NONE` | Qui a initié ; `NONE` pour une note |
| `occurredAt` | Date | Quand l'échange a eu lieu |
| `subject` | String | Objet, obligatoire pour un email |
| `body` | String | Contenu ou compte rendu, borné à 20 000 caractères |
| `pinned` | Boolean | Épinglage, hérité de `ClientNote` |
| `author` | ObjectId | Qui a saisi ou envoyé |
| `recipients` | `[{ email, name, status, error }]` | Emails uniquement |
| `deliveryStatus` | `NONE` \| `SENT` \| `PARTIAL` \| `FAILED` | Résultat de l'envoi |

`occurredAt` est distinct de `createdAt` : un appel se consigne souvent après coup, et la timeline
doit le classer à sa date réelle. `createdAt` reste la trace d'audit.

Index : `{ subjectType, subjectId, occurredAt: -1 }` pour la timeline, `{ subjectType, subjectId,
pinned: -1, occurredAt: -1 }` pour la reprise du tri de `ClientNote`.

### Backend

**`lib/interactions.ts`** — `logInteraction()` pour l'écriture, `buildTimeline()` pour la lecture
fusionnée. `buildTimeline` charge les `Interaction` du sujet et le journal système correspondant
(`LeadActivity` ou `ClientActivity` selon `subjectType`), et renvoie une liste unique triée par
date décroissante. Chaque entrée porte `source` : `INTERACTION` (éditable) ou `SYSTEM` (lecture
seule). Le front n'a ni tri ni fusion à faire.

**`lib/email/send.ts`** — extraction de l'envoi aujourd'hui enfoui dans `emailComposer.ts` :
résolution du transporteur, mise en forme du corps, application du gabarit `emailLayout`, envoi
destinataire par destinataire, résultat par adresse. `emailComposer.ts` s'y branche au lieu de
porter sa propre copie ; la fiche l'appelle aussi. Un seul chemin d'envoi, donc un seul endroit où
corriger un bug d'envoi.

**`routes/admin/interactions.ts`** — monté sur `/api/admin/interactions` :

| Route | Rôle |
|---|---|
| `GET /:subjectType/:subjectId/timeline` | Échanges + événements système, fusionnés et triés |
| `POST /:subjectType/:subjectId` | Consigner un appel, un RDV ou une note |
| `PATCH /:id` | Corriger une interaction (pas un événement système) |
| `DELETE /:id` | Supprimer une interaction |
| `POST /:subjectType/:subjectId/email` | Envoyer un email et le journaliser |

La permission requise dépend du sujet : un middleware la résout (`VIEW_CRM`/`MANAGE_CRM` pour un
lead, `MANAGE_CLIENTS` pour un client) puis vérifie que le sujet existe et qu'il est dans le
périmètre de l'utilisateur — le `scopeFilter` du CRM s'applique aux leads comme ailleurs.

L'envoi d'email journalise **quel que soit le résultat**. Un échec SMTP produit une `Interaction`
avec `deliveryStatus: FAILED` et l'erreur par destinataire : une relance qui n'est pas partie est
une information au moins aussi utile qu'une relance partie. La route répond `207` quand une partie
seulement des destinataires a reçu le message.

**Routes réécrites** — `/clients/:id/notes` (admin et agent) lisent et écrivent des
`Interaction(NOTE)`. Les formes de requête et de réponse sont inchangées : `content`, `pinned`,
`createdBy` peuplé. Aucun consommateur externe ne casse.
`POST /crm/leads/:id/notes`, ajouté par le chantier précédent, est remplacé par
`POST /interactions/LEAD/:id` ; la file de travail est mise à jour en conséquence.

**Migration** — `backend/scripts/migrations/003-client-notes-to-interactions.ts`, sur le modèle des
deux migrations existantes : idempotente, rejouable, exécutée à la main. Elle copie chaque
`ClientNote` en `Interaction(NOTE, CLIENT)` en conservant `content`, `pinned`, `createdBy` et
`createdAt`, puis fait de même pour les `LeadActivity` de type `NOTE`. L'idempotence repose sur
`migratedFrom`, qui porte l'identifiant d'origine et est indexé en `sparse`. Les documents sources
ne sont pas supprimés : la migration doit pouvoir être vérifiée avant qu'on efface quoi que ce soit.

### Frontend

**`services/interactions.ts`** — client typé des cinq routes.

**`components/admin/InteractionTimeline/`** — la timeline, partagée par les deux fiches :

| Fichier | Rôle |
|---|---|
| `index.tsx` | Chargement, filtres par type, états vide et chargement |
| `TimelineEntry.tsx` | Une entrée : icône de type, date, auteur, contenu, actions |
| `InteractionComposer.tsx` | Consigner un appel, un RDV, une note |
| `EmailComposer.tsx` | Rédiger et envoyer un email depuis la fiche |

**Intégration** — dans le [`LeadDetailModal`](../../../src/pages/admin/crm-board/LeadDetailModal.tsx),
déjà titré « Notes d'interactions », la timeline remplace le champ `interactionNotes` en texte libre.
Dans la fiche client, l'onglet Notes devient l'onglet Échanges et l'agrégation front actuelle
([`client-detail/index.tsx:228`](../../../src/pages/admin/client-detail/index.tsx)) disparaît au
profit de l'endpoint `timeline`.

Le champ `Lead.interactionNotes` n'est plus alimenté mais reste lu : son contenu s'affiche en tête de
timeline comme une note historique, sans quoi le texte déjà saisi disparaîtrait de l'écran.

## Erreurs

Une interaction qui échoue à l'écriture laisse le composeur ouvert et la saisie intacte — même règle
que la file de travail. Un envoi d'email partiellement échoué s'affiche avec le détail par
destinataire, pas comme un échec global.

## Tests

**Unitaires** — `buildTimeline` : fusion et tri sur `occurredAt`, marquage `source`, sujet sans
aucune entrée, journal système absent. `lib/email/send.ts` : transporteur absent, échec sur un
destinataire parmi trois, calcul de `deliveryStatus`.

**Intégration** — permissions par type de sujet (un `COMMERCIAL` sans `MANAGE_CLIENTS` ne peut pas
écrire sur un client), périmètre des leads pour un non super-admin, sujet inexistant en 404,
validation (`kind` inconnu, corps vide, email sans objet ni destinataire), journalisation d'un envoi
échoué, et compatibilité des routes `/clients/:id/notes` réécrites (même forme de réponse qu'avant).

**Migration** — sur base réelle : rejouer deux fois ne duplique rien, `pinned` et `createdAt` sont
conservés, les sources restent en place.

**Front** — rendu de la timeline avec les deux sources, filtre par type, envoi d'email avec succès
partiel, préservation de la saisie en cas d'échec.

## Limites assumées

- Aucune lecture des réponses : un prospect qui répond dans sa messagerie n'apparaît pas. La saisie
  manuelle d'une interaction entrante (`direction: IN`) est le seul recours.
- Pas de pièce jointe à l'envoi. Le coffre documentaire couvre déjà l'échange de fichiers.
- Pas de pagination de la timeline dans un premier temps ; un plafond de 200 entrées est appliqué et
  signalé dans la réponse plutôt que tronqué en silence.
- `LeadActivity` et `ClientActivity` restent deux modèles identiques et distincts.
