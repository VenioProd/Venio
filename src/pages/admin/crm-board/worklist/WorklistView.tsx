import React, { useRef } from 'react'
import { Inbox } from 'lucide-react'
import { useI18n } from '../../../../context/I18nContext'
import { CrmEmpty, type CrmTone } from '../../../../components/admin/crm-ui'
import type { AdminUser, Lead, WorklistGroupKey, WorklistGroups, WorklistThresholds } from '../../../../types/crm.types'
import WorklistSection from './WorklistSection'
import { useRowFocus } from './useRowFocus'
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

const GROUP_TONE: Record<WorklistGroupKey, CrmTone> = {
  overdue: 'red',
  today: 'blue',
  upcoming: 'grey',
  drifting: 'amber',
}

/** File de travail complète, groupe par groupe (vue « file » du pipeline). */
const WorklistView: React.FC<WorklistViewProps> = ({ groups, loading, onPatch, onLogContact, onAddNote, ...rest }) => {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const emptyRef = useRef<HTMLDivElement>(null)
  const filled = groups ? WORKLIST_GROUPS.filter((group) => groups[group.key].length > 0) : []
  const rows = filled.flatMap((group) => groups![group.key])
  const { track, announcement } = useRowFocus(rows, containerRef, emptyRef)

  if (loading && !groups) {
    return <div className="admin-loading">{t('crm.worklist.loading')}</div>
  }

  if (!groups) return null

  return (
    <div className="crm-today-stack" aria-busy={loading} ref={containerRef}>
      <p className="crm-ui-sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {filled.length === 0 ? (
        <div ref={emptyRef} tabIndex={-1} className="crm-today-focus-target">
          <CrmEmpty icon={<Inbox />} title={t('crm.worklist.emptyTitle')}>
            {t('crm.worklist.emptyHint')}
          </CrmEmpty>
        </div>
      ) : (
        filled.map((group) => (
          <WorklistSection
            key={group.key}
            id={`crm-worklist-${group.key}`}
            group={group.key}
            title={t(group.labelKey)}
            sub={t(group.hintKey)}
            tone={GROUP_TONE[group.key]}
            leads={groups[group.key]}
            onPatch={(id, patch) => track(id, () => onPatch(id, patch))}
            onLogContact={(id, payload) => track(id, () => onLogContact(id, payload))}
            onAddNote={(id, text) => track(id, () => onAddNote(id, text))}
            {...rest}
          />
        ))
      )}
    </div>
  )
}

export default WorklistView
