import type fr from '../fr/crmSuivre'

const en: Record<keyof typeof fr, string> = {
  'crmSuivre.pipeline.lede':
    '{count, plural, =0 {No open leads} one {# open lead} other {# open leads}} worth {open}, of which {weighted} once weighted by how far each lead has progressed.',
  'crmSuivre.pipeline.viewAria': 'Pipeline display',
  'crmSuivre.pipeline.viewTable': 'Table',
  'crmSuivre.pipeline.viewKanban': 'Kanban',
  'crmSuivre.pipeline.filtersAria': 'Pipeline filters',
  'crmSuivre.pipeline.quickViewsAria': 'Quick views',
  'crmSuivre.stat.count': 'open leads',
  'crmSuivre.stat.open': 'total amount',
  'crmSuivre.stat.weighted': 'weighted',
  'crmSuivre.stat.won': 'won',
  'crmSuivre.stat.wonHint': '{count, plural, =0 {no deals} one {# deal} other {# deals}}',
  'crmSuivre.stat.idle': 'no activity for 7 days',
  'crmSuivre.stat.late': 'late follow-ups',
  'crmSuivre.stat.lateNone': 'all up to date',
  'crmSuivre.kanban.hint':
    'Drag a card into another column to change the lead’s status. Amounts and weighting are recalculated.',
  'crmSuivre.kanban.columnsAria': 'Pipeline columns',
  'crmSuivre.kanban.columnAria': '{status}, {count, plural, =0 {no leads} one {# lead} other {# leads}}',
  'crmSuivre.kanban.weighting': 'Weighting {percent}%',
  'crmSuivre.kanban.weighted': '{amount} weighted',
  'crmSuivre.chip.lateDays': 'Follow-up {count, plural, one {# day} other {# days}} late',
  'crmSuivre.chip.late': 'Follow-up late',
  'crmSuivre.chip.lateShort': 'Late',
  'crmSuivre.chip.hold': 'Held after an opt-out, decision pending',
  'crmSuivre.chip.holdShort': 'Held',
  'crmSuivre.chip.handoff': 'Handed to the closer',
  'crmSuivre.table.empty.text': 'Change the filters or clear the search to see the leads again.',
  'crmSuivre.table.empty.action': 'Reset filters',
  'crmSuivre.accounts.lede':
    'An account is created when a lead is converted into a client from its record. Find each account’s status, health and owner here.',
  'crmSuivre.accounts.note':
    'A client account opens the client area, quotes and invoices: everything that follows signature is managed in Projects and Accounting.',
  'crmSuivre.accounts.filtersAria': 'Client account filters',
  'crmSuivre.accounts.viewAria': 'Accounts display',
  'crmSuivre.partners.team': 'External team',
  'crmSuivre.partners.detailAria': 'Sales rep detail',
}

export default en
