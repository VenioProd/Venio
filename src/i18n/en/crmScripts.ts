import type fr from '../fr/crmScripts'

const en: Record<keyof typeof fr, string> = {
  'crmScripts.title': 'Scripts',
  'crmScripts.add': 'New script',
  'crmScripts.loading': 'Loading scripts…',
  'crmScripts.loadError': 'Scripts could not be loaded.',
  'crmScripts.retry': 'Try again',
  'crmScripts.empty': 'No scripts yet.',
  'crmScripts.noText': 'No text yet',
  'crmScripts.noTextRead': 'This script has no text yet.',
  'crmScripts.calls': '{count, plural, one {# call} other {# calls}} in week {week}',
  'crmScripts.edit': 'Edit',
  'crmScripts.editAria': 'Edit the {tag} script',
  'crmScripts.readOnly': 'The texts are written by the Venio team.',
  'crmScripts.form.name': 'Script name',
  'crmScripts.form.title': 'Title',
  'crmScripts.form.body': 'Text',
  'crmScripts.form.help': 'Plain text: line breaks are kept, no formatting.',
  'crmScripts.form.counter': '{count} of {max} characters',
  'crmScripts.form.save': 'Save',
  'crmScripts.form.saving': 'Saving…',
  'crmScripts.form.cancel': 'Cancel',
  'crmScripts.form.exists': 'A script already has this name.',
  'crmScripts.form.limit': '{max} scripts at most.',
  'crmScripts.form.saveError': 'The script could not be saved.',
  'crmScripts.panel.title': 'Script: {tag}',
}

export default en
