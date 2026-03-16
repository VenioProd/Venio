// ─────────────────────────────────────────────────────────────
// Automation Engine — Bootstrap
// Registers all automation jobs and starts the scheduler.
// ─────────────────────────────────────────────────────────────

// Phase 1 jobs
import { register as registerTaskDeadlineReminders } from './jobs/taskDeadlineReminders.js'
import { register as registerTaskOverdueEscalation } from './jobs/taskOverdueEscalation.js'
import { register as registerCrmInactiveLeadFollowup } from './jobs/crmInactiveLeadFollowup.js'
import { register as registerBillingPaymentFollowup } from './jobs/billingPaymentFollowup.js'
import { register as registerProjectRiskAlert } from './jobs/projectRiskAlert.js'
import { register as registerZeroOversightDigest } from './jobs/zeroOversightDigest.js'
import { register as registerWeeklyManagerReport } from './jobs/weeklyManagerReport.js'

// Phase 2 jobs
import { register as registerProjectAutoWorkspace } from './jobs/projectAutoWorkspace.js'
import { register as registerCrmAutoConvert } from './jobs/crmAutoConvert.js'
import { register as registerDeliverableNotification } from './jobs/deliverableNotification.js'
import { register as registerDataIntegrityCheck } from './jobs/dataIntegrityCheck.js'
import { register as registerClientHealthScore } from './jobs/clientHealthScore.js'

// Phase 3 jobs — Nextcloud
import { register as registerNextcloudCreateStructure } from './jobs/nextcloudCreateStructure.js'
import { register as registerNextcloudSyncUploads } from './jobs/nextcloudSyncUploads.js'
import { register as registerNextcloudDetectMissing } from './jobs/nextcloudDetectMissing.js'
import { register as registerNextcloudRepair } from './jobs/nextcloudRepair.js'

// Phase 4 jobs — Checklists, alerts & CRM
import { register as registerProjectStartupChecklist } from './jobs/projectStartupChecklist.js'
import { register as registerProjectClosureChecklist } from './jobs/projectClosureChecklist.js'
import { register as registerProjectMissingDocuments } from './jobs/projectMissingDocuments.js'
import { register as registerProjectSilentAlert } from './jobs/projectSilentAlert.js'
import { register as registerProjectWaitingOnClient } from './jobs/projectWaitingOnClient.js'
import { register as registerTaskUnassignedAlert } from './jobs/taskUnassignedAlert.js'
import { register as registerTaskAutoArchive } from './jobs/taskAutoArchive.js'
import { register as registerBriefDeadlineReminder } from './jobs/briefDeadlineReminder.js'
import { register as registerCrmHotLeadAlert } from './jobs/crmHotLeadAlert.js'
import { register as registerCrmPostDemoFollowup } from './jobs/crmPostDemoFollowup.js'
import { register as registerCrmProposalFollowup } from './jobs/crmProposalFollowup.js'
import { register as registerCrmAutoArchiveLost } from './jobs/crmAutoArchiveLost.js'
import { register as registerCrmConversionDropAlert } from './jobs/crmConversionDropAlert.js'

// V2.1 — Security & foundations
import { register as registerSecurityBruteForce } from './jobs/securityBruteForce.js'
import { register as registerSecuritySuspiciousLogin } from './jobs/securitySuspiciousLogin.js'
import { register as registerSecurityPasswordRotation } from './jobs/securityPasswordRotation.js'
import { register as registerSecurityPermissionsReview } from './jobs/securityPermissionsReview.js'
import { register as registerToolAccessRotation } from './jobs/toolAccessRotation.js'

