# Espace comptabilité par projet — cadrage

Statut : **à valider** (24 octobre 2026).
Demande d'origine : « un espace très spécifique de comptabilité. type de paiement par projet, payeur par projet, répartition des gains ht, etc, bien complet comme espace ».

## 1. Décisions prises

| Sujet | Décision |
| --- | --- |
| Modes de facturation | Forfait simple, échéancier en % (acompte / jalons / solde), abonnement récurrent. Pas de régie. |
| Payeurs | Un ou plusieurs payeurs par projet, chacun avec sa quote-part, ses coordonnées de facturation et son moyen de paiement. |
| Bénéficiaires | Associés, commerciaux, freelances / sous-traitants, apporteurs d'affaires. |
| Base de répartition | **CA HT encaissé**. Une part n'est due qu'à l'encaissement, au prorata. |
| Règles | Un % par bénéficiaire, propre à chaque projet, pré-rempli depuis un modèle réutilisable. Pas de montant fixe, de palier ni de plafond. |
| Part non attribuée | Reste en société. La somme des % ne dépasse jamais 100 %. |
| Arrondi | Chaque part est arrondie au centime inférieur ; l'écart va à la société. |
| Coûts directs | Suivis pour afficher la marge, sans effet sur les parts. |
| Versements | Relevé dû / versé / restant par bénéficiaire ; une écriture est générée à chaque versement saisi. |
| Encaissements | Partiels, plusieurs par facture, saisis à la main ou remontés par Stripe. |
| Droits | Les rôles compta voient tout. Un associé ou un commercial connecté voit son seul relevé. Freelances et apporteurs reçoivent un relevé PDF, sans accès. |
| Changement de % | Ne vaut que pour les encaissements suivants. Les parts déjà calculées sont figées. Chaque version de règles est conservée. |
| Atomicité | Vraies transactions Mongo. Tests sur `MongoMemoryReplSet`. La prod doit passer en replica set mono-nœud avant la mise en service (opération faite par l'utilisateur). |
| Abonnements | Une facture brouillon par payeur et par période, relue puis émise à la main. |
| Remboursement / avoir après répartition | Régularisation négative des parts. Un restant peut devenir négatif ; il est déduit des versements suivants. |

## 2. Ce qui existe et sur quoi on construit

- `BillingDocument` (QUOTE / INVOICE) porte les factures, en euros décimaux. `createSaleEntryFromBilling` passe l'écriture de vente (journal VE, 411 / 706 / 44571), idempotente par clé `billing:sale:<id>`.
- `createPaymentEntryFromBilling` passe l'encaissement **en totalité** quand la facture devient `PAID` (BQ, 512 / 411). Il n'existe aucun encaissement partiel.
- `createEntry` (`lib/accounting/doubleEntry.ts`) refuse un exercice `CLOTURE` (423) et gère l'idempotence par `idempotencyKey` unique. Il n'accepte pas de session Mongo.
- Aucune transaction Mongo n'est utilisée dans le code aujourd'hui.
- `Project.billing` (`amountInvoiced`, `billingStatus`, `quoteReference`) est saisi à la main.
- Permissions : `view_accounting`, `manage_accounting`, `lock_accounting`, `view_billing`, `manage_billing`.

Principe : **l'écriture comptable reste la source de vérité**. L'espace ajoute des objets métier (payeurs, échéances, encaissements, parts, versements), et chacun de ceux qui bougent de l'argent est adossé à une écriture.

## 3. Conventions de calcul

- Tous les nouveaux montants sont des **centimes entiers** (`…Cents`). Les % sont des **points de base entiers** : 1 bp = 0,01 %, 100 % = 10 000 bp. 33,33 % s'écrit 3 333.
- Conversion depuis les euros décimaux de `BillingDocument` : une seule fonction `toCents(euros)`, qui passe par la représentation à deux décimales pour éviter les erreurs de flottant (1,005 € donne 101 et non 100). Elle est testée.
- Deux arrondis, et seulement deux, dans un module unique (`lib/projectFinance/money.ts`), calculés en `BigInt` pour ne jamais dépasser `Number.MAX_SAFE_INTEGER` :
  - `floorBp(cents, bp)` : part d'un montant, arrondie vers −∞. Sert à toutes les quotes-parts et à toutes les parts de bénéficiaires.
  - `divHalfUp(n, d)` : division arrondie au plus proche, demi vers le haut, symétrique pour les négatifs. Sert à la TVA et à la conversion TTC → HT.
- La TVA d'une facture reste calculée comme aujourd'hui, ligne par ligne, au demi-centime supérieur.
- Dans chaque découpage, **une seule part reçoit le reste** et elle est désignée par la règle. Ainsi la somme tombe juste par construction.

## 4. Règles de calcul, avec exemples

Tous les exemples utilisent un projet fictif « Projet Démo », TVA 20 %.

### R1 — Échéancier en %

Chaque échéance vaut `floorBp(totalHT, %)`, sauf la **dernière (solde)**, qui reçoit le reste. La somme des % doit faire exactement 10 000 bp.

Forfait 9 999,99 € HT, échéancier 33,33 % / 33,33 % / 33,34 % :

| Échéance | % | HT | TVA | TTC |
| --- | --- | ---: | ---: | ---: |
| Acompte | 33,33 % | 3 332,99 | 666,60 | 3 999,59 |
| Jalon maquettes | 33,33 % | 3 332,99 | 666,60 | 3 999,59 |
| Solde | 33,34 % | 3 334,01 | 666,80 | 4 000,81 |
| **Total** | 100 % | **9 999,99** | **2 000,00** | **11 999,99** |

Un forfait simple est un échéancier à une seule échéance de 100 %.

Déclencheur d'une échéance : une date, ou un jalon de projet marqué livré. Une échéance due et non facturée apparaît dans « à facturer ».

### R2 — Répartition d'une échéance entre payeurs

Chaque payeur reçoit `floorBp(HT échéance, quote-part)`, sauf le **payeur principal** (par défaut le client du projet), qui reçoit le reste. Chaque payeur reçoit sa propre facture, avec sa propre TVA. La somme des quotes-parts doit faire 10 000 bp.

Acompte de 3 332,99 € HT, OPCO 70 % / client 30 % (client principal) :

| Payeur | Quote-part | HT | TVA | TTC |
| --- | --- | ---: | ---: | ---: |
| OPCO | 70 % | 2 333,09 | 466,62 | 2 799,71 |
| Client (principal) | 30 % | 999,90 | 199,98 | 1 199,88 |
| **Total** | | **3 332,99** | **666,60** | **3 999,59** |

Les totaux recoupent la ligne « Acompte » de R1 au centime.

### R3 — HT encaissé à partir d'un encaissement TTC

Un encaissement est en TTC ; la répartition se fait sur le HT. Le calcul est **cumulatif par facture**, pour que la somme des HT encaissés retombe exactement sur le HT de la facture :

- `HT cumulé = HT facture` si le cumul encaissé égale le TTC de la facture ;
- sinon `HT cumulé = divHalfUp(cumul encaissé × HT facture, TTC facture)` ;
- HT de l'encaissement = HT cumulé après − HT cumulé avant.

Facture client de l'acompte : 999,90 € HT, 1 199,88 € TTC, payée en trois fois.

| Encaissement | TTC | Cumul TTC | HT cumulé | HT de l'encaissement |
| --- | ---: | ---: | ---: | ---: |
| E1 | 400,00 | 400,00 | 333,33 | 333,33 |
| E2 | 400,00 | 800,00 | 666,67 | 333,34 |
| E3 | 399,88 | 1 199,88 | 999,90 | 333,23 |
| **Total** | **1 199,88** | | | **999,90** |

Un encaissement qui dépasserait le reste dû de la facture est refusé.

**Après un avoir**, R3 s'applique aux montants nets de la facture : HT net = HT facture − HT des avoirs émis, TTC net = TTC facture − TTC des avoirs émis. Pour que ce rapport ne change jamais pendant qu'il y a de l'argent encaissé, un avoir ne se crée ni ne s'émet tant que le cumul encaissé net de la facture n'est pas nul : on rembourse d'abord, puis on émet l'avoir. Un encaissement est refusé tant qu'un avoir en brouillon existe sur la facture.

**Factures payées avant la mise en service de l'espace** : elles portent déjà une écriture d'encaissement globale, sans encaissement détaillé. Leur reste dû est nul ; on n'y saisit ni encaissement ni remboursement, et une correction passe par une écriture manuelle.

### R4 — Répartition d'un encaissement entre bénéficiaires

Pour chaque encaissement, avec la version de règles **en vigueur à sa date** :

- chaque bénéficiaire reçoit `floorBp(HT encaissement, son %)` ;
- la société reçoit le reste.

Règles v1 : commercial 10 %, freelance 35 %, apporteur 5 %, associé A 20 %, associé B 20 % (total 90 %, société 10 %).

E1, base 333,33 € HT :

| Bénéficiaire | % | Calcul exact | Part |
| --- | --- | ---: | ---: |
| Commercial | 10 % | 33,333 | 33,33 |
| Freelance | 35 % | 116,6655 | 116,66 |
| Apporteur | 5 % | 16,6665 | 16,66 |
| Associé A | 20 % | 66,666 | 66,66 |
| Associé B | 20 % | 66,666 | 66,66 |
| Société | reste | 33,333 | 33,36 |
| **Total** | | | **333,33** |

Les centimes perdus par les bénéficiaires (3 centimes ici) vont à la société. Un bénéficiaire perd au plus 1 centime par encaissement. C'est le choix assumé : personne n'est jamais surpayé.

### R5 — Changement de % en cours de projet

Une nouvelle version de règles prend effet à une date, qui ne peut pas précéder le dernier encaissement réparti du projet. Les parts des encaissements antérieurs restent figées.

Règles v2, en vigueur avant E2 : le freelance passe de 35 % à 30 %, le reste est inchangé (société 15 %).

| Bénéficiaire | E1 (v1) base 333,33 | E2 (v2) base 333,34 | E3 (v2) base 333,23 | Total |
| --- | ---: | ---: | ---: | ---: |
| Commercial | 33,33 | 33,33 | 33,32 | 99,98 |
| Freelance | 116,66 | 100,00 | 99,96 | 316,62 |
| Apporteur | 16,66 | 16,66 | 16,66 | 49,98 |
| Associé A | 66,66 | 66,66 | 66,64 | 199,96 |
| Associé B | 66,66 | 66,66 | 66,64 | 199,96 |
| Société | 33,36 | 50,03 | 50,01 | 133,40 |
| **Total** | **333,33** | **333,34** | **333,23** | **999,90** |

### R6 — Remboursement après répartition

Un remboursement est un encaissement négatif, **imputé sur un encaissement précis**. Son HT se calcule avec R3 (le cumul TTC de la facture baisse). Les parts sont recalculées sur le reste net de l'encaissement imputé, avec la version de règles de cet encaissement :

`régularisation = floorBp(base − HT remboursé, %) − floorBp(base, %)`, et la société prend le reste.

Ainsi un remboursement total annule exactement les parts d'origine, au centime.

Remboursement de 150,00 € TTC sur la facture déjà soldée, imputé sur E1 :

- HT cumulé : 1 049,88 € TTC encaissés nets, donc `divHalfUp(104 988 × 99 990, 119 988)` = 874,90 € ; HT remboursé = 999,90 − 874,90 = **125,00 €**.
- Base nette de E1 : 333,33 − 125,00 = 208,33 €.

| Bénéficiaire | Part E1 | Part recalculée sur 208,33 | Régularisation |
| --- | ---: | ---: | ---: |
| Commercial | 33,33 | 20,83 | −12,50 |
| Freelance | 116,66 | 72,91 | −43,75 |
| Apporteur | 16,66 | 10,41 | −6,25 |
| Associé A | 66,66 | 41,66 | −25,00 |
| Associé B | 66,66 | 41,66 | −25,00 |
| Société | 33,36 | 20,86 | −12,50 |
| **Total** | **333,33** | **208,33** | **−125,00** |

Le HT remboursé se calcule par R3 au niveau de la facture ; il peut donc dépasser d'un ou deux centimes la base nette de l'encaissement imputé (les deux HT ont été arrondis à des cumuls différents). Les parts des bénéficiaires se régularisent alors sur la base nette entière, et l'excédent s'ajoute à la part négative de la société. Au-delà de deux centimes, le remboursement est refusé : ce serait une incohérence, pas un arrondi.

### R7 — Relevé d'un bénéficiaire

`dû = Σ parts (régularisations comprises)`, `versé = Σ versements HT`, `restant = dû − versé`. Le restant peut être négatif après un remboursement.

Relevé du freelance sur « Projet Démo », après R5, R6 et un versement :

| Ligne | Montant HT |
| --- | ---: |
| Part E1 | 116,66 |
| Part E2 | 100,00 |
| Part E3 | 99,96 |
| Régularisation remboursement E1 | −43,75 |
| **Dû** | **272,87** |
| Versement du 15/11 (facture FL-0042) | −116,66 |
| **Restant** | **156,21** |

Contrôle projet : la somme de toutes les parts, société comprise, égale le HT encaissé net (999,90 − 125,00 = 874,90 €). Ce contrôle est un invariant testé.

### R8 — Versement et écriture

Une part est un montant HT. Le versement saisit le HT, la TVA éventuelle de la facture du bénéficiaire, la date, la référence et le mode (`BANQUE` ou `PAIE`).

Versement au freelance de 116,66 € HT + TVA 20 % = 23,33 €, soit 139,99 € TTC (journal AC puis BQ, ou une écriture BQ unique, à trancher avec l'expert-comptable) :

| Compte | Débit | Crédit |
| --- | ---: | ---: |
| 604 Sous-traitance (compte du bénéficiaire) | 116,66 | |
| 44566 TVA déductible | 23,33 | |
| 512 Banque | | 139,99 |
| **Total** | **139,99** | **139,99** |

Mode `PAIE` (commercial salarié) : le versement est tracé dans le relevé, sans écriture ; la commission passe par la paie.

**Plafond** : le HT d'un versement ne dépasse jamais le restant du bénéficiaire, tous projets confondus, ni, s'il est rattaché à un projet, le restant sur ce projet. Un restant négatif, né d'un remboursement, bloque donc les versements jusqu'à ce que de nouvelles parts le couvrent.

**Erreur de saisie** : un versement ne se modifie pas ; on l'annule par une contre-passation intégrale (écriture inverse à la date de l'annulation), une seule fois, puis on saisit le bon versement.

Les écritures de versement ne sont pas rattachées au projet en analytique : une part reversée n'est pas un coût direct, elle ne compte pas dans la marge (R10).

### R9 — Abonnement

Montant HT par période (mensuelle, trimestrielle, annuelle), date de début, date de fin facultative. À chaque échéance, une facture brouillon par payeur (découpage R2). Pas de prorata : la première période commence à la date de début. Une période déjà générée ne l'est jamais deux fois (clé d'idempotence `abonnement:<projet>:<période>:<payeur>`).

