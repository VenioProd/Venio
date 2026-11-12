import { useEffect, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import Dialog from '../automations/Dialog'
import '../automations/automations.css'
import './sequences.css'
import { enrollLeads, fetchSequences } from './api'
import { refuseReasonKey, sequenceStatusKey, type EnrollResult, type Sequence } from './types'

interface Props {
  leadIds: string[]
  /** Libellés connus des leads (id → entreprise), pour le récapitulatif. */
  leadLabels?: Record<string, string>
  onClose: () => void
  /** Appelé après une inscription réussie (au moins un lead inscrit). */
  onEnrolled?: (result: EnrollResult) => void
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export default function EnrollDialog({ leadIds, leadLabels = {}, onClose, onEnrolled }: Props) {
  const { t } = useI18n()
  const [sequences, setSequences] = useState<Sequence[] | null>(null)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<EnrollResult | null>(null)

  useEffect(() => {
    let alive = true
    fetchSequences()
      .then((res) => alive && setSequences(res.items))
      .catch((e) => {
        if (!alive) return
        setSequences([])
        setProblem(errorText(e, t('crmSeq.loadError')))
      })
    return () => {
      alive = false
    }
  }, [t])

  const selected = sequences?.find((s) => s._id === choice) ?? null

  const submit = async () => {
    if (!choice) return
    setBusy(true)
    setProblem(null)
    try {
      const res = await enrollLeads(choice, leadIds)
      setResult(res)
      if (res.enrolled.length > 0) onEnrolled?.(res)
    } catch (e) {
      setProblem(errorText(e, t('crmSeq.enroll.error')))
    } finally {
      setBusy(false)
    }
  }

  const notActive = result ? result.sequenceStatus !== 'ACTIVE' : selected !== null && selected.status !== 'ACTIVE'

  return (
    <Dialog titleId="crm-seq-enroll-t" className="crm-auto-dlg crm-seq-enroll" onClose={onClose}>
      <h3 id="crm-seq-enroll-t">{t('crmSeq.enroll.title')}</h3>
      {!result && (
        <>
          <p>{t('crmSeq.enroll.intro', { count: leadIds.length })}</p>
          {sequences === null ? (
            <p role="status">{t('crmSeq.enroll.loading')}</p>
          ) : sequences.length === 0 ? (
            <p>{t('crmSeq.enroll.none')}</p>
          ) : (
            <div className="crm-auto-fld">
              <label htmlFor="crm-seq-enroll-sel">{t('crmSeq.enroll.choose')}</label>
              <select
                id="crm-seq-enroll-sel"
                className="crm-auto-sel"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">{t('crmSeq.enroll.placeholder')}</option>
                {sequences.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({t(sequenceStatusKey(s.status))})
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {notActive && (
        <p className="crm-auto-notice" role="note">
          {t('crmSeq.enroll.notActive')}
        </p>
      )}
      {result && (
        <div data-testid="enroll-summary">
          <p role="status">
            <b>{t('crmSeq.enroll.summary', { enrolled: result.enrolled.length, refused: result.refused.length })}</b>
          </p>
          {result.refused.length > 0 && (
            <>
              <p>{t('crmSeq.enroll.refusedHeading')}</p>
              <ul>
                {result.refused.map((r) => {
                  const key = refuseReasonKey(r.reason)
                  return (
                    <li key={r.leadId}>
                      {leadLabels[r.leadId] ?? t('crmSeq.enroll.leadFallback', { id: r.leadId })} —{' '}
                      {key ? t(key) : r.reason}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}
      {problem && (
        <p className="crm-auto-err" role="alert">
          {problem}
        </p>
      )}
      <div className="crm-auto-row">
        <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={onClose}>
          {t('common.close')}
        </button>
        {!result && (
          <button
            type="button"
            className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm"
            disabled={!choice || busy}
            onClick={() => void submit()}
          >
            {busy ? t('crmSeq.enroll.submitting') : t('crmSeq.enroll.submit')}
          </button>
        )}
      </div>
    </Dialog>
  )
}
