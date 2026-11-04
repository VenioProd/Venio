import type { MessageKey } from '../../../i18n'

export type MemberKind =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'RH'
  | 'COMPTABLE'
  | 'VIEWER'
  | 'COMMERCIAL'
  | 'COMMERCIAL_EXTERNE'
  | 'STAGIAIRE'
  | 'ALTERNANT'
  | 'CLIENT'

export interface MemberKindOption {
  kind: MemberKind
  label: MessageKey
  hint: MessageKey
}

export interface MemberKindGroup {
  key: string
  label: MessageKey
  kinds: MemberKindOption[]
}

/** Statuts proposés à la création, regroupés par famille (miroir de `MEMBER_KINDS` côté backend). */
export const MEMBER_KIND_GROUPS: MemberKindGroup[] = [
  {
    key: 'management',
    label: 'intern.member.group.management',
    kinds: [
      { kind: 'SUPER_ADMIN', label: 'intern.member.kind.superAdmin', hint: 'intern.member.kind.superAdmin.hint' },
      { kind: 'ADMIN', label: 'intern.member.kind.admin', hint: 'intern.member.kind.admin.hint' },
      { kind: 'MANAGER', label: 'intern.member.kind.manager', hint: 'intern.member.kind.manager.hint' },
      { kind: 'RH', label: 'intern.member.kind.rh', hint: 'intern.member.kind.rh.hint' },
      { kind: 'COMPTABLE', label: 'intern.member.kind.comptable', hint: 'intern.member.kind.comptable.hint' },
      { kind: 'VIEWER', label: 'intern.member.kind.viewer', hint: 'intern.member.kind.viewer.hint' },
    ],
  },
  {
    key: 'sales',
    label: 'intern.member.group.sales',
    kinds: [
      { kind: 'COMMERCIAL', label: 'intern.member.kind.commercial', hint: 'intern.member.kind.commercial.hint' },
      {
        kind: 'COMMERCIAL_EXTERNE',
        label: 'intern.member.kind.commercialExterne',
        hint: 'intern.member.kind.commercialExterne.hint',
      },
    ],
  },
  {
    key: 'training',
    label: 'intern.member.group.training',
    kinds: [
      { kind: 'STAGIAIRE', label: 'intern.member.kind.stagiaire', hint: 'intern.member.kind.stagiaire.hint' },
      { kind: 'ALTERNANT', label: 'intern.member.kind.alternant', hint: 'intern.member.kind.alternant.hint' },
    ],
  },
  {
    key: 'external',
    label: 'intern.member.group.external',
    kinds: [{ kind: 'CLIENT', label: 'intern.member.kind.client', hint: 'intern.member.kind.client.hint' }],
  },
]

export const isInternKind = (kind: MemberKind | null): boolean => kind === 'STAGIAIRE' || kind === 'ALTERNANT'

/** Reflète les droits backend : seul le super admin crée l'équipe, un admin crée des clients. */
export function creatableGroups(role: string | undefined): MemberKindGroup[] {
  if (role === 'SUPER_ADMIN') return MEMBER_KIND_GROUPS
  return MEMBER_KIND_GROUPS.filter((group) => group.key === 'external')
}

export const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

/** Durée approximative en mois entre deux dates ISO ; `null` si l'une manque ou si l'ordre est inversé. */
export function monthsBetween(start: string, end: string): number | null {
  if (!start || !end) return null
  const from = new Date(start)
  const to = new Date(end)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / (30.44 * 24 * 3600 * 1000)))
}
