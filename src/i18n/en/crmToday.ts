// CRM "Today" moment (redesign lot 1): today's home, this week, don't let slip.
const crmToday = {
  'crmToday.kicker': '{date}, {time}',
  'crmToday.clock': '{hour}:{minute}',
  'crmToday.greeting': 'Hello {name}',
  'crmToday.greetingAnon': 'Hello',
  'crmToday.lede':
    '{count, plural, =0 {Nothing to handle today yet.} one {1 item to handle today.} other {# items to handle today.}} In order: what is overdue, call analyses to approve, then the day hour by hour.',
  'crmToday.startSession': 'Start the call session',
  'crmToday.newLead': 'New lead',
  'crmToday.loading': 'Loading your day…',
  'crmToday.filters': 'Filter the queue',

  'crmToday.now.kicker': 'Do now',
  'crmToday.now.analysisTitle': 'Approve the analysis of the call with {company}',
  'crmToday.now.analysisText': '{duration} call, {when}.',
  'crmToday.now.analysisTextNoDuration': 'Call on {when}.',
  'crmToday.now.openAnalysis': 'Open the analysis',
  'crmToday.now.lateTitle': 'Follow up with {company}',
  'crmToday.now.todayTitle': 'Next follow-up: {company}',
  'crmToday.now.call': 'Call',
  'crmToday.now.openLead': 'Open the lead',
  'crmToday.now.clearTitle': 'Nothing overdue',
  'crmToday.now.clearKicker': 'On track',
  'crmToday.now.clearText': 'Start the call session to work through the queue.',
  'crmToday.now.clearTextReadOnly': 'Nothing is waiting in the queue for today.',

  'crmToday.mix.total': '{count, plural, one {1 to handle today} other {# to handle today}}',
  'crmToday.mix.outside': 'Not listed: {week} this week, {keep} not to let slip',
  'crmToday.mix.aria': '{late} overdue, {today} due today, {analyses} analyses to approve',
  'crmToday.mix.late': '{count} overdue',
  'crmToday.mix.today': '{count} due today',
  'crmToday.mix.analyses': '{count, plural, one {1 analysis to approve} other {# analyses to approve}}',

  'crmToday.section.late': 'Overdue',
  'crmToday.section.day': 'The day',
  'crmToday.section.analyses': 'Call analyses to approve',
  'crmToday.section.holds': 'Opt-outs to decide',
  'crmToday.section.aside': 'Pending decisions',
  'crmToday.nowLine': '{time}, now',
  'crmToday.nowLineAria': 'It is {time}',

  'crmToday.empty.lateTitle': 'Nothing overdue',
  'crmToday.empty.late': 'Every due follow-up is done or postponed.',
  'crmToday.empty.dayTitle': 'Nothing planned today',
  'crmToday.empty.day': 'No follow-up is set for today. The call desk suggests leads to call.',
  'crmToday.empty.weekTitle': 'Nothing planned this week',
  'crmToday.empty.week':
    'No follow-up is set for the next seven days. Leads without a due date that are cooling down are under "Don\'t let slip".',
  'crmToday.empty.keepTitle': 'No lead is cooling down',
  'crmToday.empty.keep': 'Every open lead has a follow-up planned, or was contacted recently.',
  'crmToday.empty.filtered': 'The Entity or Project filter may be hiding items.',
  'crmToday.empty.clearFilters': 'Clear filters',

  'crmToday.week.lede':
    '{count, plural, =0 {Nothing planned for the next seven days.} one {1 item planned for the next seven days.} other {# items planned for the next seven days.}} Nothing is due today: something to fill the gaps between calls.',
  'crmToday.keep.lede':
    '{count, plural, =0 {No lead without a due date is cooling down.} one {1 lead without a due date is cooling down: no contact or same status for too long.} other {# leads without a due date are cooling down: no contact or same status for too long.}} Sorted by priority, then score.',
  'crmToday.tomorrow': 'Tomorrow',
  'crmToday.daysLate': '−{days}d',

  'crmToday.chip.late': '{days, plural, =0 {Is overdue} one {Overdue by 1 day} other {Overdue by # days}}',
  'crmToday.chip.priority': '{label} priority',
  'crmToday.chip.hold': 'Held for opt-out',

  'crmToday.action.done': 'Done',
  'crmToday.action.doneAria': 'Done: log the contact with {company}',
  'crmToday.action.noteAria': 'Note on {company}',
  'crmToday.action.postponeAria': 'Postpone the follow-up with {company}',
  'crmToday.action.status': 'Status of {company}',
  'crmToday.action.openLead': 'Open the lead',
  'crmToday.contactPanel': 'Contact with {company}',
  'crmToday.notePanel': 'Note on {company}',

  'crmToday.analysis.meta': '{duration} call, {when}',
  'crmToday.analysis.metaNoDuration': 'Call on {when}',
  'crmToday.analysis.by': 'by {name}',
  'crmToday.analysis.open': 'Open the analysis',
  'crmToday.analysis.openAria': 'Open the analysis of the call with {company}',
  'crmToday.analysis.more':
    '{count, plural, one {1 more analysis is waiting, on its lead.} other {# more analyses are waiting, on their leads.}}',
  'crmToday.duration': '{minutes} min {seconds}',
  'crmToday.durationShort': '{seconds} s',

  'crmToday.holds.count': '{count, plural, one {1 opt-out hold} other {# opt-out holds}}',
  'crmToday.holds.intro': 'These leads will not be called again until you confirm or lift the opt-out.',
  'crmToday.holds.meta': 'Held on {date}, on a call by {author}',
  'crmToday.holds.metaNoAuthor': 'Held on {date}',
  'crmToday.holds.decide': 'Decide',
  'crmToday.holds.decideAria': 'Decide on the hold for {company}',
  'crmToday.holds.hide': 'Hide',
  'crmToday.holds.openLead': 'See the lead',
  'crmToday.holds.more': '{count, plural, one {1 more hold is waiting.} other {# more holds are waiting.}}',
  'crmToday.holds.decided': 'Decision saved for {company}.',

  'crmToday.pendingError': 'Analyses and holds could not be loaded.',
  'crmToday.retry': 'Retry',

  'crmToday.sr.doneNext': '{company} handled. Next row: {next}.',
  'crmToday.sr.doneLast': '{company} handled. Nothing left in this list.',
  'crmToday.sr.saved': '{company}: saved.',
}

export default crmToday
