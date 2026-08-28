import React, { useState } from 'react'
import CustomSelect from '../../../../components/admin/CustomSelect'
import type { AdminUser, Lead, WorklistThresholds } from '../../../../types/crm.types'
import { CRM_STATUSES, getLeadAlerts } from '../constants'
import PostponeMenu from './PostponeMenu'
import LogContactPanel from './LogContactPanel'
import { describeDue, followUpDaysFor, type WorklistFollowUp } from './helpers'

interface WorklistRowProps {
  lead: Lead
  assignee?: AdminUser
  thresholds: WorklistThresholds
  followUp: WorklistFollowUp
  canManageCrm: boolean
  busy: boolean
  /** Les handlers d'action renvoient false si l'appel a échoué : le panneau
   *  reste alors ouvert et la saisie n'est pas perdue. */
  onPatch: (leadId: string, patch: Record<string, unknown>) => Promise<boolean>
  onLogContact: (leadId: string, payload: { nextActionAt: string | null; note: string }) => Promise<boolean>
  onAddNote: (leadId: string, text: string) => Promise<boolean>
  onOpenDetail: (lead: Lead) => void
}

const WorklistRow: React.FC<WorklistRowProps> = ({
  lead,
  assignee,
  thresholds,
  followUp,
  canManageCrm,
  busy,
  onPatch,
  onLogContact,
  onAddNote,
  onOpenDetail,
}) => {
  const [panel, setPanel] = useState<'contact' | 'note' | null>(null)
  const [note, setNote] = useState('')
  const alerts = getLeadAlerts(lead, thresholds)

  return (
    <li className="crm-worklist-row">
      <div className="crm-worklist-row-main">
        <div className="crm-worklist-identity">
          <button type="button" className="crm-worklist-title" onClick={() => onOpenDetail(lead)}>
            {lead.company}
          </button>
          <span className="crm-worklist-meta">
            {lead.contactName || 'Contact non renseigné'}
            {assignee ? ` · ${assignee.name}` : ''}
          </span>
        </div>

        <div className="crm-worklist-signals">
          <span className="crm-worklist-due">{describeDue(lead, thresholds)}</span>
          {alerts.map((alert) => (
            <span
              key={alert.type}
              className="crm-alert-badge"
              style={{ '--alert-color': alert.color } as React.CSSProperties}
            >
              {alert.label}
            </span>
          ))}
        </div>

        {canManageCrm && (
          <div className="crm-worklist-actions">
            <PostponeMenu
              disabled={busy}
              onPostpone={(date) => onPatch(lead._id, { nextActionAt: date.toISOString() })}
            />
            <button
              type="button"
              className="crm-worklist-action primary"
              disabled={busy}
              onClick={() => setPanel((current) => (current === 'contact' ? null : 'contact'))}
            >
              Contacté
            </button>
            <button
              type="button"
              className="crm-worklist-action"
              disabled={busy}
              onClick={() => setPanel((current) => (current === 'note' ? null : 'note'))}
            >
              Note
            </button>
            <CustomSelect
              className="crm-worklist-status"
              value={lead.status}
              onChange={(value) => onPatch(lead._id, { status: value })}
              options={CRM_STATUSES.map((status) => ({ value: status.key, label: status.label }))}
            />
          </div>
        )}
      </div>

      {panel === 'contact' && (
        <LogContactPanel
          followUpDays={followUpDaysFor(lead.status, followUp)}
          saving={busy}
          onCancel={() => setPanel(null)}
          onSubmit={async (payload) => {
            if (await onLogContact(lead._id, payload)) setPanel(null)
          }}
        />
      )}

      {panel === 'note' && (
        <form
          className="crm-worklist-panel"
          onSubmit={async (event) => {
            event.preventDefault()
            const text = note.trim()
            if (!text) return
            if (!(await onAddNote(lead._id, text))) return
            setNote('')
            setPanel(null)
          }}
        >
          <div className="crm-worklist-panel-fields">
            <label className="crm-worklist-panel-note">
              <span>Note</span>
              <input
                type="text"
                className="portal-input"
                autoFocus
                maxLength={2000}
                placeholder="Ce qui s'est dit…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <div className="crm-worklist-panel-actions">
            <button type="button" className="portal-button secondary" onClick={() => setPanel(null)} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="portal-button" disabled={busy || !note.trim()}>
              Ajouter
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

export default WorklistRow
