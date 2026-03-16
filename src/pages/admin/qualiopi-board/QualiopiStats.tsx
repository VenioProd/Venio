import React from 'react'
import type { QualiopiIndicator, QualiopiSubElement } from './types'
import { getProgress } from './types'

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
  return (
    <>
      {/* View toggle */}
      <div className="qualiopi-view-toggle">
        <button className={`qualiopi-view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="Vue liste">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Liste
        </button>
        <button className={`qualiopi-view-btn ${viewMode === 'kanban' ? 'active' : ''}`} onClick={() => setViewMode('kanban')} title="Vue kanban">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/></svg>
          Kanban
        </button>
      </div>

      {/* Stats cards */}
      <div className="qualiopi-stats-row">
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number">{criteriaCount}</span>
          <span className="qualiopi-stat-label">Criteres</span>
        </div>
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number">{allIndicators.length}</span>
          <span className="qualiopi-stat-label">Indicateurs</span>
        </div>
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number">{allSubs.length}</span>
          <span className="qualiopi-stat-label">Sous-elements</span>
        </div>
        <div className="qualiopi-stat-card">
          <span className="qualiopi-stat-number" style={{ color: '#ff0080' }}>{allSubsDone}</span>
          <span className="qualiopi-stat-label">Completes</span>
        </div>
      </div>

      {/* Global progress bar */}
      <div className="portal-card qualiopi-progress-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Progression globale</span>
          <span style={{ color: '#ff0080', fontWeight: 700, fontSize: 22 }}>{globalProgress.percent}%</span>
        </div>
        <div className="qualiopi-global-bar">
          <div className="qualiopi-bar-done" style={{ width: `${(globalProgress.done / Math.max(globalProgress.total, 1)) * 100}%` }} />
          <div className="qualiopi-bar-progress" style={{ width: `${(globalProgress.inProgress / Math.max(globalProgress.total, 1)) * 100}%` }} />
          <div className="qualiopi-bar-blocked" style={{ width: `${(globalProgress.blocked / Math.max(globalProgress.total, 1)) * 100}%` }} />
        </div>
        <div className="qualiopi-legend">
          <span><span className="qualiopi-legend-dot" style={{ background: '#22c55e' }} /> {globalProgress.done} fait(s)</span>
          <span><span className="qualiopi-legend-dot" style={{ background: '#f59e0b' }} /> {globalProgress.inProgress} en cours</span>
          <span><span className="qualiopi-legend-dot" style={{ background: '#ef4444' }} /> {globalProgress.blocked} bloque(s)</span>
          <span style={{ color: 'var(--text-muted)' }}>{globalProgress.total} indicateurs au total</span>
        </div>
      </div>
    </>
  )
}

export default QualiopiStats