Exemple : maintenance 150,00 € HT par mois, client seul, du 1er novembre : le 1er de chaque mois, un brouillon de 150,00 € HT, 30,00 € de TVA, 180,00 € TTC.

### R10 — Marge

`marge = HT encaissé net − coûts directs`. Les coûts directs sont les lignes de classe 6 rattachées au projet (voir § 5). La fiche affiche aussi le montant reversé aux bénéficiaires et ce qui reste à la société.

Exemple : HT encaissé net 874,90 €, licences 200,00 € HT, donc marge 674,90 €.

## 5. Modèle de données proposé

Nouveaux modèles (montants en centimes, % en bp) :

- **`ProjectFinance`** (un par projet) : mode (`FORFAIT`, `ECHEANCIER`, `ABONNEMENT`), total HT du contrat, taux de TVA par défaut, échéances (`label`, `percentBp`, déclencheur date ou jalon, statut, factures liées), abonnement (`amountHtCents`, période, début, fin, prochaine échéance), payeurs (`kind` client / tiers / filiale, référence, `shareBp`, payeur principal, coordonnées de facturation, moyen de paiement : virement, CB, prélèvement, Stripe), date d'activation de la répartition.
- **`Beneficiary`** : type (associé, commercial, freelance, apporteur), utilisateur Venio lié s'il est interne, nom, e-mail, SIRET, assujetti TVA, compte de charge par défaut, mode de versement (`BANQUE` ou `PAIE`).
- **`ShareTemplate`** : modèle de règles réutilisable (nom, liste bénéficiaire → bp).
- **`ShareRuleVersion`** : version immuable des règles d'un projet (numéro, date d'effet, règles, auteur, motif).
- **`ProjectPayment`** (encaissement) : facture, payeur, montant TTC signé (négatif pour un remboursement), HT calculé (R3), moyen, date, référence, encaissement imputé (pour un remboursement), version de règles appliquée, écriture liée, source (`MANUAL` ou `STRIPE`), clé d'idempotence unique.
- **`ShareAllocation`** : une ligne par bénéficiaire et par encaissement, société comprise (montant signé, bp appliqué, version).
- **`ShareSettlement`** (versement) : bénéficiaire, projet facultatif, HT, TVA, date, référence de sa facture, mode, écriture liée.

