import { useI18n, type Locale } from '../context/I18nContext'
import './LanguageSelect.css'

const OPTIONS: { value: Locale; label: string; name: string }[] = [
  { value: 'fr', label: 'FR', name: 'Français' },
  { value: 'en', label: 'EN', name: 'English' },
]

/**
 * Segmented language picker for account settings and app shells.
 * The choice is kept in localStorage (`venio-lang`) and, when signed in, on the user (`User.locale`).
 */
const LanguageSelect = ({ compact = false }: { compact?: boolean }) => {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      className={`language-select${compact ? ' language-select--compact' : ''}`}
      role="radiogroup"
      aria-label={t('common.language')}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={locale === option.value}
          className={`language-select__option${locale === option.value ? ' is-active' : ''}`}
          onClick={() => setLocale(option.value)}
          lang={option.value}
        >
          {compact ? option.label : option.name}
        </button>
      ))}
    </div>
  )
}

export default LanguageSelect
