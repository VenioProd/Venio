import { useEffect, useState } from 'react'
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

const clock = (now: Date, timeZone: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(now)

/**
 * Pays et heure locale du prospect dans une ligne de la file (lot P), et ce qui
 * empêche de l'appeler maintenant. Plusieurs fuseaux possibles : toutes les heures.
 */
export default function ProspectCallCheck({ check, unreachable }: { check?: CallCheck; unreachable?: boolean }) {
  const { t, locale } = useI18n()
  const now = useMinute()
  if (!check && !unreachable) return null
  const times = [...new Set((check?.timeZones ?? []).map((zone) => clock(now, zone, locale)))]
  return (
    <span className="call-check">
      {check?.country && (
        <span className="call-check-country" title={countryName(check.country, locale)}>
          {check.country}
        </span>
      )}
      {times.length > 0 && (
        <time
          className="call-check-time"
          aria-label={
            times.length > 1
              ? t('callCountries.localTimeSeveral', { times: times.join(', ') })
              : t('callCountries.localTime', { time: times[0]! })
          }
        >
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
