import { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { CallEffect, CallOutcome } from '../../../services/externalSales'
import type { SectionProps } from './types'

const EFFECTS: CallEffect[] = ['NONE', 'VOICEMAIL', 'CALLBACK', 'MEETING', 'LOST', 'WRONG_NUMBER', 'DO_NOT_CALL']

export default function CallsSection({
  settings,
  canManage,
  updateSettings,
}: SectionProps & { updateSettings: (updates: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n()
  const [outcomes, setOutcomes] = useState<CallOutcome[]>(settings.callOutcomes ?? [])
  const [tags, setTags] = useState<string[]>(settings.callScriptTags ?? [])
  const [region, setRegion] = useState<string>(settings.callDefaultRegion ?? 'FR')
  const [saving, setSaving] = useState(false)
  const change = (index: number, patch: Partial<CallOutcome>) => {
    setOutcomes((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)))
  }
  const persist = async () => {
    setSaving(true)
    try {
      await updateSettings({ callOutcomes: outcomes, callScriptTags: tags, callDefaultRegion: region })
    } finally {
      setSaving(false)
    }
  }
  return (
    <section className="crm-settings-section">
      <div className="crm-settings-section-header">
        <h2>{t('commercial.settings.title')}</h2>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void persist()
        }}
      >
        <fieldset disabled={!canManage || saving} className="crm-call-settings-form">
          {outcomes.map((outcome, index) => (
            <div className="crm-settings-item crm-settings-item-full" key={index}>
              <label>
                {t('commercial.settings.code')}
                <input
                  className="crm-settings-text-input"
                  required
                  pattern="[A-Z][A-Z0-9_]{0,59}"
                  value={outcome.value}
                  onChange={(event) => change(index, { value: event.target.value })}
                />
              </label>
              <label>
                {t('commercial.settings.fr')}
                <input
                  className="crm-settings-text-input"
                  required
                  maxLength={120}
                  value={outcome.fr}
                  onChange={(event) => change(index, { fr: event.target.value })}
                />
              </label>
              <label>
                {t('commercial.settings.en')}
                <input
                  className="crm-settings-text-input"
                  required
                  maxLength={120}
                  value={outcome.en}
                  onChange={(event) => change(index, { en: event.target.value })}
                />
              </label>
              <label>
                {t('commercial.settings.effect')}
                <select
                  className="crm-settings-select"
                  value={outcome.effect}
                  onChange={(event) => change(index, { effect: event.target.value as CallEffect })}
                >
                  {EFFECTS.map((effect) => (
                    <option value={effect} key={effect}>
                      {t(`commercial.settings.effect.${effect}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="crm-settings-item-controls crm-call-reached">
                <input
                  type="checkbox"
                  checked={outcome.reached}
                  onChange={(event) => change(index, { reached: event.target.checked })}
                />{' '}
                {t('commercial.settings.reached')}
              </label>
              <label>
                {t('commercial.settings.retry')}
                <input
                  className="crm-settings-text-input"
                  type="number"
                  min={0.01}
                  step="any"
                  value={outcome.retryAfterMinutes ?? ''}
                  onChange={(event) =>
                    change(index, { retryAfterMinutes: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </label>
              <button
                className="portal-button secondary"
                type="button"
                disabled={outcomes.length <= 1}
                onClick={() => setOutcomes((current) => current.filter((_, position) => position !== index))}
              >
                {t('commercial.settings.remove')}
              </button>
            </div>
          ))}
          <button
            className="portal-button secondary"
            type="button"
            disabled={outcomes.length >= 9}
            onClick={() =>
              setOutcomes((current) => [
                ...current,
                { value: '', fr: '', en: '', effect: 'NONE', reached: false, retryAfterMinutes: null },
              ])
            }
          >
            {t('commercial.settings.addOutcome')}
          </button>
          <div className="crm-settings-item crm-settings-item-full">
            <h3>{t('commercial.calls.script')}</h3>
            {tags.map((tag, index) => (
              <div className="crm-settings-item-controls" key={index}>
                <input
                  className="crm-settings-text-input"
                  aria-label={t('commercial.calls.script')}
                  required
                  maxLength={60}
                  value={tag}
                  onChange={(event) =>
                    setTags((current) =>
                      current.map((value, position) => (position === index ? event.target.value : value)),
                    )
                  }
                />
                <button
                  className="portal-button secondary"
                  type="button"
                  onClick={() => setTags((current) => current.filter((_, position) => position !== index))}
                >
                  {t('commercial.settings.remove')}
                </button>
              </div>
            ))}
            <button
              className="portal-button secondary"
              type="button"
              disabled={tags.length >= 30}
              onClick={() => setTags((current) => [...current, ''])}
            >
              {t('commercial.calls.addScript')}
            </button>
          </div>
          <label>
            {t('commercial.settings.region')}
            <input
              className="crm-settings-text-input"
              required
              pattern="[A-Z]{2}"
              maxLength={2}
              value={region}
              onChange={(event) => setRegion(event.target.value.toUpperCase())}
            />
          </label>
          <button className="portal-button" type="submit">
            {t('commercial.settings.save')}
          </button>
        </fieldset>
      </form>
    </section>
  )
}
