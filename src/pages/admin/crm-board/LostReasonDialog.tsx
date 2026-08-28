import React, { useState } from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'

interface LostReasonDialogProps {
  company: string
  reasons: string[]
  saving: boolean
  onCancel: () => void
  onConfirm: (payload: { lostReason: string; lostComment: string }) => void
}

/**
 * Demande le motif au moment de perdre une affaire.
 *
 * C'est le seul endroit où la saisie est exigée : l'API l'accepte vide pour ne
 * pas casser l'agent ni les automatisations, et le tableau de bord affiche
 * franchement la part de « non renseigné ». La contrainte vit donc ici, là où
 * quelqu'un sait pourquoi l'affaire est perdue.
 */
const LostReasonDialog: React.FC<LostReasonDialogProps> = ({ company, reasons, saving, onCancel, onConfirm }) => {
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [comment, setComment] = useState('')

  return (
    <div className="crm-modal-overlay" onClick={onCancel}>
      <div className="crm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="crm-modal-header">
          <h2>Affaire perdue — {company}</h2>
        </div>
        <form
          className="crm-modal-body lost-reason-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!reason) return
            onConfirm({ lostReason: reason, lostComment: comment.trim() })
          }}
        >
          <label className="lost-reason-field">
            <span>Motif</span>
            <CustomSelect
              className="lost-reason-select"
              value={reason}
              onChange={setReason}
              options={reasons.map((value) => ({ value, label: value }))}
            />
          </label>

          <label className="lost-reason-field">
            <span>Précision (facultative)</span>
            <textarea
              className="portal-input"
              rows={3}
              maxLength={2000}
              placeholder="Ce qui a fait basculer la décision…"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>

          <p className="lost-reason-hint">Ce motif alimente les statistiques de perte du pilotage commercial.</p>

          <div className="crm-modal-actions">
            <button type="button" className="portal-button secondary" onClick={onCancel} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="portal-button" disabled={saving || !reason}>
              {saving ? 'Enregistrement…' : 'Marquer perdue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LostReasonDialog
