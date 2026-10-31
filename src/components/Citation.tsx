import React from 'react'
import { useI18n } from '../context/I18nContext'
import './Citation.css'

const Citation = () => {
  const { t } = useI18n()
  return (
    <section className="citation">
      <div className="citation-content">
        <p className="citation-text">
          &quot;{t('pubHome.shared.quoteA')}
          <br />
          {t('pubHome.shared.quoteB')}&quot;
        </p>
      </div>
    </section>
  )
}

export default Citation
