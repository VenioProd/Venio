import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import InteractionTimeline from '../../../components/admin/InteractionTimeline'
import RevenueChain from '../../../components/admin/RevenueChain'
import LeadEnrichedPanel from './rich/LeadEnrichedPanel'
import DuplicatesBanner from './DuplicatesBanner'
import MergeLeadDialog from './MergeLeadDialog'
import LeadPrivacyPanel from './LeadPrivacyPanel'
import LeadSequencesPanel from './sequences/LeadSequencesPanel'
import { fromDateTimeLocal, toDateTimeLocal } from '../../../lib/formatUtils'
import type { Lead, AdminUser } from '../../../types/crm.types'
import {
  CRM_ENTITIES,
  CRM_STATUSES,
  CRM_TEMPERATURES,
  ENTITY_MAP,
  leadEntity,
  PROJECT_MAP,
  SERVICE_TYPE_LABEL_KEYS,
  TEMPERATURE_MAP,
  labelOfValue,
} from './constants'

interface LeadDetailModalProps {
  lead: Lead
  admins: AdminUser[]
  canManageCrm: boolean
  converting: string | null
  onClose: () => void
  onLeadChange: (updater: (prev: Lead | null) => Lead | null) => void
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  /** Autres leads connus du tableau, proposés comme cible d'une fusion. */
  mergeCandidates?: Lead[]
  /** Appelé après une fusion réussie : le lead de la fiche n'existe plus. */
  onMerged?: (target: { _id: string; company: string }) => void
}

