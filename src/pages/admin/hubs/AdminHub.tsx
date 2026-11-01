import { Suspense, type ReactNode } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { canAccessHubModule, type AdminHubDefinition } from '../../../lib/adminHubs'
import PageHeader from '../../../components/admin/ui/PageHeader'
import HubTabs from '../../../components/admin/ui/HubTabs'

export default function AdminHub({
  definition,
  panels,
}: {
  definition: AdminHubDefinition
  panels: Record<string, ReactNode>
}) {
  const { user, loading } = useAuth()
  if (loading) return null
  return (
    <div className="admin-hub">
      <HubTabs
        label={`Sections ${definition.title}`}
        tabs={definition.tabs.map((tab) => ({
          ...tab,
          allowed: tab.modules.some((module) => canAccessHubModule(user, module)),
          content: <Suspense fallback={<p role="status">Chargement…</p>}>{panels[tab.id]}</Suspense>,
        }))}
      >
        {(tabs) => (
          <PageHeader
            eyebrow={definition.eyebrow}
            title={definition.title}
            subtitle={definition.subtitle}
            tabs={tabs}
          />
        )}
      </HubTabs>
    </div>
  )
}
