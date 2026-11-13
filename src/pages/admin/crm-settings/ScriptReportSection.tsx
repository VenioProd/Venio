import { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CallAiBlock, { ServerPill, ToggleRow, numberValue, parseNumber, useBlockDraft } from './CallAiBlock'
import type { Issue } from './callAiModel'
import type { CallAiProps } from './types'

/** Réglages du rapport hebdomadaire des scripts (`CrmSettings.callScriptReport`, lot K). */
export interface ScriptReportSettings {
  enabled: boolean
  day: number
  emailAuthors: boolean
  recipients: string[]
  model: string
  maxInputTokens: number
  targetConversionRate: number
}

export const DEFAULT_SCRIPT_REPORT: ScriptReportSettings = {
  enabled: false,
  day: 1,
  emailAuthors: true,
  recipients: [],
  model: '',
  maxInputTokens: 60000,
  targetConversionRate: 40,
}

const DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const readScriptReport = (settings: Record<string, unknown>): ScriptReportSettings => ({
  ...DEFAULT_SCRIPT_REPORT,
  ...((settings.callScriptReport as Partial<ScriptReportSettings>) ?? {}),
})

const isInt = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max

export function scriptReportIssues(value: ScriptReportSettings): Issue[] {
  const issues: Issue[] = []
  if (!isInt(value.maxInputTokens, 5000, 200000)) issues.push({ key: 'callScriptReport.set.issue.tokens' })
  if (!isInt(value.targetConversionRate, 1, 100)) issues.push({ key: 'callScriptReport.set.issue.target' })
  if (value.model.trim() && !/^claude-[a-z0-9.-]{1,60}$/.test(value.model.trim()))
    issues.push({ key: 'callScriptReport.set.issue.model' })
  return issues
}

const splitEmails = (raw: string) =>
  raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

export default function ScriptReportSection({ settings, providers, canManage, saveBlock }: CallAiProps) {
  const { t } = useI18n()
  const { draft, setDraft, dirty, issues, discard } = useBlockDraft(readScriptReport(settings), scriptReportIssues)
  // Saisie libre des adresses : la liste n'est découpée qu'à la sortie du champ.
  const [recipientsText, setRecipientsText] = useState(draft.recipients.join(', '))
  const [seenRecipients, setSeenRecipients] = useState(draft.recipients.join(', '))
  if (seenRecipients !== draft.recipients.join(', ')) {
    setSeenRecipients(draft.recipients.join(', '))
    setRecipientsText(draft.recipients.join(', '))
  }

  return (
    <CallAiBlock
      id="crm-settings-script-report"
      title="callScriptReport.set.title"
      description="callScriptReport.set.desc"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 3v18h18" />
          <path d="M7 15l4-4 3 3 5-6" />
        </svg>
      }
      status={providers && <ServerPill ready={providers.analysis} label={t('crmCallAi.an.provider')} />}
      canManage={canManage}
      dirty={dirty}
      issues={issues}
      onSave={() => saveBlock('callScriptReport', { ...draft, recipients: splitEmails(recipientsText) })}
      onDiscard={discard}
      draft={draft}
    >
      <ToggleRow
        label={t('callScriptReport.set.enabled')}
        help={t('callScriptReport.set.enabledHelp')}
        checked={draft.enabled}
        onChange={(enabled) => setDraft({ ...draft, enabled })}
      />
      <div className={draft.enabled ? 'crm-ai-fields' : 'crm-ai-fields crm-ai-group-off'}>
        <label className="crm-ai-field">
          {t('callScriptReport.set.day')}
          <select
            className="crm-settings-text-input"
            value={draft.day}
            onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}
          >
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {t(`crm.settings.reports.${DAY_KEYS[day]}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="crm-ai-field">
          {t('callScriptReport.set.target')}
          <input
            className="crm-settings-text-input crm-ai-short"
            type="number"
            min={1}
            max={100}
            step={1}
            value={numberValue(draft.targetConversionRate)}
            onChange={(e) => setDraft({ ...draft, targetConversionRate: parseNumber(e.target.value) })}
          />
        </label>
        <div className="crm-ai-span">
          <ToggleRow
            label={t('callScriptReport.set.emailAuthors')}
            help={t('callScriptReport.set.emailAuthorsHelp')}
            checked={draft.emailAuthors}
            onChange={(emailAuthors) => setDraft({ ...draft, emailAuthors })}
          />
        </div>
        <label className="crm-ai-field crm-ai-span">
          {t('callScriptReport.set.recipients')}
          <input
            className="crm-settings-text-input"
            type="text"
            inputMode="email"
            placeholder="direction@venio.paris"
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            onBlur={() => setDraft({ ...draft, recipients: splitEmails(recipientsText) })}
          />
          <small>{t('callScriptReport.set.recipientsHelp')}</small>
        </label>
        <label className="crm-ai-field">
          {t('callScriptReport.set.model')}
          <input
            className="crm-settings-text-input"
            type="text"
            placeholder="claude-opus-5-5"
            value={draft.model}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          />
          <small>{t('callScriptReport.set.modelHelp')}</small>
        </label>
        <label className="crm-ai-field">
          {t('callScriptReport.set.maxInputTokens')}
          <input
            className="crm-settings-text-input"
            type="number"
            min={5000}
            max={200000}
            step={1000}
            value={numberValue(draft.maxInputTokens)}
            onChange={(e) => setDraft({ ...draft, maxInputTokens: parseNumber(e.target.value) })}
          />
          <small>{t('callScriptReport.set.maxInputTokensHelp')}</small>
        </label>
      </div>
    </CallAiBlock>
  )
}
