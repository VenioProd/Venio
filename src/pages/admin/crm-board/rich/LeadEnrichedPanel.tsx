import { useEffect, useState } from 'react'
import type { Lead } from '../../../../types/crm.types'
import { fetchLeadDocuments, fetchLeadRuns, fetchLeadTasks, type LeadDocuments, type LeadRun, type LeadTask } from './api'
import { formatEuro, probabilityOf, weightedOf } from './columns'
import './rich.css'

interface Props {
  lead: Lead
  canManageCrm: boolean
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  /** Reflète la modification dans la fiche ouverte, sans attendre le rechargement du pipeline. */
  onLocalChange: (patch: Partial<Lead>) => void
}

type Tab = 'valeur' | 'taches' | 'documents' | 'automatisations'
const TABS: Array<[Tab, string]> = [
  ['valeur', 'Valeur et suivi'],
  ['taches', 'Tâches'],
  ['documents', 'Documents'],
  ['automatisations', 'Automatisations'],
]
const NEW_BADGE = <span className="rich-new">Nouveau</span>
const STEP_LABEL: Record<string, string> = { OK: 'Succès', ERR: 'Erreur', SKIP: 'Ignorée', PENDING: 'En attente', SIM: 'Simulation', RUNNING: 'En cours' }

export default function LeadEnrichedPanel({ lead, canManageCrm, onUpdateLead, onLocalChange }: Props) {
  const [tab, setTab] = useState<Tab>('valeur')
  const [tasks, setTasks] = useState<LeadTask[] | null>(null)
  const [docs, setDocs] = useState<LeadDocuments | null>(null)
  const [runs, setRuns] = useState<LeadRun[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [tagDraft, setTagDraft] = useState('')

  useEffect(() => {
    setFailed(false)
    const onError = () => setFailed(true)
    if (tab === 'taches' && !tasks) fetchLeadTasks(lead._id).then(setTasks).catch(onError)
    if (tab === 'documents' && !docs) fetchLeadDocuments(lead._id).then(setDocs).catch(onError)
    if (tab === 'automatisations' && !runs) fetchLeadRuns(lead._id).then(setRuns).catch(onError)
  }, [tab, lead._id, tasks, docs, runs])

  const save = async (patch: Record<string, unknown>) => {
    await onUpdateLead(lead._id, patch)
    const local: Partial<Lead> = { ...(patch as Partial<Lead>) }
    if ('automationPaused' in patch) local.automationPausedAt = patch.automationPaused ? new Date().toISOString() : null
    onLocalChange(local)
  }
  const tags = lead.tags ?? []

  return (
    <section className="rich-panel" aria-label="Valeur, tâches, documents et automatisations">
      <div className="rich-ptabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`rich-tab-${id}`} aria-selected={tab === id} aria-controls={`rich-panel-${id}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`rich-panel-${tab}`} aria-labelledby={`rich-tab-${tab}`} className="rich-pbody">
        {failed && <p className="rich-dim">Chargement impossible. Réessayez en rouvrant la fiche.</p>}

        {tab === 'valeur' && (
          <>
            <div className="rich-pkpis">
              <div><small>Montant</small><b>{formatEuro(lead.budget)}</b></div>
              <div><small>Probabilité{NEW_BADGE}</small><b>{probabilityOf(lead)} %</b></div>
              <div><small>Pondéré{NEW_BADGE}</small><b>{formatEuro(weightedOf(lead) || null)}</b></div>
            </div>
            {canManageCrm && (
              <div className="rich-pgrid">
                <label>
                  <span>Probabilité (%){NEW_BADGE}</span>
                  <input type="number" min={0} max={100} defaultValue={lead.probability ?? ''} placeholder={`${probabilityOf(lead)} (selon l’étape)`} onBlur={(e) => e.target.value !== String(lead.probability ?? '') && save({ probability: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
                <label>
                  <span>Clôture prévue{NEW_BADGE}</span>
                  <input type="date" defaultValue={lead.expectedCloseAt?.slice(0, 10) ?? ''} onBlur={(e) => e.target.value !== (lead.expectedCloseAt?.slice(0, 10) ?? '') && save({ expectedCloseAt: e.target.value || null })} />
                </label>
                <label>
                  <span>Prochaine action{NEW_BADGE}</span>
                  <input defaultValue={lead.nextActionLabel ?? ''} maxLength={200} onBlur={(e) => e.target.value !== (lead.nextActionLabel ?? '') && save({ nextActionLabel: e.target.value })} />
                </label>
                <label>
                  <span>Secteur{NEW_BADGE}</span>
                  <input defaultValue={lead.sector ?? ''} maxLength={80} onBlur={(e) => e.target.value !== (lead.sector ?? '') && save({ sector: e.target.value })} />
                </label>
              </div>
            )}
            <div>
              <small className="rich-sect">Tags{NEW_BADGE}</small>
              <div className="rich-tags">
                {tags.map((x) => (
                  <span key={x}>
                    {x}
                    {canManageCrm && <button type="button" aria-label={`Retirer le tag ${x}`} onClick={() => save({ tags: tags.filter((y) => y !== x) })}>×</button>}
                  </span>
                ))}
                {tags.length === 0 && <span className="rich-dim">Aucun tag</span>}
              </div>
              {canManageCrm && (
                <form className="rich-inline" onSubmit={(e) => { e.preventDefault(); const v = tagDraft.trim(); if (v && !tags.includes(v)) void save({ tags: [...tags, v] }); setTagDraft('') }}>
                  <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Ajouter un tag" maxLength={40} aria-label="Nouveau tag" />
                  <button type="submit" className="rich-btn" disabled={!tagDraft.trim()}>Ajouter</button>
                </form>
              )}
            </div>
            <dl className="rich-dl">
              <div><dt>Source{NEW_BADGE}</dt><dd>{lead.source || '—'}{lead.sourceDetail ? ` · ${lead.sourceDetail}` : ''}</dd></div>
              <div><dt>Interactions</dt><dd>{lead.interactionsCount ?? 0}</dd></div>
            </dl>
            {canManageCrm && (
              <label className="rich-switch">
                <input type="checkbox" checked={Boolean(lead.automationPausedAt)} onChange={(e) => save({ automationPaused: e.target.checked })} />
                <span>Suspendre les automatisations pour ce lead{NEW_BADGE}</span>
              </label>
            )}
          </>
        )}

        {tab === 'taches' && (tasks === null ? <p className="rich-dim">Chargement…</p> : tasks.length === 0 ? <p className="rich-dim">Aucune tâche liée à ce lead.</p> : (
          <ul className="rich-list">
            {tasks.map((task) => (
              <li key={task._id} className={task.status === 'TERMINE' ? 'is-done' : ''}>
                <b>{task.title}</b>
                <small>
                  {typeof task.userId === 'object' && task.userId?.name ? `${task.userId.name} · ` : ''}
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Sans échéance'}
                  {task.ruleId ? ' · créée par une règle' : ''}
                </small>
              </li>
            ))}
          </ul>
        ))}

        {tab === 'documents' && (docs === null ? <p className="rich-dim">Chargement…</p> : docs.quotes.length + docs.projects.length === 0 ? <p className="rich-dim">Aucun devis ni projet lié.</p> : (
          <ul className="rich-list">
            {docs.quotes.map((q) => (
              <li key={q._id}><b>{q.title}</b><small>Devis{q.reference ? ` ${q.reference}` : ''} · {q.status}</small></li>
            ))}
            {docs.projects.map((p) => (
              <li key={p._id}><b>{p.name}</b><small>Projet livré · {p.status}</small></li>
            ))}
          </ul>
        ))}

        {tab === 'automatisations' && (runs === null ? <p className="rich-dim">Chargement…</p> : runs.length === 0 ? <p className="rich-dim">Aucune règle ne s’est exécutée sur ce lead.</p> : (
          <ul className="rich-list">
            {runs.map((r) => (
              <li key={r._id}>
                <b>{r.ruleName}</b>
                <small>{STEP_LABEL[r.status] ?? r.status} · {new Date(r.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small>
                <small>{r.steps.map((s) => s.message).filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  )
}
