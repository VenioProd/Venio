import React, { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Clock, Inbox, Phone, Sparkles } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { CrmEmpty, CrmNowBanner, CrmSidePanel, CrmWithPanel } from '../../../components/admin/crm-ui'
import type { Lead, WorklistGroups } from '../../../types/crm.types'
import WorklistSection, { type WorklistListProps } from '../crm-board/worklist/WorklistSection'
import { useRowFocus } from '../crm-board/worklist/useRowFocus'
import { calendarDaysAgo, clockLabel, describeDue } from '../crm-board/worklist/helpers'
import { AnalysesSection, HoldsCard, callLabel } from './PendingSections'
import type { PendingAnalysis, PendingHold, PendingResponse } from './useTodayData'

interface DayViewProps extends WorklistListProps {
  groups: WorklistGroups
  pending: PendingResponse | null
  pendingError: ReactNode
  now: Date
  currentUserId?: string
  analysisHref: (analysis: PendingAnalysis) => string
  leadHref: (leadId: string) => string
  onHoldDecided: (hold: PendingHold) => void
  /** Annonce lue après une décision prise hors des lignes de la file. */
  extraAnnouncement: string
  emptyAction?: ReactNode
  filtered: boolean
  clearFilters: ReactNode
}

const callable = (lead: Lead) => Boolean(lead.contactPhone && !lead.callHold)

/**
 * « Aujourd'hui » : bandeau de la prochaine action, répartition du jour, puis
 * en retard, analyses à valider et la journée heure par heure ; à droite, les
 * retenues d'opposition à décider.
 */
