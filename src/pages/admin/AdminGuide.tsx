import PageHeader from '../../components/admin/ui/PageHeader'
import './OrganisationSysteme.css'
import React, { useState } from 'react'

import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface GuideSection {
  id: string
  icon: string
  title: MessageKey
  content: React.ReactNode
}

const Section = ({ section, isOpen, toggle }: { section: GuideSection; isOpen: boolean; toggle: () => void }) => {
  const { t } = useI18n()
  return (
    <div
      style={{
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      <button
        onClick={toggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '18px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-primary)',
          fontSize: 16,
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>{section.icon}</span>
        <span style={{ flex: 1 }}>{t(section.title)}</span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div
          style={{
            padding: '0 20px 20px',
            color: 'var(--text-secondary)',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          {section.content}
        </div>
      )}
    </div>
  )
}

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      background: 'rgba(var(--primary-rgb), 0.12)',
      color: 'var(--primary)',
      padding: '2px 8px',
      borderRadius: 'var(--r-sm)',
      fontSize: 12,
      fontWeight: 600,
      border: '1px solid rgba(var(--primary-rgb), 0.25)',
    }}
  >
    {children}
  </span>
)

type Key = MessageKey

/** Une entrée de liste : texte simple, « libellé : texte », libellé + sous-liste, ou l'enchaînement des étapes CRM. */
type GuideItem = Key | [Key, Key] | { label: Key; sub: Key[] } | 'stages'

/** Un bloc de contenu : intertitre, liste ou ligne d'accès (les chemins sont repérés par [[…]]). */
type GuideBlock = { heading: Key } | { list: GuideItem[] } | { access: Key }

interface GuideSectionDef {
  id: string
  icon: string
  title: Key
  blocks: GuideBlock[]
}

const STAGES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']

/** Découpe un texte sur les marqueurs [[…]] et met en forme chaque segment repéré. */
const Rich = ({ text }: { text: string }) => (
  <>{text.split(/\[\[(.+?)\]\]/g).map((part, i) => (i % 2 === 1 ? <Kbd key={i}>{part}</Kbd> : part))}</>
)

const GuideEntry = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <>
    <strong>{label}</strong>
    {children}
  </>
)

