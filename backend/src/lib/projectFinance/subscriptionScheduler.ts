import ProjectFinance from '../../models/ProjectFinance.js'
import User from '../../models/User.js'
import { notifySuperAdmins } from '../notifyHelpers.js'
import logger from '../logger.js'
import { generateSubscriptionInvoices } from './invoicing.js'

export async function generateDueSubscriptionInvoices() {
  const admin = await User.findOne({ role: 'SUPER_ADMIN' }).sort({ createdAt: 1, _id: 1 }).select('_id').lean()
  if (!admin) return { createdCount: 0 }
  const configurations = await ProjectFinance.find({ mode: 'ABONNEMENT' }).select('project').lean()
  const now = new Date()
  let createdCount = 0
  for (const finance of configurations) {
    try {
      const result = await generateSubscriptionInvoices({
        projectId: String(finance.project),
        now,
        userId: String(admin._id),
      })
      createdCount += result.invoices.length
      if (result.warning) logger.error({ projectId: String(finance.project) }, result.warning)
    } catch (err) {
      logger.error({ err, projectId: String(finance.project) }, 'Génération des brouillons d’abonnement impossible')
    }
  }
  if (createdCount) {
    await notifySuperAdmins({
      type: 'BILLING_INVOICE_CREATED',
      title: 'Brouillons d’abonnement à relire',
      message: `${createdCount} facture(s) créée(s)`,
      link: '/admin/billing',
      metadata: { createdCount },
    })
  }
  return { createdCount }
}

let timer: NodeJS.Timeout | null = null
async function run() {
  try {
    await generateDueSubscriptionInvoices()
  } catch (err) {
    logger.error({ err }, 'Planification des abonnements impossible')
  }
}
export function startSubscriptionInvoiceScheduler(): void {
  void run()
  timer = setInterval(
    () => {
      void run()
    },
    6 * 60 * 60 * 1000,
  )
  timer.unref()
}
export function stopSubscriptionInvoiceScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
