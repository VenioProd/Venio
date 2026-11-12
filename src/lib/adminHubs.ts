import type { MessageKey } from '../i18n'
import type { User } from '../types/auth.types'
import { isNavigationItemVisible, NAVIGATION } from './rbac'

type ModuleId = (typeof NAVIGATION)[number]['id']
export interface AdminHubDefinition {
  titleKey: MessageKey
  eyebrowKey: MessageKey
  subtitleKey: MessageKey
  tabs: readonly { id: string; labelKey: MessageKey; to: string; modules: readonly ModuleId[]; permission?: string }[]
}

export function canAccessHubModule(user: User | null, module: ModuleId): boolean {
  const item = NAVIGATION.find((entry) => entry.id === module)
  return !!user && !!item && isNavigationItemVisible(item, user)
}

export const ADMIN_HUBS = {
  inbox: {
    titleKey: 'shell.hub.inbox.title',
    eyebrowKey: 'shell.hub.inbox.eyebrow',
    subtitleKey: 'shell.hub.inbox.subtitle',
    tabs: [
      {
        id: 'conversations',
        labelKey: 'shell.hub.inbox.conversations',
        to: '/admin/inbox/conversations',
        modules: ['messages'],
      },
      {
        id: 'activite',
        labelKey: 'shell.hub.inbox.activite',
        to: '/admin/inbox/activite',
        modules: ['activity-center'],
      },
      {
        id: 'notifications',
        labelKey: 'shell.hub.inbox.notifications',
        to: '/admin/inbox/notifications',
        modules: ['messages', 'activity-center', 'emails'],
      },
      {
        id: 'envoi-groupe',
        labelKey: 'shell.hub.inbox.envoi-groupe',
        to: '/admin/inbox/envoi-groupe',
        modules: ['emails'],
      },
    ],
  },
  analytics: {
    titleKey: 'shell.hub.analytics.title',
    eyebrowKey: 'shell.hub.analytics.eyebrow',
    subtitleKey: 'shell.hub.analytics.subtitle',
    tabs: [
      {
        id: 'business',
        labelKey: 'shell.hub.analytics.business',
        to: '/admin/analytics/business',
        modules: ['dashboard'],
      },
      {
        id: 'projets',
        labelKey: 'shell.hub.analytics.projets',
        to: '/admin/analytics/projets',
        modules: ['analytics'],
      },
      {
        id: 'rapports',
        labelKey: 'shell.hub.analytics.rapports',
        to: '/admin/analytics/rapports',
        modules: ['reports'],
      },
    ],
  },
  crm: {
    titleKey: 'shell.hub.crm.title',
    eyebrowKey: 'shell.hub.crm.eyebrow',
    subtitleKey: 'shell.hub.crm.subtitle',
    tabs: [
      { id: 'queue', labelKey: 'shell.hub.crm.queue', to: '/admin/crm/a-traiter', modules: ['crm'] },
      { id: 'pipeline', labelKey: 'shell.hub.crm.pipeline', to: '/admin/crm', modules: ['crm'] },
      { id: 'pilotage', labelKey: 'shell.hub.crm.pilotage', to: '/admin/crm/pilotage', modules: ['crm'] },
      {
        id: 'automatisations',
        labelKey: 'shell.hub.crm.automatisations',
        to: '/admin/crm/automatisations',
        modules: ['crm'],
      },
      { id: 'comptes', labelKey: 'shell.hub.crm.comptes', to: '/admin/crm/comptes', modules: ['clients'] },
      {
        id: 'partenaires',
        labelKey: 'shell.hub.crm.partenaires',
        to: '/admin/crm/partenaires',
        modules: ['external-sales'],
      },
      {
        id: 'reglages',
        labelKey: 'shell.hub.crm.settings',
        to: '/admin/crm/reglages',
        modules: ['crm'],
        permission: 'manage_crm',
      },
    ],
  },
  projets: {
    titleKey: 'shell.hub.projets.title',
    eyebrowKey: 'shell.hub.projets.eyebrow',
    subtitleKey: 'shell.hub.projets.subtitle',
    tabs: [
      { id: 'clients', labelKey: 'shell.hub.projets.clients', to: '/admin/projets/clients', modules: ['projects'] },
      {
        id: 'internes',
        labelKey: 'shell.hub.projets.internes',
        to: '/admin/projets/internes',
        modules: ['internal-projects'],
      },
      { id: 'fiches', labelKey: 'shell.hub.projets.fiches', to: '/admin/projets/fiches', modules: ['project-sheets'] },
      {
        id: 'plateformes',
        labelKey: 'shell.hub.projets.plateformes',
        to: '/admin/projets/plateformes',
        modules: ['subsidiaries'],
      },
      { id: 'modeles', labelKey: 'shell.hub.projets.modeles', to: '/admin/projets/modeles', modules: ['templates'] },
    ],
  },
  demandes: {
    titleKey: 'shell.hub.demandes.title',
    eyebrowKey: 'shell.hub.demandes.eyebrow',
    subtitleKey: 'shell.hub.demandes.subtitle',
    tabs: [
      {
        id: 'clients',
        labelKey: 'shell.hub.demandes.clients',
        to: '/admin/demandes/clients',
        modules: ['change-requests'],
      },
      { id: 'equipe', labelKey: 'shell.hub.demandes.equipe', to: '/admin/demandes/equipe', modules: ['tickets'] },
    ],
  },
  dev: {
    titleKey: 'shell.hub.dev.title',
    eyebrowKey: 'shell.hub.dev.eyebrow',
    subtitleKey: 'shell.hub.dev.subtitle',
    tabs: [
      { id: 'workspace', labelKey: 'shell.hub.dev.workspace', to: '/admin/dev/workspace', modules: ['dev'] },
      { id: 'idees', labelKey: 'shell.hub.dev.idees', to: '/admin/dev/idees', modules: ['dev-ideas'] },
      { id: 'recette', labelKey: 'shell.hub.dev.recette', to: '/admin/dev/recette', modules: ['beta'] },
    ],
  },
  equipe: {
    titleKey: 'shell.hub.equipe.title',
    eyebrowKey: 'shell.hub.equipe.eyebrow',
    subtitleKey: 'shell.hub.equipe.subtitle',
    tabs: [
      { id: 'membres', labelKey: 'shell.hub.equipe.membres', to: '/admin/equipe/membres', modules: ['interns'] },
      { id: 'comptes', labelKey: 'shell.hub.equipe.comptes', to: '/admin/equipe/comptes', modules: ['admin-accounts'] },
      {
        id: 'acces-outils',
        labelKey: 'shell.hub.equipe.acces-outils',
        to: '/admin/equipe/acces-outils',
        modules: ['tool-access'],
      },
    ],
  },
  formation: {
    titleKey: 'shell.hub.formation.title',
    eyebrowKey: 'shell.hub.formation.eyebrow',
    subtitleKey: 'shell.hub.formation.subtitle',
    tabs: [
      {
        id: 'qualiopi',
        labelKey: 'shell.hub.formation.qualiopi',
        to: '/admin/formation/qualiopi',
        modules: ['qualiopi'],
      },
      {
        id: 'pedagogie',
        labelKey: 'shell.hub.formation.pedagogie',
        to: '/admin/formation/pedagogie',
        modules: ['education'],
      },
    ],
  },
  systeme: {
    titleKey: 'shell.hub.systeme.title',
    eyebrowKey: 'shell.hub.systeme.eyebrow',
    subtitleKey: 'shell.hub.systeme.subtitle',
    tabs: [
      { id: 'sante', labelKey: 'shell.hub.systeme.sante', to: '/admin/systeme/sante', modules: ['health'] },
      { id: 'audit', labelKey: 'shell.hub.systeme.audit', to: '/admin/systeme/audit', modules: ['audit'] },
      {
        id: 'integrations',
        labelKey: 'shell.hub.systeme.integrations',
        to: '/admin/systeme/integrations',
        modules: ['agents', 'webhooks'],
      },
    ],
  },
} as const satisfies Record<string, AdminHubDefinition>
