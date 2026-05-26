import { useI18n } from '../context/I18nContext'

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2rem',
  height: '2rem',
  borderRadius: '0.5rem',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'rgba(255, 255, 255, 0.7)',
  fontSize: '0.7rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  textTransform: 'uppercase',
  fontFamily: 'inherit',
  padding: 0,
}

// TODO: réactiver une fois useTranslation câblé sur toutes les pages
const LanguageSwitch = () => {
  const { locale, setLocale } = useI18n()

  const toggle = () => {
    setLocale(locale === 'fr' ? 'en' : 'fr')
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={buttonStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)'
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'
        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
      }}
      aria-label={locale === 'fr' ? 'Switch to English' : 'Passer en français'}
      title={locale === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {locale === 'fr' ? 'FR' : 'EN'}
    </button>
  )
}

export default LanguageSwitch
