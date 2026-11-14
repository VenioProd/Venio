// Moment « Suivre » du CRM (lot 3 de la refonte) : pipeline, comptes clients, partenaires.
const crmSuivre = {
  'crmSuivre.pipeline.lede':
    '{count, plural, =0 {Aucun lead ouvert} one {# lead ouvert} other {# leads ouverts}} pour {open}, dont {weighted} une fois pondérés par l’avancement de chaque lead.',
  'crmSuivre.pipeline.viewAria': 'Affichage du pipeline',
  'crmSuivre.pipeline.viewTable': 'Tableau',
  'crmSuivre.pipeline.viewKanban': 'Kanban',
  'crmSuivre.pipeline.filtersAria': 'Filtres du pipeline',
  'crmSuivre.pipeline.quickViewsAria': 'Vues rapides',
  'crmSuivre.stat.count': 'leads ouverts',
  'crmSuivre.stat.open': 'montant total',
  'crmSuivre.stat.weighted': 'pondéré',
  'crmSuivre.stat.won': 'gagné',
  'crmSuivre.stat.wonHint': '{count, plural, =0 {aucun deal} one {# deal} other {# deals}}',
  'crmSuivre.stat.idle': 'sans activité depuis 7 j',
  'crmSuivre.stat.late': 'relances en retard',
  'crmSuivre.stat.lateNone': 'tout est à jour',
  'crmSuivre.kanban.hint':
    'Glissez une carte dans une autre colonne pour changer le statut du lead. Les montants et la pondération se recalculent.',
  'crmSuivre.kanban.columnsAria': 'Colonnes du pipeline',
  'crmSuivre.kanban.columnAria': '{status}, {count, plural, =0 {aucun lead} one {# lead} other {# leads}}',
  'crmSuivre.kanban.weighting': 'Pondération {percent} %',
  'crmSuivre.kanban.weighted': '{amount} pondérés',
  'crmSuivre.chip.lateDays': 'Relance en retard de {count, plural, one {# jour} other {# jours}}',
  'crmSuivre.chip.late': 'Relance en retard',
  'crmSuivre.chip.lateShort': 'En retard',
  'crmSuivre.chip.hold': 'Retenue pour opposition à décider',
  'crmSuivre.chip.holdShort': 'Retenue',
  'crmSuivre.chip.handoff': 'Transmise au closer',
  'crmSuivre.table.empty.text': 'Modifiez les filtres ou effacez la recherche pour revoir les leads.',
  'crmSuivre.table.empty.action': 'Réinitialiser les filtres',
  'crmSuivre.accounts.lede':
    'Un compte naît quand un lead est converti en client depuis sa fiche. Retrouvez ici l’état, la santé et le responsable de chaque compte.',
  'crmSuivre.accounts.note':
    'Un compte client ouvre l’espace client, les devis et les factures : tout ce qui suit la signature se gère dans Projets et Comptabilité.',
  'crmSuivre.accounts.filtersAria': 'Filtres des comptes clients',
  'crmSuivre.accounts.viewAria': 'Affichage des comptes',
  'crmSuivre.partners.team': 'Équipe externe',
  'crmSuivre.partners.detailAria': 'Détail du commercial',
}

export default crmSuivre
