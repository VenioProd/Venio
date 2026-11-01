import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../../context/I18nContext'
import { useDocumentVisible } from '../../../hooks/useDocumentVisible'
import { useInView } from '../../../hooks/useInView'
import { usePrefersReducedMotion } from '../../../hooks/usePrefersReducedMotion'
import './mockups.css'

export interface PlatformMockProps {
  className?: string
}

const navigation = [
  { key: 'pubHome.sys.pfNavDashboard', path: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  {
    key: 'pubHome.sys.pfNavClients',
    path: 'M12.2 8a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0ZM3 19c.8-3 3-4.5 6-4.5s5.2 1.5 6 4.5M16 5a3 3 0 0 1 0 6M18 14.5c1.6.6 2.6 2 3 4.5',
  },
  {
    key: 'pubHome.sys.pfNavFiles',
    path: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z',
  },
  {
    key: 'pubHome.sys.pfNavPlanning',
    path: 'M5.5 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3.5 10h17M8 3v4M16 3v4',
  },
  { key: 'pubHome.sys.pfNavDocs', path: 'M6 3h8l4 4v14H6ZM14 3v4h4M9 12h6M9 16h6' },
  { key: 'pubHome.sys.pfNavAccess', path: 'M12 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM11 12l9-9M17 6l3 3M15 8l2 2' },
] as const

const kpis = [
  { key: 'pubHome.sys.pfKpiFiles', width: '55%', color: '#a78bfa', path: 'M0 20 20 17 40 18 60 11 80 12 100 5' },
  { key: 'pubHome.sys.pfKpiClients', width: '40%', color: '#38bdf8', path: 'M0 18 20 19 40 13 60 14 80 8 100 7' },
  { key: 'pubHome.sys.pfKpiDelays', width: '48%', color: '#5eead4', path: 'M0 8 20 10 40 9 60 14 80 15 100 18' },
] as const

const clients = [
  { key: 'pubHome.sys.pfActive', color: '#a78bfa', width: '100%' },
  { key: 'pubHome.sys.pfOngoing', color: '#38bdf8', width: '80%' },
  { key: 'pubHome.sys.pfActive', color: '#5eead4', width: '65%' },
  { key: 'pubHome.sys.pfReminder', color: '#fbbf24', width: '75%' },
] as const

const columns = ['pubHome.sys.pfTodo', 'pubHome.sys.pfDoing', 'pubHome.sys.pfDone'] as const
const colors = ['#a78bfa', '#38bdf8', '#5eead4'] as const

export default function PlatformMock({ className = '' }: PlatformMockProps) {
  const { t } = useI18n()
  const gradientId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, threshold: 0.1 })
  const inView = useInView(ref, { threshold: 0.1 })
  const reduced = usePrefersReducedMotion()
  const tabVisible = useDocumentVisible()
  const [step, setStep] = useState(0)
  const running = seen && inView && tabVisible && !reduced

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setStep((value) => (value + 1) % 3), 2200)
    return () => window.clearInterval(timer)
  }, [running])

  const movingColumn = reduced ? 2 : step

  return (
    <div
      ref={ref}
      className={`sy-interface sy-platform ${seen || reduced ? 'sy-mock-ready' : ''} ${reduced ? 'sy-mock-static' : ''} ${className}`}
      role="img"
      aria-label={t('pubHome.sys.pfAria')}
      data-running={running}
    >
      <div className="sy-mock" aria-hidden="true">
        <div className="sy-m-top">
          <span className="sy-dots">
            <i />
            <i />
            <i />
          </span>
          <b>{t('pubHome.sys.pfTitle')}</b>
          <span className="sy-pills">
            <span className="sy-mock-on">{t('pubHome.sys.pfBackOffice')}</span>
            <span>{t('pubHome.sys.pfPortal')}</span>
          </span>
        </div>
        <div className="sy-pf">
          <div className="sy-pf-side">
            <span className="sy-pf-org">
              <i />
              {t('pubHome.sys.pfOrg')}
            </span>
            {navigation.map((item, index) => (
              <span className={`sy-pf-nav ${index === 0 ? 'sy-mock-on' : ''}`} key={item.key}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                >
                  <path d={item.path} />
                </svg>
                {t(item.key)}
              </span>
            ))}
          </div>
          <div className="sy-pf-main">
            <div className="sy-pf-kpi">
              {kpis.map((item) => (
                <div key={item.key}>
                  <small>{t(item.key)}</small>
                  <s style={{ width: item.width }} />
                  <svg viewBox="0 0 100 24" preserveAspectRatio="none" focusable="false">
                    <path d={item.path} stroke={item.color} />
                  </svg>
                </div>
              ))}
            </div>
            <div className="sy-pf-row">
              <div className="sy-pf-card">
                <small>{t('pubHome.sys.pfActivity')}</small>
                <svg className="sy-pf-chart" viewBox="0 0 300 110" preserveAspectRatio="none" focusable="false">
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                      <stop stopColor="#38bdf8" />
                      <stop offset="1" stopColor="#5eead4" />
                    </linearGradient>
                  </defs>
                  <path d="M0 30H300M0 60H300M0 90H300" stroke="rgba(255,255,255,.05)" />
                  <path
                    className="sy-ln"
                    pathLength="1"
                    stroke={`url(#${gradientId})`}
                    d="M0 92C30 88 40 70 70 72S120 86 150 60S200 30 230 40S280 20 300 14"
                  />
                </svg>
              </div>
              <div className="sy-pf-card">
                <small>{t('pubHome.sys.pfClients')}</small>
                <div className="sy-pf-list">
                  {clients.map((client, index) => (
                    <div key={index} style={{ '--k': client.color } as CSSProperties}>
                      <i />
                      <s style={{ width: client.width }} />
                      <em>{t(client.key)}</em>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="sy-pf-card">
              <small>{t('pubHome.sys.pfFiles')}</small>
              <div className="sy-pf-kb">
                {columns.map((key, column) => (
                  <div key={key}>
                    <small>{t(key)}</small>
                    {[0, 1].slice(0, column === 1 ? 2 : 1).map((card) => (
                      <span
                        className="sy-kc"
                        style={{ '--k': colors[column] } as CSSProperties}
                        key={`fixed-${card}`}
                      />
                    ))}
                    {movingColumn === column && (
                      <span
                        className="sy-kc sy-new"
                        style={{ '--k': colors[column] } as CSSProperties}
                        key={`moving-${movingColumn}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sy-phone" aria-hidden="true">
        <div className="sy-sc">
          <span className="sy-nt" />
          <p className="sy-mock-label">{t('pubHome.sys.pfPortal')}</p>
          <div className="sy-st">
            <i className="sy-d" />
            <b className="sy-d" />
            <i className="sy-d" />
            <b />
            <i />
          </div>
          {[0, 1, 2].map((index) => (
            <div className="sy-doc" key={index}>
              <i />
              <span>
                <s />
                <s />
              </span>
            </div>
          ))}
          <span className="sy-bt">{t('pubHome.sys.pfValidate')}</span>
        </div>
      </div>
    </div>
  )
}
