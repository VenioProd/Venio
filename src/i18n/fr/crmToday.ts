// Moment « Aujourd'hui » du CRM (lot 1 de la refonte) : accueil du jour, cette semaine, à ne pas laisser filer.
const crmToday = {
  'crmToday.kicker': '{date}, {time}',
  'crmToday.clock': '{hour} h {minute}',
  'crmToday.greeting': 'Bonjour {name}',
  'crmToday.greetingAnon': 'Bonjour',
  'crmToday.lede':
    '{count, plural, =0 {Rien à traiter aujourd’hui pour l’instant.} one {1 élément à traiter aujourd’hui.} other {# éléments à traiter aujourd’hui.}} Dans l’ordre : ce qui est en retard, les analyses d’appel à valider, puis la journée heure par heure.',
  'crmToday.startSession': 'Démarrer la séance d’appels',
  'crmToday.newLead': 'Nouveau lead',
  'crmToday.loading': 'Chargement de votre journée…',
  'crmToday.filters': 'Filtrer la file',

  'crmToday.now.kicker': 'À faire maintenant',
  'crmToday.now.analysisTitle': 'Valider l’analyse de l’appel avec {company}',
  'crmToday.now.analysisText': 'Appel de {duration}, {when}.',
  'crmToday.now.analysisTextNoDuration': 'Appel du {when}.',
  'crmToday.now.openAnalysis': 'Ouvrir l’analyse',
  'crmToday.now.lateTitle': 'Relancer {company}',
  'crmToday.now.todayTitle': 'Prochaine relance : {company}',
  'crmToday.now.call': 'Appeler',
  'crmToday.now.openLead': 'Ouvrir la fiche',
  'crmToday.now.clearTitle': 'Plus rien en retard',
  'crmToday.now.clearKicker': 'Plan tenu',
  'crmToday.now.clearText': 'Lancez la séance d’appels pour avancer sur la file.',
  'crmToday.now.clearTextReadOnly': 'Rien n’attend dans la file pour aujourd’hui.',

  'crmToday.mix.total': '{count, plural, one {1 à traiter aujourd’hui} other {# à traiter aujourd’hui}}',
  'crmToday.mix.outside': 'Hors liste : {week} cette semaine, {keep} à ne pas laisser filer',
  'crmToday.mix.aria': '{late} en retard, {today} du jour, {analyses} analyses à valider',
  'crmToday.mix.late': '{count} en retard',
  'crmToday.mix.today': '{count} du jour',
  'crmToday.mix.analyses': '{count, plural, one {1 analyse à valider} other {# analyses à valider}}',

  'crmToday.section.late': 'En retard',
  'crmToday.section.day': 'La journée',
  'crmToday.section.analyses': 'Analyses d’appel à valider',
  'crmToday.section.holds': 'Oppositions à décider',
  'crmToday.section.aside': 'Décisions en attente',
  'crmToday.nowLine': '{time}, maintenant',
  'crmToday.nowLineAria': 'Il est {time}',

  'crmToday.empty.lateTitle': 'Rien en retard',
  'crmToday.empty.late': 'Toutes les relances dues sont faites ou reportées.',
  'crmToday.empty.dayTitle': 'Rien de prévu aujourd’hui',
  'crmToday.empty.day': 'Aucune relance n’est fixée à aujourd’hui. Le poste d’appel propose les fiches à appeler.',
  'crmToday.empty.weekTitle': 'Rien de prévu cette semaine',
  'crmToday.empty.week':
    'Aucune relance n’est fixée dans les sept prochains jours. Les fiches sans échéance qui refroidissent sont dans « À ne pas laisser filer ».',
  'crmToday.empty.keepTitle': 'Aucun lead ne refroidit',
  'crmToday.empty.keep': 'Chaque lead ouvert a une relance prévue, ou a été contacté récemment.',
  'crmToday.empty.filtered': 'Le filtre Entité ou Projet masque peut-être des éléments.',
  'crmToday.empty.clearFilters': 'Retirer les filtres',

  'crmToday.week.lede':
    '{count, plural, =0 {Rien de prévu dans les sept prochains jours.} one {1 élément prévu dans les sept prochains jours.} other {# éléments prévus dans les sept prochains jours.}} Rien n’est dû aujourd’hui : de quoi remplir les creux entre deux appels.',
  'crmToday.keep.lede':
    '{count, plural, =0 {Aucun lead sans échéance ne refroidit.} one {1 lead sans échéance refroidit : sans contact ou au même statut depuis trop longtemps.} other {# leads sans échéance refroidissent : sans contact ou au même statut depuis trop longtemps.}} Rangés par priorité, puis par score.',
  'crmToday.tomorrow': 'Demain',
  'crmToday.daysLate': '−{days} j',

  'crmToday.chip.late':
    '{days, plural, =0 {En retard} one {En retard, il y a 1 jour} other {En retard, il y a # jours}}',
  'crmToday.chip.priority': 'Priorité {label}',
  'crmToday.chip.hold': 'Retenue pour opposition',

  'crmToday.action.done': 'Fait',
  'crmToday.action.doneAria': 'Fait : consigner le contact avec {company}',
  'crmToday.action.noteAria': 'Note sur {company}',
  'crmToday.action.postponeAria': 'Reporter la relance de {company}',
  'crmToday.action.status': 'Statut de {company}',
  'crmToday.action.openLead': 'Ouvrir la fiche',
  'crmToday.contactPanel': 'Contact avec {company}',
  'crmToday.notePanel': 'Note sur {company}',

  'crmToday.analysis.meta': 'Appel de {duration}, {when}',
  'crmToday.analysis.metaNoDuration': 'Appel du {when}',
  'crmToday.analysis.by': 'par {name}',
  'crmToday.analysis.open': 'Ouvrir l’analyse',
  'crmToday.analysis.openAria': 'Ouvrir l’analyse de l’appel avec {company}',
  'crmToday.analysis.more':
    '{count, plural, one {1 autre analyse attend, dans la fiche de chaque lead.} other {# autres analyses attendent, dans la fiche de chaque lead.}}',
  'crmToday.duration': '{minutes} min {seconds}',
  'crmToday.durationShort': '{seconds} s',

  'crmToday.holds.count': '{count, plural, one {1 retenue d’opposition} other {# retenues d’opposition}}',
  'crmToday.holds.intro': 'Ces fiches ne seront pas rappelées tant que vous n’avez pas confirmé ou levé l’opposition.',
  'crmToday.holds.meta': 'Retenue posée le {date}, sur un appel de {author}',
  'crmToday.holds.metaNoAuthor': 'Retenue posée le {date}',
  'crmToday.holds.decide': 'Décider',
  'crmToday.holds.decideAria': 'Décider de la retenue sur {company}',
  'crmToday.holds.hide': 'Masquer',
  'crmToday.holds.openLead': 'Voir la fiche',
  'crmToday.holds.more': '{count, plural, one {1 autre retenue attend.} other {# autres retenues attendent.}}',
  'crmToday.holds.decided': 'Décision enregistrée pour {company}.',

  'crmToday.pendingError': 'Les analyses et les retenues n’ont pas pu être chargées.',
  'crmToday.retry': 'Réessayer',

  'crmToday.sr.doneNext': '{company} traité. Ligne suivante : {next}.',
  'crmToday.sr.doneLast': '{company} traité. Plus rien dans cette liste.',
  'crmToday.sr.saved': '{company} : enregistré.',
}

export default crmToday
