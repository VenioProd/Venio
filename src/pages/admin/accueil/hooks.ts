import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { getHomeQueue, type HomeQueue } from '../../../services/home'
import { getOverview } from '../../../services/workspace'
import type { WorkspaceOverview } from '../../../types/workspace.types'
import type { PortfolioOverview } from '../projects-portfolio/portfolio'
import {
  fetchWindow,
  fromCalendarApi,
  fromIcs,
  fromSessions,
  isoDay,
  type ApiCalendarEvent,
  type ApiIcsEvent,
  type ApiSession,
  type CalEvent,
} from './calendar'

export function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}

export interface Loadable<T> {
  data: T | null
  loading: boolean
  error: boolean
  reload: () => void
}

function useLoad<T>(load: (() => Promise<T>) | null): Loadable<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(load))
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!load) return
    let cancelled = false
    setLoading(true)
    setError(false)
    load()
      .then((value) => !cancelled && setData(value))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // `load` est une fonction de module (ou null) : seul `attempt` relance.
  }, [attempt, load])
  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, loading, error, reload }
}

export function useHomeQueue(): Loadable<HomeQueue> {
  return useLoad(getHomeQueue)
}

export function useOverview(): Loadable<WorkspaceOverview> {
  return useLoad(getOverview)
}

const loadPortfolio = () => apiFetch<PortfolioOverview>('/api/admin/projects/overview')
export function usePortfolio(enabled: boolean): Loadable<PortfolioOverview> {
  return useLoad(enabled ? loadPortfolio : null)
}

export interface DashboardFigures {
  pipelineValue: number
  totalRevenue: number | null
  activeProjectCount: number
}
const loadDashboard = () => apiFetch<DashboardFigures>('/api/admin/dashboard')
export function useDashboard(): Loadable<DashboardFigures> {
  return useLoad(loadDashboard)
}

export interface TicketStats {
  open: number
  inProgress: number
  total: number
}
const loadTicketStats = () => apiFetch<TicketStats>('/api/admin/tickets/stats')
export function useTicketStats(enabled: boolean): Loadable<TicketStats> {
  return useLoad(enabled ? loadTicketStats : null)
}

/**
 * Événements du calendrier : agrégat projet (tâches, échéances, dates de
 * projet, décisions), sessions de formation et flux Apple Calendar (ICS). Les
 * deux dernières sources sont réservées au super-admin, comme leurs routes ;
 * un flux ICS non configuré (503) est simplement ignoré.
 */
export function useCalendarEvents(anchor: Date, withEducation: boolean) {
  const monthKey = `${anchor.getFullYear()}-${anchor.getMonth()}`
  const [state, setState] = useState<{ key: string; events: CalEvent[]; loading: boolean; error: boolean }>({
    key: '',
    events: [],
    loading: true,
    error: false,
  })

  useEffect(() => {
    let cancelled = false
    const { start, end } = fetchWindow(anchor)
    const from = isoDay(start)
    const to = isoDay(end)
    const today = isoDay(new Date())
    setState((s) => ({ ...s, loading: true, error: false }))

    const sources: Promise<CalEvent[]>[] = [
      apiFetch<{ events: ApiCalendarEvent[] }>(`/api/admin/calendar/events?start=${from}&end=${to}`).then((r) =>
        fromCalendarApi(r.events ?? [], today),
      ),
    ]
    if (withEducation) {
      const range = `from=${start.toISOString()}&to=${end.toISOString()}`
      sources.push(
        apiFetch<{ sessions: ApiSession[] }>(`/api/admin/education/sessions?${range}&limit=500`)
          .then((r) => fromSessions(r.sessions ?? []))
          .catch(() => []),
        apiFetch<{ events: ApiIcsEvent[] }>(`/api/admin/education/calendar?${range}`)
          .then((r) => fromIcs(r.events ?? []))
          .catch(() => []),
      )
    }

    Promise.allSettled(sources).then((results) => {
      if (cancelled) return
      const events = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      setState({ key: monthKey, events, loading: false, error: results[0].status === 'rejected' })
    })
    return () => {
      cancelled = true
    }
    // Recharge au changement de mois seulement : la fenêtre couvre toute semaine du mois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, withEducation])

  return state
}
