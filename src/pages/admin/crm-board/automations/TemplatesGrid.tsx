import { DEFAULT_LIMITS, type RuleDraft } from './types'

export interface RuleTemplate {
  id: string
  title: string
  summary: string
  draft: RuleDraft
}

const base = { description: '', requireApproval: true, limits: { ...DEFAULT_LIMITS } }

/** Modèles de départ : de simples brouillons pré-remplis, rien n'est créé avant l'enregistrement. */
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'big-amount',
    title: 'Lead à fort montant → alerte direction',
    summary: 'Notifier les responsables dès qu’un lead de 50 000 € ou plus est créé.',
    draft: {
      ...base,
      name: 'Lead à fort montant → alerte direction',
      trigger: { type: 'LEAD_CREATED', params: {} },
      conditions: { op: 'AND', items: [{ field: 'budget', operator: 'gte', value: 50000 }] },
      actions: [{ type: 'NOTIFY', params: { recipients: 'admins', title: 'Lead à fort montant : {company}', message: 'Montant estimé : {amount}' } }],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'demo-followup',
    title: 'Interaction consignée → qualifier',
    summary: 'Passe un lead « Lead » en « Contacté » dès qu’une interaction est consignée.',
    draft: {
      ...base,
      name: 'Interaction consignée → passer en Contacté',
      trigger: { type: 'INTERACTION_LOGGED', params: {} },
      conditions: { op: 'AND', items: [{ field: 'status', operator: 'eq', value: 'LEAD' }] },
      actions: [{ type: 'SET_STATUS', params: { status: 'CONTACTED' } }],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'inactive-week',
    title: 'Relance après 7 jours sans activité',
    summary: 'Crée une tâche de relance pour le commercial quand un lead s’endort.',
    draft: {
      ...base,
      name: 'Relance après 7 jours sans activité',
      trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED', 'DEMO', 'PROPOSAL'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'CREATE_TASK', params: { title: 'Relancer {contact}', dueInDays: 1, assignTo: 'owner' } },
        { type: 'NOTIFY', params: { recipients: 'owner', title: 'Lead inactif : {company}', message: '' } },
      ],
    },
  },
  {
    id: 'won-client',
    title: 'Lead gagné → compte client + projet',
    summary: 'Crée le compte client et le projet dès que le lead passe en « Gagné ».',
    draft: {
      ...base,
      name: 'Lead gagné → compte client + projet',
      trigger: { type: 'STATUS_CHANGED', params: { to: ['WON'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'CREATE_CLIENT', params: {} },
        { type: 'CREATE_PROJECT', params: {} },
        { type: 'NOTIFY', params: { recipients: 'admins', title: 'Nouveau client : {company}', message: '' } },
      ],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'lost-tag',
    title: 'Perdu → tag et relance à 6 mois',
    summary: 'Garde la porte ouverte : tag « recontacter-6m » et tâche à J+180.',
    draft: {
      ...base,
      name: 'Perdu → relance à 6 mois',
      trigger: { type: 'STATUS_CHANGED', params: { to: ['LOST'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'ADD_TAG', params: { tag: 'recontacter-6m' } },
        { type: 'CREATE_TASK', params: { title: 'Reprendre contact avec {company}', dueInDays: 180, assignTo: 'owner' } },
      ],
      limits: { perLead: 'ONCE', days: 7, maxPerRun: 50 },
    },
  },
  {
    id: 'proposal-silence',
    title: 'Proposition sans réponse après 5 jours',
    summary: 'Prépare un e-mail de relance, envoyé seulement après validation humaine.',
    draft: {
      ...base,
      name: 'Proposition sans réponse après 5 jours',
      trigger: { type: 'LEAD_INACTIVE', params: { days: 5, statuses: ['PROPOSAL'] } },
      conditions: { op: 'AND', items: [] },
      actions: [
        { type: 'SEND_EMAIL', params: { subject: 'Suite à notre proposition', body: 'Bonjour {contact},\n\nAvez-vous pu consulter notre proposition ?' } },
        { type: 'CREATE_TASK', params: { title: 'Appeler {contact} (proposition)', dueInDays: 1, assignTo: 'owner' } },
      ],
      limits: { perLead: 'DAYS', days: 5, maxPerRun: 50 },
    },
  },
]

export default function TemplatesGrid({ onUse }: { onUse: (template: RuleTemplate) => void }) {
  return (
    <div className="crm-auto-tpls">
      {RULE_TEMPLATES.map((t) => (
        <article className="crm-auto-tpl crm-auto-glass" key={t.id}>
          <h3>{t.title}</h3>
          <p>{t.summary}</p>
          <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => onUse(t)} aria-label={`Utiliser le modèle « ${t.title} »`}>
            Utiliser ce modèle
          </button>
        </article>
      ))}
    </div>
  )
}
