import { useI18n } from '../../context/I18nContext'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import './ui/AdminHub.css'

interface PendingDecision {
  _id: string
  title: string
  priority: string
  deadline?: string
}

export default function DecisionsDigest() {
  const { t } = useI18n()
  const [decisions, setDecisions] = useState<PendingDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    // Même filtre et même enveloppe de réponse que DecisionsList, onglet PENDING.
    apiFetch<{ decisions: PendingDecision[] }>('/api/admin/decisions?status=PENDING')
      .then((data) => {
        if (!cancelled) setDecisions(data.decisions || [])
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <section className="admin-decisions-digest" aria-labelledby="decisions-digest-title">
      <div className="admin-decisions-digest__heading">
        <h2 id="decisions-digest-title">
          {t('adminOps.pilotage.digest.title')}{' '}
          {!loading && !error && <span className="admin-decisions-digest__count">({decisions.length})</span>}
        </h2>
        <Link to="/admin/decisions">{t('adminOps.pilotage.digest.all')}</Link>
      </div>
      {loading ? (
        <p role="status">{t('adminOps.pilotage.digest.loading')}</p>
      ) : error ? (
        <p role="alert">
          {t('adminOps.pilotage.digest.error')}{' '}
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setError(false)
              setAttempt((value) => value + 1)
            }}
          >
            {t('adminOps.pilotage.digest.retry')}
          </button>
        </p>
      ) : decisions.length === 0 ? (
        <p>{t('adminOps.pilotage.digest.empty')}</p>
      ) : (
        <ul>
          {decisions.map((decision) => (
            <li key={decision._id}>
              <Link to="/admin/decisions">{decision.title}</Link>
              {['HAUTE', 'URGENTE'].includes(decision.priority) && (
                <span className="admin-decisions-digest__meta">
                  {decision.priority === 'URGENTE'
                    ? t('adminOps.pilotage.digest.urgent')
                    : t('adminOps.pilotage.digest.high')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
