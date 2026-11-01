import { useId } from 'react'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import './systeme.css'

const paths = [
  'M8 11a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M11 12l9-9 M17 6l3 3 M15 8l2 2',
  'M4 20l4-1 11-11-3-3L5 16z M14 6l3 3',
  'M7 8.5a3.5 3.5 0 1 0 0 7c3 0 7-7 10-7a3.5 3.5 0 1 1 0 7c-3 0-7-7-10-7z',
]

export default function Guarantees() {
  const { t } = useI18n()
  const uid = useId()
  return (
    <div className="sy-guarantees sy-glass sy-rv">
      <span className="sy-mono">{t('pubHome.sys.guarLabel')}</span>
      {paths.map((path, index) => (
        <div key={path} className="sy-guarantee" tabIndex={0} aria-describedby={`${uid}-${index}`}>
          <i aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d={path} />
            </svg>
          </i>
          {t(`pubHome.sys.guar${index + 1}` as MessageKey)}
          <span id={`${uid}-${index}`} className="sy-guarantee__tip" role="tooltip">
            {t(`pubHome.sys.guar${index + 1}Tip` as MessageKey)}
          </span>
        </div>
      ))}
    </div>
  )
}
