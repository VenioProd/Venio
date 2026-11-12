import type { LeadCall } from '../../services/calls'
import CallInsights from './CallInsights'
import RecordingPlayer from './RecordingPlayer'
import './callInsights.css'

/** Un appel ouvert : l'audio s'il est conservé, puis le transcript et l'analyse (`CallInsights`). */
export default function CallPanel({
  call,
  apiPrefix,
  readOnly,
  canLiftHold,
  onApplied,
}: {
  call: LeadCall
  apiPrefix?: string
  readOnly?: boolean
  canLiftHold?: boolean
  onApplied?: () => void
}) {
  return (
    <div className="ci-call-panel">
      <RecordingPlayer callId={call._id} recording={call.recording} apiPrefix={apiPrefix} />
      <CallInsights
        callId={call._id}
        apiPrefix={apiPrefix}
        readOnly={readOnly}
        canLiftHold={canLiftHold}
        onApplied={onApplied}
      />
    </div>
  )
}
