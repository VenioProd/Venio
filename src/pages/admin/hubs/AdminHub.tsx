import { Suspense, type ReactNode } from 'react'
import { useI18n } from '../../../context/I18nContext'
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
  const { t } = useI18n()
  if (loading) return null
  return (
    <div className="admin-hub">
      <HubTabs
        label={t('shell.hub.sectionsAria', { title: t(definition.titleKey) })}
        tabs={definition.tabs.map((tab) => ({
          id: tab.id,
          to: tab.to,
          label: t(tab.labelKey),
          allowed: tab.modules.some((module) => canAccessHubModule(user, module)),
          content: <Suspense fallback={<p role="status">{t('shell.hub.loading')}</p>}>{panels[tab.id]}</Suspense>,
        }))}
      >
        {(tabs) => (
          <PageHeader
            eyebrow={t(definition.eyebrowKey)}
            title={t(definition.titleKey)}
            subtitle={t(definition.subtitleKey)}
            tabs={tabs}
          />
        )}
      </HubTabs>
    </div>
  )
}
