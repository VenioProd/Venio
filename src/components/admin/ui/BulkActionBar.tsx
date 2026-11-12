import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'
import './BulkActionBar.css'

export interface BulkSelectOption {
  value: string
  label: string
}

export type BulkAction =
  | { kind?: 'button'; id: string; label: string; danger?: boolean; onSelect: () => void }
  | { kind: 'select'; id: string; label: string; options: BulkSelectOption[]; onSelect: (value: string) => void }
  | { kind: 'date'; id: string; label: string; clearLabel?: string; onSelect: (value: string | null) => void }

export interface BulkActionBarProps {
  count: number
  actions: BulkAction[]
  onClear: () => void
  /** Action en cours : les commandes sont désactivées. */
  busy?: boolean
}

/**
 * Barre flottante des actions groupées. Rien n'est rendu sans sélection ; le
 * compteur est annoncé par une région aria-live qui reste montée.
 */
export default function BulkActionBar({ count, actions, onClear, busy = false }: BulkActionBarProps) {
  const { t } = useI18n()
  const announce = t('bulk.announce', { count })

  return (
    <>
      <p className="bulk-live" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {count > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label={t('bulk.toolbar')} aria-busy={busy}>
          <span className="bulk-bar__count">{t('bulk.selected', { count })}</span>
          <div className="bulk-bar__actions">
            {actions.map((action) => (
              <BulkControl key={action.id} action={action} disabled={busy} />
            ))}
          </div>
          <button type="button" className="bulk-bar__btn bulk-bar__btn--ghost" onClick={onClear} disabled={busy}>
            {t('bulk.clear')}
          </button>
        </div>
      )}
    </>
  )
}

function BulkControl({ action, disabled }: { action: BulkAction; disabled: boolean }) {
  if (action.kind === 'select') return <BulkSelect action={action} disabled={disabled} />
  if (action.kind === 'date') return <BulkDate action={action} disabled={disabled} />
  return (
    <button
      type="button"
      className={`bulk-bar__btn${action.danger ? ' bulk-bar__btn--danger' : ''}`}
      onClick={action.onSelect}
      disabled={disabled}
    >
      {action.label}
    </button>
  )
}

function BulkSelect({ action, disabled }: { action: Extract<BulkAction, { kind: 'select' }>; disabled: boolean }) {
  const [value, setValue] = useState('')
  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value
    if (!next) return
    action.onSelect(next)
    // Le sélecteur revient sur son libellé : il lance une action, il ne porte pas d'état.
    setValue('')
  }
  return (
    <select
      className="bulk-bar__select"
      aria-label={action.label}
      value={value}
      onChange={onChange}
      disabled={disabled}
    >
      <option value="">{action.label}</option>
      {action.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function BulkDate({ action, disabled }: { action: Extract<BulkAction, { kind: 'date' }>; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  if (!open) {
    return (
      <button type="button" className="bulk-bar__btn" onClick={() => setOpen(true)} disabled={disabled}>
        {action.label}
      </button>
    )
  }
  return (
    <span className="bulk-bar__date">
      <input
        ref={input}
        type="date"
        className="bulk-bar__input"
        aria-label={action.label}
        disabled={disabled}
        onChange={(event) => {
          if (!event.target.value) return
          action.onSelect(event.target.value)
          setOpen(false)
        }}
      />
      {action.clearLabel && (
        <button
          type="button"
          className="bulk-bar__btn"
          disabled={disabled}
          onClick={() => {
            action.onSelect(null)
            setOpen(false)
          }}
        >
          {action.clearLabel}
        </button>
      )}
    </span>
  )
}