Modifications de l'existant :

- `BillingDocument` : instantané du `payer`, lien vers l'échéance ou la période d'abonnement (`financeLink`) et clé d'unicité (`financeKey`), statut `PARTIALLY_PAID`, lien vers la facture d'origine pour un avoir. Un avoir suit la convention déjà en place dans Venio (PDF, Factur-X) : une facture `INVOICE` à montants négatifs, ce qui nette naturellement les totaux de tous les écrans existants.
- Les montants d'une facture émise, ou issue d'un échéancier, ne se modifient plus : on corrige par un avoir.
- `AccountingLine` : champ analytique facultatif `project`, pour rattacher un coût ou un produit à un projet.
- `createEntry` et `createSaleEntryFromBilling` : paramètre `session` facultatif pour les transactions.
- Passage de facture à `PAID` : il crée un `ProjectPayment` pour le reste dû, au lieu de l'écriture en totalité actuelle. Sinon, un même encaissement serait compté deux fois.
- `Project.billing` devient calculé depuis les factures ; la saisie manuelle disparaît.

## 6. Écritures générées

| Événement | Journal | Écriture | Clé d'idempotence |
| --- | --- | --- | --- |
| Facture émise | VE | existante : 411 / 706 / 44571, tiers = payeur | `billing:sale:<facture>` |
| Avoir émis | VE | inverse de la facture (706 et 44571 au débit, 411 au crédit) | `billing:sale:<avoir>` |
| Encaissement | BQ | 512 (ou compte Stripe) / 411, lettrage partiel | `payment:<encaissement>` |
| Remboursement | BQ | 411 / 512 | `payment:<encaissement>` |
| Versement `BANQUE` | BQ (ou AC + BQ) | compte du bénéficiaire + 44566 / 512 | `settlement:<versement>` |
| Coût direct saisi dans l'espace | AC | 6xx + 44566 / 401, ligne analytique projet | `cost:<coût>` |

