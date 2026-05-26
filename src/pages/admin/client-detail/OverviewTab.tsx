import React from 'react'
import type { OverviewTabProps } from './types'
import { STATUS_OPTIONS, HEALTH_OPTIONS } from './types'
import { CRM_SERVICE_TYPES } from '@/lib/formatUtils'
import CustomSelect from '@/components/admin/CustomSelect'

const OverviewTab: React.FC<OverviewTabProps> = ({
  client,
  setClient,
  progress,
  projects,
  deliverables,
  billingSummary,
  saveClientPatch,
}) => (
  <div className="portal-list">
    <div className="portal-grid">
      <div className="admin-stat-card">
        <p className="admin-stat-label">Progression globale</p>
        <p className="admin-stat-value">{progress?.progressPercent ?? 0}%</p>
      </div>
      <div className="admin-stat-card">
        <p className="admin-stat-label">Projets actifs</p>
        <p className="admin-stat-value">{projects.filter((project) => !project.isArchived).length}</p>
      </div>
      <div className="admin-stat-card">
        <p className="admin-stat-label">Livrables</p>
        <p className="admin-stat-value">{deliverables.length}</p>
      </div>
      <div className="admin-stat-card">
        <p className="admin-stat-label">Factures impayées</p>
        <p className="admin-stat-value">{billingSummary?.unpaidCount ?? 0}</p>
      </div>
    </div>

    <div className="portal-grid">
      <div>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>Société</label>
        <input
          className="portal-input"
          value={client?.companyName || ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setClient((current) => current ? { ...current, companyName: event.target.value } : current)}
          onBlur={(event: React.FocusEvent<HTMLInputElement>) => saveClientPatch({ companyName: event.target.value })}
          placeholder="Nom de l'entreprise"
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>Service (pour lequel le client paie)</label>
        <CustomSelect
          className="portal-input"
          value={client?.serviceType || ''}
          onChange={(v) => {
            setClient((current) => current ? { ...current, serviceType: v } : current)
            saveClientPatch({ serviceType: v })
          }}
          options={[{ value: '', label: '—' }, ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: s }))]}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>Statut client</label>
        <CustomSelect
          className="portal-input"
          value={client?.status || 'ACTIF'}
          onChange={(v) => saveClientPatch({ status: v })}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>Santé</label>
        <CustomSelect
          className="portal-input"
          value={client?.healthStatus || 'BON'}
          onChange={(v) => saveClientPatch({ healthStatus: v })}
          options={HEALTH_OPTIONS.map((h) => ({ value: h, label: h }))}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>Téléphone</label>
        <input
          className="portal-input"
          value={client?.phone || ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setClient((current) => current ? { ...current, phone: event.target.value } : current)}
          onBlur={(event: React.FocusEvent<HTMLInputElement>) => saveClientPatch({ phone: event.target.value })}
        />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: 8, opacity: 0.7 }}>Site web</label>
        <input
          className="portal-input"
          value={client?.website || ''}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setClient((current) => current ? { ...current, website: event.target.value } : current)}
          onBlur={(event: React.FocusEvent<HTMLInputElement>) => saveClientPatch({ website: event.target.value })}
        />
      </div>
    </div>
  </div>
)

export default OverviewTab
