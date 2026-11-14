import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, NotebookPen, Phone } from 'lucide-react'
import { useI18n } from '../../../../context/I18nContext'
import { CrmChip, type CrmTone } from '../../../../components/admin/crm-ui'
import type { AdminUser, Lead, WorklistGroupKey, WorklistThresholds } from '../../../../types/crm.types'
import { CRM_STATUSES, PRIORITY_MAP, getLeadAlerts } from '../constants'
import PostponeMenu from './PostponeMenu'
import LogContactPanel from './LogContactPanel'
import { ROW_TITLE_ATTR } from './useRowFocus'
import { calendarDaysAgo, describeDue, followUpDaysFor, leadCellLabel, type WorklistFollowUp } from './helpers'
import '../../crm-today/crm-today.css'

/** Actions d'une ligne, communes à la file et à l'écran « Aujourd'hui ». */
export interface WorklistRowHandlers {
  /** Les handlers d'action renvoient false si l'appel a échoué : le panneau
   *  reste alors ouvert et la saisie n'est pas perdue. */
  onPatch: (leadId: string, patch: Record<string, unknown>) => Promise<boolean>
  onLogContact: (leadId: string, payload: { nextActionAt: string | null; note: string }) => Promise<boolean>
  onAddNote: (leadId: string, text: string) => Promise<boolean>
  onOpenDetail: (lead: Lead) => void
  /** Ouvre la fiche prête à appeler (la barre d'appel a le focus ; rien n'est composé). */
  onCall?: (lead: Lead) => void
  /** Adresse de la fiche : le nom devient un vrai lien (ouvrable dans un onglet). Sans elle, un bouton. */
  detailHref?: (lead: Lead) => string
}

interface WorklistRowProps extends WorklistRowHandlers {
  lead: Lead
  /** Groupe de la file : décide de la colonne de gauche (retard, heure, jour, montant). */
  group?: WorklistGroupKey
  assignee?: AdminUser
  thresholds: WorklistThresholds
  followUp: WorklistFollowUp
  canManageCrm: boolean
  busy: boolean
}

const STATUS_TONE: Record<string, CrmTone> = {
  LEAD: 'grey',
  QUALIFIED: 'blue',
  CONTACTED: 'green',
  DEMO: 'amber',
  PROPOSAL: 'orange',
}

