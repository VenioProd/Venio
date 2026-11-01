import type { User } from '../types/auth.types'
import { isNavigationItemVisible, NAVIGATION } from './rbac'

type ModuleId = (typeof NAVIGATION)[number]['id']
export interface AdminHubDefinition {
  title: string
  eyebrow: string
  subtitle: string
  tabs: readonly { id: string; label: string; to: string; modules: readonly ModuleId[] }[]
}

export function canAccessHubModule(user: User | null, module: ModuleId): boolean {
  const item = NAVIGATION.find((entry) => entry.id === module)
  return !!user && !!item && isNavigationItemVisible(item, user)
}

export const ADMIN_HUBS = {
  inbox: {
    title: 'Inbox',
    eyebrow: 'Pilotage',
    subtitle: 'Conversations, activité et envois groupés.',
    tabs: [
      { id: 'conversations', label: 'Conversations', to: '/admin/inbox/conversations', modules: ['messages'] },
      { id: 'activite', label: 'Activité', to: '/admin/inbox/activite', modules: ['activity-center'] },
      {
        id: 'notifications',
        label: 'Notifications',
        to: '/admin/inbox/notifications',
        modules: ['messages', 'activity-center', 'emails'],
      },
      { id: 'envoi-groupe', label: 'Envoi groupé', to: '/admin/inbox/envoi-groupe', modules: ['emails'] },
    ],
  },
  analytics: {
    title: 'Analytics',
    eyebrow: 'Pilotage',
    subtitle: 'Suivez l’activité et retrouvez vos rapports.',
    tabs: [
      { id: 'business', label: 'Business', to: '/admin/analytics/business', modules: ['dashboard'] },
      { id: 'projets', label: 'Projets & site', to: '/admin/analytics/projets', modules: ['analytics'] },
      { id: 'rapports', label: 'Rapports', to: '/admin/analytics/rapports', modules: ['reports'] },
    ],
  },
  crm: {
    title: 'CRM',
    eyebrow: 'Commercial',
    subtitle: 'Pipeline, comptes clients, partenaires et automatisations.',
    tabs: [
      { id: 'pipeline', label: 'Pipeline', to: '/admin/crm', modules: ['crm'] },
      { id: 'comptes', label: 'Comptes clients', to: '/admin/crm/comptes', modules: ['clients'] },
      { id: 'partenaires', label: 'Partenaires', to: '/admin/crm/partenaires', modules: ['external-sales'] },
      { id: 'automatisations', label: 'Automatisations', to: '/admin/crm/automatisations', modules: ['crm'] },
    ],
  },
  projets: {
    title: 'Projets',
    eyebrow: 'Production',
    subtitle: 'Projets clients, internes, plateformes et modèles.',
    tabs: [
      { id: 'clients', label: 'Clients', to: '/admin/projets/clients', modules: ['projects'] },
      { id: 'internes', label: 'Internes', to: '/admin/projets/internes', modules: ['internal-projects'] },
      { id: 'plateformes', label: 'Plateformes', to: '/admin/projets/plateformes', modules: ['subsidiaries'] },
      { id: 'modeles', label: 'Modèles', to: '/admin/projets/modeles', modules: ['templates'] },
    ],
  },
  demandes: {
    title: 'Demandes',
    eyebrow: 'Production',
    subtitle: 'Demandes clients et tickets de l’équipe.',
    tabs: [
      { id: 'clients', label: 'Clients', to: '/admin/demandes/clients', modules: ['change-requests'] },
      { id: 'equipe', label: 'Équipe', to: '/admin/demandes/equipe', modules: ['tickets'] },
    ],
  },
  dev: {
    title: 'Dev',
    eyebrow: 'Production',
    subtitle: 'Workspace de développement, boîte à idées et recette.',
    tabs: [
      { id: 'workspace', label: 'Workspace', to: '/admin/dev/workspace', modules: ['dev'] },
      { id: 'idees', label: 'Idées', to: '/admin/dev/idees', modules: ['dev-ideas'] },
      { id: 'recette', label: 'Recette', to: '/admin/dev/recette', modules: ['beta'] },
    ],
  },
  equipe: {
    title: 'Équipe',
    eyebrow: 'Organisation',
    subtitle: 'Membres, comptes et accès aux outils.',
    tabs: [
      { id: 'membres', label: 'Membres', to: '/admin/equipe/membres', modules: ['interns'] },
      { id: 'comptes', label: 'Rôles & comptes', to: '/admin/equipe/comptes', modules: ['admin-accounts'] },
      { id: 'acces-outils', label: 'Accès outils', to: '/admin/equipe/acces-outils', modules: ['tool-access'] },
    ],
  },
  formation: {
    title: 'Formation',
    eyebrow: 'Organisation',
    subtitle: 'Qualité et pédagogie.',
    tabs: [
      { id: 'qualiopi', label: 'Qualiopi', to: '/admin/formation/qualiopi', modules: ['qualiopi'] },
      { id: 'pedagogie', label: 'Pédagogie', to: '/admin/formation/pedagogie', modules: ['education'] },
    ],
  },
  systeme: {
    title: 'Système',
    eyebrow: 'Organisation',
    subtitle: 'Santé, traçabilité et intégrations.',
    tabs: [
      { id: 'sante', label: 'Santé', to: '/admin/systeme/sante', modules: ['health'] },
      { id: 'audit', label: 'Journal d’audit', to: '/admin/systeme/audit', modules: ['audit'] },
      { id: 'integrations', label: 'Intégrations', to: '/admin/systeme/integrations', modules: ['agents', 'webhooks'] },
    ],
  },
} as const satisfies Record<string, AdminHubDefinition>
