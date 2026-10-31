import { subsidiaryLogo } from '../../lib/subsidiaryLogo'
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ExternalLink,
  Users,
  ListChecks,
  Target,
  Link2,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Percent,
  Calendar,
  Package,
  Wrench,
  Coins,
  FileText,
  BookOpen,
  Paperclip,
  GitFork,
  Globe,
  FlaskConical,
  BarChart3,
  Server,
  Network,
  GitBranch,
  Palette,
  FolderOpen,
  Mail,
  Phone,
  KeyRound,
  Info,
  Copy,
} from 'lucide-react'
import { apiFetch, ApiError } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { SkeletonRow } from '../../components/Skeleton'
import ConfirmModal from '../../components/ConfirmModal'
import { DashKpiCard } from '../../components/dashboard'
import SubsidiaryFormDrawer from './subsidiaries/SubsidiaryFormDrawer'
import SubsidiaryDocuments from './subsidiaries/SubsidiaryDocuments'
import SubsidiaryCredentials from './subsidiaries/SubsidiaryCredentials'
import { LINK_TYPE_LABEL_KEYS, STATUS_LABEL_KEYS, HEALTH_LABEL_KEYS } from './subsidiaries/labels'
import { useI18n } from '../../context/I18nContext'
import { formatDate, formatMoney } from '../../i18n/format'
import type { MessageKey } from '../../i18n'
import type { SubsidiaryLinkType } from '../../types/subsidiary.types'
import type { Subsidiary, SubsidiaryPerson } from '../../types/subsidiary.types'
import { STATUS_COLORS, HEALTH_COLORS } from '../../types/subsidiary.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Subsidiaries.css'

const PROJECT_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  EN_COURS: 'orgs.subsidiary.detail.projectStatus.EN_COURS',
  EN_ATTENTE: 'orgs.subsidiary.detail.projectStatus.EN_ATTENTE',
  TERMINE: 'orgs.subsidiary.detail.projectStatus.TERMINE',
  ARCHIVE: 'orgs.subsidiary.detail.projectStatus.ARCHIVE',
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '')
  const full =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return '14, 165, 233'
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

const initials = (name: string) => name?.trim().slice(0, 2).toUpperCase() || '?'
const formatEUR = (n: number) => formatMoney(n || 0, 'EUR', { maximumFractionDigits: 0 })

/** Bloc documentaire — titre, contenu texte (sauts de ligne préservés) + pièces jointes. */
function DossierBlock({
  icon,
  title,
  content,
  accent,
  children,
  hideEmptyHint,
}: {
  icon: ReactNode
  title: string
  content: string
  accent: string
  children?: ReactNode
  hideEmptyHint?: boolean
}) {
  const { t } = useI18n()
  const has = content && content.trim()
  return (
    <div className="sub-dossier-card">
      <h2 className="sub-dossier-title">
        <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
          {icon}
        </span>
        {title}
      </h2>
      {has ? (
        <div className="sub-prose">{content}</div>
      ) : !hideEmptyHint ? (
        <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.emptyDescription')}</p>
      ) : null}
      {children}
    </div>
  )
}

