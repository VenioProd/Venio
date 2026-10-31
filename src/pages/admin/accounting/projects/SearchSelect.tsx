import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { Field } from './shared'

interface Option {
  value: string
  label: string
  hint?: string
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export default function SearchSelect({
  label,
  value,
  options,
  onChange,
  required,
  disabled,
  status,
}: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  required: boolean
  disabled: boolean
  status?: string
}) {
  const { t } = useI18n()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [search, setSearch] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const selected = options.find((option) => option.value === value)
  const selectedLabel = selected?.label || (value ? status || t('accProjects.search.notFound') : '')
  const open = search !== null && !disabled
  const filtered = options.filter((option) =>
    normalize(`${option.label} ${option.hint || ''}`).includes(normalize(search || '')),
  )
  useEffect(() => {
    // Le texte recherché ne constitue pas une référence sélectionnée.
    input.current?.setCustomValidity(required && !value ? t('accProjects.search.chooseOption') : '')
  }, [required, value, t])
  useEffect(() => {
    if (open && active >= 0) list.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])
  const close = () => {
    setSearch(null)
    setActive(-1)
  }
  const choose = (option: Option) => {
    onChange(option.value)
    close()
  }
  return (
    <div className="pf-search-select">
      <Field label={label}>
        <input
          ref={input}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-activedescendant={open && filtered[active] ? `${id}-${active}` : undefined}
          aria-describedby={status || selected?.hint ? `${id}-status` : undefined}
          required={required}
          disabled={disabled}
          value={open ? search || '' : selectedLabel}
          placeholder={selectedLabel || t('accProjects.search.placeholder')}
          onFocus={() => setSearch('')}
          onClick={() => {
            if (!open) setSearch('')
          }}
          onBlur={close}
          onChange={(event) => {
            setSearch(event.target.value)
            setActive(-1)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (!open) setSearch('')
              const count = filtered.length
              setActive(
                count ? (event.key === 'ArrowDown' ? (active + 1) % count : (active <= 0 ? count : active) - 1) : -1,
              )
            } else if (event.key === 'Enter' && open) {
              event.preventDefault()
              if (filtered[active]) choose(filtered[active])
            } else if (event.key === 'Escape' && open) {
              event.preventDefault()
              close()
            }
          }}
        />
      </Field>
      {(status || selected?.hint) && (
        <span className="pf-status" id={`${id}-status`} role="status">
          {status || selected?.hint}
        </span>
      )}
      {open && (
        <ul className="pf-select-list" id={`${id}-list`} role="listbox" aria-label={label} ref={list}>
          {filtered.map((option, index) => (
            <li
              id={`${id}-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={index === active ? 'pf-select-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.hint && <span className="pf-status">{option.hint}</span>}
            </li>
          ))}
          {!filtered.length && (
            <li className="pf-status" role="presentation">
              {status || t('accProjects.search.noResult')}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
