import React from 'react'
import { Helmet } from 'react-helmet-async'
import { useLocation } from 'react-router-dom'
import type { MessageKey } from '../i18n'
import { useI18n } from '../context/I18nContext'
import { APROPOS_FAQ, HOME_FAQ, METHODE_FAQ, SITES_FAQ, type FaqItem } from '../content/faq'

/** Une page balisée sans FAQ visible serait un faux signal : la table suit
    exactement les pages qui affichent l'accordéon. */
const FAQ_BY_TYPE: Record<string, FaqItem[]> = {
  home: HOME_FAQ,
  'service-sites': SITES_FAQ,
  method: METHODE_FAQ,
  apropos: APROPOS_FAQ,
}

const StructuredData = ({ type = 'home' }) => {
  const location = useLocation()
  const { t } = useI18n()
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
      case 'realisations':
      case 'apropos':
      case 'contact':
        return [baseOrganization, baseWebSite]

      case 'conseil-communication':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: [
              ['pubHome.schema.advice1Type', 'pubHome.schema.advice1Desc'],
              ['pubHome.schema.advice2Type', 'pubHome.schema.advice2Desc'],
              ['pubHome.schema.advice3Type', 'pubHome.schema.advice3Desc'],
              ['pubHome.schema.advice4Type', 'pubHome.schema.advice4Desc'],
              ['pubHome.schema.advice5Type', 'pubHome.schema.advice5Desc'],
            ].map(([serviceType, description], index) => ({
              '@type': 'Service',
              position: index + 1,
              serviceType: t(serviceType as MessageKey),
              provider: baseOrganization,
              areaServed: 'FR',
              description: t(description as MessageKey),
            })),
          },
        ]

      case 'service-communication':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: t('pubHome.schema.communicationType'),
            provider: baseOrganization,
            areaServed: 'FR',
            description: t('pubHome.schema.communicationDesc'),
          },
        ]

      case 'service-developpement':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: t('pubHome.schema.developmentType'),
            provider: baseOrganization,
            areaServed: 'FR',
            description: t('pubHome.schema.developmentDesc'),
          },
        ]

      case 'service-conseil':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: t('pubHome.schema.consultingType'),
            provider: baseOrganization,
            areaServed: 'FR',
            description: t('pubHome.schema.consultingDesc'),
          },
        ]

      case 'service-sites':
        return [
          baseOrganization,
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: t('pubHome.schema.sitesType'),
            provider: baseOrganization,
            areaServed: 'FR',
            description: t('pubHome.schema.sitesDesc'),
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
        name: t('nav.home'),
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

  /**
   * La FAQ d'une page est balisée ici, au runtime, et non dans le prérendu :
   * `scripts/validate-prerender.js` n'accepte qu'un seul `ld+json` dans le HTML
   * statique. Les questions viennent de `src/content/faq.ts`, la même source
   * que l'accordéon — un balisage qui diverge de la page visible est une
   * pénalité, pas une coquille.
   */
  const faqItems = FAQ_BY_TYPE[type]
  const faqPage = faqItems
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      }
    : null

  const structuredData = [...getStructuredData(), ...(faqPage ? [faqPage] : [])]
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
