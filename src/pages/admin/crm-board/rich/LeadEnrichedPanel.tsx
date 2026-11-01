import { useEffect, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { MessageKey } from '../../../../i18n'
import NewBadge from './NewBadge'
import type { Lead } from '../../../../types/crm.types'
import { fetchLeadDocuments, fetchLeadRuns, fetchLeadTasks, type LeadDocuments, type LeadRun, type LeadTask } from './api'
import { formatEuro, probabilityOf, shortDate, weightedOf } from './columns'
import './rich.css'

interface Props {
  lead: Lead
  canManageCrm: boolean
  onUpdateLead: (leadId: string, patch: Record<string, unknown>) => Promise<void>
  /** Reflète la modification dans la fiche ouverte, sans attendre le rechargement du pipeline. */
  onLocalChange: (patch: Partial<Lead>) => void
}

type Tab = 'valeur' | 'taches' | 'documents' | 'automatisations'
const TABS: Array<[Tab, MessageKey]> = [
  ['valeur', 'crmRich.panel.tabValue'],
  ['taches', 'crmRich.panel.tabTasks'],
  ['documents', 'crmRich.panel.tabDocs'],
  ['automatisations', 'crmRich.panel.tabAutomations'],
]
const STEP_LABEL_KEY: Record<string, MessageKey> = {
  OK: 'crmRich.step.OK',
  ERR: 'crmRich.step.ERR',
  SKIP: 'crmRich.step.SKIP',
  PENDING: 'crmRich.step.PENDING',
  SIM: 'crmRich.step.SIM',
  RUNNING: 'crmRich.step.RUNNING',
}

export default function LeadEnrichedPanel({ lead, canManageCrm, onUpdateLead, onLocalChange }: Props) {
  const { t } = useI18n()
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
    <section className="rich-panel" aria-label={t('crmRich.panel.aria')}>
      <div className="rich-ptabs" role="tablist">
        {TABS.map(([id, labelKey]) => (
          <button key={id} type="button" role="tab" id={`rich-tab-${id}`} aria-selected={tab === id} aria-controls={`rich-panel-${id}`} onClick={() => setTab(id)}>
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`rich-panel-${tab}`} aria-labelledby={`rich-tab-${tab}`} className="rich-pbody">
        {failed && <p className="rich-dim">{t('crmRich.panel.loadFailed')}</p>}

        {tab === 'valeur' && (
          <>
            <div className="rich-pkpis">
              <div><small>{t('crmRich.panel.amount')}</small><b>{formatEuro(lead.budget)}</b></div>
              <div><small>{t('crmRich.panel.probability')}<NewBadge /></small><b>{probabilityOf(lead)} %</b></div>
              <div><small>{t('crmRich.panel.weighted')}<NewBadge /></small><b>{formatEuro(weightedOf(lead) || null)}</b></div>
            </div>
            {canManageCrm && (
              <div className="rich-pgrid">
                <label>
                  <span>{t('crmRich.panel.probabilityPct')}<NewBadge /></span>
                  <input type="number" min={0} max={100} defaultValue={lead.probability ?? ''} placeholder={t('crmRich.panel.byStage', { value: probabilityOf(lead) })} onBlur={(e) => e.target.value !== String(lead.probability ?? '') && save({ probability: e.target.value === '' ? null : Number(e.target.value) })} />
                </label>
                <label>
                  <span>{t('crmRich.panel.expectedClose')}<NewBadge /></span>
                  <input type="date" defaultValue={lead.expectedCloseAt?.slice(0, 10) ?? ''} onBlur={(e) => e.target.value !== (lead.expectedCloseAt?.slice(0, 10) ?? '') && save({ expectedCloseAt: e.target.value || null })} />
                </label>
                <label>
                  <span>{t('crmRich.panel.nextAction')}<NewBadge /></span>
                  <input defaultValue={lead.nextActionLabel ?? ''} maxLength={200} onBlur={(e) => e.target.value !== (lead.nextActionLabel ?? '') && save({ nextActionLabel: e.target.value })} />
                </label>
                <label>
                  <span>{t('crmRich.panel.sector')}<NewBadge /></span>
                  <input defaultValue={lead.sector ?? ''} maxLength={80} onBlur={(e) => e.target.value !== (lead.sector ?? '') && save({ sector: e.target.value })} />
                </label>
              </div>
            )}
            <div>
              <small className="rich-sect">{t('crmRich.panel.tags')}<NewBadge /></small>
              <div className="rich-tags">
                {tags.map((x) => (
                  <span key={x}>
                    {x}
                    {canManageCrm && <button type="button" aria-label={t('crmRich.panel.removeTag', { tag: x })} onClick={() => save({ tags: tags.filter((y) => y !== x) })}>×</button>}
                  </span>
                ))}
                {tags.length === 0 && <span className="rich-dim">{t('crmRich.panel.noTag')}</span>}
              </div>
              {canManageCrm && (
                <form className="rich-inline" onSubmit={(e) => { e.preventDefault(); const v = tagDraft.trim(); if (v && !tags.includes(v)) void save({ tags: [...tags, v] }); setTagDraft('') }}>
                  <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder={t('crmRich.panel.addTagPlaceholder')} maxLength={40} aria-label={t('crmRich.panel.newTagAria')} />
                  <button type="submit" className="rich-btn" disabled={!tagDraft.trim()}>{t('crmRich.panel.add')}</button>
                </form>
              )}
            </div>
            <dl className="rich-dl">
              <div><dt>{t('crmRich.panel.source')}<NewBadge /></dt><dd>{lead.source || '—'}{lead.sourceDetail ? ` · ${lead.sourceDetail}` : ''}</dd></div>
              <div><dt>{t('crmRich.panel.interactions')}</dt><dd>{lead.interactionsCount ?? 0}</dd></div>
            </dl>
            {canManageCrm && (
              <label className="rich-switch">
                <input type="checkbox" checked={Boolean(lead.automationPausedAt)} onChange={(e) => save({ automationPaused: e.target.checked })} />
                <span>{t('crmRich.panel.pauseAutomations')}<NewBadge /></span>
              </label>
            )}
          </>
        )}

        {tab === 'taches' && (tasks === null ? <p className="rich-dim">{t('crmRich.panel.loading')}</p> : tasks.length === 0 ? <p className="rich-dim">{t('crmRich.panel.noTasks')}</p> : (
          <ul className="rich-list">
            {tasks.map((task) => (
              <li key={task._id} className={task.status === 'TERMINE' ? 'is-done' : ''}>
                <b>{task.title}</b>
                <small>
                  {typeof task.userId === 'object' && task.userId?.name ? `${task.userId.name} · ` : ''}
                  {task.dueDate ? shortDate(task.dueDate) : t('crmRich.panel.noDueDate')}
                  {task.ruleId ? t('crmRich.panel.createdByRule') : ''}
                </small>
              </li>
            ))}
          </ul>
        ))}

        {tab === 'documents' && (docs === null ? <p className="rich-dim">{t('crmRich.panel.loading')}</p> : docs.quotes.length + docs.projects.length === 0 ? <p className="rich-dim">{t('crmRich.panel.noDocs')}</p> : (
          <ul className="rich-list">
            {docs.quotes.map((q) => (
              <li key={q._id}><b>{q.title}</b><small>{t('crmRich.panel.quote')}{q.reference ? ` ${q.reference}` : ''} · {q.status}</small></li>
            ))}
            {docs.projects.map((p) => (
              <li key={p._id}><b>{p.name}</b><small>{t('crmRich.panel.deliveredProject')} · {p.status}</small></li>
            ))}
          </ul>
        ))}

        {tab === 'automatisations' && (runs === null ? <p className="rich-dim">{t('crmRich.panel.loading')}</p> : runs.length === 0 ? <p className="rich-dim">{t('crmRich.panel.noRuns')}</p> : (
          <ul className="rich-list">
            {runs.map((r) => (
              <li key={r._id}>
                <b>{r.ruleName}</b>
                <small>{STEP_LABEL_KEY[r.status] ? t(STEP_LABEL_KEY[r.status]) : r.status} · {shortDate(r.createdAt)}</small>
                <small>{r.steps.map((s) => s.message).filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  )
}
