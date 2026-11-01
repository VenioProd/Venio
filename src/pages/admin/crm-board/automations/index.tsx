import { useCallback, useEffect, useMemo, useState } from 'react'
import Dialog from './Dialog'
import RuleBuilder from './RuleBuilder'
import RulesPanel from './RulesPanel'
import RunsJournal, { type JournalFilter } from './RunsJournal'
import TemplatesGrid from './TemplatesGrid'
import { createRule, deleteRule, fetchRules, fetchRuns, setRuleStatus } from './api'
import { handleTabKeys } from './tabKeys'
import { draftFromRule, emptyDraft, type CrmRule, type CrmRuleRun, type RuleDraft } from './types'
import './automations.css'

type Section = 'regles' | 'journal' | 'modeles'
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'regles', label: 'Règles' },
  { key: 'journal', label: 'Journal d’exécution' },
  { key: 'modeles', label: 'Modèles' },
]
const tabId = (i: number) => `crm-auto-tab-${SECTIONS[i].key}`

interface BuilderState {
  rule: CrmRule | null
  draft: RuleDraft
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export default function CrmAutomations() {
  const [rules, setRules] = useState<CrmRule[]>([])
  const [recent, setRecent] = useState<CrmRuleRun[]>([])
  const [recentTotal, setRecentTotal] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('regles')
  const [filter, setFilter] = useState<JournalFilter>('all')
  const [version, setVersion] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [builder, setBuilder] = useState<BuilderState | null>(null)
  const [toDelete, setToDelete] = useState<CrmRule | null>(null)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [list, page, pend] = await Promise.all([fetchRules(), fetchRuns({ pageSize: 50 }), fetchRuns({ status: 'PENDING', pageSize: 1 })])
      setRules(list)
      setRecent(page.items ?? [])
      setRecentTotal(page.total ?? 0)
      setPending(pend.total ?? 0)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorText(e, 'Impossible de charger les automatisations'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const refreshAll = useCallback(() => {
    void reload()
    setVersion((v) => v + 1)
  }, [reload])

  const notify = (text: string) => {
    setProblem(null)
    setMessage(text)
  }

  const toggle = async (rule: CrmRule) => {
    setBusyId(rule._id)
    setProblem(null)
    try {
      const updated = await setRuleStatus(rule._id, rule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')
      setRules((list) => list.map((r) => (r._id === rule._id ? { ...r, ...updated } : r)))
      notify(updated.status === 'ACTIVE' ? 'Règle activée' : 'Règle mise en pause')
    } catch (e) {
      setProblem(errorText(e, 'Changement de statut impossible'))
    } finally {
      setBusyId(null)
    }
  }

  const duplicate = async (rule: CrmRule) => {
    setBusyId(rule._id)
    setProblem(null)
    try {
      const copy = await createRule(draftFromRule(rule, true))
      await reload()
      notify('Règle dupliquée en brouillon')
      setBuilder({ rule: copy, draft: draftFromRule(copy) })
    } catch (e) {
      setProblem(errorText(e, 'Duplication impossible'))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    const rule = toDelete
    setToDelete(null)
    setBusyId(rule._id)
    try {
      await deleteRule(rule._id)
      setRules((list) => list.filter((r) => r._id !== rule._id))
      notify('Règle supprimée')
    } catch (e) {
      setProblem(errorText(e, 'Suppression impossible'))
    } finally {
      setBusyId(null)
    }
  }

  const kpis = useMemo(() => {
    const active = rules.filter((r) => r.status === 'ACTIVE').length
    const systemActive = rules.filter((r) => r.status === 'ACTIVE' && r.system).length
    const totals = rules.reduce(
      (acc, r) => ({ runs: acc.runs + (r.stats?.runs ?? 0), ok: acc.ok + (r.stats?.ok ?? 0), errors: acc.errors + (r.stats?.errors ?? 0) }),
      { runs: 0, ok: 0, errors: 0 },
    )
    const judged = totals.ok + totals.errors
    const tasks = recent.reduce((n, run) => n + run.steps.filter((s) => s.action === 'CREATE_TASK' && s.status === 'OK').length, 0)
    return [
      { label: 'Règles actives', value: `${active}/${rules.length}`, hint: `dont ${systemActive} règle${systemActive > 1 ? 's' : ''} système` },
      { label: 'Exécutions', value: String(totals.runs), hint: 'cumul de toutes les règles' },
      { label: 'Taux de succès', value: judged > 0 ? `${Math.round((totals.ok / judged) * 100)} %` : '—', hint: `${totals.errors} erreur${totals.errors > 1 ? 's' : ''} au total` },
      { label: 'Tâches créées', value: String(tasks), hint: `sur les ${recent.length} dernières exécutions` },
      { label: 'À valider', value: String(pending), hint: pending > 0 ? 'e-mails en attente' : 'rien en attente' },
    ]
  }, [rules, recent, pending])

  const applyTemplate = (template: { draft: RuleDraft }) => setBuilder({ rule: null, draft: template.draft })

  return (
    <div className="crm-auto">
      <p className="crm-auto-sr" role="status" aria-live="polite">{message}</p>

      <section className="crm-auto-kpis" aria-label="Indicateurs des automatisations">
        {kpis.map((k) => (
          <div className="crm-auto-kpi crm-auto-glass" key={k.label}>
            <small>{k.label}</small>
            <b>{loading ? '…' : k.value}</b>
            <em>{loading ? ' ' : k.hint}</em>
          </div>
        ))}
      </section>

      {loadError && (
        <div className="crm-auto-notice crm-auto-notice--err" role="alert">
          <span>{loadError}</span>
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => void reload()}>Réessayer</button>
        </div>
      )}
      {problem && (
        <div className="crm-auto-notice crm-auto-notice--err" role="alert">
          <span>{problem}</span>
        </div>
      )}
      {pending > 0 && (
        <div className="crm-auto-notice">
          <span>{pending} e-mail{pending > 1 ? 's' : ''} en attente de validation avant envoi.</span>
          <button
            type="button"
            className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
            onClick={() => {
              setFilter('PENDING')
              setSection('journal')
            }}
          >
            Examiner
          </button>
        </div>
      )}

      <div className="crm-auto-top">
        <div className="crm-auto-sub" role="tablist" aria-label="Section">
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              id={tabId(i)}
              type="button"
              role="tab"
              aria-selected={section === s.key}
              aria-controls={`crm-auto-panel-${s.key}`}
              tabIndex={section === s.key ? 0 : -1}
              onClick={() => setSection(s.key)}
              onKeyDown={(e) => handleTabKeys(e, i, SECTIONS.length, (n) => setSection(SECTIONS[n].key), tabId)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" id="crm-auto-new" className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm" onClick={() => setBuilder({ rule: null, draft: emptyDraft() })}>
          + Nouvelle règle
        </button>
      </div>

      <div role="tabpanel" id="crm-auto-panel-regles" aria-labelledby={tabId(0)} hidden={section !== 'regles'}>
        {section === 'regles' &&
          (loading ? (
            <p className="crm-auto-empty crm-auto-glass" role="status">Chargement des règles…</p>
          ) : (
            <RulesPanel
              rules={rules}
              busyId={busyId}
              onToggle={(r) => void toggle(r)}
              onEdit={(r) => setBuilder({ rule: r, draft: draftFromRule(r) })}
              onDuplicate={(r) => void duplicate(r)}
              onDelete={setToDelete}
              onSimulated={() => {
                notify('Simulation consignée au journal')
                refreshAll()
              }}
              onNew={() => setBuilder({ rule: null, draft: emptyDraft() })}
            />
          ))}
      </div>
      <div role="tabpanel" id="crm-auto-panel-journal" aria-labelledby={tabId(1)} hidden={section !== 'journal'}>
        {section === 'journal' && (
          <RunsJournal
            filter={filter}
            onFilterChange={setFilter}
            version={version}
            onChanged={(text) => {
              notify(text)
              refreshAll()
            }}
            onError={(text) => setProblem(text)}
          />
        )}
      </div>
      <div role="tabpanel" id="crm-auto-panel-modeles" aria-labelledby={tabId(2)} hidden={section !== 'modeles'}>
        {section === 'modeles' && <TemplatesGrid onUse={applyTemplate} />}
      </div>
      {recentTotal > 0 && section === 'regles' && <p className="crm-auto-note">{recentTotal} exécution{recentTotal > 1 ? 's' : ''} au journal (90 derniers jours).</p>}

      {builder && (
        <RuleBuilder
          rule={builder.rule}
          draft={builder.draft}
          onClose={() => setBuilder(null)}
          onSaved={(text) => {
            setBuilder(null)
            notify(text)
            setSection('regles')
            void reload()
          }}
        />
      )}
      {toDelete && (
        <Dialog titleId="crm-auto-del-t" onClose={() => setToDelete(null)}>
          <h3 id="crm-auto-del-t">Supprimer cette règle ?</h3>
          <p>« {toDelete.name} » sera supprimée. Son historique d’exécution reste au journal.</p>
          <div className="crm-auto-row">
            <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => setToDelete(null)}>Annuler</button>
            <button type="button" className="crm-auto-btn crm-auto-btn--danger crm-auto-btn--sm" onClick={() => void confirmDelete()}>Supprimer</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
