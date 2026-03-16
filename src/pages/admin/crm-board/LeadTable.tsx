import React from 'react'
import LeadFilters from './LeadFilters'
import LeadTableRow from './LeadTableRow'
import type { Lead, AdminUser, CrmStatusConfig } from '../../../types/crm.types'

interface LeadTableProps {
  groupedLeads: (CrmStatusConfig & { leads: Lead[] })[]
  filteredLeads: Lead[]
  totalLeads: number
  search: string
  filterStatus: string
  filterPriority: string
  filterAssignee: string
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
  onSearchChange: (value: string) => void
  onFilterStatusChange: (value: string) => void
  onFilterPriorityChange: (value: string) => void
  onFilterAssigneeChange: (value: string) => void
  onClearFilters: () => void
  onToggleSort: (field: string) => void
  onToggleGroup: (statusKey: string) => void
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onDeleteLead: (leadId: string) => Promise<void>
  onSetDeleteConfirm: (id: string | null) => void
  onExpandLead: (lead: Lead) => void
}

const SortIcon = ({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: string }) => {
  if (sortField !== field) return <span className="crm-sort-icon">↕</span>
  return <span className="crm-sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

const LeadTable: React.FC<LeadTableProps> = ({
  groupedLeads,
  filteredLeads,
  totalLeads,
  search,
  filterStatus,
  filterPriority,
  filterAssignee,
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
  onSearchChange,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeChange,
  onClearFilters,
  onToggleSort,
  onToggleGroup,
  onUpdateLead,
  onConvertToClient,
  onDeleteLead,
  onSetDeleteConfirm,
  onExpandLead,
}) => {
  return (
    <div className="crm-table-container">
      <LeadFilters
        search={search}
        filterStatus={filterStatus}
        filterPriority={filterPriority}
        filterAssignee={filterAssignee}
        admins={admins}
        filteredCount={filteredLeads.length}
        totalCount={totalLeads}
        activeFilters={activeFilters}
        isSuperAdmin={isSuperAdmin}
        onSearchChange={onSearchChange}
        onFilterStatusChange={onFilterStatusChange}
        onFilterPriorityChange={onFilterPriorityChange}
        onFilterAssigneeChange={onFilterAssigneeChange}
        onClearFilters={onClearFilters}
      />

      {/* Grouped Table */}
      <div className="crm-table-scroll">
        <table className="crm-table">
          <thead>
            <tr>
              <th className="crm-th crm-th-company" onClick={() => onToggleSort('company')}>
                Entreprise <SortIcon field="company" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-contact" onClick={() => onToggleSort('contactName')}>
                Contact <SortIcon field="contactName" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-email">Email</th>
              <th className="crm-th crm-th-phone">Téléphone</th>
              <th className="crm-th crm-th-source" onClick={() => onToggleSort('source')}>
                Source <SortIcon field="source" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-priority" onClick={() => onToggleSort('priority')}>
                Priorité <SortIcon field="priority" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-budget" onClick={() => onToggleSort('budget')}>
                Budget <SortIcon field="budget" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-service">Service</th>
              <th className="crm-th crm-th-temperature" onClick={() => onToggleSort('leadTemperature')}>
                Chaleur <SortIcon field="leadTemperature" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-assignee">Commercial</th>
              <th className="crm-th crm-th-date" onClick={() => onToggleSort('nextActionAt')}>
                Prochaine action <SortIcon field="nextActionAt" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="crm-th crm-th-date" onClick={() => onToggleSort('updatedAt')}>
                Mis à jour <SortIcon field="updatedAt" sortField={sortField} sortDir={sortDir} />
              </th>
              {canManageCrm && <th className="crm-th crm-th-actions"></th>}
            </tr>
          </thead>
          <tbody>
            {groupedLeads.map((group) => {
              const isCollapsed = collapsedGroups[group.key]
              return (
                <React.Fragment key={group.key}>
                  {/* Group header row */}
                  <tr className="crm-group-row" onClick={() => onToggleGroup(group.key)}>
                    <td colSpan={canManageCrm ? 13 : 12}>
                      <div className="crm-group-header" style={{ '--group-color': group.color } as React.CSSProperties}>
                        <span className={`crm-group-chevron ${isCollapsed ? '' : 'open'}`}>▶</span>
                        <span className="crm-group-color-bar" style={{ background: group.color }} />
                        <span className="crm-group-label">{group.label}</span>
                        <span className="crm-group-count">{group.leads.length} lead{group.leads.length !== 1 ? 's' : ''}</span>
                      </div>
                    </td>
                  </tr>
                  {/* Lead rows */}
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
                      />
                    ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {filteredLeads.length === 0 && (
          <div className="crm-table-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p>Aucun lead trouvé</p>
            {activeFilters > 0 && <p className="crm-table-empty-sub">Essayez de modifier vos filtres</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeadTable
