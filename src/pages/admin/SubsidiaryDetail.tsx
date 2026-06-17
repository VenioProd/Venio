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
} from 'lucide-react'
import { apiFetch, ApiError } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import { SkeletonRow } from '../../components/Skeleton'
import ConfirmModal from '../../components/ConfirmModal'
import { DashKpiCard } from '../../components/dashboard'
import SubsidiaryFormDrawer from './subsidiaries/SubsidiaryFormDrawer'
import type { Subsidiary, SubsidiaryPerson } from '../../types/subsidiary.types'
import { STATUS_LABELS, STATUS_COLORS, HEALTH_COLORS, HEALTH_LABELS } from '../../types/subsidiary.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Subsidiaries.css'

const PROJECT_STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Terminé',
  ARCHIVE: 'Archivé',
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
const formatEUR = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)

/** Bloc documentaire — titre + contenu texte (sauts de ligne préservés). */
function DossierBlock({
  icon,
  title,
  content,
  accent,
}: {
  icon: ReactNode
  title: string
  content: string
  accent: string
}) {
  return (
    <div className="portal-card" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: accent, display: 'inline-flex' }}>{icon}</span> {title}
      </h2>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
        {content}
      </div>
    </div>
  )
}

function DossierTab({ sub, accent }: { sub: Subsidiary; accent: string }) {
  const blocks = [
    { key: 'product', icon: <Package size={16} />, title: 'Description du produit', content: sub.productDescription },
    { key: 'service', icon: <Wrench size={16} />, title: 'Description du service', content: sub.serviceDescription },
    { key: 'model', icon: <Coins size={16} />, title: 'Business model', content: sub.businessModel },
    { key: 'plan', icon: <FileText size={16} />, title: 'Business plan', content: sub.businessPlan },
  ].filter((b) => b.content && b.content.trim())

  const sections = (sub.sections || []).filter((s) => (s.title && s.title.trim()) || (s.content && s.content.trim()))

  if (blocks.length === 0 && sections.length === 0) {
    return (
      <div className="admin-empty-state" style={{ marginTop: 24 }}>
        <BookOpen size={30} className="admin-empty-state-icon" />
        <p className="admin-empty-state-text">
          Dossier vide. Clique sur « Éditer » pour renseigner le produit, le service, le business model, le business
          plan et toute autre info utile au suivi.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 6 }}>
      {blocks.map((b) => (
        <DossierBlock key={b.key} icon={b.icon} title={b.title} content={b.content} accent={accent} />
      ))}
      {sections.map((s, i) => (
        <DossierBlock
          key={`sec-${i}`}
          icon={<BookOpen size={16} />}
          title={s.title || 'Section'}
          content={s.content}
          accent={accent}
        />
      ))}
    </div>
  )
}

export default function SubsidiaryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [sub, setSub] = useState<Subsidiary | null>(null)
  const [admins, setAdmins] = useState<SubsidiaryPerson[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tab, setTab] = useState<'synthese' | 'dossier'>('synthese')

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    apiFetch<{ subsidiary: Subsidiary }>(`/api/admin/subsidiaries/${id}`)
      .then((d) => setSub(d.subsidiary))
      .catch(() => showToast('Filiale introuvable', 'error'))
      .finally(() => setLoading(false))
  }, [id, showToast])

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
      showToast('Filiale supprimée', 'success')
      navigate('/admin/filiales')
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur lors de la suppression', 'error')
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
        <Link to="/admin/filiales" style={{ color: '#0ea5e9', textDecoration: 'none' }}>
          ← Retour aux filiales
        </Link>
        <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Cette filiale est introuvable.</p>
      </div>
    )
  }

  const accent = sub.accentColor || '#0ea5e9'
  const accentRgb = hexToRgb(accent)
  const headcount = sub.team?.length || sub.kpis?.headcount || 0
  const obj = sub.objective
  const objPct = obj && obj.target ? Math.min(100, Math.round((obj.current / obj.target) * 100)) : 0
  const k = sub.kpis

  return (
    <div className="portal-container">
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
        <ArrowLeft size={14} /> Filiales
      </Link>

      {/* En-tête */}
      <div className="portal-card" style={{ ['--sub-accent' as string]: accent }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div className="sub-logo" style={{ width: 52, height: 52, fontSize: 20, background: accent }}>
            {initials(sub.name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>{sub.name}</h1>
              <span
                className="sub-status-pill"
                style={{ borderColor: STATUS_COLORS[sub.status], color: STATUS_COLORS[sub.status] }}
              >
                {STATUS_LABELS[sub.status]}
              </span>
              <span
                className="sub-status-pill"
                style={{ borderColor: HEALTH_COLORS[sub.health], color: HEALTH_COLORS[sub.health] }}
              >
                <span className="sub-dot" style={{ background: HEALTH_COLORS[sub.health] }} />{' '}
                {HEALTH_LABELS[sub.health]}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              {[
                sub.sector,
                sub.foundedYear ? `créée ${sub.foundedYear}` : null,
                sub.lead ? `responsable ${sub.lead.name || sub.lead.email}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Aucune information'}
            </p>
            {sub.tagline && (
              <p style={{ margin: '8px 0 0', color: 'var(--text-primary)', fontSize: 14 }}>{sub.tagline}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="portal-button secondary" onClick={() => setEditing((v) => !v)}>
              <Pencil size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Éditer
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
          Synthèse
        </button>
        <button
          type="button"
          className={`admin-tab${tab === 'dossier' ? ' active' : ''}`}
          onClick={() => setTab('dossier')}
        >
          Dossier
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
              label="CA / mois"
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
              label="Marge"
              value={`${k.margin}%`}
              icon={<Percent size={14} />}
              accentColor="#8b5cf6"
              accentRgb="139, 92, 246"
              objective={
                k.marginTarget
                  ? { current: k.margin, target: k.marginTarget, label: `cible ${k.marginTarget}%` }
                  : undefined
              }
            />
            <DashKpiCard
              label="Trésorerie"
              value={formatEUR(k.treasury)}
              icon={<Wallet size={14} />}
              accentColor="#22c55e"
              accentRgb="34, 197, 94"
              hint={k.runwayMonths ? `~${k.runwayMonths} mois de runway` : undefined}
            />
            <DashKpiCard
              label="Équipe"
              value={headcount}
              icon={<Users size={14} />}
              accentColor="#f59e0b"
              accentRgb="245, 158, 11"
              objective={
                k.headcountTarget
                  ? { current: headcount, target: k.headcountTarget, label: `cible ${k.headcountTarget}` }
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
                <ListChecks size={16} /> Projets liés
                {sub.linkedEntity && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                    · entité {sub.linkedEntity}
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
                      {PROJECT_STATUS_LABELS[p.status] || p.status}
                    </span>
                  </Link>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {sub.linkedEntity
                    ? 'Aucun projet interne sur cette entité.'
                    : 'Associe une entité dans l’édition pour agréger les projets internes.'}
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
                <Target size={16} /> Objectif du trimestre
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
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun objectif défini.</p>
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
                <Users size={16} /> Équipe
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
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun membre rattaché.</p>
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
                <Link2 size={16} /> Ressources
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
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun lien.</p>
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
                    <AlertTriangle size={16} /> Alertes
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

      {tab === 'dossier' && <DossierTab sub={sub} accent={accent} />}

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
        <Calendar size={12} /> Mise à jour {new Date(sub.updatedAt).toLocaleDateString('fr-FR')}
      </p>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Supprimer la filiale"
        message={`Supprimer définitivement « ${sub.name} » ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
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
