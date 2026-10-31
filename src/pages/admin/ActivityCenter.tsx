import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchActivitySummary, type ActivitySummary } from '../../services/activityCenter'
import { useI18n } from '../../context/I18nContext'
import { formatDate } from '../../i18n/format'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

export default function ActivityCenter() {
  const { t } = useI18n()
  const [data, setData] = useState<ActivitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchActivitySummary())
    } catch {
      setError(t('adminOps.activity.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="portal-container">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {t('adminOps.activity.title')}
            </h1>
            {data && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '5px 0 0' }}>
                {t('adminOps.activity.updated', {
                  date: formatDate(data.checkedAt, { dateStyle: 'short', timeStyle: 'short' }),
                  limit: data.limit,
                })}
              </p>
            )}
          </div>
          <button className="portal-button secondary" onClick={() => void load()} disabled={loading}>
            {loading ? t('adminOps.common.loading') : t('adminOps.common.refresh')}
          </button>
        </div>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
        {loading && !data && <p style={{ color: 'var(--text-muted)' }}>{t('adminOps.common.loading')}</p>}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            {data.sections.map((section) => (
              <section
                key={section.key}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 15 }}>{section.label}</h2>
                  <Link
                    to={section.href}
                    className="portal-button secondary"
                    style={{ padding: '5px 9px', fontSize: 12 }}
                  >
                    {t('adminOps.activity.viewAll')}
                  </Link>
                </div>
                {section.entries.length === 0 ? (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                    {t('adminOps.activity.nothing')}
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                    {section.entries.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          to={entry.href}
                          style={{
                            display: 'block',
                            textDecoration: 'none',
                            color: 'inherit',
                            padding: '9px 0',
                            borderBottom: '1px solid var(--border-color)',
                          }}
                        >
                          <strong style={{ display: 'block', fontSize: 13 }}>{entry.title}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{entry.meta}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {section.hasMore && (
                  <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                    {t('adminOps.activity.more')}
                  </p>
                )}
              </section>
            ))}
            {data.sections.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>{t('adminOps.activity.noSections')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
