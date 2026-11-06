import { useState, type ReactNode } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { psKey } from './shared'

/** Erreur levée quand l'API répond 409 SHEET_CONFLICT. */
export class SheetConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SheetConflictError'
  }
}

interface EditableSectionProps<D> {
  id: string
  title: string
  /** Éditable seulement si la fiche l'autorise. */
  canEdit: boolean
  empty?: boolean
  /** Contenu en lecture. */
  children: ReactNode
  /** Brouillon initial à l'ouverture de l'éditeur. */
  makeDraft: () => D
  renderEditor: (draft: D, setDraft: (draft: D) => void) => ReactNode
  /** Champs envoyés au PATCH (uniquement ceux de la section). */
  toPatch: (draft: D) => Record<string, unknown>
  save: (patch: Record<string, unknown>) => Promise<void>
  onReload: () => void
  /** Désactive l'enregistrement (ex. nom vide). */
  validate?: (draft: D) => string | null
}

/** Section de fiche avec son propre mode édition (Modifier / Enregistrer / Annuler). */
export default function EditableSection<D>({
  id,
  title,
  canEdit,
  empty,
  children,
  makeDraft,
  renderEditor,
  toPatch,
  save,
  onReload,
  validate,
}: EditableSectionProps<D>) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<D | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (draft === null) return
    const problem = validate?.(draft)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError('')
    setConflict(false)
    try {
      await save(toPatch(draft))
      setEditing(false)
      setDraft(null)
    } catch (err) {
      setConflict(err instanceof SheetConflictError)
      setError(err instanceof Error && err.message ? err.message : t(psKey('edit.saveError')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id={id} className="ps-section" aria-labelledby={id + '-title'}>
      <div className="ps-section__head">
        <h2 id={id + '-title'}>{title}</h2>
        {canEdit && !editing && (
          <button
            type="button"
            className="ps-btn"
            aria-label={t(psKey('edit.edit')) + ' — ' + title}
            onClick={() => {
              setDraft(makeDraft())
              setError('')
              setConflict(false)
              setEditing(true)
            }}
          >
            {t(psKey('edit.edit'))}
          </button>
        )}
      </div>
      {editing && draft !== null ? (
        <form className="ps-form" onSubmit={submit}>
          <fieldset disabled={busy}>{renderEditor(draft, setDraft)}</fieldset>
          {error && (
            <p role="alert" className="ps-error">
              {error}
            </p>
          )}
          <div className="ps-actions">
            <button type="submit" className="ps-btn ps-btn--primary" disabled={busy}>
              {busy ? t(psKey('edit.saving')) : t(psKey('edit.save'))}
            </button>
            <button
              type="button"
              className="ps-btn"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setDraft(null)
                setError('')
              }}
            >
              {t(psKey('edit.cancel'))}
            </button>
            {conflict && (
              <button type="button" className="ps-btn" onClick={onReload}>
                {t(psKey('edit.reload'))}
              </button>
            )}
          </div>
        </form>
      ) : empty ? (
        <p className="ps-empty">{t(psKey('empty'))}</p>
      ) : (
        children
      )}
    </section>
  )
}
