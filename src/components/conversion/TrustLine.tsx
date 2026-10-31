import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import './TrustLine.css'

const CLAIMS = [
  'pubHome.conversion.trust1',
  'pubHome.conversion.trust2',
  'pubHome.conversion.trust3',
] as const satisfies readonly MessageKey[]

/** Ligne de réassurance posée sous chaque DualCta. Rien de plus. */
const TrustLine = () => {
  const { t } = useI18n()
  return (
    <p className="mc-trust">
      {CLAIMS.map((claim, index) => (
        <span key={claim}>
          {index > 0 && (
            <span className="mc-trust-sep" aria-hidden="true">
              ·
            </span>
          )}
          {t(claim)}
        </span>
      ))}
    </p>
  )
}

export default TrustLine
