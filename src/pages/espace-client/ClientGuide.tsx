import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  FileSignature,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  MessageSquarePlus,
  ShieldCheck,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import './ClientPortal.css'

interface GuideItem {
  key: MessageKey
  sub?: MessageKey[]
}

interface GuideSection {
  id: string
  titleKey: MessageKey
  icon: LucideIcon
  introKey: MessageKey
  items: GuideItem[]
}

/** Rend les segments entourés de `**` en gras, pour garder une phrase entière par clé de traduction. */
const Rich = ({ text }: { text: string }) => (
  <>
    {text
      .split('**')
      .map((part, index) =>
        index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>,
      )}
  </>
)

const listStyle = {
  margin: 0,
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
}

const subListStyle = {
  margin: '6px 0 0',
  paddingLeft: 18,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
}

const SECTIONS: GuideSection[] = [
  {
    id: 'tableau-de-bord',
    titleKey: 'client.guide.dashboard.title',
    icon: LayoutDashboard,
    introKey: 'client.guide.dashboard.intro',
    items: [
      { key: 'client.guide.dashboard.item1' },
      { key: 'client.guide.dashboard.item2' },
      { key: 'client.guide.dashboard.item3' },
    ],
  },
  {
    id: 'projets',
    titleKey: 'client.guide.projects.title',
    icon: FolderKanban,
    introKey: 'client.guide.projects.intro',
    items: [
      { key: 'client.guide.projects.item1' },
      { key: 'client.guide.projects.item2' },
      { key: 'client.guide.projects.item3' },
      { key: 'client.guide.projects.item4' },
      { key: 'client.guide.projects.item5' },
      { key: 'client.guide.projects.item6' },
    ],
  },
  {
    id: 'etapes',
    titleKey: 'client.guide.steps.title',
    icon: ListChecks,
    introKey: 'client.guide.steps.intro',
    items: [
      { key: 'client.guide.steps.item1' },
      {
        key: 'client.guide.steps.item2',
        sub: [
          'client.guide.steps.item2_1',
          'client.guide.steps.item2_2',
          'client.guide.steps.item2_3',
          'client.guide.steps.item2_4',
        ],
      },
      { key: 'client.guide.steps.item3', sub: ['client.guide.steps.item3_1', 'client.guide.steps.item3_2'] },
      { key: 'client.guide.steps.item4' },
      { key: 'client.guide.steps.item5' },
    ],
  },
  {
    id: 'demandes',
    titleKey: 'client.guide.requests.title',
    icon: MessageSquarePlus,
    introKey: 'client.guide.requests.intro',
    items: [
      { key: 'client.guide.requests.item1' },
      { key: 'client.guide.requests.item2' },
      {
        key: 'client.guide.requests.item3',
        sub: [
          'client.guide.requests.item3_1',
          'client.guide.requests.item3_2',
          'client.guide.requests.item3_3',
          'client.guide.requests.item3_4',
          'client.guide.requests.item3_5',
        ],
      },
      { key: 'client.guide.requests.item4' },
      { key: 'client.guide.requests.item5' },
    ],
  },
  {
    id: 'devis',
    titleKey: 'client.guide.quotes.title',
    icon: FileSignature,
    introKey: 'client.guide.quotes.intro',
    items: [
      { key: 'client.guide.quotes.item1' },
      { key: 'client.guide.quotes.item2' },
      { key: 'client.guide.quotes.item3' },
    ],
  },
  {
    id: 'documents',
    titleKey: 'client.guide.documents.title',
    icon: FileText,
    introKey: 'client.guide.documents.intro',
    items: [
      { key: 'client.guide.documents.item1' },
      { key: 'client.guide.documents.item2' },
      { key: 'client.guide.documents.item3' },
    ],
  },
  {
    id: 'fichiers',
    titleKey: 'client.guide.files.title',
    icon: UploadCloud,
    introKey: 'client.guide.files.intro',
    items: [
      { key: 'client.guide.files.item1' },
      { key: 'client.guide.files.item2' },
      { key: 'client.guide.files.item3' },
    ],
  },
  {
    id: 'messages',
    titleKey: 'client.guide.messages.title',
    icon: MessageSquare,
    introKey: 'client.guide.messages.intro',
    items: [
      { key: 'client.guide.messages.item1' },
      { key: 'client.guide.messages.item2' },
      { key: 'client.guide.messages.item3' },
    ],
  },
  {
    id: 'compte',
    titleKey: 'client.guide.account.title',
    icon: ShieldCheck,
    introKey: 'client.guide.account.intro',
    items: [
      { key: 'client.guide.account.item1' },
      { key: 'client.guide.account.item2' },
      { key: 'client.guide.account.item3' },
      { key: 'client.guide.account.item4' },
    ],
  },
]

