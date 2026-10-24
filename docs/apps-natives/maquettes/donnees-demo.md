# Données de démo communes aux maquettes

Les trois pistes utilisent exactement ces valeurs. Le moment est **vendredi 23 octobre 2026, 9:41**. La commerciale connectée est **Léa Martin** ; un deuxième commercial s'appelle **Hugo Bernard**. L'admin s'appelle **Raphaël B.**

## Leads ouverts (8)

| # | Entreprise | Contact | Service | Étape | Montant | Température | Score | Assigné | Prochaine action |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Maison Calder | Claire Calder | Site vitrine + SEO | PROPOSAL | 14 800 € | TRES_CHAUD | 86 | Léa | Relance aujourd'hui 10:30 |
| 2 | Atelier Nova | Malik Benali | E-commerce | DEMO | 22 500 € | CHAUD | 74 | Léa | RDV démo aujourd'hui 14:00 |
| 3 | Cabinet Ferrand Avocats | Sophie Ferrand | Site + espace client | CONTACTED | 9 600 € | TIEDE | 58 | Léa | Relance **en retard** (mer. 21 oct.) |
| 4 | Brasserie Les Halles | Julien Roux | Site + réservation | QUALIFIED | 6 400 € | CHAUD | 69 | Léa | **Aucune action prévue** |
| 5 | Studio Okami | Yuki Tanaka | App mobile | LEAD | 38 000 € | TIEDE | 41 | Non assigné | Entrant ce matin 8:52 (formulaire du site) |
| 6 | Clinique Saint-Aubin | Dr Paul Aubin | Plateforme de RDV | PROPOSAL | 31 000 € | CHAUD | 80 | Hugo | Relance lun. 26 oct. |
| 7 | Domaine Verlaine | Anne Verlaine | E-commerce vins | CONTACTED | 12 000 € | FROID | 35 | Hugo | Relance mar. 27 oct. |
| 8 | Fondation Arcadie | Marc Delorme | Refonte de site | DEMO | 18 200 € | TIEDE | 62 | Léa | Relance aujourd'hui 16:00 |

### Totaux du pipeline (invariants à respecter)

| Étape | Leads | Montant | Probabilité | Pondéré |
|---|---|---|---|---|
| LEAD | 1 | 38 000 € | 10 % | 3 800 € |
| QUALIFIED | 1 | 6 400 € | 25 % | 1 600 € |
| CONTACTED | 2 | 21 600 € | 35 % | 7 560 € |
| DEMO | 2 | 40 700 € | 50 % | 20 350 € |
| PROPOSAL | 2 | 45 800 € | 70 % | 32 060 € |
| **Total** | **8** | **152 500 €** | | **65 370 €** |

« Mes leads » (Léa) : 5 leads (n°1, 2, 3, 4 et 8) pour 71 500 €.

Libellés français des étapes : Lead, Qualifié, Contacté, Démo, Proposition, Gagné, Perdu.

## Écran « Aujourd'hui » de Léa

- **En retard (1)** : Cabinet Ferrand Avocats, relance du 21 oct.
- **Relances du jour (2)** : Maison Calder à 10:30, Fondation Arcadie à 16:00.
- **RDV (1)** : la démo d'Atelier Nova à 14:00, en visio.
- **Lead chaud sans action (1)** : Brasserie Les Halles.
- **Nouveau lead entrant (1)** : Studio Okami à 8:52, non assigné.
- **Devis vu, pas signé (1)** : DV-2026-041 pour Maison Calder, 14 800 €, ouvert hier à 18:12.

## Timeline de Maison Calder (fiche lead de référence)

- 22 oct. 18:12 : la cliente a ouvert le devis DV-2026-041.
- 20 oct. 11:05 : le devis DV-2026-041 a été envoyé par Léa.
- 17 oct. 15:30 : RDV de découverte (note vocale de 2 min 14, transcrite).
- 14 oct. 09:20 : passage de Qualifié à Contacté.
- 13 oct. 17:48 : lead créé depuis un scan de carte de visite (salon Vivatech Paris).

## Devis

| Réf. | Client | Modèle | Montant HT | Statut |
|---|---|---|---|---|
| DV-2026-041 | Maison Calder | Site vitrine | 14 800 € | SENT (vu le 22 oct.) |
| DV-2026-039 | Clinique Saint-Aubin | Plateforme sur mesure | 31 000 € | SENT |
| DV-2026-038 | Agence Pilote | Plateforme sur mesure | 18 400 € | SIGNED le 9 oct. |
| DV-2026-036 | Boulangerie Rivière | E-commerce | 8 900 € | SIGNED le 2 oct. |
| DV-2026-033 | Garage Mercier | Site vitrine | 5 200 € | EXPIRED |

Modèles disponibles : Site vitrine, E-commerce, Plateforme sur mesure, Pack SEO.

## Mes chiffres (Léa, octobre 2026)

- CA signé : **27 300 €** (DV-2026-038 à 18 400 € plus DV-2026-036 à 8 900 €). Objectif de 40 000 €, soit **68 %**.
- Taux de conversion sur 12 mois : 24 %. Cycle de vente moyen : 34 jours.
- Motifs de perte : budget 42 %, concurrent 28 %, timing 18 %, sans réponse 12 % (100 % au total).
- CA signé par mois (mai → oct.) : 18 200, 24 600, 9 800, 15 400, 31 200, 27 300 €.

## Projets en construction (4)

Les phases sont toujours les cinq mêmes : Cadrage → Conception → Développement → Recette → Mise en ligne.

| Réf. | Client | Plateforme | Phase en cours | Avancement | Livraison | Budget | Facturé | Statut facturation | Demandes / tickets | Dernière mise à jour client |
|---|---|---|---|---|---|---|---|---|---|---|
| P-2026-018 | Agence Pilote | Plateforme de réservation | Développement (3/5) | 62 % | 28 nov. 2026 | 18 400 € | 9 200 € | Partiel | 1 demande « à chiffrer », 0 ticket | 20 oct. : « Maquettes validées, début du développement » |
| P-2026-015 | Boulangerie Rivière | Site + click & collect | Recette (4/5) | 85 % | 6 nov. 2026 | 8 900 € | 4 450 € | Partiel | 0 demande, 1 ticket ouvert (« paiement Apple Pay refusé ») | 21 oct. : « Version de recette en ligne » |
| P-2026-011 | Cabinet Morel | Espace client | Conception (2/5) | 30 % | 15 déc. 2026 | 24 000 € | 7 200 € | Partiel | 2 demandes « soumises », 0 ticket | 16 oct. : « Arborescence validée » |
| P-2026-009 | Lumen Formation | Plateforme e-learning | Mise en ligne (5/5) | 96 % | 30 oct. 2026 | 32 000 € | 25 600 € | Partiel | 0 demande, 0 ticket | 22 oct. : « Migration des contenus terminée » |

## Admin (Mac) — vue business, octobre 2026

- CA facturé du mois : 41 250 €. Encaissé : 33 800 €.
- Factures en retard : 3, pour 7 450 € (FA-2026-112 à 2 400 €, FA-2026-108 à 3 650 €, FA-2026-101 à 1 400 €).
- Trésorerie disponible : 86 420 €.
- Tickets ouverts : 5, dont celui de la Boulangerie Rivière. Demandes de modification à trier : 3, soit celle d'Agence Pilote et les 2 du Cabinet Morel.
- Issues de dev en cours : 12. Messages non lus : 4.
- Encaissements par mois (mai → oct.) : 28 400, 35 100, 22 900, 30 600, 44 300, 33 800 €.
