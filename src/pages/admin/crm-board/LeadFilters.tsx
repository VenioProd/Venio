import React from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import type { AdminUser } from '../../../types/crm.types'
import { CRM_STATUSES, CRM_PRIORITIES } from './constants'

interface LeadFiltersProps {
  search: string
  filterStatus: string
  filterPriority: string
  filterAssignee: string
  admins: AdminUser[]
  filteredCount: number
  totalCount: number
  activeFilters: number
  isSuperAdmin: boolean
  onSearchChange: (value: string) => void
  onFilterStatusChange: (value: string) => void
  onFilterPriorityChange: (value: string) => void
  onFilterAssigneeChange: (value: string) => void
  onClearFilters: () => void
}

const LeadFilters: React.FC<LeadFiltersProps> = ({
  search,
  filterStatus,
  filterPriority,
  filterAssignee,
  admins,
  filteredCount,
  totalCount,
  activeFilters,
  isSuperAdmin,
  onSearchChange,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeChange,
  onClearFilters,
}) => {
  return (
    <div className="crm-table-toolbar">
      <div className="crm-table-search-wrap">
        <svg className="crm-table-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="crm-table-search"
          placeholder="Rechercher un lead..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button className="crm-table-search-clear" onClick={() => onSearchChange('')} title="Effacer">
            &times;
          </button>
        )}
      </div>
      <div className="crm-table-filters">
        <CustomSelect
          className="crm-table-filter"
          value={filterStatus}
          onChange={onFilterStatusChange}
          options={[{ value: '', label: 'Tous les statuts' }, ...CRM_STATUSES.map((s) => ({ value: s.key, label: s.label }))]}
        />
        <CustomSelect
          className="crm-table-filter"
          value={filterPriority}
          onChange={onFilterPriorityChange}
          options={[{ value: '', label: 'Toutes priorit\u00e9s' }, ...CRM_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))]}
        />
        {isSuperAdmin && (
          <CustomSelect
            className="crm-table-filter"
            value={filterAssignee}
            onChange={onFilterAssigneeChange}
            options={[{ value: '', label: 'Tous les commerciaux' }, ...admins.map((a) => ({ value: a._id, label: a.name }))]}
          />
        )}
        {activeFilters > 0 && (
          <button className="crm-table-filter-clear" onClick={onClearFilters}>
            Effacer les filtres ({activeFilters})
          </button>
        )}
      </div>
      <div className="crm-table-stats">
        <span>{filteredCount} lead{filteredCount !== 1 ? 's' : ''}</span>
        {filteredCount !== totalCount && <span className="crm-table-stats-total">/ {totalCount} total</span>}
      </div>
    </div>
  )
}

export default LeadFilters
