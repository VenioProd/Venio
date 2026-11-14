import { translate, type MessageKey } from '../../../../i18n'
import { useI18n } from '../../../../context/I18nContext'
import { DEFAULT_LIMITS, type RuleDraft } from './types'

export interface RuleTemplate {
  id: string
  title: string
  summary: string
  draft: RuleDraft
}

const base = { description: '', requireApproval: true, limits: { ...DEFAULT_LIMITS } }
const tr = (key: MessageKey) => translate(key)

/** Modèles de départ : de simples brouillons pré-remplis, rien n'est créé avant l'enregistrement. */
export const ruleTemplates = (): RuleTemplate[] => [
  {
    id: 'big-amount',
    title: tr('crmAuto.tpl.bigAmount.title'),
    summary: tr('crmAuto.tpl.bigAmount.summary'),
    draft: {
      ...base,
      name: tr('crmAuto.tpl.bigAmount.title'),
      trigger: { type: 'LEAD_CREATED', params: {} },
      conditions: { op: 'AND', items: [{ field: 'budget', operator: 'gte', value: 50000 }] },
      actions: [
        {
          type: 'NOTIFY',
          params: {
            recipients: 'admins',
            title: tr('crmAuto.tpl.bigAmount.notifyTitle'),
            message: tr('crmAuto.tpl.bigAmount.notifyMessage'),
          },
        },
      ],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'demo-followup',
    title: tr('crmAuto.tpl.demoFollowup.title'),
    summary: tr('crmAuto.tpl.demoFollowup.summary'),
    draft: {
      ...base,
      name: tr('crmAuto.tpl.demoFollowup.name'),
      trigger: { type: 'INTERACTION_LOGGED', params: {} },
      conditions: { op: 'AND', items: [{ field: 'status', operator: 'eq', value: 'LEAD' }] },
      actions: [{ type: 'SET_STATUS', params: { status: 'CONTACTED' } }],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'inactive-week',
    title: tr('crmAuto.tpl.inactiveWeek.title'),
    summary: tr('crmAuto.tpl.inactiveWeek.summary'),
    draft: {
      ...base,
      name: tr('crmAuto.tpl.inactiveWeek.title'),
      trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED', 'DEMO', 'PROPOSAL'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'CREATE_TASK', params: { title: tr('crmAuto.default.taskTitle'), dueInDays: 1, assignTo: 'owner' } },
        {
          type: 'NOTIFY',
          params: { recipients: 'owner', title: tr('crmAuto.tpl.inactiveWeek.notifyTitle'), message: '' },
        },
      ],
    },
  },
  {
    id: 'won-client',
    title: tr('crmAuto.tpl.wonClient.title'),
    summary: tr('crmAuto.tpl.wonClient.summary'),
    draft: {
      ...base,
      name: tr('crmAuto.tpl.wonClient.title'),
      trigger: { type: 'STATUS_CHANGED', params: { to: ['WON'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'CREATE_CLIENT', params: {} },
        { type: 'CREATE_PROJECT', params: {} },
        {
          type: 'NOTIFY',
          params: { recipients: 'admins', title: tr('crmAuto.tpl.wonClient.notifyTitle'), message: '' },
        },
      ],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'lost-tag',
    title: tr('crmAuto.tpl.lostTag.title'),
    summary: tr('crmAuto.tpl.lostTag.summary'),
    draft: {
      ...base,
      name: tr('crmAuto.tpl.lostTag.name'),
      trigger: { type: 'STATUS_CHANGED', params: { to: ['LOST'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'ADD_TAG', params: { tag: tr('crmAuto.tpl.lostTag.tag') } },
        {
          type: 'CREATE_TASK',
          params: { title: tr('crmAuto.tpl.lostTag.taskTitle'), dueInDays: 180, assignTo: 'owner' },
        },
      ],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'proposal-silence',
    title: tr('crmAuto.tpl.proposalSilence.title'),
    summary: tr('crmAuto.tpl.proposalSilence.summary'),
    draft: {
      ...base,
      name: tr('crmAuto.tpl.proposalSilence.title'),
      trigger: { type: 'LEAD_INACTIVE', params: { days: 5, statuses: ['PROPOSAL'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        {
          type: 'SEND_EMAIL',
          params: { subject: tr('crmAuto.tpl.proposalSilence.subject'), body: tr('crmAuto.tpl.proposalSilence.body') },
        },
        {
          type: 'CREATE_TASK',
          params: { title: tr('crmAuto.tpl.proposalSilence.taskTitle'), dueInDays: 1, assignTo: 'owner' },
        },
      ],
      limits: { perLead: 'DAYS', days: 5, maxPerRun: 50 },
    },
  },
]

export default function TemplatesGrid({
  onUse,
  canAdminister,
}: {
  onUse: (template: RuleTemplate) => void
  canAdminister: boolean
}) {
  const { t: tt } = useI18n()
  return (
    <div className="crm-auto-tpls">
      {ruleTemplates().map((t) => (
        <article className="crm-auto-tpl crm-auto-glass" key={t.id}>
          <h3>{t.title}</h3>
          <p>{t.summary}</p>
          <button
            type="button"
            className="crm-ui-btn crm-ui-btn--soft crm-ui-btn--sm crm-auto-btn"
            disabled={!canAdminister}
            title={canAdminister ? undefined : tt('crmAuto.adminOnly')}
            onClick={() => onUse(t)}
            aria-label={tt('crmAuto.tpl.useAria', { title: t.title })}
          >
            {tt('crmAuto.tpl.use')}
          </button>
        </article>
      ))}
    </div>
  )
}
