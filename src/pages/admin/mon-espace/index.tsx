import PageHeader from '../../../components/admin/ui/PageHeader'
import React, { useEffect, useState, useCallback } from 'react'
import { Settings, Check } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import RoleCockpitFocus from '../../../components/RoleCockpitFocus'
import BentoGrid from './BentoGrid'
import { renderWidget } from './widgets'
import { OverviewProvider } from './widgets/OverviewWidgets'
import {
  WIDGET_KEYS,
  WIDGET_LABELS,
  defaultLayoutWidgets,
  mergeLayoutWidgets,
  type WidgetKey,
} from './widgets/registry'
import { getLayout, saveLayout } from '../../../services/workspace'
import type { WidgetConfig } from '../../../types/workspace.types'
import '../AdminPortal.css'
import './MonEspace.css'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return translate('adminAccess.monEspace.greetingMorning')
  if (h < 18) return translate('adminAccess.monEspace.greetingAfternoon')
  return translate('adminAccess.monEspace.greetingEvening')
}

export default function MonEspace() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [widgets, setWidgets] = useState<WidgetConfig[]>([])
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getLayout()
      .then((layout) => {
        if (cancelled) return
        // Merge minimal : les clés du registry absentes du layout sauvegardé sont ajoutées en fin.
        setWidgets(layout.widgets.length ? mergeLayoutWidgets(layout.widgets) : defaultLayoutWidgets())
      })
      .catch(() => setWidgets(defaultLayoutWidgets()))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback((next: WidgetConfig[]) => {
    setWidgets(next)
    saveLayout({ widgets: next }).catch(() => {})
  }, [])

  const enableWidget = (key: WidgetKey) => {
    persist(widgets.map((w) => (w.key === key ? { ...w, enabled: true } : w)))
  }

  const disabledKeys = WIDGET_KEYS.filter((k) => !widgets.find((w) => w.key === k && w.enabled))

  if (loading)
    return (
      <div className="mon-espace pilotage-page">
        <p className="subtitle">{t('adminAccess.monEspace.loading')}</p>
      </div>
    )

  return (
    <div className="mon-espace pilotage-page">
      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.overview')}
        title={`${greeting()} ${user?.name || ''}`}
        actions={
          <button className="portal-button secondary" onClick={() => setEditing((e) => !e)}>
            {editing ? (
              <>
                <Check size={16} /> {t('adminAccess.monEspace.done')}
              </>
            ) : (
              <>
                <Settings size={16} /> {t('adminAccess.monEspace.customize')}
              </>
            )}
          </button>
        }
      />

      <RoleCockpitFocus />

      {editing && disabledKeys.length > 0 && (
        <div className="mon-espace__drawer">
          <span className="label">{t('adminAccess.monEspace.addWidget')}</span>
          {disabledKeys.map((k) => (
            <button key={k} className="chip" onClick={() => enableWidget(k)}>
              + {t(WIDGET_LABELS[k])}
            </button>
          ))}
        </div>
      )}

      <OverviewProvider>
        <BentoGrid
          widgets={widgets}
          editing={editing}
          onChange={persist}
          renderWidget={(key) => renderWidget(key as WidgetKey)}
        />
      </OverviewProvider>
    </div>
  )
}
