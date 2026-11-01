import { useI18n } from '../../../context/I18nContext'
import type { MultiSelect } from './useMultiSelect'
import './BulkActionBar.css'

export interface QuickSelectFilter {
  id: string
  label: string
  /** Identifiants que ce raccourci sélectionne parmi la liste affichée. */
  ids: readonly string[]
}

/**
 * Raccourcis de sélection d'une liste : « tout sélectionner » puis des filtres
 * visibles (ex. « les lues », « plus vieilles que 30 j »). Chaque raccourci
 * remplace la sélection courante.
 */
export default function QuickSelect({ select, filters, total }: { select: MultiSelect; filters: QuickSelectFilter[]; total: number }) {
  const { t } = useI18n()
  if (total === 0) return null
  return (
    <div className="bulk-quick" role="group" aria-label={t('bulk.quick.label')}>
      <button type="button" className="bulk-quick__btn" onClick={select.selectAll}>
        {t('bulk.quick.all')}
      </button>
      {filters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className="bulk-quick__btn"
          disabled={filter.ids.length === 0}
          onClick={() => select.selectIds(filter.ids)}
        >
          {filter.label} ({filter.ids.length})
        </button>
      ))}
    </div>
  )
}
