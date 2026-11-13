import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmModal from '../../../components/ConfirmModal'
import './crm.css'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import LeadCallsList from '../../../components/calls/LeadCallsList'
import { useLeadCalls } from '../../../components/calls/leadCalls'
import LeadCallBar from './LeadCallBar'
import { TEAM_CALL_DESK_PREFIX } from './teamDeskApi'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'
import InteractionTimeline from '../../../components/admin/InteractionTimeline'
import RevenueChain from '../../../components/admin/RevenueChain'
import LeadEnrichedPanel from './rich/LeadEnrichedPanel'
import DuplicatesBanner from './DuplicatesBanner'
import MergeLeadDialog from './MergeLeadDialog'
import LeadPrivacyPanel from './LeadPrivacyPanel'
import LeadSequencesPanel from './sequences/LeadSequencesPanel'
import { formatDateTime } from '../../../i18n/format'
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

interface LeadDetailPageProps {
  lead: Lead
  admins: AdminUser[]
  canManageCrm: boolean
  converting: string | null
  onClose: () => void
  onLeadChange: (updater: (prev: Lead | null) => Lead | null) => void
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  onConvertToClient: (lead: Lead) => void
  onDeleteLead?: (id: string) => Promise<void>
  /** Autres leads connus du tableau, proposés comme cible d'une fusion. */
  mergeCandidates?: Lead[]
  /** Appelé après une fusion réussie : le lead de la fiche n'existe plus. */
  onMerged?: (target: { _id: string; company: string }) => void
  /** Fiche ouverte depuis le bouton d'appel de la file de travail : l'appel est mis à portée de clavier. */
  focusCall?: boolean
}

