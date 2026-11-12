import { useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import Dialog from './Dialog'
import { simulateRule } from './api'
import {
  leadStatusLabel,
  ruleStatusLabel,
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
  canAdminister: boolean
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
    <svg
      className="crm-auto-arr"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function RuleCard({
  rule,
  busy,
  canAdminister,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onSimulate,
}: {
  rule: CrmRule
  busy: boolean
  canAdminister: boolean
  onToggle: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onSimulate: () => void
}) {
  const { t } = useI18n()
  const lockTitle = canAdminister ? undefined : t('crmAuto.adminOnly')
  const trig = describeTrigger(rule.trigger)
  const active = rule.status === 'ACTIVE'
  const conds = rule.conditions?.items ?? []
  const stats = rule.stats ?? { runs: 0, ok: 0, errors: 0, lastRunAt: null }
  const rate = stats.ok + stats.errors > 0 ? Math.round((stats.ok / (stats.ok + stats.errors)) * 100) : null
  return (
    <article
      className={`crm-auto-rule crm-auto-glass${active ? '' : ' crm-auto-rule--off'}`}
      data-testid={`rule-${rule._id}`}
    >
      <div className="crm-auto-rule-h">
        <div>
          <h3>
            {rule.name}
            {rule.system && (
              <span className="crm-auto-st" style={{ ['--c' as string]: 'var(--teal)' }}>
                <i />
                {t('crmAuto.rule.system')}
              </span>
            )}
            {rule.requireApproval && rule.actions.some((a) => a.type === 'SEND_EMAIL') && (
              <span className="crm-auto-st" style={{ ['--c' as string]: 'var(--amber)' }}>
                <i />
                {t('crmAuto.rule.emailToApprove')}
              </span>
            )}
          </h3>
          {rule.description && <small>{rule.description}</small>}
        </div>
        <button
          type="button"
          className="crm-auto-tog"
          aria-pressed={active}
          aria-label={t('crmAuto.rule.activateAria', { name: rule.name })}
          disabled={busy || !canAdminister}
          title={lockTitle}
          onClick={onToggle}
        >
          <span className="crm-auto-sw" aria-hidden="true" />
          {active ? t('crmAuto.ruleStatus.ACTIVE') : ruleStatusLabel(rule.status)}
        </button>
      </div>
      <div className="crm-auto-flow">
        <div className="crm-auto-fn" style={{ ['--c' as string]: 'var(--sky)' }}>
          <small>{t('crmAuto.rule.when')}</small>
          <span>
            <b>{trig.title}</b>
            {trig.detail ? ` — ${trig.detail}` : ''}
          </span>
        </div>
        <Arrow />
        <div className="crm-auto-fn" style={{ ['--c' as string]: 'var(--amber)' }}>
          <small>{t('crmAuto.rule.if')}</small>
          {conds.length === 0 ? (
            <span>{t('crmAuto.rule.noCondition')}</span>
          ) : (
            <ul>
              {conds.map((c, i) => (
                <li key={i}>{describeCondition(c)}</li>
              ))}
            </ul>
          )}
          {conds.length > 1 && (
            <span className="crm-auto-note">
              {rule.conditions.op === 'OR' ? t('crmAuto.rule.anyCondition') : t('crmAuto.rule.allConditions')}
            </span>
          )}
        </div>
        <Arrow />
        <div className="crm-auto-fn" style={{ ['--c' as string]: 'var(--mint)' }}>
          <small>{t('crmAuto.rule.then')}</small>
          <ul>
            {rule.actions.map((a, i) => (
              <li key={i}>{describeAction(a, rule.requireApproval)}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="crm-auto-rule-f">
        <span>
          <b>
            {stats.runs === 0
              ? t('crmAuto.rule.neverRun')
              : `${t('crmAuto.rule.runCount', { count: stats.runs })}${rate !== null ? t('crmAuto.rule.runRate', { rate }) : ''}`}
          </b>
        </span>
        <span>{t('crmAuto.rule.last', { when: formatRelative(stats.lastRunAt) })}</span>
        <span>{t('crmAuto.rule.limit', { limit: describeLimits(rule.limits) })}</span>
        <span className="crm-auto-sp" />
        <button
          type="button"
          className="crm-auto-link"
          onClick={onSimulate}
          aria-label={t('crmAuto.rule.simulateAria', { name: rule.name })}
        >
          {t('crmAuto.rule.simulate')}
        </button>
        {rule.system ? (
          <button
            type="button"
            className="crm-auto-link"
            onClick={onDuplicate}
            disabled={busy || !canAdminister}
            title={lockTitle}
            aria-label={t('crmAuto.rule.duplicateAria', { name: rule.name })}
          >
            {t('crmAuto.rule.duplicate')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="crm-auto-link"
              onClick={onEdit}
              disabled={!canAdminister}
              title={lockTitle}
              aria-label={t('crmAuto.rule.editAria', { name: rule.name })}
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="crm-auto-link"
              onClick={onDuplicate}
              disabled={busy || !canAdminister}
              title={lockTitle}
              aria-label={t('crmAuto.rule.duplicateAria', { name: rule.name })}
            >
              {t('crmAuto.rule.duplicate')}
            </button>
            <button
              type="button"
              className="crm-auto-link"
              onClick={onDelete}
              disabled={busy || !canAdminister}
              title={lockTitle}
              aria-label={t('crmAuto.rule.deleteAria', { name: rule.name })}
            >
              {t('common.delete')}
            </button>
          </>
        )}
      </div>
    </article>
  )
}

export default function RulesPanel({
  rules,
  canAdminister,
  busyId,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
  onSimulated,
  onNew,
}: RulesPanelProps) {
  const { t } = useI18n()
  const [sim, setSim] = useState<{
    rule: CrmRule
    result: SimulationResult | null
    error: string | null
    recording: boolean
  } | null>(null)

  const openSim = async (rule: CrmRule) => {
    setSim({ rule, result: null, error: null, recording: false })
    try {
      const result = await simulateRule(rule._id)
      setSim({ rule, result, error: null, recording: false })
    } catch (e) {
      setSim({ rule, result: null, error: e instanceof Error ? e.message : t('crmAuto.sim.error'), recording: false })
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
      setSim({ ...sim, recording: false, error: e instanceof Error ? e.message : t('crmAuto.sim.recordError') })
    }
  }

  if (rules.length === 0) {
    return (
      <div className="crm-auto-empty crm-auto-glass">
        <p>{t('crmAuto.rule.none')}</p>
        {canAdminister && (
          <button
            type="button"
            className="portal-button crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm"
            onClick={onNew}
            style={{ marginTop: 12 }}
          >
            {t('crmAuto.rule.create')}
          </button>
        )}
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
            canAdminister={canAdminister}
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
          <h3 id="crm-auto-sim-t">{t('crmAuto.sim.title')}</h3>
          {sim.error ? (
            <p className="crm-auto-err" role="alert">
              {sim.error}
            </p>
          ) : !sim.result ? (
            <p role="status">{t('crmAuto.sim.running')}</p>
          ) : (
            <>
              <p>
                {t('crmAuto.sim.before', { name: sim.rule.name })}
                <b style={{ color: 'var(--tx)' }}>{t('crmAuto.sim.leads', { count: sim.result.total })}</b>
                {t('crmAuto.sim.after')}
              </p>
              {sim.result.leads.length > 0 && (
                <ul>
                  {sim.result.leads.slice(0, 8).map((l) => (
                    <li key={l.id}>
                      {l.company} <span className="crm-auto-note">({leadStatusLabel(l.status)})</span>
                    </li>
                  ))}
                  {sim.result.leads.length > 8 && (
                    <li>{t('crmAuto.sim.more', { count: sim.result.leads.length - 8 })}</li>
                  )}
                </ul>
              )}
            </>
          )}
          <div className="crm-auto-row">
            <button
              type="button"
              className="portal-button secondary crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
              onClick={() => setSim(null)}
            >
              {t('common.close')}
            </button>
            {sim.result && sim.result.total > 0 && (
              <button
                type="button"
                className="portal-button crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm"
                onClick={() => void record()}
                disabled={sim.recording}
              >
                {t('crmAuto.sim.record')}
              </button>
            )}
          </div>
        </Dialog>
      )}
    </>
  )
}