Chaque génération :

- s'exécute dans **une transaction** avec l'objet métier et ses parts : un encaissement, ses `ShareAllocation` et son écriture passent ensemble ou pas du tout ;
- est **idempotente** : rejouer la même requête rend le même résultat, sans doublon ;
- est **refusée** si la date tombe dans un exercice clôturé (423), et l'encaissement n'est alors pas enregistré.

## 7. Suivi et sorties

**Fiche comptable du projet** (onglet du projet) : mode, payeurs, échéancier ou abonnement, factures, encaissements, règles et historique des versions, parts par bénéficiaire, coûts, marge. Indicateurs : facturé, encaissé, reste à facturer, reste à encaisser, en retard.

**Tableau de bord de l'espace** : totaux sur tous les projets, factures en retard avec relance, à facturer (échéances dues, brouillons d'abonnement), prévisionnel de trésorerie sur 6 et 12 mois (échéances à venir, abonnements, factures ouvertes à leur date d'échéance), restant dû par bénéficiaire.

**Relevé bénéficiaire** : à l'écran (rôles compta, ou le bénéficiaire lui-même s'il est interne) et en PDF.

**Exports** : CSV des encaissements, des parts et des versements ; FEC existant (les nouvelles écritures y figurent naturellement) ; relevé PDF.

