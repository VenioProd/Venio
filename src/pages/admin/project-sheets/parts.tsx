import { useCallback } from 'react'
import { safeColor, safeHttpUrl, psKey, REVIEW_LABEL_KEY, STATUS_LABEL_KEY } from './shared'
import { useI18n } from '../../../context/I18nContext'
import type { ProjectSheetReviewStatus, ProjectSheetStatus } from '../../../types/projectSheet.types'

/** Logo de la fiche, ou pastille de couleur à défaut. */
export function SheetMark({ name, logoUrl, accentColor }: { name: string; logoUrl?: string; accentColor?: string }) {
  const src = logoUrl && (safeHttpUrl(logoUrl) || (logoUrl.startsWith('/') && !logoUrl.startsWith('//') ? logoUrl : null))
  if (src) return <img className="ps-mark ps-mark--img" src={src} alt="" loading="lazy" />
  const color = safeColor(accentColor)
  return (
    <span className="ps-mark ps-mark--dot" style={color ? { background: color } : undefined} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function StatusBadge({ status }: { status: ProjectSheetStatus }) {
  const { t } = useI18n()
  return <span className={'ps-badge ps-badge--' + status}>{t(psKey(STATUS_LABEL_KEY[status] || 'status.ACTIVE'))}</span>
}

/** Badge de relecture : masqué quand la fiche est validée. */
export function ReviewBadge({ review, showValidated = false }: { review: ProjectSheetReviewStatus; showValidated?: boolean }) {
  const { t } = useI18n()
  if (review === 'VALIDATED' && !showValidated) return null
  return <span className={'ps-badge ps-badge--review-' + review}>{t(psKey(REVIEW_LABEL_KEY[review]))}</span>
}

/** Libellé d'un champ (extraits de recherche, historique) : « field.x » puis « section.x », sinon le nom brut. */
export function useFieldLabel() {
  const { t } = useI18n()
  return useCallback(
    (field: string) => {
      for (const prefix of ['field.', 'section.']) {
        const key = psKey(prefix + field)
        const label = t(key)
        if (label !== key) return label
      }
      return field
    },
    [t],
  )
}

