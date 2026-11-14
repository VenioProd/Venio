import type { MessageKey } from '../../../i18n'
import { CRM_PATHS, type CrmTabId } from '../../../lib/crmNavigation'
import { settingsSectionPath } from '../crm-settings/sections'

/**
 * « Où est quoi ? » : pour chaque fonction du CRM d'avant, où elle se trouve
 * maintenant. Chaque lien porte l'onglet dont il dépend : il n'apparaît que si
 * l'utilisateur a accès à cet onglet (mêmes droits que la navigation).
 *
 * Les adresses viennent de `CRM_PATHS` et des sous-chemins de ce lot ; les
 * sous-chemins créés par d'autres lots sont à ajouter ici quand le contrat les nomme.
 */
export interface PlanLink {
  /** Clé i18n du libellé du lien. */
  labelKey: MessageKey
  to: string
  /** Onglet du CRM qui commande l'accès au lien. */
  tab: CrmTabId
}

export interface PlanRow {
  id: string
  oldKey: MessageKey
  detailKey: MessageKey
  links: readonly PlanLink[]
}

const link = (id: string, to: string, tab: CrmTabId): PlanLink => ({
  labelKey: `crmPlan.link.${id}` as MessageKey,
  to,
  tab,
})

const row = (id: string, links: readonly PlanLink[]): PlanRow => ({
  id,
  oldKey: `crmPlan.row.${id}.old` as MessageKey,
  detailKey: `crmPlan.row.${id}.detail` as MessageKey,
  links,
})

export const PLAN_ROWS: readonly PlanRow[] = [
  row('queue', [
    link('queue.jour', CRM_PATHS.jour, 'jour'),
    link('queue.semaine', CRM_PATHS.semaine, 'semaine'),
    link('queue.filer', CRM_PATHS.filer, 'filer'),
  ]),
  row('table', [link('table', `${CRM_PATHS.pipeline}?mode=liste`, 'pipeline')]),
  row('kanban', [link('kanban', `${CRM_PATHS.pipeline}?mode=kanban`, 'pipeline')]),
  row('lead', [link('lead', CRM_PATHS.pipeline, 'pipeline')]),
  row('desk', [link('desk', CRM_PATHS.poste, 'poste')]),
  row('analysis', [
    link('analysis.lead', CRM_PATHS.pipeline, 'pipeline'),
    link('analysis.validate', CRM_PATHS.jour, 'jour'),
    link('analysis.hold', CRM_PATHS.jour, 'jour'),
  ]),
  row('pilotage', [link('pilotage', CRM_PATHS.previsions, 'previsions')]),
  row('scripts', [link('scripts', CRM_PATHS.scripts, 'scripts')]),
  row('automations', [
    link('automations', CRM_PATHS.automatisations, 'automatisations'),
    link('automations.regles', `${CRM_PATHS.automatisations}?section=regles`, 'automatisations'),
    link('automations.modeles', `${CRM_PATHS.automatisations}?section=modeles`, 'automatisations'),
    link('automations.sequences', `${CRM_PATHS.automatisations}?section=sequences`, 'automatisations'),
    link('automations.journal', `${CRM_PATHS.automatisations}?section=journal`, 'automatisations'),
  ]),
  row('accounts', [link('accounts', CRM_PATHS.comptes, 'comptes')]),
  row('partners', [link('partners', CRM_PATHS.partenaires, 'partenaires')]),
  row('settings', [
    link('settings', CRM_PATHS.reglages, 'reglages'),
    link('settings.pipeline', settingsSectionPath('statuts'), 'reglages'),
    link('settings.alerts', settingsSectionPath('alertes'), 'reglages'),
    link('settings.telephonie', settingsSectionPath('telephonie'), 'reglages'),
    link('settings.analyse', settingsSectionPath('analyse'), 'reglages'),
    link('settings.opposes', settingsSectionPath('opposes'), 'reglages'),
    link('settings.conservation', settingsSectionPath('conservation'), 'reglages'),
  ]),
]
