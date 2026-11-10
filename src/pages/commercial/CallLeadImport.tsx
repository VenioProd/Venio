import { useRef, useState } from 'react'
import { useI18n, type MessageKey } from '../../context/I18nContext'
import { commercialApi, type CallImportReport } from '../../services/externalSales'

const FIELDS: { value: string; key: MessageKey }[] = [
  { value: 'company', key: 'commercial.field.company' },
  { value: 'contactPhone', key: 'commercial.field.phone' },
  { value: 'contactName', key: 'commercial.field.contact' },
  { value: 'contactEmail', key: 'commercial.field.email' },
  { value: 'notes', key: 'commercial.field.notes' },
  { value: 'source', key: 'commercial.field.source' },
]
const ERROR_KEYS: Record<string, MessageKey> = {
  INVALID_COMPANY: 'commercial.import.invalidCompany',
  INVALID_PHONE: 'commercial.import.invalidPhone',
  INVALID_EMAIL: 'commercial.import.invalidEmail',
  FIELD_TOO_LONG: 'commercial.import.fieldTooLong',
}
export default function CallLeadImport({
  region,
  projects,
  onDone,
  disabled,
}: {
  region: string
  projects: string[]
  disabled: boolean
  onDone: () => void
}) {
  const { t } = useI18n()
  const [csv, setCsv] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [callList, setCallList] = useState('')
  const [project, setProject] = useState('')
  const [defaultRegion, setDefaultRegion] = useState(region)
  const [report, setReport] = useState<CallImportReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const attempt = useRef<{ body: string; key: string } | null>(null)

  const chooseFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError('')
    setReport(null)
    setColumns([])
    try {
      if (file.size > 1_000_000) throw new Error(t('commercial.import.tooLarge'))
      const text = await file.text()
      const data = await commercialApi.previewCallImport(text)
      setCsv(text)
      setColumns(data.columns)
      setMapping({})
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const input = { csv, mapping, callList, project, region: defaultRegion.toUpperCase() }
      const body = JSON.stringify(input)
      if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() }
      setReport(await commercialApi.importCalls(input, attempt.current.key))
      setColumns([])
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="portal-card">
      <summary>{t('commercial.import.title')}</summary>
      <form onSubmit={submit} className="commercial-import-form">
        <fieldset className="commercial-form-grid" disabled={busy || disabled}>
          <label className="commercial-wide">
            {t('commercial.import.file')}
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </label>
          {columns.length > 0 && (
            <>
              {FIELDS.map((field) => (
                <label key={field.value}>
                  {t(field.key)}
                  {['company', 'contactPhone'].includes(field.value) ? ' *' : ''}
                  <select
                    className="portal-input"
                    value={mapping[field.value] ?? ''}
                    onChange={(event) => setMapping({ ...mapping, [field.value]: event.target.value })}
                  >
                    {[
                      { value: '', label: t('commercial.import.ignore') },
                      ...columns.map((value) => ({ value, label: value })),
                    ].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                {t('commercial.calls.list')}
                <input
                  className="portal-input"
                  maxLength={120}
                  value={callList}
                  onChange={(event) => setCallList(event.target.value)}
                />
              </label>
              <label>
                {t('commercial.calls.project')}
                <select className="portal-input" value={project} onChange={(event) => setProject(event.target.value)}>
                  {[{ value: '', label: '—' }, ...projects.map((value) => ({ value, label: value }))].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('commercial.import.region')}
                <input
                  className="portal-input"
                  required
                  minLength={2}
                  maxLength={2}
                  value={defaultRegion}
                  onChange={(event) => setDefaultRegion(event.target.value)}
                />
              </label>
              <div className="commercial-wide">
                <button
                  type="submit"
                  className="portal-button"
                  disabled={busy || !mapping.company || !mapping.contactPhone}
                >
                  {t('commercial.import.submit')}
                </button>
              </div>
            </>
          )}
          {error && (
            <div role="alert" className="admin-error commercial-wide">
              {error}
            </div>
          )}
          {report && (
            <div role="status" className="commercial-wide">
              <p>
                {t('commercial.import.report', {
                  created: report.created,
                  duplicates: report.duplicates,
                  rejected: report.rejected,
                })}
              </p>
              {report.errors.length > 0 && (
                <ul>
                  {report.errors.map((item) => (
                    <li key={item.row}>
                      {t('commercial.import.row', { row: item.row })} :{' '}
                      {ERROR_KEYS[item.reason] ? t(ERROR_KEYS[item.reason]) : item.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </fieldset>
      </form>
    </details>
  )
}