const WorklistRow: React.FC<WorklistRowProps> = ({
  lead,
  group,
  assignee,
  thresholds,
  followUp,
  canManageCrm,
  busy,
  onPatch,
  onLogContact,
  onAddNote,
  onOpenDetail,
  onCall,
  detailHref,
}) => {
  const { t } = useI18n()
  const [panel, setPanel] = useState<'contact' | 'note' | null>(null)
  const [note, setNote] = useState('')
  const company = lead.company
  const alerts = getLeadAlerts(lead, thresholds).filter((alert) => alert.type !== 'overdue')
  const late = group === 'overdue' || (!group && getLeadAlerts(lead, thresholds).some((a) => a.type === 'overdue'))
  const priority = lead.priority === 'URGENTE' || lead.priority === 'HAUTE' ? PRIORITY_MAP[lead.priority] : null
  const status = CRM_STATUSES.find((item) => item.key === lead.status)
  const cell = group ? leadCellLabel(lead, group) : ''
  const titleProps = { [ROW_TITLE_ATTR]: lead._id, className: 'crm-today-row__name' }
  const href = detailHref?.(lead)

  return (
    <li className="crm-ui-row crm-today-row" data-group={group}>
      <span className="crm-ui-row__lead">{cell}</span>
      <div className="crm-ui-row__main">
        <div className="crm-ui-row__title">
          {href ? (
            <Link
              {...titleProps}
              to={href}
              onClick={(event) => {
                // Clic simple : la fiche s'ouvre en gardant la position de la liste ; les autres clics suivent le lien.
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                event.preventDefault()
                onOpenDetail(lead)
              }}
            >
              {company}
            </Link>
          ) : (
            <button type="button" {...titleProps} onClick={() => onOpenDetail(lead)}>
              {company}
            </button>
          )}
          <span className="crm-ui-row__meta">
            {lead.contactName || t('crm.card.contactMissing')}
            {assignee ? ` · ${assignee.name}` : ''}
          </span>
          {late && lead.nextActionAt && (
            <CrmChip tone="red">{t('crmToday.chip.late', { days: calendarDaysAgo(lead.nextActionAt) })}</CrmChip>
          )}
          {priority && (
            <CrmChip tone={lead.priority === 'URGENTE' ? 'red' : 'orange'}>
              {t('crmToday.chip.priority', { label: t(priority.labelKey).toLocaleLowerCase() })}
            </CrmChip>
          )}
          {lead.callHold && <CrmChip tone="red">{t('crmToday.chip.hold')}</CrmChip>}
          {alerts.map((alert) => (
            <CrmChip key={alert.type} tone={alert.type === 'stale' ? 'amber' : 'grey'}>
              {alert.label}
            </CrmChip>
          ))}
          {!canManageCrm && status && (
            <CrmChip tone={STATUS_TONE[lead.status] ?? 'grey'} dot>
              {t(status.labelKey)}
            </CrmChip>
          )}
        </div>
        <div className="crm-ui-row__desc">{lead.nextActionLabel || describeDue(lead, thresholds)}</div>
      </div>

      {canManageCrm && (
        <div className="crm-ui-row__actions">
          {onCall && lead.contactPhone && !lead.callHold && (
            <button
              type="button"
              className="crm-ui-btn crm-ui-btn--soft crm-ui-btn--sm"
              disabled={busy}
              aria-label={t('crm.worklist.callAria', { company })}
              onClick={() => onCall(lead)}
            >
              <Phone aria-hidden="true" />
              {t('crm.worklist.call')}
            </button>
          )}
          <button
            type="button"
            className="crm-ui-btn crm-ui-btn--sm"
            disabled={busy}
            aria-label={t('crmToday.action.doneAria', { company })}
            aria-expanded={panel === 'contact'}
            onClick={() => setPanel((current) => (current === 'contact' ? null : 'contact'))}
          >
            <Check aria-hidden="true" />
            {t('crmToday.action.done')}
          </button>
          <button
            type="button"
            className="crm-ui-btn crm-ui-btn--ghost crm-ui-btn--sm"
            disabled={busy}
            aria-label={t('crmToday.action.noteAria', { company })}
            aria-expanded={panel === 'note'}
            onClick={() => setPanel((current) => (current === 'note' ? null : 'note'))}
          >
            <NotebookPen aria-hidden="true" />
            {t('crm.worklist.note')}
          </button>
          <PostponeMenu
            disabled={busy}
            ariaLabel={t('crmToday.action.postponeAria', { company })}
            onPostpone={(date) => onPatch(lead._id, { nextActionAt: date.toISOString() })}
          />
          <select
            className="crm-today-status"
            aria-label={t('crmToday.action.status', { company })}
            value={lead.status}
            disabled={busy}
            onChange={(event) => onPatch(lead._id, { status: event.target.value })}
          >
            {CRM_STATUSES.map((item) => (
              <option key={item.key} value={item.key}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
        </div>
      )}

      {panel === 'contact' && (
        <div className="crm-today-row__panel">
          <LogContactPanel
            followUpDays={followUpDaysFor(lead.status, followUp)}
            saving={busy}
            label={t('crmToday.contactPanel', { company })}
            onCancel={() => setPanel(null)}
            onSubmit={async (payload) => {
              if (await onLogContact(lead._id, payload)) setPanel(null)
            }}
          />
        </div>
      )}

      {panel === 'note' && (
        <div className="crm-today-row__panel">
          <form
            className="crm-today-panel"
            aria-label={t('crmToday.notePanel', { company })}
            onSubmit={async (event) => {
              event.preventDefault()
              const text = note.trim()
              if (!text) return
              if (!(await onAddNote(lead._id, text))) return
              setNote('')
              setPanel(null)
            }}
          >
            <div className="crm-today-panel__fields">
              <label className="crm-today-panel__grow">
                <span>{t('crm.worklist.note')}</span>
                <input
                  type="text"
                  className="portal-input"
                  autoFocus
                  maxLength={2000}
                  placeholder={t('crm.logContact.notePlaceholder')}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
            <div className="crm-today-panel__actions">
              <button
                type="button"
                className="crm-ui-btn crm-ui-btn--ghost"
                onClick={() => setPanel(null)}
                disabled={busy}
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="crm-ui-btn crm-ui-btn--primary" disabled={busy || !note.trim()}>
                {t('common.add')}
              </button>
            </div>
          </form>
        </div>
      )}
    </li>
  )
}

export default WorklistRow
