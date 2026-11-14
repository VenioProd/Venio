import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, FileText, Plus } from 'lucide-react'
import CrmChip from '../admin/crm-ui/CrmChip'
import CrmEmpty from '../admin/crm-ui/CrmEmpty'
import CrmSectionHead from '../admin/crm-ui/CrmSectionHead'
import { useI18n } from '../../context/I18nContext'
import {
  SCRIPT_BODY_MAX,
  SCRIPT_TAGS_MAX,
  SCRIPT_TAG_MAX,
  SCRIPT_TITLE_MAX,
  addCallScriptTag,
  listCallScripts,
  saveCallScript,
  type CallScriptText,
} from '../../services/callScripts'
import './callScripts.css'

interface Draft {
  /** Nom du script ; modifiable seulement à la création. */
  tag: string
  isNew: boolean
  title: string
  body: string
}

/**
 * Volet « Les scripts » : les scripts d'appel et leur texte, en lecture pour
 * tous, avec « Modifier » et « Nouveau script » pour qui peut écrire (équipe
 * avec `MANAGE_CRM`). `calls` : appels par script du rapport ouvert.
 */
export default function ScriptTexts({
  base,
  canEdit,
  level,
  calls,
}: {
  base: string
  canEdit: boolean
  /** Niveau du titre du volet : h2 sous le h1 de l'équipe, h3 sous le h2 de l'externe. */
  level: 2 | 3
  calls?: { week: string; byTag: Record<string, number> }
}) {
  const { t } = useI18n()
  const titleId = useId()
  const [scripts, setScripts] = useState<CallScriptText[] | null>(null)
  const [error, setError] = useState(false)
  const [openTag, setOpenTag] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(() => {
    listCallScripts(base)
      .then((list) => {
        setScripts(list)
        setError(false)
      })
      .catch(() => setError(true))
  }, [base])
  useEffect(load, [load])

  const startEdit = (script: CallScriptText) => {
    setFormError(null)
    setOpenTag(script.tag)
    setDraft({ tag: script.tag, isNew: false, title: script.title ?? '', body: script.body ?? '' })
  }
  const startNew = () => {
    setFormError(null)
    setOpenTag(null)
    setDraft({ tag: '', isNew: true, title: '', body: '' })
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || saving) return
    const tag = draft.tag.trim()
    if (draft.isNew && scripts?.some((script) => script.tag === tag)) return setFormError(t('crmScripts.form.exists'))
    if (draft.isNew && (scripts?.length ?? 0) >= SCRIPT_TAGS_MAX)
      return setFormError(t('crmScripts.form.limit', { max: SCRIPT_TAGS_MAX }))
    setSaving(true)
    setFormError(null)
    try {
      if (draft.isNew) {
        await addCallScriptTag(base, tag)
        // L'étiquette existe désormais : une nouvelle tentative n'a plus à la créer.
        setScripts((current) => [...(current ?? []), { tag, title: null, body: null, updatedAt: null }])
        setOpenTag(tag)
        setDraft({ ...draft, tag, isNew: false })
      }
      const saved = await saveCallScript(base, { tag, title: draft.title.trim(), body: draft.body })
      setScripts((current) => (current ?? []).map((script) => (script.tag === tag ? saved : script)))
      setOpenTag(tag)
      setDraft(null)
    } catch {
      setFormError(t('crmScripts.form.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const valid =
    draft !== null &&
    draft.title.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    (!draft.isNew || draft.tag.trim().length > 0)

  return (
    <section className="crm-ui-card cs-card" aria-labelledby={titleId}>
      <CrmSectionHead
        title={t('crmScripts.title')}
        id={titleId}
        level={level}
        actions={
          canEdit && !draft ? (
            <button type="button" className="crm-ui-btn crm-ui-btn--sm" onClick={startNew}>
              <Plus size={14} aria-hidden="true" /> {t('crmScripts.add')}
            </button>
          ) : undefined
        }
      />

      {error ? (
        <div className="cs-state" role="alert">
          <p>{t('crmScripts.loadError')}</p>
          <button type="button" className="crm-ui-btn crm-ui-btn--sm" onClick={load}>
            {t('crmScripts.retry')}
          </button>
        </div>
      ) : scripts === null ? (
        <p className="cs-state" role="status">
          {t('crmScripts.loading')}
        </p>
      ) : (
        <>
          {draft?.isNew && (
            <ScriptForm
              draft={draft}
              valid={valid}
              saving={saving}
              error={formError}
              onChange={setDraft}
              onSubmit={save}
              onCancel={() => setDraft(null)}
            />
          )}
          {scripts.length === 0 && !draft ? (
            <CrmEmpty icon={<FileText size={28} />} title={t('crmScripts.empty')} />
          ) : (
            <ul className="cs-list">
              {scripts.map((script, index) => {
                const open = openTag === script.tag
                const editing = draft !== null && !draft.isNew && draft.tag === script.tag
                const count = calls?.byTag[script.tag]
                const bodyId = `${titleId}-${index}`
                return (
                  <li key={script.tag} className="cs-item">
                    <div className="cs-row">
                      <button
                        type="button"
                        className="cs-toggle"
                        aria-expanded={open}
                        aria-controls={bodyId}
                        onClick={() => setOpenTag(open ? null : script.tag)}
                      >
                        <ChevronDown size={16} aria-hidden="true" className="cs-chevron" />
                        <span className="cs-tag">{script.tag}</span>
                      </button>
                      {canEdit && !editing && (
                        <button
                          type="button"
                          className="crm-ui-btn crm-ui-btn--sm"
                          aria-label={t('crmScripts.editAria', { tag: script.tag })}
                          onClick={() => startEdit(script)}
                        >
                          {t('crmScripts.edit')}
                        </button>
                      )}
                      <span className="cs-meta">
                        {script.title === null ? (
                          <CrmChip tone="amber">{t('crmScripts.noText')}</CrmChip>
                        ) : (
                          script.title
                        )}
                        {count !== undefined && calls && <> · {t('crmScripts.calls', { count, week: calls.week })}</>}
                      </span>
                    </div>
                    <div id={bodyId} hidden={!open}>
                      {editing && draft ? (
                        <ScriptForm
                          draft={draft}
                          valid={valid}
                          saving={saving}
                          error={formError}
                          onChange={setDraft}
                          onSubmit={save}
                          onCancel={() => setDraft(null)}
                        />
                      ) : script.body === null ? (
                        <p className="cs-muted">{t('crmScripts.noTextRead')}</p>
                      ) : (
                        <div className="cs-body" tabIndex={0}>
                          {script.body}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {!canEdit && scripts.length > 0 && <p className="cs-muted">{t('crmScripts.readOnly')}</p>}
        </>
      )}
    </section>
  )
}

function ScriptForm({
  draft,
  valid,
  saving,
  error,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft
  valid: boolean
  saving: boolean
  error: string | null
  onChange: (draft: Draft) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => form.current?.querySelector('input')?.focus(), [])
  return (
    <form ref={form} className="cs-form" onSubmit={onSubmit}>
      {draft.isNew && (
        <label htmlFor={`${id}-tag`}>
          {t('crmScripts.form.name')}
          <input
            id={`${id}-tag`}
            className="portal-input"
            maxLength={SCRIPT_TAG_MAX}
            value={draft.tag}
            onChange={(event) => onChange({ ...draft, tag: event.target.value })}
          />
        </label>
      )}
      <label htmlFor={`${id}-title`}>
        {t('crmScripts.form.title')}
        <input
          id={`${id}-title`}
          className="portal-input"
          maxLength={SCRIPT_TITLE_MAX}
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </label>
      <label htmlFor={`${id}-body`}>
        {t('crmScripts.form.body')}
        <textarea
          id={`${id}-body`}
          className="portal-input cs-textarea"
          rows={10}
          maxLength={SCRIPT_BODY_MAX}
          aria-describedby={`${id}-help`}
          value={draft.body}
          onChange={(event) => onChange({ ...draft, body: event.target.value })}
        />
      </label>
      <p id={`${id}-help`} className="cs-muted">
        {t('crmScripts.form.help')} {t('crmScripts.form.counter', { count: draft.body.length, max: SCRIPT_BODY_MAX })}
      </p>
      {error && (
        <p className="cs-error" role="alert">
          {error}
        </p>
      )}
      <div className="cs-actions">
        <button type="submit" className="crm-ui-btn crm-ui-btn--primary" disabled={!valid || saving}>
          {saving ? t('crmScripts.form.saving') : t('crmScripts.form.save')}
        </button>
        <button type="button" className="crm-ui-btn crm-ui-btn--ghost" onClick={onCancel} disabled={saving}>
          {t('crmScripts.form.cancel')}
        </button>
      </div>
    </form>
  )
}
