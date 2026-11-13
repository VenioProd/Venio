/** Multi-country call desk (batch P): countries, prospect time zone, caps, business contact, bridge mode. */
const en = {
  'callCountries.block.NOT_BUSINESS_CONTACT': 'Business contact to confirm',
  'callCountries.block.COUNTRY_NOT_ALLOWED': 'Country not allowed',
  'callCountries.block.TIMEZONE_UNKNOWN': 'Unknown time zone',
  'callCountries.block.OUTSIDE_CALLING_HOURS': 'Outside hours for the prospect',
  'callCountries.block.LEAD_NOT_CALLABLE': 'Invalid number',
  'callCountries.localTime': 'Prospect local time: {time}',
  'callCountries.localTimeSeveral': 'Several possible time zones: {times}',
  'callCountries.confirmPro': 'Confirm: business contact',
  'callCountries.confirmProHelp': 'Only businesses are called. Confirm this contact acts for their company.',
  'callCountries.confirmProError': 'The confirmation could not be saved.',
  'callCountries.unreachable': 'Unreachable',
  'callCountries.proField': 'Business contact',
  'callCountries.proFieldHelp': 'Required: only businesses may be prospected by phone.',
  'callCountries.importPro': 'I confirm these contacts are businesses (not consumers).',
  'callCountries.importProRequired': 'Tick the “business contacts” confirmation to import.',
  'callCountries.importReason.COUNTRY_NOT_ALLOWED': 'country not allowed',

  'callCountries.settings.hoursHelp':
    'These hours are in the prospect’s time zone, deduced from their number. Unknown zone: the call is refused; several possible zones: the window must hold in each.',
  'callCountries.settings.window': 'Attempts over the period',
  'callCountries.settings.windowDays': 'Period (days)',
  'callCountries.settings.windowMax': 'Maximum attempts',
  'callCountries.settings.windowHelp':
    'Per number, all reps combined. Cap reached without ever reaching anyone: the lead becomes “unreachable”.',
  'callCountries.settings.countries': 'Callable countries',
  'callCountries.settings.countriesHelp':
    'United Kingdom, Canada and United States stay closed until a lawyer validates their rules.',
  'callCountries.settings.country': 'Country',
  'callCountries.settings.enabled': 'Allowed',
  'callCountries.settings.defaultCallerId': 'Default number',
  'callCountries.settings.defaultCallerIdHelp':
    'Without a number of its own (TWILIO_CALLER_ID_<country>), the default number is shown only if this box is ticked.',
  'callCountries.settings.eu': 'European Union',
  'callCountries.settings.other': 'Outside the European Union',
  'callCountries.settings.openCount': '{count} countries open',
  'callCountries.settings.summary':
    'Calls {days}, from {start} to {end} prospect time, {cap} per number per day, {max} over {windowDays} days.',
  'callCountries.settings.err.window':
    'Period from 1 to 60 days, and at least as many attempts as per day (100 at most).',

  'callCountries.bridge.title': 'Call through my mobile (bridge mode)',
  'callCountries.bridge.desc':
    'Fallback for the browser: Venio first calls your mobile; answer and press 1, then the prospect is called. Same rules, same recording.',
  'callCountries.bridge.phone': 'Mobile number',
  'callCountries.bridge.sendCode': 'Get a code by phone call',
  'callCountries.bridge.codeSent': 'A call will read a 6-digit code to this number.',
  'callCountries.bridge.code': 'Code received',
  'callCountries.bridge.verify': 'Verify',
  'callCountries.bridge.verified': 'Verified mobile: {phone}',
  'callCountries.bridge.notVerified': 'No verified mobile.',
  'callCountries.bridge.enable': 'Route my calls through this mobile',
  'callCountries.bridge.disabled': 'Telephony not configured on this server: bridge mode unavailable.',
  'callCountries.bridge.error.INVALID_PHONE': 'Invalid number.',
  'callCountries.bridge.error.INVALID_CODE': 'Wrong code.',
  'callCountries.bridge.error.CODE_EXPIRED': 'Code expired or too many tries: request a new one.',
  'callCountries.bridge.error.CODE_RATE_LIMITED': 'Three codes per hour at most: try again later.',
  'callCountries.bridge.error.BRIDGE_NOT_VERIFIED': 'Verify your mobile first.',
  'callCountries.bridge.error.generic': 'The operation failed.',
  'callCountries.bridge.ringing': 'Your mobile is ringing: answer, then press 1.',
  'callCountries.bridge.badge': 'Bridge mode',
}

export default en
