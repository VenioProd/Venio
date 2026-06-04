import React, { createContext, useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin, Bell, Calendar } from 'lucide-react'
import { getOverview } from '../../../../services/workspace'
import type { WorkspaceOverview } from '../../../../types/workspace.types'

const OverviewCtx = createContext<WorkspaceOverview | null>(null)

export function OverviewProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceOverview | null>(null)
  useEffect(() => { getOverview().then(setData).catch(() => setData({ kpis: [], overdue: [], week: [], pinned: [], activity: [] })) }, [])
  return <OverviewCtx.Provider value={data}>{children}</OverviewCtx.Provider>
}

const useOverview = () => useContext(OverviewCtx)

export function KpiWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title">Mes chiffres</div>
      <div className="kpi-grid">
        {(o?.kpis ?? []).map((k) => (
          <Link to={k.link} key={k.label} className="kpi-card">
            <b>{k.value}</b><span>{k.label}</span>
          </Link>
        ))}
        {o && o.kpis.length === 0 && <p className="widget-empty">Aucun indicateur</p>}
      </div>
    </div>
  )
}

export function PinnedWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title"><Pin size={15} /> Épinglés</div>
      <ul className="widget-list">
        {(o?.pinned ?? []).map((p) => <li key={p._id}><Link to={p.link}>{p.title}</Link></li>)}
        {o && o.pinned.length === 0 && <li className="widget-empty">Rien d'épinglé</li>}
      </ul>
    </div>
  )
}

export function ActivityWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title"><Bell size={15} /> Activité</div>
      <ul className="widget-list">
        {(o?.activity ?? []).map((a) => (
          <li key={a._id} className="widget-activity"><Link to={a.link}><b>{a.title}</b><span>{a.message}</span></Link></li>
        ))}
        {o && o.activity.length === 0 && <li className="widget-empty">Aucune activité récente</li>}
      </ul>
    </div>
  )
}

export function WeekWidget() {
  const o = useOverview()
  return (
    <div className="widget">
      <div className="widget-title"><Calendar size={15} /> Cette semaine</div>
      <ul className="widget-list">
        {(o?.week ?? []).map((t) => (
          <li key={t._id} className="widget-week">
            <span className="widget-week__date">{t.dueDate ? new Date(t.dueDate).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }) : ''}</span>
            <span>{t.title}</span>
          </li>
        ))}
        {o && o.week.length === 0 && <li className="widget-empty">Pas d'échéance cette semaine</li>}
      </ul>
    </div>
  )
}
