import { apiFetch } from '../../../lib/api'
import type { Intern } from './types'
import { formatDate } from './types'

interface ReminderLog {
  _id: string
  status: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  recipientsNotified?: string[]
  actionsExecuted?: string[]
  details?: { totalInterns?: number; today?: string; errors?: string[] }
}

interface DashboardItem {
  intern: { _id: string; userName: string; userId?: string; type?: string; poste?: string; joursPresence?: string[] }
  reportsCount: number
  reportsThisWeek: number
  validatedCount: number
  lastReportDate?: string
  lastReportStatus?: string
}

interface Props {
  dashboard: DashboardItem[]
  dashboardLoading: boolean
  reminderResult: { sent: number; details?: { totalInterns?: number; today?: string; errors?: string[] } } | null
  setReminderResult: (v: { sent: number; details?: { totalInterns?: number; today?: string; errors?: string[] } } | null) => void
  sendingReminders: boolean
  setSendingReminders: (v: boolean) => void
  reminderLogs: ReminderLog[]
  interns: Intern[]
  isSuperAdmin: boolean
  loadDashboard: () => void
  navigate: (path: string) => void
}

export default function DashboardTab({
  dashboard,
  dashboardLoading,
  reminderResult,
  setReminderResult,
  sendingReminders,
  setSendingReminders,
  reminderLogs,
  interns,
  isSuperAdmin,
  loadDashboard,
  navigate,
}: Props) {
  return (
    <>
      {/* Rappels manuels + logs — toujours visible */}
  {!dashboardLoading && (
    <div className="portal-card" style={{ marginTop: 16, marginBottom: 20 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Rappels de rapport</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 10 }}>Automatique tous les jours à 09h00 sur les jours de présence</span>
        </div>
        {isSuperAdmin && (
          <button
            onClick={async () => {
              setSendingReminders(true)
              setReminderResult(null)
              try {
                const res = await apiFetch<{ recipientsNotified: string[]; details?: any }>('/api/admin/interns/send-reminders', { method: 'POST' })
                setReminderResult({ sent: res.recipientsNotified?.length || 0, details: res.details })
                loadDashboard()
              } catch { /* silent */ } finally { setSendingReminders(false) }
            }}
            disabled={sendingReminders}
            style={{ padding: '7px 16px', borderRadius: 7, background: '#0ea5e9', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: sendingReminders ? 0.6 : 1 }}
          >
            {sendingReminders ? 'Envoi...' : 'Envoyer maintenant'}
          </button>
        )}
      </div>
      {reminderResult && (
        <div style={{ padding: '10px 20px', background: reminderResult.sent > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,200,0,0.08)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
          <span style={{ color: reminderResult.sent > 0 ? '#22c55e' : '#fbbf24', fontWeight: 600 }}>
            {reminderResult.sent === 0 ? 'Aucun rappel envoyé' : `${reminderResult.sent} rappel(s) envoyé(s)`}
          </span>
          {reminderResult.details && (
            <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 10, fontSize: 11 }}>
              {reminderResult.details.totalInterns} stagiaire(s) actif(s) · jour: {reminderResult.details.today}
              {(reminderResult.details.errors?.length ?? 0) > 0 && ` · erreurs: ${(reminderResult.details.errors ?? []).join(', ')}`}
            </span>
          )}
        </div>
      )}
      {reminderLogs.length === 0 ? (
        <div style={{ padding: '20px', color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>Aucune activité enregistrée</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              {['Date', 'Statut', 'Rappels envoyés', 'Destinataires'].map((h) => (
                <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reminderLogs.map((log: any) => (
              <tr key={log._id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  {new Date(log.startedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: log.status === 'SUCCESS' ? 'rgba(34,197,94,0.1)' : log.status === 'SKIPPED' ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.1)', color: log.status === 'SUCCESS' ? '#22c55e' : log.status === 'SKIPPED' ? 'rgba(255,255,255,0.4)' : '#ef4444' }}>
                    {log.status === 'SUCCESS' ? 'Succès' : log.status === 'SKIPPED' ? 'Ignoré' : 'Erreur'}
                  </span>
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                  {log.actionsExecuted?.length || 0}
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 280 }}>
                  {log.recipientsNotified?.join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )}

  {dashboardLoading ? (
    <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Chargement...</p>
  ) : dashboard.length === 0 ? (
    <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun membre actif</p>
  ) : (
    <>
    {/* Tableau récap activité */}
    <div className="portal-card" style={{ marginTop: 16, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Dernières connexions</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
            {['Stagiaire', 'Poste', 'Jours présence', 'Dernière connexion', 'Dernier rapport'].map((h) => (
              <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dashboard.map((item: any) => {
            const { intern: di, stats: ds } = item
            const loginAt = (di.userId as any)?.lastLoginAt
            const daysSinceLogin = loginAt ? Math.floor((Date.now() - new Date(loginAt).getTime()) / 86400000) : null
            const loginColor = daysSinceLogin === null ? 'rgba(255,255,255,0.3)' : daysSinceLogin === 0 ? '#22c55e' : daysSinceLogin <= 1 ? '#0ea5e9' : daysSinceLogin <= 3 ? '#f59e0b' : '#ef4444'
            const reportColor = ds.daysSinceLastReport === null ? 'rgba(255,255,255,0.3)' : ds.daysSinceLastReport <= 1 ? '#22c55e' : ds.daysSinceLastReport <= 3 ? '#f59e0b' : '#ef4444'
            const jours = (di.joursPresence as string[] | undefined) || []
            const joursAbrev: Record<string, string> = { lundi: 'Lu', mardi: 'Ma', mercredi: 'Me', jeudi: 'Je', vendredi: 'Ve', samedi: 'Sa', dimanche: 'Di' }
            return (
              <tr key={di._id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => navigate(`/admin/stagiaires/${di._id}`)}>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ color: '#fff', fontWeight: 500, fontSize: 13 }}>{(di.userId as any)?.name}</span>
                  <span style={{ display: 'inline-block', marginLeft: 7, padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: di.type === 'ALTERNANT' ? 'rgba(168,85,247,0.15)' : 'rgba(14,165,233,0.15)', color: di.type === 'ALTERNANT' ? '#a855f7' : '#0ea5e9' }}>
                    {di.type === 'ALTERNANT' ? 'Alt' : 'St'}
                  </span>
                </td>
                <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{di.poste}</td>
                <td style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((j) => (
                      <span key={j} style={{ fontSize: 10, fontWeight: 600, padding: '2px 4px', borderRadius: 3, background: jours.includes(j) ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.04)', color: jours.includes(j) ? '#0ea5e9' : 'rgba(255,255,255,0.2)' }}>
                        {joursAbrev[j]}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: loginColor }}>
                    {loginAt ? (daysSinceLogin === 0 ? "Aujourd'hui" : daysSinceLogin === 1 ? 'Hier' : `il y a ${daysSinceLogin}j`) : 'Jamais'}
                  </span>
                  {loginAt && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{new Date(loginAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: reportColor }}>
                    {ds.lastActivity ? (ds.daysSinceLastReport === 0 ? "Aujourd'hui" : ds.daysSinceLastReport === 1 ? 'Hier' : `il y a ${ds.daysSinceLastReport}j`) : 'Aucun rapport'}
                  </span>
                  {ds.lastActivity && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{formatDate(ds.lastActivity)}</div>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    {/* Cartes détaillées */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
      {dashboard.map((item: any) => {
        const { intern: di, stats: ds } = item
        const alertLevel = ds.daysSinceLastReport === null ? 'none' : ds.daysSinceLastReport > 3 ? 'danger' : ds.daysSinceLastReport > 1 ? 'warning' : 'ok'
        const alertColors = { none: 'rgba(255,255,255,0.2)', danger: '#ef4444', warning: '#f59e0b', ok: '#22c55e' }
        const alertColor = alertColors[alertLevel]
        const colors = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899']
        const avatarColor = colors[(di.userId?.name || '').charCodeAt(0) % colors.length]

        return (
          <div
            key={di._id}
            className="portal-card"
            style={{ cursor: 'pointer', borderLeft: `3px solid ${alertColor}`, transition: 'transform 0.15s' }}
            onClick={() => navigate(`/admin/stagiaires/${di._id}`)}
          >
            <div style={{ padding: '16px 20px' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatarColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: avatarColor, fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                  {(di.userId?.name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{di.userId?.name}</span>
                    <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: di.type === 'ALTERNANT' ? 'rgba(168,85,247,0.15)' : 'rgba(14,165,233,0.15)', color: di.type === 'ALTERNANT' ? '#a855f7' : '#0ea5e9' }}>
                      {di.type === 'ALTERNANT' ? 'Alternant' : 'Stagiaire'}
                    </span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{di.poste}{di.departement ? ` — ${di.departement}` : ''}</div>
                </div>
                {alertLevel === 'danger' && (
                  <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#ef444422', color: '#ef4444' }}>
                    INACTIF {ds.daysSinceLastReport}j
                  </span>
                )}
                {alertLevel === 'warning' && (
                  <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#f59e0b22', color: '#f59e0b' }}>
                    {ds.daysSinceLastReport}j sans rapport
                  </span>
                )}
              </div>

              {/* Stats mini */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 18 }}>{ds.reportsThisWeek}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Cette semaine</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: 18 }}>{ds.validationRate}%</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Validation</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 18 }}>{ds.totalReports}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Total rapports</div>
                </div>
              </div>

              {/* Barre de progression */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Stage : {ds.progress}%</span>
                  <span style={{ color: ds.daysRemaining <= 7 ? '#ef4444' : ds.daysRemaining <= 30 ? '#f59e0b' : 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                    {ds.daysRemaining > 0 ? `${ds.daysRemaining}j restants` : 'Termine'}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ height: '100%', borderRadius: 2, width: `${ds.progress}%`, background: ds.progress >= 90 ? '#ef4444' : ds.progress >= 70 ? '#f59e0b' : '#0ea5e9', transition: 'width 0.5s' }} />
                </div>
              </div>

              {/* Derniere activite */}
              <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                Derniere activite : {ds.lastActivity ? formatDate(ds.lastActivity) : 'Aucune'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
    </>
  )}
  </>
  )
}
