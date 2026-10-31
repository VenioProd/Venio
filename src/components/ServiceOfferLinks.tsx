import { Link } from 'react-router-dom'
import { serviceOffers } from '../content/serviceOffers'
import { useI18n } from '../context/I18nContext'
import './ServiceOfferLinks.css'

interface ServiceOfferLinksProps {
  currentPath: string
}

const ServiceOfferLinks = ({ currentPath }: ServiceOfferLinksProps) => {
  const { t } = useI18n()
  const otherOffers = serviceOffers.filter((offer) => offer.to !== currentPath)

  return (
    <nav className="service-offer-links" aria-label={t('pubHome.offerLinks.label')}>
      <p className="service-offer-links__eyebrow">{t('pubHome.offerLinks.eyebrow')}</p>
      <ul>
        {otherOffers.map((offer) => (
          <li key={offer.to}>
            <Link to={offer.to}>
              <span>{offer.label}</span>
              <small>{offer.description}</small>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default ServiceOfferLinks
