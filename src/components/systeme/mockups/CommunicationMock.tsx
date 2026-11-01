import { useId, useRef, type CSSProperties } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { useDocumentVisible } from '../../../hooks/useDocumentVisible'
import { useInView } from '../../../hooks/useInView'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import './mockups.css'

export interface CommunicationMockProps {
  className?: string
}

const events = [
  { day: 1, key: 'pubHome.sys.cmArticle', color: '#a78bfa' },
  { day: 3, key: 'pubHome.sys.cmPost', color: '#38bdf8' },
  { day: 9, key: 'pubHome.sys.cmPost', color: '#38bdf8' },
  { day: 11, key: 'pubHome.sys.cmLetter', color: '#5eead4' },
  { day: 15, key: 'pubHome.sys.cmArticle', color: '#a78bfa' },
  { day: 17, key: 'pubHome.sys.cmPost', color: '#38bdf8' },
] as const

export default function CommunicationMock({ className = '' }: CommunicationMockProps) {
  const { t, locale } = useI18n()
  const gradientId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, threshold: 0.1 })
  const inView = useInView(ref, { threshold: 0.1 })
  const reduced = usePrefersReducedMotion()
  const tabVisible = useDocumentVisible()
  const running = seen && inView && tabVisible && !reduced
  const number = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 })

  return (
    <div
      ref={ref}
      className={`sy-interface sy-cm ${seen || reduced ? 'sy-mock-ready' : ''} ${reduced ? 'sy-mock-static' : ''} ${className}`}
      role="img"
      aria-label={t('pubHome.sys.cmAria')}
      data-running={running}
    >
      <div className="sy-card sy-c-cal" data-depth="10" aria-hidden="true">
        <div className="sy-m-top">
          <span className="sy-dots">
            <i />
            <i />
            <i />
          </span>
          <b>{t('pubHome.sys.cmCalendar')}</b>
        </div>
        <div className="sy-grid">
          {(
            [
              'pubHome.sys.cmMon',
              'pubHome.sys.cmTue',
              'pubHome.sys.cmWed',
              'pubHome.sys.cmThu',
              'pubHome.sys.cmFri',
            ] as const
          ).map((key) => (
            <span className="sy-dh" key={key}>
              {t(key)}
            </span>
          ))}
          {Array.from({ length: 15 }, (_, index) => {
            const day = index + 1 + Math.floor(index / 5) * 2
            const eventIndex = events.findIndex((event) => event.day === day)
            const event = events[eventIndex]
            return (
              <span className="sy-dd" key={day}>
                <small>{number.format(day)}</small>
                {event && (
                  <span className="sy-ev" style={{ '--k': event.color, '--j': eventIndex } as CSSProperties}>
                    {t(event.key)}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      </div>
      <div className="sy-card sy-c-brand" data-depth="24" aria-hidden="true">
        <p className="sy-mock-label">{t('pubHome.sys.cmBrand')}</p>
        <div className="sy-mk">
          <i />
          {/* Spécimen typographique décoratif, dessiné sans texte éditorial. */}
          <svg className="sy-cm-type" viewBox="0 0 60 46" fill={`url(#${gradientId})`} focusable="false">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <stop stopColor="#c4b5fd" />
                <stop offset=".45" stopColor="#7dd3fc" />
                <stop offset="1" stopColor="#5eead4" />
              </linearGradient>
            </defs>
            <path
              fillRule="evenodd"
              d="M1 39 13 7h7l12 32h-6l-3-9H10l-3 9Zm11-14h9l-4.5-13ZM37 18c3-2 6-3 10-3 7 0 10 4 10 10v14h-5v-3c-2 3-5 4-8 4-6 0-9-3-9-8 0-6 5-8 12-8h5c0-4-2-5-5-5s-5 1-8 3Zm15 10h-5c-5 0-7 1-7 4 0 2 2 4 5 4 4 0 7-3 7-6Z"
            />
          </svg>
        </div>
        <div className="sy-sw">
          {['#0b0d16', '#8b5cf6', '#38bdf8', '#5eead4', '#eef0f7'].map((color) => (
            <span key={color} style={{ '--k': color } as CSSProperties} />
          ))}
        </div>
        <div className="sy-ty">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="sy-card sy-c-post" data-depth="40" aria-hidden="true">
        <div className="sy-ph">
          <i />
          <div>
            <s />
            <s />
          </div>
        </div>
        <div className="sy-img" />
        <div className="sy-ac">
          <svg viewBox="0 0 24 24" fill="currentColor" focusable="false">
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
          </svg>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M4 5h16v11H9l-5 4Z" />
          </svg>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            focusable="false"
          >
            <path d="M21 3 10 14M21 3l-7 18-4-7-7-4Z" />
          </svg>
        </div>
        <div className="sy-tx">
          <s />
          <s />
        </div>
      </div>
    </div>
  )
}
