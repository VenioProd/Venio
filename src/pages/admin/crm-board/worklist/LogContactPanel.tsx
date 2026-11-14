import React, { useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { inDays } from './PostponeMenu'
import { toDateTimeLocal, fromDateTimeLocal } from '../../../../lib/formatUtils'

interface LogContactPanelProps {
  /** Délai de relance pré-rempli, issu des réglages CRM pour le statut du lead. */
  followUpDays: number
  saving: boolean
  /** Nom accessible du formulaire (« Contact avec … »). */
  label?: string
  onCancel: () => void
  onSubmit: (payload: { nextActionAt: string | null; note: string }) => void
}

/**
 * « Fait » : note l'échange du jour et reprogramme la relance.
 * Sans reprogrammation, la ligne resterait en retard et reviendrait dans la
 * file dès le lendemain — la file ne se viderait jamais.
 */
const LogContactPanel: React.FC<LogContactPanelProps> = ({ followUpDays, saving, label, onCancel, onSubmit }) => {
  const { t } = useI18n()
  const [nextActionAt, setNextActionAt] = useState<string>(() => toDateTimeLocal(inDays(followUpDays).toISOString()))
  const [note, setNote] = useState('')

  return (
    <form
      className="crm-today-panel"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({ nextActionAt: nextActionAt ? fromDateTimeLocal(nextActionAt) : null, note: note.trim() })
      }}
    >
      <div className="crm-today-panel__fields">
        <label>
          <span>{t('crm.logContact.nextFollowUp')}</span>
          <input
            type="datetime-local"
            className="portal-input"
            value={nextActionAt}
            onChange={(event) => setNextActionAt(event.target.value)}
          />
        </label>
        <label className="crm-today-panel__grow">
          <span>{t('crm.logContact.noteOptional')}</span>
          <input
            type="text"
            className="portal-input"
            placeholder={t('crm.logContact.notePlaceholder')}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </div>
      {!nextActionAt && <p className="crm-today-panel__hint">{t('crm.logContact.noFollowUpHint')}</p>}
      <div className="crm-today-panel__actions">
        <button type="button" className="crm-ui-btn crm-ui-btn--ghost" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="crm-ui-btn crm-ui-btn--primary" disabled={saving}>
          {saving ? t('crm.lost.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}

export default LogContactPanel
