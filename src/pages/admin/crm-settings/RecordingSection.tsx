import { useI18n } from '../../../context/I18nContext'
import CallAiBlock, { ToggleRow, numberValue, parseNumber, useBlockDraft } from './CallAiBlock'
import { DEFAULT_NOTICE, NOTICE_MAX, readRecording, recordingIssues } from './callAiModel'
import type { CallAiProps } from './types'

export default function RecordingSection({ settings, canManage, saveBlock }: CallAiProps) {
  const { t } = useI18n()
  const { draft, setDraft, dirty, issues, discard } = useBlockDraft(readRecording(settings), recordingIssues)
  const keep = draft.keepAudioDays
  const keepNote =
    keep === 0
      ? t('crmCallAi.rec.keepZero')
      : Number.isInteger(keep) && keep > 0 && keep <= 180
        ? t('crmCallAi.rec.keepN', { days: keep })
        : t('crmCallAi.rec.keepRange')

  return (
    <CallAiBlock
      id="crm-settings-recording"
      title="crmCallAi.rec.title"
      description="crmCallAi.rec.desc"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
        </svg>
      }
      canManage={canManage}
      dirty={dirty}
      issues={issues}
      onSave={() => saveBlock('callRecording', draft)}
      onDiscard={discard}
      draft={draft}
    >
      <ToggleRow
        label={t('crmCallAi.rec.enabled')}
        help={t('crmCallAi.rec.enabledHelp')}
        checked={draft.enabled}
        onChange={(enabled) => setDraft({ ...draft, enabled })}
      />
      <div className={draft.enabled ? 'crm-ai-group' : 'crm-ai-group crm-ai-group-off'}>
        <ToggleRow
          label={t('crmCallAi.rec.noticeEnabled')}
          help={t('crmCallAi.rec.noticeEnabledHelp')}
          checked={draft.notice.enabled}
          onChange={(enabled) => setDraft({ ...draft, notice: { ...draft.notice, enabled } })}
        />
        {draft.notice.enabled ? (
          <div className="crm-ai-field">
            <label htmlFor="crm-rec-notice">{t('crmCallAi.rec.noticeText')}</label>
            <textarea
              id="crm-rec-notice"
              className="crm-settings-text-input crm-ai-textarea"
              rows={3}
              value={draft.notice.text}
              onChange={(e) => setDraft({ ...draft, notice: { ...draft.notice, text: e.target.value } })}
            />
            <div className="crm-ai-row">
              <small className={draft.notice.text.trim().length > NOTICE_MAX ? 'crm-ai-over' : undefined}>
                {t('crmCallAi.rec.noticeCount', { count: draft.notice.text.trim().length, max: NOTICE_MAX })}
              </small>
              <button
                type="button"
                className="crm-ai-link"
                disabled={draft.notice.text === DEFAULT_NOTICE}
                onClick={() => setDraft({ ...draft, notice: { ...draft.notice, text: DEFAULT_NOTICE } })}
              >
                {t('crmCallAi.rec.noticeReset')}
              </button>
            </div>
          </div>
        ) : (
          draft.enabled && (
            <p className="crm-ai-warn" role="note">
              {t('crmCallAi.rec.noticeWarn')}
            </p>
          )
        )}
        <label className="crm-ai-field">
          {t('crmCallAi.rec.keep')}
          <input
            className="crm-settings-text-input crm-ai-short"
            type="number"
            min={0}
            max={180}
            step={1}
            value={numberValue(keep)}
            onChange={(e) => setDraft({ ...draft, keepAudioDays: parseNumber(e.target.value) })}
          />
          <small>{keepNote}</small>
        </label>
        <p className="crm-ai-hint">{t('crmCallAi.rec.objection')}</p>
      </div>
    </CallAiBlock>
  )
}
