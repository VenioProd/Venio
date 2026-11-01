import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatDateTime } from '../../../i18n/format'
import { apiFetch } from '../../../lib/api'
import type { Intern } from './types'
import { formatDate, INTERN_DAYS } from './types'

const DAY_SHORT_KEYS: Record<string, MessageKey> = {
  lundi: 'intern.dayShort.monday',
  mardi: 'intern.dayShort.tuesday',
  mercredi: 'intern.dayShort.wednesday',
  jeudi: 'intern.dayShort.thursday',
  vendredi: 'intern.dayShort.friday',
  samedi: 'intern.dayShort.saturday',
  dimanche: 'intern.dayShort.sunday',
}

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
  setReminderResult: (
    v: { sent: number; details?: { totalInterns?: number; today?: string; errors?: string[] } } | null,
  ) => void
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
  const { t } = useI18n()
  return (
    <>
      {/* Rappels manuels + logs — toujours visible */}
      {!dashboardLoading && (
        <div className="portal-card" style={{ marginTop: 16, marginBottom: 20 }}>
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                {t('intern.dash.remindersTitle')}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 10 }}>
                {t('intern.dash.remindersSchedule')}
              </span>
            </div>
            {isSuperAdmin && (
              <button
                onClick={async () => {
                  setSendingReminders(true)
                  setReminderResult(null)
                  try {
                    const res = await apiFetch<{ recipientsNotified: string[]; details?: any }>(
                      '/api/admin/interns/send-reminders',
                      { method: 'POST' },
                    )
                    setReminderResult({ sent: res.recipientsNotified?.length || 0, details: res.details })
                    loadDashboard()
                  } catch {
                    /* silent */
                  } finally {
                    setSendingReminders(false)
                  }
                }}
                disabled={sendingReminders}
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  opacity: sendingReminders ? 0.6 : 1,
                }}
              >
                {sendingReminders ? t('intern.dash.sending') : t('intern.dash.sendNow')}
              </button>
            )}
          </div>
          {reminderResult && (
            <div
              style={{
                padding: '10px 20px',
                background:
                  reminderResult.sent > 0
                    ? 'color-mix(in srgb, var(--good) 8%, transparent)'
                    : 'color-mix(in srgb, var(--warning) 8%, transparent)',
                borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
                fontSize: 13,
              }}
            >
              <span style={{ color: reminderResult.sent > 0 ? 'var(--good)' : 'var(--warning)', fontWeight: 600 }}>
                {reminderResult.sent === 0
                  ? t('intern.dash.noneSent')
                  : t('intern.dash.sentCount', { count: reminderResult.sent })}
              </span>
              {reminderResult.details && (
                <span style={{ color: 'var(--text-muted)', marginLeft: 10, fontSize: 11 }}>
                  {t('intern.dash.resultDetails', {
                    total: reminderResult.details.totalInterns ?? '',
                    day: reminderResult.details.today ?? '',
                  })}
                  {(reminderResult.details.errors?.length ?? 0) > 0 &&
                    t('intern.dash.resultErrors', { errors: (reminderResult.details.errors ?? []).join(', ') })}
                </span>
              )}
            </div>
          )}
          {reminderLogs.length === 0 ? (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
              {t('intern.dash.noActivity')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)' }}>
                  {[
                    t('intern.dash.logDate'),
                    t('intern.dash.logStatus'),
                    t('intern.dash.logSent'),
                    t('intern.dash.logRecipients'),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 16px',
                        textAlign: 'left',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reminderLogs.map((log: any) => (
                  <tr
                    key={log._id}
                    style={{ borderTop: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)' }}
                  >
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {formatDateTime(log.startedAt, {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-sm)',
                          background:
                            log.status === 'SUCCESS'
                              ? 'color-mix(in srgb, var(--good) 10%, transparent)'
                              : log.status === 'SKIPPED'
                                ? 'color-mix(in srgb, var(--text-primary) 6%, transparent)'
                                : 'color-mix(in srgb, var(--critical) 10%, transparent)',
                          color:
                            log.status === 'SUCCESS'
                              ? 'var(--good)'
                              : log.status === 'SKIPPED'
                                ? 'var(--text-muted)'
                                : 'var(--critical)',
                        }}
                      >
                        {log.status === 'SUCCESS'
                          ? t('intern.dash.logSuccess')
                          : log.status === 'SKIPPED'
                            ? t('intern.dash.logSkipped')
                            : t('intern.dash.logError')}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {log.actionsExecuted?.length || 0}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 280 }}>
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
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{t('intern.dash.loading')}</p>
      ) : dashboard.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          {t('intern.dash.noActiveMember')}
        </p>
      ) : (
        <>
          {/* Tableau récap activité */}
          <div className="portal-card" style={{ marginTop: 16, marginBottom: 20, overflow: 'hidden' }}>
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
              }}
            >
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
                {t('intern.dash.lastLogins')}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)' }}>
                  {[
                    t('intern.dash.colIntern'),
                    t('intern.dash.colRole'),
                    t('intern.dash.colPresenceDays'),
                    t('intern.dash.colLastLogin'),
                    t('intern.dash.colLastReport'),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 16px',
                        textAlign: 'left',
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        letterSpacing: 'normal',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.map((item: any) => {
                  const { intern: di, stats: ds } = item
                  const loginAt = (di.userId as any)?.lastLoginAt
                  const daysSinceLogin = loginAt
                    ? Math.floor((Date.now() - new Date(loginAt).getTime()) / 86400000)
                    : null
                  const loginColor =
                    daysSinceLogin === null
                      ? 'var(--text-muted)'
                      : daysSinceLogin === 0
                        ? 'var(--good)'
                        : daysSinceLogin <= 1
                          ? 'var(--primary)'
                          : daysSinceLogin <= 3
                            ? 'var(--warning)'
                            : 'var(--critical)'
                  const reportColor =
                    ds.daysSinceLastReport === null
                      ? 'var(--text-muted)'
                      : ds.daysSinceLastReport <= 1
                        ? 'var(--good)'
                        : ds.daysSinceLastReport <= 3
                          ? 'var(--warning)'
                          : 'var(--critical)'
                  const jours = (di.joursPresence as string[] | undefined) || []
                  return (
                    <tr
                      key={di._id}
                      style={{
                        borderTop: '1px solid color-mix(in srgb, var(--text-primary) 4%, transparent)',
                        cursor: 'pointer',
                      }}
                      onClick={() => navigate(`/admin/stagiaires/${di._id}`)}
                    >
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 13 }}>
                          {(di.userId as any)?.name}
                        </span>
                        <span
                          style={{
                            display: 'inline-block',
                            marginLeft: 7,
                            padding: '1px 6px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 10,
                            fontWeight: 600,
                            background:
                              di.type === 'ALTERNANT'
                                ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                                : 'color-mix(in srgb, var(--text-secondary) 15%, transparent)',
                            color: di.type === 'ALTERNANT' ? 'var(--primary)' : 'var(--text-secondary)',
                          }}
                        >
                          {di.type === 'ALTERNANT'
                            ? t('intern.dash.typeApprenticeShort')
                            : t('intern.dash.typeInternShort')}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>{di.poste}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {INTERN_DAYS.map((j) => (
                            <span
                              key={j}
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                padding: '2px 4px',
                                borderRadius: 'var(--r-sm)',
                                background: jours.includes(j)
                                  ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                                  : 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                                color: jours.includes(j)
                                  ? 'var(--primary)'
                                  : 'color-mix(in srgb, var(--text-primary) 20%, transparent)',
                              }}
                            >
                              {t(DAY_SHORT_KEYS[j])}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: loginColor }}>
                          {loginAt
                            ? daysSinceLogin === 0
                              ? t('intern.dash.today')
                              : daysSinceLogin === 1
                                ? t('intern.dash.yesterday')
                                : t('intern.dash.daysAgo', { count: daysSinceLogin ?? 0 })
                            : t('intern.dash.never')}
                        </span>
                        {loginAt && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                            {formatDateTime(loginAt, {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: reportColor }}>
                          {ds.lastActivity
                            ? ds.daysSinceLastReport === 0
                              ? t('intern.dash.today')
                              : ds.daysSinceLastReport === 1
                                ? t('intern.dash.yesterday')
                                : t('intern.dash.daysAgo', { count: ds.daysSinceLastReport })
                            : t('intern.dash.noReport')}
                        </span>
                        {ds.lastActivity && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                            {formatDate(ds.lastActivity)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Cartes détaillées */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
              gap: 16,
            }}
          >
            {dashboard.map((item: any) => {
              const { intern: di, stats: ds } = item
              const alertLevel =
                ds.daysSinceLastReport === null
                  ? 'none'
                  : ds.daysSinceLastReport > 3
                    ? 'danger'
                    : ds.daysSinceLastReport > 1
                      ? 'warning'
                      : 'ok'
              const alertColors = {
                none: 'color-mix(in srgb, var(--text-primary) 20%, transparent)',
                danger: 'var(--critical)',
                warning: 'var(--warning)',
                ok: 'var(--good)',
              }
              const alertColor = alertColors[alertLevel]
              const colors = [
                'var(--primary)',
                'var(--text-secondary)',
                'var(--text-primary)',
                'var(--primary)',
                'var(--text-muted)',
                'var(--primary)',
              ]
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
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: `color-mix(in srgb, ${avatarColor} 13.3%, transparent)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: avatarColor,
                          fontWeight: 700,
                          fontSize: 16,
                          flexShrink: 0,
                        }}
                      >
                        {(di.userId?.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 15 }}>
                            {di.userId?.name}
                          </span>
                          <span
                            style={{
                              padding: '1px 7px',
                              borderRadius: 'var(--r-sm)',
                              fontSize: 10,
                              fontWeight: 600,
                              background:
                                di.type === 'ALTERNANT'
                                  ? 'color-mix(in srgb, var(--primary) 15%, transparent)'
                                  : 'color-mix(in srgb, var(--text-secondary) 15%, transparent)',
                              color: di.type === 'ALTERNANT' ? 'var(--primary)' : 'var(--text-secondary)',
                            }}
                          >
                            {di.type === 'ALTERNANT' ? t('intern.type.apprentice') : t('intern.type.intern')}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                          {di.poste}
                          {di.departement ? ` — ${di.departement}` : ''}
                        </div>
                      </div>
                      {alertLevel === 'danger' && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'color-mix(in srgb, var(--critical) 13.33%, transparent)',
                            color: 'var(--critical)',
                          }}
                        >
                          {t('intern.dash.inactive', { count: ds.daysSinceLastReport })}
                        </span>
                      )}
                      {alertLevel === 'warning' && (
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 'var(--r-sm)',
                            fontSize: 10,
                            fontWeight: 700,
                            background: 'color-mix(in srgb, var(--warning) 13.33%, transparent)',
                            color: 'var(--warning)',
                          }}
                        >
                          {t('intern.dash.noReportFor', { count: ds.daysSinceLastReport })}
                        </span>
                      )}
                    </div>

                    {/* Stats mini */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '8px 4px',
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                        }}
                      >
                        <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 18 }}>
                          {ds.reportsThisWeek}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('intern.dash.thisWeek')}</div>
                      </div>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '8px 4px',
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                        }}
                      >
                        <div style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 18 }}>
                          {ds.validationRate}%
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('intern.dash.validation')}</div>
                      </div>
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '8px 4px',
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
                        }}
                      >
                        <div style={{ color: 'var(--good)', fontWeight: 700, fontSize: 18 }}>{ds.totalReports}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{t('intern.dash.totalReports')}</div>
                      </div>
                    </div>

                    {/* Barre de progression */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                          {t('intern.dash.internshipProgress', { progress: ds.progress })}
                        </span>
                        <span
                          style={{
                            color:
                              ds.daysRemaining <= 7
                                ? 'var(--critical)'
                                : ds.daysRemaining <= 30
                                  ? 'var(--warning)'
                                  : 'var(--text-muted)',
                            fontSize: 11,
                          }}
                        >
                          {ds.daysRemaining > 0
                            ? t('intern.card.daysLeft', { count: ds.daysRemaining })
                            : t('intern.status.finished')}
                        </span>
                      </div>
                      <div
                        style={{
                          height: 4,
                          borderRadius: 'var(--r-sm)',
                          background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            borderRadius: 'var(--r-sm)',
                            width: `${ds.progress}%`,
                            background:
                              ds.progress >= 90
                                ? 'var(--critical)'
                                : ds.progress >= 70
                                  ? 'var(--warning)'
                                  : 'var(--primary)',
                            transition: 'width 0.5s',
                          }}
                        />
                      </div>
                    </div>

                    {/* Derniere activite */}
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
                      {t('intern.dash.lastActivity', {
                        value: ds.lastActivity ? formatDate(ds.lastActivity) : t('intern.dash.lastActivityNone'),
                      })}
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
