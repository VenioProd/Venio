import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { CrmBanner } from '../../../../components/admin/crm-ui'
import { useI18n } from '../../../../context/I18nContext'
import ProspectCallCheck, { countryName } from '../../../commercial/callCountries/ProspectCallCheck'
import type { CallCheck } from '../../../../services/externalSales'

function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

export function LeadOutsideHoursBanner({ check }: { check: CallCheck | null }) {
  const { t, locale } = useI18n()
  const now = useMinute()
  if (check?.block !== 'OUTSIDE_CALLING_HOURS') return null
  const times = [
    ...new Set(
      check.timeZones.map((timeZone) =>
        new Intl.DateTimeFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(now),
      ),
    ),
  ]
  return (
    <CrmBanner tone="amber" role="status" icon={<Clock />} title={t('crmSuivre.callCheck.outsideTitle')}>
      {t('crmSuivre.callCheck.outsideBody', {
        time: times.join(' / '),
        country: countryName(check.country, locale) || '—',
      })}
    </CrmBanner>
  )
}

export function LeadCallCheckRow({ check }: { check: CallCheck | null }) {
  const { t } = useI18n()
  if (!check) return null
  return (
    <div className="crm-lead-callcheck" role="group" aria-label={t('crmSuivre.callCheck.aria')}>
      {/* Hors plage : le bandeau le dit déjà. */}
      <ProspectCallCheck
        variant="chips"
        check={check.block === 'OUTSIDE_CALLING_HOURS' ? { ...check, block: null } : check}
      />
    </div>
  )
}
