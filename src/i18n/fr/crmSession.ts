// Séance d'appels du jour, catégories de la file, rendez-vous et activité d'appels (lot A des fonctionnalités manquantes).
const crmSession = {
  'crmSession.title': 'Votre séance',
  'crmSession.titleDesk': 'Aujourd’hui',
  'crmSession.sub': 'aujourd’hui',
  'crmSession.calls': '{count, plural, one {appel passé} other {appels passés}}',
  'crmSession.callsShort': 'appels',
  'crmSession.reached': '{count, plural, one {prospect joint} other {prospects joints}}',
  'crmSession.reachedShort': 'joints',
  'crmSession.meetings': '{count, plural, one {rendez-vous pris} other {rendez-vous pris}}',
  'crmSession.meetingsShort': 'rendez-vous',
  'crmSession.conversion': 'Conversion sur joints',
  'crmSession.conversionNone': 'Aucun prospect joint aujourd’hui.',
  'crmSession.conversionCaption': '{rate} % sur {count, plural, one {# joint} other {# joints}}',
  'crmSession.target': 'Objectif {rate} %',
  'crmSession.meterAria': '{rate} % de conversion, objectif {target} %',
  'crmSession.meterAriaNoTarget': '{rate} % de conversion',
  'crmSession.resume': '{count, plural, one {Reprendre la séance, # fiche} other {Reprendre la séance, # fiches}}',
  'crmSession.queueMix':
    '{callback, plural, one {# rappel dû} other {# rappels dus}}, {never, plural, one {# fiche jamais appelée} other {# fiches jamais appelées}}, {other, plural, one {# autre} other {# autres}}.',
  'crmSession.error': 'La séance du jour n’a pas pu être chargée.',
  'crmSession.aside': 'Séance et décisions',
  'crmSession.retry': 'Réessayer',

  'crmSession.cat.label': 'Catégorie de la file',
  'crmSession.cat.all': 'Toute la file',
  'crmSession.cat.callback': 'Rappels dus',
  'crmSession.cat.never': 'Jamais appelées',
  'crmSession.cat.other': 'Autres',

  'crmSession.meetings.section': 'Rendez-vous du jour',
  'crmSession.upcoming.title': 'À venir',
  'crmSession.upcoming.sub': 'rendez-vous de la semaine',
  'crmSession.upcoming.empty': 'Aucun rendez-vous prévu cette semaine.',
  'crmSession.upcoming.when': '{date}, {time}',

  'crmSession.activity.title': 'Activité d’appels',
  'crmSession.activity.sub': '14 derniers jours',
  'crmSession.activity.calls': '{count, plural, one {appel consigné} other {appels consignés}}',
  'crmSession.activity.reached': 'décrochés',
  'crmSession.activity.rate': 'taux de décrochés',
  'crmSession.activity.chartAria': 'Appels par jour sur 14 jours : {total} au total, dont {reached} décrochés',
  'crmSession.activity.day': '{day} : {calls, plural, one {# appel} other {# appels}}, {reached} décrochés',
  'crmSession.activity.legendCalls': 'Appels',
  'crmSession.activity.legendReached': 'Décrochés',
  'crmSession.activity.empty': 'Aucun appel consigné sur les 14 derniers jours.',
  'crmSession.activity.note':
    'Appels de l’équipe sur votre périmètre ; ceux d’un commercial externe ne comptent qu’une fois la fiche transmise.',
  'crmSession.activity.error': 'L’activité d’appels n’a pas pu être chargée.',
}

export default crmSession
