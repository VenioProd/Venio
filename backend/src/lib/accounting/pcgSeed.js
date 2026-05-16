/**
 * Plan comptable général (PCG) — sélection adaptée à une agence digitale.
 * Chaque entrée : code, label, accountClass (1..7), type, isLettrable.
 *
 * Types :
 *  - CAPITAUX (classe 1 hors comptes spécifiques de tiers)
 *  - ACTIF (classes 2, 3, 4 actif et 5 trésorerie côté actif)
 *  - PASSIF (classes 1, 4 passif)
 *  - CHARGE (classe 6)
 *  - PRODUIT (classe 7)
 *  - SPECIAL (classes 8, 9 hors usage courant)
 *
 * isLettrable : comptes de tiers (411 clients, 401 fournisseurs, certains 4xx)
 *
 * Note : pour une agence digitale, on inclut les comptes les plus
 * couramment utilisés (prestations 706, sous-traitance 604, achats
 * informatiques, frais bancaires, charges externes, immobilisations
 * incorporelles, capitaux propres, etc.).
 */

const PCG_AGENCE = [
  // ---- Classe 1 : Capitaux ----
  { code: '101000', label: 'Capital social', accountClass: 1, type: 'CAPITAUX' },
  { code: '106100', label: 'Réserve légale', accountClass: 1, type: 'CAPITAUX' },
  { code: '106800', label: 'Autres réserves', accountClass: 1, type: 'CAPITAUX' },
  { code: '108000', label: "Compte de l'exploitant", accountClass: 1, type: 'CAPITAUX' },
  { code: '110000', label: 'Report à nouveau (solde créditeur)', accountClass: 1, type: 'CAPITAUX' },
  { code: '119000', label: 'Report à nouveau (solde débiteur)', accountClass: 1, type: 'CAPITAUX' },
  { code: '120000', label: 'Résultat de l’exercice (bénéfice)', accountClass: 1, type: 'CAPITAUX' },
  { code: '129000', label: 'Résultat de l’exercice (perte)', accountClass: 1, type: 'CAPITAUX' },
  { code: '164000', label: 'Emprunts auprès des établissements de crédit', accountClass: 1, type: 'PASSIF' },
  { code: '168800', label: 'Intérêts courus sur emprunts', accountClass: 1, type: 'PASSIF' },

  // ---- Classe 2 : Immobilisations ----
  { code: '201000', label: 'Frais d’établissement', accountClass: 2, type: 'ACTIF' },
  { code: '203000', label: 'Frais de recherche et développement', accountClass: 2, type: 'ACTIF' },
  { code: '205000', label: 'Logiciels, brevets, licences', accountClass: 2, type: 'ACTIF' },
  { code: '211000', label: 'Terrains', accountClass: 2, type: 'ACTIF' },
  { code: '213000', label: 'Constructions', accountClass: 2, type: 'ACTIF' },
  { code: '218300', label: 'Matériel informatique', accountClass: 2, type: 'ACTIF' },
  { code: '218400', label: 'Mobilier de bureau', accountClass: 2, type: 'ACTIF' },
  { code: '218500', label: 'Cheptel, autres immobilisations corporelles', accountClass: 2, type: 'ACTIF' },
  { code: '275000', label: 'Dépôts et cautionnements versés', accountClass: 2, type: 'ACTIF' },
  { code: '280500', label: 'Amortissements des logiciels', accountClass: 2, type: 'ACTIF' },
  { code: '281830', label: 'Amortissements du matériel informatique', accountClass: 2, type: 'ACTIF' },
  { code: '281840', label: 'Amortissements du mobilier', accountClass: 2, type: 'ACTIF' },

  // ---- Classe 4 : Comptes de tiers ----
  { code: '401000', label: 'Fournisseurs', accountClass: 4, type: 'PASSIF', isLettrable: true },
  { code: '404000', label: "Fournisseurs d'immobilisations", accountClass: 4, type: 'PASSIF', isLettrable: true },
  { code: '408000', label: 'Fournisseurs - Factures non parvenues', accountClass: 4, type: 'PASSIF', isLettrable: true },
  { code: '409000', label: 'Fournisseurs débiteurs (avances)', accountClass: 4, type: 'ACTIF', isLettrable: true },
  { code: '411000', label: 'Clients', accountClass: 4, type: 'ACTIF', isLettrable: true },
  { code: '413000', label: 'Clients - Effets à recevoir', accountClass: 4, type: 'ACTIF', isLettrable: true },
  { code: '416000', label: 'Clients douteux ou litigieux', accountClass: 4, type: 'ACTIF', isLettrable: true },
  { code: '418000', label: 'Clients - Produits non encore facturés', accountClass: 4, type: 'ACTIF', isLettrable: true },
  { code: '419000', label: 'Clients créditeurs (acomptes reçus)', accountClass: 4, type: 'PASSIF', isLettrable: true },
  { code: '421000', label: 'Personnel - Rémunérations dues', accountClass: 4, type: 'PASSIF' },
  { code: '425000', label: 'Personnel - Avances et acomptes', accountClass: 4, type: 'ACTIF' },
  { code: '431000', label: 'Sécurité sociale', accountClass: 4, type: 'PASSIF' },
  { code: '437000', label: 'Autres organismes sociaux', accountClass: 4, type: 'PASSIF' },
  { code: '442000', label: 'État - Impôts et taxes recouvrables sur des tiers', accountClass: 4, type: 'PASSIF' },
  { code: '444000', label: 'État - Impôt sur les bénéfices', accountClass: 4, type: 'PASSIF' },
  { code: '445510', label: 'TVA à décaisser', accountClass: 4, type: 'PASSIF' },
  { code: '445660', label: 'TVA déductible sur autres biens et services', accountClass: 4, type: 'ACTIF' },
  { code: '445620', label: 'TVA déductible sur immobilisations', accountClass: 4, type: 'ACTIF' },
  { code: '445710', label: 'TVA collectée', accountClass: 4, type: 'PASSIF' },
  { code: '445800', label: 'TVA à régulariser', accountClass: 4, type: 'PASSIF' },
  { code: '447000', label: 'Autres impôts, taxes et versements assimilés', accountClass: 4, type: 'PASSIF' },
  { code: '455000', label: 'Associés - Comptes courants', accountClass: 4, type: 'PASSIF' },
  { code: '467000', label: 'Autres comptes débiteurs ou créditeurs', accountClass: 4, type: 'PASSIF', isLettrable: true },
  { code: '471000', label: "Compte d'attente", accountClass: 4, type: 'PASSIF', isLettrable: true },
  { code: '486000', label: 'Charges constatées d’avance', accountClass: 4, type: 'ACTIF' },
  { code: '487000', label: 'Produits constatés d’avance', accountClass: 4, type: 'PASSIF' },

  // ---- Classe 5 : Comptes financiers ----
  { code: '512000', label: 'Banque (compte principal)', accountClass: 5, type: 'ACTIF', isLettrable: true },
  { code: '514000', label: 'Chèques postaux', accountClass: 5, type: 'ACTIF', isLettrable: true },
  { code: '517000', label: 'Stripe / passerelles de paiement', accountClass: 5, type: 'ACTIF', isLettrable: true },
  { code: '530000', label: 'Caisse', accountClass: 5, type: 'ACTIF' },
  { code: '580000', label: 'Virements internes', accountClass: 5, type: 'ACTIF', isLettrable: true },

  // ---- Classe 6 : Charges ----
  { code: '601000', label: 'Achats de matières premières', accountClass: 6, type: 'CHARGE' },
  { code: '604000', label: "Achats d'études et prestations de services (sous-traitance)", accountClass: 6, type: 'CHARGE' },
  { code: '606300', label: 'Fournitures d’entretien et de petit équipement', accountClass: 6, type: 'CHARGE' },
  { code: '606400', label: 'Fournitures administratives', accountClass: 6, type: 'CHARGE' },
  { code: '606800', label: 'Autres matières et fournitures', accountClass: 6, type: 'CHARGE' },
  { code: '611000', label: 'Sous-traitance générale', accountClass: 6, type: 'CHARGE' },
  { code: '613200', label: 'Locations immobilières', accountClass: 6, type: 'CHARGE' },
  { code: '613500', label: 'Locations mobilières (matériel)', accountClass: 6, type: 'CHARGE' },
  { code: '614000', label: 'Charges locatives et de copropriété', accountClass: 6, type: 'CHARGE' },
  { code: '615000', label: 'Entretien et réparations', accountClass: 6, type: 'CHARGE' },
  { code: '616000', label: 'Primes d’assurances', accountClass: 6, type: 'CHARGE' },
  { code: '618100', label: 'Documentation générale', accountClass: 6, type: 'CHARGE' },
  { code: '618300', label: 'Documentation technique', accountClass: 6, type: 'CHARGE' },
  { code: '621000', label: 'Personnel extérieur à l’entreprise', accountClass: 6, type: 'CHARGE' },
  { code: '622600', label: 'Honoraires (expert-comptable, avocat, conseils)', accountClass: 6, type: 'CHARGE' },
  { code: '623000', label: 'Publicité, publications, relations publiques', accountClass: 6, type: 'CHARGE' },
  { code: '623400', label: 'Cadeaux à la clientèle', accountClass: 6, type: 'CHARGE' },
  { code: '624000', label: 'Transports de biens et transports collectifs', accountClass: 6, type: 'CHARGE' },
  { code: '625100', label: 'Voyages et déplacements', accountClass: 6, type: 'CHARGE' },
  { code: '625600', label: 'Missions', accountClass: 6, type: 'CHARGE' },
  { code: '625700', label: 'Réceptions', accountClass: 6, type: 'CHARGE' },
  { code: '626100', label: 'Frais postaux et télécoms', accountClass: 6, type: 'CHARGE' },
  { code: '626500', label: 'Frais d’hébergement web et SaaS', accountClass: 6, type: 'CHARGE' },
  { code: '626800', label: 'Autres frais postaux et de télécommunications', accountClass: 6, type: 'CHARGE' },
  { code: '627000', label: 'Services bancaires et assimilés', accountClass: 6, type: 'CHARGE' },
  { code: '627100', label: 'Frais sur titres', accountClass: 6, type: 'CHARGE' },
  { code: '627800', label: 'Commissions sur paiements (Stripe, PSP)', accountClass: 6, type: 'CHARGE' },
  { code: '628100', label: 'Cotisations professionnelles', accountClass: 6, type: 'CHARGE' },
  { code: '628600', label: 'Divers (formation, abonnements)', accountClass: 6, type: 'CHARGE' },
  { code: '631100', label: 'Taxe sur les salaires', accountClass: 6, type: 'CHARGE' },
  { code: '633000', label: 'Impôts et taxes sur rémunérations', accountClass: 6, type: 'CHARGE' },
  { code: '635100', label: 'CFE - Cotisation foncière des entreprises', accountClass: 6, type: 'CHARGE' },
  { code: '635300', label: 'CVAE', accountClass: 6, type: 'CHARGE' },
  { code: '637800', label: 'Autres impôts et taxes', accountClass: 6, type: 'CHARGE' },
  { code: '641100', label: 'Salaires et appointements', accountClass: 6, type: 'CHARGE' },
  { code: '641400', label: 'Indemnités et avantages divers', accountClass: 6, type: 'CHARGE' },
  { code: '645100', label: 'Cotisations URSSAF', accountClass: 6, type: 'CHARGE' },
  { code: '645300', label: 'Cotisations retraite', accountClass: 6, type: 'CHARGE' },
  { code: '645400', label: 'Cotisations mutuelle / prévoyance', accountClass: 6, type: 'CHARGE' },
  { code: '647000', label: 'Autres charges sociales', accountClass: 6, type: 'CHARGE' },
  { code: '651600', label: "Droits d'auteur et redevances", accountClass: 6, type: 'CHARGE' },
  { code: '658000', label: 'Charges diverses de gestion courante', accountClass: 6, type: 'CHARGE' },
  { code: '661000', label: 'Charges d’intérêts', accountClass: 6, type: 'CHARGE' },
  { code: '666000', label: 'Pertes de change', accountClass: 6, type: 'CHARGE' },
  { code: '671000', label: 'Charges exceptionnelles sur opérations de gestion', accountClass: 6, type: 'CHARGE' },
  { code: '675000', label: 'Valeurs comptables des éléments d’actif cédés', accountClass: 6, type: 'CHARGE' },
  { code: '678000', label: 'Autres charges exceptionnelles', accountClass: 6, type: 'CHARGE' },
  { code: '681100', label: 'Dotations aux amortissements sur immobilisations', accountClass: 6, type: 'CHARGE' },
  { code: '695000', label: "Impôt sur les bénéfices", accountClass: 6, type: 'CHARGE' },

  // ---- Classe 7 : Produits ----
  { code: '706000', label: 'Prestations de services', accountClass: 7, type: 'PRODUIT' },
  { code: '706100', label: 'Prestations - Communication & marketing', accountClass: 7, type: 'PRODUIT' },
  { code: '706200', label: 'Prestations - Développement web/logiciel', accountClass: 7, type: 'PRODUIT' },
  { code: '706300', label: 'Prestations - Conseil & stratégie', accountClass: 7, type: 'PRODUIT' },
  { code: '707000', label: 'Ventes de marchandises', accountClass: 7, type: 'PRODUIT' },
  { code: '708000', label: 'Produits des activités annexes', accountClass: 7, type: 'PRODUIT' },
  { code: '708500', label: 'Ports et frais accessoires facturés', accountClass: 7, type: 'PRODUIT' },
  { code: '708900', label: 'Bonis et reprises', accountClass: 7, type: 'PRODUIT' },
  { code: '709000', label: 'Rabais, remises et ristournes accordés', accountClass: 7, type: 'PRODUIT' },
  { code: '758000', label: 'Produits divers de gestion courante', accountClass: 7, type: 'PRODUIT' },
  { code: '761000', label: 'Produits de participations', accountClass: 7, type: 'PRODUIT' },
  { code: '768000', label: 'Autres produits financiers', accountClass: 7, type: 'PRODUIT' },
  { code: '770000', label: 'Produits exceptionnels', accountClass: 7, type: 'PRODUIT' },
  { code: '775000', label: 'Produits des cessions d’éléments d’actif', accountClass: 7, type: 'PRODUIT' },
  { code: '791000', label: "Transferts de charges d'exploitation", accountClass: 7, type: 'PRODUIT' },
]

