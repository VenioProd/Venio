import React, { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Shield, Sparkles } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import { CrmChip, CrmListRow, CrmSectionHead } from '../../../components/admin/crm-ui'
import CallHoldDecision from '../crm-board/CallHoldDecision'
import { clockLabel } from '../crm-board/worklist/helpers'
import { translate } from '../../../i18n'
import type { PendingAnalysis, PendingHold } from './useTodayData'

/** « 4 min 22 », ou « 45 s » sous la minute. */
export function durationLabel(totalSec: number): string {
  const seconds = Math.max(0, Math.round(totalSec))
  if (seconds < 60) return translate('crmToday.durationShort', { seconds })
  return translate('crmToday.duration', {
    minutes: Math.floor(seconds / 60),
    seconds: String(seconds % 60).padStart(2, '0'),
  })
}

/** « 13 novembre, 10 h 07 ». */
export function dateTimeLabel(value: string): string {
  return `${formatDate(value, { day: 'numeric', month: 'long' })}, ${clockLabel(value)}`
}

/** Phrase courte de l'appel : durée et moment, jamais son contenu. */
export function callLabel(analysis: PendingAnalysis): string {
  const when = dateTimeLabel(analysis.callDate)
  return analysis.durationSec
    ? translate('crmToday.analysis.meta', { duration: durationLabel(analysis.durationSec), when })
    : translate('crmToday.analysis.metaNoDuration', { when })
}

export function AnalysesSection({
  analyses,
  total,
  currentUserId,
  analysisHref,
}: {
  analyses: PendingAnalysis[]
  total: number
  currentUserId?: string
  analysisHref: (analysis: PendingAnalysis) => string
}) {
  const { t } = useI18n()
  return (
    <section className="crm-ui-card crm-ui-card--flush" aria-labelledby="crm-today-analyses">
      <CrmSectionHead
        id="crm-today-analyses"
        title={t('crmToday.section.analyses')}
        count={total}
        tone="grey"
        level={3}
        compact
      />
      <ul className="crm-ui-list">
        {analyses.map((analysis) => (
          <CrmListRow
            key={analysis.callId}
            lead={<Sparkles aria-hidden="true" className="crm-today-spark" />}
            title={<Link to={analysisHref(analysis)}>{analysis.company}</Link>}
            meta={
              <>
                {callLabel(analysis)}
                {analysis.author && analysis.author._id !== currentUserId
                  ? ` · ${t('crmToday.analysis.by', { name: analysis.author.name })}`
                  : ''}
              </>
            }
            actions={
              <Link
                className="crm-ui-btn crm-ui-btn--soft crm-ui-btn--sm"
                to={analysisHref(analysis)}
                aria-label={t('crmToday.analysis.openAria', { company: analysis.company })}
              >
                <Eye aria-hidden="true" />
                {t('crmToday.analysis.open')}
              </Link>
            }
          />
        ))}
      </ul>
      {total > analyses.length && (
        <p className="crm-today-more">{t('crmToday.analysis.more', { count: total - analyses.length })}</p>
      )}
    </section>
  )
}

/**
 * Retenues d'opposition à décider. Chaque retenue ouvre la décision existante
 * (`CallHoldDecision`) : elle relit elle-même la citation par la route étroite
 * et confirme ou lève, après confirmation.
 */
export function HoldsCard({
  holds,
  total,
  leadHref,
  onDecided,
}: {
  holds: PendingHold[]
  total: number
  leadHref: (leadId: string) => string
  onDecided: (hold: PendingHold) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  return (
    <section className="crm-ui-card crm-today-holds" aria-labelledby="crm-today-holds">
      <CrmSectionHead
        id="crm-today-holds"
        title={
          <span ref={headingRef} tabIndex={-1} className="crm-today-focus-target">
            {t('crmToday.section.holds')}
          </span>
        }
        actions={
          <CrmChip tone="red" icon={<Shield />}>
            {t('crmToday.holds.count', { count: total })}
          </CrmChip>
        }
      />
      <p className="crm-today-holds__intro">{t('crmToday.holds.intro')}</p>
      <ul className="crm-today-holds__list">
        {holds.map((hold) => (
          <li key={hold.leadId} className="crm-today-holds__item">
            <span className="crm-today-holds__name">{hold.company}</span>
            {/* Décision ouverte : elle redit elle-même la date et l'auteur, avec la citation. */}
            {open !== hold.leadId && (
              <p className="crm-today-holds__meta">
                {hold.author
                  ? t('crmToday.holds.meta', { date: dateTimeLabel(hold.at), author: hold.author.name })
                  : t('crmToday.holds.metaNoAuthor', { date: dateTimeLabel(hold.at) })}
              </p>
            )}
            <div className="crm-today-holds__actions">
              <button
                type="button"
                className="crm-ui-btn crm-ui-btn--danger crm-ui-btn--sm"
                aria-expanded={open === hold.leadId}
                aria-label={
                  open === hold.leadId ? undefined : t('crmToday.holds.decideAria', { company: hold.company })
                }
                onClick={() => setOpen((current) => (current === hold.leadId ? null : hold.leadId))}
              >
                {open === hold.leadId ? t('crmToday.holds.hide') : t('crmToday.holds.decide')}
              </button>
              <Link className="crm-ui-btn crm-ui-btn--ghost crm-ui-btn--sm" to={leadHref(hold.leadId)}>
                {t('crmToday.holds.openLead')}
              </Link>
            </div>
            {open === hold.leadId && (
              <div className="crm-today-holds__decision">
                <CallHoldDecision
                  leadId={hold.leadId}
                  onDecided={() => {
                    setOpen(null)
                    // La dernière retenue décidée emporte la carte : le focus est alors rendu par l'écran.
                    if (holds.length > 1) headingRef.current?.focus()
                    onDecided(hold)
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {total > holds.length && (
        <p className="crm-today-more">{t('crmToday.holds.more', { count: total - holds.length })}</p>
      )}
    </section>
  )
}
