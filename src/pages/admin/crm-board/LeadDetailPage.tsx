import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { ArrowLeft, Flag, Mail, NotebookPen, Phone, ShieldAlert, Handshake, Archive } from 'lucide-react'
import ConfirmModal from '../../../components/ConfirmModal'
import './crm.css'
import './lead/lead.css'
import { apiFetch } from '../../../lib/api'
import LeadCallsList from '../../../components/calls/LeadCallsList'
import { useLeadCalls } from '../../../components/calls/leadCalls'
import LeadCallBar from './LeadCallBar'
import CallHoldDecision from './CallHoldDecision'
import { TEAM_CALL_DESK_PREFIX } from './teamDeskApi'
import { useI18n } from '../../../context/I18nContext'
import InteractionTimeline from '../../../components/admin/InteractionTimeline'
import { CrmBanner, CrmChip, CrmSectionHead, CrmWithPanel } from '../../../components/admin/crm-ui'
import { CRM_QUEUE_ORIGINS } from '../../../lib/crmNavigation'
import LeadEnrichedPanel from './rich/LeadEnrichedPanel'
import DuplicatesBanner from './DuplicatesBanner'
import MergeLeadDialog from './MergeLeadDialog'
import LeadPrivacyPanel from './LeadPrivacyPanel'
import LeadSequencesPanel from './sequences/LeadSequencesPanel'
import LeadFichePanel from './lead/LeadFichePanel'
import LeadMoreMenu, { type LeadMenuItem } from './lead/LeadMoreMenu'
import { LeadCallCheckRow, LeadOutsideHoursBanner } from './lead/LeadCallCheck'
import { useLeadCallCheck } from './lead/useLeadCallCheck'
import { formatDateTime } from '../../../i18n/format'
import { fromDateTimeLocal, toDateTimeLocal } from '../../../lib/formatUtils'
import type { Lead, AdminUser } from '../../../types/crm.types'
import type { MessageKey } from '../../../i18n'

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

type TabKey = 'calls' | 'history' | 'sequences' | 'details' | 'privacy'
const TABS: readonly (readonly [TabKey, MessageKey])[] = [
  ['calls', 'crm.detail.calls'],
  ['history', 'crmLead.tab.history'],
  ['sequences', 'crm.detail.sequences'],
  ['details', 'crm.detail.details'],
  ['privacy', 'crm.detail.privacy'],
]

