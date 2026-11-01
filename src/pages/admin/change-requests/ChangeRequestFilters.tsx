import { useI18n } from '../../../context/I18nContext'
import type { AdminChangeRequest } from '../../../types/changeRequest.types'
import { ADMIN_STATUS_CONFIG, ADMIN_STATUS_ORDER } from './types'

interface ChangeRequestFiltersProps {
  status: string
  client: string
  project: string
  changeRequests: AdminChangeRequest[]
  onChange: (next: { status?: string; client?: string; project?: string }) => void
}

/**
 * Les options de client et de projet sont dérivées des demandes chargées : pas
 * d'appel supplémentaire, et aucune option qui ne mènerait à zéro résultat.
 */
const ChangeRequestFilters = ({ status, client, project, changeRequests, onChange }: ChangeRequestFiltersProps) => {
  const { t } = useI18n()
  const clients = new Map<string, string>()
  const projects = new Map<string, string>()
  for (const request of changeRequests) {
    if (request.client?._id) clients.set(request.client._id, request.client.companyName || request.client.name)
    if (request.project?._id) projects.set(request.project._id, request.project.name)
  }

  return (
    <div className="production-filters">
      <select
        className="portal-input"
        aria-label={t('changeReq.filters.byStatus')}
        value={status}
        onChange={(event) => onChange({ status: event.target.value })}
      >
        <option value="all">{t('changeReq.filters.allStatuses')}</option>
        {ADMIN_STATUS_ORDER.map((value) => (
          <option key={value} value={value}>
            {t(ADMIN_STATUS_CONFIG[value].labelKey)}
          </option>
        ))}
      </select>

      <select
        className="portal-input"
        aria-label={t('changeReq.filters.byClient')}
        value={client}
        onChange={(event) => onChange({ client: event.target.value })}
      >
        <option value="all">{t('changeReq.filters.allClients')}</option>
        {[...clients.entries()].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

      <select
        className="portal-input"
        aria-label={t('changeReq.filters.byProject')}
        value={project}
        onChange={(event) => onChange({ project: event.target.value })}
      >
        <option value="all">{t('changeReq.filters.allProjects')}</option>
        {[...projects.entries()].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ChangeRequestFilters
