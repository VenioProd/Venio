import { useState, type ReactNode } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
export type Field = {
  key: string
  label: string
  type?: 'number' | 'url' | 'text'
  options?: readonly string[]
  max?: number
}
export const dossierKey = (key: string) => `orgs.subsidiary.dossier.${key}` as MessageKey
export function Fields({
  value,
  fields,
  onChange,
}: {
  value: Record<string, any>
  fields: Field[]
  onChange: (value: Record<string, any>) => void
}) {
  const { t } = useI18n()
  return (
    <div className="dossier-fields">
      {fields.map((field) => (
        <label key={field.key}>
          {t(dossierKey(field.label))}
          {field.options ? (
            <select
              value={value[field.key] ?? ''}
              onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
            >
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option ? t(dossierKey(`enum.${option}`)) : '—'}
                </option>
              ))}
            </select>
          ) : field.type === 'number' ? (
            <input
              type="number"
              min="0"
              max="1000000000000"
              step="0.01"
              value={value[field.key] ?? 0}
              onChange={(e) => onChange({ ...value, [field.key]: Number(e.target.value) })}
            />
          ) : field.type === 'url' ? (
            <input
              type="url"
              maxLength={2000}
              value={value[field.key] ?? ''}
              onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
            />
          ) : (
            <textarea
              rows={field.type === 'text' ? 2 : 3}
              maxLength={field.max ?? 4000}
              value={value[field.key] ?? ''}
              onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  )
}
export function RowsEditor({
  rows,
  fields,
  empty,
  onChange,
}: {
  rows: Record<string, any>[]
  fields: Field[]
  empty: Record<string, any>
  onChange: (rows: Record<string, any>[]) => void
}) {
  const { t } = useI18n()
  function move(i: number, delta: number) {
    const next = [...rows]
    ;[next[i], next[i + delta]] = [next[i + delta], next[i]]
    onChange(next)
  }
  return (
    <div className="dossier-rows">
      {rows.map((row, i) => (
        <fieldset key={i}>
          <legend>{i + 1}</legend>
          <Fields
            fields={fields}
            value={row}
            onChange={(value) => onChange(rows.map((r, index) => (index === i ? value : r)))}
          />
          <div className="dossier-actions">
            <button type="button" disabled={!i} aria-label={t(dossierKey('moveUp'))} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button
              type="button"
              disabled={i === rows.length - 1}
              aria-label={t(dossierKey('moveDown'))}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button type="button" onClick={() => onChange(rows.filter((_, index) => index !== i))}>
              {t(dossierKey('remove'))}
            </button>
          </div>
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange([...rows, { ...empty }])}>
        {t(dossierKey('add'))}
      </button>
    </div>
  )
}
export default function SectionEditor({
  id,
  title,
  initial,
  save,
  editor,
  children,
  emptyLabel,
}: {
  id: string
  title: string
  initial: Record<string, any>
  save: (patch: Record<string, any>) => Promise<void>
  editor?: (draft: Record<string, any>, setDraft: (value: Record<string, any>) => void) => ReactNode
  children: ReactNode
  emptyLabel?: string
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <section id={id} className="dossier-section">
      <div className="dossier-section-head">
        <div>
          <span className="dossier-eyebrow">
            {String(
              [
                'presentation',
                'features',
                'pricing',
                'clients',
                'prospects',
                'competitors',
                'pitch',
                'pilotage',
                'dev',
                'resources',
              ].indexOf(id) + 1,
            ).padStart(2, '0')}
          </span>
          <h2>{title}</h2>
        </div>
        {editor && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(structuredClone(initial))
              setError('')
              setEditing(true)
            }}
          >
            {t(dossierKey('edit'))}
          </button>
        )}
      </div>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            try {
              await save(draft)
              setEditing(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : t(dossierKey('saveError')))
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy}>{editor?.(draft, setDraft)}</fieldset>
          {error && <p role="alert">{error}</p>}
          <div className="dossier-actions">
            <button disabled={busy}>{t(dossierKey(busy ? 'saving' : 'save'))}</button>
            <button disabled={busy} type="button" onClick={() => setEditing(false)}>
              {t(dossierKey('cancel'))}
            </button>
          </div>
        </form>
      ) : (
        children || <p className="dossier-empty">{emptyLabel || t(dossierKey('empty'))}</p>
      )}
    </section>
  )
}