const DEFAULT_JOURNALS = [
  { code: 'VE', label: 'Journal des ventes', type: 'VENTE', isSystem: true },
  { code: 'AC', label: 'Journal des achats', type: 'ACHAT', isSystem: true },
  { code: 'BQ', label: 'Journal de banque', type: 'BANQUE', counterAccount: '512000', isSystem: true },
  { code: 'CA', label: 'Journal de caisse', type: 'CAISSE', counterAccount: '530000', isSystem: true },
  { code: 'OD', label: 'Opérations diverses', type: 'OD', isSystem: true },
  { code: 'AN', label: 'À-nouveaux', type: 'AN', isSystem: true },
]

const DEFAULT_VAT_RATES = [
  {
    code: 'NORMAL',
    label: 'TVA normale 20 %',
    rate: 20,
    collectedAccount: '445710',
    deductibleAccount: '445660',
    declarationLine: '08',
    legend: 'Taux normal applicable à la majorité des biens et services.',
  },
  {
    code: 'INTERMEDIAIRE',
    label: 'TVA intermédiaire 10 %',
    rate: 10,
    collectedAccount: '445710',
    deductibleAccount: '445660',
    declarationLine: '09',
    legend: 'Restauration, hôtellerie, transports de voyageurs, etc.',
  },
  {
    code: 'REDUIT',
    label: 'TVA réduite 5,5 %',
    rate: 5.5,
    collectedAccount: '445710',
    deductibleAccount: '445660',
    declarationLine: '9B',
    legend: 'Produits de première nécessité, livres, etc.',
  },
  {
    code: 'SUPER_REDUIT',
    label: 'TVA super réduite 2,1 %',
    rate: 2.1,
    collectedAccount: '445710',
    deductibleAccount: '445660',
    declarationLine: '9C',
    legend: 'Médicaments remboursables, presse, etc.',
  },
  {
    code: 'EXONERE',
    label: 'Exonéré de TVA',
    rate: 0,
    collectedAccount: '',
    deductibleAccount: '',
    declarationLine: '',
    legend: 'Opération exonérée — TVA non applicable, art. 293 B du CGI ou autre.',
  },
]

export { PCG_AGENCE, DEFAULT_JOURNALS, DEFAULT_VAT_RATES }

/**
 * Insère tous les comptes/journaux/taux par défaut s'ils n'existent pas.
 * Idempotent : safe à relancer.
 */
export async function seedAccountingDefaults({ ChartOfAccount, Journal, VatRate }) {
  const created = { accounts: 0, journals: 0, vatRates: 0 }

  for (const account of PCG_AGENCE) {
    const existing = await ChartOfAccount.findOne({ code: account.code })
    if (existing) continue
    await ChartOfAccount.create({
      code: account.code,
      label: account.label,
      accountClass: account.accountClass,
      type: account.type,
      isLettrable: Boolean(account.isLettrable),
      isActive: true,
    })
    created.accounts += 1
  }

  for (const journal of DEFAULT_JOURNALS) {
    const existing = await Journal.findOne({ code: journal.code })
    if (existing) continue
    await Journal.create(journal)
    created.journals += 1
  }

  for (const vatRate of DEFAULT_VAT_RATES) {
    const existing = await VatRate.findOne({ code: vatRate.code })
    if (existing) continue
    await VatRate.create(vatRate)
    created.vatRates += 1
  }

  return created
}