const STARTER_STEPS: { num: string; titleKey: MessageKey; textKey: MessageKey }[] = [
  { num: '01', titleKey: 'client.guide.start.openTitle', textKey: 'client.guide.start.openText' },
  { num: '02', titleKey: 'client.guide.start.answerTitle', textKey: 'client.guide.start.answerText' },
  { num: '03', titleKey: 'client.guide.start.askTitle', textKey: 'client.guide.start.askText' },
]

const ClientGuide = () => {
  const { t } = useI18n()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ etapes: true })

  const toggle = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="portal-container" style={{ paddingTop: 120 }}>
      <div style={{ marginBottom: 40 }}>
        <Link to="/espace-client" className="client-project-back" style={{ marginBottom: 24, display: 'inline-flex' }}>
          <ArrowLeft size={16} aria-hidden />
          {t('client.guide.back')}
        </Link>

        <h1
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            margin: '24px 0 12px 0',
            lineHeight: 1.2,
          }}
        >
          {t('client.guide.heading')}
        </h1>
        <p
          style={{
            fontSize: '1.05rem',
            color: 'var(--text-secondary)',
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 700,
          }}
        >
          {t('client.guide.lead')}
        </p>
      </div>

      <section
        style={{
          border: '1px solid rgba(var(--primary-rgb), 0.3)',
          background: 'rgba(var(--primary-rgb), 0.06)',
          padding: '24px 24px 8px',
          marginBottom: 32,
        }}
      >
        <h2
          style={{
            margin: '0 0 4px',
            fontSize: '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--primary-light)',
          }}
        >
          {t('client.guide.startTitle')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 20,
            marginTop: 18,
          }}
        >
          {STARTER_STEPS.map((step) => (
            <div key={step.num} style={{ paddingBottom: 16 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  letterSpacing: '0.1em',
                  color: 'var(--primary)',
                  marginBottom: 6,
                }}
              >
                {step.num}
              </span>
              <strong
                style={{
                  display: 'block',
                  fontSize: '0.95rem',
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                }}
              >
                {t(step.titleKey)}
              </strong>
              <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {t(step.textKey)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
        {SECTIONS.map((section) => {
          const isOpen = !!openSections[section.id]
          const Icon = section.icon
          return (
            <div
              key={section.id}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isOpen ? 'rgba(var(--primary-rgb), 0.35)' : 'var(--border-color)'}`,
                transition: 'border-color 0.2s ease',
              }}
            >
              <button
                type="button"
                onClick={() => toggle(section.id)}
                aria-expanded={isOpen}
                aria-controls={`guide-${section.id}`}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '20px 24px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <Icon size={20} color="var(--primary)" style={{ flexShrink: 0 }} aria-hidden />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {t(section.titleKey)}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {t(section.introKey)}
                  </span>
                </span>
                <ChevronDown
                  size={20}
                  color="var(--text-muted)"
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s ease',
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <div
                  id={`guide-${section.id}`}
                  style={{
                    padding: '0 24px 24px 24px',
                    fontSize: '0.95rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.7,
                  }}
                >
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
                    <ul style={listStyle}>
                      {section.items.map((item) => (
                        <li key={item.key}>
                          <Rich text={t(item.key)} />
                          {item.sub && (
                            <ul style={subListStyle}>
                              {item.sub.map((subKey) => (
                                <li key={subKey}>
                                  <Rich text={t(subKey)} />
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px',
          background: 'rgba(var(--primary-rgb), 0.06)',
          border: '1px solid rgba(var(--primary-rgb), 0.15)',
          marginBottom: 48,
        }}
      >
        <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>
          {t('client.guide.footerTitle')}
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>{t('client.guide.footerBody')}</p>
      </div>
    </div>
  )
}

export default ClientGuide
