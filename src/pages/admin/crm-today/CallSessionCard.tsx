import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { CRM_PATHS } from '../../../lib/crmNavigation'
import { CrmBanner, CrmSectionHead } from '../../../components/admin/crm-ui'
import { fetchCallSession, fetchQueueCounts, type CallSession, type QueueCounts } from './callSession'
import './callSession.css'

/** Échelle de la jauge : la cible tombe aux quatre cinquièmes, comme dans la maquette. */
function meterScale(rate: number, target: number | null): number {
  return Math.min(100, Math.max(50, Math.ceil((target ?? 0) * 1.25), rate))
}

/**
 * Séance d'appels du jour de l'utilisateur : appels passés, prospects joints,
 * rendez-vous pris et conversion sur joints face à l'objectif des réglages.
 * `desk` : libellés courts, pour la carte « Aujourd'hui » du poste d'appel.
 * `refreshKey` : relit la séance quand il change (un résultat consigné ou annulé).
 */
export default function CallSessionCard({
  desk = false,
  refreshKey,
  footer,
}: {
  desk?: boolean
  refreshKey?: string | number
  footer?: ReactNode
}) {
  const { t } = useI18n()
  const [session, setSession] = useState<CallSession | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    fetchCallSession()
      .then((data) => {
        if (!active) return
        setSession(data)
        setFailed(false)
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [refreshKey, attempt])

  const id = desk ? 'crm-session-desk' : 'crm-session-today'
  const head = (
    <CrmSectionHead
      id={id}
      title={t(desk ? 'crmSession.titleDesk' : 'crmSession.title')}
      sub={desk ? undefined : t('crmSession.sub')}
    />
  )
  if (!session)
    return (
      <section className="crm-ui-card crm-session" aria-labelledby={id}>
        {head}
        {failed && (
          <CrmBanner
            tone="amber"
            title={t('crmSession.error')}
            actions={
              <button
                type="button"
                className="crm-ui-btn crm-ui-btn--sm"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t('crmSession.retry')}
              </button>
            }
          />
        )}
      </section>
    )

  const { calls, reached, meetings, conversionRate: rate, targetConversionRate: target } = session
  const scale = rate === null ? 100 : meterScale(rate, target)
  return (
    <section className={`crm-ui-card crm-session${desk ? ' crm-session--desk' : ''}`} aria-labelledby={id}>
      {head}
      <dl className="crm-session__nums">
        <div>
          <dt>{t(desk ? 'crmSession.callsShort' : 'crmSession.calls', { count: calls })}</dt>
          <dd>{calls}</dd>
        </div>
        <div>
          <dt>{t(desk ? 'crmSession.reachedShort' : 'crmSession.reached', { count: reached })}</dt>
          <dd>{reached}</dd>
        </div>
        <div>
          <dt>{t(desk ? 'crmSession.meetingsShort' : 'crmSession.meetings', { count: meetings })}</dt>
          <dd>{meetings}</dd>
        </div>
      </dl>
      <div className="crm-session__conversion">
        <div className="crm-session__conversion-top">
          <span>{t('crmSession.conversion')}</span>
          <b>{rate === null ? '—' : `${rate} %`}</b>
        </div>
        {rate === null ? (
          <p className="crm-session__caption">{t('crmSession.conversionNone')}</p>
        ) : (
          <>
            <div
              className="crm-session__meter"
              role="img"
              aria-label={
                target === null
                  ? t('crmSession.meterAriaNoTarget', { rate })
                  : t('crmSession.meterAria', { rate, target })
              }
            >
              <i style={{ width: `${(rate / scale) * 100}%` }} />
              {target !== null && <u style={{ left: `${(target / scale) * 100}%` }} />}
            </div>
            <div className="crm-session__caption">
              <span>{t('crmSession.conversionCaption', { rate, count: reached })}</span>
              {target !== null && <span>{t('crmSession.target', { rate: target })}</span>}
            </div>
          </>
        )}
      </div>
      {footer}
    </section>
  )
}

/** Pied de « Votre séance » : la file de ses fiches, par catégorie, et le lien vers le poste d'appel. */
export function QueueResume() {
  const { t } = useI18n()
  const [counts, setCounts] = useState<QueueCounts | null>(null)
  useEffect(() => {
    let active = true
    fetchQueueCounts()
      .then((data) => active && setCounts(data))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  if (!counts) return null
  return (
    <div className="crm-session__footer">
      <Link className="crm-ui-btn crm-ui-btn--primary" to={CRM_PATHS.poste}>
        <Phone aria-hidden="true" />
        {t('crmSession.resume', { count: counts.all })}
      </Link>
      <p>{t('crmSession.queueMix', { callback: counts.callback, never: counts.never, other: counts.other })}</p>
    </div>
  )
}
