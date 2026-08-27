import React, { useState } from 'react'
import type { InteractionKind, LogInteractionInput } from '../../../types/interaction.types'
import { LOGGABLE_KINDS } from './constants'

interface InteractionComposerProps {
  busy: boolean
  onSubmit: (input: LogInteractionInput) => Promise<boolean>
}

function nowForInput(): string {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

/**
 * Consigner un échange déjà eu : appel, rendez-vous ou note. La date est
 * modifiable parce qu'on saisit souvent après coup — un appel de mardi
 * consigné le jeudi doit rester daté de mardi.
 */
const InteractionComposer: React.FC<InteractionComposerProps> = ({ busy, onSubmit }) => {
  const [kind, setKind] = useState<InteractionKind>('CALL')
  const [occurredAt, setOccurredAt] = useState<string>(nowForInput)
  const [body, setBody] = useState('')

  return (
    <form
      className="interaction-composer"
      onSubmit={async (event) => {
        event.preventDefault()
        const text = body.trim()
        if (!text) return
        const ok = await onSubmit({
          kind,
          direction: kind === 'NOTE' ? 'NONE' : 'OUT',
          occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
          body: text,
        })
        if (!ok) return
        setBody('')
        setOccurredAt(nowForInput())
      }}
    >
      <div className="interaction-composer-head">
        <div className="interaction-kind-picker" role="group" aria-label="Type d'échange">
          {LOGGABLE_KINDS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={kind === option.key ? 'active' : ''}
              onClick={() => setKind(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="interaction-composer-date">
          <span>Date</span>
          <input
            type="datetime-local"
            className="portal-input"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
      </div>

      <textarea
        className="portal-input"
        rows={3}
        maxLength={20000}
        placeholder={kind === 'NOTE' ? "Ce qu'il faut retenir…" : "Ce qui s'est dit…"}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />

      <div className="interaction-composer-actions">
        <button type="submit" className="portal-button" disabled={busy || !body.trim()}>
          {busy ? 'Enregistrement…' : 'Consigner'}
        </button>
      </div>
    </form>
  )
}

export default InteractionComposer
