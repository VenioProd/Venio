import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import {
  generateEducationAiDraft,
  reviewEducationAiDraft,
  type EducationAiDraft,
  type EducationAiMode,
} from '../../../services/education'

const COPY: Record<EducationAiMode, { title: string; label: string; placeholder: string }> = {
  session_plan: {
    title: 'Préparer une séance',
    label: 'Sujet, niveau et objectifs',
    placeholder: 'Sujet : …\nNiveau : …\nObjectifs : un par ligne',
  },
  session_synthesis: {
    title: 'Synthétiser les notes de séance',
    label: 'Notes de l’intervenant',
    placeholder: 'Notes prises pendant ou après la séance…',
  },
  assignment_feedback: {
    title: 'Proposer un feedback',
    label: 'Commentaires pour l’étudiant',
    placeholder: 'Points observés, axes de progrès…',
  },
  class_council_prep: {
    title: 'Préparer le conseil de classe',
    label: 'Contexte complémentaire de l’intervenant',
    placeholder: 'Ex. progrès observés, points à aborder, décisions à préparer…',
  },
  checklist_action_plan: {
    title: 'Créer une checklist',
    label: 'Contexte et résultat attendu',
    placeholder: 'Ex. Préparer la séance suivante sur…',
  },
}

function planInput(raw: string): Record<string, unknown> {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const valueAfter = (prefix: string) =>
    lines
      .find((line) => line.toLowerCase().startsWith(prefix))
      ?.slice(prefix.length)
      .trim() || ''
  const topic = valueAfter('sujet:') || lines[0] || ''
  const level = valueAfter('niveau:') || 'À préciser'
  const objectives = lines
    .filter((line) => !/^(sujet|niveau|objectifs?):/i.test(line))
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
  const [input, setInput] = useState(initialText)
  const [result, setResult] = useState<{ generationId: string; draft: EducationAiDraft; engine: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = COPY[mode]

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
      setError(err instanceof Error ? err.message : 'Impossible de proposer un brouillon')
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
      setError(err instanceof Error ? err.message : 'La confirmation de relecture a échoué')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="edu-ai-draft" aria-label={copy.title}>
      <div className="edu-ai-draft-head">
        <Sparkles size={15} />
        <strong>{copy.title}</strong>
      </div>
      <p>Aucune donnée n’est envoyée à un tiers, publiée ou enregistrée automatiquement. Relecture obligatoire.</p>
      <label>
        {copy.label}
        <textarea
          className="edu-textarea"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={copy.placeholder}
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
          <Sparkles size={14} /> {busy ? 'Préparation…' : 'Proposer un brouillon'}
        </button>
      ) : (
        <div className="edu-ai-draft-result">
          <label>
            Brouillon éditable
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
          <small>Provenance : {result.engine} · brouillon non appliqué · relecture humaine requise.</small>
          <button className="edu-btn" type="button" disabled={busy} onClick={() => void reviewAndApply()}>
            J’ai relu — utiliser comme brouillon éditable
          </button>
        </div>
      )}
    </section>
  )
}
