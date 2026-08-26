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
  const clients = new Map<string, string>()
  const projects = new Map<string, string>()
  for (const request of changeRequests) {
    if (request.client?._id) clients.set(request.client._id, request.client.companyName || request.client.name)
    if (request.project?._id) projects.set(request.project._id, request.project.name)
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '16px 0 24px' }}>
      <select
        className="portal-input"
        aria-label="Filtrer par statut"
        value={status}
        onChange={(event) => onChange({ status: event.target.value })}
        style={{ width: 'auto', minWidth: 180 }}
      >
        <option value="all">Tous les statuts</option>
        {ADMIN_STATUS_ORDER.map((value) => (
          <option key={value} value={value}>
            {ADMIN_STATUS_CONFIG[value].label}
          </option>
        ))}
      </select>

      <select
        className="portal-input"
        aria-label="Filtrer par client"
        value={client}
        onChange={(event) => onChange({ client: event.target.value })}
        style={{ width: 'auto', minWidth: 180 }}
      >
        <option value="all">Tous les clients</option>
        {[...clients.entries()].map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

      <select
        className="portal-input"
        aria-label="Filtrer par projet"
        value={project}
        onChange={(event) => onChange({ project: event.target.value })}
        style={{ width: 'auto', minWidth: 180 }}
      >
        <option value="all">Tous les projets</option>
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