// V2.2–V2.9 — Extended automations
import { register as registerBillingCriticalUnpaid } from './jobs/billingCriticalUnpaid.js'
import { register as registerBillingTreasurySummary } from './jobs/billingTreasurySummary.js'
import { register as registerOnboardingClientWelcome } from './jobs/onboardingClientWelcome.js'
import { register as registerOnboardingInternalSetup } from './jobs/onboardingInternalSetup.js'
import { register as registerMessagingUnreadAlert } from './jobs/messagingUnreadAlert.js'
import { register as registerTicketSlaAlert } from './jobs/ticketSlaAlert.js'
import { register as registerTicketAutoArchive } from './jobs/ticketAutoArchive.js'
import { register as registerQualiopiOverdueIndicators } from './jobs/qualiopiOverdueIndicators.js'
import { register as registerQualiopiWeeklyProgress } from './jobs/qualiopiWeeklyProgress.js'
import { register as registerAnalyticsWeeklySnapshot } from './jobs/analyticsWeeklySnapshot.js'
import { register as registerAnalyticsMonthlyReport } from './jobs/analyticsMonthlyReport.js'
import { register as registerInfraAutoBackup } from './jobs/infraAutoBackup.js'
import { register as registerInfraMongoHealthCheck } from './jobs/infraMongoHealthCheck.js'
import { register as registerNextcloudArchiveCompleted } from './jobs/nextcloudArchiveCompleted.js'

import { startAutomationScheduler, stopAutomationScheduler } from './scheduler.js'
import { getAllAutomations } from './registry.js'

/**
 * Initialize the automation engine:
 * 1. Register all automation definitions
 * 2. Start the scheduler
 */
export function initAutomationEngine(): void {
  console.log('[AUTOMATION] Initializing automation engine...')

  // ── Phase 1 — Quick wins ─────────────────────────────────
  registerTaskDeadlineReminders()
  registerTaskOverdueEscalation()
  registerCrmInactiveLeadFollowup()
  registerBillingPaymentFollowup()
  registerProjectRiskAlert()
  registerZeroOversightDigest()
  registerWeeklyManagerReport()

  // ── Phase 2 — Business structure ─────────────────────────
  registerProjectAutoWorkspace()
  registerCrmAutoConvert()
  registerDeliverableNotification()
  registerDataIntegrityCheck()
  registerClientHealthScore()

  // ── Phase 3 — Nextcloud integration ──────────────────────
  registerNextcloudCreateStructure()
  registerNextcloudSyncUploads()
  registerNextcloudDetectMissing()
  registerNextcloudRepair()

  // ── Phase 4 — Checklists, alerts & CRM ─────────────────
  registerProjectStartupChecklist()
  registerProjectClosureChecklist()
  registerProjectMissingDocuments()
  registerProjectSilentAlert()
  registerProjectWaitingOnClient()
  registerTaskUnassignedAlert()
  registerTaskAutoArchive()
  registerBriefDeadlineReminder()
  registerCrmHotLeadAlert()
  registerCrmPostDemoFollowup()
  registerCrmProposalFollowup()
  registerCrmAutoArchiveLost()
  registerCrmConversionDropAlert()

  // ── V2.1 — Security & foundations ─────────────────────────
  registerSecurityBruteForce()
  registerSecuritySuspiciousLogin()
  registerSecurityPasswordRotation()
  registerSecurityPermissionsReview()
  registerToolAccessRotation()

  // ── V2.2–V2.9 — Extended automations ─────────────────────
  registerBillingCriticalUnpaid()
  registerBillingTreasurySummary()
  registerOnboardingClientWelcome()
  registerOnboardingInternalSetup()
  registerMessagingUnreadAlert()
  registerTicketSlaAlert()
  registerTicketAutoArchive()
  registerQualiopiOverdueIndicators()
  registerQualiopiWeeklyProgress()
  registerAnalyticsWeeklySnapshot()
  registerAnalyticsMonthlyReport()
  registerInfraAutoBackup()
  registerInfraMongoHealthCheck()
  registerNextcloudArchiveCompleted()

  const registered = getAllAutomations()
  console.log(`[AUTOMATION] ${registered.length} automation(s) registered:`)
  for (const a of registered) {
    console.log(`  → ${a.key} (${a.triggerType}${a.schedule ? ` @ ${a.schedule}` : ''})`)
  }

  // ── Start scheduler ────────────────────────────────────
  startAutomationScheduler()
}

export { stopAutomationScheduler }

// Re-export for convenience
export { runAutomation, buildContext } from './engine.js'
export { getAllAutomations, getAutomation, listAutomationSummaries } from './registry.js'
export { listAutomationSettings, getAutomationSettings, updateAutomationSettings } from './models/AutomationSettings.js'
export { getRecentLogs, getLogStats } from './models/AutomationLog.js'
export { triggerAutomations } from './trigger.js'
