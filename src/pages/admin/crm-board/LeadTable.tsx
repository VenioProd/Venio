import React, { useState } from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import LeadFilters from './LeadFilters'
import LeadTableRow from './LeadTableRow'
import type { Lead, AdminUser } from '../../../types/crm.types'
import type { CrmOption } from './constants'
import type { MessageKey } from '../../../i18n'

interface LeadTableProps {
  groupedLeads: (CrmOption & { leads: Lead[] })[]
  filteredLeads: Lead[]
  totalLeads: number
  search: string
  filterStatus: string
  filterPriority: string
  filterAssignee: string
  filterProject?: string
  sortField: string
  sortDir: string
  collapsedGroups: Record<string, boolean>
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  converting: string | null
  deleteConfirm: string | null
  activeFilters: number
  isSuperAdmin: boolean
  allCollapsed: boolean
  onSearchChange: (value: string) => void
  onFilterStatusChange: (value: string) => void
  onFilterPriorityChange: (value: string) => void
  onFilterAssigneeChange: (value: string) => void
  onFilterProjectChange?: (value: string) => void
  onClearFilters: () => void
  onToggleAll: () => void
  onToggleSort: (field: string) => void
  onToggleGroup: (statusKey: string) => void
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onDeleteLead: (leadId: string) => Promise<void>
  onSetDeleteConfirm: (id: string | null) => void
  onExpandLead: (lead: Lead) => void
  onTransferToArrow?: (leadId: string) => void
  onTransferSelectionToArrow?: (ids: string[]) => void
}

const SortIcon = ({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: string }) => {
  if (sortField !== field) return <span className="crm-sort-icon">↕</span>
  return <span className="crm-sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

// Tri proposé sur mobile, où l'en-tête du tableau n'existe pas (les lignes sont
// des cartes). Mêmes champs que les colonnes triables de l'en-tête.
const MOBILE_SORT_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: 'company', labelKey: 'crm.col.company' },
  { value: 'contactName', labelKey: 'crm.col.contact' },
  { value: 'nextActionAt', labelKey: 'crm.col.nextAction' },
  { value: 'updatedAt', labelKey: 'crm.col.updatedAt' },
  { value: 'priority', labelKey: 'crm.col.priority' },
  { value: 'budget', labelKey: 'crm.col.budget' },
  { value: 'leadTemperature', labelKey: 'crm.col.temperature' },
  { value: 'project', labelKey: 'crm.col.project' },
  { value: 'source', labelKey: 'crm.col.source' },
]

