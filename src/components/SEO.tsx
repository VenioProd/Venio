import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

interface SEOProps {
  title?: string
  description?: string
  keywords?: string
  image?: string
  type?: string
  noindex?: boolean
}

const SEO = ({
  title,
  description,
  keywords = '',
  image = '/og-image.jpg',
  type = 'website',
  noindex = false
}: SEOProps) => {
  const location = useLocation()
  const siteUrl = 'https://venio.paris'
  const currentUrl = `${siteUrl}${location.pathname}`
  const fullTitle = title ? `${title} | Venio` : 'Venio - Stratégie. Création. Sans compromis.'
  const fullDescription = description || 'Venio construit des systèmes qui durent. Architecture sur mesure, identités cohérentes et stratégies actionnables pour entreprises premium.'

  return (
    <Helmet>
      {/* Meta tags de base */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={currentUrl} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:image" content={`${siteUrl}${image}`} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:site_name" content="Venio" />
      <meta property="og:locale" content="fr_FR" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      <meta name="twitter:image" content={`${siteUrl}${image}`} />

      {/* Additional meta tags */}
      <meta name="author" content="Venio" />
      <meta name="theme-color" content="#0ea5e9" />
    </Helmet>
  )
}

export default SEO
