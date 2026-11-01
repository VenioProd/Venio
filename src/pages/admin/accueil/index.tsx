import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import { PERMISSIONS, hasPermission } from '../../../lib/permissions'
import { decide, patchQueueTask, type DecisionVerdict, type QueueItem } from '../../../services/home'
import ActionQueue from './ActionQueue'
import HomeCalendar, { AgendaCard, useCalendarState, useEventDetail } from './HomeCalendar'
import Pulse from './Pulse'
import { Pinned, SinceLastVisit, WatchProjects } from './Side'
import {
  useCalendarEvents,
  useDashboard,
  useHomeQueue,
  useMediaQuery,
  useOverview,
  usePortfolio,
  useTicketStats,
} from './hooks'
import './Accueil.css'

/** Délai pendant lequel une décision reste annulable avant l'envoi. */
export const UNDO_DELAY_MS = 5000
const NOTICE_MS = 4000

interface PendingDecision {
  item: QueueItem
  verdict: DecisionVerdict
  timer: number
}

interface Notice {
  text: string
  tone: 'ok' | 'error'
}

function tomorrowNoon(): string {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 12).toISOString()
}

export default function Accueil() {
  const { user } = useAuth()
  const { t } = useI18n()
  // Tablette paysage (1180) et desktop : deux colonnes et grille horaire.
  const wide = useMediaQuery('(min-width: 1150px)')

  const queue = useHomeQueue()
  const overview = useOverview()
  const canProjects = hasPermission(user, PERMISSIONS.VIEW_PROJECTS)
  const canTickets = hasPermission(user, PERMISSIONS.VIEW_TICKETS)
  const canCrm = hasPermission(user, PERMISSIONS.VIEW_CRM)
  const portfolio = usePortfolio(canProjects)
  const dashboard = useDashboard()
  const ticketStats = useTicketStats(canTickets)

  const cal = useCalendarState()
  const calendar = useCalendarEvents(cal.anchor, user?.role === 'SUPER_ADMIN')
  const detail = useEventDetail(!wide)

  // ─── Actions de la file ───────────────────────────────────────────────────
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<PendingDecision | null>(null)
  const pendingRef = useRef<PendingDecision | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const hide = useCallback((id: string) => setHidden((s) => new Set(s).add(id)), [])
  const unhide = useCallback(
    (id: string) =>
      setHidden((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      }),
    [],
  )

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const commit = useCallback(
    async (p: PendingDecision) => {
      try {
        await decide(p.item.sourceId, p.verdict)
      } catch {
        unhide(p.item.id)
        setNotice({ text: t('home.notice.failed', { title: p.item.title }), tone: 'error' })
      }
    },
    [t, unhide],
  )

  const onDecide = (item: QueueItem, verdict: DecisionVerdict) => {
    const current = pendingRef.current
    if (current) {
      window.clearTimeout(current.timer)
      void commit(current)
    }
    hide(item.id)
    setNotice(null)
    const next: PendingDecision = { item, verdict, timer: 0 }
    next.timer = window.setTimeout(() => {
      if (pendingRef.current === next) {
        pendingRef.current = null
        setPending(null)
      }
      void commit(next)
    }, UNDO_DELAY_MS)
    pendingRef.current = next
    setPending(next)
  }

  const undo = () => {
    const current = pendingRef.current
    if (!current) return
    window.clearTimeout(current.timer)
    pendingRef.current = null
    setPending(null)
    unhide(current.item.id)
  }

  // Quitter l'accueil n'annule pas : la décision part tout de suite.
  useEffect(
    () => () => {
      const current = pendingRef.current
      if (current) {
        window.clearTimeout(current.timer)
        decide(current.item.sourceId, current.verdict).catch(() => {})
      }
    },
    [],
  )

  const runTask = async (item: QueueItem, patch: Parameters<typeof patchQueueTask>[1], done: string) => {
    hide(item.id)
    try {
      await patchQueueTask(item, patch)
      setNotice({ text: done, tone: 'ok' })
    } catch {
      unhide(item.id)
      setNotice({ text: t('home.notice.failed', { title: item.title }), tone: 'error' })
    }
  }

  // ─── En-tête ──────────────────────────────────────────────────────────────
  const visible = useMemo(() => (queue.data?.items ?? []).filter((it) => !hidden.has(it.id)), [queue.data, hidden])
  const hiddenItems = (queue.data?.items ?? []).filter((it) => hidden.has(it.id))
  const total = Math.max(0, (queue.data?.counts.all ?? 0) - hiddenItems.length)
  const overdue = Math.max(0, (queue.data?.overdue ?? 0) - hiddenItems.filter((it) => it.overdue).length)
  const today = Math.max(0, (queue.data?.dueToday ?? 0) - hiddenItems.filter((it) => it.dueToday).length)
  const urgent = visible.filter((it) => it.priority === 'URGENT').length

  const hour = new Date().getHours()
  const name = user?.name?.split(' ')[0] ?? ''
  const greeting = t(hour < 12 ? 'home.header.morning' : hour < 18 ? 'home.header.afternoon' : 'home.header.evening', {
    name,
  })

  const verdictText: Record<DecisionVerdict, string> = {
    approve: t('home.undo.approve'),
    improve: t('home.undo.improve'),
    reject: t('home.undo.reject'),
  }

  return (
    <div className="home">
      <header className="hm-ph">
        <p className="hm-eyebrow">
          <i aria-hidden="true" />
          {t('home.header.eyebrow')}
        </p>
        <h1>
          <span className="hm-gt">{greeting}</span>
          {queue.data && (
            <>
              {t('home.header.separator')}
              <em>{t('home.header.waiting', { count: total })}</em>
            </>
          )}
        </h1>
        <p className="hm-sub">
          <time dateTime={new Date().toISOString().slice(0, 10)}>
            {formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </time>
          {queue.data && total > 0 && (
            <>
              {' · '}
              {t('home.header.summary', { overdue, today })}
            </>
          )}
        </p>
      </header>

      {queue.data && (
        <ul className="hm-tiles" aria-label={t('home.tiles.aria')}>
          <li className="is-rose">
            <b>{urgent}</b>
            <span>{t('home.tiles.urgent', { count: urgent })}</span>
          </li>
          <li className="is-amber">
            <b>{overdue}</b>
            <span>{t('home.tiles.overdue', { count: overdue })}</span>
          </li>
          <li className="is-sky">
            <b>{today}</b>
            <span>{t('home.tiles.today', { count: today })}</span>
          </li>
        </ul>
      )}

      <div className="hm-grid">
        <div className="hm-col">
          <ActionQueue
            data={queue.data}
            loading={queue.loading}
            error={queue.error}
            onRetry={queue.reload}
            hidden={hidden}
            onDecide={onDecide}
            onComplete={(item) =>
              runTask(item, { status: 'TERMINE' }, t('home.notice.completed', { title: item.title }))
            }
            onPostpone={(item) =>
              runTask(item, { dueDate: tomorrowNoon() }, t('home.notice.postponed', { title: item.title }))
            }
          />
          <HomeCalendar
            state={cal}
            events={calendar.events}
            loading={calendar.loading}
            error={calendar.error}
            wide={wide}
            onOpen={detail.open}
          />
          <Pulse
            loading={dashboard.loading || portfolio.loading || overview.loading}
            dashboard={dashboard.data}
            portfolio={portfolio.data}
            tickets={ticketStats.data}
            kpis={overview.data?.kpis ?? []}
            canCrm={canCrm}
          />
          <div className="hm-two">
            <SinceLastVisit overview={overview.data} loading={overview.loading} />
            {canProjects && <WatchProjects portfolio={portfolio.data} loading={portfolio.loading} />}
          </div>
        </div>
        <aside className="hm-col hm-side" aria-label={t('home.sideAria')}>
          {wide && <AgendaCard state={cal} events={calendar.events} onOpen={detail.open} />}
          <Pinned overview={overview.data} />
        </aside>
      </div>

      {detail.node}

      {(pending || notice) && (
        <div
          className={`hm-toast${notice?.tone === 'error' && !pending ? ' is-error' : ''}`}
          role={notice?.tone === 'error' && !pending ? 'alert' : 'status'}
        >
          {pending ? (
            <>
              <span>
                <b>{verdictText[pending.verdict]}</b> {pending.item.title}
              </span>
              <button type="button" className="hm-toast-undo" onClick={undo}>
                {t('home.undo.action')}
              </button>
              <i
                key={pending.item.id}
                className="hm-toast-bar"
                style={{ animationDuration: `${UNDO_DELAY_MS}ms` }}
                aria-hidden="true"
              />
            </>
          ) : (
            notice && <span>{notice.text}</span>
          )}
        </div>
      )}
    </div>
  )
}
