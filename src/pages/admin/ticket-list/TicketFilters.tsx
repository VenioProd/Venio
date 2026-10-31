import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from './types'
import { useI18n } from '../../../context/I18nContext'

interface TicketFiltersProps {
  filterCategory: string
  setFilterCategory: (v: string) => void
  filterPriority: string
  setFilterPriority: (v: string) => void
}

const TicketFilters: React.FC<TicketFiltersProps> = ({
  filterCategory,
  setFilterCategory,
  filterPriority,
  setFilterPriority,
}) => {
  const { t } = useI18n()
  return (
    <div className="ticket-filters">
      <CustomSelect
        className="gestion-filter-select"
        value={filterCategory}
        onChange={(v) => setFilterCategory(v)}
        options={[
          { value: 'all', label: t('orgs.tickets.filters.allCategories') },
          ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: t(v.labelKey) })),
        ]}
      />
      <CustomSelect
        className="gestion-filter-select"
        value={filterPriority}
        onChange={(v) => setFilterPriority(v)}
        options={[
          { value: 'all', label: t('orgs.tickets.filters.allPriorities') },
          ...Object.entries(PRIORITY_CONFIG).map(([k, v]) => ({ value: k, label: t(v.labelKey) })),
        ]}
      />
      {(filterCategory !== 'all' || filterPriority !== 'all') && (
        <button
          className="gestion-filter-clear"
          onClick={() => {
            setFilterCategory('all')
            setFilterPriority('all')
          }}
        >
          {t('orgs.tickets.filters.reset')}
        </button>
      )}
    </div>
  )
}

export default TicketFilters
