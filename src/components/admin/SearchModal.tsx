import { useNavigate } from 'react-router-dom'
import type { SearchResult } from '../../services/search'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'

const TYPE_ICONS: Record<string, string> = {
  project: '\u{1F4C1}',
  client: '\u{1F464}',
  task: '\u{2705}',
  lead: '\u{1F525}',
}

const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  project: 'compB.search.typeProject',
  client: 'compB.search.typeClient',
  task: 'compB.search.typeTask',
  lead: 'compB.search.typeLead',
}

interface SearchModalProps {
  results?: SearchResult[]
  activeIndex?: number
  onActiveIndex?: (index: number) => void
  onSelect?: () => void
}

export default function SearchModal({ results = [], activeIndex = 0, onActiveIndex, onSelect }: SearchModalProps) {
  const { t } = useI18n()
  const navigate = useNavigate()

  const handleSelect = (result: SearchResult) => {
    onSelect?.()
    navigate(result.link)
  }

  return (
    <>
      {results.map((result, index) => (
        <button
          key={`${result.type}-${result.id}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          data-active={index === activeIndex}
          className={`admin-command-palette__item${index === activeIndex ? ' is-active' : ''}`}
          onClick={() => handleSelect(result)}
          onMouseEnter={() => onActiveIndex?.(index)}
          onFocus={() => onActiveIndex?.(index)}
        >
          <span aria-hidden>{TYPE_ICONS[result.type]}</span>
          <span>
            {result.title}
            <small className="admin-command-palette__subtitle">{result.subtitle}</small>
          </span>
          <small>{t(TYPE_LABEL_KEYS[result.type])}</small>
        </button>
      ))}
    </>
  )
}
