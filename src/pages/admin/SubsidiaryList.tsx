import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { SkeletonRow } from '../../components/Skeleton'
import SubsidiaryFormDrawer from './subsidiaries/SubsidiaryFormDrawer'
import type { Subsidiary, SubsidiaryPerson } from '../../types/subsidiary.types'
import { HEALTH_COLORS, HEALTH_LABELS, STATUS_LABELS, STATUS_COLORS } from '../../types/subsidiary.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Subsidiaries.css'

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?'
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

function formatCompactEUR(n: number): string {
  if (!n) return '0 €'
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)} k€`
  return `${Math.round(n)} €`
}

function Delta({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span className="sub-kpi__delta sub-kpi__delta--up">
        <TrendingUp size={11} style={{ verticalAlign: -1 }} /> +{delta}%
      </span>
    )
  if (delta < 0)
    return (
      <span className="sub-kpi__delta sub-kpi__delta--down">
        <TrendingDown size={11} style={{ verticalAlign: -1 }} /> {delta}%
      </span>
    )
  return (
    <span className="sub-kpi__delta sub-kpi__delta--flat">
      <Minus size={11} style={{ verticalAlign: -1 }} />
    </span>
  )
}

export default function SubsidiaryList() {
  const navigate = useNavigate()
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([])
  const [admins, setAdmins] = useState<SubsidiaryPerson[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    apiFetch<{ subsidiaries: Subsidiary[] }>('/api/admin/subsidiaries')
      .then((d) => setSubsidiaries(d.subsidiaries || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    apiFetch<{ users: SubsidiaryPerson[] }>('/api/admin/admins')
      .then((d) => setAdmins(d.users || []))
      .catch(() => {})
    apiFetch<{ entities: string[] }>('/api/admin/subsidiaries/meta')
      .then((d) => setEntities(d.entities || []))
      .catch(() => {})
  }, [load])

  const totalCa = subsidiaries.reduce((acc, s) => acc + (s.kpis?.caMtd ?? 0), 0)
  const totalHeadcount = subsidiaries.reduce(
    (acc, s) => acc + (s.headcount ?? s.team?.length ?? s.kpis?.headcount ?? 0),
    0,
  )
  const activeCount = subsidiaries.filter((s) => s.status === 'ACTIVE').length

  return (
    <div className="portal-container">
      <div className="admin-page-header">
        <div>
          <h1>Filiales</h1>
          <p className="admin-page-subtitle">
            Vue portefeuille · les business internes du groupe Venio · réservé super admin
          </p>
        </div>
        <div className="admin-quick-actions">
          <button type="button" className="portal-button" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} style={{ verticalAlign: -2, marginRight: 5 }} />
            Nouvelle filiale
          </button>
        </div>
      </div>

      {!loading && subsidiaries.length > 0 && (
        <div className="sub-summary">
          <div className="sub-summary__item">
            <div className="sub-summary__label">Filiales</div>
            <div className="sub-summary__value">{subsidiaries.length}</div>
          </div>
          <div className="sub-summary__item">
            <div className="sub-summary__label">Actives</div>
            <div className="sub-summary__value">{activeCount}</div>
          </div>
          <div className="sub-summary__item">
            <div className="sub-summary__label">CA cumulé / mois</div>
            <div className="sub-summary__value">{formatCompactEUR(totalCa)}</div>
          </div>
          <div className="sub-summary__item">
            <div className="sub-summary__label">Effectif total</div>
            <div className="sub-summary__value">{totalHeadcount}</div>
          </div>
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

      {loading ? (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : subsidiaries.length === 0 && !showForm ? (
        <div className="admin-empty-state" style={{ marginTop: 32 }}>
          <Building2 size={32} className="admin-empty-state-icon" />
          <p className="admin-empty-state-text">
            Aucune filiale pour l’instant. Crée la première (Yumi, Arrow, Jiraya…).
          </p>
        </div>
      ) : (
        <div className="sub-grid">
          {subsidiaries.map((s) => {
            const headcount = s.headcount ?? s.team?.length ?? s.kpis?.headcount ?? 0
            const obj = s.objective
            const objPct = obj && obj.target ? Math.min(100, Math.round((obj.current / obj.target) * 100)) : 0
            return (
              <button
                key={s._id}
                className="sub-card"
                style={{
                  ['--sub-accent' as string]: s.accentColor,
                  ['--sub-accent-rgb' as string]: hexToRgb(s.accentColor),
                }}
                onClick={() => navigate(`/admin/filiales/${s._id}`)}
              >
                <div className="sub-card__band" />
                <div className="sub-card__body">
                  <div className="sub-card__head">
                    <div className="sub-logo" style={{ background: s.logoUrl ? 'transparent' : s.accentColor }}>
                      {s.logoUrl ? <img src={s.logoUrl} alt={s.name} className="sub-logo__img" /> : initials(s.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sub-card__title">{s.name}</div>
                      <div className="sub-card__sector">{s.sector || '—'}</div>
                    </div>
                    <span
                      className="sub-dot"
                      style={{ background: HEALTH_COLORS[s.health] }}
                      title={HEALTH_LABELS[s.health]}
                    />
                  </div>

                  <div className="sub-card__footer">
                    <span
                      className="sub-status-pill"
                      style={{ borderColor: STATUS_COLORS[s.status], color: STATUS_COLORS[s.status] }}
                    >
                      {STATUS_LABELS[s.status]}
                    </span>
                    {s.tags?.slice(0, 2).map((t) => (
                      <span key={t} className="admin-tag">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="sub-card__kpis">
                    <div>
                      <div className="sub-kpi__label">CA / mois</div>
                      <div className="sub-kpi__value">
                        {formatCompactEUR(s.kpis?.caMtd ?? 0)} <Delta delta={s.kpis?.caMtdDelta ?? 0} />
                      </div>
                    </div>
                    <div>
                      <div className="sub-kpi__label">Marge</div>
                      <div className="sub-kpi__value">{s.kpis?.margin ?? 0}%</div>
                    </div>
                    <div>
                      <div className="sub-kpi__label">Équipe</div>
                      <div className="sub-kpi__value">{headcount}</div>
                    </div>
                  </div>

                  {obj && obj.label ? (
                    <div className="sub-card__objective">
                      <div className="sub-card__objective-row">
                        <span>{obj.label}</span>
                        <span>
                          {obj.current} / {obj.target} {obj.unit}
                        </span>
                      </div>
                      <div className="sub-progress">
                        <span style={{ width: `${objPct}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}

          <button className="sub-card sub-card--add" onClick={() => setShowForm(true)}>
            <Plus size={18} /> Ajouter une filiale
          </button>
        </div>
      )}
    </div>
  )
}
