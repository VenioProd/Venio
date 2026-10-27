# Apps natives Venio — espace commercial

Cadrage du 23 octobre 2026. Cibles : iOS, iPadOS, watchOS, macOS. L'app est segmentée entre **admin** et **commerciaux** ; ce document couvre l'espace commercial.

## Arbitrages retenus

| Sujet | Décision |
| --- | --- |
| Visibilité | Tout le CRM est lisible ; les leads assignés au commercial sont mis en avant (vue « Mes leads » par défaut). |
| Fiche projet | Phases et avancement, finances (budget, facturé, statut de facturation), demandes de modification et tickets client, fil des mises à jour publiées au client. Lecture seule. |
| Devis | Création depuis un modèle et envoi depuis l'app, en plus du suivi (envoyé, vu, signé, expiré) et des relances. |
| Outils terrain v1 | Note vocale transcrite, scan de carte de visite, journal d'appels automatique, mode hors ligne. |

## Écrans

1. **Aujourd'hui** : les relances dues ou en retard (`nextActionAt`), les leads chauds sans action prévue, les nouveaux leads entrants, les RDV du jour et les devis vus mais pas signés.
2. **Pipeline** : les étapes `LEAD → QUALIFIED → CONTACTED → DEMO → PROPOSAL → WON / LOST`. Kanban sur iPad et Mac, liste filtrable sur iPhone. Valeur totale et valeur pondérée par étape. Filtres : mes leads / tous, température, service, source.
3. **Fiche lead** : contacts, score, température, budget, service, timeline (`LeadActivity`, `Interaction`), notes, séquences en cours, devis liés. Actions rapides : appeler, mail, planifier une relance, changer d'étape, marquer perdu avec un motif, convertir en client.
4. **Saisie rapide** : un lead créé en moins de 10 secondes, pré-rempli par le scan de carte de visite ; la note vocale est rattachée au lead.
5. **Projets** : la liste des plateformes en construction (statut, phase en cours, avancement, prochaine échéance), puis la fiche projet décrite ci-dessus.
6. **Devis** : la liste par statut (`DRAFT`, `SENT`, `SIGNED`, `EXPIRED`, `CANCELLED`), la création depuis un modèle, l'envoi et la relance.
7. **Mes chiffres** : le CA signé, le taux de conversion par étape, le cycle de vente moyen et les motifs de perte.

## Apple Watch

Les relances du jour, une notification à chaque nouveau lead entrant ou devis signé, un appel en un geste, et une note vocale rattachée au dernier lead consulté.

## Notifications push (commercial)

- Un nouveau lead entrant ou assigné.
- Un devis vu ou signé.
- Une relance arrivée à échéance (`nextActionAt`).
- Un événement sur un projet client : phase terminée, demande de modification, ticket ouvert.

## Répartition par appareil

- **iPhone** : l'outil principal du commercial sur le terrain.
- **iPad** : le commercial en RDV ou au bureau, avec le kanban et les vues en split.
- **Apple Watch** : le commercial (voir plus haut).
- **Mac** : surtout l'outil admin.

## Espace admin (rappel)

- Vue business et trésorerie.
- Projets en édition : phases, mises à jour client, tri des demandes de modification.
- Messagerie et centre d'activité.
- Tickets et dev workspace.

## Direction visuelle

Trois pistes en maquette : **minimaliste**, **liquid glass**, **moderne néon**. Les graphes gardent la structure *financial timeline* (area, volume, crosshair). Les données de démo sont communes aux trois pistes : [donnees-demo.md](maquettes/donnees-demo.md).

## Point de vigilance

Le rôle `COMMERCIAL` n'a pas aujourd'hui la permission d'écrire la facturation. Créer un devis depuis l'app demandera d'ouvrir une permission dédiée, limitée aux `QuoteProposal`.
