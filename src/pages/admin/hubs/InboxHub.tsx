import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const Messaging = lazy(() => import('../Messaging'))
const ActivityCenter = lazy(() => import('../ActivityCenter'))
const EmailComposer = lazy(() => import('../EmailComposer'))

export default function InboxHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.inbox}
      panels={{
        conversations: <Messaging />,
        activite: <ActivityCenter />,
        'envoi-groupe': <EmailComposer />,
      }}
    />
  )
}
