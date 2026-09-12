import type { SaveState } from './useEducationAutosave'

export function AutosaveStatus({
  status,
  error,
  onRetry,
}: {
  status: SaveState
  error: string | null
  onRetry: () => Promise<boolean>
}) {
  return (
    <div className="edu-autosave" aria-live="polite">
      {status !== 'idle' && (
        <span>{status === 'saving' ? 'Enregistrement…' : status === 'saved' ? 'Enregistré' : 'Non enregistré'}</span>
      )}
      {error && (
        <div className="edu-banner-error" role="alert">
          {error} Réessayez avant de quitter.
          <button
            className="edu-btn ghost"
            onClick={() => {
              void onRetry()
            }}
          >
            Réessayer l’enregistrement
          </button>
        </div>
      )}
    </div>
  )
}
