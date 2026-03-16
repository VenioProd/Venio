import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { CATEGORY_CONFIG, PRIORITY_CONFIG } from './types'

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
  return (
    <div className="ticket-filters">
      <CustomSelect
        className="gestion-filter-select"
        value={filterCategory}
        onChange={(v) => setFilterCategory(v)}
        options={[
          { value: 'all', label: 'Toutes les categories' },
          ...Object.entries(CATEGORY_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
        ]}
      />
      <CustomSelect
        className="gestion-filter-select"
        value={filterPriority}
        onChange={(v) => setFilterPriority(v)}
        options={[
          { value: 'all', label: 'Toutes les priorites' },
          ...Object.entries(PRIORITY_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
        ]}
      />
      {(filterCategory !== 'all' || filterPriority !== 'all') && (
        <button
          className="gestion-filter-clear"
          onClick={() => { setFilterCategory('all'); setFilterPriority('all') }}
        >
          Reinitialiser
        </button>
      )}
    </div>
  )
}

export default TicketFilters
