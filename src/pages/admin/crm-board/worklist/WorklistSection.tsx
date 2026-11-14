import React, { type ReactNode } from 'react'
import { CrmSectionHead, type CrmTone } from '../../../../components/admin/crm-ui'
import type { AdminUser, Lead, WorklistGroupKey, WorklistThresholds } from '../../../../types/crm.types'
import WorklistRow, { type WorklistRowHandlers } from './WorklistRow'
import type { WorklistFollowUp } from './helpers'

export interface WorklistListProps extends WorklistRowHandlers {
  thresholds: WorklistThresholds
  followUp: WorklistFollowUp
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  busyLeadId: string | null
}

interface WorklistSectionProps extends WorklistListProps {
  group: WorklistGroupKey
  leads: readonly Lead[]
  /** Titre affiché ; une carte sans titre (écrans d'un seul groupe) n'a pas d'en-tête. */
  title?: ReactNode
  tone?: CrmTone
  sub?: ReactNode
  /** Ligne insérée avant la ligne de ce rang (ex. « 10 h 42, maintenant »). */
  marker?: { index: number; node: ReactNode }
  /** Remplace la liste quand elle est vide. */
  empty?: ReactNode
  id?: string
}

/** Une carte de la file : en-tête de groupe avec son compteur, puis ses lignes. */
const WorklistSection: React.FC<WorklistSectionProps> = ({
  group,
  leads,
  title,
  tone,
  sub,
  marker,
  empty,
  id,
  adminsById,
  busyLeadId,
  ...rowProps
}) => (
  <section className="crm-ui-card crm-ui-card--flush" aria-labelledby={title ? id : undefined}>
    {title && <CrmSectionHead id={id} title={title} count={leads.length} tone={tone} sub={sub} level={3} compact />}
    {leads.length === 0 && empty ? (
      empty
    ) : (
      <ul className="crm-ui-list">
        {leads.map((lead, index) => (
          <React.Fragment key={lead._id}>
            {marker?.index === index && marker.node}
            <WorklistRow
              lead={lead}
              group={group}
              assignee={adminsById[lead.assignedTo || '']}
              busy={busyLeadId === lead._id}
              {...rowProps}
            />
          </React.Fragment>
        ))}
        {marker && marker.index >= leads.length && marker.node}
      </ul>
    )}
  </section>
)

export default WorklistSection
