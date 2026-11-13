import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CallAiBlock, { ServerPill, ToggleRow, numberValue, parseNumber, useBlockDraft } from './CallAiBlock'
import { EU_COUNTRIES, readTelephony, telephonyIssues, type TelephonySettings } from './callAiModel'
import { countryName } from '../../commercial/callCountries/ProspectCallCheck'
import '../../commercial/callCountries/callCountries.css'
import type { CallAiProps } from './types'

/** Lundi en premier, comme dans un agenda français. */
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

export default function TelephonySection({ settings, providers, canManage, saveBlock }: CallAiProps) {
  const { t, locale } = useI18n()
  const { draft, setDraft, dirty, issues, discard } = useBlockDraft(readTelephony(settings), telephonyIssues)
  const hours = draft.callingHours
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
      <p className="crm-ai-hint">{t('callCountries.settings.hoursHelp')}</p>
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
      <div className="crm-ai-group" role="group" aria-label={t('callCountries.settings.window')}>
        <div className="crm-ai-fields">
          <label className="crm-ai-field">
            {t('callCountries.settings.windowMax')}
            <input
              className="crm-settings-text-input crm-ai-short"
              type="number"
              min={1}
              max={100}
              step={1}
              value={numberValue(draft.attemptWindow.max)}
              onChange={(e) =>
                setDraft({ ...draft, attemptWindow: { ...draft.attemptWindow, max: parseNumber(e.target.value) } })
              }
            />
          </label>
          <label className="crm-ai-field">
            {t('callCountries.settings.windowDays')}
            <input
              className="crm-settings-text-input crm-ai-short"
              type="number"
              min={1}
              max={60}
              step={1}
              value={numberValue(draft.attemptWindow.days)}
              onChange={(e) =>
                setDraft({ ...draft, attemptWindow: { ...draft.attemptWindow, days: parseNumber(e.target.value) } })
              }
            />
          </label>
        </div>
        <small>{t('callCountries.settings.windowHelp')}</small>
      </div>
      <CountryRules
        rules={draft.countries}
        locale={locale}
        onChange={(countries) => setDraft({ ...draft, countries })}
      />
      <div className="crm-ai-group" role="group" aria-label={t('calls.dialer.settings.title')}>
        <ToggleRow
          label={t('calls.dialer.settings.voicemail')}
          help={t('calls.dialer.settings.voicemailHelp')}
          checked={draft.dialer.voicemailDetection}
          onChange={(voicemailDetection) => setDraft({ ...draft, dialer: { ...draft.dialer, voicemailDetection } })}
        />
        <div className="crm-ai-fields">
          <label className="crm-ai-field">
            {t('calls.dialer.settings.preview')}
            <input
              className="crm-settings-text-input crm-ai-short"
              type="number"
              min={0}
              max={120}
              step={1}
              value={numberValue(draft.dialer.previewDelaySec)}
              onChange={(e) =>
                setDraft({ ...draft, dialer: { ...draft.dialer, previewDelaySec: parseNumber(e.target.value) } })
              }
            />
            <small>{t('calls.dialer.settings.previewHelp')}</small>
          </label>
          <label className="crm-ai-field">
            {t('calls.dialer.settings.power')}
            <input
              className="crm-settings-text-input crm-ai-short"
              type="number"
              min={0}
              max={60}
              step={1}
              value={numberValue(draft.dialer.powerDelaySec)}
              onChange={(e) =>
                setDraft({ ...draft, dialer: { ...draft.dialer, powerDelaySec: parseNumber(e.target.value) } })
              }
            />
            <small>{t('calls.dialer.settings.powerHelp')}</small>
          </label>
        </div>
      </div>
      <p className="crm-ai-summary" aria-live="polite">
        {hours.days.length === 0
          ? t('crmCallAi.tel.summaryNever')
          : t('callCountries.settings.summary', {
              days: dayNames,
              start: hours.start,
              end: hours.end,
              cap: Number.isFinite(draft.attemptCapPerDay) ? draft.attemptCapPerDay : '?',
              max: Number.isFinite(draft.attemptWindow.max) ? draft.attemptWindow.max : '?',
              windowDays: Number.isFinite(draft.attemptWindow.days) ? draft.attemptWindow.days : '?',
            })}
      </p>
    </CallAiBlock>
  )
}

/** Pays appelables (lot P) : UE puis hors UE ; une ligne par pays, deux cases. */
function CountryRules({
  rules,
  locale,
  onChange,
}: {
  rules: TelephonySettings['countries']
  locale: string
  onChange: (rules: TelephonySettings['countries']) => void
}) {
  const { t } = useI18n()
  const set = (code: string, patch: Partial<TelephonySettings['countries'][number]>) =>
    onChange(rules.map((rule) => (rule.code === code ? { ...rule, ...patch } : rule)))
  const groups = [
    { key: 'callCountries.settings.eu' as const, rules: rules.filter((rule) => EU_COUNTRIES.includes(rule.code)) },
    { key: 'callCountries.settings.other' as const, rules: rules.filter((rule) => !EU_COUNTRIES.includes(rule.code)) },
  ]
  return (
    <div className="crm-ai-group" role="group" aria-label={t('callCountries.settings.countries')}>
      <span>
        {t('callCountries.settings.countries')} ·{' '}
        {t('callCountries.settings.openCount', { count: rules.filter((rule) => rule.enabled).length })}
      </span>
      <small>{t('callCountries.settings.countriesHelp')}</small>
      {groups.map((group) => (
        <details key={group.key} className="crm-ai-countries" open={group.key === 'callCountries.settings.other'}>
          <summary>{t(group.key)}</summary>
          <table className="crm-ai-country-table">
            <thead>
              <tr>
                <th scope="col">{t('callCountries.settings.country')}</th>
                <th scope="col">{t('callCountries.settings.enabled')}</th>
                <th scope="col" title={t('callCountries.settings.defaultCallerIdHelp')}>
                  {t('callCountries.settings.defaultCallerId')}
                </th>
              </tr>
            </thead>
            <tbody>
              {group.rules.map((rule) => (
                <tr key={rule.code}>
                  <th scope="row">
                    {countryName(rule.code, locale)} <small>{rule.code}</small>
                  </th>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${t('callCountries.settings.enabled')} : ${countryName(rule.code, locale)}`}
                      checked={rule.enabled}
                      onChange={(e) => set(rule.code, { enabled: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${t('callCountries.settings.defaultCallerId')} : ${countryName(rule.code, locale)}`}
                      checked={rule.defaultCallerId}
                      onChange={(e) => set(rule.code, { defaultCallerId: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      <small>{t('callCountries.settings.defaultCallerIdHelp')}</small>
    </div>
  )
}
