import { useEffect, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { formatDate } from '../../../../i18n/format'
import { apiFetch } from '../../../../lib/api'
import '../../crm-today/callSession.css'

/** `GET /api/admin/crm/pilotage/call-activity` : appels consignés par jour de Paris, des nombres seulement. */
export interface CallActivity {
  days: Array<{ day: string; calls: number; reached: number }>
  calls: number
  reached: number
  reachedRate: number | null
}

/** Midi UTC : le jour reste le même dans tous les fuseaux d'affichage courants. */
const dayDate = (day: string) => `${day}T12:00:00Z`

/**
 * Activité d'appels (Piloter › Prévisions et objectifs) : appels par jour sur
 * 14 jours, dont décrochés, et part de décrochés, sur le périmètre du pilotage
 * (`entity` : celle choisie dans la barre du pilotage).
 */
export default function CallActivityPanel({ entity }: { entity: string }) {
  const { t } = useI18n()
  const [data, setData] = useState<{ entity: string; activity: CallActivity | null; failed: boolean } | null>(null)

  useEffect(() => {
    let active = true
    const query = entity ? `?entity=${encodeURIComponent(entity)}` : ''
    apiFetch<CallActivity>(`/api/admin/crm/pilotage/call-activity${query}`)
      .then(
        (activity) =>
          active && setData({ entity, activity: Array.isArray(activity?.days) ? activity : null, failed: false }),
      )
      .catch(() => active && setData({ entity, activity: null, failed: true }))
    return () => {
      active = false
    }
  }, [entity])

  const activity = data?.activity ?? null
  const max = activity ? Math.max(1, ...activity.days.map((row) => row.calls)) : 1
  return (
    <section className="crm-ui-card pilotage-block pilotage-block-wide" aria-labelledby="crm-pilot-calls">
      <h3 id="crm-pilot-calls" className="pilotage-subtitle">
        {t('crmSession.activity.title')} <span className="pilotage-subtext">{t('crmSession.activity.sub')}</span>
      </h3>
      {data?.failed && <p className="admin-error">{t('crmSession.activity.error')}</p>}
      {activity && (
        <>
          <dl className="crm-session-activity__nums">
            <div>
              <dt>{t('crmSession.activity.calls', { count: activity.calls })}</dt>
              <dd>{activity.calls}</dd>
            </div>
            <div>
              <dt>{t('crmSession.activity.reached', { count: activity.reached })}</dt>
              <dd>{activity.reached}</dd>
            </div>
            <div>
              <dt>{t('crmSession.activity.rate')}</dt>
              <dd>{activity.reachedRate === null ? '—' : `${activity.reachedRate} %`}</dd>
            </div>
          </dl>
          {activity.calls === 0 ? (
            <p className="crm-session-muted">{t('crmSession.activity.empty')}</p>
          ) : (
            <>
              <ul
                className="crm-session-activity__chart"
                aria-label={t('crmSession.activity.chartAria', { total: activity.calls, reached: activity.reached })}
              >
                {activity.days.map((row) => (
                  <li key={row.day}>
                    <span className="crm-ui-sr-only">
                      {t('crmSession.activity.day', {
                        day: formatDate(dayDate(row.day), { weekday: 'long', day: 'numeric', month: 'long' }),
                        calls: row.calls,
                        reached: row.reached,
                      })}
                    </span>
                    {row.calls > 0 && (
                      <span
                        className="crm-session-activity__bar"
                        style={{ height: `${(row.calls / max) * 100}%` }}
                        aria-hidden="true"
                      >
                        <span style={{ height: `${(row.reached / row.calls) * 100}%` }} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="crm-session-activity__axis" aria-hidden="true">
                {activity.days.map((row) => (
                  <span key={row.day}>{formatDate(dayDate(row.day), { day: 'numeric' })}</span>
                ))}
              </div>
              <ul className="crm-session-activity__legend" aria-hidden="true">
                <li>
                  <span className="crm-session-activity__swatch crm-session-activity__swatch--soft" />
                  {t('crmSession.activity.legendCalls')}
                </li>
                <li>
                  <span className="crm-session-activity__swatch" />
                  {t('crmSession.activity.legendReached')}
                </li>
              </ul>
            </>
          )}
          <p className="pilotage-subtext">{t('crmSession.activity.note')}</p>
        </>
      )}
    </section>
  )
}
