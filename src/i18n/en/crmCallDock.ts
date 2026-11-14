import type fr from '../fr/crmCallDock'

const en: Record<keyof typeof fr, string> = {
  'crmCallDock.aria': 'Phone call in progress',
  'crmCallDock.inCall': 'Call in progress',
  'crmCallDock.ended': 'Call ended',
  'crmCallDock.owed': 'Outcome to log for {company}',
  'crmCallDock.owedUnnamed': 'Call outcome to log',
  'crmCallDock.enter': 'Log the outcome',
  'crmCallDock.dismiss': 'Dismiss',
  'crmCallDock.dismissAria': 'Dismiss the outcome to log',
  'crmCallDock.backLead': 'Back to the lead',
  'crmCallDock.backDesk': 'Back to the call desk',
}

export default en
