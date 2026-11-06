import type fr from '../fr/crmPrivacy'

const en: Record<keyof typeof fr, string> = {
  'crmPrivacy.panel.title': 'Personal data',
  'crmPrivacy.panel.loading': 'Loading…',
  'crmPrivacy.panel.loadError': 'Could not load the personal data status.',
  'crmPrivacy.consent.label': 'Consent',
  'crmPrivacy.consent.UNKNOWN': 'Not collected',
  'crmPrivacy.consent.GRANTED': 'Given',
  'crmPrivacy.consent.WITHDRAWN': 'Withdrawn',
  'crmPrivacy.basis.label': 'Legal basis',
  'crmPrivacy.basis.CONSENT': 'Consent',
  'crmPrivacy.basis.LEGITIMATE_INTEREST': 'Legitimate interest',
  'crmPrivacy.basis.CONTRACT': 'Contract',
  'crmPrivacy.consent.since': 'Since {date} ({source})',
  'crmPrivacy.doNotContact.label': 'Do not contact',
  'crmPrivacy.doNotContact.hint': 'No prospecting email is sent to this contact (rules and sending from the record).',
  'crmPrivacy.doNotContact.since': 'Objection recorded on {date}',
  'crmPrivacy.suppressed': 'This address is on the “do not contact” list: no email will be sent to it.',
  'crmPrivacy.anonymized': 'Lead anonymised on {date}.',
  'crmPrivacy.export': 'Export data',
  'crmPrivacy.exporting': 'Exporting…',
  'crmPrivacy.exportError': 'The export failed.',
  'crmPrivacy.anonymize': 'Anonymise',
  'crmPrivacy.anonymizeTitle': 'Anonymise this lead?',
  'crmPrivacy.anonymizeConfirm':
    'The contact’s name, email, phone and notes will be permanently erased, along with the content of their exchanges. The lead stays in the statistics.',
  'crmPrivacy.anonymizeDone': 'Lead anonymised.',
  'crmPrivacy.anonymizeError': 'Anonymisation failed.',
  'crmPrivacy.saveError': 'The change was not saved.',
  'crmPrivacy.settings.title': 'Personal data',
  'crmPrivacy.settings.retention': 'Retention period',
  'crmPrivacy.settings.retentionDesc':
    'A lead that was not won, with no interaction or change for this long, is anonymised (not deleted).',
  'crmPrivacy.settings.months': 'months',
  'crmPrivacy.settings.purge': 'Automatic anonymisation',
  'crmPrivacy.settings.purgeDesc':
    'When off, the daily task only counts the leads concerned (simulation) and changes nothing.',
}

export default en
