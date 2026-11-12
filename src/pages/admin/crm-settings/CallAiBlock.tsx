import React, { useMemo, useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import type { Issue } from './callAiModel'
import { sameValue } from './callAiModel'

/**
 * Brouillon local d'un bloc de réglages : le bloc s'enregistre en entier (le serveur
 * refuse un chemin pointé), donc on édite une copie et on envoie la copie.
 */
export function useBlockDraft<T>(saved: T, validate: (value: T) => Issue[]) {
  const [draft, setDraft] = useState<T>(saved)
  const fingerprint = JSON.stringify(saved)
  const [seen, setSeen] = useState(fingerprint)
  // Une valeur enregistrée qui change (retour arrière d'un échec, rechargement) remplace le brouillon.
  if (seen !== fingerprint) {
    setSeen(fingerprint)
    setDraft(JSON.parse(fingerprint) as T)
  }
  const dirty = !sameValue(draft, saved)
  const issues = useMemo(() => validate(draft), [draft, validate])
  return { draft, setDraft, dirty, issues, discard: () => setDraft(saved) }
}

interface Props {
  id: string
  title: MessageKey
  description: MessageKey
  icon: React.ReactNode
  /** Ligne d'état sous la description (disponibilité côté serveur, par exemple). */
  status?: React.ReactNode
  wide?: boolean
  canManage: boolean
  dirty: boolean
  issues: Issue[]
  /** Enregistre le bloc ; renvoie le message du serveur en cas de refus, sinon `null`. */
  onSave: () => Promise<string | null>
  onDiscard: () => void
  /** Brouillon courant : un refus du serveur ne s'affiche que tant que le brouillon n'a pas changé. */
  draft: unknown
  children: React.ReactNode
}

/** Cadre commun des blocs : titre, état, champs, erreurs lisibles et bouton d'enregistrement. */
export default function CallAiBlock({
  id,
  title,
  description,
  icon,
  status,
  wide,
  canManage,
  dirty,
  issues,
  onSave,
  onDiscard,
  draft,
  children,
}: Props) {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [refusal, setRefusal] = useState<{ message: string; draft: string } | null>(null)
  const draftKey = JSON.stringify(draft)
  const serverError = refusal && refusal.draft === draftKey ? refusal.message : null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage || saving || !dirty || issues.length > 0) return
    setSaving(true)
    try {
      const message = await onSave()
      setRefusal(message ? { message, draft: draftKey } : null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className={`crm-settings-section crm-ai-block${wide ? ' crm-ai-block-wide' : ''}`}
      aria-labelledby={`${id}-title`}
      id={id}
    >
      <div className="crm-settings-section-header">
        {icon}
        <h2 id={`${id}-title`}>{t(title)}</h2>
        {dirty && <span className="crm-ai-dirty">{t('crmCallAi.dirty')}</span>}
      </div>
      <p className="crm-ai-desc">{t(description)}</p>
      {status}
      <form onSubmit={(event) => void submit(event)} noValidate>
        <fieldset disabled={!canManage || saving} className="crm-ai-form">
          {children}
        </fieldset>
        {issues.length > 0 && dirty && (
          <div className="crm-ai-issues" role="alert">
            <strong>{t('crmCallAi.fixFirst')}</strong>
            <ul>
              {issues.map((issue, index) => (
                <li key={index}>{t(issue.key, issue.params)}</li>
              ))}
            </ul>
          </div>
        )}
        {serverError && (
          <div className="crm-ai-issues" role="alert">
            {t('crmCallAi.saveError', { message: serverError })}
          </div>
        )}
        {canManage && (
          <div className="crm-ai-actions">
            <button className="portal-button" type="submit" disabled={saving || !dirty || issues.length > 0}>
              {t('crmCallAi.save')}
            </button>
            <button className="portal-button secondary" type="button" disabled={saving || !dirty} onClick={onDiscard}>
              {t('crmCallAi.discard')}
            </button>
          </div>
        )}
      </form>
    </section>
  )
}

/** Pastille d'état « disponible / non configuré » d'un fournisseur côté serveur. */
export function ServerPill({ ready, label, bare }: { ready: boolean | undefined; label: string; bare?: boolean }) {
  const { t } = useI18n()
  if (ready === undefined) return null
  return (
    <p className={`crm-ai-pill ${ready ? 'crm-ai-pill-on' : 'crm-ai-pill-off'}`}>
      <span aria-hidden="true" className="crm-ai-pill-dot" />
      <span>
        <strong>{label}</strong>
        {!bare && <> · {ready ? t('crmCallAi.server.on') : t('crmCallAi.server.off')}</>}
      </span>
    </p>
  )
}

/** Interrupteur avec titre et aide, dans le style des autres réglages. */
export function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string
  help?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="crm-ai-toggle">
      <div className="crm-settings-item-info">
        <h3>{label}</h3>
        {help && <p>{help}</p>}
      </div>
      <label className="crm-toggle">
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="crm-toggle-slider" />
      </label>
    </div>
  )
}

/** Valeur numérique saisie : vide donne NaN, que les contrôles refusent. */
export const numberValue = (value: number) => (Number.isFinite(value) ? String(value) : '')
export const parseNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw))
