import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { useDocumentVisible } from '../../../hooks/useDocumentVisible'
import { useInView } from '../../../hooks/useInView'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import './mockups.css'

export interface RoadmapMockProps {
  className?: string
}

const rows = [
  { key: 'pubHome.sys.rmRow1', left: '0%', width: '25%', color: '#a78bfa' },
  { key: 'pubHome.sys.rmRow2', left: '12.5%', width: '37.5%', color: '#818cf8' },
  { key: 'pubHome.sys.rmRow3', left: '37.5%', width: '25%', color: '#60a5fa' },
  { key: 'pubHome.sys.rmRow4', left: '50%', width: '25%', color: '#38bdf8' },
  { key: 'pubHome.sys.rmRow5', left: '62.5%', width: '37.5%', color: '#5eead4' },
  { key: 'pubHome.sys.rmRow6', left: '75%', width: '25%', color: '#34d399' },
] as const

const decisions = ['pubHome.sys.rmDec1', 'pubHome.sys.rmDec2', 'pubHome.sys.rmDec3', 'pubHome.sys.rmDec4'] as const

export default function RoadmapMock({ className = '' }: RoadmapMockProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, threshold: 0.1 })
  const inView = useInView(ref, { threshold: 0.1 })
  const reduced = usePrefersReducedMotion()
  const tabVisible = useDocumentVisible()
  const [step, setStep] = useState(0)
  const running = seen && inView && tabVisible && !reduced

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setStep((value) => (value + 1) % (decisions.length + 1)), 1500)
    return () => window.clearInterval(timer)
  }, [running])

  const checked = reduced ? decisions.length : Math.min(step, decisions.length)

  return (
    <div
      ref={ref}
      className={`sy-interface sy-roadmap sy-mock ${seen || reduced ? 'sy-mock-ready' : ''} ${reduced ? 'sy-mock-static' : ''} ${className}`}
      role="img"
      aria-label={t('pubHome.sys.rmAria')}
      data-running={running}
    >
      <div aria-hidden="true">
        <div className="sy-m-top">
          <span className="sy-dots">
            <i />
            <i />
            <i />
          </span>
          <b>{t('pubHome.sys.rmTitle')}</b>
          <span className="sy-pills">
            <span className="sy-mock-on">{t('pubHome.sys.rmWeeks')}</span>
            <span>{t('pubHome.sys.rmDecisions')}</span>
          </span>
        </div>
        <div className="sy-rm">
          <div className="sy-rm-g">
            <div className="sy-rm-h">
              <span />
              <div>
                {Array.from({ length: 8 }, (_, n) => (
                  <span key={n}>{t('pubHome.sys.rmWeek', { n: n + 1 })}</span>
                ))}
              </div>
            </div>
            {rows.map((row, index) => (
              <div className="sy-rm-r" key={row.key}>
                <span>{t(row.key)}</span>
                <span className="sy-tr">
                  <i
                    className={`sy-bar ${index === rows.length - 1 ? 'sy-dash' : ''}`}
                    style={{ '--l': row.left, '--w': row.width, '--k': row.color, '--j': index } as CSSProperties}
                  />
                </span>
              </div>
            ))}
            <span className="sy-rm-today" style={{ '--p': reduced ? 0.6 : 0.08 + step * 0.2 } as CSSProperties} />
          </div>
          <div className="sy-rm-d">
            <p className="sy-mock-label">{t('pubHome.sys.rmDecisions')}</p>
            {decisions.map((key, index) => (
              <span className={`sy-chk ${index < checked ? 'sy-ok' : ''}`} key={key}>
                <i />
                {t(key)}
              </span>
            ))}
            <hr />
            <p className="sy-mock-label">{t('pubHome.sys.rmStopTitle')}</p>
            {(['pubHome.sys.rmStop1', 'pubHome.sys.rmStop2'] as const).map((key) => (
              <span className="sy-stop" key={key}>
                <i />
                <s>{t(key)}</s>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
