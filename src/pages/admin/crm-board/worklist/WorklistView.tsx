import React from 'react'
import { useI18n } from '../../../../context/I18nContext'
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
  onCall?: (lead: Lead) => void
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
  onCall,
}) => {
  const { t } = useI18n()
  if (loading && !groups) {
    return <div className="admin-loading">{t('crm.worklist.loading')}</div>
  }

  if (!groups) return null

  const filled = WORKLIST_GROUPS.filter((group) => groups[group.key].length > 0)

  if (filled.length === 0) {
    return (
      <div className="crm-worklist-empty">
        <p className="crm-worklist-empty-title">{t('crm.worklist.emptyTitle')}</p>
        <p className="crm-worklist-empty-hint">{t('crm.worklist.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="crm-worklist" aria-busy={loading}>
      {filled.map((group) => (
        <section key={group.key} className={`crm-worklist-group crm-worklist-group-${group.key}`}>
          <header className="crm-worklist-group-header">
            <h3>
              {t(group.labelKey)}
              <span className="crm-worklist-group-count">{groups[group.key].length}</span>
            </h3>
            <span className="crm-worklist-group-hint">{t(group.hintKey)}</span>
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
                onCall={onCall}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default WorklistView
