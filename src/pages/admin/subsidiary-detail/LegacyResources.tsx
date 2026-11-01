import type { ReactNode } from 'react'
import {
  Package,
  Wrench,
  Coins,
  FileText,
  BookOpen,
  Paperclip,
  GitFork,
  Globe,
  FlaskConical,
  BarChart3,
  Server,
  Network,
  GitBranch,
  Palette,
  FolderOpen,
  Link2,
  Info,
  Copy,
  Users,
  Mail,
  Phone,
  KeyRound,
} from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import type { Subsidiary, SubsidiaryLinkType } from '../../../types/subsidiary.types'
import SubsidiaryDocuments from '../subsidiaries/SubsidiaryDocuments'
import SubsidiaryCredentials from '../subsidiaries/SubsidiaryCredentials'
import { LINK_TYPE_LABEL_KEYS } from '../subsidiaries/labels'
/** Bloc documentaire — titre, contenu texte (sauts de ligne préservés) + pièces jointes. */
function DossierBlock({
  icon,
  title,
  content,
  accent,
  children,
  hideEmptyHint,
}: {
  icon: ReactNode
  title: string
  content: string
  accent: string
  children?: ReactNode
  hideEmptyHint?: boolean
}) {
  const { t } = useI18n()
  const has = content && content.trim()
  return (
    <div className="sub-dossier-card">
      <h2 className="sub-dossier-title">
        <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
          {icon}
        </span>
        {title}
      </h2>
      {has ? (
        <div className="sub-prose">{content}</div>
      ) : !hideEmptyHint ? (
        <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.emptyDescription')}</p>
      ) : null}
      {children}
    </div>
  )
}

function DossierTab({
  sub,
  accent,
  onDocsChange,
}: {
  sub: Subsidiary
  accent: string
  onDocsChange: (docs: Subsidiary['documents']) => void
}) {
  const { t } = useI18n()
  const docs = sub.documents || []
  const blocks = [
    {
      key: 'product' as const,
      icon: <Package size={16} />,
      title: t('orgs.subsidiary.detail.productTitle'),
      content: sub.productDescription,
    },
    {
      key: 'service' as const,
      icon: <Wrench size={16} />,
      title: t('orgs.subsidiary.detail.serviceTitle'),
      content: sub.serviceDescription,
    },
    {
      key: 'businessModel' as const,
      icon: <Coins size={16} />,
      title: t('orgs.subsidiary.detail.businessModelTitle'),
      content: sub.businessModel,
    },
    {
      key: 'businessPlan' as const,
      icon: <FileText size={16} />,
      title: t('orgs.subsidiary.detail.businessPlanTitle'),
      content: sub.businessPlan,
    },
  ]
  const sections = (sub.sections || []).filter((s) => (s.title && s.title.trim()) || (s.content && s.content.trim()))

  return (
    <div style={{ marginTop: 8 }}>
      {blocks.map((b) => (
        <DossierBlock key={b.key} icon={b.icon} title={b.title} content={b.content} accent={accent}>
          <SubsidiaryDocuments
            subsidiaryId={sub._id}
            category={b.key}
            documents={docs}
            accent={accent}
            onChange={onDocsChange}
          />
        </DossierBlock>
      ))}

      {sections.map((s, i) => (
        <DossierBlock
          key={`sec-${i}`}
          icon={<BookOpen size={16} />}
          title={s.title || t('orgs.subsidiary.detail.sectionFallback')}
          content={s.content}
          accent={accent}
        />
      ))}

      <DossierBlock
        icon={<Paperclip size={16} />}
        title={t('orgs.subsidiary.detail.generalDocuments')}
        content=""
        accent={accent}
        hideEmptyHint
      >
        <SubsidiaryDocuments
          subsidiaryId={sub._id}
          category="general"
          documents={docs}
          accent={accent}
          onChange={onDocsChange}
        />
      </DossierBlock>
    </div>
  )
}

