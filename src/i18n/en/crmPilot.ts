import type fr from '../fr/crmPilot'

const en: Record<keyof typeof fr, string> = {
  // ── Settings ──────────────────────────────────────────────────────
  'crmPilot.set.lede': 'How the CRM behaves, grouped the way the work goes: the pipeline, the follow-up, the calls.',
  'crmPilot.set.navAria': 'Settings sections',
  'crmPilot.set.jump': 'Settings section',
  'crmPilot.set.group.pipeline': 'Pipeline and qualification',
  'crmPilot.set.group.alerts': 'Alerts and notifications',
  'crmPilot.set.group.calls': 'Calls, telephony and AI',
  'crmPilot.set.group.data': 'Data and retention',
  'crmPilot.set.s.statuts': 'Statuses',
  'crmPilot.set.s.qualification': 'Qualification',
  'crmPilot.set.s.score': 'Score',
  'crmPilot.set.s.assignation': 'Assignment',
  'crmPilot.set.s.doublons': 'Duplicates',
  'crmPilot.set.s.alertes': 'Alerts',
  'crmPilot.set.s.escalade': 'Escalation',
  'crmPilot.set.s.notifications': 'Notifications',
  'crmPilot.set.s.rapports': 'Reports',
  'crmPilot.set.s.appels': 'Calls',
  'crmPilot.set.s.telephonie': 'Telephony',
  'crmPilot.set.s.enregistrement': 'Recording',
  'crmPilot.set.s.transcription': 'Transcription',
  'crmPilot.set.s.analyse': 'Analysis and heat',
  'crmPilot.set.s.scripts': 'Script report',
  'crmPilot.set.s.conservation': 'Retention',
  'crmPilot.set.s.opposes': 'Opted-out numbers',

  // ── Automations ───────────────────────────────────────────────────
  'crmPilot.auto.title': 'Automations',
  'crmPilot.auto.lede': 'The rules that work for you, the e-mail sequences, and a record of what they did.',
  'crmPilot.auto.sectionsAria': 'Automation sections',
  'crmPilot.auto.section.regles': 'Rules',
  'crmPilot.auto.section.modeles': 'Templates',
  'crmPilot.auto.section.sequences': 'Sequences',
  'crmPilot.auto.section.journal': 'Log',

  // ── Forecasts and goals ───────────────────────────────────────────
  'crmPilot.fc.title': 'Forecasts and goals',
  'crmPilot.fc.lede':
    'What the pipeline should bring in, month by month, and the gap with the goals. Amounts are the leads’ budgets.',
  'crmPilot.fc.tilesAria': 'Forecast key figures',
  'crmPilot.fc.tile.weighted': 'weighted over {count, plural, one {# open lead} other {# open leads}}',
  'crmPilot.fc.tile.open': 'open pipeline, before weighting',
  'crmPilot.fc.tile.won': 'won, {count, plural, one {# lead} other {# leads}}',
  'crmPilot.fc.tile.overdue': '{count, plural, one {# lead} other {# leads}} past the expected close date',
  'crmPilot.fc.chart.title': 'Weighted by closing month',
  'crmPilot.fc.chart.sub': 'and number of open leads',
  'crmPilot.fc.chart.label': 'Weighted per month',
  'crmPilot.fc.chart.aria': 'Weighted amount and number of open leads, month by month',
  'crmPilot.fc.chart.legendWeighted': 'Weighted',
  'crmPilot.fc.chart.legendCount': 'Open leads',
  'crmPilot.fc.goals.title': 'Goals',
  'crmPilot.fc.goals.sub': 'achieved against goal, per month',
  'crmPilot.fc.mix.title': 'Forecast',
  'crmPilot.fc.mix.aria': '{won} won and {weighted} weighted',
  'crmPilot.fc.mix.won': 'Won {amount}',
  'crmPilot.fc.mix.weighted': 'Weighted {amount}',
  'crmPilot.fc.mix.total': 'Won plus weighted: {amount} if the pipeline moves as expected.',
  'crmPilot.fc.table.title': 'Month by month',
}

export default en
