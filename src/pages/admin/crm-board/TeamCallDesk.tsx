import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import './crm.css'
import { CallDesk } from '../../commercial/CommercialCalls'
import { teamDesk } from './teamDeskApi'

/** File d'appels de l'équipe : l'écran du commercial, branché sur `/api/admin/call-desk`. */
export default function TeamCallDesk() {
  return (
    <section className="crm-call-desk">
      <CallDesk desk={teamDesk} />
    </section>
  )
}
