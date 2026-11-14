import { useI18n } from '../../context/I18nContext'
import type { LeadCall } from '../../services/calls'
import { CrmChip } from '../admin/crm-ui'
import { recordingView } from './leadCalls'
import './callInsights.css'

type Tone = 'green' | 'red' | 'amber' | 'grey'
const tone = (ok: boolean, bad = false, attention = false): Tone =>
  bad ? 'red' : attention ? 'amber' : ok ? 'green' : 'grey'

/** Où en sont l'enregistrement, le transcript et l'analyse d'un appel — en toutes lettres, jamais par la couleur seule. */
export default function CallStateChips({ call }: { call: LeadCall }) {
  const { t } = useI18n()
  const recording = recordingView(call.recording)
  // Opposition à l'enregistrement : il n'y aura ni transcript ni analyse, on le dit plutôt que « pas encore ».
  const never = recording === 'STOPPED' && !call.transcriptStatus
  const transcript = call.transcriptStatus ?? (never ? 'never' : 'none')
  const analysis = call.analysisStatus ?? (never ? 'never' : 'none')
  return (
    <ul className="ci-chips">
      {recording !== 'NONE' && (
        <li>
          <CrmChip tone={tone(recording === 'READY')}>
            {t('callInsights.chips.recording')} :{' '}
            {t(`callInsights.recording.${recording}` as 'callInsights.recording.NONE')}
          </CrmChip>
        </li>
      )}
      <li>
        <CrmChip tone={tone(transcript === 'DONE', transcript === 'FAILED')}>
          {t('callInsights.chips.transcript')} : {t(`callInsights.tx.${transcript}` as 'callInsights.tx.none')}
        </CrmChip>
      </li>
      <li>
        <CrmChip
          tone={tone(
            analysis === 'APPLIED' || analysis === 'PARTIAL',
            analysis === 'FAILED',
            // Une analyse prête attend une validation humaine : c'est la seule à mettre en avant.
            analysis === 'READY',
          )}
        >
          {t('callInsights.chips.analysis')} : {t(`callInsights.an.${analysis}` as 'callInsights.an.none')}
        </CrmChip>
      </li>
    </ul>
  )
}
