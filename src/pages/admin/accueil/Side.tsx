import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { apiFetch } from '../../../lib/api'
import { formatDate } from '../../../i18n/format'
import type { WorkspaceOverview } from '../../../types/workspace.types'
import type { PortfolioOverview } from '../projects-portfolio/portfolio'
import { stamp } from './timeText'

const AVATAR_TONES = ['sky', 'mint', 'teal', 'amber', 'vio', 'rose']

function initials(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  return (words[0]?.[0] ?? '·').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase()
}

/** « Depuis votre dernière visite » : notifications non lues (aucune date de visite n'est stockée). */
export function SinceLastVisit({ overview, loading }: { overview: WorkspaceOverview | null; loading: boolean }) {
  const { t } = useI18n()
  const [read, setRead] = useState<Set<string>>(new Set())
  const now = new Date()
  const unread = (overview?.activity ?? []).filter((a) => a.isRead !== true && !read.has(a._id)).slice(0, 6)

  const markRead = (id: string) => {
    setRead((prev) => new Set(prev).add(id))
    apiFetch(`/api/admin/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {})
  }

  return (
    <section className="hm-card" aria-labelledby="hs-title">
      <div className="hm-card-h">
        <h2 id="hs-title">
          {t('home.since.title')}
          {unread.length > 0 && <span className="hm-count">{unread.length}</span>}
        </h2>
        <Link className="hm-link" to="/admin/inbox">
          {t('home.since.inbox')} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {loading && !overview ? (
        <p className="hm-empty" role="status">
          {t('home.loading')}
        </p>
      ) : unread.length === 0 ? (
        <p className="hm-empty">{t('home.since.empty')}</p>
      ) : (
        <ul className="hs-feed">
          {unread.map((a, i) => {
            const body = (
              <>
                <span className={`hs-av c-${AVATAR_TONES[i % AVATAR_TONES.length]}`} aria-hidden="true">
                  {initials(a.title)}
                </span>
                <p>
                  <b>{a.title}</b>
                  {a.message && <span>{a.message}</span>}
                </p>
                <time dateTime={a.createdAt}>{stamp(t, a.createdAt, now)}</time>
              </>
            )
            return (
              <li key={a._id}>
                {a.link ? (
                  <Link to={a.link} onClick={() => markRead(a._id)}>
                    {body}
                  </Link>
                ) : (
                  <div>{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Projets en retard, issus de la vue d'ensemble du portefeuille. */
export function WatchProjects({ portfolio, loading }: { portfolio: PortfolioOverview | null; loading: boolean }) {
  const { t } = useI18n()
  const late = (portfolio?.items ?? [])
    .filter((p) => p.status !== 'TERMINE' && p.overdueDays > 0)
    .sort((a, b) => b.overdueDays - a.overdueDays)
  const shown = late.slice(0, 5)

  return (
    <section className="hm-card" aria-labelledby="hw-title">
      <div className="hm-card-h">
        <h2 id="hw-title">
          {t('home.watch.title')}
          {late.length > 0 && <span className="hm-count is-hot">{late.length}</span>}
        </h2>
        <Link className="hm-link" to="/admin/projets/clients">
          {t('home.watch.all')} <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {loading && !portfolio ? (
        <p className="hm-empty" role="status">
          {t('home.loading')}
        </p>
      ) : shown.length === 0 ? (
        <p className="hm-empty">{t('home.watch.empty')}</p>
      ) : (
        <div className="hw-list">
          {shown.map((p) => (
            <Link key={p._id} className="hw-row" to={`/admin/projets/${p._id}`}>
              <div>
                <b>{p.name}</b>
                <span>
                  {[
                    p.client?.name,
                    p.endDate
                      ? t('home.watch.due', { date: formatDate(p.endDate, { day: 'numeric', month: 'short' }) })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div className="hw-bar" role="img" aria-label={t('home.watch.progress', { pct: p.progress })}>
                <i style={{ width: `${Math.max(0, Math.min(100, p.progress))}%` }} />
              </div>
              <span className="hw-late">{t('home.watch.late', { count: p.overdueDays })}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

/** Épinglés : affichés seulement s'il y en a. */
export function Pinned({ overview }: { overview: WorkspaceOverview | null }) {
  const { t } = useI18n()
  const pins = overview?.pinned ?? []
  if (pins.length === 0) return null
  return (
    <section className="hm-card" aria-labelledby="hpin-title">
      <div className="hm-card-h">
        <h2 id="hpin-title">{t('home.pinned.title')}</h2>
      </div>
      <div className="hpin-list">
        {pins.map((p, i) => (
          <Link key={p._id} className={`hpin c-${AVATAR_TONES[i % AVATAR_TONES.length]}`} to={p.link}>
            <i aria-hidden="true" />
            {p.title}
          </Link>
        ))}
      </div>
    </section>
  )
}
