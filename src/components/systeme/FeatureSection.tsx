import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import './systeme.css'

export interface FeatureSectionProps {
  id: string
  color: string
  eyebrow: string
  tag?: string
  title: string
  accent: string
  sub: string
  chips: string[]
  delivered: string
  notFor: string
  cta: { to: string; label: string }
  reverse?: boolean
  visual: ReactNode
  titleId?: string
}

export default function FeatureSection({
  id,
  color,
  eyebrow,
  tag,
  title,
  accent,
  sub,
  chips,
  delivered,
  notFor,
  cta,
  reverse = false,
  visual,
  titleId,
}: FeatureSectionProps) {
  const { t } = useI18n()
  const uid = useId()
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered
  const panelId = `${uid}-details`
  const headingId = titleId ?? `${uid}-title`
  const internal = /^\/(?!\/)/.test(cta.to)
  const external = /^(?:https?:)?\/\//i.test(cta.to)
  const linkContent = (
    <>
      {cta.label}
      <span className="sy-arr" aria-hidden="true">
        {external ? '↗' : '→'}
      </span>
    </>
  )

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`sy-feature${reverse ? ' sy-feature--reverse' : ''}`}
      style={{ '--c': color } as CSSProperties}
    >
      <div
        className={`sy-feature__text sy-rv${open ? ' sy-is-open' : ''}`}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'touch' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches)
            setHovered(true)
        }}
        onPointerLeave={() => setHovered(false)}
        onPointerCancel={() => setHovered(false)}
      >
        <p className="sy-eyebrow">
          {eyebrow}
          {tag && <span className="sy-tag">{tag}</span>}
        </p>
        <h2 id={headingId} className="sy-h2">
          {title} <span className="sy-gt">{accent}</span>
        </h2>
        <p className="sy-sub">{sub}</p>
        <ul className="sy-chips">
          {chips.map((chip, index) => (
            <li key={index}>{chip}</li>
          ))}
        </ul>
        <div id={panelId} className="sy-feature__more" aria-hidden={!open}>
          <div>
            <p>
              <span>{t('pubHome.sys.delivered')}</span>
              {delivered}
            </p>
            <p className="sy-feature__not-for">
              <span>{t('pubHome.sys.notFor')}</span>
              {notFor}
            </p>
          </div>
        </div>
        <div className="sy-feature__actions">
          {internal ? (
            <Link className="sy-btn sy-btn--primary" to={cta.to}>
              {linkContent}
            </Link>
          ) : (
            <a
              className="sy-btn sy-btn--primary"
              href={cta.to}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {linkContent}
            </a>
          )}
          <button
            type="button"
            className="sy-more-button"
            aria-controls={panelId}
            aria-expanded={open}
            onClick={() => {
              setPinned(!open)
              setHovered(false)
            }}
          >
            {t('pubHome.sys.details')}
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
      <div className="sy-feature__visual sy-rv">{visual}</div>
    </section>
  )
}
