import { useMemo } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CallAiBlock, { ServerPill, numberValue, parseNumber, useBlockDraft } from './CallAiBlock'
import { readTelephony, telephonyIssues, type TelephonySettings } from './callAiModel'
import type { CallAiProps } from './types'

/** Lundi en premier, comme dans un agenda français. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

function timezones(current: string): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }
  const list = typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : ['Europe/Paris']
  return list.includes(current) ? list : [current, ...list]
}

export default function TelephonySection({ settings, providers, canManage, saveBlock }: CallAiProps) {
  const { t } = useI18n()
  const { draft, setDraft, dirty, issues, discard } = useBlockDraft(readTelephony(settings), telephonyIssues)
  const hours = draft.callingHours
  const zones = useMemo(() => timezones(hours.timezone), [hours.timezone])
  const setHours = (patch: Partial<TelephonySettings['callingHours']>) =>
    setDraft({ ...draft, callingHours: { ...hours, ...patch } })
  const toggleDay = (day: number) =>
    setHours({ days: hours.days.includes(day) ? hours.days.filter((d) => d !== day) : [...hours.days, day] })
  const dayNames = WEEK.filter((day) => hours.days.includes(day))
    .map((day) => t(`crmCallAi.day.${day}` as MessageKey))
    .join(', ')

  return (
    <CallAiBlock
      id="crm-settings-telephony"
      title="crmCallAi.tel.title"
      description="crmCallAi.tel.desc"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      }
      status={
        providers && (
          <>
            <ServerPill
              bare
              ready={providers.telephony}
              label={providers.telephony ? t('crmCallAi.tel.configured') : t('crmCallAi.tel.notConfigured')}
            />
            {!providers.telephony && <p className="crm-ai-hint">{t('crmCallAi.tel.notConfiguredHint')}</p>}
          </>
        )
      }
      canManage={canManage}
      dirty={dirty}
      issues={issues}
      onSave={() => saveBlock('telephony', draft)}
      onDiscard={discard}
      draft={draft}
    >
      <div className="crm-ai-field">
        <span id="crm-tel-days">{t('crmCallAi.tel.days')}</span>
        <div className="crm-ai-days" role="group" aria-labelledby="crm-tel-days">
          {WEEK.map((day) => (
            <label key={day} className={hours.days.includes(day) ? 'crm-ai-day crm-ai-day-on' : 'crm-ai-day'}>
              <input type="checkbox" checked={hours.days.includes(day)} onChange={() => toggleDay(day)} />
              {t(`crmCallAi.day.${day}` as MessageKey)}
            </label>
          ))}
        </div>
      </div>
      <div className="crm-ai-fields">
        <label className="crm-ai-field">
          {t('crmCallAi.tel.start')}
          <input
            className="crm-settings-text-input"
            type="time"
            value={hours.start}
            onChange={(e) => setHours({ start: e.target.value })}
          />
        </label>
        <label className="crm-ai-field">
          {t('crmCallAi.tel.end')}
          <input
            className="crm-settings-text-input"
            type="time"
            value={hours.end}
            onChange={(e) => setHours({ end: e.target.value })}
          />
        </label>
      </div>
      <label className="crm-ai-field">
        {t('crmCallAi.tel.timezone')}
        <select
          className="crm-settings-text-input"
          value={hours.timezone}
          onChange={(e) => setHours({ timezone: e.target.value })}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <small>{t('crmCallAi.tel.timezoneHelp')}</small>
      </label>
      <label className="crm-ai-field">
        {t('crmCallAi.tel.cap')}
        <input
          className="crm-settings-text-input crm-ai-short"
          type="number"
          min={1}
          max={20}
          step={1}
          value={numberValue(draft.attemptCapPerDay)}
          onChange={(e) => setDraft({ ...draft, attemptCapPerDay: parseNumber(e.target.value) })}
        />
        <small>{t('crmCallAi.tel.capHelp')}</small>
      </label>
      <p className="crm-ai-summary" aria-live="polite">
        {hours.days.length === 0
          ? t('crmCallAi.tel.summaryNever')
          : t('crmCallAi.tel.summary', {
              days: dayNames,
              start: hours.start,
              end: hours.end,
              timezone: hours.timezone,
              cap: Number.isFinite(draft.attemptCapPerDay) ? draft.attemptCapPerDay : '?',
            })}
      </p>
    </CallAiBlock>
  )
}
