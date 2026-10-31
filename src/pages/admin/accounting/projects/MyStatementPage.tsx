import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '../../../../lib/api'
import { useI18n } from '../../../../context/I18nContext'
import StatementView from './StatementView'
import { ACCOUNTING, errorText } from './shared'
import type { Statement } from './types'
import '../AccountingPortal.css'

export default function MyStatementPage() {
  const { t } = useI18n()
  const [statement, setStatement] = useState<Statement | null>(null)
  const [error, setError] = useState('')
  const [empty, setEmpty] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void apiFetch<Statement>(`${ACCOUNTING}/me/statement`, { signal: controller.signal })
      .then(setStatement)
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 404) setEmpty(true)
        else setError(errorText(error))
      })
    return () => controller.abort()
  }, [attempt])
  return (
    <div className="pf-workspace">
      <div className="admin-page-header">
        <div>
          <h1>{t('accProjects.myStatement.title')}</h1>
          <p className="admin-page-subtitle">{t('accProjects.myStatement.subtitle')}</p>
        </div>
      </div>
      {empty && <div className="accounting-card">{t('accProjects.myStatement.empty')}</div>}
      {error && (
        <p role="alert" className="admin-error">
          {error}{' '}
          <button
            className="portal-button secondary"
            onClick={() => {
              setError('')
              setAttempt(attempt + 1)
            }}
          >
            {t('accProjects.common.retry')}
          </button>
        </p>
      )}
      {!statement && !error && !empty && <p role="status">{t('accProjects.statement.loading')}</p>}
      {statement && <StatementView statement={statement} personal />}
    </div>
  )
}
