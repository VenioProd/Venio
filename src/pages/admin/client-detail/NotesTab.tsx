import React from 'react'
import type { NotesTabProps } from './types'

const NotesTab: React.FC<NotesTabProps> = ({
  notesAndActivities,
  noteDraft,
  setNoteDraft,
  addNote,
  removeNote,
  saving,
}) => (
  <div className="portal-list">
    <form onSubmit={addNote} style={{ display: 'grid', gap: 10 }}>
      <textarea
        className="portal-input"
        placeholder="Ajouter une note interne"
        rows={3}
        value={noteDraft}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setNoteDraft(event.target.value)}
      />
      <button type="submit" className="portal-button" disabled={saving}>Ajouter une note</button>
    </form>

    <div className="admin-list">
      {notesAndActivities.map((item) => (
        <div key={item._id} className="admin-list-item">
          <div className="admin-list-item-content">
            <h3 className="admin-list-item-title">{item.label}</h3>
            <p className="admin-list-item-subtitle">{item.actor} • {new Date(item.createdAt).toLocaleString()}</p>
          </div>
          <div className="admin-list-item-actions">
            {item.type === 'NOTE' && (
              <button type="button" className="portal-button secondary" onClick={() => removeNote(item.rawId)} disabled={saving}>
                Supprimer
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default NotesTab
