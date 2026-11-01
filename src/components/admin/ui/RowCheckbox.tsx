import type { MouseEvent } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MultiSelect } from './useMultiSelect'
import './BulkActionBar.css'

/** Case de sélection d'une ligne : maj+clic étend la plage. N'ouvre pas la ligne parente. */
export function RowCheckbox({ id, name, select }: { id: string; name: string; select: MultiSelect }) {
  const { t } = useI18n()
  return (
    <label className="bulk-check" onClick={(event) => event.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={t('bulk.selectRowAria', { name })}
        checked={select.isSelected(id)}
        onChange={() => undefined}
        onClick={(event: MouseEvent<HTMLInputElement>) => {
          event.stopPropagation()
          select.toggle(id, { shift: event.shiftKey })
        }}
      />
    </label>
  )
}

/** Case « tout cocher » d'un en-tête de tableau. */
export function SelectAllCheckbox({ select }: { select: MultiSelect }) {
  const { t } = useI18n()
  return (
    <label className="bulk-check" onClick={(event) => event.stopPropagation()}>
      <input
        type="checkbox"
        aria-label={t('bulk.selectAllAria')}
        checked={select.allSelected}
        ref={(el) => {
          if (el) el.indeterminate = select.someSelected
        }}
        onChange={select.toggleAll}
      />
    </label>
  )
}
