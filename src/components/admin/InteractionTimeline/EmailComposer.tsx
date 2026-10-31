import React, { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { SendEmailInput, SendEmailResult, TimelineSubject } from '../../../types/interaction.types'

interface EmailComposerProps {
  subject: TimelineSubject
  busy: boolean
  onCancel: () => void
  onSend: (input: SendEmailInput) => Promise<SendEmailResult | null>
}

/**
 * Rédaction d'un email depuis la fiche. L'envoi est journalisé côté serveur,
 * y compris en cas d'échec : on affiche donc le détail par destinataire plutôt
 * qu'un simple succès ou échec global.
 */
const EmailComposer: React.FC<EmailComposerProps> = ({ subject, busy, onCancel, onSend }) => {
  const { t } = useI18n()
  const [to, setTo] = useState(subject.contactEmail)
  const [emailSubject, setEmailSubject] = useState('')
  const [body, setBody] = useState('')
  const [outcome, setOutcome] = useState<SendEmailResult | null>(null)

  const recipients = to
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return (
    <form
      className="interaction-composer interaction-email-composer"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!emailSubject.trim() || !body.trim() || recipients.length === 0) return
        const result = await onSend({ subject: emailSubject.trim(), body, recipients })
        if (!result) return
        setOutcome(result)
        if (result.failed === 0) {
          setEmailSubject('')
          setBody('')
        }
      }}
    >
      <div className="interaction-composer-head">
        <label className="interaction-email-field">
          <span>{t('compB.email.recipients')}</span>
          <input
            type="text"
            className="portal-input"
            placeholder={t('compB.email.recipientsPlaceholder')}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <label className="interaction-email-field">
          <span>{t('compB.email.subject')}</span>
          <input
            type="text"
            className="portal-input"
            maxLength={500}
            value={emailSubject}
            onChange={(event) => setEmailSubject(event.target.value)}
          />
        </label>
      </div>

      <textarea
        className="portal-input"
        rows={6}
        maxLength={20000}
        placeholder={t('compB.email.bodyPlaceholder')}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />

      {!subject.contactEmail && recipients.length === 0 && (
        <p className="interaction-hint">
          {subject.type === 'LEAD' ? t('compB.email.noAddressLead') : t('compB.email.noAddressClient')}
        </p>
      )}

      {outcome && (
        <div className={`interaction-outcome ${outcome.failed > 0 ? 'is-warning' : ''}`}>
          {outcome.failed === 0
            ? t('compB.email.sentAll', { count: outcome.sent })
            : t('compB.email.sentPartial', { sent: outcome.sent, total: outcome.total })}
          {outcome.failed > 0 && (
            <ul>
              {outcome.results
                .filter((result) => !result.success)
                .map((result) => (
                  <li key={result.email}>
                    {result.email} — {result.error || t('compB.timeline.notDelivered')}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <div className="interaction-composer-actions">
        <button type="button" className="portal-button secondary" onClick={onCancel} disabled={busy}>
          {t('common.close')}
        </button>
        <button
          type="submit"
          className="portal-button"
          disabled={busy || !emailSubject.trim() || !body.trim() || recipients.length === 0}
        >
          {busy ? t('compB.email.sending') : t('compB.email.send')}
        </button>
      </div>
    </form>
  )
}

export default EmailComposer
