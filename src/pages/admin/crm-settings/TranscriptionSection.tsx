import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CallAiBlock, { ServerPill, ToggleRow, numberValue, parseNumber, useBlockDraft } from './CallAiBlock'
import { readTranscription, transcriptionIssues } from './callAiModel'
import type { CallAiProps } from './types'

const LANGUAGES = ['fr', 'en', 'en_us', 'en_gb', 'es', 'de', 'it', 'pt', 'nl']

export default function TranscriptionSection({ settings, providers, canManage, saveBlock }: CallAiProps) {
  const { t } = useI18n()
  const { draft, setDraft, dirty, issues, discard } = useBlockDraft(readTranscription(settings), transcriptionIssues)
  const known = LANGUAGES.includes(draft.language)

  return (
    <CallAiBlock
      id="crm-settings-transcription"
      title="crmCallAi.tr.title"
      description="crmCallAi.tr.desc"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h6" />
        </svg>
      }
      status={providers && <ServerPill ready={providers.transcription} label={t('crmCallAi.tr.provider')} />}
      canManage={canManage}
      dirty={dirty}
      issues={issues}
      onSave={() => saveBlock('callTranscription', draft)}
      onDiscard={discard}
      draft={draft}
    >
      <ToggleRow
        label={t('crmCallAi.tr.enabled')}
        help={t('crmCallAi.tr.enabledHelp')}
        checked={draft.enabled}
        onChange={(enabled) => setDraft({ ...draft, enabled })}
      />
      <div className={draft.enabled ? 'crm-ai-fields' : 'crm-ai-fields crm-ai-group-off'}>
        <ToggleRow
          label={t('crmCallAi.tr.live')}
          help={t('crmCallAi.tr.liveHelp')}
          checked={draft.live}
          onChange={(live) => setDraft({ ...draft, live })}
        />
        <label className="crm-ai-field">
          {t('crmCallAi.tr.language')}
          <select
            className="crm-settings-text-input"
            value={draft.language}
            onChange={(e) => setDraft({ ...draft, language: e.target.value })}
          >
            {!known && (
              <option value={draft.language}>{t('crmCallAi.tr.languageOther', { code: draft.language })}</option>
            )}
            {LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`crmCallAi.lang.${code}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="crm-ai-field">
          {t('crmCallAi.tr.retention')}
          <input
            className="crm-settings-text-input crm-ai-short"
            type="number"
            min={1}
            max={36}
            step={1}
            value={numberValue(draft.retentionMonths)}
            onChange={(e) => setDraft({ ...draft, retentionMonths: parseNumber(e.target.value) })}
          />
          <small>{t('crmCallAi.tr.retentionHelp')}</small>
        </label>
      </div>
    </CallAiBlock>
  )
}