Définitions :

- facturé = Σ HT des factures émises − Σ HT des avoirs ;
- reste à facturer = total HT du contrat − facturé (abonnement : périodes échues non facturées) ;
- reste à encaisser = Σ TTC émis − Σ encaissements nets ;
- en retard = facture dont l'échéance est passée et le reste à encaisser positif.

## 8. Droits

- `view_accounting` : lecture de tout l'espace. `manage_accounting` : saisie (payeurs, règles, encaissements, versements, coûts).
- Un utilisateur interne lié à un `Beneficiary` voit **uniquement** son relevé, via une route dédiée (`/me`), jamais les parts des autres ni les montants du projet au-delà de sa base.
- Un ADMIN sans `view_accounting` ne voit rien de l'espace.
- Freelances et apporteurs : aucun accès, relevé PDF.

## 9. Découpage en lots

0. **Socle** : `MongoMemoryReplSet` dans les tests, helper de transaction, module `money.ts` (`toCents`, `floorBp`, `divHalfUp`) et tests de R1 à R7 avec les exemples ci-dessus.
1. **Modèles et règles** : `ProjectFinance`, `Beneficiary`, `ShareTemplate`, `ShareRuleVersion`, routes CRUD, validations (somme des quotes-parts = 100 %, somme des parts ≤ 100 %).
2. **Facturation** : échéancier vers factures par payeur, avoirs, brouillons d'abonnement.
3. **Encaissements** : encaissements partiels et remboursements, parts, écritures BQ, le tout en transaction ; raccord avec le passage à `PAID`.
4. **Versements et coûts** : versements et leurs écritures, coûts directs analytiques, marge.
5. **Écrans** : fiche projet, tableau de bord, relevés, modèles de règles.
6. **Exports et Stripe** : CSV, relevé PDF, remontée des paiements Stripe (mini-cadrage dédié au rapprochement facture ↔ paiement Stripe).

