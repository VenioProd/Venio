import type fr from '../fr/crmPlan'

const en: Record<keyof typeof fr, string> = {
  'crmPlan.title': 'CRM map',
  'crmPlan.lede':
    'Where each feature of today’s CRM sits in this split by moment of the work. The nine former tabs are spread over four entries, and each feature has a single place.',
  'crmPlan.moment.aujourdhui': 'What to do right now: overdue items, reminders, analyses, meetings.',
  'crmPlan.moment.prospecter': 'Calling: the call desk, scripts and their report.',
  'crmPlan.moment.suivre': 'Moving deals forward: pipeline, lead records, client accounts, partners.',
  'crmPlan.moment.piloter': 'Tuning and measuring: forecasts, automations, settings.',
  'crmPlan.tableTitle': 'Where each former feature now lives',
  'crmPlan.col.before': 'Former feature',
  'crmPlan.col.now': 'Where to find it',
  'crmPlan.col.moment': 'Moment',

  'crmPlan.row.queue.old': 'To handle',
  'crmPlan.row.queue.detail':
    'Work queue: overdue, today, this week, not to let slip; contacted, note, postpone, call.',
  'crmPlan.row.table.old': 'Leads, table',
  'crmPlan.row.table.detail': 'Choice of columns, filters, views, inline editing, bulk actions, CSV export.',
  'crmPlan.row.kanban.old': 'Leads, Kanban',
  'crmPlan.row.kanban.detail': 'Columns by status, drag and drop, weighted amounts.',
  'crmPlan.row.lead.old': 'Lead record',
  'crmPlan.row.lead.detail':
    'Status, entity, heat, assignment, next action, write, log an exchange, merge, duplicates, convert to client, sales chain, sequences, personal data.',
  'crmPlan.row.desk.old': 'Team call desk',
  'crmPlan.row.desk.detail':
    'Queue, Click, Preview and Power dialer modes, call bar, live transcript, opt-out, outcome, country and local time, outside hours.',
  'crmPlan.row.analysis.old': 'Analysed call',
  'crmPlan.row.analysis.detail':
    'Transcript, summary, field-by-field information, heat per criterion, proposed actions, opt-out hold.',
  'crmPlan.row.pilotage.old': 'Pilotage',
  'crmPlan.row.pilotage.detail': 'Forecasts, goals, funnel, velocity, losses, sources and owners.',
  'crmPlan.row.scripts.old': 'Script reports',
  'crmPlan.row.scripts.detail':
    'Conversion against goal, objections, what moves deals forward or loses them, script changes.',
  'crmPlan.row.automations.old': 'Automations',
  'crmPlan.row.automations.detail':
    'Rules, triggers, actions, simulation, templates, execution log; e-mail sequences and their enrolments.',
  'crmPlan.row.accounts.old': 'Client accounts',
  'crmPlan.row.accounts.detail': 'Accounts created from converted leads.',
  'crmPlan.row.partners.old': 'Partners',
  'crmPlan.row.partners.detail':
    'External sales reps: call lists, handover to the closer, 10% commission on cash collected.',
  'crmPlan.row.settings.old': 'CRM settings',
  'crmPlan.row.settings.detail':
    'Seventeen sections: statuses, qualification, score, assignment, duplicates, alerts, escalation, notifications, reports, retention, calls, telephony, recording, transcription, analysis, script report, opted-out numbers.',

  'crmPlan.link.queue.jour': 'Today',
  'crmPlan.link.queue.semaine': 'This week',
  'crmPlan.link.queue.filer': 'Don’t let slip',
  'crmPlan.link.table': 'Follow up, Pipeline, Table',
  'crmPlan.link.kanban': 'Follow up, Pipeline, Kanban',
  'crmPlan.link.lead': 'Follow up, Pipeline: open a lead',
  'crmPlan.link.desk': 'Prospect, Call desk',
  'crmPlan.link.analysis.lead': 'On the record, Calls and analyses',
  'crmPlan.link.analysis.validate': 'To validate, in Today',
  'crmPlan.link.analysis.hold': 'Hold decision, in Today',
  'crmPlan.link.pilotage': 'Steer, Forecasts and goals',
  'crmPlan.link.scripts': 'Prospect, Scripts and report',
  'crmPlan.link.automations': 'Steer, Automations',
  'crmPlan.link.automations.regles': 'Rules',
  'crmPlan.link.automations.modeles': 'Templates',
  'crmPlan.link.automations.sequences': 'Sequences',
  'crmPlan.link.automations.journal': 'Log',
  'crmPlan.link.accounts': 'Follow up, Client accounts',
  'crmPlan.link.partners': 'Follow up, Partners',
  'crmPlan.link.settings': 'Steer, Settings',
  'crmPlan.link.settings.pipeline': 'Pipeline and qualification',
  'crmPlan.link.settings.alerts': 'Alerts and notifications',
  'crmPlan.link.settings.telephonie': 'Telephony',
  'crmPlan.link.settings.analyse': 'Analysis and heat',
  'crmPlan.link.settings.opposes': 'Opted-out numbers',
  'crmPlan.link.settings.conservation': 'Retention',

  'crmPlan.external.title': 'For an external sales rep',
  'crmPlan.external.text':
    'An external sales rep does not use these screens: they work in their own space, /commercial, with their records, their call desk and their reminders. That space has not changed. The “Steer” moment, client accounts and partners are not shown to them.',
  'crmPlan.empty': 'No CRM screen is open to your profile.',
}

export default en
