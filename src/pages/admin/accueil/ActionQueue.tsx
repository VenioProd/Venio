import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatMoney } from '../../../i18n/format'
import type { DecisionVerdict, HomeQueue, QueueItem, QueueKind } from '../../../services/home'
import { ago, dayDiff, duration, shortDay, timeOf } from './timeText'

const KIND_TONE: Record<QueueKind, string> = {
  decision: 'amber',
  task: 'teal',
  ticket: 'rose',
  request: 'sky',
  crm: 'amber',
  dev: 'vio',
}

type Filter = 'all' | QueueKind

export interface ActionQueueProps {
  data: HomeQueue | null
  loading: boolean
  error: boolean
  onRetry: () => void
  /** Éléments masqués (action en cours ou en attente d'annulation). */
  hidden: ReadonlySet<string>
  onDecide: (item: QueueItem, verdict: DecisionVerdict) => void
  onComplete: (item: QueueItem) => void
  onPostpone: (item: QueueItem) => void
}

function When({ item, now }: { item: QueueItem; now: Date }) {
  const { t } = useI18n()
  let main = ''
  let small = ''
  let late = item.overdue

  if (item.kind === 'ticket') {
    if (item.slaDueAt) {
      const left = new Date(item.slaDueAt).getTime() - now.getTime()
      main = left <= 0 ? t('home.queue.when.slaBreached') : t('home.queue.when.sla')
      small =
        left <= 0
          ? t('home.queue.when.since', { d: duration(t, left) })
          : t('home.queue.when.in', { d: duration(t, left) })
    } else {
      main = t(item.status === 'EN_COURS' ? 'home.queue.when.inProgress' : 'home.queue.when.open')
      small = ago(t, item.createdAt, now)
      late = false
    }
  } else if (item.dueAt) {
    const due = new Date(item.dueAt)
    const diff = dayDiff(due, now)
    if (item.overdue) {
      main = t(
        item.kind === 'decision'
          ? 'home.queue.when.expired'
          : item.kind === 'crm'
            ? 'home.queue.when.followUpDue'
            : 'home.queue.when.late',
      )
      small =
        diff === 0
          ? timeOf(due)
          : diff === -1
            ? t('home.queue.when.sinceYesterday')
            : t('home.queue.when.sinceDays', { count: -diff })
    } else {
      main = shortDay(t, due, now)
      small = item.kind === 'crm' && (due.getHours() || due.getMinutes()) ? timeOf(due) : ''
    }
  } else if (item.kind === 'dev') {
    main = t('home.queue.when.inReview')
    small = ago(t, typeof item.meta.waitingSince === 'string' ? item.meta.waitingSince : item.createdAt, now)
  } else {
    main = t('home.queue.when.noDue')
    small = ago(t, item.createdAt, now)
  }

  return (
    <div className={`hq-when${late ? ' is-late' : ''}`}>
      {main}
      {small && <small>{small}</small>}
    </div>
  )
}

function Context({ item }: { item: QueueItem }) {
  const { t } = useI18n()
  const parts: string[] = []
  if (item.subtitle) parts.push(item.subtitle)
  if (item.kind === 'request' && typeof item.meta.project === 'string') parts.push(item.meta.project)
  if (item.kind === 'request')
    parts.push(t(item.status === 'A_CHIFFRER' ? 'home.queue.request.toQuote' : 'home.queue.request.toQualify'))
  if (item.kind === 'decision' && typeof item.meta.category === 'string')
    parts.push(t(`home.queue.category.${item.meta.category}` as MessageKey))
  if (item.kind === 'crm' && typeof item.meta.budget === 'number')
    parts.push(formatMoney(item.meta.budget, 'EUR', { maximumFractionDigits: 0 }))
  if (item.kind === 'dev' && typeof item.meta.project === 'string') parts.push(item.meta.project)
  if (item.kind === 'task')
    parts.push(t(item.meta.source === 'PERSONAL' ? 'home.queue.task.personal' : 'home.queue.task.project'))
  if (item.priority === 'URGENT' || item.priority === 'HIGH') parts.push(t(`home.queue.priority.${item.priority}`))
  return <span>{parts.join(' · ')}</span>
}

