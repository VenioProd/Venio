export type PulseStatus = 'ok' | 'warn' | 'bad'

export interface PulseCheck {
  id: string
  label: string
  status: PulseStatus
  detail?: string
}

export interface PulseContext {
  monthlyCA: number
  caObjective: number
  pipelinePrev30: number
  pipelineCurrent: number
  hotLeadsNeglected: number  // count of hot leads sans contact > 7d
  adminLoads: Array<{ name: string; total: number }>
  briefsP1Overdue: number
  lastBackupAt: Date | null
  qualiopiExpiringWithin30Days: number
}

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100)

type Rule = (c: PulseContext) => PulseCheck

const RULES: Rule[] = [
  (c) => {
    const p = pct(c.monthlyCA, c.caObjective)
    const detail = `${Math.round(p)}% obj`
    if (p >= 70) return { id: 'ca-on-track', label: 'CA mois sur trajectoire', status: 'ok', detail }
    if (p >= 40) return { id: 'ca-on-track', label: 'CA mois sur trajectoire', status: 'warn', detail }
    return { id: 'ca-on-track', label: 'CA mois sur trajectoire', status: 'bad', detail }
  },
  (c) => {
    const delta = c.pipelineCurrent - c.pipelinePrev30
    const p = c.pipelinePrev30 ? (delta / c.pipelinePrev30) * 100 : 0
    if (p > 0) return { id: 'pipeline-growing', label: 'Pipeline en croissance', status: 'ok', detail: `+${p.toFixed(0)}%` }
    if (p === 0) return { id: 'pipeline-growing', label: 'Pipeline en croissance', status: 'warn', detail: 'stable' }
    return { id: 'pipeline-growing', label: 'Pipeline en croissance', status: 'bad', detail: `${p.toFixed(0)}%` }
  },
  (c) => {
    if (c.hotLeadsNeglected === 0) return { id: 'hot-leads-followup', label: 'Leads chauds suivis', status: 'ok' }
    if (c.hotLeadsNeglected <= 3) return { id: 'hot-leads-followup', label: 'Leads chauds suivis', status: 'warn', detail: `${c.hotLeadsNeglected} sans contact 7j+` }
    return { id: 'hot-leads-followup', label: 'Leads chauds suivis', status: 'bad', detail: `${c.hotLeadsNeglected} sans contact 7j+` }
  },
  (c) => {
    const overloaded = c.adminLoads.filter((a) => a.total > 10)
    if (overloaded.length === 0) return { id: 'team-balanced', label: 'Charge équipe équilibrée', status: 'ok' }
    if (overloaded.length === 1) return { id: 'team-balanced', label: 'Charge équipe équilibrée', status: 'warn', detail: `${overloaded[0].name} à ${overloaded[0].total} tâches` }
    return { id: 'team-balanced', label: 'Charge équipe équilibrée', status: 'bad', detail: `${overloaded.length} admins surchargés` }
  },
  (c) => {
    if (c.briefsP1Overdue === 0) return { id: 'briefs-p1-on-time', label: 'Briefs P1 dans les temps', status: 'ok' }
    if (c.briefsP1Overdue === 1) return { id: 'briefs-p1-on-time', label: 'Briefs P1 dans les temps', status: 'warn', detail: '1 dépassé' }
    return { id: 'briefs-p1-on-time', label: 'Briefs P1 dans les temps', status: 'bad', detail: `${c.briefsP1Overdue} dépassés` }
  },
  (c) => {
    if (!c.lastBackupAt) return { id: 'backup-success', label: 'Backup OK', status: 'bad', detail: 'aucun backup récent' }
    const ageH = (Date.now() - c.lastBackupAt.getTime()) / 3_600_000
    if (ageH <= 24) return { id: 'backup-success', label: 'Backup OK', status: 'ok' }
    if (ageH <= 48) return { id: 'backup-success', label: 'Backup OK', status: 'warn', detail: `${Math.round(ageH)}h` }
    return { id: 'backup-success', label: 'Backup OK', status: 'bad', detail: `${Math.round(ageH)}h` }
  },
  (c) => {
    if (c.qualiopiExpiringWithin30Days === 0) return { id: 'qualiopi-compliant', label: 'Qualiopi conforme', status: 'ok' }
    return { id: 'qualiopi-compliant', label: 'Qualiopi conforme', status: 'warn', detail: `${c.qualiopiExpiringWithin30Days} à renouveler < 30j` }
  },
]

export async function evaluatePulseRules(ctx: PulseContext): Promise<PulseCheck[]> {
  return RULES.map((r) => r(ctx))
}