const sectionDefs: GuideSectionDef[] = [
  {
    id: 'dashboard',
    icon: '\u{1F4CA}',
    title: 'adminOps.guide.dashboard.title',
    blocks: [
      {
        list: [
          'adminOps.guide.dashboard.i1',
          'adminOps.guide.dashboard.i2',
          'adminOps.guide.dashboard.i3',
          'adminOps.guide.dashboard.i4',
          'adminOps.guide.dashboard.i5',
          'adminOps.guide.dashboard.i6',
          'adminOps.guide.dashboard.i7',
        ],
      },
    ],
  },
  {
    id: 'clients',
    icon: '\u{1F465}',
    title: 'adminOps.guide.clients.title',
    blocks: [
      { heading: 'adminOps.guide.clients.heading' },
      {
        list: [
          ['adminOps.guide.clients.createLabel', 'adminOps.guide.clients.createBody'],
          ['adminOps.guide.clients.editLabel', 'adminOps.guide.clients.editBody'],
          ['adminOps.guide.clients.recordLabel', 'adminOps.guide.clients.recordBody'],
          ['adminOps.guide.clients.impersonateLabel', 'adminOps.guide.clients.impersonateBody'],
          ['adminOps.guide.clients.resetLabel', 'adminOps.guide.clients.resetBody'],
          'adminOps.guide.clients.search',
        ],
      },
      { access: 'adminOps.guide.clients.access' },
    ],
  },
  {
    id: 'crm',
    icon: '\u{1F4C8}',
    title: 'adminOps.guide.crm.title',
    blocks: [
      { heading: 'adminOps.guide.crm.pipelineHeading' },
      {
        list: [
          'stages',
          ['adminOps.guide.crm.dragLabel', 'adminOps.guide.crm.dragBody'],
          ['adminOps.guide.crm.convertLabel', 'adminOps.guide.crm.convertBody'],
          ['adminOps.guide.crm.scoringLabel', 'adminOps.guide.crm.scoringBody'],
          ['adminOps.guide.crm.temperatureLabel', 'adminOps.guide.crm.temperatureBody'],
          ['adminOps.guide.crm.alertsLabel', 'adminOps.guide.crm.alertsBody'],
          ['adminOps.guide.crm.roundRobinLabel', 'adminOps.guide.crm.roundRobinBody'],
        ],
      },
      { heading: 'adminOps.guide.crm.settingsHeading' },
      {
        list: ['adminOps.guide.crm.s1', 'adminOps.guide.crm.s2', 'adminOps.guide.crm.s3', 'adminOps.guide.crm.s4'],
      },
      { access: 'adminOps.guide.crm.access' },
    ],
  },
  {
    id: 'projects',
    icon: '\u{1F4C1}',
    title: 'adminOps.guide.projects.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.projects.createLabel', 'adminOps.guide.projects.createBody'],
          ['adminOps.guide.projects.sectionsLabel', 'adminOps.guide.projects.sectionsBody'],
          ['adminOps.guide.projects.itemsLabel', 'adminOps.guide.projects.itemsBody'],
          {
            label: 'adminOps.guide.projects.tasksLabel',
            sub: [
              'adminOps.guide.projects.tasks1',
              'adminOps.guide.projects.tasks2',
              'adminOps.guide.projects.tasks3',
              'adminOps.guide.projects.tasks4',
            ],
          },
          ['adminOps.guide.projects.progressLabel', 'adminOps.guide.projects.progressBody'],
          ['adminOps.guide.projects.pdfLabel', 'adminOps.guide.projects.pdfBody'],
          'adminOps.guide.projects.clientView',
        ],
      },
      { access: 'adminOps.guide.projects.access' },
    ],
  },
  {
    id: 'billing',
    icon: '\u{1F4B3}',
    title: 'adminOps.guide.billing.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.billing.quotesLabel', 'adminOps.guide.billing.quotesBody'],
          ['adminOps.guide.billing.invoicesLabel', 'adminOps.guide.billing.invoicesBody'],
          ['adminOps.guide.billing.numberingLabel', 'adminOps.guide.billing.numberingBody'],
          ['adminOps.guide.billing.vatLabel', 'adminOps.guide.billing.vatBody'],
          ['adminOps.guide.billing.statusLabel', 'adminOps.guide.billing.statusBody'],
          ['adminOps.guide.billing.pdfLabel', 'adminOps.guide.billing.pdfBody'],
          'adminOps.guide.billing.clientView',
        ],
      },
    ],
  },
  {
    id: 'tickets',
    icon: '\u{1F3AB}',
    title: 'adminOps.guide.tickets.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.tickets.typesLabel', 'adminOps.guide.tickets.typesBody'],
          ['adminOps.guide.tickets.prioritiesLabel', 'adminOps.guide.tickets.prioritiesBody'],
          ['adminOps.guide.tickets.workflowLabel', 'adminOps.guide.tickets.workflowBody'],
          ['adminOps.guide.tickets.repliesLabel', 'adminOps.guide.tickets.repliesBody'],
          ['adminOps.guide.tickets.archiveLabel', 'adminOps.guide.tickets.archiveBody'],
          ['adminOps.guide.tickets.kpiLabel', 'adminOps.guide.tickets.kpiBody'],
          'adminOps.guide.tickets.fab',
        ],
      },
    ],
  },
  {
    id: 'team',
    icon: '\u{1F469}\u200D\u{1F4BB}',
    title: 'adminOps.guide.team.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.team.tableLabel', 'adminOps.guide.team.tableBody'],
          {
            label: 'adminOps.guide.team.briefsLabel',
            sub: ['adminOps.guide.team.briefs1', 'adminOps.guide.team.briefs2', 'adminOps.guide.team.briefs3'],
          },
          ['adminOps.guide.team.toolsLabel', 'adminOps.guide.team.toolsBody'],
          ['adminOps.guide.team.recordsLabel', 'adminOps.guide.team.recordsBody'],
          'adminOps.guide.team.views',
        ],
      },
    ],
  },
  {
    id: 'qualiopi',
    icon: '\u2705',
    title: 'adminOps.guide.qualiopi.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.qualiopi.indicatorsLabel', 'adminOps.guide.qualiopi.indicatorsBody'],
          'adminOps.guide.qualiopi.perIndicator',
          {
            label: 'adminOps.guide.qualiopi.surveysLabel',
            sub: [
              'adminOps.guide.qualiopi.surveys1',
              'adminOps.guide.qualiopi.surveys2',
              'adminOps.guide.qualiopi.surveys3',
            ],
          },
          'adminOps.guide.qualiopi.dashboard',
        ],
      },
    ],
  },
  {
    id: 'messaging',
    icon: '\u{1F4AC}',
    title: 'adminOps.guide.messaging.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.messaging.projectLabel', 'adminOps.guide.messaging.projectBody'],
          'adminOps.guide.messaging.direct',
          'adminOps.guide.messaging.attachments',
          'adminOps.guide.messaging.notifications',
          'adminOps.guide.messaging.history',
          'adminOps.guide.messaging.clientReply',
        ],
      },
    ],
  },
  {
    id: 'admins',
    icon: '\u{1F6E1}\uFE0F',
    title: 'adminOps.guide.admins.title',
    blocks: [
      { heading: 'adminOps.guide.admins.rolesHeading' },
      {
        list: [
          'adminOps.guide.admins.roleSuper',
          'adminOps.guide.admins.roleContributor',
          'adminOps.guide.admins.roleHr',
          'adminOps.guide.admins.roleViewer',
        ],
      },
      { heading: 'adminOps.guide.admins.featuresHeading' },
      {
        list: [
          ['adminOps.guide.admins.permissionsLabel', 'adminOps.guide.admins.permissionsBody'],
          ['adminOps.guide.admins.impersonationLabel', 'adminOps.guide.admins.impersonationBody'],
          ['adminOps.guide.admins.mfaLabel', 'adminOps.guide.admins.mfaBody'],
          ['adminOps.guide.admins.auditLabel', 'adminOps.guide.admins.auditBody'],
        ],
      },
      { access: 'adminOps.guide.admins.access' },
    ],
  },
  {
    id: 'settings',
    icon: '\u2699\uFE0F',
    title: 'adminOps.guide.settings.title',
    blocks: [
      {
        list: [
          ['adminOps.guide.settings.profileLabel', 'adminOps.guide.settings.profileBody'],
          ['adminOps.guide.settings.passwordLabel', 'adminOps.guide.settings.passwordBody'],
          ['adminOps.guide.settings.themeLabel', 'adminOps.guide.settings.themeBody'],
          ['adminOps.guide.settings.notificationsLabel', 'adminOps.guide.settings.notificationsBody'],
          ['adminOps.guide.settings.backupsLabel', 'adminOps.guide.settings.backupsBody'],
          'adminOps.guide.settings.perAccount',
        ],
      },
    ],
  },
]

