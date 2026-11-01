import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import { formatMoney } from '../../i18n/format'
import type { Subsidiary, SubsidiaryPerson } from '../../types/subsidiary.types'
import { STATUS_LABEL_KEYS, HEALTH_LABEL_KEYS } from './subsidiaries/labels'
import SubsidiaryFormDrawer from './subsidiaries/SubsidiaryFormDrawer'
import ConfirmModal from '../../components/ConfirmModal'
import DossierSections, { SECTION_IDS } from './subsidiary-detail/DossierSections'
import { Fields, dossierKey } from './subsidiary-detail/SectionEditor'
import { subsidiaryLogo } from '../../lib/subsidiaryLogo'
import './Subsidiaries.css'
import './subsidiary-detail/Dossier.css'

export default function SubsidiaryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const { showToast } = useToast()
  const tr = (key: string) => t(dossierKey(key))
  const [sub, setSub] = useState<Subsidiary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [admins, setAdmins] = useState<SubsidiaryPerson[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [leadProjects, setLeadProjects] = useState<string[]>([])
  const [devProjects, setDevProjects] = useState<{ _id: string; key: string; name: string }[]>([])
  const [editing, setEditing] = useState(false)
  const [headerDraft, setHeaderDraft] = useState<Record<string, any> | null>(null)
  const [headerBusy, setHeaderBusy] = useState(false)
  const [headerError, setHeaderError] = useState('')
  const [cloudEditing, setCloudEditing] = useState(false)
  const [cloudDraft, setCloudDraft] = useState<Record<string, any>>({ path: '', url: '' })
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudError, setCloudError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const load = useCallback(async () => {
    const data = await apiFetch<{ subsidiary: Subsidiary }>(`/api/admin/subsidiaries/${id}`)
    setSub(data.subsidiary)
  }, [id])
  useEffect(() => {
    setLoading(true)
    setError('')
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    apiFetch<{ users: SubsidiaryPerson[] }>('/api/admin/admins')
      .then((data) => setAdmins(data.users || []))
      .catch(() => {})
    apiFetch<{ entities: string[]; leadProjects: string[] }>('/api/admin/subsidiaries/meta')
      .then((data) => {
        setEntities(data.entities || [])
        setLeadProjects(data.leadProjects || [])
      })
      .catch(() => {})
    apiFetch<{ projects: typeof devProjects }>('/api/admin/dev/projects')
      .then((data) => setDevProjects(data.projects || []))
      .catch(() => {})
  }, [load])
  async function save(patch: Record<string, any>) {
    await apiFetch(`/api/admin/subsidiaries/${id}`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(patch),
    })
    await load()
  }
  async function cloudAction(create: boolean) {
    setCloudBusy(true)
    setCloudError('')
    try {
      if (create) {
        await apiFetch(`/api/admin/subsidiaries/${id}/nextcloud`, {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        })
        await load()
      } else {
        await save({ nextcloud: cloudDraft })
        setCloudEditing(false)
      }
    } catch (err) {
      const code = err instanceof ApiError ? (err.payload as { code?: string } | null)?.code : undefined
      setCloudError(
        code === 'NEXTCLOUD_NOT_CONFIGURED'
          ? tr('cloudNotConfigured')
          : code === 'NEXTCLOUD_FOLDER_FAILED'
            ? tr('cloudFailed')
            : err instanceof Error
              ? err.message
              : tr('saveError'),
      )
    } finally {
      setCloudBusy(false)
    }
  }
  if (loading)
    return (
      <div className="platform-dossier" role="status">
        {tr('loading')}
      </div>
    )
  if (!sub)
    return (
      <div className="platform-dossier">
        <Link to="/admin/filiales">{t('orgs.subsidiary.detail.backLink')}</Link>
        <p role="alert">{error || t('orgs.subsidiary.detail.notFound')}</p>
      </div>
    )
  const metrics = [
    { label: 'clients', value: sub.indicators?.signedClients ?? 0 },
    { label: 'prospects', value: sub.indicators?.hotProspects ?? 0 },
    {
      label: 'weightedPipeline',
      value: sub.indicators?.weightedPipeline == null ? '—' : formatMoney(sub.indicators.weightedPipeline, 'EUR'),
    },
    {
      label: 'estimatedMrr',
      value: sub.indicators?.estimatedMrr == null ? '—' : formatMoney(sub.indicators.estimatedMrr, 'EUR'),
    },
  ]
  return (
    <div className="platform-dossier">
      <Link className="dossier-back" to="/admin/filiales">
        ← {t('orgs.subsidiary.detail.backLink')}
      </Link>
      <header className="dossier-hero" id="overview">
        <span className="dossier-eyebrow">{tr('platformDossier')}</span>
        <div className="dossier-hero-heading">
          {subsidiaryLogo(sub) && <img className="dossier-logo" src={subsidiaryLogo(sub)} alt="" />}
          <div>
            <h1>{sub.name}</h1>
            <p>{sub.tagline}</p>
          </div>
          <div className="dossier-actions">
            <span className={`dossier-chip ${sub.status}`}>{t(STATUS_LABEL_KEYS[sub.status])}</span>
            <span className={`dossier-chip ${sub.health}`}>{t(HEALTH_LABEL_KEYS[sub.health])}</span>
            <button
              type="button"
              onClick={() => {
                setHeaderDraft({
                  name: sub.name,
                  tagline: sub.tagline,
                  sector: sub.sector,
                  status: sub.status,
                  health: sub.health,
                })
                setHeaderError('')
              }}
            >
              {tr('edit')}
            </button>
            <button type="button" onClick={() => setEditing(true)}>
              {tr('settings')}
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)}>
              {tr('remove')}
            </button>
          </div>
        </div>
        {headerDraft && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setHeaderBusy(true)
              setHeaderError('')
              try {
                await save(headerDraft)
                setHeaderDraft(null)
              } catch (err) {
                setHeaderError(err instanceof Error ? err.message : tr('saveError'))
              } finally {
                setHeaderBusy(false)
              }
            }}
          >
            <Fields
              value={headerDraft}
              onChange={setHeaderDraft}
              fields={[
                { key: 'name', label: 'name', max: 160 },
                { key: 'tagline', label: 'tagline', max: 500 },
                { key: 'sector', label: 'sector', max: 160 },
                { key: 'status', label: 'status', options: ['ACTIVE', 'INCUBATION', 'PAUSE', 'ARCHIVED'] },
                { key: 'health', label: 'health', options: ['GOOD', 'WATCH', 'RISK'] },
              ]}
            />
            <div className="dossier-actions">
              <button disabled={headerBusy}>{tr('save')}</button>
              <button disabled={headerBusy} type="button" onClick={() => setHeaderDraft(null)}>
                {tr('cancel')}
              </button>
            </div>
            {headerError && <p role="alert">{headerError}</p>}
          </form>
        )}
        <div className="dossier-actions">
          {sub.nextcloud?.url && (
            <a className="dossier-button" href={sub.nextcloud.url} target="_blank" rel="noopener noreferrer">
              {tr('nextcloud')} ↗
            </a>
          )}
          {sub.devProject && (
            <Link className="dossier-button" to={`/admin/dev?project=${sub.devProject}`}>
              {tr('dev')} ↗
            </Link>
          )}
          {sub.links
            ?.filter((link) => link.type === 'production' || link.type === 'other')
            .map((link, i) => (
              <a className="dossier-button" key={i} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label} ↗
              </a>
            ))}
          <button
            type="button"
            onClick={() => {
              setCloudDraft(sub.nextcloud || { path: '', url: '' })
              setCloudEditing(true)
              setCloudError('')
            }}
          >
            {tr('cloudEdit')}
          </button>
          <button type="button" disabled={cloudBusy} onClick={() => cloudAction(true)}>
            {tr(cloudBusy ? 'saving' : 'cloudCreate')}
          </button>
        </div>
        {cloudEditing && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void cloudAction(false)
            }}
          >
            <Fields
              fields={[
                { key: 'path', label: 'path', max: 1000 },
                { key: 'url', label: 'url', type: 'url' },
              ]}
              value={cloudDraft}
              onChange={setCloudDraft}
            />
            <div className="dossier-actions">
              <button disabled={cloudBusy}>{tr('save')}</button>
              <button type="button" onClick={() => setCloudEditing(false)}>
                {tr('cancel')}
              </button>
            </div>
          </form>
        )}
        {cloudError && <p role="alert">{cloudError}</p>}
        <div className="dossier-metrics">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <span>{tr(metric.label)}</span>
              <strong>{metric.value}</strong>
              {['weightedPipeline', 'estimatedMrr'].includes(metric.label) && metric.value === '—' && (
                <small>{tr('notComputable')}</small>
              )}
            </div>
          ))}
        </div>
      </header>
      <div className="dossier-layout">
        <nav className="dossier-nav" aria-label={tr('contents')}>
          {SECTION_IDS.map((section, i) => (
            <a key={section} href={`#${section}`}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              {tr(section)}
            </a>
          ))}
        </nav>
        <main className="dossier-main">
          <DossierSections
            sub={sub}
            save={save}
            onChange={(patch) => setSub((current) => current && { ...current, ...patch })}
            leadProjects={leadProjects}
            devProjects={devProjects}
          />
        </main>
      </div>
      {editing && (
        <SubsidiaryFormDrawer
          initial={sub}
          admins={admins}
          entities={entities}
          onSaved={() => {
            setEditing(false)
            void load()
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          isOpen
          title={t('orgs.subsidiary.detail.deleteTitle')}
          message={t('orgs.subsidiary.detail.deleteMessage', { name: sub.name })}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await apiFetch(`/api/admin/subsidiaries/${id}`, {
                method: 'DELETE',
                headers: { 'Idempotency-Key': crypto.randomUUID() },
              })
              navigate('/admin/filiales')
            } catch (err) {
              showToast(err instanceof Error ? err.message : tr('saveError'), 'error')
            }
          }}
        />
      )}
    </div>
  )
}
