import User from '../../models/User.js'
import type { IBetaCampaign } from '../../models/BetaCampaign.js'
import type { IBetaRun } from '../../models/BetaRun.js'
import { createNotification } from '../notifications.js'
import { PERMISSIONS, hasPermissionResolved } from '../permissions.js'
import type { UserRole } from '../../types/enums.js'

/**
 * Seul un blocage réveille l'équipe. Un point cosmétique attend la revue de
 * la file : noyer les notifications sous les retours mineurs les rendrait
 * toutes également ignorables.
 */
export async function notifyBlockingFeedback(run: IBetaRun, campaign: IBetaCampaign, testerName: string) {
  if (run.verdict !== 'BROKEN' || run.severity !== 'BLOCKER') return

  const candidates = await User.find({ role: { $ne: 'CLIENT' } })
    .select('_id role grantedPermissions deniedPermissions')
    .lean()

  const recipients = candidates.filter((user) =>
    hasPermissionResolved(
      user.role as UserRole,
      PERMISSIONS.MANAGE_BETA,
      user.grantedPermissions ?? [],
      user.deniedPermissions ?? [],
    ),
  )

  await Promise.all(
    recipients.map((user) =>
      createNotification({
        recipient: user._id,
        type: 'BETA_BLOCKING_FEEDBACK',
        title: run.title || 'Blocage signalé en beta test',
        message: `${testerName} — ${campaign.name}`,
        link: `/admin/beta/campaigns/${campaign._id}`,
        metadata: { campaignId: String(campaign._id), runId: String(run._id) },
        // Une relance sur le même retour met à jour l'alerte existante plutôt
        // que d'en empiler une seconde.
        dedupeKey: `beta-blocking:${run._id}`,
      }).catch(() => null),
    ),
  )
}
