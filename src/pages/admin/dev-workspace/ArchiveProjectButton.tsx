import { useState } from 'react'
import { Archive, ArchiveRestore } from 'lucide-react'
import { useConfirm } from '../../../hooks/useConfirm'
import { useI18n } from '../../../context/I18nContext'
import { setDevProjectArchived } from '../../../services/dev'

interface Props {
  projectId: string
  projectName: string
  archived: boolean
  /** Appelé après un changement réussi, avec le nouvel état « archivé ». */
  onChanged: (archived: boolean) => void
  className?: string
}

/** Bouton Archiver / Restaurer d'un projet du Dev Tracker (les tickets ne sont pas touchés). */
const ArchiveProjectButton = ({ projectId, projectName, archived, onChanged, className = 'cockpit-btn subtle' }: Props) => {
  const { t } = useI18n()
  const { confirm, ConfirmDialog } = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    const ok = await confirm({
      message: t(archived ? 'devA.projects.restoreConfirm' : 'devA.projects.archiveConfirm', { name: projectName }),
      variant: archived ? 'info' : 'warning',
      confirmLabel: t(archived ? 'devA.projects.restore' : 'devA.projects.archive'),
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await setDevProjectArchived(projectId, !archived)
      onChanged(!archived)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('devA.projects.archiveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={run} disabled={busy}>
        {archived ? <ArchiveRestore size={12} /> : <Archive size={12} />}{' '}
        {t(archived ? 'devA.projects.restore' : 'devA.projects.archive')}
      </button>
      {error && (
        <span role="alert" className="cockpit-error">
          {error}
        </span>
      )}
      {ConfirmDialog}
    </>
  )
}

export default ArchiveProjectButton
