import { useEffect, useRef } from 'react'
import type { Lead } from '../../../types/crm.types'
import CallBar from '../../commercial/softphone/CallBar'
import { useSoftphone } from '../../commercial/softphone/useSoftphone'
import { TEAM_CALL_DESK_PREFIX } from './teamDeskApi'

/**
 * Barre d'appel de la fiche d'un lead de l'équipe (routeur `/api/admin/call-desk`). Monté seulement pour qui a
 * le droit d'appeler ; dans la coque du CRM, elle consomme le softphone partagé (voir `call-dock/`).
 * `focusOnReady` (fiche ouverte depuis la file de travail) met l'appel à portée de clavier, sans jamais composer.
 */
export default function LeadCallBar({
  lead,
  focusOnReady,
  onSettled,
}: {
  lead: Lead
  focusOnReady?: boolean
  onSettled?: () => void
}) {
  const controller = useSoftphone({
    apiPrefix: TEAM_CALL_DESK_PREFIX,
    onSettled,
    lead: (id) => (id === lead._id ? lead : null),
  })
  const wrapper = useRef<HTMLDivElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    if (!focusOnReady || focused.current || controller.checking) return
    const target = wrapper.current?.querySelector<HTMLElement>(
      '.softphone-row button:not(:disabled), .softphone-row a[href]',
    )
    if (!target) return
    focused.current = true
    target.scrollIntoView?.({ block: 'center' })
    target.focus({ preventScroll: true })
  }, [focusOnReady, controller.checking, controller.unavailable])
  return (
    <div ref={wrapper} className="crm-detail-callbar">
      <CallBar
        controller={controller}
        leadId={lead._id}
        phone={lead.contactPhone ?? ''}
        held={Boolean(lead.callHold)}
        disabled={Boolean(lead.archivedAt || lead.anonymizedAt)}
      />
    </div>
  )
}
