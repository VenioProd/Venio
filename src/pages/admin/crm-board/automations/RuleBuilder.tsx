import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { translate, type MessageKey } from '../../../../i18n'
import Dialog from './Dialog'
import { createRule, fetchAdmins, simulateRule, updateRule } from './api'
import { handleTabKeys } from './tabKeys'
import {
  ACTION_TYPES,
  BOOL_OPERATORS,
  CONDITION_FIELD_LIST,
  LEAD_STATUSES,
  NUMERIC_FIELDS,
  NUMERIC_OPERATORS,
  TEXT_OPERATORS,
  TRIGGER_TYPES,
  actionLabel,
  describeAction,
  fieldLabel,
  leadStatusLabel,
  operatorLabel,
  triggerLabel,
  type ActionType,
  type ConditionField,
  type CrmRule,
  type RuleAction,
  type RuleCondition,
  type RuleDraft,
  type SimulationResult,
  type TriggerType,
} from './types'

const STEP_KEYS: MessageKey[] = ['crmAuto.builder.step.trigger', 'crmAuto.builder.step.conditions', 'crmAuto.builder.step.actions', 'crmAuto.builder.step.guardrails']
const FIELD_KEYS = CONDITION_FIELD_LIST
const SETTABLE_FIELDS = ['priority', 'leadTemperature', 'probability', 'nextActionLabel', 'sector']
/** Valeurs par défaut d'une action ajoutée : textes modifiables, proposés dans la langue de l'interface. */
const defaultParams = (): Record<ActionType, Record<string, unknown>> => ({
  CREATE_TASK: { title: translate('crmAuto.default.taskTitle'), dueInDays: 1, assignTo: 'owner' },
  NOTIFY: { recipients: 'owner', title: translate('crmAuto.default.notifyTitle'), message: '' },
  ASSIGN: { strategy: 'round_robin' },
  SET_STATUS: { status: 'CONTACTED' },
  ADD_TAG: { tag: '' },
  SET_FIELD: { field: 'priority', value: '' },
  SEND_EMAIL: { subject: translate('crmAuto.default.emailSubject'), body: translate('crmAuto.default.emailBody') },
  CREATE_CLIENT: {},
  CREATE_PROJECT: {},
  ARCHIVE: {},
})

const operatorsFor = (field: ConditionField) => (field === 'archived' ? BOOL_OPERATORS : NUMERIC_FIELDS.includes(field) ? NUMERIC_OPERATORS : TEXT_OPERATORS)

/** Convertit les valeurs saisies (texte) vers ce que l'API attend. */
export function normalizeDraft(draft: RuleDraft): RuleDraft {
  const items = draft.conditions.items.map((c): RuleCondition => {
    if (c.operator === 'empty' || c.operator === 'notEmpty') return { field: c.field, operator: c.operator }
    if (c.field === 'archived') return { field: c.field, operator: c.operator, value: c.value === true || c.value === 'true' }
    if (NUMERIC_FIELDS.includes(c.field)) return { field: c.field, operator: c.operator, value: Number(c.value) || 0 }
    if (c.operator === 'in' || c.operator === 'nin') {
      const list = Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',')
      return { field: c.field, operator: c.operator, value: list.map((v) => String(v).trim()).filter(Boolean) }
    }
    return { field: c.field, operator: c.operator, value: Array.isArray(c.value) ? String(c.value[0] ?? '') : String(c.value ?? '') }
  })
  const params = { ...draft.trigger.params }
  if (draft.trigger.type === 'LEAD_INACTIVE') params.days = Math.max(1, Number(params.days) || 7)
  if (draft.trigger.type === 'SCORE_AT_LEAST') params.threshold = Number(params.threshold) || 0
  const actions = draft.actions.map((a) => (a.type === 'CREATE_TASK' ? { ...a, params: { ...a.params, dueInDays: Number(a.params.dueInDays) || 0 } } : a))
  return { ...draft, name: draft.name.trim(), trigger: { ...draft.trigger, params }, conditions: { ...draft.conditions, items }, actions }
}

