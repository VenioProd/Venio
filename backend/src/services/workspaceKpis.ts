import Lead from '../models/Lead.js'
import Intern from '../models/Intern.js'
import ActivityReport from '../models/ActivityReport.js'
import AccountingEntry from '../models/AccountingEntry.js'
import VatDeclaration from '../models/VatDeclaration.js'
import Project from '../models/Project.js'
import Task from '../models/Task.js'

export interface RoleKpi {
  /** Identifiant stable, traduit côté client (`label` reste le repli français). */
  key: string
  label: string
  value: number
  link: string
}

/**
 * Returns role-specific KPI counters for the "Mon Espace" dashboard.
 * The safe() wrapper guarantees 0 is returned (never throws) so a wrong
 * or absent field can't crash the dashboard.
 */
export async function computeRoleKpis(userId: string, role: string): Promise<RoleKpi[]> {
  const safe = async (p: Promise<number>): Promise<number> => {
    try {
      return await p
    } catch {
      return 0
    }
  }

  switch (role) {
    case 'COMMERCIAL':
      return [
        {
          key: 'hotLeads',
          label: 'Leads chauds',
          // leadTemperature confirmed in Lead model — enum: ['FROID','TIEDE','CHAUD','TRES_CHAUD']
          value: await safe(Lead.countDocuments({ leadTemperature: { $in: ['CHAUD', 'TRES_CHAUD'] } })),
          link: '/admin/crm',
        },
        {
          key: 'openDeals',
          label: 'Affaires en cours',
          // Lead.assignedTo scopes to this user; WON/LOST are closed statuses
          value: await safe(Lead.countDocuments({ assignedTo: userId, status: { $nin: ['WON', 'LOST'] } })),
          link: '/admin/crm',
        },
      ]

    case 'RH':
      return [
        {
          key: 'activeInterns',
          label: 'Stagiaires actifs',
          // Intern.status enum: ['ACTIF', 'TERMINE', 'ANNULE']
          value: await safe(Intern.countDocuments({ status: 'ACTIF' })),
          link: '/admin/stagiaires',
        },
        {
          key: 'pendingReports',
          label: 'Rapports en attente',
          // ActivityReport.status enum: ['BROUILLON', 'SOUMIS', 'VALIDE']
          // 'SOUMIS' = submitted by intern, awaiting RH validation
          value: await safe(ActivityReport.countDocuments({ status: 'SOUMIS' })),
          link: '/admin/mes-rapports',
        },
      ]

    case 'COMPTABLE':
      return [
        {
          key: 'draftEntries',
          label: 'Écritures à valider',
          // AccountingEntry.status enum: ['DRAFT', 'VALIDATED', 'LOCKED']
          value: await safe(AccountingEntry.countDocuments({ status: 'DRAFT' })),
          link: '/admin/comptabilite',
        },
        {
          key: 'vatDeclarations',
          label: 'Déclarations TVA',
          // VatDeclaration.status enum: ['DRAFT', 'SUBMITTED']
          value: await safe(VatDeclaration.countDocuments({ status: { $ne: 'SUBMITTED' } })),
          link: '/admin/comptabilite',
        },
      ]

    case 'STAGIAIRE':
      return [
        {
          key: 'myTasks',
          label: 'Mes tâches',
          // Task.assignee (ObjectId), Task.status — 'TERMINE' is confirmed terminal value
          value: await safe(Task.countDocuments({ assignee: userId, status: { $ne: 'TERMINE' } })),
          link: '/admin/mon-espace',
        },
        {
          key: 'myReports',
          label: 'Mes rapports',
          // ActivityReport.userId is the author field (confirmed: userId: Schema.Types.ObjectId ref User)
          value: await safe(ActivityReport.countDocuments({ userId })),
          link: '/admin/mes-rapports',
        },
      ]

    case 'MANAGER':
    case 'ADMIN':
    case 'SUPER_ADMIN':
    case 'VIEWER':
    default:
      return [
        {
          key: 'activeProjects',
          label: 'Projets actifs',
          // Project.status enum: ['EN_COURS', 'EN_ATTENTE', 'TERMINE']
          value: await safe(Project.countDocuments({ status: 'EN_COURS' })),
          link: '/admin/gestion',
        },
        {
          key: 'tasksInProgress',
          label: 'Tâches en cours',
          // Task.status enum includes 'EN_COURS'
          value: await safe(Task.countDocuments({ status: 'EN_COURS' })),
          link: '/admin/gestion',
        },
      ]
  }
}
