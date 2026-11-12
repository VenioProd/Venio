import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { formatDateTime } from '../../../../i18n/format'
import EnrollDialog from './EnrollDialog'
import { fetchLeadSequences, unenrollLeads } from './api'
import { enrollmentStatusKey, planLabel, stopReasonKey, type Enrollment } from './types'
import './sequences.css'

interface Props {
  leadId: string
  canManageCrm: boolean
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

/** Bloc « Séquences d'e-mails » de la fiche lead : inscriptions en cours / terminées, inscription et désinscription. */
export default function LeadSequencesPanel({ leadId, canManageCrm }: Props) {
  const { t } = useI18n()
  const [items, setItems] = useState<Enrollment[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [enrolling, setEnrolling] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await fetchLeadSequences(leadId))
      setProblem(null)
    } catch (e) {
      setItems((prev) => prev ?? [])
      setProblem(errorText(e, t('crmSeq.lead.loadError')))
    }
  }, [leadId, t])

  useEffect(() => {
    void load()
  }, [load])

  const unenroll = async (enrollment: Enrollment, sequenceId: string) => {
    setBusyId(enrollment._id)
    setProblem(null)
    try {
      await unenrollLeads(sequenceId, [leadId])
      setMessage(t('crmSeq.enr.unenrolled'))
      await load()
    } catch (e) {
      setProblem(errorText(e, t('crmSeq.enr.unenrollError')))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="crm-modal-notes crm-seq-lead" aria-labelledby={`crm-seq-lead-h-${leadId}`}>
      <div className="crm-seq-lead-h">
        <h4 id={`crm-seq-lead-h-${leadId}`} className="crm-modal-label">
          {t('crmSeq.lead.heading')}
        </h4>
        {canManageCrm && (
          <button type="button" className="portal-button secondary" onClick={() => setEnrolling(true)}>
            {t('crmSeq.lead.enroll')}
          </button>
        )}
      </div>
      <p className="crm-seq-sr" role="status" aria-live="polite">
        {message}
      </p>
      {problem && (
        <p className="crm-seq-err" role="alert">
          {problem}
        </p>
      )}
      {items === null ? (
        <p className="crm-seq-dim">{t('crmSeq.lead.loading')}</p>
      ) : items.length === 0 ? (
        <p className="crm-seq-dim">{t('crmSeq.lead.none')}</p>
      ) : (
        <ul className="crm-seq-lead-list">
          {items.map((enr) => {
            const seq = typeof enr.sequence === 'string' ? null : enr.sequence
            const sequenceId = typeof enr.sequence === 'string' ? enr.sequence : enr.sequence._id
            const total = seq?.steps.length ?? 0
            const current = enr.status === 'COMPLETED' ? total : planLabel(enr.currentStep, total)
            const reason = enr.stoppedReason ? stopReasonKey(enr.stoppedReason) : null
            const open = enr.status === 'ACTIVE' || enr.status === 'PAUSED'
            return (
              <li key={enr._id} className="crm-seq-lead-item" data-testid={`lead-enr-${enr._id}`}>
                <div>
                  <b>{seq?.name ?? sequenceId}</b>{' '}
                  <span className={`crm-seq-pill crm-seq-pill--${enr.status}`}>
                    {t(enrollmentStatusKey(enr.status))}
                  </span>
                </div>
                <small>
                  {t('crmSeq.enr.step', { current, total })}
                  {open && enr.nextRunAt ? ` · ${t('crmSeq.enr.next', { when: formatDateTime(enr.nextRunAt) })}` : ''}
                  {enr.status === 'STOPPED' && enr.stoppedReason
                    ? ` · ${t('crmSeq.enr.reason', { reason: reason ? t(reason) : enr.stoppedReason })}`
                    : ''}
                </small>
                {canManageCrm && open && (
                  <button
                    type="button"
                    className="crm-seq-link"
                    disabled={busyId === enr._id}
                    aria-label={t('crmSeq.lead.unenrollAria', { name: seq?.name ?? sequenceId })}
                    onClick={() => void unenroll(enr, sequenceId)}
                  >
                    {t('crmSeq.lead.unenroll')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {enrolling && (
        <EnrollDialog
          leadIds={[leadId]}
          onClose={() => setEnrolling(false)}
          onEnrolled={() => {
            setMessage(t('crmSeq.lead.enrolledMsg'))
            void load()
          }}
        />
      )}
    </section>
  )
}
