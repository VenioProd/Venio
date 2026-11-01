import { useEffect, useMemo, useState } from 'react'
import Dialog from './Dialog'
import { createRule, fetchAdmins, simulateRule, updateRule } from './api'
import { handleTabKeys } from './tabKeys'
import {
  ACTION_LABELS,
  ACTION_TYPES,
  BOOL_OPERATORS,
  FIELD_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  NUMERIC_FIELDS,
  NUMERIC_OPERATORS,
  OPERATOR_LABELS,
  TEXT_OPERATORS,
  TRIGGER_LABELS,
  TRIGGER_TYPES,
  describeAction,
  type ActionType,
  type ConditionField,
  type CrmRule,
  type RuleAction,
  type RuleCondition,
  type RuleDraft,
  type SimulationResult,
  type TriggerType,
} from './types'

const STEPS = ['Déclencheur', 'Conditions', 'Actions', 'Garde-fous']
const FIELD_KEYS = Object.keys(FIELD_LABELS) as ConditionField[]
const SETTABLE_FIELDS: Array<[string, string]> = [
  ['priority', 'Priorité'],
  ['leadTemperature', 'Température'],
  ['probability', 'Probabilité'],
  ['nextActionLabel', 'Prochaine action'],
  ['sector', 'Secteur'],
]
const DEFAULT_PARAMS: Record<ActionType, Record<string, unknown>> = {
  CREATE_TASK: { title: 'Relancer {contact}', dueInDays: 1, assignTo: 'owner' },
  NOTIFY: { recipients: 'owner', title: 'Règle CRM : {company}', message: '' },
  ASSIGN: { strategy: 'round_robin' },
  SET_STATUS: { status: 'CONTACTED' },
  ADD_TAG: { tag: '' },
  SET_FIELD: { field: 'priority', value: '' },
  SEND_EMAIL: { subject: 'Suite à notre échange', body: 'Bonjour {contact},\n\n' },
  CREATE_CLIENT: {},
  CREATE_PROJECT: {},
  ARCHIVE: {},
}

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
            {LEAD_STATUS_LABELS[s]}
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
  const p = action.params
  const set = (patch: Record<string, unknown>) => onChange({ ...p, ...patch })
  const id = (n: string) => `crm-auto-a-${action.type}-${n}`
  switch (action.type) {
    case 'CREATE_TASK':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('title')}>Titre de la tâche</label>
            <input id={id('title')} className="crm-auto-inp" value={String(p.title ?? '')} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('due')}>Échéance (jours)</label>
            <input id={id('due')} className="crm-auto-inp" type="number" min={0} inputMode="numeric" value={String(p.dueInDays ?? 1)} onChange={(e) => set({ dueInDays: e.target.value })} />
          </div>
        </>
      )
    case 'NOTIFY':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('rcp')}>Destinataires</label>
            <select id={id('rcp')} className="crm-auto-sel" value={String(p.recipients ?? 'owner')} onChange={(e) => set({ recipients: e.target.value })}>
              <option value="owner">Le commercial du lead</option>
              <option value="admins">Les responsables CRM</option>
            </select>
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('title')}>Titre</label>
            <input id={id('title')} className="crm-auto-inp" value={String(p.title ?? '')} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('msg')}>Message</label>
            <input id={id('msg')} className="crm-auto-inp" value={String(p.message ?? '')} onChange={(e) => set({ message: e.target.value })} />
          </div>
        </>
      )
    case 'ASSIGN':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('str')}>Stratégie</label>
            <select id={id('str')} className="crm-auto-sel" value={String(p.strategy ?? 'round_robin')} onChange={(e) => set({ strategy: e.target.value })}>
              <option value="round_robin">À tour de rôle</option>
              <option value="user">Un utilisateur précis</option>
            </select>
          </div>
          {p.strategy === 'user' && (
            <div className="crm-auto-fld">
              <label htmlFor={id('usr')}>Utilisateur</label>
              <select id={id('usr')} className="crm-auto-sel" value={String(p.userId ?? '')} onChange={(e) => set({ userId: e.target.value })}>
                <option value="">Choisir…</option>
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
          <label htmlFor={id('st')}>Nouveau statut</label>
          <select id={id('st')} className="crm-auto-sel" value={String(p.status ?? 'CONTACTED')} onChange={(e) => set({ status: e.target.value })}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      )
    case 'ADD_TAG':
      return (
        <div className="crm-auto-fld">
          <label htmlFor={id('tag')}>Tag</label>
          <input id={id('tag')} className="crm-auto-inp" maxLength={40} value={String(p.tag ?? '')} onChange={(e) => set({ tag: e.target.value })} />
        </div>
      )
    case 'SET_FIELD':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('fld')}>Champ</label>
            <select id={id('fld')} className="crm-auto-sel" value={String(p.field ?? 'priority')} onChange={(e) => set({ field: e.target.value })}>
              {SETTABLE_FIELDS.map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('val')}>Valeur</label>
            <input id={id('val')} className="crm-auto-inp" value={String(p.value ?? '')} onChange={(e) => set({ value: e.target.value })} />
          </div>
        </>
      )
    case 'SEND_EMAIL':
      return (
        <>
          <div className="crm-auto-fld">
            <label htmlFor={id('sub')}>Objet</label>
            <input id={id('sub')} className="crm-auto-inp" value={String(p.subject ?? '')} onChange={(e) => set({ subject: e.target.value })} />
          </div>
          <div className="crm-auto-fld">
            <label htmlFor={id('body')}>Message</label>
            <textarea id={id('body')} className="crm-auto-txt" value={String(p.body ?? '')} onChange={(e) => set({ body: e.target.value })} />
          </div>
        </>
      )
    default:
      return <p className="crm-auto-note">Cette action n’a pas de réglage.</p>
  }
}