function linkIcon(type: SubsidiaryLinkType) {
  const map: Record<SubsidiaryLinkType, ReactNode> = {
    repo: <GitFork size={16} />,
    production: <Globe size={16} />,
    staging: <FlaskConical size={16} />,
    analytics: <BarChart3 size={16} />,
    hosting: <Server size={16} />,
    dns: <Network size={16} />,
    ci: <GitBranch size={16} />,
    design: <Palette size={16} />,
    docs: <FileText size={16} />,
    drive: <FolderOpen size={16} />,
    other: <Link2 size={16} />,
  }
  return map[type] || <Link2 size={16} />
}

function ContexteTab({
  sub,
  accent,
  onCredsChange,
}: {
  sub: Subsidiary
  accent: string
  onCredsChange: (creds: Subsidiary['credentials']) => void
}) {
  const { t } = useI18n()
  const links = sub.links || []
  const infos = sub.infos || []
  const contacts = sub.contacts || []

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Liens & accès */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <Link2 size={16} />
          </span>
          {t('orgs.subsidiary.detail.linksTitle')}
        </h2>
        {links.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="sub-resource"
                style={{ ['--sub-accent' as string]: accent }}
              >
                <span style={{ color: accent, display: 'inline-flex' }}>{linkIcon(l.type)}</span>
                {l.label || t(LINK_TYPE_LABEL_KEYS[l.type])}
              </a>
            ))}
          </div>
        ) : (
          <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.linksEmpty')}</p>
        )}
      </div>

      {/* Infos */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <Info size={16} />
          </span>
          {t('orgs.subsidiary.detail.infosTitle')}
        </h2>
        {infos.length > 0 ? (
          <div className="sub-infos">
            {infos.map((info, i) => (
              <div key={i} className="sub-info-row">
                <span className="sub-info-key">{info.label}</span>
                <span className="sub-info-val">
                  <code>{info.value}</code>
                  {info.value && (
                    <button
                      type="button"
                      className="sub-icon-btn"
                      onClick={() => copy(info.value)}
                      title={t('orgs.subsidiary.detail.infosCopy')}
                    >
                      <Copy size={12} />
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.infosEmpty')}</p>
        )}
      </div>

      {/* Contacts */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <Users size={16} />
          </span>
          {t('orgs.subsidiary.detail.contactsTitle')}
        </h2>
        {contacts.length > 0 ? (
          <div className="sub-contacts">
            {contacts.map((c, i) => (
              <div key={i} className="sub-contact">
                <div className="sub-contact__name">
                  {c.name}
                  {c.role && <span className="sub-contact__role">{c.role}</span>}
                </div>
                <div className="sub-contact__lines">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="sub-contact__line">
                      <Mail size={12} /> {c.email}
                    </a>
                  )}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="sub-contact__line">
                      <Phone size={12} /> {c.phone}
                    </a>
                  )}
                </div>
                {c.notes && <div className="sub-contact__notes">{c.notes}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="sub-dossier-empty">{t('orgs.subsidiary.detail.contactsEmpty')}</p>
        )}
      </div>

      {/* Coffre d'identifiants */}
      <div className="sub-dossier-card">
        <h2 className="sub-dossier-title">
          <span className="sub-dossier-chip" style={{ ['--sub-accent' as string]: accent }}>
            <KeyRound size={16} />
          </span>
          {t('orgs.subsidiary.detail.credentialsTitle')}
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
            {t('orgs.subsidiary.detail.credentialsHint')}
          </span>
        </h2>
        <SubsidiaryCredentials
          subsidiaryId={sub._id}
          credentials={sub.credentials || []}
          accent={accent}
          onChange={onCredsChange}
        />
      </div>
    </div>
  )
}

export default function LegacyResources({
  sub,
  onChange,
}: {
  sub: Subsidiary
  onChange: (patch: Partial<Subsidiary>) => void
}) {
  return (
    <>
      <DossierTab sub={sub} accent={sub.accentColor} onDocsChange={(documents) => onChange({ documents })} />
      <ContexteTab sub={sub} accent={sub.accentColor} onCredsChange={(credentials) => onChange({ credentials })} />
      {sub.alerts?.map((alert, i) => (
        <p role="status" key={i} className={`dossier-alert ${alert.level}`}>
          {alert.label}
        </p>
      ))}
    </>
  )
}