/** Initiales de la pastille : deux premières lettres de mots du nom de la société. */
const initialsOf = (name: string) =>
  name
    .split(/[\s\-'’]+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('') || '?'

/** État de la prochaine action d'après sa date seule : rien n'est calculé qui ne soit sur la fiche. */
function nextActionState(at?: string | null): 'overdue' | 'today' | 'planned' | null {
  if (!at) return null
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return null
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.getTime() < now.getTime() ? 'overdue' : 'today'
  return date.getTime() < now.getTime() ? 'overdue' : 'planned'
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
  const location = useLocation()
  const [merging, setMerging] = useState(false)
  const [notice, setNotice] = useState('')
  const timelineRef = useRef<HTMLElement>(null)
  const callRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<TabKey>('calls')
  const composerRequest = useRef<{ email: boolean } | null>(null)
  const [composerNonce, setComposerNonce] = useState(0)
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  // Relit les appels après un appel passé ici ; relit la fiche quand une analyse l'a modifiée.
  const [callsRefresh, setCallsRefresh] = useState(0)
  // Arrivée depuis « Aujourd'hui » sur une analyse à valider (`?analyse=<id de l'appel>`) : l'onglet Appels,
  // ouvert par défaut, se déplie sur cet appel.
  const [openCall, setOpenCall] = useState<{ callId: string; nonce: number } | null>(() => {
    const callId = new URLSearchParams(location.search).get('analyse')
    return callId ? { callId, nonce: 0 } : null
  })
  const [holdDecision, setHoldDecision] = useState(false)

  // L'écran d'origine : la file de travail (`from`) ou le pipeline. Le retour lui-même est géré par la page parente.
  const originTab = CRM_QUEUE_ORIGINS[new URLSearchParams(location.search).get('from') ?? ''] ?? 'pipeline'
  const originLabel = t(`shell.crm.tab.${originTab}` as MessageKey)

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

  // « Écrire » et « Consigner un échange » ouvrent l'onglet Historique, où se trouve le journal, puis y mettent le focus.
  const focusComposer = (email: boolean) => {
    setTab('history')
    composerRequest.current = { email }
    setComposerNonce((value) => value + 1)
  }
  useEffect(() => {
    const request = composerRequest.current
    if (!request || tab !== 'history') return
    const { email } = request
    composerRequest.current = null
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
  }, [composerNonce, tab])

  /** « Appeler » met la barre d'appel de la fiche à portée de clavier ; l'appel lui-même se lance depuis cette barre. */
  const focusCallBar = () => {
    const target = callRef.current?.querySelector<HTMLElement>(
      '.softphone-row button:not(:disabled), .softphone-row a[href]',
    )
    callRef.current?.scrollIntoView?.({ block: 'center' })
    target?.focus({ preventScroll: true })
  }

  const copyContact = () => {
    const text = [
      lead.contactName && `${t('crm.detail.copyContact')} ${lead.contactName}`,
      lead.contactEmail && `${t('crm.detail.copyEmail')} ${lead.contactEmail}`,
      lead.contactPhone && `${t('crm.detail.copyPhone')} ${lead.contactPhone}`,
      lead.company && `${t('crm.detail.copyCompany')} ${lead.company}`,
    ]
      .filter(Boolean)
      .join('\n')
    if (!text) return
    navigator.clipboard
      .writeText(text)
      .then(() => setNotice(t('crm.detail.copied')))
      .catch(() => setNotice(t('crm.detail.copyFailed')))
  }

  const menuItems: LeadMenuItem[] = [
    ...(canManageCrm && onMerged
      ? [{ key: 'merge', label: t('crm.merge.open'), onSelect: () => setMerging(true) }]
      : []),
    ...(canManageCrm
      ? [
          {
            key: 'contacted',
            label: t('crmLead.menu.contacted'),
            onSelect: () => {
              const isEarlyStage = lead.status === 'LEAD' || lead.status === 'QUALIFIED'
              void onUpdateLead(lead._id, {
                lastContactAt: new Date().toISOString(),
                ...(isEarlyStage ? { status: 'CONTACTED' } : {}),
              })
            },
          },
        ]
      : []),
    { key: 'copy', label: t('crmLead.menu.copy'), onSelect: copyContact },
    { key: 'privacy', label: t('crmLead.menu.privacy'), onSelect: () => setTab('privacy') },
    ...(lead.status === 'WON'
      ? [
          lead.clientAccountId
            ? {
                key: 'client',
                label: t('crmLead.menu.client'),
                to: `/admin/comptes-clients/${lead.clientAccountId}`,
                onSelect: onClose,
              }
            : {
                key: 'convert',
                label: converting === lead._id ? t('crm.common.converting') : t('crmLead.menu.convert'),
                disabled: converting === lead._id,
                onSelect: () => {
                  void (async () => {
                    await onConvertToClient(lead)
                    onClose()
                  })()
                },
              },
        ]
      : []),
    ...(canManageCrm
      ? [
          {
            key: 'archive',
            label: t(lead.archivedAt ? 'crmRich.bulk.restore' : 'crmRich.bulk.archive'),
            separated: true,
            onSelect: () => setConfirm('archive'),
          },
          ...(onDeleteLead
            ? [
                {
                  key: 'delete',
                  label: t('crmRich.bulk.delete'),
                  tone: 'danger' as const,
                  onSelect: () => setConfirm('delete'),
                },
              ]
            : []),
        ]
      : []),
  ]

  const nextState = nextActionState(lead.nextActionAt)
  const externalHeld = Boolean(lead.externalRep && !lead.closingHandoff)
  const callable = canManageCrm && Boolean(lead.contactPhone)
  const toValidate = leadCalls.calls.some((call) => call.analysisStatus === 'READY')
  const callCheck = useLeadCallCheck(lead._id, lead.contactPhone)

  return (
    <section className="crm-lead" aria-labelledby="crm-detail-title">
      <p className="crm-lead-back">
        <button
          type="button"
          className="crm-ui-btn crm-ui-btn--ghost crm-ui-btn--sm"
          aria-label={t('crmLead.back', { to: originLabel })}
          onClick={onClose}
        >
          <ArrowLeft aria-hidden="true" /> {originLabel}
        </button>
      </p>

      <header className="crm-lead-head">
        <div className="crm-lead-id">
          <span className="crm-lead-avatar" aria-hidden="true">
            {initialsOf(lead.company)}
          </span>
          <div>
            <h1 id="crm-detail-title">{lead.company}</h1>
            <p className="crm-lead-sub">
              {lead.contactName && <span>{lead.contactName}</span>}
              {lead.contactPhone && <span className="crm-lead-mono">{lead.contactPhone}</span>}
              {!lead.contactName && !lead.contactPhone && <span>—</span>}
            </p>
          </div>
        </div>
        <div className="crm-lead-actions">
          {callable && (
            <button type="button" className="crm-ui-btn crm-ui-btn--primary" onClick={focusCallBar}>
              <Phone aria-hidden="true" /> {t('crmLead.call')}
            </button>
          )}
          {canManageCrm && (
            <>
              <button type="button" className="crm-ui-btn" onClick={() => focusComposer(true)}>
                <Mail aria-hidden="true" /> {t('crm.detail.write')}
              </button>
              <button type="button" className="crm-ui-btn" onClick={() => focusComposer(false)}>
                <NotebookPen aria-hidden="true" /> {t('crm.detail.log')}
              </button>
            </>
          )}
          <LeadMoreMenu label={t('crm.detail.more')} items={menuItems} />
        </div>
      </header>

      <div className="crm-lead-banners">
        {lead.callHold && (
          <CrmBanner
            tone="red"
            role="status"
            icon={<ShieldAlert />}
            title={t('crmLead.hold.title')}
            actions={
              externalHeld ? (
                canManageCrm &&
                (holdDecision ? (
                  <CallHoldDecision leadId={lead._id} onDecided={reloadLead} />
                ) : (
                  <button
                    type="button"
                    className="crm-ui-btn crm-ui-btn--danger crm-ui-btn--sm"
                    onClick={() => setHoldDecision(true)}
                  >
                    {t('callHold.open')}
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  className="crm-ui-btn crm-ui-btn--sm"
                  onClick={() => {
                    setTab('calls')
                    if (lead.callHold?.call) setOpenCall({ callId: lead.callHold.call, nonce: Date.now() })
                  }}
                >
                  {t('crm.detail.holdOpen')}
                </button>
              )
            }
          >
            {t(externalHeld ? 'callHold.body' : 'commercial.hold.bodyTeam')}
          </CrmBanner>
        )}
        <LeadOutsideHoursBanner check={callCheck} />
        {lead.closingHandoff && (
          <CrmBanner tone="blue" icon={<Handshake />} title={t('crmLead.handoff.title')}>
            {t('crmLead.handoff.body', { date: formatDateTime(lead.closingHandoff.at) })}
          </CrmBanner>
        )}
        {lead.archivedAt && (
          <CrmBanner tone="grey" icon={<Archive />} title={t('crmLead.archived.title')}>
            {t('crmLead.archived.body')}
          </CrmBanner>
        )}
        <DuplicatesBanner
          company={lead.company}
          contactEmail={lead.contactEmail}
          contactPhone={lead.contactPhone}
          excludeId={lead._id}
          onMerge={canManageCrm && onMerged ? () => setMerging(true) : undefined}
        />
        {notice && (
          <p className="crm-lead-notice" role="status">
            {notice}
            <button type="button" onClick={() => setNotice('')} aria-label={t('common.close')}>
              ×
            </button>
          </p>
        )}
      </div>

      <section className="crm-lead-next" aria-labelledby="crm-lead-next-title">
        <Flag aria-hidden="true" />
        <h2 id="crm-lead-next-title" className="crm-lead-next__label">
          {t('crm.col.nextAction')}
        </h2>
        {canManageCrm ? (
          <div className="crm-lead-next__fields">
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
          </div>
        ) : (
          <b className="crm-lead-next__value">
            {lead.nextActionLabel || '—'} · {lead.nextActionAt ? formatDateTime(lead.nextActionAt) : '—'}
          </b>
        )}
        {lead.callHold ? (
          <CrmChip tone="red">{t('crmLead.next.held')}</CrmChip>
        ) : nextState ? (
          <CrmChip tone={nextState === 'overdue' ? 'red' : nextState === 'today' ? 'amber' : 'grey'}>
            {t(`crmLead.next.${nextState}` as MessageKey)}
          </CrmChip>
        ) : null}
      </section>

      <LeadCallCheckRow check={callCheck} />
      {callable && (
        <div ref={callRef} className="crm-lead-call">
          <LeadCallBar lead={lead} focusOnReady={focusCall} onSettled={() => setCallsRefresh((value) => value + 1)} />
        </div>
      )}

      <CrmWithPanel
        panel={<LeadFichePanel lead={lead} admins={admins} canManageCrm={canManageCrm} onUpdateLead={onUpdateLead} />}
      >
        <div className="crm-lead-tabs" role="tablist" aria-label={t('crm.detail.sections')}>
          {TABS.map(([key, label], index) => (
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
                      ? TABS.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
                setTab(TABS[next]![0])
                document.getElementById(`crm-tab-${TABS[next]![0]}`)?.focus()
              }}
            >
              {t(label)}
              {key === 'calls' && toValidate && <CrmChip tone="amber">{t('crmLead.tab.toValidate')}</CrmChip>}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`crm-panel-${tab}`} aria-labelledby={`crm-tab-${tab}`} className="crm-lead-panel">
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
          {tab === 'history' && (
            <section
              className="crm-ui-card crm-lead-journal"
              ref={timelineRef}
              tabIndex={-1}
              aria-label={t('crm.detail.interactionLog')}
            >
              <CrmSectionHead title={t('crm.detail.interactionLog')} />
              <InteractionTimeline
                subjectType="LEAD"
                subjectId={lead._id}
                canWrite={canManageCrm}
                legacyNote={lead.interactionNotes || undefined}
              />
            </section>
          )}
        </div>
      </CrmWithPanel>

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
