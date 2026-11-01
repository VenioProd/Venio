import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { formatDate } from '../../../i18n/format'
import {
  CAL_KINDS,
  CAL_TONE,
  addDays,
  hm,
  hourRange,
  isoDay,
  layoutTimed,
  minutesOf,
  monthCells,
  parseDay,
  sortDay,
  startOfMonth,
  startOfWeek,
  weekDays,
  type CalEvent,
  type CalKind,
  type CalView,
} from './calendar'
import { slotDuration } from './timeText'

const HOUR_PX = 30

export interface CalendarState {
  view: CalView
  anchor: Date
  selected: Date
  miniMonth: Date
  off: ReadonlySet<CalKind>
  setView: (v: CalView) => void
  pick: (d: Date, view?: CalView) => void
  nav: (step: -1 | 0 | 1) => void
  shiftMini: (step: -1 | 1) => void
  toggleKind: (k: CalKind) => void
}

export function useCalendarState(): CalendarState {
  const today = useMemo(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  }, [])
  const [view, setViewState] = useState<CalView>('week')
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [miniMonth, setMiniMonth] = useState(startOfMonth(today))
  const [off, setOff] = useState<Set<CalKind>>(new Set())

  const pick = (d: Date, v?: CalView) => {
    setSelected(d)
    setAnchor(d)
    setMiniMonth(startOfMonth(d))
    if (v) setViewState(v)
  }
  return {
    view,
    anchor,
    selected,
    miniMonth,
    off,
    setView: (v) => {
      setViewState(v)
      setAnchor(selected)
    },
    pick,
    nav: (step) => {
      if (step === 0) return pick(today)
      const next =
        view === 'month'
          ? new Date(anchor.getFullYear(), anchor.getMonth() + step, 1)
          : addDays(anchor, step * (view === 'day' ? 1 : 7))
      pick(next)
    },
    shiftMini: (step) => setMiniMonth((m) => new Date(m.getFullYear(), m.getMonth() + step, 1)),
    toggleKind: (k) =>
      setOff((prev) => {
        const next = new Set(prev)
        if (next.has(k)) next.delete(k)
        else next.add(k)
        return next
      }),
  }
}

// ─── Détail (popover desktop, feuille basse en tactile) ─────────────────────

interface Opened {
  event: CalEvent
  anchor: HTMLElement
}

function useEventTitle() {
  const { t } = useI18n()
  return (e: CalEvent) =>
    e.titleKey === 'projectStart'
      ? t('home.cal.projectStart', { name: e.title })
      : e.titleKey === 'projectEnd'
        ? t('home.cal.projectEnd', { name: e.title })
        : e.title
}