const LeadTable: React.FC<LeadTableProps> = ({
  groupedLeads,
  filteredLeads,
  totalLeads,
  search,
  filterStatus,
  filterPriority,
  filterAssignee,
  filterProject,
  sortField,
  sortDir,
  collapsedGroups,
  admins,
  adminsById,
  canManageCrm,
  converting,
  deleteConfirm,
  activeFilters,
  isSuperAdmin,
  allCollapsed,
  onSearchChange,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeChange,
  onFilterProjectChange,
  onClearFilters,
  onToggleAll,
  onToggleSort,
  onToggleGroup,
  onUpdateLead,
  onConvertToClient,
  onDeleteLead,
  onSetDeleteConfirm,
  onExpandLead,
  onTransferToArrow,
  onTransferSelectionToArrow,
}) => {
  const { t } = useI18n()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allIds = filteredLeads.map((l) => l._id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const someSelected = selected.size > 0

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds))

  const colSpanTotal = canManageCrm ? (onTransferSelectionToArrow ? 15 : 14) : onTransferSelectionToArrow ? 14 : 13

  return (
    <div className="crm-table-container">
      <LeadFilters
        search={search}
        filterStatus={filterStatus}
        filterPriority={filterPriority}
        filterAssignee={filterAssignee}
        filterProject={filterProject}
        admins={admins}
        filteredCount={filteredLeads.length}
        totalCount={totalLeads}
        activeFilters={activeFilters}
        isSuperAdmin={isSuperAdmin}
        allCollapsed={allCollapsed}
        onSearchChange={onSearchChange}
        onFilterStatusChange={onFilterStatusChange}
        onFilterPriorityChange={onFilterPriorityChange}
        onFilterAssigneeChange={onFilterAssigneeChange}
        onFilterProjectChange={onFilterProjectChange}
        onClearFilters={onClearFilters}
        onToggleAll={onToggleAll}
      />

      {/* Tri (mobile uniquement : l'en-tête du tableau y est masqué) */}
      <div className="crm-sort-bar">
        <span className="crm-sort-bar-label">{t('crm.table.sortBy')}</span>
        <CustomSelect
          className="crm-sort-bar-select"
          value={sortField}
          onChange={(v) => {
            if (v !== sortField) onToggleSort(v)
          }}
          options={MOBILE_SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />
        <button
          type="button"
          className="crm-sort-bar-dir"
          onClick={() => onToggleSort(sortField)}
          aria-label={sortDir === 'asc' ? t('crm.table.sortAsc') : t('crm.table.sortDesc')}
        >
          {sortDir === 'asc' ? '\u2191' : '\u2193'}
        </button>
      </div>

      {/* Barre de sélection */}
      {someSelected && onTransferSelectionToArrow && (
        <div className="crm-selection-bar">
          <span className="crm-selection-count">{t('crm.table.selectedCount', { count: selected.size })}</span>
          <button
            className="portal-button crm-selection-transfer"
            onClick={() => {
              onTransferSelectionToArrow([...selected])
              setSelected(new Set())
            }}
          >
            {t('crm.row.transferToArrow')}
          </button>
          <button className="crm-selection-clear" onClick={() => setSelected(new Set())}>
            {t('crm.table.deselect')}
          </button>
        </div>
      )}

      <div className="crm-table-scroll">
        <table className="crm-table">
          <thead>
            <tr>
              {onTransferSelectionToArrow && (
                <th className="crm-th crm-th-select">
                  <input
                    type="checkbox"
                    className="crm-select-checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={t('crm.table.selectAll')}
                  />
                </th>
              )}
              <th className="crm-th crm-th-company" onClick={() => onToggleSort('company')}>
                {t('crm.col.company')} <SortIcon field="company" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-contact" onClick={() => onToggleSort('contactName')}>
                {t('crm.col.contact')} <SortIcon field="contactName" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-email">{t('crm.col.email')}</th>
              <th className="crm-th crm-th-phone">{t('crm.col.phone')}</th>
              <th className="crm-th crm-th-source" onClick={() => onToggleSort('source')}>
                {t('crm.col.source')} <SortIcon field="source" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-project" onClick={() => onToggleSort('project')}>
                {t('crm.col.project')} <SortIcon field="project" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-priority" onClick={() => onToggleSort('priority')}>
                {t('crm.col.priority')} <SortIcon field="priority" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-budget" onClick={() => onToggleSort('budget')}>
                {t('crm.col.budget')} <SortIcon field="budget" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-service">{t('crm.col.service')}</th>
              <th className="crm-th crm-th-temperature" onClick={() => onToggleSort('leadTemperature')}>
                {t('crm.col.temperature')} <SortIcon field="leadTemperature" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-assignee">{t('crm.col.sales')}</th>
              <th className="crm-th crm-th-date" onClick={() => onToggleSort('nextActionAt')}>
                {t('crm.col.nextAction')} <SortIcon field="nextActionAt" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-date" onClick={() => onToggleSort('updatedAt')}>
                {t('crm.col.updatedAt')} <SortIcon field="updatedAt" sortField={sortField} sortDir={sortDir} />
              </th>
              {canManageCrm && <th className="crm-th crm-th-actions"></th>}
            </tr>
          </thead>
          <tbody>
            {groupedLeads.map((group) => {
              const isCollapsed = collapsedGroups[group.key]
              return (
                <React.Fragment key={group.key}>
                  <tr className="crm-group-row" onClick={() => onToggleGroup(group.key)}>
                    <td colSpan={colSpanTotal}>
                      <div className="crm-group-header" style={{ '--group-color': group.color } as React.CSSProperties}>
                        <span className={`crm-group-chevron ${isCollapsed ? '' : 'open'}`}>▶</span>
                        <span className="crm-group-color-bar" style={{ background: group.color }} />
                        <span className="crm-group-label">{t(group.labelKey)}</span>
                        <span className="crm-group-count">
                          {t('crm.filters.leadCount', { count: group.leads.length })}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {!isCollapsed &&
                    group.leads.map((lead) => (
                      <LeadTableRow
                        key={lead._id}
                        lead={lead}
                        groupColor={group.color}
                        admins={admins}
                        adminsById={adminsById}
                        canManageCrm={canManageCrm}
                        converting={converting}
                        deleteConfirm={deleteConfirm}
                        onUpdateLead={onUpdateLead}
                        onConvertToClient={onConvertToClient}
                        onDeleteLead={onDeleteLead}
                        onSetDeleteConfirm={onSetDeleteConfirm}
                        onExpandLead={onExpandLead}
                        onTransferToArrow={onTransferToArrow}
                        isSelected={selected.has(lead._id)}
                        onToggleSelect={onTransferSelectionToArrow ? () => toggleOne(lead._id) : undefined}
                      />
                    ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {filteredLeads.length === 0 && (
          <div className="crm-table-empty">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p>{t('crm.table.empty')}</p>
            {activeFilters > 0 && <p className="crm-table-empty-sub">{t('crm.table.emptyHint')}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeadTable
