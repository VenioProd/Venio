import type { SaveState } from './useEducationAutosave'
import { useI18n } from '../../../context/I18nContext'

export function AutosaveStatus({
  status,
  error,
  onRetry,
}: {
  status: SaveState
  error: string | null
  onRetry: () => Promise<boolean>
}) {
  const { t } = useI18n()
  return (
    <div className="edu-autosave" aria-live="polite">
      {status !== 'idle' && (
        <span>
          {status === 'saving'
            ? t('eduB.autosave.saving')
            : status === 'saved'
              ? t('eduB.autosave.saved')
              : t('eduB.autosave.notSaved')}
        </span>
      )}
      {error && (
        <div className="edu-banner-error" role="alert">
          {error} {t('eduB.autosave.retryBeforeLeaving')}
          <button
            className="edu-btn ghost"
            onClick={() => {
              void onRetry()
            }}
          >
            {t('eduB.autosave.retry')}
          </button>
        </div>
      )}
    </div>
  )
}
