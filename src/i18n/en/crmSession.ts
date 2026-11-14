import type fr from '../fr/crmSession'

// Today's call session, queue categories, meetings and call activity (missing-features lot A).
const en: Record<keyof typeof fr, string> = {
  'crmSession.title': 'Your session',
  'crmSession.titleDesk': 'Today',
  'crmSession.sub': 'today',
  'crmSession.calls': '{count, plural, one {call made} other {calls made}}',
  'crmSession.callsShort': 'calls',
  'crmSession.reached': '{count, plural, one {prospect reached} other {prospects reached}}',
  'crmSession.reachedShort': 'reached',
  'crmSession.meetings': '{count, plural, one {meeting booked} other {meetings booked}}',
  'crmSession.meetingsShort': 'meetings',
  'crmSession.conversion': 'Conversion on reached',
  'crmSession.conversionNone': 'No prospect reached today.',
  'crmSession.conversionCaption': '{rate}% of {count} reached',
  'crmSession.target': 'Target {rate}%',
  'crmSession.meterAria': '{rate}% conversion, target {target}%',
  'crmSession.meterAriaNoTarget': '{rate}% conversion',
  'crmSession.resume': '{count, plural, one {Resume the session, # lead} other {Resume the session, # leads}}',
  'crmSession.queueMix':
    '{callback, plural, one {# callback due} other {# callbacks due}}, {never} never called, {other, plural, one {# other} other {# others}}.',
  'crmSession.error': 'Today’s session could not be loaded.',
  'crmSession.aside': 'Session and decisions',
  'crmSession.retry': 'Retry',

  'crmSession.cat.label': 'Queue category',
  'crmSession.cat.all': 'Whole queue',
  'crmSession.cat.callback': 'Callbacks due',
  'crmSession.cat.never': 'Never called',
  'crmSession.cat.other': 'Others',

  'crmSession.meetings.section': 'Today’s meetings',
  'crmSession.upcoming.title': 'Coming up',
  'crmSession.upcoming.sub': 'meetings this week',
  'crmSession.upcoming.empty': 'No meeting planned this week.',
  'crmSession.upcoming.when': '{date}, {time}',

  'crmSession.activity.title': 'Call activity',
  'crmSession.activity.sub': 'last 14 days',
  'crmSession.activity.calls': '{count, plural, one {call logged} other {calls logged}}',
  'crmSession.activity.reached': 'reached',
  'crmSession.activity.rate': 'reach rate',
  'crmSession.activity.chartAria': 'Calls per day over 14 days: {total} in total, {reached} reached',
  'crmSession.activity.day': '{day}: {calls, plural, one {# call} other {# calls}}, {reached} reached',
  'crmSession.activity.legendCalls': 'Calls',
  'crmSession.activity.legendReached': 'Reached',
  'crmSession.activity.empty': 'No call logged in the last 14 days.',
  'crmSession.activity.note':
    'Team calls within your scope; an external rep’s calls only count once the lead is handed off.',
  'crmSession.activity.error': 'Call activity could not be loaded.',
}

export default en
