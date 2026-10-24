import { useEffect, useState } from 'react'
import { ApiError, apiFetch } from '../../../../lib/api'
import StatementView from './StatementView'
import { ACCOUNTING, errorText } from './shared'
import type { Statement } from './types'
import '../AccountingPortal.css'

export default function MyStatementPage() {
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
          <h1>Mon relevé</h1>
          <p className="admin-page-subtitle">Vos parts et vos versements.</p>
        </div>
      </div>
      {empty && <div className="accounting-card">Aucun relevé ne vous est rattaché</div>}
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
            Réessayer
          </button>
        </p>
      )}
      {!statement && !error && !empty && <p role="status">Chargement du relevé…</p>}
      {statement && <StatementView statement={statement} personal />}
    </div>
  )
}
