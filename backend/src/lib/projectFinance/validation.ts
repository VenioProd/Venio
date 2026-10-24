import type { ClientSession, Types } from 'mongoose'
import type { IProjectFinance, IShareRule } from '../../types/models/index.js'
import Beneficiary from '../../models/Beneficiary.js'
import User from '../../models/User.js'
import Subsidiary from '../../models/Subsidiary.js'
import ProjectPhase from '../../models/ProjectPhase.js'
import { moneyError } from './money.js'
import { allocatePayment, splitPayers, splitSchedule } from './rules.js'

export async function validateShareRules(rules: IShareRule[]): Promise<void> {
  if (!Array.isArray(rules)) throw moneyError('Les règles doivent être une liste')
  allocatePayment(
    0,
    rules.map((rule) => ({ key: String(rule.beneficiary), bp: rule.bp })),
  )
  const count = await Beneficiary.countDocuments({
    _id: { $in: rules.map((rule) => rule.beneficiary) },
    isActive: true,
  })
  if (count !== rules.length) throw moneyError('Chaque bénéficiaire doit exister et être actif')
}

export async function validateProjectFinance(finance: IProjectFinance, session?: ClientSession): Promise<void> {
  if (!Array.isArray(finance.installments) || !Array.isArray(finance.payers)) {
    throw moneyError('Les échéances et les payeurs doivent être des listes')
  }
  if (finance.mode === 'ABONNEMENT') {
    if (finance.contractHtCents !== null) throw moneyError('Un abonnement ne porte pas de total de contrat')
    if (finance.installments.length !== 0) throw moneyError('Un abonnement ne porte pas d’échéances')
    const subscription = finance.subscription
    if (!subscription) throw moneyError('La configuration de l’abonnement est requise')
    if (subscription.endDate && subscription.endDate <= subscription.startDate) {
      throw moneyError('La fin de l’abonnement doit être postérieure à son début')
    }
  } else {
    if (finance.subscription) throw moneyError('L’abonnement est réservé au mode ABONNEMENT')
    if (finance.mode === 'FORFAIT' && finance.installments.length !== 1) {
      throw moneyError('Un forfait exige exactement une échéance à 100 %')
    }
    if (finance.mode === 'ECHEANCIER' && finance.installments.length < 2) {
      throw moneyError('Un échéancier exige au moins deux échéances')
    }
    splitSchedule(
      finance.contractHtCents!,
      finance.installments.map((item, index) => ({ key: String(index), bp: item.percentBp })),
    )
  }
  for (const installment of finance.installments) {
    const trigger = installment.trigger
    if (trigger.kind === 'DATE') {
      if (!trigger.dueDate || trigger.phase) throw moneyError('Une échéance datée exige une date et aucun jalon')
    } else {
      if (
        !trigger.phase ||
        trigger.dueDate ||
        !(await ProjectPhase.exists({ _id: trigger.phase, project: finance.project }).session(session ?? null))
      ) {
        throw moneyError('Le jalon doit appartenir au projet et ne pas porter de date de déclenchement')
      }
    }
  }
  const principalIndex = finance.payers.findIndex((payer) => payer.isPrincipal)
  if (finance.payers.filter((payer) => payer.isPrincipal).length !== 1) {
    throw moneyError('Les payeurs doivent avoir exactement un payeur principal')
  }
  splitPayers(
    0,
    finance.payers.map((payer, index) => ({ key: String(index), bp: payer.shareBp })),
    String(principalIndex),
  )
  for (const payer of finance.payers) {
    if (payer.kind === 'CLIENT') {
      if (
        !payer.user ||
        payer.subsidiary ||
        !(await User.exists({ _id: payer.user, role: 'CLIENT' }).session(session ?? null))
      ) {
        throw moneyError('Un payeur client exige un utilisateur client existant et aucune filiale')
      }
    } else if (payer.kind === 'SUBSIDIARY') {
      if (
        !payer.subsidiary ||
        payer.user ||
        !(await Subsidiary.exists({ _id: payer.subsidiary }).session(session ?? null))
      ) {
        throw moneyError('Un payeur filiale exige une filiale existante et aucun utilisateur')
      }
    } else if (payer.user || payer.subsidiary || !payer.billingContact?.name?.trim()) {
      throw moneyError('Un payeur tiers exige un nom de facturation et aucune référence client ou filiale')
    }
  }
}

export async function lastAllocatedPaymentAt(_projectId: string | Types.ObjectId): Promise<Date | null> {
  // Le lot 3 lira ici la date du dernier encaissement réparti du projet.
  return null
}
