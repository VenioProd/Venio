import { useI18n } from '../../context/I18nContext'
import type { LeadCall } from '../../services/calls'
import { recordingView } from './leadCalls'
import './callInsights.css'

/** Où en sont l'enregistrement, le transcript et l'analyse d'un appel — en toutes lettres, jamais par la couleur seule. */
export default function CallStateChips({ call }: { call: LeadCall }) {
  const { t } = useI18n()
  const recording = recordingView(call.recording)
  // Opposition à l'enregistrement : il n'y aura ni transcript ni analyse, on le dit plutôt que « pas encore ».
  const never = recording === 'STOPPED' && !call.transcriptStatus
  const transcript = call.transcriptStatus ?? (never ? 'never' : 'none')
  const analysis = call.analysisStatus ?? (never ? 'never' : 'none')
  const tone = (ok: boolean, bad = false) => (bad ? ' ci-chip--bad' : ok ? ' ci-chip--ok' : '')
  return (
    <ul className="ci-chips">
      {recording !== 'NONE' && (
        <li className={`ci-chip${tone(recording === 'READY')}`}>
          {t('callInsights.chips.recording')} :{' '}
          {t(`callInsights.recording.${recording}` as 'callInsights.recording.NONE')}
        </li>
      )}
      <li className={`ci-chip${tone(transcript === 'DONE', transcript === 'FAILED')}`}>
        {t('callInsights.chips.transcript')} : {t(`callInsights.tx.${transcript}` as 'callInsights.tx.none')}
      </li>
      <li
        className={`ci-chip${tone(analysis === 'READY' || analysis === 'APPLIED' || analysis === 'PARTIAL', analysis === 'FAILED')}`}
      >
        {t('callInsights.chips.analysis')} : {t(`callInsights.an.${analysis}` as 'callInsights.an.none')}
      </li>
    </ul>
  )
}
