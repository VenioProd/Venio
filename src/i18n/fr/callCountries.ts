/** Poste d'appel multi-pays (lot P) : pays, fuseau du prospect, plafonds, contact professionnel, mode pont. */
const fr = {
  'callCountries.block.NOT_BUSINESS_CONTACT': 'Contact pro à confirmer',
  'callCountries.block.COUNTRY_NOT_ALLOWED': 'Pays non autorisé',
  'callCountries.block.TIMEZONE_UNKNOWN': 'Fuseau inconnu',
  'callCountries.block.OUTSIDE_CALLING_HOURS': 'Hors plage chez le prospect',
  'callCountries.block.LEAD_NOT_CALLABLE': 'Numéro invalide',
  'callCountries.localTime': 'Heure locale du prospect : {time}',
  'callCountries.localTimeSeveral': 'Plusieurs fuseaux possibles : {times}',
  'callCountries.confirmPro': 'Confirmer : contact professionnel',
  'callCountries.confirmProHelp':
    'Seuls les professionnels sont appelés. Confirmez que ce contact agit pour son entreprise.',
  'callCountries.confirmProError': 'La confirmation n’a pas pu être enregistrée.',
  'callCountries.unreachable': 'Non joignable',
  'callCountries.proField': 'Contact professionnel',
  'callCountries.proFieldHelp': 'Obligatoire : seuls les professionnels peuvent être prospectés par téléphone.',
  'callCountries.importPro': 'Je confirme que ces contacts sont des professionnels (pas de particuliers).',
  'callCountries.importProRequired': 'Cochez la confirmation « contacts professionnels » pour importer.',
  'callCountries.importReason.COUNTRY_NOT_ALLOWED': 'pays non autorisé',

  'callCountries.settings.hoursHelp':
    'Ces heures s’entendent dans le fuseau du prospect, déduit de son numéro. Fuseau inconnu : l’appel est refusé ; plusieurs fuseaux possibles : la plage doit tenir dans chacun.',
  'callCountries.settings.window': 'Tentatives sur la période',
  'callCountries.settings.windowDays': 'Période (jours)',
  'callCountries.settings.windowMax': 'Tentatives au plus',
  'callCountries.settings.windowHelp':
    'Par numéro, tous commerciaux confondus. Plafond atteint sans avoir jamais joint personne : la fiche passe « non joignable ».',
  'callCountries.settings.countries': 'Pays appelables',
  'callCountries.settings.countriesHelp':
    'Royaume-Uni, Canada et États-Unis restent fermés tant que leurs règles ne sont pas validées par un avocat.',
  'callCountries.settings.country': 'Pays',
  'callCountries.settings.enabled': 'Autorisé',
  'callCountries.settings.defaultCallerId': 'Numéro par défaut',
  'callCountries.settings.defaultCallerIdHelp':
    'Sans numéro propre au pays (TWILIO_CALLER_ID_<pays>), le numéro par défaut n’est présenté que si cette case est cochée.',
  'callCountries.settings.eu': 'Union européenne',
  'callCountries.settings.other': 'Hors Union européenne',
  'callCountries.settings.openCount': '{count} pays ouverts',
  'callCountries.settings.summary':
    'Appels {days}, de {start} à {end} heure du prospect, {cap} par numéro et par jour, {max} sur {windowDays} jours.',
  'callCountries.settings.err.window':
    'Période de 1 à 60 jours, et au moins autant de tentatives que par jour (100 au plus).',

  'callCountries.bridge.title': 'Appeler par mon portable (mode pont)',
  'callCountries.bridge.desc':
    'En repli du navigateur : Venio appelle d’abord votre portable ; décrochez et tapez 1, puis le prospect est appelé. Mêmes règles, même enregistrement.',
  'callCountries.bridge.phone': 'Numéro de portable',
  'callCountries.bridge.sendCode': 'Recevoir un code par appel',
  'callCountries.bridge.codeSent': 'Un appel va lire un code à 6 chiffres sur ce numéro.',
  'callCountries.bridge.code': 'Code reçu',
  'callCountries.bridge.verify': 'Vérifier',
  'callCountries.bridge.verified': 'Portable vérifié : {phone}',
  'callCountries.bridge.notVerified': 'Aucun portable vérifié.',
  'callCountries.bridge.enable': 'Passer mes appels par ce portable',
  'callCountries.bridge.disabled': 'Téléphonie non configurée sur ce serveur : mode pont indisponible.',
  'callCountries.bridge.error.INVALID_PHONE': 'Numéro invalide.',
  'callCountries.bridge.error.INVALID_CODE': 'Code incorrect.',
  'callCountries.bridge.error.CODE_EXPIRED': 'Code expiré ou trop d’essais : demandez-en un nouveau.',
  'callCountries.bridge.error.CODE_RATE_LIMITED': 'Trois codes par heure au plus : réessayez plus tard.',
  'callCountries.bridge.error.BRIDGE_NOT_VERIFIED': 'Vérifiez d’abord votre portable.',
  'callCountries.bridge.error.generic': 'L’opération a échoué.',
  'callCountries.bridge.ringing': 'Votre portable sonne : décrochez puis tapez 1.',
  'callCountries.bridge.badge': 'Mode pont',
}

export default fr