const LeadDetailPage: React.FC<LeadDetailPageProps> = ({
  lead,
  admins,
  canManageCrm,
  converting,
  onClose,
  onLeadChange,
  onUpdateLead,
  onConvertToClient,
  onDeleteLead,
  mergeCandidates = [],
  onMerged,
  focusCall = false,
}) => {
  const { t } = useI18n()
  const [merging, setMerging] = useState(false)
  const [notice, setNotice] = useState('')
  const timelineRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState('details')
  const [more, setMore] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  // Relit les appels après un appel passé ici ; relit la fiche quand une analyse l'a modifiée.
  const [callsRefresh, setCallsRefresh] = useState(0)
  const [openCall, setOpenCall] = useState<{ callId: string; nonce: number } | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<React.CSSProperties>({})
  const tabs = [
    ['details', 'crm.detail.details'],
    ['revenue', 'crm.detail.revenueChain'],
    ['calls', 'crm.detail.calls'],
    ['sequences', 'crm.detail.sequences'],
    ['privacy', 'crm.detail.privacy'],
  ] as const
  useEffect(() => {
    if (!more) return
    const position = () => {
      const rect = moreRef.current?.getBoundingClientRect()
      if (rect)
        setMenuPos({ position: 'fixed', top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
    }
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !moreRef.current?.contains(event.target as Node))
        setMore(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMore(false)
        moreRef.current?.focus()
      }
    }
    position()
    menuRef.current?.querySelector('button')?.focus()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
    }
  }, [more])
  const reloadLead = () => {
    apiFetch<{ lead: Lead }>(`/api/admin/crm/leads/${lead._id}`)
      .then((data) => onLeadChange(() => data.lead))
      .catch(() => undefined)
  }
  // Les appels sont surveillés ici, quel que soit l'onglet : l'analyse arrive après la fin de l'appel et peut poser
  // une retenue. Relue au même rythme que la liste (6 à 30 s, seulement tant qu'un appel attend), pas en boucle.
  const leadCalls = useLeadCalls(lead._id, TEAM_CALL_DESK_PREFIX, callsRefresh)
  const analysisSeen = useRef<{ leadId: string; statuses: Map<string, string | null> } | null>(null)
  useEffect(() => {
    if (leadCalls.loading || leadCalls.error) return
    // Première lecture de cette fiche : on prend l'état de départ, la fiche vient d'être chargée avec lui.
    const previous = analysisSeen.current?.leadId === lead._id ? analysisSeen.current.statuses : null
    const statuses = new Map(leadCalls.calls.map((call) => [call._id, call.analysisStatus]))
    analysisSeen.current = { leadId: lead._id, statuses }
    if (!previous) return
    const arrived = leadCalls.calls.some(
      (call) =>
        previous.get(call._id) !== call.analysisStatus &&
        (call.analysisStatus === 'READY' || call.analysisStatus === 'APPLIED' || call.analysisStatus === 'PARTIAL'),
    )
    if (arrived) reloadLead()
    // reloadLead ne dépend que de la fiche, déjà dans les dépendances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadCalls.calls, leadCalls.loading, leadCalls.error, lead._id])
  const focusComposer = (email: boolean) => {
    const timeline = timelineRef.current
    if (email && !timeline?.querySelector('.interaction-email-composer'))
      timeline?.querySelector<HTMLButtonElement>('.interaction-toolbar button')?.click()
    requestAnimationFrame(() => {
      const composer =
        timeline?.querySelector<HTMLElement>(email ? '.interaction-email-composer' : '.interaction-composer') ??
        timeline
      composer?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      composer?.querySelector<HTMLElement>('textarea, input, button')?.focus({ preventScroll: true })
    })
  }
  return (
    <section className="crm-detail-page" aria-labelledby="crm-detail-title">
      <header className="crm-detail-header">
        <button type="button" className="portal-button secondary" onClick={onClose}>
          {t('crm.detail.back')}
        </button>
        <h1 id="crm-detail-title">{lead.company}</h1>
        <div className="crm-detail-summary">
          <span>{t(CRM_STATUSES.find((status) => status.key === lead.status)?.labelKey || 'crm.status.lead')}</span>
          <span>{admins.find((admin) => admin._id === lead.assignedTo)?.name || t('crm.common.unassigned')}</span>
          <fieldset className="crm-detail-next-action">
            <legend>{t('crm.col.nextAction')}</legend>
            {canManageCrm ? (
              <>
                <input
                  className="portal-input"
                  aria-label={t('crm.detail.nextActionLabel')}
                  key={`${lead._id}:${lead.nextActionLabel ?? ''}`}
                  defaultValue={lead.nextActionLabel ?? ''}
                  maxLength={200}
                  onBlur={(event) => {
                    if (event.target.value !== (lead.nextActionLabel ?? ''))
                      void onUpdateLead(lead._id, { nextActionLabel: event.target.value })
                  }}
                />
                <input
                  type="datetime-local"
                  className="portal-input"
                  aria-label={t('crm.detail.nextActionDate')}
                  value={toDateTimeLocal(lead.nextActionAt) || ''}
                  onChange={(event) =>
                    onLeadChange((prev) =>
                      prev
                        ? { ...prev, nextActionAt: event.target.value ? fromDateTimeLocal(event.target.value) : null }
                        : prev,
                    )
                  }
                  onBlur={(event) =>
                    void onUpdateLead(lead._id, {
                      nextActionAt: event.target.value ? fromDateTimeLocal(event.target.value) : null,
                    })
                  }
                />
              </>
            ) : (
              <span>
                {lead.nextActionLabel || '—'} · {lead.nextActionAt ? formatDateTime(lead.nextActionAt) : '—'}
              </span>
            )}
          </fieldset>
        </div>
        {canManageCrm && (
          <div className="crm-detail-actions">
            <button type="button" className="portal-button" onClick={() => focusComposer(true)}>
              {t('crm.detail.write')}
            </button>
            <button type="button" className="portal-button secondary" onClick={() => focusComposer(false)}>
              {t('crm.detail.log')}
            </button>
            {onMerged && (
              <button type="button" className="portal-button secondary" onClick={() => setMerging(true)}>
                {t('crm.merge.open')}
              </button>
            )}
            <button
              type="button"
              ref={moreRef}
              className="portal-button secondary"
              aria-label={t('crm.detail.more')}
              aria-expanded={more}
              aria-controls={more ? 'crm-detail-more' : undefined}
              onClick={() => setMore(!more)}
            >
              …
            </button>
          </div>
        )}
      </header>
      <div className="crm-detail-layout">
        <div className="crm-detail-fields">
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
                  onClick={() => focusComposer(true)}
                >
                  {t('crm.detail.sendEmail')}
                </button>
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
            {canManageCrm && lead.contactPhone && (
              <LeadCallBar
                lead={lead}
                focusOnReady={focusCall}
                onSettled={() => setCallsRefresh((value) => value + 1)}
              />
            )}
          </div>

          {lead.callHold && (
            <p className="crm-detail-hold" role="status">
              <strong>{t('commercial.hold.title')}</strong> {t('commercial.hold.bodyTeam')}{' '}
              <button
                type="button"
                className="crm-detail-hold-link"
                onClick={() => {
                  setTab('calls')
                  if (lead.callHold?.call) setOpenCall({ callId: lead.callHold.call, nonce: Date.now() })
                }}
              >
                {t('crm.detail.holdOpen')}
              </button>
            </p>
          )}

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

          <div className="crm-detail-tabs" role="tablist" aria-label={t('crm.detail.sections')}>
            {tabs.map(([key, label], index) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`crm-tab-${key}`}
                aria-controls={`crm-panel-${key}`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const next =
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                  setTab(tabs[next][0])
                  document.getElementById(`crm-tab-${tabs[next][0]}`)?.focus()
                }}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`crm-panel-${tab}`} aria-labelledby={`crm-tab-${tab}`}>
            {tab === 'details' && (
              <LeadEnrichedPanel
                lead={lead}
                canManageCrm={canManageCrm}
                onUpdateLead={onUpdateLead}
                onLocalChange={(patch) => onLeadChange((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            )}
            {tab === 'privacy' && (
              <LeadPrivacyPanel
                lead={lead}
                canManageCrm={canManageCrm}
                onUpdateLead={onUpdateLead}
                onLocalChange={(patch) => onLeadChange((prev) => (prev ? { ...prev, ...patch } : prev))}
              />
            )}
            {tab === 'calls' && (
              <LeadCallsList
                leadId={lead._id}
                apiPrefix={TEAM_CALL_DESK_PREFIX}
                refreshKey={callsRefresh}
                readOnly={!canManageCrm}
                canLiftHold={canManageCrm}
                onApplied={reloadLead}
                holdCallId={lead.callHold?.call ?? null}
                openRequest={openCall}
                source={leadCalls}
              />
            )}
            {tab === 'sequences' && <LeadSequencesPanel leadId={lead._id} canManageCrm={canManageCrm} />}
            {tab === 'revenue' && <RevenueChain leadId={lead._id} canManage={canManageCrm} />}
          </div>
        </div>
        <aside
          className="crm-detail-journal"
          ref={timelineRef}
          tabIndex={-1}
          aria-label={t('crm.detail.interactionLog')}
        >
          <h2>{t('crm.detail.interactionLog')}</h2>
          <InteractionTimeline
            subjectType="LEAD"
            subjectId={lead._id}
            canWrite={canManageCrm}
            legacyNote={lead.interactionNotes || undefined}
          />
        </aside>
      </div>
      {more &&
        createPortal(
          <div ref={menuRef} id="crm-detail-more" className="crm-detail-menu" style={menuPos}>
            <button
              type="button"
              className="portal-button secondary"
              onClick={() => {
                setMore(false)
                setConfirm('archive')
              }}
            >
              {t(lead.archivedAt ? 'crmRich.bulk.restore' : 'crmRich.bulk.archive')}
            </button>
            {onDeleteLead && (
              <button
                type="button"
                className="portal-button secondary"
                onClick={() => {
                  setMore(false)
                  setConfirm('delete')
                }}
              >
                {t('crmRich.bulk.delete')}
              </button>
            )}
          </div>,
          document.body,
        )}
      {createPortal(
        <ConfirmModal
          isOpen={confirm !== null}
          title={t(
            confirm === 'delete'
              ? 'crmRich.bulk.delete'
              : lead.archivedAt
                ? 'crmRich.bulk.restore'
                : 'crmRich.bulk.archive',
          )}
          message={
            confirm === 'delete'
              ? t('crmRich.bulk.deleteConfirm', { count: 1 })
              : t(lead.archivedAt ? 'crmRich.bulk.restoreConfirm' : 'crmRich.bulk.archiveConfirm', { count: 1 })
          }
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const action = confirm
            setConfirm(null)
            if (action === 'delete') await onDeleteLead?.(lead._id)
            else await onUpdateLead(lead._id, { archivedAt: lead.archivedAt ? null : new Date().toISOString() })
          }}
        />,
        document.body,
      )}
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
    </section>
  )
}

export default LeadDetailPage