export default function RuleBuilder({ rule, draft: initial, onClose, onSaved }: RuleBuilderProps) {
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
      setError(e instanceof Error ? e.message : 'Simulation impossible')
    } finally {
      setSimBusy(false)
    }
  }

  const valid = useMemo(() => draft.name.trim().length > 0 && draft.actions.length > 0, [draft.name, draft.actions.length])

  const save = async () => {
    if (!valid) {
      setError(draft.name.trim() ? 'Ajoutez au moins une action.' : 'Donnez un nom à la règle.')
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
      onSaved(activate ? 'Règle enregistrée et activée' : rule ? 'Règle enregistrée' : 'Règle enregistrée en brouillon')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible')
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
            <h2 id="crm-auto-bt">{rule ? 'Modifier la règle' : 'Nouvelle règle'}</h2>
            <p>Déclencheur → conditions → actions</p>
          </div>
          <button type="button" className="crm-auto-ibtn" aria-label="Fermer" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="crm-auto-steps" role="tablist" aria-label="Étapes de la règle">
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
              <label htmlFor="crm-auto-name">Nom de la règle</label>
              <input id="crm-auto-name" className="crm-auto-inp" maxLength={120} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </div>
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-desc">Description</label>
              <input id="crm-auto-desc" className="crm-auto-inp" maxLength={500} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
            </div>
            <fieldset className="crm-auto-fld">
              <legend>Quand…</legend>
              <div className="crm-auto-opts">
                {TRIGGER_TYPES.map((t) => (
                  <button key={t} type="button" aria-pressed={draft.trigger.type === t} onClick={() => chooseTrigger(t)}>
                    {TRIGGER_LABELS[t]}
                  </button>
                ))}
              </div>
            </fieldset>
            {draft.trigger.type === 'STATUS_CHANGED' && (
              <>
                <StatusChips label="Vers le statut" value={(params.to as string[]) ?? []} onChange={(to) => setParams({ ...params, to })} />
                <StatusChips label="Depuis le statut (facultatif)" value={(params.from as string[]) ?? []} onChange={(from) => setParams({ ...params, from })} />
              </>
            )}
            {draft.trigger.type === 'LEAD_INACTIVE' && (
              <>
                <div className="crm-auto-fld">
                  <label htmlFor="crm-auto-days">Délai d’inactivité (jours)</label>
                  <input id="crm-auto-days" className="crm-auto-inp" type="number" min={1} inputMode="numeric" value={String(params.days ?? 7)} onChange={(e) => setParams({ ...params, days: e.target.value })} />
                </div>
                <StatusChips label="Statuts concernés (vide = tous)" value={(params.statuses as string[]) ?? []} onChange={(statuses) => setParams({ ...params, statuses })} />
                <p className="crm-auto-note">Les déclencheurs « inactif » sont évalués chaque jour ; les autres en temps réel.</p>
              </>
            )}
            {draft.trigger.type === 'SCORE_AT_LEAST' && (
              <div className="crm-auto-fld">
                <label htmlFor="crm-auto-thr">Seuil de score</label>
                <input id="crm-auto-thr" className="crm-auto-inp" type="number" min={0} inputMode="numeric" value={String(params.threshold ?? 70)} onChange={(e) => setParams({ ...params, threshold: e.target.value })} />
              </div>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <fieldset className="crm-auto-fld">
              <legend>{draft.conditions.op === 'OR' ? 'Si au moins une de ces conditions est vraie' : 'Si toutes ces conditions sont vraies'}</legend>
              {draft.conditions.items.length > 1 && (
                <div className="crm-auto-opts">
                  <button type="button" aria-pressed={draft.conditions.op === 'AND'} onClick={() => patch({ conditions: { ...draft.conditions, op: 'AND' } })}>Toutes (ET)</button>
                  <button type="button" aria-pressed={draft.conditions.op === 'OR'} onClick={() => patch({ conditions: { ...draft.conditions, op: 'OR' } })}>Au moins une (OU)</button>
                </div>
              )}
              {draft.conditions.items.length === 0 && <p className="crm-auto-note">Aucune condition : la règle s’applique à tous les leads concernés par le déclencheur.</p>}
              {draft.conditions.items.map((c, i) => {
                const valueless = c.operator === 'empty' || c.operator === 'notEmpty'
                const multi = c.operator === 'in' || c.operator === 'nin'
                return (
                  <div className="crm-auto-cond" key={i}>
                    <select className="crm-auto-sel" aria-label={`Champ de la condition ${i + 1}`} value={c.field} onChange={(e) => changeField(i, e.target.value as ConditionField)}>
                      {FIELD_KEYS.map((f) => (
                        <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                      ))}
                    </select>
                    <select className="crm-auto-sel" aria-label={`Opérateur de la condition ${i + 1}`} value={c.operator} onChange={(e) => setCondition(i, { operator: e.target.value as RuleCondition['operator'] })}>
                      {operatorsFor(c.field).map((o) => (
                        <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>
                      ))}
                    </select>
                    {valueless ? (
                      <span className="crm-auto-cond-val" />
                    ) : c.field === 'archived' ? (
                      <select className="crm-auto-sel crm-auto-cond-val" aria-label={`Valeur de la condition ${i + 1}`} value={String(c.value === true || c.value === 'true')} onChange={(e) => setCondition(i, { value: e.target.value === 'true' })}>
                        <option value="true">Oui</option>
                        <option value="false">Non</option>
                      </select>
                    ) : c.field === 'status' && !multi ? (
                      <select className="crm-auto-sel crm-auto-cond-val" aria-label={`Valeur de la condition ${i + 1}`} value={String(c.value ?? '')} onChange={(e) => setCondition(i, { value: e.target.value })}>
                        <option value="">Choisir…</option>
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
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
                        placeholder={multi ? 'valeurs séparées par des virgules' : ''}
                        value={Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')}
                        onChange={(e) => setCondition(i, { value: e.target.value })}
                      />
                    )}
                    <button type="button" className="crm-auto-ibtn" aria-label={`Retirer la condition ${i + 1}`} onClick={() => patch({ conditions: { ...draft.conditions, items: draft.conditions.items.filter((_, j) => j !== i) } })}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                    {c.field === 'status' && multi && (
                      <div className="crm-auto-opts" style={{ gridColumn: '1 / -1' }} role="group" aria-label={`Statuts de la condition ${i + 1}`}>
                        {LEAD_STATUSES.map((s) => {
                          const list = Array.isArray(c.value) ? (c.value as string[]) : []
                          return (
                            <button key={s} type="button" aria-pressed={list.includes(s)} onClick={() => setCondition(i, { value: list.includes(s) ? list.filter((v) => v !== s) : [...list, s] })}>
                              {LEAD_STATUS_LABELS[s]}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" style={{ alignSelf: 'flex-start' }} onClick={addCondition} disabled={draft.conditions.items.length >= 10}>
                + Ajouter une condition
              </button>
            </fieldset>
            <div className="crm-auto-sim">
              <b>Simulation</b>
              {!rule ? (
                <span>Enregistrez la règle pour la simuler sur le pipeline actuel.</span>
              ) : sim ? (
                <span role="status">{sim.total} lead{sim.total > 1 ? 's' : ''} correspondent aujourd’hui (règle telle qu’enregistrée).</span>
              ) : (
                <span>Compte les leads concernés, sans rien exécuter.</span>
              )}
              {rule && (
                <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" style={{ alignSelf: 'flex-start' }} disabled={simBusy} onClick={() => void runSim()}>
                  {simBusy ? 'Calcul…' : 'Simuler maintenant'}
                </button>
              )}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div className="crm-auto-fld">
              <span className="crm-auto-lb">Alors, dans l’ordre</span>
              {draft.actions.length === 0 && <p className="crm-auto-note">Aucune action : ajoutez-en au moins une.</p>}
              {draft.actions.map((a, i) => (
                <div className="crm-auto-act" key={i}>
                  <div className="crm-auto-act-h">
                    <b>{i + 1}. {ACTION_LABELS[a.type]}</b>
                    <button type="button" className="crm-auto-ibtn" aria-label={`Monter l’action ${i + 1}`} disabled={i === 0} onClick={() => patch({ actions: move(draft.actions, i, -1) })}>↑</button>
                    <button type="button" className="crm-auto-ibtn" aria-label={`Descendre l’action ${i + 1}`} disabled={i === draft.actions.length - 1} onClick={() => patch({ actions: move(draft.actions, i, 1) })}>↓</button>
                    <button type="button" className="crm-auto-ibtn" aria-label={`Retirer l’action ${i + 1}`} onClick={() => patch({ actions: draft.actions.filter((_, j) => j !== i) })}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                  <ActionEditor action={a} admins={admins} onChange={(p) => setActionParams(i, p)} />
                </div>
              ))}
            </div>
            <fieldset className="crm-auto-fld">
              <legend>Ajouter une action</legend>
              <div className="crm-auto-opts">
                {ACTION_TYPES.map((t) => (
                  <button key={t} type="button" aria-pressed={false} disabled={draft.actions.length >= 8} onClick={() => patch({ actions: [...draft.actions, { type: t, params: { ...DEFAULT_PARAMS[t] } }] })}>
                    {ACTION_LABELS[t]}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="crm-auto-note">Gabarits utilisables dans les titres et messages : {'{contact}'} {'{company}'} {'{amount}'}.</p>
          </>
        )}
        {step === 3 && (
          <>
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-lim">Limite par lead</label>
              <select id="crm-auto-lim" className="crm-auto-sel" value={draft.limits.perLead} onChange={(e) => patch({ limits: { ...draft.limits, perLead: e.target.value as RuleDraft['limits']['perLead'] } })}>
                <option value="DAYS">1 fois tous les N jours</option>
                <option value="ONCE">1 fois par lead</option>
                <option value="NONE">Sans limite</option>
              </select>
            </div>
            {draft.limits.perLead === 'DAYS' && (
              <div className="crm-auto-fld">
                <label htmlFor="crm-auto-lim-d">Délai entre deux exécutions (jours)</label>
                <input id="crm-auto-lim-d" className="crm-auto-inp" type="number" min={1} max={365} inputMode="numeric" value={String(draft.limits.days)} onChange={(e) => patch({ limits: { ...draft.limits, days: Number(e.target.value) || 1 } })} />
              </div>
            )}
            <div className="crm-auto-fld">
              <label htmlFor="crm-auto-max">Plafond de leads par exécution</label>
              <input id="crm-auto-max" className="crm-auto-inp" type="number" min={1} max={500} inputMode="numeric" value={String(draft.limits.maxPerRun)} onChange={(e) => patch({ limits: { ...draft.limits, maxPerRun: Number(e.target.value) || 1 } })} />
            </div>
            {hasEmail && (
              <fieldset className="crm-auto-fld">
                <legend>E-mails sortants</legend>
                <div className="crm-auto-opts">
                  <button type="button" aria-pressed={draft.requireApproval} onClick={() => patch({ requireApproval: true })}>Validation humaine</button>
                  <button type="button" aria-pressed={!draft.requireApproval} onClick={() => patch({ requireApproval: false })}>Envoi automatique</button>
                </div>
              </fieldset>
            )}
            <div className="crm-auto-guard">
              <b>Protections intégrées</b>
              Anti-boucle : une action de règle ne déclenche pas la même règle sur le même lead. Profondeur de chaîne limitée à 3. Idempotence par événement. Journal conservé 90 jours.
            </div>
            <fieldset className="crm-auto-fld">
              <legend>Activation</legend>
              <div className="crm-auto-opts">
                <button type="button" aria-pressed={!activate} onClick={() => setActivate(false)}>{rule ? 'Conserver le statut actuel' : 'Brouillon'}</button>
                <button type="button" aria-pressed={activate} onClick={() => setActivate(true)}>Activer maintenant</button>
              </div>
            </fieldset>
            <ul className="crm-auto-note" aria-label="Résumé">
              {draft.actions.map((a, i) => (
                <li key={i}>{describeAction(a, draft.requireApproval)}</li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="crm-auto-err" role="alert">{error}</p>}
        <div className="crm-auto-dr-f">
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Retour</button>
          {lastStep ? (
            <button type="button" className="crm-auto-btn crm-auto-btn--primary" style={{ flex: 1 }} disabled={saving} onClick={() => void save()}>
              {saving ? 'Enregistrement…' : 'Enregistrer la règle'}
            </button>
          ) : (
            <button type="button" className="crm-auto-btn crm-auto-btn--primary" style={{ flex: 1 }} onClick={() => setStep(step + 1)}>Continuer</button>
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
