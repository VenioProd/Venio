import React from 'react'
import type { QualiopiIndicator, QualiopiSubElement } from './types'
import { getProgress } from './types'
import { useI18n } from '../../../context/I18nContext'

interface QualiopiStatsProps {
  criteriaCount: number
  allIndicators: QualiopiIndicator[]
  allSubs: QualiopiSubElement[]
  allSubsDone: number
  globalProgress: ReturnType<typeof getProgress>
  viewMode: 'list' | 'kanban'
  setViewMode: (v: 'list' | 'kanban') => void
}

const QualiopiStats: React.FC<QualiopiStatsProps> = ({
  criteriaCount,
  allIndicators,
  allSubs,
  allSubsDone,
  globalProgress,
  viewMode,
  setViewMode,
}) => {
  const { t } = useI18n()
  return (
    <>
      {/* View toggle */}
      <div className="qualiopi-view-toggle">
        <button
          className={`qualiopi-view-btn ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
          title={t('orgs.qualiopi.stats.listView')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          {t('orgs.qualiopi.stats.list')}
        </button>
        <button
          className={`qualiopi-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
          onClick={() => setViewMode('kanban')}
          title={t('orgs.qualiopi.stats.kanbanView')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="5" height="18" rx="1" />
            <rect x="10" y="3" width="5" height="12" rx="1" />
            <rect x="17" y="3" width="5" height="15" rx="1" />
          </svg>
          {t('orgs.qualiopi.stats.kanban')}
        </button>
      </div>

      {/* Stats cards */}
      <div className="qualiopi-stats-row">
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number">{criteriaCount}</span>
          <span className="qualiopi-stat-label">{t('orgs.qualiopi.stats.criteria')}</span>
        </div>
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number">{allIndicators.length}</span>
          <span className="qualiopi-stat-label">{t('orgs.qualiopi.stats.indicators')}</span>
        </div>
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number">{allSubs.length}</span>
          <span className="qualiopi-stat-label">{t('orgs.qualiopi.stats.subElements')}</span>
        </div>
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number" style={{ color: 'var(--primary)' }}>
            {allSubsDone}
          </span>
          <span className="qualiopi-stat-label">{t('orgs.qualiopi.stats.completed')}</span>
        </div>
      </div>

      {/* Global progress bar */}
      <div className="portal-card qualiopi-progress-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t('orgs.qualiopi.stats.globalProgress')}</span>
          <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 22 }}>{globalProgress.percent}%</span>
        </div>
        <div className="qualiopi-global-bar">
          <div
            className="qualiopi-bar-done"
            style={{ width: `${(globalProgress.done / Math.max(globalProgress.total, 1)) * 100}%` }}
          />
          <div
            className="qualiopi-bar-progress"
            style={{ width: `${(globalProgress.inProgress / Math.max(globalProgress.total, 1)) * 100}%` }}
          />
          <div
            className="qualiopi-bar-blocked"
            style={{ width: `${(globalProgress.blocked / Math.max(globalProgress.total, 1)) * 100}%` }}
          />
        </div>
        <div className="qualiopi-legend">
          <span>
            <span className="qualiopi-legend-dot" style={{ background: '#22c55e' }} />{' '}
            {t('orgs.qualiopi.stats.legendDone', { count: globalProgress.done })}
          </span>
          <span>
            <span className="qualiopi-legend-dot" style={{ background: '#f59e0b' }} />{' '}
            {t('orgs.qualiopi.stats.legendInProgress', { count: globalProgress.inProgress })}
          </span>
          <span>
            <span className="qualiopi-legend-dot" style={{ background: '#ef4444' }} />{' '}
            {t('orgs.qualiopi.stats.legendBlocked', { count: globalProgress.blocked })}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {t('orgs.qualiopi.stats.legendTotal', { count: globalProgress.total })}
          </span>
        </div>
      </div>
    </>
  )
}

export default QualiopiStats