function DossierTab({
  sub,
  accent,
  onDocsChange,
}: {
  sub: Subsidiary
  accent: string
  onDocsChange: (docs: Subsidiary['documents']) => void
}) {
  const { t } = useI18n()
  const docs = sub.documents || []
  const blocks = [
    {
      key: 'product' as const,
      icon: <Package size={16} />,
      title: t('orgs.subsidiary.detail.productTitle'),
      content: sub.productDescription,
    },
    {
      key: 'service' as const,
      icon: <Wrench size={16} />,
      title: t('orgs.subsidiary.detail.serviceTitle'),
      content: sub.serviceDescription,
    },
    {
      key: 'businessModel' as const,
      icon: <Coins size={16} />,
      title: t('orgs.subsidiary.detail.businessModelTitle'),
      content: sub.businessModel,
    },
    {
      key: 'businessPlan' as const,
      icon: <FileText size={16} />,
      title: t('orgs.subsidiary.detail.businessPlanTitle'),
      content: sub.businessPlan,
    },
  ]
  const sections = (sub.sections || []).filter((s) => (s.title && s.title.trim()) || (s.content && s.content.trim()))

  return (
    <div style={{ marginTop: 8 }}>
      {blocks.map((b) => (
        <DossierBlock key={b.key} icon={b.icon} title={b.title} content={b.content} accent={accent}>
          <SubsidiaryDocuments
            subsidiaryId={sub._id}
            category={b.key}
            documents={docs}
            accent={accent}
            onChange={onDocsChange}
          />
        </DossierBlock>
      ))}

      {sections.map((s, i) => (
        <DossierBlock
          key={`sec-${i}`}
          icon={<BookOpen size={16} />}
          title={s.title || t('orgs.subsidiary.detail.sectionFallback')}
          content={s.content}
          accent={accent}
        />
      ))}

      <DossierBlock
        icon={<Paperclip size={16} />}
        title={t('orgs.subsidiary.detail.generalDocuments')}
        content=""
        accent={accent}
        hideEmptyHint
      >
        <SubsidiaryDocuments
          subsidiaryId={sub._id}
          category="general"
          documents={docs}
          accent={accent}
          onChange={onDocsChange}
        />
      </DossierBlock>
    </div>
  )
}

function linkIcon(type: SubsidiaryLinkType) {
  const map: Record<SubsidiaryLinkType, ReactNode> = {
    repo: <GitFork size={16} />,
    production: <Globe size={16} />,
    staging: <FlaskConical size={16} />,
    analytics: <BarChart3 size={16} />,
    hosting: <Server size={16} />,
    dns: <Network size={16} />,
    ci: <GitBranch size={16} />,
    design: <Palette size={16} />,
    docs: <FileText size={16} />,
    drive: <FolderOpen size={16} />,
    other: <Link2 size={16} />,
  }
  return map[type] || <Link2 size={16} />
}

