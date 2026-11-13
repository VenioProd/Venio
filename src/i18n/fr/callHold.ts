/** Retenue d'opposition décidée par l'équipe sur la seule citation (fiche d'un externe non transmise). */
const fr = {
  'callHold.title': 'Décision sur la retenue',
  'callHold.body':
    'Une opposition a été détectée sur un appel du commercial : la fiche ne sera pas rappelée tant qu’elle n’est pas confirmée ou levée. La fiche n’étant pas transmise, vous décidez sur la seule citation, sans accès à l’appel.',
  'callHold.open': 'Décider de la retenue',
  'callHold.loading': 'Chargement de la citation…',
  'callHold.meta': 'Retenue posée le {date}, sur un appel de {author}.',
  'callHold.unknownAuthor': 'un utilisateur supprimé',
  'callHold.noQuote': 'L’analyse n’a pas relevé de citation.',
  'callHold.erased': 'L’analyse a été effacée après une opposition à l’enregistrement : il n’y a plus de citation.',
  'callHold.unverified': 'Cette citation n’a pas été retrouvée telle quelle dans le transcript.',
  'callHold.confirm': 'Confirmer l’opposition',
  'callHold.dismiss': 'Lever la retenue',
  'callHold.confirmTitle': 'Confirmer l’opposition ?',
  'callHold.confirmBody':
    'La fiche passera en « Ne plus appeler ». La décision est inscrite à votre nom dans l’historique.',
  'callHold.dismissTitle': 'Lever la retenue ?',
  'callHold.dismissBody':
    'La fiche reviendra dans la file d’appel du commercial. La décision est inscrite à votre nom dans l’historique.',
  'callHold.loadError': 'Impossible de charger la retenue.',
  'callHold.decideError': 'La décision n’a pas été enregistrée. Rechargez la fiche : elle a peut-être déjà été prise.',
} as const

export default fr