## 10. Points ouverts

À valider avec l'expert-comptable, sans bloquer les lots 0 à 3 (les comptes sont paramétrables par bénéficiaire) :

- Compte des parts d'associés : honoraires facturés par leur structure (622) ou compte courant d'associé (455). Une répartition de résultat entre associés projet par projet n'a pas de traduction comptable directe ; il faut savoir comment ils sont réellement payés.
- Versement : écriture BQ unique, ou facture du bénéficiaire en AC puis règlement en BQ.
- Compte d'attente Stripe et frais (627).

À trancher plus tard :

- Historique : par défaut, pas de répartition rétroactive. Chaque projet a une date d'activation, et seuls les encaissements postérieurs sont répartis.
- Exposition dans l'API agent (`/api/v1/agent/*`) et lecture depuis l'app Mac : hors périmètre de ce chantier.

## 11. Lot 6 — exports et Stripe (cadrage du 25 octobre 2026, à valider)

### Décisions

| Sujet | Décision |
| --- | --- |
| Paiement Stripe | Lien de paiement par facture, créé par Venio (Stripe Checkout). |
| Comptabilisation | Compte d'attente Stripe et frais : le paiement passe par 512800, la commission en 627800, le virement de Stripe vers la banque solde l'attente. |
| Remboursements | Faits dans le tableau de bord Stripe uniquement. Venio ne déclenche jamais de sortie d'argent chez Stripe ; il enregistre le remboursement que Stripe lui notifie. |
| Exports | Relevé bénéficiaire PDF, fiche projet PDF, CSV des encaissements et des parts, CSV des versements et des coûts. |

### Paiement par lien