function ContexteTab({
  sub,
  accent,
  onCredsChange,
}: {
  sub: Subsidiary
  accent: string
  onCredsChange: (creds: Subsidiary['credentials']) => void
}) {
  const { t } = useI18n()
  const links = sub.links || []
  const infos = sub.infos || []
  const contacts = sub.contacts || []

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Liens & accès */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <Link2 size={16} />
          </span>
          {t('orgs.subsidiary.detail.linksTitle')}
        </h2>
        {links.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="sub-resource"
                style={{ ['--sub-accent' as string]: accent }}
              >
                <span style={{ color: accent, display: 'inline-flex' }}>{linkIcon(l.type)}</span>
                {l.label || t(LINK_TYPE_LABEL_KEYS[l.type])}
              </a>
            ))}
          </div>
        ) : (
          <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.linksEmpty')}</p>
        )}
      </div>

      {/* Infos */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <Info size={16} />
          </span>
          {t('orgs.subsidiary.detail.infosTitle')}
        </h2>
        {infos.length > 0 ? (
          <div className="sub-infos">
            {infos.map((info, i) => (
              <div key={i} className="sub-info-row">
                <span className="sub-info-key">{info.label}</span>
                <span className="sub-info-val">
                  <code>{info.value}</code>
                  {info.value && (
                    <button
                      type="button"
                      className="sub-icon-btn"
                      onClick={() => copy(info.value)}
                      title={t('orgs.subsidiary.detail.infosCopy')}
                    >
                      <Copy size={12} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.infosEmpty')}</p>
        )}
      </div>

      {/* Contacts */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <Users size={16} />
          </span>
          {t('orgs.subsidiary.detail.contactsTitle')}
        </h2>
        {contacts.length > 0 ? (
          <div className="sub-contacts">
            {contacts.map((c, i) => (
              <div key={i} className="sub-contact">
                <div className="sub-contact__name">
                  {c.name}
                  {c.role && <span className="sub-contact__role">{c.role}</span>}
                </div>
                <div className="sub-contact__lines">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="sub-contact__line">
                      <Mail size={12} /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="sub-contact__line">
                      <Phone size={12} /> {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <div className="sub-contact__notes">{c.notes}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.contactsEmpty')}</p>
        )}
      </div>

      {/* Coffre d'identifiants */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <KeyRound size={16} />
          </span>
          {t('orgs.subsidiary.detail.credentialsTitle')}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
            {t('orgs.subsidiary.detail.credentialsHint')}
          </span>
        </h2>
        <SubsidiaryCredentials
          subsidiaryId={sub._id}
          credentials={sub.credentials || []}
          accent={accent}
          onChange={onCredsChange}
        />
      </div>
    </div>
  )
}

export default function SubsidiaryDetail() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [sub, setSub] = useState<Subsidiary | null>(null)
  const [admins, setAdmins] = useState<SubsidiaryPerson[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'synthese' | 'dossier' | 'contexte'>('synthese')

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ subsidiary: Subsidiary }>(`/api/admin/subsidiaries/${id}`)
      .then((d) => setSub(d.subsidiary))
      .catch(() => showToast(t('orgs.subsidiary.detail.notFoundToast'), 'error'))
      .finally(() => setLoading(false))
  }, [id, showToast, t])

  useEffect(() => {
    load()
    apiFetch<{ users: SubsidiaryPerson[] }>('/api/admin/admins')
      .then((d) => setAdmins(d.users || []))
      .catch(() => {})
    apiFetch<{ entities: string[] }>('/api/admin/subsidiaries/meta')
      .then((d) => setEntities(d.entities || []))
      .catch(() => {})
  }, [load])

  async function handleDelete() {
    if (!sub) return
    try {
      await apiFetch(`/api/admin/subsidiaries/${sub._id}`, { method: 'DELETE' })
      showToast(t('orgs.subsidiary.detail.deletedToast'), 'success')
      navigate('/admin/filiales')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t('orgs.subsidiary.detail.deleteError'), 'error')
    }
  }

  if (loading) {
    return (
      <div className="portal-container">
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (!sub) {
    return (
      <div className="portal-container">
        <Link to="/admin/filiales" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
          {t('orgs.subsidiary.detail.backToList')}
        </Link>
        <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>{t('orgs.subsidiary.detail.notFound')}</p>
      </div>
    )
  }

  const accent = sub.accentColor || 'var(--primary)'
  const accentRgb = hexToRgb(accent)
  const headcount = sub.team?.length || sub.kpis?.headcount || 0
  const obj = sub.objective
  const objPct = obj && obj.target ? Math.min(100, Math.round((obj.current / obj.target) * 100)) : 0
  const k = sub.kpis

  return (
    <div
      className="portal-container"
      style={{ ['--sub-accent' as string]: accent, ['--sub-accent-rgb' as string]: accentRgb }}
    >
      <Link
        to="/admin/filiales"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontSize: 13,
          marginBottom: 14,
        }}
      >
        <ArrowLeft size={14} /> {t('orgs.subsidiary.detail.backLink')}
      </Link>

      {/* En-tête */}
      <div className="portal-card sub-detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div
            className="sub-logo"
            style={{ width: 52, height: 52, fontSize: 20, background: subsidiaryLogo(sub) ? 'transparent' : accent }}
          >
            {subsidiaryLogo(sub) ? (
              <img src={subsidiaryLogo(sub)} alt={sub.name} className="sub-logo__img" />
            ) : (
              initials(sub.name)
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>{sub.name}</h1>
              <span
                className="sub-status-pill"
                style={{ borderColor: STATUS_COLORS[sub.status], color: STATUS_COLORS[sub.status] }}
              >
                {t(STATUS_LABEL_KEYS[sub.status])}
              </span>
              <span
                className="sub-status-pill"
                style={{ borderColor: HEALTH_COLORS[sub.health], color: HEALTH_COLORS[sub.health] }}
              >
                <span className="sub-dot" style={{ background: HEALTH_COLORS[sub.health] }} />{' '}
                {t(HEALTH_LABEL_KEYS[sub.health])}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              {[
                sub.sector,
                sub.foundedYear ? t('orgs.subsidiary.detail.founded', { year: sub.foundedYear }) : null,
                sub.lead ? t('orgs.subsidiary.detail.lead', { name: sub.lead.name || sub.lead.email || '' }) : null,
              ]
                .filter(Boolean)
                .join(' · ') || t('orgs.subsidiary.detail.noInfo')}
            </p>
            {sub.tagline && (
              <p style={{ margin: '8px 0 0', color: 'var(--text-primary)', fontSize: 14 }}>{sub.tagline}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="portal-button secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> {t('orgs.subsidiary.detail.edit')}
            </button>
            <button type="button" className="portal-button secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} style={{ verticalAlign: -2 }} />
            </button>
          </div>
        </div>
        {sub.description && (
          <p
            style={{ marginTop: 14, marginBottom: 0, color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6 }}
          >
            {sub.description}
          </p>
        )}
      </div>

      {editing && (
        <SubsidiaryFormDrawer
          initial={sub}
          admins={admins}
          entities={entities}
          onSaved={(updated) => {
            setSub(updated)
            setEditing(false)
            load()
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Onglets */}
      <div className="admin-tabs" style={{ marginTop: 20, width: 'fit-content' }}>
        <button
          type="button"
          className={`admin-tab${tab === 'synthese' ? ' active' : ''}`}
          onClick={() => setTab('synthese')}
        >
          {t('orgs.subsidiary.detail.tabSummary')}
        </button>
        <button
          type="button"
          className={`admin-tab${tab === 'dossier' ? ' active' : ''}`}
          onClick={() => setTab('dossier')}
        >
          {t('orgs.subsidiary.detail.tabDossier')}
        </button>
        <button
          type="button"
          className={`admin-tab${tab === 'contexte' ? ' active' : ''}`}
          onClick={() => setTab('contexte')}
        >
          {t('orgs.subsidiary.detail.tabContext')}
        </button>
      </div>

      {tab === 'synthese' && (
        <>
          {/* KPI */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop: 20,
            }}
          >
            <DashKpiCard
              label={t('orgs.subsidiary.detail.kpiRevenue')}
              value={formatEUR(k.caMtd)}
              icon={<TrendingUp size={14} />}
              accentColor={accent}
              accentRgb={accentRgb}
              delta={{
                value: k.caMtdDelta,
                direction: k.caMtdDelta > 0 ? 'up' : k.caMtdDelta < 0 ? 'down' : 'flat',
                suffix: '%',
              }}
            />
            <DashKpiCard
              label={t('orgs.subsidiary.detail.kpiMargin')}
              value={`${k.margin}%`}
              icon={<Percent size={14} />}
              accentColor="#9b9b9b"
              accentRgb="155, 155, 155"
              objective={
                k.marginTarget
                  ? {
                      current: k.margin,
                      target: k.marginTarget,
                      label: t('orgs.subsidiary.detail.marginTarget', { target: k.marginTarget }),
                    }
                  : undefined
              }
            />
            <DashKpiCard
              label={t('orgs.subsidiary.detail.kpiTreasury')}
              value={formatEUR(k.treasury)}
              icon={<Wallet size={14} />}
              accentColor="#22c55e"
              accentRgb="34, 197, 94"
              hint={k.runwayMonths ? t('orgs.subsidiary.detail.runway', { months: k.runwayMonths }) : undefined}
            />
            <DashKpiCard
              label={t('orgs.subsidiary.detail.kpiTeam')}
              value={headcount}
              icon={<Users size={14} />}
              accentColor="#f59e0b"
              accentRgb="245, 158, 11"
              objective={
                k.headcountTarget
                  ? {
                      current: headcount,
                      target: k.headcountTarget,
                      label: t('orgs.subsidiary.detail.headcountTarget', { target: k.headcountTarget }),
                    }
                  : undefined
              }
            />
          </div>

          <div className="sub-detail-grid">
            {/* Colonne gauche : projets + objectif */}
            <div className="portal-card">
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <ListChecks size={16} /> {t('orgs.subsidiary.detail.linkedProjects')}
                {sub.linkedEntity && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {t('orgs.subsidiary.detail.linkedEntity', { entity: sub.linkedEntity })}
                  </span>
                )}
              </h2>
              {sub.linkedProjects && sub.linkedProjects.length > 0 ? (
                sub.linkedProjects.map((p) => (
                  <Link
                    key={p._id}
                    to={`/admin/projets-internes/${p._id}`}
                    className="sub-row"
                    style={{ textDecoration: 'none' }}
                  >
                    <span>{p.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {PROJECT_STATUS_LABEL_KEYS[p.status] ? t(PROJECT_STATUS_LABEL_KEYS[p.status]) : p.status}
                    </span>
                  </Link>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {sub.linkedEntity
                    ? t('orgs.subsidiary.detail.noInternalProject')
                    : t('orgs.subsidiary.detail.linkEntityHint')}
                </p>
              )}

              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: '22px 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <Target size={16} /> {t('orgs.subsidiary.detail.quarterObjective')}
              </h2>
              {obj && obj.label ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      marginBottom: 7,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>{obj.label}</span>
                    <span>
                      {obj.current} / {obj.target} {obj.unit}
                    </span>
                  </div>
                  <div className="sub-progress" style={{ ['--sub-accent' as string]: accent }}>
                    <span style={{ width: `${objPct}%` }} />
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('orgs.subsidiary.detail.noObjective')}</p>
              )}
            </div>

            {/* Colonne droite : équipe + ressources + alertes */}
            <div className="portal-card">
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <Users size={16} /> {t('orgs.subsidiary.detail.teamTitle')}
              </h2>
              {sub.team && sub.team.length > 0 ? (
                sub.team.map((m) => (
                  <div key={m._id} className="sub-team-member">
                    <span className="sub-avatar" style={{ background: accent }}>
                      {initials(m.name || m.email || '?')}
                    </span>
                    {m.name || m.email}
                    {m.role && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· {m.role}</span>}
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('orgs.subsidiary.detail.noMember')}</p>
              )}

              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: '22px 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                }}
              >
                <Link2 size={16} /> {t('orgs.subsidiary.detail.resources')}
              </h2>
              {sub.links && sub.links.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sub.links.map((l, i) => (
                    <a
                      key={i}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="sub-resource"
                      style={{ ['--sub-accent' as string]: accent }}
                    >
                      <ExternalLink size={13} /> {l.label}
                    </a>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('orgs.subsidiary.detail.noLinkShort')}</p>
              )}

              {sub.alerts && sub.alerts.length > 0 && (
                <>
                  <h2
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      margin: '22px 0 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <AlertTriangle size={16} /> {t('orgs.subsidiary.detail.alerts')}
                  </h2>
                  {sub.alerts.map((a, i) => (
                    <div key={i} className={`sub-alert sub-alert--${a.level}`}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {a.label}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'dossier' && (
        <DossierTab
          sub={sub}
          accent={accent}
          onDocsChange={(documents) => setSub((s) => (s ? { ...s, documents } : s))}
        />
      )}

      {tab === 'contexte' && (
        <ContexteTab
          sub={sub}
          accent={accent}
          onCredsChange={(credentials) => setSub((s) => (s ? { ...s, credentials } : s))}
        />
      )}

      {sub.tags && sub.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
          {sub.tags.map((t) => (
            <span key={t} className="admin-tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <p
        style={{
          marginTop: 20,
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        <Calendar size={12} /> {t('orgs.subsidiary.detail.updatedOn', { date: formatDate(sub.updatedAt) })}
      </p>

      <ConfirmModal
        isOpen={confirmDelete}
        title={t('orgs.subsidiary.detail.deleteTitle')}
        message={t('orgs.subsidiary.detail.deleteMessage', { name: sub.name })}
        confirmLabel={t('orgs.subsidiary.detail.deleteConfirm')}
        variant="danger"
        onConfirm={() => {
          setConfirmDelete(false)
          handleDelete()
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
