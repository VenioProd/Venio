import React from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'

const StructuredData = ({ type = 'home' }) => {
  const location = useLocation()
  const siteUrl = 'https://venio.paris'
  const currentUrl = `${siteUrl}${location.pathname}`

  const getStructuredData = () => {
    const baseOrganization = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Venio",
      "url": siteUrl,
      "logo": `${siteUrl}/logo.png`,
      "contactPoint": {
        "@type": "ContactPoint",
        "email": "contact@venio.paris",
        "contactType": "customer service"
      },
      "sameAs": [
        "https://decisio.paris",
        "https://creatio.paris",
        "https://formatio.paris"
      ]
    }

    const baseWebSite = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Venio",
      "url": siteUrl,
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${siteUrl}/search?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      }
    }

    switch (type) {
      case 'home':
        return [
          baseOrganization,
          baseWebSite
        ]
      
      case 'poles':
      case 'realisations':
      case 'apropos':
      case 'contact':
        return [
          baseOrganization,
          baseWebSite
        ]
      
      case 'service-communication':
        return [
          baseOrganization,
          {
            "@context": "https://schema.org",
            "@type": "Service",
            "serviceType": "Communication & Branding",
            "provider": baseOrganization,
            "areaServed": "FR",
            "description": "Identités visuelles cohérentes, stratégies éditoriales structurées, contenus premium et storytelling."
          }
        ]
      
      case 'service-developpement':
        return [
          baseOrganization,
          {
            "@context": "https://schema.org",
            "@type": "Service",
            "serviceType": "Développement Web",
            "provider": baseOrganization,
            "areaServed": "FR",
            "description": "Sites web premium, plateformes métier complexes, SaaS scalables et outils sur mesure."
          }
        ]
      
      case 'service-conseil':
        return [
          baseOrganization,
          {
            "@context": "https://schema.org",
            "@type": "Service",
            "serviceType": "Conseil Stratégique",
            "provider": baseOrganization,
            "areaServed": "FR",
            "description": "Positionnement, vision, architecture digitale globale et stratégie IA."
          }
        ]
      
      default:
        return [baseOrganization]
    }
  }

  const getBreadcrumb = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const breadcrumbItems = [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Accueil",
        "item": siteUrl
      }
    ]

    let currentPath = ''
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`
      const name = segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
      
      breadcrumbItems.push({
        "@type": "ListItem",
        "position": index + 2,
        "name": name,
        "item": `${siteUrl}${currentPath}`
      })
    })

    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": breadcrumbItems
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
      <script type="application/ld+json">
        {JSON.stringify(breadcrumb)}
      </script>
    </Helmet>
  )
}

export default StructuredData