const GuideContent = ({ blocks }: { blocks: GuideBlock[] }) => {
  const { t } = useI18n()
  const listMargin = blocks.length === 1 ? 0 : '0 0 12px'

  const renderItem = (item: GuideItem, index: number) => {
    if (item === 'stages') {
      return (
        <li key={index}>
          <GuideEntry label={t('adminOps.guide.crm.stagesLabel')}>
            {t('adminOps.guide.labelSep')}
            {STAGES.map((s) => <Kbd key={s}>{s}</Kbd>).reduce(
              (acc: React.ReactNode[], el, i) => [...acc, i > 0 ? ' \u2192 ' : '', el],
              [],
            )}
          </GuideEntry>
        </li>
      )
    }
    if (typeof item === 'string') {
      return (
        <li key={index}>
          <Rich text={t(item)} />
        </li>
      )
    }
    if (Array.isArray(item)) {
      return (
        <li key={index}>
          <GuideEntry label={t(item[0])}>
            {t('adminOps.guide.labelSep')}
            <Rich text={t(item[1])} />
          </GuideEntry>
        </li>
      )
    }
    return (
      <li key={index}>
        <GuideEntry label={t(item.label)}>
          {t('adminOps.guide.labelColon')}
          <ul>
            {item.sub.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </GuideEntry>
      </li>
    )
  }

  return (
    <>
      {blocks.map((block, i) => {
        if ('heading' in block) {
          return (
            <p key={i} style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t(block.heading)}
            </p>
          )
        }
        if ('list' in block) {
          return (
            <ul key={i} style={{ margin: listMargin, paddingLeft: 20 }}>
              {block.list.map(renderItem)}
            </ul>
          )
        }
        return (
          <p key={i} style={{ margin: '0 0 4px', color: 'var(--text-muted)', fontSize: 13 }}>
            <Rich text={t(block.access)} />
          </p>
        )
      })}
    </>
  )
}

const sections: GuideSection[] = sectionDefs.map((def) => ({
  id: def.id,
  icon: def.icon,
  title: def.title,
  content: <GuideContent blocks={def.blocks} />,
}))

const AdminGuide = () => {
  const { t } = useI18n()
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const toggle = (id: string) => setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }))

  const allOpen = sections.every((s) => openSections[s.id])

  const toggleAll = () => {
    if (allOpen) {
      setOpenSections({})
    } else {
      const all: Record<string, boolean> = {}
      sections.forEach((s) => (all[s.id] = true))
      setOpenSections(all)
    }
  }

  return (
    <div className="portal-container lot-c-page admin-guide-page">
      <div className="portal-card">
        <PageHeader
          eyebrow={t('adminOps.zone.system')}
          title={t('adminOps.guide.title')}
          subtitle={t('adminOps.guide.subtitle')}
          actions={
            <button
              onClick={toggleAll}
              style={{
                padding: '8px 16px',
                background: 'rgba(var(--primary-rgb), 0.1)',
                border: '1px solid rgba(var(--primary-rgb), 0.3)',
                borderRadius: 'var(--r-md)',
                color: 'var(--primary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {allOpen ? t('adminOps.guide.collapseAll') : t('adminOps.guide.expandAll')}
            </button>
          }
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sections.map((section) => (
            <Section
              key={section.id}
              section={section}
              isOpen={!!openSections[section.id]}
              toggle={() => toggle(section.id)}
            />
          ))}
        </div>

        <div
          style={{
            marginTop: 32,
            padding: '16px 20px',
            background: 'rgba(var(--primary-rgb), 0.06)',
            border: '1px solid rgba(var(--primary-rgb), 0.2)',
            borderRadius: 'var(--r-md)',
            color: 'var(--text-muted)',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--text-secondary)' }}>{t('adminOps.guide.helpLabel')}</strong>
          {t('adminOps.guide.helpText')}
        </div>
      </div>
    </div>
  )
}

export default AdminGuide
