import React from 'react'
import type { AdminUser, Lead, WorklistGroups, WorklistThresholds } from '../../../../types/crm.types'
import WorklistRow from './WorklistRow'
import { WORKLIST_GROUPS, type WorklistFollowUp } from './helpers'

interface WorklistViewProps {
  groups: WorklistGroups | null
  thresholds: WorklistThresholds
  followUp: WorklistFollowUp
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  loading: boolean
  busyLeadId: string | null
  onPatch: (leadId: string, patch: Record<string, unknown>) => Promise<boolean>
  onLogContact: (leadId: string, payload: { nextActionAt: string | null; note: string }) => Promise<boolean>
  onAddNote: (leadId: string, text: string) => Promise<boolean>
  onOpenDetail: (lead: Lead) => void
}

const WorklistView: React.FC<WorklistViewProps> = ({
  groups,
  thresholds,
  followUp,
  adminsById,
  canManageCrm,
  loading,
  busyLeadId,
  onPatch,
  onLogContact,
  onAddNote,
  onOpenDetail,
}) => {
  if (loading && !groups) {
    return <div className="admin-loading">Chargement de votre file…</div>
  }

  if (!groups) return null

  const filled = WORKLIST_GROUPS.filter((group) => groups[group.key].length > 0)

  if (filled.length === 0) {
    return (
      <div className="crm-worklist-empty">
        <p className="crm-worklist-empty-title">Rien ne vous attend</p>
        <p className="crm-worklist-empty-hint">
          Aucune relance due, aucun lead en train de refroidir. Les leads sans prochaine action n'apparaissent pas ici —
          retrouvez-les dans les vues Tableau et Kanban.
        </p>
      </div>
    )
  }

  return (
    <div className="crm-worklist" aria-busy={loading}>
      {filled.map((group) => (
        <section key={group.key} className={`crm-worklist-group crm-worklist-group-${group.key}`}>
          <header className="crm-worklist-group-header">
            <h3>
              {group.label}
              <span className="crm-worklist-group-count">{groups[group.key].length}</span>
            </h3>
            <span className="crm-worklist-group-hint">{group.hint}</span>
          </header>
          <ul className="crm-worklist-rows">
            {groups[group.key].map((lead) => (
              <WorklistRow
                key={lead._id}
                lead={lead}
                assignee={adminsById[lead.assignedTo || '']}
                thresholds={thresholds}
                followUp={followUp}
                canManageCrm={canManageCrm}
                busy={busyLeadId === lead._id}
                onPatch={onPatch}
                onLogContact={onLogContact}
                onAddNote={onAddNote}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default WorklistView
