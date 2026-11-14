// Refonte du CRM, moment « Piloter » (lot 4) : réglages, automatisations, prévisions et objectifs.
const crmPilot = {
  // ── Réglages ──────────────────────────────────────────────────────
  'crmPilot.set.lede':
    'Les règles de fonctionnement du CRM, regroupées comme le travail : le pipeline, le suivi, les appels.',
  'crmPilot.set.navAria': 'Sections des réglages',
  'crmPilot.set.jump': 'Section des réglages',
  'crmPilot.set.group.pipeline': 'Pipeline et qualification',
  'crmPilot.set.group.alerts': 'Alertes et notifications',
  'crmPilot.set.group.calls': 'Appels, téléphonie et IA',
  'crmPilot.set.group.data': 'Données et conservation',
  'crmPilot.set.s.statuts': 'Statuts',
  'crmPilot.set.s.qualification': 'Qualification',
  'crmPilot.set.s.score': 'Score',
  'crmPilot.set.s.assignation': 'Assignation',
  'crmPilot.set.s.doublons': 'Doublons',
  'crmPilot.set.s.alertes': 'Alertes',
  'crmPilot.set.s.escalade': 'Escalade',
  'crmPilot.set.s.notifications': 'Notifications',
  'crmPilot.set.s.rapports': 'Rapports',
  'crmPilot.set.s.appels': 'Appels',
  'crmPilot.set.s.telephonie': 'Téléphonie',
  'crmPilot.set.s.enregistrement': 'Enregistrement',
  'crmPilot.set.s.transcription': 'Transcription',
  'crmPilot.set.s.analyse': 'Analyse et chaleur',
  'crmPilot.set.s.scripts': 'Rapport de scripts',
  'crmPilot.set.s.conservation': 'Conservation',
  'crmPilot.set.s.opposes': 'Numéros opposés',

  // ── Automatisations ───────────────────────────────────────────────
  'crmPilot.auto.title': 'Automatisations',
  'crmPilot.auto.lede':
    'Les règles qui travaillent à votre place, les séquences d’e-mails, et la trace de ce qu’elles ont fait.',
  'crmPilot.auto.sectionsAria': 'Sections des automatisations',
  'crmPilot.auto.section.regles': 'Règles',
  'crmPilot.auto.section.modeles': 'Modèles',
  'crmPilot.auto.section.sequences': 'Séquences',
  'crmPilot.auto.section.journal': 'Journal',

  // ── Prévisions et objectifs ───────────────────────────────────────
  'crmPilot.fc.title': 'Prévisions et objectifs',
  'crmPilot.fc.lede':
    'Ce que le pipeline devrait rapporter, mois par mois, et l’écart avec les objectifs. Les montants sont les budgets des leads.',
  'crmPilot.fc.tilesAria': 'Chiffres clés des prévisions',
  'crmPilot.fc.tile.weighted': 'pondéré sur {count, plural, one {# lead ouvert} other {# leads ouverts}}',
  'crmPilot.fc.tile.open': 'pipeline ouvert, avant pondération',
  'crmPilot.fc.tile.won': 'gagné, {count, plural, one {# lead} other {# leads}}',
  'crmPilot.fc.tile.overdue': '{count, plural, one {# lead} other {# leads}} dont la clôture prévue est passée',
  'crmPilot.fc.chart.title': 'Pondéré par mois de clôture',
  'crmPilot.fc.chart.sub': 'et nombre de leads ouverts',
  'crmPilot.fc.chart.label': 'Pondéré par mois',
  'crmPilot.fc.chart.aria': 'Montant pondéré et nombre de leads ouverts, mois par mois',
  'crmPilot.fc.chart.legendWeighted': 'Pondéré',
  'crmPilot.fc.chart.legendCount': 'Leads ouverts',
  'crmPilot.fc.goals.title': 'Objectifs',
  'crmPilot.fc.goals.sub': 'réalisé contre objectif, par mois',
  'crmPilot.fc.mix.title': 'Prévision',
  'crmPilot.fc.mix.aria': '{won} gagnés et {weighted} pondérés',
  'crmPilot.fc.mix.won': 'Gagné {amount}',
  'crmPilot.fc.mix.weighted': 'Pondéré {amount}',
  'crmPilot.fc.mix.total': 'Gagné plus pondéré : {amount} si le pipeline avance comme prévu.',
  'crmPilot.fc.table.title': 'Détail par mois',
}

export default crmPilot
