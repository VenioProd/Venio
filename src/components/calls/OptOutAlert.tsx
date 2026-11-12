import { PhoneOff } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { QuoteLine } from './ui'
import './callInsights.css'

/** Alerte prioritaire : le prospect s'est opposé à être rappelé. */
export default function OptOutAlert({ quote, onQuote }: { quote: string | null; onQuote?: (quote: string) => void }) {
  const { t } = useI18n()
  return (
    <div className="ci-optout" role="alert">
      <PhoneOff size={20} aria-hidden />
      <div>
        <strong>{t('callInsights.optOut.title')}</strong>
        <p>{t('callInsights.optOut.body')}</p>
        {quote && <QuoteLine quote={quote} onQuote={onQuote} />}
      </div>
    </div>
  )
}
