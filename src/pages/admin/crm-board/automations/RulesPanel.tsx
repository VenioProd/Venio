import { useState } from 'react'
import Dialog from './Dialog'
import { simulateRule } from './api'
import {
  LEAD_STATUS_LABELS,
  RULE_STATUS_LABELS,
  describeAction,
  describeCondition,
  describeLimits,
  describeTrigger,
  formatRelative,
  type CrmRule,
  type SimulationResult,
} from './types'

interface RulesPanelProps {
  rules: CrmRule[]
  busyId: string | null
  onToggle: (rule: CrmRule) => void
  onEdit: (rule: CrmRule) => void
  onDuplicate: (rule: CrmRule) => void
  onDelete: (rule: CrmRule) => void
  onSimulated: () => void
  onNew: () => void
}

function Arrow() {
  return (
    <svg className="crm-auto-arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function RuleCard({ rule, busy, onToggle, onEdit, onDuplicate, onDelete, onSimulate }: {
  rule: CrmRule
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSimulate: () => void
}) {
  const trig = describeTrigger(rule.trigger)
  const active = rule.status === 'ACTIVE'
  const conds = rule.conditions?.items ?? []
  const stats = rule.stats ?? { runs: 0, ok: 0, errors: 0, lastRunAt: null }
  const rate = stats.ok + stats.errors > 0 ? Math.round((stats.ok / (stats.ok + stats.errors)) * 100) : null
  return (
    <article className={`crm-auto-rule crm-auto-glass${active ? '' : ' crm-auto-rule--off'}`} data-testid={`rule-${rule._id}`}>
      <div className="crm-auto-rule-h">
        <div>
          <h3>
            {rule.name}
            {rule.system && (
              <span className="crm-auto-st" style={{ ['--c' as string]: 'var(--teal)' }}>
                <i />
                Système
              </span>
            )}
            {rule.requireApproval && rule.actions.some((a) => a.type === 'SEND_EMAIL') && (
              <span className="crm-auto-st" style={{ ['--c' as string]: 'var(--amber)' }}>
                <i />
                E-mail à valider
              </span>
            )}
          </h3>
          {rule.description && <small>{rule.description}</small>}
        </div>
        <button
          type="button"
          className="crm-auto-tog"
          aria-pressed={active}
          aria-label={`Activer la règle « ${rule.name} »`}
          disabled={busy}
          onClick={onToggle}
        >
          <span className="crm-auto-sw" aria-hidden="true" />
          {active ? 'Active' : RULE_STATUS_LABELS[rule.status]}
        </button>
      </div>
      <div className="crm-auto-flow">
        <div className="crm-auto-fn" style={{ ['--c' as string]: 'var(--sky)' }}>
          <small>Quand</small>
          <span>
            <b>{trig.title}</b>
            {trig.detail ? ` — ${trig.detail}` : ''}
          </span>
        </div>
        <Arrow />
        <div className="crm-auto-fn" style={{ ['--c' as string]: 'var(--amber)' }}>
          <small>Si</small>
          {conds.length === 0 ? (
            <span>Aucune condition</span>
          ) : (
            <ul>
              {conds.map((c, i) => (
                <li key={i}>{describeCondition(c)}</li>
              ))}
            </ul>
          )}
          {conds.length > 1 && <span className="crm-auto-note">{rule.conditions.op === 'OR' ? 'Au moins une condition' : 'Toutes les conditions'}</span>}
        </div>
        <Arrow />
        <div className="crm-auto-fn" style={{ ['--c' as string]: 'var(--mint)' }}>
          <small>Alors</small>
          <ul>
            {rule.actions.map((a, i) => (
              <li key={i}>{describeAction(a, rule.requireApproval)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="crm-auto-rule-f">
        <span>
          <b>{stats.runs === 0 ? 'Jamais exécutée' : `${stats.runs} exécution${stats.runs > 1 ? 's' : ''}${rate !== null ? ` · ${rate} %` : ''}`}</b>
        </span>
        <span>Dernière : {formatRelative(stats.lastRunAt)}</span>
        <span>Limite : {describeLimits(rule.limits)}</span>
        <span className="crm-auto-sp" />
        <button type="button" className="crm-auto-link" onClick={onSimulate} aria-label={`Simuler « ${rule.name} »`}>
          Simuler
        </button>
        {rule.system ? (
          <button type="button" className="crm-auto-link" onClick={onDuplicate} disabled={busy} aria-label={`Dupliquer « ${rule.name} »`}>
            Dupliquer
          </button>
        ) : (
          <>
            <button type="button" className="crm-auto-link" onClick={onEdit} aria-label={`Modifier « ${rule.name} »`}>
              Modifier
            </button>
            <button type="button" className="crm-auto-link" onClick={onDuplicate} disabled={busy} aria-label={`Dupliquer « ${rule.name} »`}>
              Dupliquer
            </button>
            <button type="button" className="crm-auto-link" onClick={onDelete} disabled={busy} aria-label={`Supprimer « ${rule.name} »`}>
              Supprimer
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default function RulesPanel({ rules, busyId, onToggle, onEdit, onDuplicate, onDelete, onSimulated, onNew }: RulesPanelProps) {
  const [sim, setSim] = useState<{ rule: CrmRule; result: SimulationResult | null; error: string | null; recording: boolean } | null>(null)

  const openSim = async (rule: CrmRule) => {
    setSim({ rule, result: null, error: null, recording: false })
    try {
      const result = await simulateRule(rule._id)
      setSim({ rule, result, error: null, recording: false })
    } catch (e) {
      setSim({ rule, result: null, error: e instanceof Error ? e.message : 'Simulation impossible', recording: false })
    }
  }
  const record = async () => {
    if (!sim) return
    setSim({ ...sim, recording: true })
    try {
      await simulateRule(sim.rule._id, true)
      setSim(null)
      onSimulated()
    } catch (e) {
      setSim({ ...sim, recording: false, error: e instanceof Error ? e.message : 'Consignation impossible' })
    }
  }

  if (rules.length === 0) {
    return (
      <div className="crm-auto-empty crm-auto-glass">
        <p>Aucune règle pour le moment.</p>
        <button type="button" className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm" onClick={onNew} style={{ marginTop: 12 }}>
          Créer une règle
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="crm-auto-rules">
        {rules.map((rule) => (
          <RuleCard
            key={rule._id}
            rule={rule}
            busy={busyId === rule._id}
            onToggle={() => onToggle(rule)}
            onEdit={() => onEdit(rule)}
            onDuplicate={() => onDuplicate(rule)}
            onDelete={() => onDelete(rule)}
            onSimulate={() => void openSim(rule)}
          />
        ))}
      </div>
      {sim && (
        <Dialog titleId="crm-auto-sim-t" onClose={() => setSim(null)}>
          <h3 id="crm-auto-sim-t">Simulation</h3>
          {sim.error ? (
            <p className="crm-auto-err" role="alert">{sim.error}</p>
          ) : !sim.result ? (
            <p role="status">Calcul en cours…</p>
          ) : (
            <>
              <p>
                Sur le pipeline actuel, « {sim.rule.name} » se déclencherait pour <b style={{ color: 'var(--tx)' }}>{sim.result.total} lead{sim.result.total > 1 ? 's' : ''}</b>.
                Aucune action n’est exécutée.
              </p>
              {sim.result.leads.length > 0 && (
                <ul>
                  {sim.result.leads.slice(0, 8).map((l) => (
                    <li key={l.id}>
                      {l.company} <span className="crm-auto-note">({LEAD_STATUS_LABELS[l.status] ?? l.status})</span>
                    </li>
                  ))}
                  {sim.result.leads.length > 8 && <li>… et {sim.result.leads.length - 8} autre(s)</li>}
                </ul>
              )}
            </>
          )}
          <div className="crm-auto-row">
            <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => setSim(null)}>
              Fermer
            </button>
            {sim.result && sim.result.total > 0 && (
              <button type="button" className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm" onClick={() => void record()} disabled={sim.recording}>
                Consigner au journal
              </button>
            )}
          </div>
        </Dialog>
      )}
    </>
  )
}
