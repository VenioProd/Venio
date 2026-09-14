import { useConversion } from '../../context/ConversionContext'
import './DualCta.css'

interface DualCtaProps {
  /** 'start' dans un hero aligné à gauche, 'center' en bas de page. */
  align?: 'start' | 'center'
}

/**
 * Le double appel à l'action du site public. Aucun événement d'analytics à
 * poser ici : le listener global de PublicAnalytics capte data-analytics-cta
 * au niveau du document.
 */
const DualCta = ({ align = 'start' }: DualCtaProps) => {
  const { openBooking, openCallback } = useConversion()

  return (
    <div className={`mc-dual mc-dual--${align}`}>
      <button
        type="button"
        className="mc-btn mc-btn--primary"
        data-analytics-cta="dual_cta_booking"
        onClick={openBooking}
      >
        Réserver 30 minutes
      </button>
      <button
        type="button"
        className="mc-btn mc-btn--ghost"
        data-analytics-cta="dual_cta_callback"
        onClick={openCallback}
      >
        Être rappelé
      </button>
    </div>
  )
}

export default DualCta
