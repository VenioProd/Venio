import { useState } from 'react'
import { apiDownload } from '../../../../lib/api'
import { ACCOUNTING, errorText, Field } from './shared'

export default function FinanceExports({ projectId, statementPath }: { projectId?: string; statementPath?: string }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const download = async (path: string) => {
    setPending(true)
    setError('')
    const query = new URLSearchParams()
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    if (projectId) query.set('projectId', projectId)
    try {
      const { blob, filename } = await apiDownload(`${ACCOUNTING}/exports/${path}?${query}`)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || path.split('/').pop() || 'export'
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setError(errorText(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="accounting-card" aria-label="Exports comptables">
      <h2>Exports</h2>
      <div className="pf-grid">
        <Field label="Du (facultatif)">
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Au (facultatif)">
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
      <div className="pf-actions">
        {statementPath && (
          <button className="portal-button secondary" disabled={pending} onClick={() => void download(statementPath)}>
            Relevé (PDF)
          </button>
        )}
        {!statementPath && (
          <>
            <button
              className="portal-button secondary"
              disabled={pending}
              onClick={() => void download('payments.csv')}
            >
              Exporter les encaissements (CSV)
            </button>
            <button
              className="portal-button secondary"
              disabled={pending}
              onClick={() => void download('settlements-costs.csv')}
            >
              Exporter les versements et coûts (CSV)
            </button>
            {projectId && (
              <button
                className="portal-button secondary"
                disabled={pending}
                onClick={() => void download(`projects/${projectId}/sheet.pdf`)}
              >
                Fiche projet (PDF)
              </button>
            )}
          </>
        )}
      </div>
      {pending && <p role="status">Préparation du téléchargement…</p>}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
