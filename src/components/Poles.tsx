import React from 'react'
import PoleCard from './PoleCard'
import { useI18n } from '../context/I18nContext'
import './Poles.css'

const Poles = () => {
  const { t } = useI18n()
  const poles = [
    {
      name: 'DECISIO',
      description: t('pubHome.poles.legal'),
      link: 'https://decisio.paris',
      external: true,
    },
    {
      name: 'CREATIO',
      description: t('pubHome.poles.courses'),
      link: 'https://creatio.paris',
      external: true,
    },
    {
      name: 'FORMATIO',
      description: t('pubHome.poles.training'),
      link: 'https://formatio.paris',
      external: true,
    },
  ]

  return (
    <section className="poles" id="poles">
      <div className="section-header">
        <h2 className="section-title">{t('pubHome.shared.polesTitle')}</h2>
      </div>
      <div className="poles-grid">
        {poles.map((pole, index) => (
          <PoleCard key={index} {...pole} />
        ))}
      </div>
    </section>
  )
}

export default Poles
