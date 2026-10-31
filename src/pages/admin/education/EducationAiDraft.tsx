import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import { translate, type MessageKey } from '../../../i18n'
import {
  generateEducationAiDraft,
  reviewEducationAiDraft,
  type EducationAiDraft,
  type EducationAiMode,
} from '../../../services/education'

const COPY_KEYS: Record<EducationAiMode, { title: MessageKey; label: MessageKey; placeholder: MessageKey }> = {
  session_plan: {
    title: 'eduD.ai.sessionPlanTitle',
    label: 'eduD.ai.sessionPlanLabel',
    placeholder: 'eduD.ai.sessionPlanPlaceholder',
  },
  session_synthesis: {
    title: 'eduD.ai.sessionSynthesisTitle',
    label: 'eduD.ai.sessionSynthesisLabel',
    placeholder: 'eduD.ai.sessionSynthesisPlaceholder',
  },
  assignment_feedback: {
    title: 'eduD.ai.assignmentFeedbackTitle',
    label: 'eduD.ai.assignmentFeedbackLabel',
    placeholder: 'eduD.ai.assignmentFeedbackPlaceholder',
  },
  class_council_prep: {
    title: 'eduD.ai.councilTitle',
    label: 'eduD.ai.councilLabel',
    placeholder: 'eduD.ai.councilPlaceholder',
  },
  checklist_action_plan: {
    title: 'eduD.ai.checklistTitle',
    label: 'eduD.ai.checklistLabel',
    placeholder: 'eduD.ai.checklistPlaceholder',
  },
}

function planInput(raw: string): Record<string, unknown> {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  // Le gabarit proposé suit la langue de l'interface : on reconnaît les libellés français et anglais.
  const valueAfter = (...prefixes: string[]) => {
    for (const prefix of prefixes) {
      const found = lines.find((line) => line.toLowerCase().startsWith(prefix))
      if (found) return found.slice(prefix.length).trim()
    }
    return ''
  }
  const topic = valueAfter('sujet:', 'topic:') || lines[0] || ''
  const level = valueAfter('niveau:', 'level:') || translate('eduD.ai.levelDefault')
  const objectives = lines
    .filter((line) => !/^(sujet|topic|niveau|level|objectifs?|objectives?):/i.test(line))
    .slice(topic === lines[0] ? 1 : 0)
    .map((line) => line.replace(/^[-•]\s*/, ''))
  return { topic, level, objectives: objectives.length ? objectives : [topic], durationMin: 120 }
}

export function EducationAiDraftPanel({
  mode,
  initialText = '',
  rubric = [],
  councilSummary,
  onApply,
}: {
  mode: EducationAiMode
  initialText?: string
  rubric?: string[]
  councilSummary?: { className: string; summary: string }
  onApply: (draft: EducationAiDraft) => void
}) {
  const { t } = useI18n()
  const [input, setInput] = useState(initialText)
  const [result, setResult] = useState<{ generationId: string; draft: EducationAiDraft; engine: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = COPY_KEYS[mode]

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const payload =
        mode === 'session_plan'
          ? planInput(input)
          : mode === 'session_synthesis'
            ? { instructorNotes: input }
            : mode === 'assignment_feedback'
              ? { comments: input, rubric }
              : mode === 'class_council_prep'
                ? { className: councilSummary?.className, classSummary: councilSummary?.summary, context: input }
                : { context: input }
      const response = await generateEducationAiDraft(mode, payload)
      setResult({ generationId: response.generation.id, draft: response.draft, engine: response.generation.engine })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduD.ai.generateError'))
    } finally {
      setBusy(false)
    }
  }

  async function reviewAndApply() {
    if (!result) return
    setBusy(true)
    setError(null)
    try {
      await reviewEducationAiDraft(result.generationId)
      const fields = { ...result.draft.fields }
      if (mode === 'session_synthesis') fields.recap = result.draft.text
      if (mode === 'assignment_feedback') fields.feedback = result.draft.text
      if (mode === 'class_council_prep') fields.councilPrep = result.draft.text
      if (mode === 'checklist_action_plan') {
        fields.checklist = result.draft.text
          .split('\n')
          .map((line) => line.replace(/^\s*[-*]\s*\[.\]\s*/, '').trim())
          .filter(Boolean)
      }
      onApply({ ...result.draft, fields })
      setResult(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('eduD.ai.reviewError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="edu-ai-draft" aria-label={t(copy.title)}>
      <div className="edu-ai-draft-head">
        <Sparkles size={15} />
        <strong>{t(copy.title)}</strong>
      </div>
      <p>{t('eduD.ai.disclaimer')}</p>
      <label>
        {t(copy.label)}
        <textarea
          className="edu-textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t(copy.placeholder)}
        />
      </label>
      {error && (
        <div className="edu-banner-error" role="alert">
          {error}
        </div>
      )}
      {!result ? (
        <button
          className="edu-btn ghost"
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => void generate()}
        >
          <Sparkles size={14} /> {busy ? t('eduD.ai.preparing') : t('eduD.ai.propose')}
        </button>
      ) : (
        <div className="edu-ai-draft-result">
          <label>
            {t('eduD.ai.editableDraft')}
            <textarea
              className="edu-textarea"
              value={result.draft.text}
              onChange={(event) =>
                setResult((current) =>
                  current ? { ...current, draft: { ...current.draft, text: event.target.value } } : current,
                )
              }
            />
          </label>
          <small>{t('eduD.ai.provenance', { engine: result.engine })}</small>
          <button className="edu-btn" type="button" disabled={busy} onClick={() => void reviewAndApply()}>
            {t('eduD.ai.reviewed')}
          </button>
        </div>
      )}
    </section>
  )
}