function Row({ item, now, first, props }: { item: QueueItem; now: Date; first: boolean; props: ActionQueueProps }) {
  const { t } = useI18n()
  const label =
    item.kind === 'ticket' && item.priority === 'URGENT'
      ? t('home.queue.kindUrgentTicket')
      : t(`home.queue.kind.${item.kind}`)
  const identifier = item.kind === 'dev' && typeof item.meta.identifier === 'string' ? `${item.meta.identifier} · ` : ''
  const title = `${identifier}${item.title}`
  const can = (a: string) => item.actions.includes(a as never)

  return (
    <li className={`hq-row${first ? ' is-top' : ''}`} data-kind={item.kind}>
      {first && <span className="hq-top-label">{t('home.queue.topNow')}</span>}
      <span className={`hm-chip c-${KIND_TONE[item.kind]}`}>{label}</span>
      <div className="hq-title">
        {item.link ? (
          <Link to={item.link}>
            <b>{title}</b>
          </Link>
        ) : (
          <b>{title}</b>
        )}
        <Context item={item} />
      </div>
      <When item={item} now={now} />
      <div className="hq-actions">
        {can('approve') && (
          <>
            <button type="button" className="hm-btn hm-btn--ghost" onClick={() => props.onDecide(item, 'reject')}>
              {t('home.queue.action.reject')}
            </button>
            <button type="button" className="hm-btn hm-btn--ghost" onClick={() => props.onDecide(item, 'improve')}>
              {t('home.queue.action.improve')}
            </button>
            <button type="button" className="hm-btn hm-btn--primary" onClick={() => props.onDecide(item, 'approve')}>
              {t('home.queue.action.approve')}
            </button>
          </>
        )}
        {can('complete') && (
          <>
            <button
              type="button"
              className="hm-btn hm-btn--ghost"
              aria-label={t('home.queue.action.postponeAria', { title: item.title })}
              title={t('home.queue.action.postponeHint')}
              onClick={() => props.onPostpone(item)}
            >
              {t('home.queue.action.postpone')}
            </button>
            <button
              type="button"
              className="hm-btn hm-btn--primary"
              aria-label={t('home.queue.action.completeAria', { title: item.title })}
              onClick={() => props.onComplete(item)}
            >
              {t('home.queue.action.complete')}
            </button>
          </>
        )}
        {!can('approve') && !can('complete') && item.link && (
          <Link
            className="hm-btn hm-btn--primary"
            to={item.link}
            aria-label={t('home.queue.action.openAria', { title: item.title })}
          >
            {t('home.queue.action.open')}
          </Link>
        )}
      </div>
    </li>
  )
}

export default function ActionQueue(props: ActionQueueProps) {
  const { t } = useI18n()
  const { data, loading, error, onRetry, hidden } = props
  const [filter, setFilter] = useState<Filter>('all')
  const now = new Date()

  const visible = useMemo(() => (data?.items ?? []).filter((it) => !hidden.has(it.id)), [data, hidden])
  const countOf = (k: Filter) => (k === 'all' ? visible.length : visible.filter((it) => it.kind === k).length)
  const shown = filter === 'all' ? visible : visible.filter((it) => it.kind === filter)

  return (
    <section className="hm-card hq" aria-labelledby="hq-title">
      <div className="hm-card-h">
        <h2 id="hq-title">
          {t('home.queue.title')}
          {data && <span className="hm-count is-hot">{visible.length}</span>}
        </h2>
        <span className="hm-hint">{t('home.queue.sorted')}</span>
      </div>

      {loading && !data ? (
        <p className="hm-empty" role="status">
          {t('home.loading')}
        </p>
      ) : error && !data ? (
        <p className="hm-empty" role="alert">
          {t('home.queue.error')}{' '}
          <button type="button" className="hm-link" onClick={onRetry}>
            {t('home.retry')}
          </button>
        </p>
      ) : data ? (
        <>
          <div className="hq-filters" role="group" aria-label={t('home.queue.filterAria')}>
            {(['all', ...data.kinds] as Filter[]).map((k) => (
              <button
                key={k}
                type="button"
                className="hq-filter"
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
              >
                {k === 'all' ? t('home.queue.filter.all') : t(`home.queue.filter.${k}`)}
                <span className="hm-count">{countOf(k)}</span>
              </button>
            ))}
          </div>
          {shown.length > 0 ? (
            <ul className="hq-list">
              {shown.map((item, i) => (
                <Row key={item.id} item={item} now={now} first={i === 0 && filter === 'all'} props={props} />
              ))}
            </ul>
          ) : (
            <p className="hm-empty">{visible.length === 0 ? t('home.queue.allClear') : t('home.queue.emptyFilter')}</p>
          )}
          <div className="hq-foot">
            <span>{t('home.queue.footer')}</span>
            {data.kinds.includes('decision') && (
              <Link className="hm-link" to="/admin/decisions">
                {t('home.queue.allDecisions')} <ChevronRight size={14} aria-hidden="true" />
              </Link>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}
