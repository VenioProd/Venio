import type { ReactNode } from 'react'
import { Check, Pencil, Quote, Sparkles, X } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import type { Confidence, ReviewAction } from '../../services/callInsights'

/** Geste de validation : bouton à bascule (rien n'est appliqué sans geste explicite). */
export function GestureButton({
  pressed,
  disabled,
  kind,
  describedBy,
  onClick,
  children,
}: {
  pressed: boolean
  disabled?: boolean
  kind: 'accept' | 'edit' | 'ignore'
  describedBy?: string
  onClick: () => void
  children: ReactNode
}) {
  const Icon = kind === 'accept' ? Check : kind === 'edit' ? Pencil : X
  return (
    <button
      type="button"
      className={`portal-button secondary ci-gesture ci-gesture--${kind}`}
      aria-pressed={pressed}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={14} aria-hidden />
      {children}
    </button>
  )
}

/** Étiquette qui distingue une valeur proposée d'une valeur enregistrée (icône + texte + bordure en pointillé). */
export function ProposalTag() {
  const { t } = useI18n()
  return (
    <span className="ci-tag ci-tag--proposal">
      <Sparkles size={12} aria-hidden />
      {t('callInsights.proposal')}
    </span>
  )
}

export function ConfidenceMeter({ level }: { level: Confidence }) {
  const { t } = useI18n()
  const filled = level === 'HIGH' ? 3 : level === 'MEDIUM' ? 2 : 1
  return (
    <span className="ci-confidence">
      <span className="ci-confidence-bars" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= filled ? 'on' : ''} />
        ))}
      </span>
      {t(`callInsights.confidence.${level}`)}
    </span>
  )
}

export function QuoteLine({
  quote,
  onQuote,
  verified = true,
}: {
  quote: string
  onQuote?: (quote: string) => void
  verified?: boolean
}) {
  const { t } = useI18n()
  return (
    <figure className="ci-quote">
      <blockquote>
        <Quote size={12} aria-hidden />
        {quote}
      </blockquote>
      {onQuote && verified && (
        <button type="button" className="ci-link" onClick={() => onQuote(quote)}>
          {t('callInsights.quote.show')}
        </button>
      )}
    </figure>
  )
}

/** Résultat d'une décision déjà enregistrée (analyse validée). */
export function DecisionBadge({ action }: { action: ReviewAction | null }) {
  const { t } = useI18n()
  if (!action) return <span className="ci-tag">{t('callInsights.decision.none')}</span>
  const Icon = action === 'IGNORE' ? X : action === 'EDIT' ? Pencil : Check
  return (
    <span className={`ci-tag ci-tag--${action.toLowerCase()}`}>
      <Icon size={12} aria-hidden />
      {t(`callInsights.decision.${action}`)}
    </span>
  )
}