interface RuleBuilderProps {
  rule: CrmRule | null
  draft: RuleDraft
  onClose: () => void
  onSaved: (message: string) => void
}

function StatusChips({ label, value, onChange }: { label: string; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <fieldset className="crm-auto-fld">
      <legend>{label}</legend>
      <div className="crm-auto-opts">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value.includes(s)}
            onClick={() => onChange(value.includes(s) ? value.filter((v) => v !== s) : [...value, s])}
          >
            {leadStatusLabel(s)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function ActionEditor({ action, onChange, admins }: {
  action: RuleAction
  onChange: (params: Record<string, unknown>) => void
  admins: Array<{ _id: string; name?: string; email?: string }>
}) {
  const { t } = useI18n()
  const p = action.params
  const set = (patch: Record<string, unknown>) => onChange({ ...p, ...patch })
  const id = (n: string) => `crm-auto-a-${action.type}-${n}`
  switch (action.type) {
    case 'CREATE_TASK':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('title')}>{t('crmAuto.editor.taskTitle')}</label>
            <input id={id('title')} className="crm-auto-inp" value={String(p.title ?? '')} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('due')}>{t('crmAuto.editor.dueDays')}</label>
            <input id={id('due')} className="crm-auto-inp" type="number" min={0} inputMode="numeric" value={String(p.dueInDays ?? 1)} onChange={(e) => set({ dueInDays: e.target.value })} />
          </div>
        </>
      )
    case 'NOTIFY':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('rcp')}>{t('crmAuto.editor.recipients')}</label>
            <select id={id('rcp')} className="crm-auto-sel" value={String(p.recipients ?? 'owner')} onChange={(e) => set({ recipients: e.target.value })}>
              <option value="owner">{t('crmAuto.editor.recipientOwner')}</option>
              <option value="admins">{t('crmAuto.editor.recipientAdmins')}</option>
            </select>
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('title')}>{t('crmAuto.editor.title')}</label>
            <input id={id('title')} className="crm-auto-inp" value={String(p.title ?? '')} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('msg')}>{t('crmAuto.editor.message')}</label>
            <input id={id('msg')} className="crm-auto-inp" value={String(p.message ?? '')} onChange={(e) => set({ message: e.target.value })} />
          </div>
        </>
      )
    case 'ASSIGN':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('str')}>{t('crmAuto.editor.strategy')}</label>
            <select id={id('str')} className="crm-auto-sel" value={String(p.strategy ?? 'round_robin')} onChange={(e) => set({ strategy: e.target.value })}>
              <option value="round_robin">{t('crmAuto.editor.roundRobin')}</option>
              <option value="user">{t('crmAuto.editor.specificUser')}</option>
            </select>
          </div>
          {p.strategy === 'user' && (
            <div className="crm-auto-fld">
              <label htmlFor={id('usr')}>{t('crmAuto.editor.user')}</label>
              <select id={id('usr')} className="crm-auto-sel" value={String(p.userId ?? '')} onChange={(e) => set({ userId: e.target.value })}>
                <option value="">{t('crmAuto.builder.choose')}</option>
                {admins.map((u) => (
                  <option key={u._id} value={u._id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )
    case 'SET_STATUS':
      return (
        <div className="crm-auto-fld">
          <label htmlFor={id('st')}>{t('crmAuto.editor.newStatus')}</label>
          <select id={id('st')} className="crm-auto-sel" value={String(p.status ?? 'CONTACTED')} onChange={(e) => set({ status: e.target.value })}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{leadStatusLabel(s)}</option>
            ))}
          </select>
        </div>
      )
    case 'ADD_TAG':
      return (
        <div className="crm-auto-fld">
          <label htmlFor={id('tag')}>{t('crmAuto.editor.tag')}</label>
          <input id={id('tag')} className="crm-auto-inp" maxLength={40} value={String(p.tag ?? '')} onChange={(e) => set({ tag: e.target.value })} />
        </div>
      )
    case 'SET_FIELD':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('fld')}>{t('crmAuto.editor.field')}</label>
            <select id={id('fld')} className="crm-auto-sel" value={String(p.field ?? 'priority')} onChange={(e) => set({ field: e.target.value })}>
              {SETTABLE_FIELDS.map((k) => (
                <option key={k} value={k}>{fieldLabel(k)}</option>
              ))}
            </select>
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('val')}>{t('crmAuto.editor.value')}</label>
            <input id={id('val')} className="crm-auto-inp" value={String(p.value ?? '')} onChange={(e) => set({ value: e.target.value })} />
          </div>
        </>
      )
    case 'SEND_EMAIL':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('sub')}>{t('crmAuto.editor.subject')}</label>
            <input id={id('sub')} className="crm-auto-inp" value={String(p.subject ?? '')} onChange={(e) => set({ subject: e.target.value })} />
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('body')}>{t('crmAuto.editor.message')}</label>
            <textarea id={id('body')} className="crm-auto-txt" value={String(p.body ?? '')} onChange={(e) => set({ body: e.target.value })} />
          </div>
        </>
      )
    default:
      return <p className="crm-auto-note">{t('crmAuto.editor.noSettings')}</p>
  }
}

