import type { Request } from 'express'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'

/**
 * Outils partagés par les tests de non-régression des routes leads du CRM
 * (crm-routes-*.test.ts). Ce fichier n'est pas une suite : il ne contient aucun test.
 */

export type TeamRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'MANAGER'
  | 'COMMERCIAL'
  | 'STAGIAIRE'
  | 'VIEWER'
  | 'COMPTABLE'
  | 'COMMERCIAL_EXTERNE'
  | 'CLIENT'

export interface TeamMember {
  id: string
  role: TeamRole
  email: string
  name: string
}

export type Team = Record<string, TeamMember>

/** Utilisateur injecté par le faux middleware d'authentification. */
export function asReqUser(member: TeamMember): NonNullable<Request['user']> {
  return { id: member.id, role: member.role, email: member.email, name: member.name } as NonNullable<Request['user']>
}

async function seed(key: string, role: TeamRole, extra: Record<string, unknown> = {}): Promise<TeamMember> {
  const email = `${key}@crm-routes.test`
  const user = await User.create({
    email,
    name: key,
    role,
    passwordHash: 'x',
    twoFactorEnabled: true,
    ...extra,
  })
  return { id: String(user._id), role, email, name: key }
}

/**
 * Équipe type : un utilisateur par rôle utile, deux commerciaux pour tester
 * les périmètres croisés, un commercial inactif.
 */
export async function seedTeam(): Promise<Team> {
  return {
    superAdmin: await seed('super', 'SUPER_ADMIN'),
    admin: await seed('admin', 'ADMIN'),
    manager: await seed('manager', 'MANAGER'),
    commercialA: await seed('commercial-a', 'COMMERCIAL'),
    commercialB: await seed('commercial-b', 'COMMERCIAL'),
    inactive: await seed('commercial-inactif', 'COMMERCIAL', { isActive: false }),
    stagiaire: await seed('stagiaire', 'STAGIAIRE'),
    viewer: await seed('viewer', 'VIEWER'),
    comptable: await seed('comptable', 'COMPTABLE'),
    externe: await seed('externe', 'COMMERCIAL_EXTERNE'),
    client: await seed('client', 'CLIENT'),
  }
}

/**
 * Réglages CRM déterministes : on coupe ce qui dépend de l'extérieur ou de
 * l'ordre des utilisateurs (round-robin, e-mail d'assignation) et on garde
 * l'auto-qualification et le journal d'activité, qui font partie du contrat.
 */
export async function resetCrmSettings(overrides: Record<string, unknown> = {}): Promise<void> {
  await CrmSettings.deleteMany({})
  await CrmSettings.create({
    roundRobinEnabled: false,
    emailOnAssignment: false,
    autoQualifyEnabled: true,
    activityLogging: true,
    scoringEnabled: false,
    ...overrides,
  })
}

/** UUID v4 valide pour l'en-tête Idempotency-Key. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}
