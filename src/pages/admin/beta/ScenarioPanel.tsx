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
import { SCENARIO_STATUS_LABEL, scenarioTone, sortScenariosByAttention } from './helpers'

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
          <Plus size={14} aria-hidden /> Ajouter une démarche
        </button>

        {templates.length > 0 && (
          <label className="beta-inline-field">
            Partir d’une trame
            <select
              defaultValue=""
              onChange={async (event) => {
                if (!event.target.value) return
                await applyTemplate(campaignId, event.target.value)
                event.target.value = ''
                onChanged()
              }}
            >
              <option value="">Choisir…</option>
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
              const name = window.prompt('Nom de la trame à enregistrer')
              if (!name) return
              await createTemplate({ name, fromCampaign: campaignId })
              const { templates: loaded } = await listTemplates()
              setTemplates(loaded)
            }}
          >
            <Copy size={14} aria-hidden /> Enregistrer comme trame
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

      {scenarios.length === 0 && !adding && (
        <p className="beta-muted">Aucune démarche. Décrivez ce que les testeurs doivent essayer.</p>
      )}

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
                    {SCENARIO_STATUS_LABEL[scenario.summaryStatus]}
                  </span>
                  <span className="beta-scenario-id">{scenario.identifier}</span>
                  <h3>{scenario.title}</h3>
                  <div className="beta-scenario-actions">
                    <button
                      type="button"
                      className="beta-btn beta-btn-ghost"
                      onClick={() => setEditingId(scenario._id)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="beta-btn beta-btn-ghost"
                      aria-label={`Archiver ${scenario.title}`}
                      onClick={async () => {
                        if (!window.confirm(`Archiver « ${scenario.title} » ?`)) return
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
        Ce que le testeur doit faire
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Demander un devis depuis la page contact"
          required
        />
      </label>
      <label>
        Précisions
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} />
      </label>

      <fieldset className="beta-steps-editor">
        <legend>Étapes guidées</legend>
        <p className="beta-muted beta-hint">
          Facultatif, mais précieux pour un testeur qui découvre le produit : il vous dira à quelle étape ça casse.
        </p>
        {steps.map((step, index) => (
          <div key={index} className="beta-step-row">
            <span className="beta-step-order">{index + 1}</span>
            <input
              value={step.instruction}
              onChange={(event) => updateStep(index, { instruction: event.target.value })}
              placeholder="Ouvrir /contact"
              aria-label={`Étape ${index + 1}, action`}
            />
            <input
              value={step.expected}
              onChange={(event) => updateStep(index, { expected: event.target.value })}
              placeholder="Le formulaire s’affiche"
              aria-label={`Étape ${index + 1}, résultat attendu`}
            />
            <button
              type="button"
              className="beta-btn beta-btn-ghost"
              aria-label={`Retirer l’étape ${index + 1}`}
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
          <Plus size={13} aria-hidden /> Étape
        </button>
      </fieldset>

      <div className="beta-modal-actions">
        <button type="button" className="beta-btn" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="beta-btn beta-btn-primary" disabled={saving || !title.trim()}>
          <Save size={14} aria-hidden /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
