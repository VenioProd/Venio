import type { MessageKey } from '../../../i18n'
import { safeLinkUrl } from '../../../components/admin/SafeMarkdown'
import type { ProjectSheetReviewStatus, ProjectSheetStatus } from '../../../types/projectSheet.types'

export const API_BASE = '/api/admin/project-sheets'

/** Clé i18n du domaine « projectSheets ». */
export const psKey = (key: string) => ('projectSheets.' + key) as MessageKey

/** URL http(s) uniquement (les liens mailto: ne servent qu'au Markdown). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const url = safeLinkUrl(raw)
  return url && /^https?:/i.test(url) ? url : null
}

/** Couleur CSS hexadécimale valide, sinon null (évite toute injection de style). */
export function safeColor(raw: string | null | undefined): string | null {
  return raw && /^#[0-9a-f]{3,8}$/i.test(raw.trim()) ? raw.trim() : null
}

export const REVIEW_LABEL_KEY: Record<ProjectSheetReviewStatus, string> = {
  DRAFT: 'review.DRAFT',
  TO_COMPLETE: 'review.TO_COMPLETE',
  VALIDATED: 'review.VALIDATED',
}

export const STATUS_LABEL_KEY: Record<ProjectSheetStatus, string> = {
  ACTIVE: 'status.ACTIVE',
  LAUNCHING: 'status.LAUNCHING',
  PAUSED: 'status.PAUSED',
}

/** Erreur API : code et statut lus sans dépendre de la classe ApiError. */
export function apiErrorInfo(err: unknown): { status?: number; code?: string; message: string } {
  const e = err as { status?: number; payload?: { code?: string } | null; message?: string } | null
  return { status: e?.status, code: e?.payload?.code, message: e?.message || '' }
}
