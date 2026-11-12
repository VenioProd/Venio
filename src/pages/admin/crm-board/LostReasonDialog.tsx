import { createPortal } from 'react-dom'
import React, { useState } from 'react'
import CustomSelect from '../../../components/admin/CustomSelect'
import { useI18n } from '../../../context/I18nContext'

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
  const { t } = useI18n()
  const [reason, setReason] = useState(reasons[0] ?? '')
  const [comment, setComment] = useState('')

  return createPortal(
    <div className="crm-modal-overlay" onClick={onCancel}>
      <div className="crm-modal" onClick={(event) => event.stopPropagation()}>
        <div className="crm-modal-header">
          <h2>{t('crm.lost.title', { company })}</h2>
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
            <span>{t('crm.lost.reason')}</span>
            <CustomSelect
              className="lost-reason-select"
              value={reason}
              onChange={setReason}
              options={reasons.map((value) => ({ value, label: value }))}
            />
          </label>

          <label className="lost-reason-field">
            <span>{t('crm.lost.detail')}</span>
            <textarea
              className="portal-input"
              rows={3}
              maxLength={2000}
              placeholder={t('crm.lost.detailPlaceholder')}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>

          <p className="lost-reason-hint">{t('crm.lost.hint')}</p>

          <div className="crm-modal-actions">
            <button type="button" className="portal-button secondary" onClick={onCancel} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="portal-button" disabled={saving || !reason}>
              {saving ? t('crm.lost.saving') : t('crm.lost.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export default LostReasonDialog
