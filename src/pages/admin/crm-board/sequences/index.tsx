import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { formatDateTime } from '../../../../i18n/format'
import { canAdministerCrm } from '../../../../lib/crmAccess'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import Dialog from '../automations/Dialog'
import '../automations/automations.css'
import SequenceBuilder from './SequenceBuilder'
import SequencesPanel, { StatusBadge } from './SequencesPanel'
import { deleteSequence, fetchEnrollments, fetchSequences, setSequenceStatus, unenrollLeads } from './api'
import {
  ENROLLMENT_STATUSES,
  enrollmentStatusKey,
  planLabel,
  stopReasonKey,
  type Enrollment,
  type EnrollmentsPage,
  type Sequence,
} from './types'
import './sequences.css'

const PAGE_SIZE = 25
const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

function EnrollmentRow({ enr, total, canManage, busy, onUnenroll }: {
  enr: Enrollment
  total: number
  canManage: boolean
  busy: boolean
  onUnenroll: () => void
}) {
  const { t } = useI18n()
  const label = enr.lead?.company || enr.lead?.contactName || enr._id
  const open = enr.status === 'ACTIVE' || enr.status === 'PAUSED'
  const reason = enr.stoppedReason ? stopReasonKey(enr.stoppedReason) : null
  const current = enr.status === 'COMPLETED' ? total : planLabel(enr.currentStep, total)
  return (
    <li className="crm-seq-enr crm-auto-glass" data-testid={`enr-${enr._id}`}>
      <div className="crm-seq-enr-main">
        <b>{label}</b>
        {enr.lead?.contactName && enr.lead.company && <small> — {enr.lead.contactName}</small>}{' '}
        <span className={`crm-seq-pill crm-seq-pill--${enr.status}`}>{t(enrollmentStatusKey(enr.status))}</span>
        <small className="crm-seq-block">
          {t('crmSeq.enr.step', { current, total })}
          {open && enr.nextRunAt ? ` · ${t('crmSeq.enr.next', { when: formatDateTime(enr.nextRunAt) })}` : ''}
          {enr.status === 'STOPPED' && enr.stoppedReason ? ` · ${t('crmSeq.enr.reason', { reason: reason ? t(reason) : enr.stoppedReason })}` : ''}
        </small>
        {enr.history?.length > 0 && (
          <details>
            <summary>{t('crmSeq.enr.history')}</summary>
            <ul className="crm-seq-hist">
              {enr.history.map((h, i) => (
                <li key={i}>
                  {formatDateTime(h.at)} — {t(`crmSeq.hist.${h.status}` as const)} {h.message ? `: ${h.message}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      {canManage && open && (
        <button
          type="button"
          className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
          disabled={busy}
          aria-label={t('crmSeq.enr.unenrollAria', { lead: label })}
          onClick={onUnenroll}
        >
          {t('crmSeq.enr.unenroll')}
        </button>
      )}
    </li>
  )
}

function SequenceDetail({ seq, canManage, onBack, onChanged }: {
  seq: Sequence
  canManage: boolean
  onBack: () => void
  onChanged: () => void
}) {
  const { t } = useI18n()
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<EnrollmentsPage | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    fetchEnrollments(seq._id, { status, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (!alive) return
        setData(res)
        setProblem(null)
      })
      .catch((e) => {
        if (!alive) return
        setData((prev) => prev ?? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 })
        setProblem(errorText(e, t('crmSeq.detail.loadError')))
      })
    return () => {
      alive = false
    }
  }, [seq._id, status, page, version, t])

  const unenroll = async (enr: Enrollment) => {
    const leadId = enr.lead?._id
    if (!leadId) return
    setBusyId(enr._id)
    try {
      await unenrollLeads(seq._id, [leadId])
      setMessage(t('crmSeq.enr.unenrolled'))
      setVersion((v) => v + 1)
      onChanged()
    } catch (e) {
      setProblem(errorText(e, t('crmSeq.enr.unenrollError')))
    } finally {
      setBusyId(null)
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / (data.pageSize || PAGE_SIZE))) : 1

  return (
    <section aria-labelledby="crm-seq-detail-h" className="crm-seq-detail">
      <div className="crm-seq-detail-h">
        <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={onBack}>
          ← {t('crmSeq.detail.back')}
        </button>
        <h2 id="crm-seq-detail-h">{seq.name}</h2>
        <StatusBadge status={seq.status} />
      </div>
      {seq.description && <p className="crm-auto-note">{seq.description}</p>}
      <p className="crm-auto-sr" role="status" aria-live="polite">{message}</p>
      <h3>{t('crmSeq.detail.enrollments')}</h3>
      <div className="crm-auto-filters" role="group" aria-label={t('crmSeq.detail.filter')}>
        {['all', ...ENROLLMENT_STATUSES].map((s) => (
          <button
            key={s}
            type="button"
            className="crm-auto-chip"
            aria-pressed={status === s}
            onClick={() => {
              setStatus(s)
              setPage(1)
            }}
          >
            {s === 'all' ? t('crmSeq.detail.all') : t(enrollmentStatusKey(s as Enrollment['status']))}
          </button>
        ))}
      </div>
      {problem && <p className="crm-auto-err" role="alert">{problem}</p>}
      {data === null ? (
        <p className="crm-auto-empty crm-auto-glass" role="status">{t('crmSeq.detail.loading')}</p>
      ) : data.items.length === 0 ? (
        <p className="crm-auto-empty crm-auto-glass">{t('crmSeq.detail.none')}</p>
      ) : (
        <ul className="crm-seq-enr-list">
          {data.items.map((enr) => (
            <EnrollmentRow key={enr._id} enr={enr} total={seq.steps.length} canManage={canManage} busy={busyId === enr._id} onUnenroll={() => void unenroll(enr)} />
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="crm-auto-row crm-seq-pager">
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('crmSeq.detail.prev')}
          </button>
          <span>{t('crmSeq.detail.page', { page, pages })}</span>
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            {t('crmSeq.detail.next')}
          </button>
        </div>
      )}
    </section>
  )
}

export default function CrmSequences() {
  const { t } = useI18n()
  const { user } = useAuth()
  // Création / édition / activation / suppression : SUPER_ADMIN et ADMIN (miroir du serveur). Inscrire : manage_crm.
  const canAdminister = canAdministerCrm(user)
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_CRM)
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [builder, setBuilder] = useState<{ sequence: Sequence | null } | null>(null)
  const [toDelete, setToDelete] = useState<Sequence | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetchSequences()
      setSequences(res.items)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorText(e, t('crmSeq.loadError')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  const notify = (text: string) => {
    setProblem(null)
    setMessage(text)
  }

  const toggle = async (seq: Sequence) => {
    if (!canAdminister) return
    setBusyId(seq._id)
    setProblem(null)
    try {
      const next = seq.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
      const updated = await setSequenceStatus(seq._id, next)
      setSequences((list) => list.map((s) => (s._id === seq._id ? { ...s, ...updated, stats: updated.stats ?? s.stats } : s)))
      notify(next === 'ACTIVE' ? t('crmSeq.msg.activated') : t('crmSeq.msg.paused'))
    } catch (e) {
      setProblem(errorText(e, t('crmSeq.msg.statusError')))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete || !canAdminister) return
    const seq = toDelete
    setToDelete(null)
    setBusyId(seq._id)
    try {
      await deleteSequence(seq._id)
      setSequences((list) => list.filter((s) => s._id !== seq._id))
      notify(t('crmSeq.msg.deleted'))
    } catch (e) {
      setProblem(errorText(e, t('crmSeq.msg.deleteError')))
    } finally {
      setBusyId(null)
    }
  }

  const opened = openId ? sequences.find((s) => s._id === openId) ?? null : null

  return (
    <div className="crm-auto crm-seq">
      <p className="crm-auto-sr" role="status" aria-live="polite">{message}</p>
      {!canAdminister && (
        <div className="crm-auto-notice" role="note">
          <span>{t('crmSeq.readOnly')}</span>
        </div>
      )}
      {loadError && (
        <div className="crm-auto-notice crm-auto-notice--err" role="alert">
          <span>{loadError}</span>
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => void reload()}>{t('crmSeq.retry')}</button>
        </div>
      )}
      {problem && (
        <div className="crm-auto-notice crm-auto-notice--err" role="alert">
          <span>{problem}</span>
        </div>
      )}

      {opened ? (
        <SequenceDetail seq={opened} canManage={canManage} onBack={() => setOpenId(null)} onChanged={() => void reload()} />
      ) : (
        <>
          <div className="crm-auto-top">
            <h2 className="crm-seq-h">{t('crmSeq.title')}</h2>
            {canAdminister && (
              <button type="button" className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm" onClick={() => setBuilder({ sequence: null })}>
                {t('crmSeq.new')}
              </button>
            )}
          </div>
          <p className="crm-auto-note">{t('crmSeq.rulesNote')}</p>
          {loading ? (
            <p className="crm-auto-empty crm-auto-glass" role="status">{t('crmSeq.loading')}</p>
          ) : (
            <SequencesPanel
              sequences={sequences}
              canAdminister={canAdminister}
              busyId={busyId}
              onOpen={(s) => setOpenId(s._id)}
              onToggle={(s) => void toggle(s)}
              onEdit={(s) => setBuilder({ sequence: s })}
              onDelete={setToDelete}
              onNew={() => setBuilder({ sequence: null })}
            />
          )}
        </>
      )}

      {builder && canAdminister && (
        <SequenceBuilder
          sequence={builder.sequence}
          onClose={() => setBuilder(null)}
          onSaved={(text) => {
            setBuilder(null)
            notify(text)
            void reload()
          }}
        />
      )}
      {toDelete && canAdminister && (
        <Dialog titleId="crm-seq-del-t" onClose={() => setToDelete(null)}>
          <h3 id="crm-seq-del-t">{t('crmSeq.deleteTitle')}</h3>
          <p>{t('crmSeq.deleteBody', { name: toDelete.name })}</p>
          <div className="crm-auto-row">
            <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => setToDelete(null)}>{t('common.cancel')}</button>
            <button type="button" className="crm-auto-btn crm-auto-btn--danger crm-auto-btn--sm" onClick={() => void confirmDelete()}>{t('common.delete')}</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
