import type { MessageKey } from '../../../i18n'

type Translate = (key: MessageKey) => string

/** Statuts proposés dans le filtre et affichés sur les cartes projet. */
export const PROJECT_FILTER_STATUS_KEYS = {
  EN_COURS: 'projA.status.project.inProgress',
  EN_ATTENTE: 'projA.status.project.onHold',
  TERMINE: 'projA.status.project.done',
  ARCHIVE: 'projA.status.project.archived',
} as const satisfies Record<string, MessageKey>

/** Statuts proposés dans le formulaire projet. */
export const PROJECT_FORM_STATUS_KEYS = {
  EN_COURS: 'projA.status.project.inProgress',
  PAUSE: 'projA.status.project.paused',
  TERMINE: 'projA.status.project.done',
  ARCHIVE: 'projA.status.project.archived',
} as const satisfies Record<string, MessageKey>

export const MISSION_STATUS_KEYS = {
  A_FAIRE: 'projA.status.mission.todo',
  EN_COURS: 'projA.status.mission.inProgress',
  TERMINE: 'projA.status.mission.done',
} as const satisfies Record<string, MessageKey>

export const PRIORITY_KEYS = {
  BASSE: 'projA.priority.low',
  NORMALE: 'projA.priority.normal',
  HAUTE: 'projA.priority.high',
  URGENTE: 'projA.priority.urgent',
} as const satisfies Record<string, MessageKey>

/** Les valeurs des pôles sont stockées en base : seul le libellé affiché est traduit. */
export const POLE_KEYS = {
  Dev: 'projA.pole.dev',
  Design: 'projA.pole.design',
  Marketing: 'projA.pole.marketing',
  Communication: 'projA.pole.communication',
  Commercial: 'projA.pole.sales',
  Direction: 'projA.pole.management',
  RH: 'projA.pole.hr',
  Formation: 'projA.pole.training',
} as const satisfies Record<string, MessageKey>

/** Libellé traduit d'une valeur métier ; une valeur inconnue est affichée telle quelle. */
export function labelFor(t: Translate, keys: Readonly<Record<string, MessageKey>>, value: string): string {
  const key = Object.prototype.hasOwnProperty.call(keys, value) ? keys[value] : undefined
  return key ? t(key) : value
}
