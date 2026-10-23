import type { NotificationType } from '../types/enums.js'

export type PushLanguage = 'fr' | 'en'
export const APP_LOCALES = ['system', 'fr', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

interface PushText {
  title: string
  body: string
}

type Template = (text: PushText, metadata: Record<string, unknown>) => PushText | false

// Les notifications sont rédigées en français à leur création. Pour les types
// qu'un commercial reçoit sur son téléphone, la version anglaise est recomposée
// à partir des valeurs rangées dans `metadata`. Les noms propres et les titres
// saisis par les gens restent tels quels : aucune traduction côté serveur.
const ENGLISH: Partial<Record<NotificationType, Template>> = {
  CRM_LEAD_CREATED: () => ({ title: 'New website contact', body: 'A new contact is waiting in the CRM.' }),
  CRM_LEAD_ASSIGNED: ({ body }) => ({ title: 'Lead assigned to you', body }),
  LEAD_FOLLOW_UP_DUE: ({ body }) => ({ title: 'Follow-up due', body }),
  QUOTE_PROPOSAL_VIEWED: ({ body }) => ({ title: 'Quote viewed', body }),
  QUOTE_PROPOSAL_SIGNED: ({ body }) => ({ title: 'Quote signed', body }),
  PHASE_VALIDATED: (_text, m) =>
    filled(m, ['projectName', 'phaseTitle', 'actorName']) && {
      title: `Stage approved — ${m.projectName}`,
      body: `${m.actorName} approved the stage “${m.phaseTitle}”.`,
    },
  PHASE_REVISION_REQUESTED: (_text, m) =>
    filled(m, ['projectName', 'phaseTitle', 'actorName']) && {
      title: `Changes requested — ${m.projectName}`,
      body: `${m.actorName} requested changes on the stage “${m.phaseTitle}”.`,
    },
  CHANGE_REQUEST_CREATED: (_text, m) =>
    filled(m, ['requestTitle', 'actorName']) && {
      title: `New request: ${m.requestTitle}`,
      body: `${m.actorName} submitted a change request.`,
    },
  TICKET_CREATED: (_text, m) =>
    filled(m, ['ticketTitle', 'actorName']) && {
      title: `New ticket: ${m.ticketTitle}`,
      body: `${m.actorName} opened a ticket.`,
    },
}

function filled(metadata: Record<string, unknown>, keys: string[]): boolean {
  return keys.every((key) => typeof metadata[key] === 'string' && metadata[key] !== '')
}

/** Texte du push dans la langue demandée, ou le texte français d'origine à défaut. */
export function pushTextFor(
  type: NotificationType | undefined,
  text: PushText,
  metadata: Record<string, unknown>,
  language: PushLanguage,
): PushText {
  if (language === 'fr' || !type) return text
  return ENGLISH[type]?.(text, metadata) || text
}

/**
 * Langue d'un appareil : le choix fait dans l'app, sinon la langue du système
 * déclarée par l'appareil, sinon la langue de l'interface web, sinon le français.
 */
export function pushLanguageFor(
  appLocale: AppLocale | null | undefined,
  deviceLanguage: PushLanguage | null | undefined,
  webLocale: PushLanguage | null | undefined,
): PushLanguage {
  if (appLocale === 'fr' || appLocale === 'en') return appLocale
  return deviceLanguage ?? webLocale ?? 'fr'
}
