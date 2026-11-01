import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useI18n } from '../../context/I18nContext'
import { subsidiaryLogo } from '../../lib/subsidiaryLogo'
import type { Subsidiary, SubsidiaryPerson } from '../../types/subsidiary.types'
import { STATUS_LABEL_KEYS, HEALTH_LABEL_KEYS } from './subsidiaries/labels'
import { dossierKey } from './subsidiary-detail/SectionEditor'
import SubsidiaryFormDrawer from './subsidiaries/SubsidiaryFormDrawer'
import './Subsidiaries.css'
import './subsidiary-detail/Dossier.css'

export default function SubsidiaryList() {
  const { t } = useI18n()
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([])
  const [admins, setAdmins] = useState<SubsidiaryPerson[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    apiFetch<{ subsidiaries: Subsidiary[] }>('/api/admin/subsidiaries')
      .then((data) => setSubsidiaries(data.subsidiaries || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
    apiFetch<{ users: SubsidiaryPerson[] }>('/api/admin/admins')
      .then((data) => setAdmins(data.users || []))
      .catch(() => {})
    apiFetch<{ entities: string[] }>('/api/admin/subsidiaries/meta')
      .then((data) => setEntities(data.entities || []))
      .catch(() => {})
  }, [load])
  return (
    <div className="platform-dossier">
      <div className="dossier-hero-heading">
        <div>
          <span className="dossier-eyebrow">Venio / {t(dossierKey('platformDossier'))}</span>
          <h1>{t(dossierKey('listTitle'))}</h1>
          <p>{t(dossierKey('listSubtitle'))}</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)}>
          + {t('orgs.subsidiary.list.newButton')}
        </button>
      </div>
      {loading ? (
        <p role="status">{t(dossierKey('loading'))}</p>
      ) : error ? (
        <p role="alert">{t(dossierKey('listError'))}</p>
      ) : !subsidiaries.length ? (
        <p>{t('orgs.subsidiary.list.empty')}</p>
      ) : (
        <div className="platform-grid">
          {subsidiaries.map((sub) => (
            <article key={sub._id} className="platform-card">
              <div className="platform-card-top">
                {subsidiaryLogo(sub) && <img className="dossier-logo" src={subsidiaryLogo(sub)} alt="" />}
                <h2>
                  <Link to={`/admin/filiales/${sub._id}`}>{sub.name} ↗</Link>
                </h2>
              </div>
              <p>{sub.tagline || sub.sector || '—'}</p>
              <div className="dossier-actions">
                <span className={`dossier-chip ${sub.status}`}>{t(STATUS_LABEL_KEYS[sub.status])}</span>
                <span className={`dossier-chip ${sub.health}`}>{t(HEALTH_LABEL_KEYS[sub.health])}</span>
              </div>
              <div className="dossier-metrics">
                <div>
                  <span>{t(dossierKey('clients'))}</span>
                  <strong>{sub.indicators?.signedClients ?? 0}</strong>
                </div>
                <div>
                  <span>{t(dossierKey('prospects'))}</span>
                  <strong>{sub.indicators?.hotProspects ?? 0}</strong>
                </div>
              </div>
              <div className="dossier-actions">
                {sub.nextcloud?.url && (
                  <a className="dossier-button" href={sub.nextcloud.url} target="_blank" rel="noopener noreferrer">
                    {t(dossierKey('nextcloud'))} ↗
                  </a>
                )}
                {sub.devProject && (
                  <Link className="dossier-button" to={`/admin/dev/workspace?project=${sub.devProject}`}>
                    {t(dossierKey('dev'))} ↗
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {showForm && (
        <SubsidiaryFormDrawer
          initial={null}
          admins={admins}
          entities={entities}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
