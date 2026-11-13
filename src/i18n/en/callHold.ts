/** Opt-out hold decided by the team on the quote alone (external rep's lead not yet handed off). */
const en = {
  'callHold.title': 'Hold decision',
  'callHold.body':
    'An opt-out was detected on one of the rep’s calls: the lead will not be called again until it is confirmed or lifted. As the lead has not been handed off, you decide on the quote alone, without access to the call.',
  'callHold.open': 'Decide on the hold',
  'callHold.loading': 'Loading the quote…',
  'callHold.meta': 'Hold placed on {date}, on a call by {author}.',
  'callHold.unknownAuthor': 'a deleted user',
  'callHold.noQuote': 'The analysis did not record a quote.',
  'callHold.erased': 'The analysis was erased after an objection to recording: there is no quote anymore.',
  'callHold.unverified': 'This quote was not found verbatim in the transcript.',
  'callHold.confirm': 'Confirm the opt-out',
  'callHold.dismiss': 'Lift the hold',
  'callHold.confirmTitle': 'Confirm the opt-out?',
  'callHold.confirmBody':
    'The lead will be marked “Do not call”. The decision is logged under your name in the history.',
  'callHold.dismissTitle': 'Lift the hold?',
  'callHold.dismissBody':
    'The lead will go back to the rep’s call queue. The decision is logged under your name in the history.',
  'callHold.loadError': 'Could not load the hold.',
  'callHold.decideError': 'The decision was not saved. Reload the lead: it may already have been made.',
} as const

export default en