function EventDetail({
  opened,
  sheet,
  onClose,
}: {
  opened: Opened
  sheet: boolean
  onClose: (refocus: boolean) => void
}) {
  const { t } = useI18n()
  const titleOf = useEventTitle()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  const e = opened.event

  useLayoutEffect(() => {
    if (sheet) {
      setPos({})
      return
    }
    const el = ref.current
    if (!el) return
    const r = opened.anchor.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    let x = r.right + 8
    if (x + w > window.innerWidth - 12) x = Math.max(12, r.left - w - 8)
    let y = r.top
    if (y + h > window.innerHeight - 12) y = Math.max(12, window.innerHeight - h - 12)
    setPos({ left: x, top: y })
  }, [opened, sheet])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose(true)
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node) && !opened.anchor.contains(ev.target as Node))
        onClose(false)
    }
    const onResize = () => onClose(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onResize)
    }
  }, [opened, onClose])

  const day = parseDay(e.date)
  const when =
    e.start !== undefined
      ? t('home.cal.detail.timed', {
          day: formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' }),
          from: hm(e.start),
          to: hm(e.end ?? e.start),
          duration: slotDuration(t, (e.end ?? e.start) - e.start),
        })
      : t('home.cal.detail.allDay', { day: formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' }) })

  return (
    <>
      {sheet && <div className="hc-scrim" onClick={() => onClose(false)} aria-hidden="true" />}
      <div
        ref={ref}
        className={`hc-pop${sheet ? ' is-sheet' : ''} ck-${CAL_TONE[e.kind]}`}
        role="dialog"
        aria-modal={sheet}
        aria-labelledby="hc-pop-title"
        style={pos}
      >
        <div className="hc-pop-k">
          <span className={`hm-chip c-${CAL_TONE[e.kind]}`}>{t(`home.cal.kind.${e.kind}`)}</span>
          <button
            ref={closeRef}
            type="button"
            className="hm-icon-btn"
            aria-label={t('home.close')}
            onClick={() => onClose(true)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <h3 id="hc-pop-title">{titleOf(e)}</h3>
        <dl>
          <dt>{t('home.cal.detail.when')}</dt>
          <dd>
            {when}
            {e.late && <span className="is-late"> · {t('home.cal.detail.late')}</span>}
          </dd>
          {e.location && (
            <>
              <dt>{t('home.cal.detail.where')}</dt>
              <dd>{e.location}</dd>
            </>
          )}
          {e.who && (
            <>
              <dt>{t('home.cal.detail.who')}</dt>
              <dd>{e.who}</dd>
            </>
          )}
          <dt>{t('home.cal.detail.source')}</dt>
          <dd>{t(`home.cal.source.${e.kind}`)}</dd>
        </dl>
        <div className="hc-pop-a">
          <button type="button" className="hm-btn hm-btn--ghost" onClick={() => onClose(true)}>
            {t('home.close')}
          </button>
          {e.link && (
            <Link className="hm-btn hm-btn--primary" to={e.link}>
              {t('home.cal.detail.open')}
            </Link>
          )}
        </div>
      </div>
    </>
  )
}

export function useEventDetail(sheet: boolean) {
  const [opened, setOpened] = useState<Opened | null>(null)
  const openedRef = useRef<Opened | null>(null)
  useEffect(() => {
    openedRef.current = opened
  }, [opened])
  const close = useCallback((refocus: boolean) => {
    const cur = openedRef.current
    setOpened(null)
    if (refocus && cur && document.body.contains(cur.anchor)) cur.anchor.focus()
  }, [])
  const open = useCallback((event: CalEvent, anchor: HTMLElement) => setOpened({ event, anchor }), [])
  return {
    open,
    node: opened ? <EventDetail opened={opened} sheet={sheet} onClose={close} /> : null,
  }
}

type OpenFn = (event: CalEvent, anchor: HTMLElement) => void

function AllDayItem({ e, onOpen }: { e: CalEvent; onOpen: OpenFn }) {
  const titleOf = useEventTitle()
  const title = titleOf(e)
  return (
    <button
      type="button"
      className={`hc-ad ck-${CAL_TONE[e.kind]}${e.late ? ' is-late' : ''}`}
      title={title}
      onClick={(ev) => onOpen(e, ev.currentTarget)}
    >
      <span>{title}</span>
    </button>
  )
}

// ─── Grille semaine / jour ──────────────────────────────────────────────────

function TimeGrid({
  days,
  events,
  state,
  onOpen,
  now,
}: {
  days: Date[]
  events: CalEvent[]
  state: CalendarState
  onOpen: OpenFn
  now: Date
}) {
  const { t } = useI18n()
  const titleOf = useEventTitle()
  const today = isoDay(now)
  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [events])
  const visible = days.flatMap((d) => byDay.get(isoDay(d)) ?? [])
  const { from, to } = hourRange(visible)
  const nowMin = minutesOf(now)
  const maxAllDay = days.length === 1 ? 9 : 2

  return (
    <div className="hc-wk" style={{ '--n': days.length, '--hh': `${HOUR_PX}px`, '--hrs': to - from } as CSSProperties}>
      <div className="hc-wk-r hc-wk-hd">
        <div />
        {days.map((d) => {
          const k = isoDay(d)
          return (
            <button
              key={k}
              type="button"
              className={`hc-dh${k === today ? ' is-today' : ''}${k === isoDay(state.selected) ? ' is-sel' : ''}`}
              onClick={() => state.pick(d)}
              aria-label={formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
              aria-current={k === today ? 'date' : undefined}
            >
              <small>{formatDate(d, { weekday: 'short' })}</small>
              <b>{d.getDate()}</b>
            </button>
          )
        })}
      </div>
      <div className="hc-wk-r hc-wk-ad">
        <div className="hc-g">{t('home.cal.allDay')}</div>
        {days.map((d) => {
          const list = sortDay(byDay.get(isoDay(d)) ?? []).allDay
          return (
            <div key={isoDay(d)} className="hc-cell">
              {list.slice(0, maxAllDay).map((e) => (
                <AllDayItem key={e.id} e={e} onOpen={onOpen} />
              ))}
              {list.length > maxAllDay && (
                <button type="button" className="hc-more" onClick={() => state.pick(d, 'day')}>
                  {t('home.cal.more', { count: list.length - maxAllDay })}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className="hc-wk-r hc-wk-b">
        <div className="hc-gut" aria-hidden="true">
          {Array.from({ length: to - from - 1 }, (_, i) => (
            <span key={i} style={{ top: (i + 1) * HOUR_PX }}>
              {hm((from + i + 1) * 60)}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const k = isoDay(d)
          const timed = sortDay(byDay.get(k) ?? []).timed
          const lanes = layoutTimed(timed)
          return (
            <div key={k} className={`hc-col${k === today ? ' is-today' : ''}${k < today ? ' is-past' : ''}`}>
              {timed.map((e) => {
                const s = Math.max(e.start!, from * 60)
                const en = Math.min(e.end ?? e.start! + 30, to * 60)
                const top = ((s - from * 60) / 60) * HOUR_PX
                const height = Math.max(20, ((en - s) / 60) * HOUR_PX - 2)
                const p = lanes.get(e.id) ?? { lane: 0, lanes: 1 }
                const w = 100 / p.lanes
                const past = k < today || (k === today && (e.end ?? 0) <= nowMin)
                return (
                  <button
                    key={e.id}
                    type="button"
                    className={`hc-eb ck-${CAL_TONE[e.kind]}${past ? ' is-past' : ''}${height < 34 ? ' is-sm' : ''}`}
                    style={{ top, height, left: `calc(${p.lane * w}% + 1px)`, width: `calc(${w}% - 3px)` }}
                    onClick={(ev) => onOpen(e, ev.currentTarget)}
                  >
                    <b>{titleOf(e)}</b>
                    <span>
                      {hm(e.start!)} · {slotDuration(t, (e.end ?? e.start!) - e.start!)}
                    </span>
                  </button>
                )
              })}
              {k === today && nowMin >= from * 60 && nowMin <= to * 60 && (
                <div className="hc-now" style={{ top: ((nowMin - from * 60) / 60) * HOUR_PX }} aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Mois ───────────────────────────────────────────────────────────────────

function MonthGrid({
  events,
  state,
  onOpen,
  now,
}: {
  events: CalEvent[]
  state: CalendarState
  onOpen: OpenFn
  now: Date
}) {
  const { t } = useI18n()
  const titleOf = useEventTitle()
  const today = isoDay(now)
  const cells = monthCells(state.anchor)
  const month = state.anchor.getMonth()
  return (
    <div className="hc-mo">
      {weekDays(now).map((d) => (
        <div key={d.getDay()} className="hc-dw" aria-hidden="true">
          {formatDate(d, { weekday: 'short' })}
        </div>
      ))}
      {cells.map((d) => {
        const k = isoDay(d)
        const list = events.filter((e) => e.date === k).sort((a, b) => (a.start ?? -1) - (b.start ?? -1))
        return (
          <div
            key={k}
            className={`hc-mc${d.getMonth() !== month ? ' is-out' : ''}${k === today ? ' is-today' : ''}${k === isoDay(state.selected) ? ' is-sel' : ''}`}
          >
            <button
              type="button"
              className="hc-mc-n"
              onClick={() => state.pick(d, 'day')}
              aria-label={formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
            >
              {d.getDate()}
            </button>
            {list.slice(0, 3).map((e) => (
              <button
                key={e.id}
                type="button"
                className={`hc-mchip ck-${CAL_TONE[e.kind]}${e.start === undefined ? ' is-ad' : ''}`}
                onClick={(ev) => onOpen(e, ev.currentTarget)}
              >
                <i aria-hidden="true" />
                <span>{titleOf(e)}</span>
                {e.start !== undefined && <em>{hm(e.start)}</em>}
              </button>
            ))}
            {list.length > 3 && (
              <button type="button" className="hc-more" onClick={() => state.pick(d, 'day')}>
                {t('home.cal.more', { count: list.length - 3 })}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Mini-mois et agenda du jour ────────────────────────────────────────────

export function MiniMonth({ events, state, now }: { events: CalEvent[]; state: CalendarState; now: Date }) {
  const { t } = useI18n()
  const today = isoDay(now)
  const month = state.miniMonth
  const week = isoDay(startOfWeek(state.anchor))
  const kindsByDay = useMemo(() => {
    const m = new Map<string, Set<CalKind>>()
    for (const e of events) m.set(e.date, (m.get(e.date) ?? new Set()).add(e.kind))
    return m
  }, [events])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) m.set(e.date, (m.get(e.date) ?? 0) + 1)
    return m
  }, [events])

  return (
    <div className="hc-mini">
      <div className="hc-mini-h">
        <b>{formatDate(month, { month: 'long', year: 'numeric' })}</b>
        <div className="hc-nav">
          <button
            type="button"
            className="hm-icon-btn"
            onClick={() => state.shiftMini(-1)}
            aria-label={t('home.cal.prevMonth')}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="hm-icon-btn"
            onClick={() => state.shiftMini(1)}
            aria-label={t('home.cal.nextMonth')}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="hc-mini-g">
        {weekDays(now).map((d) => (
          <span key={d.getDay()} className="hc-mini-w" aria-hidden="true">
            {formatDate(d, { weekday: 'narrow' })}
          </span>
        ))}
        {monthCells(month).map((d) => {
          const k = isoDay(d)
          const kinds = [...(kindsByDay.get(k) ?? [])]
          const n = counts.get(k) ?? 0
          const cls = [
            d.getMonth() !== month.getMonth() && 'is-out',
            k === today && 'is-today',
            k === isoDay(state.selected) && 'is-sel',
            state.view !== 'day' && isoDay(startOfWeek(d)) === week && 'in-week',
          ]
            .filter(Boolean)
            .join(' ')
          const label = formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })
          return (
            <button
              key={k}
              type="button"
              className={cls}
              onClick={() => state.pick(d)}
              aria-label={n ? t('home.cal.dayWithItems', { day: label, count: n }) : label}
              aria-current={k === today ? 'date' : undefined}
              aria-pressed={k === isoDay(state.selected)}
            >
              {d.getDate()}
              {kinds.length > 0 && (
                <u aria-hidden="true">
                  {kinds.slice(0, 3).map((kind) => (
                    <s key={kind} className={`ck-${CAL_TONE[kind]}`} />
                  ))}
                </u>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DayAgenda({ events, day, onOpen, now }: { events: CalEvent[]; day: Date; onOpen: OpenFn; now: Date }) {
  const { t } = useI18n()
  const titleOf = useEventTitle()
  const k = isoDay(day)
  const today = isoDay(now)
  const list = events.filter((e) => e.date === k)
  const { allDay, timed } = sortDay(list)
  const nowMin = minutesOf(now)
  const dayLabel = formatDate(day, { weekday: 'long', day: 'numeric', month: 'long' })
  let nowShown = k !== today

  const rows: JSX.Element[] = []
  for (const e of timed) {
    if (!nowShown && e.start! > nowMin) {
      nowShown = true
      rows.push(<NowRow key="now" nowMin={nowMin} />)
    }
    const past = k < today || (k === today && (e.end ?? 0) <= nowMin)
    rows.push(
      <li key={e.id} className={`hc-ev ck-${CAL_TONE[e.kind]}${past ? ' is-past' : ''}`}>
        <time>{hm(e.start!)}</time>
        <span className="hc-pin" aria-hidden="true" />
        <button type="button" className="hc-ev-t" onClick={(ev) => onOpen(e, ev.currentTarget)}>
          <b>{titleOf(e)}</b>
          <span>
            {[t(`home.cal.kind.${e.kind}`), slotDuration(t, (e.end ?? e.start!) - e.start!), e.location]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </button>
      </li>,
    )
  }
  if (!nowShown && timed.length) rows.push(<NowRow key="now" nowMin={nowMin} />)

  return (
    <div className="hc-day">
      <div className="hc-dayh">
        <b>{k === today ? t('home.cal.todayPrefix', { day: dayLabel }) : dayLabel}</b>
        <small>{t('home.cal.items', { count: list.length })}</small>
      </div>
      {allDay.length > 0 && (
        <div className="hc-adl">
          {allDay.map((e) => (
            <AllDayItem key={e.id} e={e} onOpen={onOpen} />
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <p className="hc-empty">{t('home.cal.nothing')}</p>
      ) : (
        timed.length > 0 && <ol className="hc-tl">{rows}</ol>
      )}
    </div>
  )
}

function NowRow({ nowMin }: { nowMin: number }) {
  const { t } = useI18n()
  return (
    <li className="hc-ev is-now" aria-label={t('home.cal.nowAria', { time: hm(nowMin) })}>
      <time>{hm(nowMin)}</time>
      <span className="hc-pin" aria-hidden="true" />
      <span className="hc-ev-line" aria-hidden="true" />
    </li>
  )
}

/** Bande de 7 jours (tablette portrait, mobile). */
function DayStrip({ events, state, now }: { events: CalEvent[]; state: CalendarState; now: Date }) {
  const today = isoDay(now)
  const kindsByDay = useMemo(() => {
    const m = new Map<string, Set<CalKind>>()
    for (const e of events) m.set(e.date, (m.get(e.date) ?? new Set()).add(e.kind))
    return m
  }, [events])
  return (
    <div className="hc-strip">
      {weekDays(state.anchor).map((d) => {
        const k = isoDay(d)
        const kinds = [...(kindsByDay.get(k) ?? [])]
        return (
          <button
            key={k}
            type="button"
            className={`${k === today ? 'is-today ' : ''}${k === isoDay(state.selected) ? 'is-sel' : ''}`}
            onClick={() => state.pick(d)}
            aria-pressed={k === isoDay(state.selected)}
            aria-current={k === today ? 'date' : undefined}
            aria-label={formatDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}
          >
            <small>{formatDate(d, { weekday: 'short' })}</small>
            <b>{d.getDate()}</b>
            <u aria-hidden="true">
              {kinds.slice(0, 3).map((kind) => (
                <s key={kind} className={`ck-${CAL_TONE[kind]}`} />
              ))}
            </u>
          </button>
        )
      })}
    </div>
  )
}

// ─── Carte principale ───────────────────────────────────────────────────────

export interface HomeCalendarProps {
  state: CalendarState
  events: CalEvent[]
  loading: boolean
  error: boolean
  /** Grille horaire (desktop, tablette paysage) ; sinon bande de jours + agenda. */
  wide: boolean
  onOpen: OpenFn
}

export default function HomeCalendar({ state, events, loading, error, wide, onOpen }: HomeCalendarProps) {
  const { t } = useI18n()
  const now = new Date()
  const shown = events.filter((e) => !state.off.has(e.kind))
  const days = state.view === 'day' ? [state.anchor] : weekDays(state.anchor)

  const title = (() => {
    if (state.view === 'month') return formatDate(state.anchor, { month: 'long', year: 'numeric' })
    if (state.view === 'day')
      return formatDate(state.anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const start = startOfWeek(state.anchor)
    const end = addDays(start, 6)
    return t('home.cal.weekRange', {
      from: formatDate(start, { day: 'numeric', month: 'short' }),
      to: formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' }),
    })
  })()

  return (
    <section className="hm-card hc" aria-labelledby="hc-title">
      <div className="hm-card-h hc-head">
        <h2 id="hc-title">{t('home.cal.title')}</h2>
        <div className="hc-ctl">
          <div className="hm-seg" role="group" aria-label={t('home.cal.viewAria')}>
            {(['day', 'week', 'month'] as CalView[]).map((v) => (
              <button key={v} type="button" aria-pressed={state.view === v} onClick={() => state.setView(v)}>
                {t(`home.cal.view.${v}`)}
              </button>
            ))}
          </div>
          <div className="hc-nav">
            <button type="button" className="hm-icon-btn" onClick={() => state.nav(-1)} aria-label={t('home.cal.prev')}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="hc-today" onClick={() => state.nav(0)}>
              {t('home.cal.today')}
            </button>
            <button type="button" className="hm-icon-btn" onClick={() => state.nav(1)} aria-label={t('home.cal.next')}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      <div className="hc-title" aria-live="polite">
        {title}
        {loading && <small role="status">{t('home.loading')}</small>}
        {error && !loading && <small role="alert">{t('home.cal.error')}</small>}
      </div>

      <div className="hc-body">
        {wide ? (
          state.view === 'month' ? (
            <MonthGrid events={shown} state={state} onOpen={onOpen} now={now} />
          ) : (
            <TimeGrid days={days} events={shown} state={state} onOpen={onOpen} now={now} />
          )
        ) : (
          <>
            {state.view === 'month' ? (
              <MiniMonth events={shown} state={state} now={now} />
            ) : (
              <DayStrip events={shown} state={state} now={now} />
            )}
            <DayAgenda events={shown} day={state.selected} onOpen={onOpen} now={now} />
          </>
        )}
      </div>

      <div className="hc-foot">
        <div className="hc-kinds" role="group" aria-label={t('home.cal.kindsAria')}>
          {CAL_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`hc-kd ck-${CAL_TONE[k]}`}
              aria-pressed={!state.off.has(k)}
              onClick={() => state.toggleKind(k)}
            >
              <i aria-hidden="true" />
              {t(`home.cal.kind.${k}`)}
            </button>
          ))}
        </div>
        <small>{t('home.cal.footnote')}</small>
      </div>
    </section>
  )
}

/** Colonne latérale (desktop) : mini-mois + agenda du jour sélectionné. */
export function AgendaCard({ state, events, onOpen }: { state: CalendarState; events: CalEvent[]; onOpen: OpenFn }) {
  const { t } = useI18n()
  const now = new Date()
  const shown = events.filter((e) => !state.off.has(e.kind))
  return (
    <section className="hm-card" aria-labelledby="ha-title">
      <div className="hm-card-h">
        <h2 id="ha-title">{t('home.agenda.title')}</h2>
        <Link className="hm-link" to="/admin/calendrier">
          {t('home.agenda.calendarLink')} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <MiniMonth events={shown} state={state} now={now} />
      <DayAgenda events={shown} day={state.selected} onOpen={onOpen} now={now} />
    </section>
  )
}
