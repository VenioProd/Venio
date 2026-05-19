import type { InboxItem } from '../types.js'

/**
 * System alerts source.
 *
 * V1: returns []. Real alert sources (Backup, QualiopiSignature expirations,
 * scheduled audits) will be added when their backing models exist.
 *
 * The Pulse status component on the dashboard already covers backup/qualiopi
 * visibility via the dedicated `pulseRules` service, so V1 absence here is
 * not a coverage gap — it's a deferred enhancement.
 */
export async function getSystemItems(): Promise<InboxItem[]> {
  return []
}