const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  lead,
  admins,
  canManageCrm,
  converting,
  onClose,
  onLeadChange,
  onUpdateLead,
  onConvertToClient,
  mergeCandidates = [],
  onMerged,
}) => {
  const { t } = useI18n()
  const [merging, setMerging] = useState(false)
  const [notice, setNotice] = useState('')
  const timelineRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = drawerRef.current
    panel?.focus()
    const handleKey = (event: KeyboardEvent) => {
      const activeDialog = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]')
      if (activeDialog && !panel?.contains(activeDialog)) return
      const focusPanel = panel?.querySelector<HTMLElement>('[role="dialog"]') ?? panel
      if (event.key === 'Escape') {
        if (focusPanel === panel) closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !focusPanel) return
      const controls = Array.from(
        focusPanel.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === focusPanel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === focusPanel)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previous?.focus()
    }
  }, [])
  return createPortal(
    <div className="crm-modal-overlay crm-detail-overlay" onClick={onClose}>
      <div
        className="crm-modal crm-detail-drawer"
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-detail-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crm-modal-header">
          <h2 id="crm-detail-title">{t('crm.detail.title', { company: lead.company })}</h2>
          <button aria-label={t('common.close')} className="crm-modal-close" onClick={onClose}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="crm-modal-body">
          <div className="crm-modal-notes" ref={timelineRef} tabIndex={-1}>
            <label className="crm-modal-label">{t('crm.detail.interactionLog')}</label>
            <InteractionTimeline
              subjectType="LEAD"
              subjectId={lead._id}
              canWrite={canManageCrm}
              legacyNote={lead.interactionNotes || undefined}
            />
          </div>

          <div className="crm-modal-info">
            <p>
              <strong>{t('crm.detail.contact')}</strong> {lead.contactName || '—'}
            </p>
            <p>
              <strong>{t('crm.detail.email')}</strong> {lead.contactEmail || '—'}
            </p>
            <p>
              <strong>{t('crm.detail.phone')}</strong> {lead.contactPhone || '—'}
            </p>
            <p>
              <strong>{t('crm.detail.service')}</strong>{' '}
              {labelOfValue(t, SERVICE_TYPE_LABEL_KEYS, lead.serviceType) || '—'}
            </p>
            {lead.project !== leadEntity(lead) && (
              <p>
                <strong>{t('crm.detail.project')}</strong>{' '}
                {PROJECT_MAP[lead.project || ''] ? (
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 'var(--r-pill)',
                      fontSize: 12,
                      fontWeight: 600,
                      color: PROJECT_MAP[lead.project || ''].color,
                      background: `color-mix(in srgb, ${PROJECT_MAP[lead.project || ''].color} 12%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${PROJECT_MAP[lead.project || ''].color} 30%, transparent)`,
                    }}
                  >
                    {t(PROJECT_MAP[lead.project || ''].labelKey)}
                  </span>
                ) : (
                  '—'
                )}
              </p>
            )}
            <p>
              <strong>{t('crm.detail.entity')}</strong> {t(ENTITY_MAP[leadEntity(lead)]!.labelKey)}
            </p>
            <p>
              <strong>{t('crm.detail.temperature')}</strong>{' '}
              {TEMPERATURE_MAP[lead.leadTemperature || '']
                ? t(TEMPERATURE_MAP[lead.leadTemperature || ''].labelKey)
                : lead.leadTemperature}
            </p>
          </div>

          {/* Actions rapides : contact */}
          <div className="crm-modal-quick-actions">
            <span className="crm-modal-quick-label">{t('crm.detail.quickContact')}</span>
            <div className="crm-modal-quick-btns">
              {lead.contactEmail && (
                <button
                  type="button"
                  className="portal-button secondary crm-modal-quick-btn"
                  onClick={() => {
                    const composer =
                      timelineRef.current?.querySelector<HTMLElement>('.interaction-email-composer') ??
                      timelineRef.current
                    composer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                    const control = composer?.querySelector<HTMLElement>('input, textarea, button') ?? composer
                    control?.focus({ preventScroll: true })
                  }}
                >
                  {t('crm.detail.sendEmail')}
                </button>
              )}
              {lead.contactPhone && (
                <a
                  href={`tel:${lead.contactPhone.replace(/\s/g, '')}`}
                  className="portal-button secondary crm-modal-quick-btn"
                >
                  {t('crm.detail.call')}
                </a>
              )}
              <button
                type="button"
                className="portal-button secondary crm-modal-quick-btn"
                onClick={() => {
                  const text = [
                    lead.contactName && `${t('crm.detail.copyContact')} ${lead.contactName}`,
                    lead.contactEmail && `${t('crm.detail.copyEmail')} ${lead.contactEmail}`,
                    lead.contactPhone && `${t('crm.detail.copyPhone')} ${lead.contactPhone}`,
                    lead.company && `${t('crm.detail.copyCompany')} ${lead.company}`,
                  ]
                    .filter(Boolean)
                    .join('\n')
                  if (text) {
                    navigator.clipboard
                      .writeText(text)
                      .then(() => setNotice(t('crm.detail.copied')))
                      .catch(() => setNotice(t('crm.detail.copyFailed')))
                  }
                }}
              >
                {t('crm.detail.copyInfo')}
              </button>
            </div>
          </div>

          {notice && (
            <p className="rich-notice" role="status">
              {notice}
              <button type="button" onClick={() => setNotice('')} aria-label={t('common.close')}>
                ×
              </button>
            </p>
          )}

          <div className="crm-detail-duplicates">
            <DuplicatesBanner
              company={lead.company}
              contactEmail={lead.contactEmail}
              contactPhone={lead.contactPhone}
              excludeId={lead._id}
              onMerge={canManageCrm && onMerged ? () => setMerging(true) : undefined}
            />
          </div>

          {/* Actions rapides : statut, chaleur, assignation, prochaine action */}
          {canManageCrm && (
            <div className="crm-modal-quick-actions crm-modal-quick-fields">
              <span className="crm-modal-quick-label">{t('crm.detail.editLead')}</span>
              <div className="crm-modal-quick-grid">
                <div className="crm-modal-quick-field">
                  <label>{t('crm.detail.status')}</label>
                  <CustomSelect
                    value={lead.status || 'LEAD'}
                    onChange={(v) => {
                      onUpdateLead(lead._id, { status: v })
                    }}
                    options={CRM_STATUSES.map((s) => ({ value: s.key, label: t(s.labelKey) }))}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>{t('crm.col.entity')}</label>
                  <CustomSelect
                    value={leadEntity(lead)}
                    onChange={(v) => {
                      onUpdateLead(lead._id, { entity: v })
                    }}
                    options={CRM_ENTITIES.map((e) => ({ value: e.key, label: t(e.labelKey) }))}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>{t('crm.col.temperature')}</label>
                  <CustomSelect
                    value={lead.leadTemperature || 'TIEDE'}
                    onChange={(v) => {
                      onUpdateLead(lead._id, { leadTemperature: v })
                    }}
                    options={CRM_TEMPERATURES.map((tp) => ({ value: tp.key, label: t(tp.labelKey) }))}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>{t('crm.detail.assignedTo')}</label>
                  <CustomSelect
                    value={lead.assignedTo || ''}
                    onChange={(v) => {
                      const val = v || null
                      onUpdateLead(lead._id, { assignedTo: val })
                    }}
                    options={[
                      { value: '', label: t('crm.common.unassigned') },
                      ...admins
                        .filter((a) => ['SUPER_ADMIN', 'ADMIN'].includes(a.role))
                        .map((admin) => ({ value: admin._id, label: admin.name })),
                    ]}
                  />
                </div>
                <div className="crm-modal-quick-field">
                  <label>{t('crm.col.nextAction')}</label>
                  <input
                    type="datetime-local"
                    className="portal-input"
                    value={toDateTimeLocal(lead.nextActionAt) || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onLeadChange((prev) =>
                        prev
                          ? { ...prev, nextActionAt: e.target.value ? fromDateTimeLocal(e.target.value) : null }
                          : prev,
                      )
                    }
                    onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                      const raw = e.target.value
                      const iso = raw ? fromDateTimeLocal(raw) : null
                      onUpdateLead(lead._id, { nextActionAt: iso })
                    }}
                  />
                </div>
              </div>
              <div className="crm-modal-quick-btns" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={async () => {
                    const now = new Date().toISOString()
                    const isEarlyStage = lead.status === 'LEAD' || lead.status === 'QUALIFIED'
                    await onUpdateLead(lead._id, {
                      lastContactAt: now,
                      ...(isEarlyStage ? { status: 'CONTACTED' } : {}),
                    })
                  }}
                >
                  {t('crm.detail.markContacted')}
                </button>
              </div>
            </div>
          )}

          {/* Convertir en client (si WON) */}
          {lead.status === 'WON' && (
            <div className="crm-modal-quick-actions">
              {lead.clientAccountId ? (
                <Link
                  to={`/admin/comptes-clients/${lead.clientAccountId}`}
                  className="portal-button"

                  onClick={onClose}
                >
                  {t('crm.detail.viewClient')}
                </Link>
              ) : (
                <button
                  type="button"
                  className="portal-button"

                  disabled={converting === lead._id}
                  onClick={async () => {
                    await onConvertToClient(lead)
                    onClose()
                  }}
                >
                  {converting === lead._id ? t('crm.common.converting') : t('crm.detail.convert')}
                </button>
              )}
            </div>
          )}

          {/* Le champ libre `interactionNotes` est remplacé par le journal des
              échanges. Son contenu déjà saisi reste affiché en tête de
              timeline pour ne pas disparaître de l'écran. */}
          <LeadEnrichedPanel
            lead={lead}
            canManageCrm={canManageCrm}
            onUpdateLead={onUpdateLead}
            onLocalChange={(patch) => onLeadChange((prev) => (prev ? { ...prev, ...patch } : prev))}
          />

          <LeadPrivacyPanel
            lead={lead}
            canManageCrm={canManageCrm}
            onUpdateLead={onUpdateLead}
            onLocalChange={(patch) => onLeadChange((prev) => (prev ? { ...prev, ...patch } : prev))}
          />

          <LeadSequencesPanel leadId={lead._id} canManageCrm={canManageCrm} />

          <div className="crm-modal-notes">
            <label className="crm-modal-label">{t('crm.detail.revenueChain')}</label>
            <RevenueChain leadId={lead._id} canManage={canManageCrm} />
          </div>

          {merging && (
            <MergeLeadDialog
              lead={lead}
              candidates={mergeCandidates}
              onCancel={() => setMerging(false)}
              onMerged={(target) => {
                setMerging(false)
                onMerged?.(target)
              }}
            />
          )}
        </div>
        <div className="crm-modal-actions">
          {canManageCrm && onMerged && (
            <button type="button" className="portal-button secondary" onClick={() => setMerging(true)}>
              {t('crm.merge.open')}
            </button>
          )}
          <button className="portal-button secondary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default LeadDetailModal
