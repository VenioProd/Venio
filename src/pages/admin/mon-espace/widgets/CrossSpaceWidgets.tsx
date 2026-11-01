import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GitPullRequest, GraduationCap, MapPin } from 'lucide-react'
import { listDevIssues, type DevIssue } from '../../../../services/dev'
import { listSessions, formatDate, type EducationSession } from '../../../../services/education'
import { useI18n } from '../../../../context/I18nContext'
import { translate } from '../../../../i18n'
import { formatDate as formatShortDate } from '../../../../i18n/format'

// Helper local (équivalent de dev-workspace/helpers) pour rester dans le périmètre mon-espace.
function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return translate('adminAccess.widgets.relNow')
  if (diff < hour) return translate('adminAccess.widgets.relMinutes', { n: Math.floor(diff / minute) })
  if (diff < day) return translate('adminAccess.widgets.relHours', { n: Math.floor(diff / hour) })
  if (diff < 7 * day) return translate('adminAccess.widgets.relDays', { n: Math.floor(diff / day) })
  return formatShortDate(date, { day: '2-digit', month: 'short' })
}

function projectColor(project: DevIssue['project']): string {
  return typeof project === 'object' && project?.color ? project.color : 'var(--primary)'
}

export function DevReviewWidget() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [issues, setIssues] = useState<DevIssue[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    listDevIssues({ status: 'IN_REVIEW' })
      .then(({ issues: list }) => {
        if (cancelled) return
        setIssues([...list].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)))
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="widget">
      <div className="widget-title">
        <GitPullRequest size={15} /> {t('adminAccess.widgets.devReviewTitle')}
        {issues && issues.length > 0 && <span className="widget-count">{issues.length}</span>}
      </div>
      {error && <p className="widget-empty">{t('adminAccess.widgets.devLoadFailed')}</p>}
      {!error && issues && issues.length === 0 && <p className="widget-empty">{t('adminAccess.widgets.devNothing')}</p>}
      {!error && issues && issues.length > 0 && (
        <ul className="widget-list">
          {issues.slice(0, 6).map((issue) => (
            <li key={issue._id}>
              <button className="widget-issue" onClick={() => navigate(`/admin/dev/issues/${issue._id}`)}>
                <span className="widget-issue__id" style={{ color: projectColor(issue.project) }}>
                  {issue.identifier}
                </span>
                <span className="widget-issue__title">{issue.title}</span>
                <span className="widget-issue__age">{formatRelative(issue.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/admin/dev/workspace" className="widget-footer-link">
        {t('adminAccess.widgets.devOpen')}
      </Link>
    </div>
  )
}

function sessionClass(classId: EducationSession['classId']): { name: string; color: string } | null {
  if (typeof classId === 'object' && classId?.name)
    return { name: classId.name, color: classId.color || 'var(--primary)' }
  return null
}

// Compte à rebours simple jusqu'à la séance.
function countdown(date: string): string {
  const diff = new Date(date).getTime() - Date.now()
  if (diff <= 0) return translate('adminAccess.widgets.countdownNow')
  const min = Math.round(diff / 60_000)
  if (min < 60) return translate('adminAccess.widgets.countdownMinutes', { n: min })
  const h = Math.round(min / 60)
  if (h < 24) return translate('adminAccess.widgets.countdownHours', { n: h })
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (new Date(date).toDateString() === tomorrow.toDateString())
    return translate('adminAccess.widgets.countdownTomorrow')
  return translate('adminAccess.widgets.countdownDays', { n: Math.round(h / 24) })
}

export function NextSessionWidget() {
  const { t } = useI18n()
  const [session, setSession] = useState<EducationSession | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    listSessions({ from: new Date().toISOString() })
      .then(({ sessions }) => {
        if (cancelled) return
        const next = sessions
          .filter((s) => s.status === 'PLANIFIEE' || s.status === 'EN_COURS')
          .sort((a, b) => a.date.localeCompare(b.date))[0]
        setSession(next ?? null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cls = session ? sessionClass(session.classId) : null

  return (
    <div className="widget">
      <div className="widget-title">
        <GraduationCap size={15} /> {t('adminAccess.widgets.nextSessionTitle')}
      </div>
      {loaded && !session && <p className="widget-empty">{t('adminAccess.widgets.nextSessionEmpty')}</p>}
      {session && (
        <Link to="/admin/formation/pedagogie" className="widget-session">
          <span className="widget-session__name">{session.title || t('adminAccess.widgets.sessionFallback')}</span>
          {cls && (
            <span className="widget-session__class" style={{ color: cls.color, borderColor: cls.color }}>
              {cls.name}
            </span>
          )}
          <span className="widget-session__meta">
            {formatDate(session.date, true)}
            {session.location ? (
              <>
                {' '}
                · <MapPin size={11} /> {session.location}
              </>
            ) : null}
          </span>
          <span className="widget-session__countdown">{countdown(session.date)}</span>
        </Link>
      )}
    </div>
  )
}
