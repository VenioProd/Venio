/** Données personnelles du CRM (RGPD, chantier 3D) : fiche lead et réglage de conservation. */
const fr = {
  'crmPrivacy.panel.title': 'Données personnelles',
  'crmPrivacy.panel.loading': 'Chargement…',
  'crmPrivacy.panel.loadError': 'Impossible de charger le statut des données personnelles.',
  'crmPrivacy.consent.label': 'Consentement',
  'crmPrivacy.consent.UNKNOWN': 'Non recueilli',
  'crmPrivacy.consent.GRANTED': 'Donné',
  'crmPrivacy.consent.WITHDRAWN': 'Retiré',
  'crmPrivacy.basis.label': 'Base légale',
  'crmPrivacy.basis.CONSENT': 'Consentement',
  'crmPrivacy.basis.LEGITIMATE_INTEREST': 'Intérêt légitime',
  'crmPrivacy.basis.CONTRACT': 'Contrat',
  'crmPrivacy.consent.since': 'Depuis le {date} ({source})',
  'crmPrivacy.doNotContact.label': 'Ne pas contacter',
  'crmPrivacy.doNotContact.hint': 'Aucun e-mail de prospection ne part vers ce contact (règles et envoi depuis la fiche).',
  'crmPrivacy.doNotContact.since': 'Opposition enregistrée le {date}',
  'crmPrivacy.suppressed': 'Adresse inscrite dans la liste « ne pas contacter » : aucun e-mail ne lui sera envoyé.',
  'crmPrivacy.anonymized': 'Lead anonymisé le {date}.',
  'crmPrivacy.export': 'Exporter les données',
  'crmPrivacy.exporting': 'Export…',
  'crmPrivacy.exportError': 'L’export a échoué.',
  'crmPrivacy.anonymize': 'Anonymiser',
  'crmPrivacy.anonymizeTitle': 'Anonymiser ce lead ?',
  'crmPrivacy.anonymizeConfirm':
    'Le nom, l’e-mail, le téléphone et les notes du contact seront effacés définitivement, ainsi que le contenu de ses échanges. Le lead reste dans les statistiques.',
  'crmPrivacy.anonymizeDone': 'Lead anonymisé.',
  'crmPrivacy.anonymizeError': 'L’anonymisation a échoué.',
  'crmPrivacy.saveError': 'La modification n’a pas été enregistrée.',
  'crmPrivacy.settings.title': 'Données personnelles',
  'crmPrivacy.settings.retention': 'Durée de conservation',
  'crmPrivacy.settings.retentionDesc':
    'Un lead non gagné sans interaction ni modification depuis cette durée est anonymisé (pas supprimé).',
  'crmPrivacy.settings.months': 'mois',
  'crmPrivacy.settings.purge': 'Anonymisation automatique',
  'crmPrivacy.settings.purgeDesc':
    'Désactivée, la tâche quotidienne se contente de compter les leads concernés (simulation), sans rien modifier.',
} as const

export default fr
