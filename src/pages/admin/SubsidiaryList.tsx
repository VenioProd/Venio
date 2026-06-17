import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { SkeletonRow } from '../../components/Skeleton'
import SubsidiaryFormDrawer from './subsidiaries/SubsidiaryFormDrawer'
import type { Subsidiary, SubsidiaryPerson } from '../../types/subsidiary.types'
import { HEALTH_COLORS, HEALTH_LABELS } from '../../types/subsidiary.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './Subsidiaries.css'

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

function formatCompactEUR(n: number): string {
  if (!n) return '0 €'
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)} k€`
  return `${Math.round(n)} €`
}

function Trend({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span className="sub-trend sub-trend--up">
        <TrendingUp size={13} /> +{delta}%
      </span>
    )
  if (delta < 0)
    return (
      <span className="sub-trend sub-trend--down">
        <TrendingDown size={13} /> {delta}%
      </span>
    )
  return (
    <span className="sub-trend sub-trend--flat">
      <Minus size={13} /> 0%
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
            return (
              <button
                key={s._id}
                className="sub-card"
                style={{ ['--sub-accent' as string]: s.accentColor }}
                onClick={() => navigate(`/admin/filiales/${s._id}`)}
              >
                <div className="sub-card__head">
                  <div className="sub-logo" style={{ background: s.accentColor }}>
                    {initials(s.name)}
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
                <div className="sub-card__stats">
                  <div>
                    <div className="sub-stat__label">CA / mois</div>
                    <div className="sub-stat__value">{formatCompactEUR(s.kpis?.caMtd ?? 0)}</div>
                  </div>
                  <div>
                    <div className="sub-stat__label">Équipe</div>
                    <div className="sub-stat__value">{headcount}</div>
                  </div>
                  <Trend delta={s.kpis?.caMtdDelta ?? 0} />
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