export default function DayView({
  groups,
  pending,
  pendingError,
  now,
  currentUserId,
  analysisHref,
  leadHref,
  onHoldDecided,
  extraAnnouncement,
  emptyAction,
  filtered,
  clearFilters,
  onPatch,
  onLogContact,
  onAddNote,
  ...rowProps
}: DayViewProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const late = groups.overdue
  const today = groups.today
  const analyses = pending?.analyses ?? []
  const analysesTotal = pending?.analysesTotal ?? 0
  const holds = pending?.holds ?? []
  const rows = [...late, ...today]
  const { track, announcement } = useRowFocus(rows, containerRef, fallbackRef)
  const handlers = {
    onPatch: (id: string, patch: Record<string, unknown>) => track(id, () => onPatch(id, patch)),
    onLogContact: (id: string, payload: { nextActionAt: string | null; note: string }) =>
      track(id, () => onLogContact(id, payload)),
    onAddNote: (id: string, text: string) => track(id, () => onAddNote(id, text)),
  }
  const total = late.length + today.length + analysesTotal
  const canManage = rowProps.canManageCrm

  // Bandeau : l'analyse la plus récente d'abord (l'appel est frais), puis le plus gros retard.
  let banner: ReactNode
  const nextLate = late[0]
  if (analyses[0]) {
    banner = (
      <CrmNowBanner
        kicker={t('crmToday.now.kicker')}
        icon={<Sparkles />}
        titleId="crm-today-now"
        title={t('crmToday.now.analysisTitle', { company: analyses[0].company })}
        text={`${callLabel(analyses[0])}.`}
        action={
          <Link className="crm-ui-btn crm-ui-btn--primary crm-ui-btn--big" to={analysisHref(analyses[0])}>
            {t('crmToday.now.openAnalysis')}
          </Link>
        }
      />
    )
  } else if (nextLate) {
    const days = nextLate.nextActionAt ? calendarDaysAgo(nextLate.nextActionAt, now) : 0
    banner = (
      <CrmNowBanner
        kicker={t('crmToday.now.kicker')}
        icon={<Clock />}
        titleId="crm-today-now"
        title={t('crmToday.now.lateTitle', { company: nextLate.company })}
        text={`${nextLate.nextActionLabel || describeDue(nextLate, rowProps.thresholds)}. ${t('crmToday.chip.late', { days })}.`}
        action={
          canManage && rowProps.onCall && callable(nextLate) ? (
            <button
              type="button"
              className="crm-ui-btn crm-ui-btn--primary crm-ui-btn--big"
              aria-label={t('crm.worklist.callAria', { company: nextLate.company })}
              onClick={() => rowProps.onCall?.(nextLate)}
            >
              <Phone aria-hidden="true" />
              {t('crmToday.now.call')}
            </button>
          ) : (
            <Link className="crm-ui-btn crm-ui-btn--primary crm-ui-btn--big" to={leadHref(nextLate._id)}>
              {t('crmToday.now.openLead')}
            </Link>
          )
        }
      />
    )
  } else {
    banner = (
      <CrmNowBanner
        kicker={t('crmToday.now.clearKicker')}
        icon={<CircleCheck />}
        titleId="crm-today-now"
        title={t('crmToday.now.clearTitle')}
        text={t(canManage ? 'crmToday.now.clearText' : 'crmToday.now.clearTextReadOnly')}
        action={emptyAction}
      />
    )
  }

  // Ligne « maintenant » : avant la première relance du jour encore à venir.
  const nowIndex = today.findIndex((lead) => lead.nextActionAt && new Date(lead.nextActionAt) > now)
  const nowLine = today.length
    ? {
        index: nowIndex === -1 ? today.length : nowIndex,
        node: (
          <li className="crm-today-now-line" key="now">
            {t('crmToday.nowLine', { time: clockLabel(now) })}
          </li>
        ),
      }
    : undefined

  const share = (count: number) => `${(count / Math.max(total, 1)) * 100}%`
  const mix = (
    <section className="crm-ui-card" aria-label={t('crmToday.mix.total', { count: total })}>
      <div className="crm-today-mix__top">
        <span className="crm-today-mix__total">{t('crmToday.mix.total', { count: total })}</span>
        <span className="crm-today-mix__outside">
          {t('crmToday.mix.outside', { week: groups.upcoming.length, keep: groups.drifting.length })}
        </span>
      </div>
      <div
        className="crm-today-mix__bar"
        role="img"
        aria-label={t('crmToday.mix.aria', { late: late.length, today: today.length, analyses: analysesTotal })}
      >
        {late.length > 0 && <span data-tone="red" style={{ width: share(late.length) }} />}
        {today.length > 0 && <span data-tone="blue" style={{ width: share(today.length) }} />}
        {analysesTotal > 0 && <span data-tone="grey" style={{ width: share(analysesTotal) }} />}
      </div>
      <ul className="crm-today-mix__legend" aria-hidden="true">
        <li>
          <span className="crm-ui-dot" data-tone="red" />
          {t('crmToday.mix.late', { count: late.length })}
        </li>
        <li>
          <span className="crm-ui-dot" data-tone="blue" />
          {t('crmToday.mix.today', { count: today.length })}
        </li>
        {canManage && (
          <li>
            <span className="crm-ui-dot" data-tone="grey" />
            {t('crmToday.mix.analyses', { count: analysesTotal })}
          </li>
        )}
      </ul>
    </section>
  )

  const nothing = total === 0 && holds.length === 0
  const main = (
    <div className="crm-today-stack">
      {nothing ? (
        <section className="crm-ui-card">
          <CrmEmpty
            icon={<Inbox />}
            title={t('crm.worklist.emptyTitle')}
            action={filtered ? clearFilters : emptyAction}
          >
            {filtered ? t('crmToday.empty.filtered') : t('crm.worklist.emptyHint')}
          </CrmEmpty>
        </section>
      ) : (
        <>
          <WorklistSection
            id="crm-today-late"
            group="overdue"
            title={t('crmToday.section.late')}
            tone="red"
            leads={late}
            empty={<p className="crm-today-empty-inline">{t('crmToday.empty.late')}</p>}
            {...rowProps}
            {...handlers}
          />
          {analysesTotal > 0 && (
            <AnalysesSection
              analyses={analyses}
              total={analysesTotal}
              currentUserId={currentUserId}
              analysisHref={analysisHref}
            />
          )}
          <WorklistSection
            id="crm-today-day"
            group="today"
            title={t('crmToday.section.day')}
            tone="blue"
            leads={today}
            marker={nowLine}
            empty={<p className="crm-today-empty-inline">{t('crmToday.empty.day')}</p>}
            {...rowProps}
            {...handlers}
          />
        </>
      )}
      {pendingError}
    </div>
  )

  return (
    <div className="crm-today-stack" ref={containerRef}>
      <p className="crm-ui-sr-only" role="status" aria-live="polite">
        {announcement || extraAnnouncement}
      </p>
      <div ref={fallbackRef} tabIndex={-1} className="crm-today-focus-target">
        {banner}
      </div>
      {!nothing && mix}
      {holds.length > 0 ? (
        <CrmWithPanel
          panel={
            <CrmSidePanel label={t('crmToday.section.aside')}>
              <HoldsCard
                holds={holds}
                total={pending?.holdsTotal ?? holds.length}
                leadHref={leadHref}
                onDecided={(hold) => {
                  if (holds.length <= 1) fallbackRef.current?.focus()
                  onHoldDecided(hold)
                }}
              />
            </CrmSidePanel>
          }
        >
          {main}
        </CrmWithPanel>
      ) : (
        main
      )}
    </div>
  )
}
