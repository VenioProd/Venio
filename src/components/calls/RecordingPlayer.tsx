import { useState } from 'react'
import { AudioLines, MicOff, Trash2 } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { createCallsApi, type CallRecording } from '../../services/calls'
import './callInsights.css'

/**
 * Enregistrement d'un appel : lecteur quand l'audio est conservé (`READY`), sinon l'état dit en clair
 * (supprimé après transcription, arrêté à la demande du prospect, en cours).
 */
export default function RecordingPlayer({
  callId,
  recording,
  apiPrefix,
}: {
  callId: string
  recording: CallRecording
  apiPrefix?: string
}) {
  const { t } = useI18n()
  const [unavailable, setUnavailable] = useState(false)
  const status = recording.objection ? 'STOPPED' : recording.status

  if (status === 'NONE') return null
  if (status === 'READY' && !unavailable) {
    return (
      <div className="ci-recording">
        <span className="ci-recording-label">
          <AudioLines size={14} aria-hidden /> {t('callInsights.recording.listen')}
        </span>
        <audio
          controls
          preload="none"
          src={createCallsApi(apiPrefix).recordingUrl(callId)}
          aria-label={t('callInsights.recording.listen')}
          onError={() => setUnavailable(true)}
        />
      </div>
    )
  }
  const Icon = status === 'STOPPED' ? MicOff : status === 'RECORDING' ? AudioLines : Trash2
  const key = status === 'READY' ? 'DELETED' : status
  return (
    <p className="ci-recording ci-recording--note" role="status">
      <Icon size={14} aria-hidden /> {t(`callInsights.recording.note.${key}` as 'callInsights.recording.note.DELETED')}
    </p>
  )
}
