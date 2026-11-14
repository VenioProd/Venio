import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react'
import CrmChip, { type CrmTone } from '../../../components/admin/crm-ui/CrmChip'
import { useI18n, type MessageKey } from '../../../context/I18nContext'
import type { CallBlock, CallCheck } from '../../../services/externalSales'
import './callCountries.css'

/** Blocages qui ne passent pas d'eux-mêmes : la barre d'appel est désactivée. La plage horaire, elle, se rouvre. */
export const HARD_BLOCKS: readonly CallBlock[] = [
  'LEAD_NOT_CALLABLE',
  'NOT_BUSINESS_CONTACT',
  'COUNTRY_NOT_ALLOWED',
  'TIMEZONE_UNKNOWN',
]

function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function countryName(code: string | null | undefined, locale: string): string {
  if (!code) return ''
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

const BLOCK_TONE: Record<CallBlock, CrmTone> = {
  OUTSIDE_CALLING_HOURS: 'amber',
  NOT_BUSINESS_CONTACT: 'amber',
  TIMEZONE_UNKNOWN: 'amber',
  COUNTRY_NOT_ALLOWED: 'red',
  LEAD_NOT_CALLABLE: 'red',
}

const clock = (now: Date, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(now)

/**
 * Pays et heure locale du prospect dans une ligne de la file (lot P), et ce qui
 * empêche de l'appeler maintenant. Plusieurs fuseaux possibles : toutes les heures.
 */
export default function ProspectCallCheck({
  check,
  unreachable,
  variant = 'plain',
}: {
  check?: CallCheck
  unreachable?: boolean
  /** `chips` : puces d'état du CRM de l'équipe (refonte) ; `plain` : le rendu de l'espace du commercial externe. */
  variant?: 'plain' | 'chips'
}) {
  const { t, locale } = useI18n()
  const now = useMinute()
  if (!check && !unreachable) return null
  const times = [...new Set((check?.timeZones ?? []).map((zone) => clock(now, zone, locale)))]
  const timeLabel =
    times.length > 1
      ? t('callCountries.localTimeSeveral', { times: times.join(', ') })
      : times.length === 1
        ? t('callCountries.localTime', { time: times[0]! })
        : undefined
  if (variant === 'chips') {
    const block = check?.block
    return (
      <span className="crm-desk-check">
        {check?.country && (
          <span className="crm-desk-cc" title={countryName(check.country, locale)}>
            {check.country}
          </span>
        )}
        {times.length > 0 && (
          <time className="crm-desk-localtime" aria-label={timeLabel}>
            {times.join(' / ')}
          </time>
        )}
        {unreachable && (
          <CrmChip tone="red" icon={<ShieldAlert />}>
            {t('callCountries.unreachable')}
          </CrmChip>
        )}
        {block && (
          <CrmChip tone={BLOCK_TONE[block]} icon={block === 'OUTSIDE_CALLING_HOURS' ? <Clock /> : <AlertTriangle />}>
            {t(`callCountries.block.${block}` as MessageKey)}
          </CrmChip>
        )}
      </span>
    )
  }
  return (
    <span className="call-check">
      {check?.country && (
        <span className="call-check-country" title={countryName(check.country, locale)}>
          {check.country}
        </span>
      )}
      {times.length > 0 && (
        <time className="call-check-time" aria-label={timeLabel}>
          {times.join(' / ')}
        </time>
      )}
      {unreachable && <em className="call-check-block">{t('callCountries.unreachable')}</em>}
      {check?.block && (
        <em className="call-check-block" data-block={check.block}>
          {t(`callCountries.block.${check.block}` as MessageKey)}
        </em>
      )}
    </span>
  )
}
