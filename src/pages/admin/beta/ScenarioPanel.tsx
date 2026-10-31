import { useEffect, useState } from 'react'
import { Copy, Plus, Save, Trash2 } from 'lucide-react'
import {
  applyTemplate,
  archiveScenario,
  createScenario,
  createTemplate,
  listTemplates,
  updateScenario,
  type BetaScenario,
  type BetaTemplate,
} from '../../../services/beta'
import { useI18n } from '../../../context/I18nContext'
import { SCENARIO_STATUS_LABEL_KEY, scenarioTone, sortScenariosByAttention } from './helpers'

interface Props {
  campaignId: string
  scenarios: BetaScenario[]
  onChanged: () => void
}

interface DraftStep {
  instruction: string
  expected: string
}

export default function ScenarioPanel({ campaignId, scenarios, onChanged }: Props) {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<BetaTemplate[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    void listTemplates()
      .then(({ templates: loaded }) => setTemplates(loaded))
      .catch(() => setTemplates([]))
  }, [])

  return (
    <div className="beta-scenarios">
      <div className="beta-scenarios-toolbar">
        <button type="button" className="beta-btn beta-btn-primary" onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden /> {t('beta.scenarios.add')}
        </button>

        {templates.length > 0 && (
          <label className="beta-inline-field">
            {t('beta.scenarios.fromTemplate')}
            <select
              defaultValue=""
              onChange={async (event) => {
                if (!event.target.value) return
                await applyTemplate(campaignId, event.target.value)
                event.target.value = ''
                onChanged()
              }}
            >
              <option value="">{t('beta.admin.choose')}</option>
              {templates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {scenarios.length > 0 && (
          <button
            type="button"
            className="beta-btn"
            onClick={async () => {
              const name = window.prompt(t('beta.scenarios.templateName'))
              if (!name) return
              await createTemplate({ name, fromCampaign: campaignId })
              const { templates: loaded } = await listTemplates()
              setTemplates(loaded)
            }}
          >
            <Copy size={14} aria-hidden /> {t('beta.scenarios.saveAsTemplate')}
          </button>
        )}
      </div>

      {adding && (
        <ScenarioEditor
          onCancel={() => setAdding(false)}
          onSubmit={async (draft) => {
            await createScenario(campaignId, draft)
            setAdding(false)
            onChanged()
          }}
        />
      )}

      {scenarios.length === 0 && !adding && <p className="beta-muted">{t('beta.scenarios.empty')}</p>}

      <ul className="beta-scenario-list">
        {sortScenariosByAttention(scenarios).map((scenario) => (
          <li key={scenario._id} className="beta-scenario">
            {editingId === scenario._id ? (
              <ScenarioEditor
                initial={scenario}
                onCancel={() => setEditingId(null)}
                onSubmit={async (draft) => {
                  await updateScenario(scenario._id, draft as Partial<BetaScenario>)
                  setEditingId(null)
                  onChanged()
                }}
              />
            ) : (
              <>
                <header>
                  <span className={`beta-badge beta-badge-${scenarioTone(scenario.summaryStatus)}`}>
                    {t(SCENARIO_STATUS_LABEL_KEY[scenario.summaryStatus])}
                  </span>
                  <span className="beta-scenario-id">{scenario.identifier}</span>
                  <h3>{scenario.title}</h3>
                  <div className="beta-scenario-actions">
                    <button
                      type="button"
                      className="beta-btn beta-btn-ghost"
                      onClick={() => setEditingId(scenario._id)}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="beta-btn beta-btn-ghost"
                      aria-label={t('beta.scenarios.archiveAria', { title: scenario.title })}
                      onClick={async () => {
                        if (!window.confirm(t('beta.scenarios.archiveConfirm', { title: scenario.title }))) return
                        await archiveScenario(scenario._id)
                        onChanged()
                      }}
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </div>
                </header>
                {scenario.description && <p className="beta-muted">{scenario.description}</p>}
                {scenario.steps.length > 0 && (
                  <ol className="beta-steps">
                    {scenario.steps.map((step) => (
                      <li key={step.order}>
                        <span>{step.instruction}</span>
                        {step.expected && <em className="beta-muted"> → {step.expected}</em>}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

interface EditorProps {
  initial?: BetaScenario
  onCancel: () => void
  onSubmit: (draft: { title: string; description: string; steps: DraftStep[] }) => Promise<void>
}

function ScenarioEditor({ initial, onCancel, onSubmit }: EditorProps) {
  const { t } = useI18n()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [steps, setSteps] = useState<DraftStep[]>(
    initial?.steps.map((step) => ({ instruction: step.instruction, expected: step.expected })) ?? [],
  )
  const [saving, setSaving] = useState(false)

  function updateStep(index: number, patch: Partial<DraftStep>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)))
  }

  return (
    <form
      className="beta-scenario-editor"
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        try {
          await onSubmit({ title, description, steps: steps.filter((step) => step.instruction.trim()) })
        } finally {
          setSaving(false)
        }
      }}
    >
      <label>
        {t('beta.scenarios.whatToDo')}
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('beta.scenarios.whatToDoPlaceholder')}
          required
        />
      </label>
      <label>
        {t('beta.scenarios.details')}
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </label>

      <fieldset className="beta-steps-editor">
        <legend>{t('beta.scenarios.guidedSteps')}</legend>
        <p className="beta-muted beta-hint">{t('beta.scenarios.guidedStepsHint')}</p>
        {steps.map((step, index) => (
          <div key={index} className="beta-step-row">
            <span className="beta-step-order">{index + 1}</span>
            <input
              value={step.instruction}
              onChange={(event) => updateStep(index, { instruction: event.target.value })}
              placeholder={t('beta.scenarios.stepActionPlaceholder')}
              aria-label={t('beta.scenarios.stepActionAria', { number: index + 1 })}
            />
            <input
              value={step.expected}
              onChange={(event) => updateStep(index, { expected: event.target.value })}
              placeholder={t('beta.scenarios.stepExpectedPlaceholder')}
              aria-label={t('beta.scenarios.stepExpectedAria', { number: index + 1 })}
            />
            <button
              type="button"
              className="beta-btn beta-btn-ghost"
              aria-label={t('beta.scenarios.removeStepAria', { number: index + 1 })}
              onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="beta-btn"
          onClick={() => setSteps((current) => [...current, { instruction: '', expected: '' }])}
        >
          <Plus size={13} aria-hidden /> {t('beta.scenarios.addStep')}
        </button>
      </fieldset>

      <div className="beta-modal-actions">
        <button type="button" className="beta-btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="beta-btn beta-btn-primary" disabled={saving || !title.trim()}>
          <Save size={14} aria-hidden /> {saving ? t('beta.scenarios.saving') : t('common.save')}
        </button>
      </div>
    </form>
  )
}
