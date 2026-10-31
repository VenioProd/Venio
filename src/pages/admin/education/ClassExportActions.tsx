import { Download } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { downloadClassWorkspaceExport, type EducationClassExportFormat } from '../../../services/education'

/** Download controls stay next to the selected class so no workspace-wide data is exported by accident. */
export function ClassExportActions({ classId }: { classId: string }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState<EducationClassExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(format: EducationClassExportFormat) {
    setLoading(format)
    setError(null)
    try {
      await downloadClassWorkspaceExport(classId, format)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduD.export.error'))
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="edu-row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button
        type="button"
        className="edu-btn ghost"
        disabled={loading !== null}
        onClick={() => void download('csv')}
        aria-label={t('eduD.export.csvAria')}
      >
        <Download size={14} />
        {loading === 'csv' ? t('eduD.export.csvBusy') : 'CSV'}
      </button>
      <button
        type="button"
        className="edu-btn ghost"
        disabled={loading !== null}
        onClick={() => void download('json')}
        aria-label={t('eduD.export.jsonAria')}
      >
        <Download size={14} />
        {loading === 'json' ? t('eduD.export.jsonBusy') : 'JSON'}
      </button>
      {error && (
        <span role="alert" style={{ color: '#FCA5A5', fontSize: 12, flexBasis: '100%', textAlign: 'right' }}>
          {error}
        </span>
      )}
    </div>
  )
}
