import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import CallAiBlock, { ServerPill, ToggleRow, numberValue, parseNumber, useBlockDraft } from './CallAiBlock'
import {
  MAX_CRITERIA,
  analysisIssues,
  defaultAnalysisGrid,
  penaltyTotal,
  readAnalysis,
  reachableTotal,
  type HeatCriterion,
  type HeatThresholds,
} from './callAiModel'
import type { CallAiProps } from './types'

const LEVELS = [
  { id: 'FROID', field: null },
  { id: 'TIEDE', field: 'tiede' },
  { id: 'CHAUD', field: 'chaud' },
  { id: 'TRES_CHAUD', field: 'tresChaud' },
] as const

/** Largeur de chaque niveau sur l'échelle 0–100 ; `null` quand les seuils ne sont pas (encore) ordonnés. */
function scaleWidths(t: HeatThresholds): number[] | null {
  const marks = [0, t.tiede, t.chaud, t.tresChaud, 100]
  if (!marks.every((m) => Number.isFinite(m)) || marks.some((m, i) => i > 0 && m <= marks[i - 1]!)) return null
  return marks.slice(1).map((m, i) => m - marks[i]!)
}

export default function AnalysisSection({ settings, providers, canManage, saveBlock }: CallAiProps) {
  const { t } = useI18n()
  const { draft, setDraft, dirty, issues, discard } = useBlockDraft(readAnalysis(settings), analysisIssues)
  const { criteria, thresholds } = draft.heatGrid
  const setGrid = (patch: Partial<typeof draft.heatGrid>) =>
    setDraft({ ...draft, heatGrid: { ...draft.heatGrid, ...patch } })
  const setCriterion = (index: number, patch: Partial<HeatCriterion>) =>
    setGrid({ criteria: criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)) })
  const addCriterion = () => {
    const taken = new Set(criteria.map((c) => c.key))
    let n = criteria.length + 1
    while (taken.has(`criterion${n}`)) n += 1
    setGrid({
      criteria: [...criteria, { key: `criterion${n}`, label: t('crmCallAi.grid.newLabel'), max: 10, description: '' }],
    })
  }
  const total = reachableTotal(criteria)
  const rawPositive = criteria.reduce((sum, c) => sum + (Number.isFinite(c.max) ? Math.max(c.max, 0) : 0), 0)
  const penalty = penaltyTotal(criteria)
  const widths = scaleWidths(thresholds)

  return (
    <CallAiBlock
      id="crm-settings-analysis"
      title="crmCallAi.an.title"
      description="crmCallAi.an.desc"
      wide
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
        </svg>
      }
      status={providers && <ServerPill ready={providers.analysis} label={t('crmCallAi.an.provider')} />}
      canManage={canManage}
      dirty={dirty}
      issues={issues}
      onSave={() => saveBlock('callAnalysis', draft)}
      onDiscard={discard}
      draft={draft}
    >
      <div className="crm-ai-fields">
        <div className="crm-ai-span">
          <ToggleRow
            label={t('crmCallAi.an.enabled')}
            help={t('crmCallAi.an.enabledHelp')}
            checked={draft.enabled}
            onChange={(enabled) => setDraft({ ...draft, enabled })}
          />
        </div>
        <label className="crm-ai-field">
          {t('crmCallAi.an.retention')}
          <input
            className="crm-settings-text-input crm-ai-short"
            type="number"
            min={1}
            max={12}
            step={1}
            value={numberValue(draft.retentionMonths)}
            onChange={(e) => setDraft({ ...draft, retentionMonths: parseNumber(e.target.value) })}
          />
          <small>{t('crmCallAi.an.retentionHelp')}</small>
        </label>
      </div>

      <div className="crm-ai-grid">
        <h3>{t('crmCallAi.grid.title')}</h3>
        <p className="crm-ai-hint">{t('crmCallAi.grid.intro')}</p>

        <ol className="crm-ai-criteria">
          {criteria.map((criterion, index) => {
            const n = index + 1
            return (
              <li
                key={index}
                className={criterion.max < 0 ? 'crm-ai-criterion crm-ai-criterion-neg' : 'crm-ai-criterion'}
              >
                <fieldset>
                  <legend>{t('crmCallAi.grid.criterion', { n })}</legend>
                  <div className="crm-ai-criterion-main">
                    <label className="crm-ai-field">
                      {t('crmCallAi.grid.label')}
                      <input
                        className="crm-settings-text-input"
                        maxLength={80}
                        value={criterion.label}
                        onChange={(e) => setCriterion(index, { label: e.target.value })}
                      />
                    </label>
                    <label className="crm-ai-field">
                      {t('crmCallAi.grid.max')}
                      <input
                        className="crm-settings-text-input crm-ai-short"
                        type="number"
                        min={-100}
                        max={100}
                        step={1}
                        value={numberValue(criterion.max)}
                        onChange={(e) => setCriterion(index, { max: parseNumber(e.target.value) })}
                      />
                    </label>
                  </div>
                  <label className="crm-ai-field">
                    {t('crmCallAi.grid.description')}
                    <textarea
                      className="crm-settings-text-input crm-ai-textarea"
                      rows={2}
                      maxLength={300}
                      value={criterion.description}
                      onChange={(e) => setCriterion(index, { description: e.target.value })}
                    />
                  </label>
                  <div className="crm-ai-criterion-foot">
                    <label className="crm-ai-field">
                      {t('crmCallAi.grid.key')}
                      <input
                        className="crm-settings-text-input"
                        maxLength={40}
                        value={criterion.key}
                        onChange={(e) => setCriterion(index, { key: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="portal-button secondary"
                      disabled={criteria.length <= 1}
                      aria-label={t('crmCallAi.grid.remove', { n })}
                      onClick={() => setGrid({ criteria: criteria.filter((_, i) => i !== index) })}
                    >
                      {t('crmCallAi.grid.removeButton')}
                    </button>
                  </div>
                </fieldset>
              </li>
            )
          })}
        </ol>
        <small className="crm-ai-hint">
          {t('crmCallAi.grid.maxHelp')} {t('crmCallAi.grid.keyHelp')}
        </small>
        <div className="crm-ai-actions">
          <button
            type="button"
            className="portal-button secondary"
            disabled={criteria.length >= MAX_CRITERIA}
            onClick={addCriterion}
          >
            {t('crmCallAi.grid.add')}
          </button>
          <button type="button" className="portal-button secondary" onClick={() => setGrid(defaultAnalysisGrid())}>
            {t('crmCallAi.grid.reset')}
          </button>
        </div>

        <div className="crm-ai-preview" aria-live="polite">
          <strong>{t('crmCallAi.grid.total', { total })}</strong>
          {rawPositive > 100 && <span>{t('crmCallAi.grid.totalCapped', { sum: rawPositive })}</span>}
          <span>{penalty < 0 ? t('crmCallAi.grid.penalty', { penalty }) : t('crmCallAi.grid.noPenalty')}</span>
        </div>

        <h3>{t('crmCallAi.grid.thresholds')}</h3>
        <p className="crm-ai-hint">{t('crmCallAi.grid.thresholdsHelp')}</p>
        <div className="crm-ai-fields">
          {LEVELS.filter((level) => level.field).map((level) => (
            <label className="crm-ai-field" key={level.id}>
              {t('crmCallAi.grid.from', { level: t(`crmCallAi.level.${level.id}` as MessageKey) })}
              <input
                className="crm-settings-text-input crm-ai-short"
                type="number"
                min={1}
                max={100}
                step={1}
                value={numberValue(thresholds[level.field!])}
                onChange={(e) =>
                  setGrid({ thresholds: { ...thresholds, [level.field!]: parseNumber(e.target.value) } })
                }
              />
            </label>
          ))}
        </div>
        {widths && (
          <div className="crm-ai-scale" role="img" aria-label={t('crmCallAi.grid.scale')}>
            {LEVELS.map((level, i) => (
              <div key={level.id} className={`crm-ai-level crm-ai-level-${level.id}`} style={{ flexGrow: widths[i] }}>
                <span>{t(`crmCallAi.level.${level.id}` as MessageKey)}</span>
                <small>{level.field ? thresholds[level.field] : 0}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </CallAiBlock>
  )
}