export default function RuleBuilder({ rule, draft: initial, onClose, onSaved }: RuleBuilderProps) {
  const { t } = useI18n()
  const STEPS = STEP_KEYS.map((key) => t(key))
  const [draft, setDraft] = useState<RuleDraft>(initial)
  const [step, setStep] = useState(0)
  const [activate, setActivate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sim, setSim] = useState<SimulationResult | null>(null)
  const [simBusy, setSimBusy] = useState(false)
  const [admins, setAdmins] = useState<Array<{ _id: string; name?: string; email?: string }>>([])
  const needsAdmins = draft.actions.some((a) => a.type === 'ASSIGN' && a.params.strategy === 'user')

  useEffect(() => {
    if (!needsAdmins || admins.length > 0) return
    let alive = true
    fetchAdmins().then((list) => alive && setAdmins(list)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [needsAdmins, admins.length])

  const hasEmail = draft.actions.some((a) => a.type === 'SEND_EMAIL')
  const params = draft.trigger.params
  const patch = (next: Partial<RuleDraft>) => setDraft((d) => ({ ...d, ...next }))
  const setParams = (p: Record<string, unknown>) => patch({ trigger: { ...draft.trigger, params: p } })
  const setCondition = (i: number, next: Partial<RuleCondition>) =>
    patch({ conditions: { ...draft.conditions, items: draft.conditions.items.map((c, j) => (j === i ? { ...c, ...next } : c)) } })
  const setActionParams = (i: number, p: Record<string, unknown>) => patch({ actions: draft.actions.map((a, j) => (j === i ? { ...a, params: p } : a)) })

  const chooseTrigger = (type: TriggerType) => {
    if (type === draft.trigger.type) return
    const defaults: Record<TriggerType, Record<string, unknown>> = {
      LEAD_CREATED: {},
      STATUS_CHANGED: { to: [] },
      LEAD_ASSIGNED: {},
      LEAD_INACTIVE: { days: 7, statuses: [] },
      ACTION_OVERDUE: {},
      SCORE_AT_LEAST: { threshold: 70 },
      INTERACTION_LOGGED: {},
    }
    patch({ trigger: { type, params: defaults[type] } })
  }

  const addCondition = () =>
    patch({ conditions: { ...draft.conditions, items: [...draft.conditions.items, { field: 'status', operator: 'in', value: [] }] } })

  const changeField = (i: number, field: ConditionField) => {
    const ops = operatorsFor(field)
    const operator = ops[0] === 'eq' && field === 'status' ? 'in' : ops[0]
    setCondition(i, { field, operator, value: field === 'archived' ? false : NUMERIC_FIELDS.includes(field) ? 0 : field === 'status' ? [] : '' })
  }

  const runSim = async () => {
    if (!rule) return
    setSimBusy(true)
    try {
      setSim(await simulateRule(rule._id))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crmAuto.sim.error'))
    } finally {
      setSimBusy(false)
    }
  }

  const valid = useMemo(() => draft.name.trim().length > 0 && draft.actions.length > 0, [draft.name, draft.actions.length])

  const save = async () => {
    if (!valid) {
      setError(draft.name.trim() ? t('crmAuto.builder.needAction') : t('crmAuto.builder.needName'))
      setStep(draft.name.trim() ? 2 : 0)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body = normalizeDraft(draft)
      let saved: CrmRule
      if (rule) saved = await updateRule(rule._id, body)
      else saved = await createRule(body)
      if (activate && saved.status !== 'ACTIVE') saved = await updateRule(saved._id, { status: 'ACTIVE' })
      onSaved(activate ? t('crmAuto.builder.savedActivated') : rule ? t('crmAuto.builder.saved') : t('crmAuto.builder.savedDraft'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('crmAuto.builder.saveError'))
      setSaving(false)
    }
  }

  const tabId = (i: number) => `crm-auto-step-${i}`
  const lastStep = step === STEPS.length - 1

  return (
    <Dialog titleId="crm-auto-bt" className="crm-auto-drawer" onClose={onClose}>
      <div className="crm-auto-dr-h">
        <div>
          <div>
            <h2 id="crm-auto-bt">{rule ? t('crmAuto.builder.edit') : t('crmAuto.builder.new')}</h2>
            <p>{t('crmAuto.builder.subtitle')}</p>
          </div>
          <button type="button" className="crm-auto-ibtn" aria-label={t('common.close')} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="crm-auto-steps" role="tablist" aria-label={t('crmAuto.builder.stepsAria')}>
          {STEPS.map((label, i) => (
            <button
              key={label}
              id={tabId(i)}
              type="button"
              role="tab"
              className={i < step ? 'done' : ''}
              aria-selected={i === step}
              aria-controls="crm-auto-step-panel"
              tabIndex={i === step ? 0 : -1}
              onClick={() => setStep(i)}
              onKeyDown={(e) => handleTabKeys(e, step, STEPS.length, setStep, tabId)}
            >
              <i />
              {i + 1}. {label}
            </button>
          ))}
        </div>
      </div>
      <div className="crm-auto-dr-b" role="tabpanel" id="crm-auto-step-panel" aria-labelledby={tabId(step)}>
        {step === 0 && (
          <>
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-name">{t('crmAuto.builder.name')}</label>
              <input id="crm-auto-name" className="crm-auto-inp" maxLength={120} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-desc">{t('crmAuto.builder.description')}</label>
              <input id="crm-auto-desc" className="crm-auto-inp" maxLength={500} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
            </div>
            <fieldset className="crm-auto-fld">
              <legend>{t('crmAuto.builder.when')}</legend>
              <div className="crm-auto-opts">
                {TRIGGER_TYPES.map((type) => (
                  <button key={type} type="button" aria-pressed={draft.trigger.type === type} onClick={() => chooseTrigger(type)}>
                    {triggerLabel(type)}
                  </button>
                ))}
              </div>
            </fieldset>
            {draft.trigger.type === 'STATUS_CHANGED' && (
              <>
                <StatusChips label={t('crmAuto.builder.toStatus')} value={(params.to as string[]) ?? []} onChange={(to) => setParams({ ...params, to })} />
                <StatusChips label={t('crmAuto.builder.fromStatus')} value={(params.from as string[]) ?? []} onChange={(from) => setParams({ ...params, from })} />
              </>
            )}
            {draft.trigger.type === 'LEAD_INACTIVE' && (
              <>
                <div className="crm-auto-fld">
                  <label htmlFor="crm-auto-days">{t('crmAuto.builder.inactiveDelay')}</label>
                  <input id="crm-auto-days" className="crm-auto-inp" type="number" min={1} inputMode="numeric" value={String(params.days ?? 7)} onChange={(e) => setParams({ ...params, days: e.target.value })} />
                </div>
                <StatusChips label={t('crmAuto.builder.statusesConcerned')} value={(params.statuses as string[]) ?? []} onChange={(statuses) => setParams({ ...params, statuses })} />
                <p className="crm-auto-note">{t('crmAuto.builder.inactiveNote')}</p>
              </>
            )}
            {draft.trigger.type === 'SCORE_AT_LEAST' && (
              <div className="crm-auto-fld">
                <label htmlFor="crm-auto-thr">{t('crmAuto.builder.scoreThreshold')}</label>
                <input id="crm-auto-thr" className="crm-auto-inp" type="number" min={0} inputMode="numeric" value={String(params.threshold ?? 70)} onChange={(e) => setParams({ ...params, threshold: e.target.value })} />
              </div>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <fieldset className="crm-auto-fld">
              <legend>{draft.conditions.op === 'OR' ? t('crmAuto.builder.ifAny') : t('crmAuto.builder.ifAll')}</legend>
              {draft.conditions.items.length > 1 && (
                <div className="crm-auto-opts">
                  <button type="button" aria-pressed={draft.conditions.op === 'AND'} onClick={() => patch({ conditions: { ...draft.conditions, op: 'AND' } })}>{t('crmAuto.builder.opAnd')}</button>
                  <button type="button" aria-pressed={draft.conditions.op === 'OR'} onClick={() => patch({ conditions: { ...draft.conditions, op: 'OR' } })}>{t('crmAuto.builder.opOr')}</button>
                </div>
              )}
              {draft.conditions.items.length === 0 && <p className="crm-auto-note">{t('crmAuto.builder.noConditions')}</p>}
              {draft.conditions.items.map((c, i) => {
                const valueless = c.operator === 'empty' || c.operator === 'notEmpty'
                const multi = c.operator === 'in' || c.operator === 'nin'
                return (
                  <div className="crm-auto-cond" key={i}>
                    <select className="crm-auto-sel" aria-label={t('crmAuto.builder.conditionField', { n: i + 1 })} value={c.field} onChange={(e) => changeField(i, e.target.value as ConditionField)}>
                      {FIELD_KEYS.map((f) => (
                        <option key={f} value={f}>{fieldLabel(f)}</option>
                      ))}
                    </select>
                    <select className="crm-auto-sel" aria-label={t('crmAuto.builder.conditionOperator', { n: i + 1 })} value={c.operator} onChange={(e) => setCondition(i, { operator: e.target.value as RuleCondition['operator'] })}>
                      {operatorsFor(c.field).map((o) => (
                        <option key={o} value={o}>{operatorLabel(o)}</option>
                      ))}
                    </select>
                    {valueless ? (
                      <span className="crm-auto-cond-val" />
                    ) : c.field === 'archived' ? (
                      <select className="crm-auto-sel crm-auto-cond-val" aria-label={`Valeur de la condition ${i + 1}`} value={String(c.value === true || c.value === 'true')} onChange={(e) => setCondition(i, { value: e.target.value === 'true' })}>
                        <option value="true">{t('crmAuto.builder.yes')}</option>
                        <option value="false">{t('crmAuto.builder.no')}</option>
                      </select>
                    ) : c.field === 'status' && !multi ? (
                      <select className="crm-auto-sel crm-auto-cond-val" aria-label={`Valeur de la condition ${i + 1}`} value={String(c.value ?? '')} onChange={(e) => setCondition(i, { value: e.target.value })}>
                        <option value="">{t('crmAuto.builder.choose')}</option>
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>{leadStatusLabel(s)}</option>
                        ))}
                      </select>
                    ) : c.field === 'status' ? (
                      <span className="crm-auto-cond-val" />
                    ) : (
                      <input
                        className="crm-auto-inp"
                        aria-label={`Valeur de la condition ${i + 1}`}
                        type={NUMERIC_FIELDS.includes(c.field) ? 'number' : 'text'}
                        inputMode={NUMERIC_FIELDS.includes(c.field) ? 'numeric' : undefined}
                        placeholder={multi ? t('crmAuto.builder.valuesPlaceholder') : ''}
                        value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')}
                        onChange={(e) => setCondition(i, { value: e.target.value })}
                      />
                    )}
                    <button type="button" className="crm-auto-ibtn" aria-label={t('crmAuto.builder.removeCondition', { n: i + 1 })} onClick={() => patch({ conditions: { ...draft.conditions, items: draft.conditions.items.filter((_, j) => j !== i) } })}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                    {c.field === 'status' && multi && (
                      <div className="crm-auto-opts" style={{ gridColumn: '1 / -1' }} role="group" aria-label={t('crmAuto.builder.conditionStatuses', { n: i + 1 })}>
                        {LEAD_STATUSES.map((s) => {
                          const list = Array.isArray(c.value) ? (c.value as string[]) : []
                          return (
                            <button key={s} type="button" aria-pressed={list.includes(s)} onClick={() => setCondition(i, { value: list.includes(s) ? list.filter((v) => v !== s) : [...list, s] })}>
                              {leadStatusLabel(s)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={addCondition} disabled={draft.conditions.items.length >= 10}>
                {t('crmAuto.builder.addCondition')}
              </button>
            </fieldset>
            <div className="crm-auto-sim">
              <b>{t('crmAuto.builder.simulation')}</b>
              {!rule ? (
                <span>{t('crmAuto.builder.simSaveFirst')}</span>
              ) : sim ? (
                <span role="status">{t('crmAuto.builder.simResult', { count: sim.total })}</span>
              ) : (
                <span>{t('crmAuto.builder.simHint')}</span>
              )}
              {rule && (
                <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" style={{ alignSelf: 'flex-start' }} disabled={simBusy} onClick={() => void runSim()}>
                  {simBusy ? t('crmAuto.builder.simBusy') : t('crmAuto.builder.simNow')}
                </button>
              )}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="crm-auto-fld">
              <span className="crm-auto-lb">{t('crmAuto.builder.thenInOrder')}</span>
              {draft.actions.length === 0 && <p className="crm-auto-note">{t('crmAuto.builder.noActions')}</p>}
              {draft.actions.map((a, i) => (
                <div className="crm-auto-act" key={i}>
                  <div className="crm-auto-act-h">
                    <b>{i + 1}. {actionLabel(a.type)}</b>
                    <button type="button" className="crm-auto-ibtn" aria-label={t('crmAuto.builder.moveUp', { n: i + 1 })} disabled={i === 0} onClick={() => patch({ actions: move(draft.actions, i, -1) })}>↑</button>
                    <button type="button" className="crm-auto-ibtn" aria-label={t('crmAuto.builder.moveDown', { n: i + 1 })} disabled={i === draft.actions.length - 1} onClick={() => patch({ actions: move(draft.actions, i, 1) })}>↓</button>
                    <button type="button" className="crm-auto-ibtn" aria-label={t('crmAuto.builder.removeAction', { n: i + 1 })} onClick={() => patch({ actions: draft.actions.filter((_, j) => j !== i) })}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                  <ActionEditor action={a} admins={admins} onChange={(p) => setActionParams(i, p)} />
                </div>
              ))}
            </div>
            <fieldset className="crm-auto-fld">
              <legend>{t('crmAuto.builder.addAction')}</legend>
              <div className="crm-auto-opts">
                {ACTION_TYPES.map((type) => (
                  <button key={type} type="button" aria-pressed={false} disabled={draft.actions.length >= 8} onClick={() => patch({ actions: [...draft.actions, { type, params: { ...defaultParams()[type] } }] })}>
                    {actionLabel(type)}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="crm-auto-note">{t('crmAuto.builder.templatesNote')}{'{contact}'} {'{company}'} {'{amount}'}.</p>
          </>
        )}
        {step === 3 && (
          <>
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-lim">{t('crmAuto.builder.limitPerLead')}</label>
              <select id="crm-auto-lim" className="crm-auto-sel" value={draft.limits.perLead} onChange={(e) => patch({ limits: { ...draft.limits, perLead: e.target.value as RuleDraft['limits']['perLead'] } })}>
                <option value="DAYS">{t('crmAuto.builder.limitDays')}</option>
                <option value="ONCE">{t('crmAuto.builder.limitOnce')}</option>
                <option value="NONE">{t('crmAuto.builder.limitNone')}</option>
              </select>
            </div>
            {draft.limits.perLead === 'DAYS' && (
              <div className="crm-auto-fld">
                <label htmlFor="crm-auto-lim-d">{t('crmAuto.builder.delay')}</label>
                <input id="crm-auto-lim-d" className="crm-auto-inp" type="number" min={1} max={365} inputMode="numeric" value={String(draft.limits.days)} onChange={(e) => patch({ limits: { ...draft.limits, days: Number(e.target.value) || 1 } })} />
              </div>
            )}
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-max">{t('crmAuto.builder.maxPerRun')}</label>
              <input id="crm-auto-max" className="crm-auto-inp" type="number" min={1} max={500} inputMode="numeric" value={String(draft.limits.maxPerRun)} onChange={(e) => patch({ limits: { ...draft.limits, maxPerRun: Number(e.target.value) || 1 } })} />
            </div>
            {hasEmail && (
              <fieldset className="crm-auto-fld">
                <legend>{t('crmAuto.builder.outgoingEmails')}</legend>
                <div className="crm-auto-opts">
                  <button type="button" aria-pressed={draft.requireApproval} onClick={() => patch({ requireApproval: true })}>{t('crmAuto.builder.humanApproval')}</button>
                  <button type="button" aria-pressed={!draft.requireApproval} onClick={() => patch({ requireApproval: false })}>{t('crmAuto.builder.autoSend')}</button>
                </div>
              </fieldset>
            )}
            <div className="crm-auto-guard">
              <b>{t('crmAuto.builder.builtinTitle')}</b>
              {t('crmAuto.builder.builtinBody')}
            </div>
            <fieldset className="crm-auto-fld">
              <legend>{t('crmAuto.builder.activation')}</legend>
              <div className="crm-auto-opts">
                <button type="button" aria-pressed={!activate} onClick={() => setActivate(false)}>{rule ? t('crmAuto.builder.keepStatus') : t('crmAuto.builder.draft')}</button>
                <button type="button" aria-pressed={activate} onClick={() => setActivate(true)}>{t('crmAuto.builder.activateNow')}</button>
              </div>
            </fieldset>
            <ul className="crm-auto-note" aria-label={t('crmAuto.builder.summary')}>
              {draft.actions.map((a, i) => (
                <li key={i}>{describeAction(a, draft.requireApproval)}</li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="crm-auto-err" role="alert">{error}</p>}
        <div className="crm-auto-dr-f">
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('common.back')}</button>
          {lastStep ? (
            <button type="button" className="crm-auto-btn crm-auto-btn--primary" style={{ flex: 1 }} disabled={saving} onClick={() => void save()}>
              {saving ? t('crmAuto.builder.saving') : t('crmAuto.builder.saveRule')}
            </button>
          ) : (
            <button type="button" className="crm-auto-btn crm-auto-btn--primary" style={{ flex: 1 }} onClick={() => setStep(step + 1)}>{t('crmAuto.builder.next')}</button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
