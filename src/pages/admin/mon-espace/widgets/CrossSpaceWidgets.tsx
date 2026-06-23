import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GitPullRequest, GraduationCap, MapPin } from 'lucide-react'
import { listDevIssues, type DevIssue } from '../../../../services/dev'
import { listSessions, formatDate, type EducationSession } from '../../../../services/education'

// Helper local (équivalent de dev-workspace/helpers) pour rester dans le périmètre mon-espace.
function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function projectColor(project: DevIssue['project']): string {
  return typeof project === 'object' && project?.color ? project.color : 'var(--primary)'
}

export function DevReviewWidget() {
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
        <GitPullRequest size={15} /> Dev — à valider
        {issues && issues.length > 0 && <span className="widget-count">{issues.length}</span>}
      </div>
      {error && <p className="widget-empty">Impossible de charger les issues</p>}
      {!error && issues && issues.length === 0 && <p className="widget-empty">Rien à valider 🎉</p>}
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
      <Link to="/admin/dev" className="widget-footer-link">
        Ouvrir le suivi dev →
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
  if (diff <= 0) return 'maintenant'
  const min = Math.round(diff / 60_000)
  if (min < 60) return `dans ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `dans ${h} h`
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (new Date(date).toDateString() === tomorrow.toDateString()) return 'demain'
  return `dans ${Math.round(h / 24)} j`
}

export function NextSessionWidget() {
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
        <GraduationCap size={15} /> Prochaine séance
      </div>
      {loaded && !session && <p className="widget-empty">Aucune séance planifiée</p>}
      {session && (
        <Link to="/admin/education" className="widget-session">
          <span className="widget-session__name">{session.title || 'Séance'}</span>
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
