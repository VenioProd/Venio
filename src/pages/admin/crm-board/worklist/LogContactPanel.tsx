import React, { useState } from 'react'
import { inDays } from './PostponeMenu'
import { toDateTimeLocal, fromDateTimeLocal } from '../../../../lib/formatUtils'

interface LogContactPanelProps {
  /** Délai de relance pré-rempli, issu des réglages CRM pour le statut du lead. */
  followUpDays: number
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: { nextActionAt: string | null; note: string }) => void
}

/**
 * « Marquer contacté » : note l'échange du jour et reprogramme la relance.
 * Sans reprogrammation, la ligne resterait en retard et reviendrait dans la
 * file dès le lendemain — la file ne se viderait jamais.
 */
const LogContactPanel: React.FC<LogContactPanelProps> = ({ followUpDays, saving, onCancel, onSubmit }) => {
  const [nextActionAt, setNextActionAt] = useState<string>(() => toDateTimeLocal(inDays(followUpDays).toISOString()))
  const [note, setNote] = useState('')

  return (
    <form
      className="crm-worklist-panel"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({ nextActionAt: nextActionAt ? fromDateTimeLocal(nextActionAt) : null, note: note.trim() })
      }}
    >
      <div className="crm-worklist-panel-fields">
        <label>
          <span>Prochaine relance</span>
          <input
            type="datetime-local"
            className="portal-input"
            value={nextActionAt}
            onChange={(event) => setNextActionAt(event.target.value)}
          />
        </label>
        <label className="crm-worklist-panel-note">
          <span>Note (facultative)</span>
          <input
            type="text"
            className="portal-input"
            placeholder="Ce qui s'est dit…"
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      <div className="crm-worklist-panel-actions">
        <button type="button" className="portal-button secondary" onClick={onCancel} disabled={saving}>
          Annuler
        </button>
        <button type="submit" className="portal-button" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      {!nextActionAt && (
        <p className="crm-worklist-panel-hint">
          Sans prochaine relance, ce lead sortira de vos échéances et n'apparaîtra plus que s'il dérive.
        </p>
      )}
    </form>
  )
}

export default LogContactPanel
