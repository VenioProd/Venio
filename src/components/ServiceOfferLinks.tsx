import { Link } from 'react-router-dom'
import { serviceOffers } from '../content/serviceOffers'
import './ServiceOfferLinks.css'

interface ServiceOfferLinksProps {
  currentPath: string
}

const ServiceOfferLinks = ({ currentPath }: ServiceOfferLinksProps) => {
  const otherOffers = serviceOffers.filter((offer) => offer.to !== currentPath)

  return (
    <nav className="service-offer-links" aria-label="Autres offres Venio">
      <p className="service-offer-links__eyebrow">Voir aussi</p>
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
