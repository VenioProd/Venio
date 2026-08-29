import React from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

const StructuredData = ({ type = 'home' }) => {
  const location = useLocation()
  const siteUrl = 'https://venio.paris'
  const currentUrl = `${siteUrl}${location.pathname}`

  const getStructuredData = () => {
    const baseOrganization = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Venio',
      url: siteUrl,
      logo: `${siteUrl}/favicon-512x512.png`,
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'contact@venio.paris',
        contactType: 'customer service',
      },
      sameAs: ['https://decisio.paris', 'https://creatio.paris', 'https://formatio.paris'],
    }

    const baseWebSite = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Venio',
      url: siteUrl,
    }

    switch (type) {
      case 'home':
        return [baseOrganization, baseWebSite]

      case 'realisations':
      case 'apropos':
      case 'contact':
        return [baseOrganization, baseWebSite]

      case 'au-dela-du-site':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: [
              {
                '@type': 'Service',
                position: 1,
                serviceType: 'Conseil Stratégique',
                provider: baseOrganization,
                areaServed: 'FR',
                description: 'Audit sans détour, décisions et priorités.',
              },
              {
                '@type': 'Service',
                position: 2,
                serviceType: 'Développement sur mesure',
                provider: baseOrganization,
                areaServed: 'FR',
                description: 'Outils métier et applications construits autour de votre façon de travailler.',
              },
              {
                '@type': 'Service',
                position: 3,
                serviceType: 'Communication & Branding',
                provider: baseOrganization,
                areaServed: 'FR',
                description: 'Identité, voix et système de marque cohérents dans le temps.',
              },
            ],
          },
        ]

      case 'service-communication':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: 'Communication & Branding',
            provider: baseOrganization,
            areaServed: 'FR',
            description:
              'Identités visuelles cohérentes, stratégies éditoriales structurées, contenus premium et storytelling.',
          },
        ]

      case 'service-developpement':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: 'Développement Web',
            provider: baseOrganization,
            areaServed: 'FR',
            description: 'Sites web premium, plateformes métier complexes, SaaS scalables et outils sur mesure.',
          },
        ]

      case 'service-conseil':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: 'Conseil Stratégique',
            provider: baseOrganization,
            areaServed: 'FR',
            description: 'Positionnement, vision, architecture digitale globale et stratégie IA.',
          },
        ]

      case 'service-sites':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: 'Création de Sites Web',
            provider: baseOrganization,
            areaServed: 'FR',
            description:
              'Sites web sur mesure sans templates — vitrine, e-commerce, plateforme métier. Avec ou sans webmastering (hébergement + entretien mensuel inclus).',
          },
        ]

      default:
        return [baseOrganization]
    }
  }

  const getBreadcrumb = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const breadcrumbItems = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Accueil',
        item: siteUrl,
      },
    ]

    let currentPath = ''
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`
      const name = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      breadcrumbItems.push({
        '@type': 'ListItem',
        position: index + 2,
        name: name,
        item: `${siteUrl}${currentPath}`,
      })
    })

    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems,
    }
  }

  const structuredData = getStructuredData()
  const breadcrumb = getBreadcrumb()

  return (
    <Helmet>
      {structuredData.map((data, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(data)}
        </script>
      ))}
      <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
    </Helmet>
  )
}

export default StructuredData
