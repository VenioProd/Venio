import React, { useEffect, useState, useCallback } from 'react'
import { Settings, Check } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import BentoGrid from './BentoGrid'
import { renderWidget } from './widgets'
import { WIDGET_KEYS, WIDGET_LABELS, defaultLayoutWidgets, type WidgetKey } from './widgets/registry'
import { getLayout, saveLayout } from '../../../services/workspace'
import type { WidgetConfig } from '../../../types/workspace.types'
import './MonEspace.css'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export default function MonEspace() {
  const { user } = useAuth()
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getLayout()
      .then((layout) => {
        if (cancelled) return
        setWidgets(layout.widgets.length ? layout.widgets : defaultLayoutWidgets())
      })
      .catch(() => setWidgets(defaultLayoutWidgets()))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const persist = useCallback((next: WidgetConfig[]) => {
    setWidgets(next)
    saveLayout({ widgets: next }).catch(() => {})
  }, [])

  const enableWidget = (key: WidgetKey) => {
    persist(widgets.map((w) => (w.key === key ? { ...w, enabled: true } : w)))
  }

  const disabledKeys = WIDGET_KEYS.filter((k) => !widgets.find((w) => w.key === k && w.enabled))

  if (loading) return <div className="mon-espace"><p className="subtitle">Chargement…</p></div>

  return (
    <div className="mon-espace">
      <div className="mon-espace__header">
        <h1 className="mon-espace__hello">{greeting()} {user?.name} 👋</h1>
        <button className="btn-secondary" onClick={() => setEditing((e) => !e)}>
          {editing ? <><Check size={16} /> Terminer</> : <><Settings size={16} /> Personnaliser</>}
        </button>
      </div>

      {editing && disabledKeys.length > 0 && (
        <div className="mon-espace__drawer">
          <span className="label">Ajouter un widget :</span>
          {disabledKeys.map((k) => (
            <button key={k} className="chip" onClick={() => enableWidget(k)}>+ {WIDGET_LABELS[k]}</button>
          ))}
        </div>
      )}

      <BentoGrid
        widgets={widgets}
        editing={editing}
        onChange={persist}
        renderWidget={(key) => renderWidget(key as WidgetKey)}
      />
    </div>
  )
}
