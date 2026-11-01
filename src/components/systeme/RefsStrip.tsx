import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import './systeme.css'

const references = [
  ['Decisio', 'https://decisio.paris/'],
  ['Formatio', 'https://formatio.paris/'],
  ['Absys', 'https://absys.school/'],
  ['Jiraya', 'https://game.susanoo.app/'],
] as const

export default function RefsStrip() {
  const { t } = useI18n()
  return (
    <nav className="sy-refs sy-glass sy-rv" aria-label={t('pubHome.sys.refsAria')}>
      <span className="sy-mono">{t('pubHome.sys.refsLabel')}</span>
      {references.map(([name, href]) => (
        <a key={href} href={href} target="_blank" rel="noopener noreferrer">
          {name}
          <small aria-hidden="true">↗</small>
          <span className="sy-sr-only"> {t('pubHome.sys.external')}</span>
        </a>
      ))}
      <Link className="sy-refs__all" to="/realisations">
        {t('pubHome.sys.refsAll')}{' '}
        <span className="sy-arr" aria-hidden="true">
          →
        </span>
      </Link>
    </nav>
  )
}