- Chaque facture émise avec un reste dû peut porter un **lien de paiement Venio** permanent : une URL publique à jeton secret (stocké haché, comme les liens des testeurs beta), reprise dans l'e-mail et le PDF. Un clic crée une session Stripe Checkout pour le **reste dû du moment**, en euros, avec l'identifiant de la facture en métadonnée, puis redirige vers Stripe. Une facture soldée, annulée ou couverte par un avoir en brouillon n'ouvre plus de session.
- Une seule session ouverte à la fois par facture ; toute session précédente est expirée chez Stripe quand une nouvelle est créée ou qu'un autre encaissement arrive.
- Une session déjà terminée dont le paiement a réussi ou est encore en cours (prélèvement), sans encaissement enregistré, **bloque** toute nouvelle session et tout encaissement manuel jusqu'à l'arrivée du webhook : c'est la seule façon d'empêcher un double débit du client. Créer un avoir ou annuler la facture expire d'abord la session ouverte.
- L'encaissement est daté du jour où Stripe constate les fonds (transaction de solde), pas de la création du paiement.
- Le paiement remonte par **webhook signé** (`checkout.session.completed`, payé). Venio vérifie la signature, enregistre l'événement une seule fois (identifiant d'événement unique), récupère la commission sur la transaction de solde Stripe, puis enregistre l'encaissement par le circuit existant (R3 et R4, parts comprises), méthode et source `STRIPE`, clé d'idempotence liée au paiement Stripe.
- Tout cas anormal ne s'enregistre pas en silence : montant supérieur au reste dû, facture annulée ou introuvable, exercice clôturé, devise autre que l'euro, contestation (`charge.dispute.*`). L'événement part dans une **file Stripe à traiter**, visible dans l'espace comptable, avec le motif et un bouton pour rejouer une fois le problème réglé.

### Écritures Stripe

Exemple : la facture client de 1 199,88 € TTC est payée par carte ; Stripe retient 18,25 € de commission.

| Événement | Compte | Débit | Crédit |
| --- | --- | ---: | ---: |
| Paiement | 512800 Stripe, compte d'attente | 1 181,63 | |
| | 627800 Commissions sur paiements | 18,25 | |
| | 411 Client | | 1 199,88 |
| Virement Stripe vers la banque | 512000 Banque | 1 181,63 | |
| | 512800 Stripe, compte d'attente | | 1 181,63 |

Le reste dû de la facture baisse du **brut** (1 199,88 €) : la commission est une charge de Venio, pas une remise au client. Les parts se calculent sur le HT encaissé, comme pour tout encaissement. Un remboursement notifié par Stripe passe 411 au débit et 512800 au crédit pour le montant remboursé ; Stripe ne rend pas la commission, qui reste en charge. Il régularise les parts selon R6, imputé sur l'encaissement Stripe d'origine.

Le compte 512800 est ajouté au plan comptable par défaut. La TVA sur la commission Stripe (facturée depuis l'Irlande, autoliquidation) est **hors périmètre** : à traiter avec l'expert-comptable.

### Sécurité

- Clés Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) en variables d'environnement uniquement, jamais en base ni dans les journaux. En développement et en tests, mode test Stripe ; les tests simulent Stripe et signent leurs webhooks avec la bibliothèque officielle.
- La route du webhook lit le corps brut, refuse toute signature invalide ou trop ancienne et ne fait confiance à aucun montant reçu sans l'avoir relu par l'API Stripe.
- Le lien public de paiement ne révèle que le numéro de la facture, le nom du payeur et le reste dû ; il est limité en débit.

### Exports

- **Relevé bénéficiaire PDF** : dû, versé, restant, détail par projet, parts et versements, sur une période ; dans le style des factures existantes.
- **Fiche projet PDF** : facturé, encaissé, reste à encaisser, coûts directs, marge, échéancier, parts par bénéficiaire.
- **CSV** (séparateur point-virgule, montants en euros avec virgule, encodage UTF-8 avec BOM pour Excel) : encaissements et remboursements avec leurs parts ; versements et coûts directs. Filtres par période et par projet.
- Droits : `view_accounting` ; le relevé personnel PDF est aussi accessible depuis « Mon relevé ».

### Découpage

- **6a — exports** (sans argent en mouvement) : effort `high`.
- **6b — Stripe** (argent réel entrant, webhook, signature, idempotence) : effort `xhigh` recommandé, contre-audit Astra ciblé sur le webhook et les rapprochements.
- Avant la mise en prod de 6b : compte Stripe en mode live, webhook déclaré dans le tableau de bord Stripe, clés posées sur le serveur. Ces trois opérations sont à faire par l'utilisateur.
