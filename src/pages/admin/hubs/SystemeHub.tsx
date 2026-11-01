import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import AdminHub from './AdminHub'
import { ADMIN_HUBS, canAccessHubModule } from '../../../lib/adminHubs'
import { useAuth } from '../../../context/AuthContext'

const SystemHealth = lazy(() => import('../SystemHealth'))
const AuditLog = lazy(() => import('../AuditLog'))
const AgentTokensList = lazy(() => import('../AgentTokensList'))
const Webhooks = lazy(() => import('../Webhooks'))

function Integrations() {
  const { user } = useAuth()
  return (
    <div className="admin-hub-integrations">
      {canAccessHubModule(user, 'agents') && (
        <section aria-label="Agents API">
          <h2>Agents API</h2>
          <AgentTokensList />
        </section>
      )}
      {canAccessHubModule(user, 'webhooks') && (
        <section aria-label="Webhooks">
          <h2>Webhooks</h2>
          <Webhooks />
        </section>
      )}
    </div>
  )
}

export default function SystemeHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.systeme}
      panels={{
        sante: <SystemHealth />,
        audit: <AuditLog />,
        integrations: <Integrations />,
      }}
    />
  )
}
