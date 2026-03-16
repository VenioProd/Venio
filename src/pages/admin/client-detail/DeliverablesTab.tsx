import React from 'react'
import type { DeliverablesTabProps } from './types'

const DeliverablesTab: React.FC<DeliverablesTabProps> = ({ deliverables }) => (
  <div className="admin-list">
    {deliverables.length === 0 ? (
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon">📦</div>
        <p className="admin-empty-state-text">Aucun livrable</p>
      </div>
    ) : (
      deliverables.map((deliverable) => (
        <div key={deliverable._id} className="admin-list-item">
          <div className="admin-list-item-content">
            <h3 className="admin-list-item-title">{deliverable.title}</h3>
            <p className="admin-list-item-subtitle">{deliverable.projectName} • {deliverable.itemType}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="portal-badge">{deliverable.visibleToClient ? 'Visible client' : 'Admin only'}</span>
              <span className="portal-badge">{deliverable.isDownloadable ? 'Téléchargeable' : 'Lecture seule'}</span>
            </div>
          </div>
        </div>
      ))
    )}
  </div>
)

export default DeliverablesTab
