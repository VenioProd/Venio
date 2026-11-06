import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import { intlLocale } from '../../../i18n'
import SafeMarkdown from '../../../components/admin/SafeMarkdown'
import {
  PROJECT_SHEET_MARKDOWN_KEYS,
  type ProjectSheet,
  type ProjectSheetMarkdownKey,
  type ProjectSheetMeta,
} from '../../../types/projectSheet.types'
import { API_BASE, apiErrorInfo, psKey, safeHttpUrl } from './shared'
import { ReviewBadge, SheetMark, StatusBadge, useFieldLabel } from './parts'
import EditableSection, { SheetConflictError } from './Section'
import DemoAccesses from './DemoAccesses'
import {
  IdentityEditor,
  LinksEditor,
  MarkdownEditor,
  OneLinerEditor,
  TeamEditor,
  identityDraft,
  identityPatch,
  type IdentityDraft,
  type LinksDraft,
  type TeamDraft,
} from './editors'
import './ProjectSheets.css'

/** Ordre d'affichage des sections et du sommaire. */
const SECTION_ORDER = [
  'identite',
  'oneLiner',
  'whatWeDo',
  'audience',
  'positioning',
  'brandVoice',
  'offers',
  'keyFigures',
  'stack',
  'links',
  'team',
  'roadmap',
  'decisions',
  'prospectFaq',
  'glossary',
  'demo',
  'history',
] as const

const isMarkdownKey = (key: string): key is ProjectSheetMarkdownKey =>
  (PROJECT_SHEET_MARKDOWN_KEYS as readonly string[]).includes(key)

/** Lien interne (chemin) ou externe (http/https) ; sinon texte brut. */
function SmartLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith('/') && !href.startsWith('//')) return <Link to={href}>{children}</Link>
  const safe = safeHttpUrl(href)
  if (safe)
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  return <span>{children}</span>
}

export default function ProjectSheetDetail() {
  const { t } = useI18n()
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const fieldLabel = useFieldLabel()
  const [sheet, setSheet] = useState<ProjectSheet | null>(null)
  const [meta, setMeta] = useState<ProjectSheetMeta | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notFound' | 'error'>('loading')
  const [tocOpen, setTocOpen] = useState(false)

  const load = useCallback(() => {
    setState('loading')
    apiFetch<{ sheet: ProjectSheet }>(API_BASE + '/' + encodeURIComponent(slug))
      .then((data) => {
        setSheet(data.sheet)
        setState('ready')
      })
      .catch((err) => {
        setState(apiErrorInfo(err).status === 404 ? 'notFound' : 'error')
      })
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const canEdit = !!sheet?.canEdit
  useEffect(() => {
    if (!canEdit) return
    let alive = true
    apiFetch<ProjectSheetMeta>(API_BASE + '/meta')
      .then((data) => {
        if (alive) setMeta(data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [canEdit])

  const sheetId = sheet?._id
  const baseUpdatedAt = sheet?.updatedAt
  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!sheetId) return
      try {
        const res = await apiFetch<{ sheet: ProjectSheet }>(API_BASE + '/' + sheetId, {
          method: 'PATCH',
          body: JSON.stringify({ ...patch, baseUpdatedAt }),
        })
        setSheet(res.sheet)
        if (res.sheet.slug && res.sheet.slug !== slug) navigate('/admin/projets/fiches/' + res.sheet.slug, { replace: true })
      } catch (err) {
        const info = apiErrorInfo(err)
        if (info.code === 'SHEET_CONFLICT' || info.status === 409) throw new SheetConflictError(t(psKey('edit.conflict')))
        throw new Error(info.message || t(psKey('edit.saveError')))
      }
    },
    [sheetId, baseUpdatedAt, slug, navigate, t],
  )

  if (state === 'loading' && !sheet) return <p role="status" className="ps-page">{t(psKey('detail.loading'))}</p>
  if (state === 'notFound')
    return (
      <div className="ps-page">
        <p role="alert">{t(psKey('detail.notFound'))}</p>
        <Link to="/admin/projets/fiches">{t(psKey('detail.back'))}</Link>
      </div>
    )
  if (state === 'error' || !sheet)
    return (
      <div className="ps-page">
        <p role="alert" className="ps-error">{t(psKey('detail.error'))}</p>
        <Link to="/admin/projets/fiches">{t(psKey('detail.back'))}</Link>
      </div>
    )

  const title = (id: string) => t(psKey('section.' + id))
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  const websites = sheet.websites.filter((w) => w.url)
  const common = { canEdit: sheet.canEdit, save, onReload: load }
  const computedLinks = [
    sheet.crm && { key: 'crm', href: sheet.crm.href, label: t(psKey('links.crm'), { open: sheet.crm.openLeads, won: sheet.crm.wonLeads }) },
    sheet.devProject?.href && {
      key: 'dev',
      href: sheet.devProject.href,
      label: t(psKey('links.devTracker'), { name: sheet.devProject.name }),
    },
    sheet.subsidiaryHref && { key: 'sub', href: sheet.subsidiaryHref, label: t(psKey('links.subsidiary')) },
  ].filter(Boolean) as { key: string; href: string; label: string }[]
  const visibleLinks = sheet.links.filter((l) => l.url)

  const renderSection = (id: (typeof SECTION_ORDER)[number]) => {
    if (isMarkdownKey(id)) {
      return (
        <EditableSection<string>
          key={id}
          id={id}
          title={title(id)}
          {...common}
          empty={!sheet![id].trim()}
          makeDraft={() => sheet![id]}
          renderEditor={(draft, setDraft) => <MarkdownEditor label={title(id)} value={draft} onChange={setDraft} />}
          toPatch={(draft) => ({ [id]: draft })}
        >
          <SafeMarkdown source={sheet![id]} />
        </EditableSection>
      )
    }
    switch (id) {
      case 'identite':
        return (
          <EditableSection<IdentityDraft>
            key={id}
            id={id}
            title={title(id)}
            {...common}
            makeDraft={() => identityDraft(sheet)}
            renderEditor={(draft, setDraft) => <IdentityEditor draft={draft} onChange={setDraft} meta={meta} />}
            toPatch={identityPatch}
            validate={(draft) => (draft.name.trim() ? null : t(psKey('list.nameRequired')))}
          >
            <dl className="ps-dl">
              <div>
                <dt>{t(psKey('form.name'))}</dt>
                <dd>{sheet.name}</dd>
              </div>
              <div>
                <dt>{t(psKey('form.logoUrl'))}</dt>
                <dd>{sheet.logoUrl || '—'}</dd>
              </div>
              <div>
                <dt>{t(psKey('form.accentColor'))}</dt>
                <dd>{sheet.accentColor || '—'}</dd>
              </div>
              <div>
                <dt>{t(psKey('form.status'))}</dt>
                <dd>
                  <StatusBadge status={sheet.status} />
                </dd>
              </div>
              <div>
                <dt>{t(psKey('form.reviewStatus'))}</dt>
                <dd>
                  <ReviewBadge review={sheet.reviewStatus} showValidated />
                </dd>
              </div>
              <div>
                <dt>{t(psKey('form.legalEntity'))}</dt>
                <dd>{sheet.legalEntity ? t(psKey('entity.' + sheet.legalEntity)) : t(psKey('detail.notSet'))}</dd>
              </div>
              <div>
                <dt>{t(psKey('form.leadProject'))}</dt>
                <dd>{sheet.leadProject || t(psKey('detail.notSet'))}</dd>
              </div>
              <div>
                <dt>{t(psKey('form.websites'))}</dt>
                <dd>{websites.length ? websites.map((w) => w.label || w.url).join(', ') : t(psKey('detail.noWebsites'))}</dd>
              </div>
              <div>
                <dt>{t(psKey('form.archived'))}</dt>
                <dd>{sheet.archived ? t(psKey('list.archived')) : '—'}</dd>
              </div>
            </dl>
          </EditableSection>
        )
      case 'oneLiner':
        return (
          <EditableSection<string>
            key={id}
            id={id}
            title={title(id)}
            {...common}
            empty={!sheet.oneLiner.trim()}
            makeDraft={() => sheet.oneLiner}
            renderEditor={(draft, setDraft) => <OneLinerEditor value={draft} onChange={setDraft} />}
            toPatch={(draft) => ({ oneLiner: draft })}
          >
            <p className="ps-oneliner">{sheet.oneLiner}</p>
          </EditableSection>
        )
      case 'links':
        return (
          <EditableSection<LinksDraft>
            key={id}
            id={id}
            title={title(id)}
            {...common}
            empty={visibleLinks.length === 0 && computedLinks.length === 0}
            makeDraft={() => ({ links: sheet.links.map((l) => ({ ...l })), devProject: sheet.devProject?._id ?? '' })}
            renderEditor={(draft, setDraft) => <LinksEditor draft={draft} onChange={setDraft} meta={meta} />}
            toPatch={(draft) => ({
              links: draft.links.filter((l) => l.url.trim()).map((l) => ({ type: l.type, label: l.label.trim(), url: l.url.trim() })),
              devProject: draft.devProject || null,
            })}
          >
            {visibleLinks.length > 0 && (
              <ul className="ps-links">
                {visibleLinks.map((link, i) => (
                  <li key={i}>
                    <span className="ps-tag">{t(psKey('linkType.' + link.type))}</span>{' '}
                    <SmartLink href={link.url}>{link.label || link.url}</SmartLink>
                  </li>
                ))}
              </ul>
            )}
            {computedLinks.length > 0 && (
              <>
                <h3>{t(psKey('links.computed'))}</h3>
                <ul className="ps-links">
                  {computedLinks.map((link) => (
                    <li key={link.key}>
                      <SmartLink href={link.href}>{link.label}</SmartLink>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </EditableSection>
        )
      case 'team':
        return (
          <EditableSection<TeamDraft>
            key={id}
            id={id}
            title={title(id)}
            {...common}
            empty={!sheet.referent && sheet.team.length === 0}
            makeDraft={() => ({
              referent: sheet.referent?._id ?? '',
              team: sheet.team.map((m) => ({ user: m.user._id, role: m.role })),
            })}
            renderEditor={(draft, setDraft) => <TeamEditor draft={draft} onChange={setDraft} meta={meta} />}
            toPatch={(draft) => ({
              referent: draft.referent || null,
              team: draft.team.filter((m) => m.user).map((m) => ({ user: m.user, role: m.role.trim() })),
            })}
          >
            <dl className="ps-dl">
              <div>
                <dt>{t(psKey('team.referent'))}</dt>
                <dd>{sheet.referent ? sheet.referent.name : t(psKey('detail.noReferent'))}</dd>
              </div>
            </dl>
            {sheet.team.length > 0 ? (
              <ul className="ps-team">
                {sheet.team.map((member, i) => (
                  <li key={member.user._id + '-' + i}>
                    <strong>{member.user.name}</strong>
                    {member.role && <span> — {member.role}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ps-empty">{t(psKey('team.empty'))}</p>
            )}
          </EditableSection>
        )
      case 'demo':
        return (
          <section key={id} id={id} className="ps-section" aria-labelledby="demo-title">
            <div className="ps-section__head">
              <h2 id="demo-title">{title(id)}</h2>
            </div>
            <DemoAccesses
              sheetId={sheet._id}
              accesses={sheet.demoAccesses}
              canEdit={sheet.canEdit}
              canReveal={sheet.canReveal}
              onChange={(demoAccesses) => setSheet((prev) => (prev ? { ...prev, demoAccesses } : prev))}
            />
          </section>
        )
      case 'history':
        return (
          <section key={id} id={id} className="ps-section" aria-labelledby="history-title">
            <div className="ps-section__head">
              <h2 id="history-title">{title(id)}</h2>
            </div>
            {sheet.history.length === 0 ? (
              <p className="ps-empty">{t(psKey('history.empty'))}</p>
            ) : (
              <ol className="ps-history">
                {sheet.history.map((entry, i) => (
                  <li key={i}>
                    <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                    <strong>{entry.by?.name ?? t(psKey('history.system'))}</strong>
                    <span>{entry.summary}</span>
                    {entry.fields.length > 0 && (
                      <small>{t(psKey('history.fields'), { fields: entry.fields.map(fieldLabel).join(', ') })}</small>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      default:
        return null
    }
  }

  return (
    <div className="ps-page ps-detail">
      <Link className="ps-back" to="/admin/projets/fiches">
        {t(psKey('detail.back'))}
      </Link>
      <header className="ps-hero">
        <SheetMark name={sheet.name} logoUrl={sheet.logoUrl} accentColor={sheet.accentColor} />
        <div className="ps-hero__body">
          <h1>{sheet.name}</h1>
          <div className="ps-badges">
            <StatusBadge status={sheet.status} />
            <ReviewBadge review={sheet.reviewStatus} showValidated />
            {sheet.archived && <span className="ps-badge">{t(psKey('list.archived'))}</span>}
            {!sheet.canEdit && <span className="ps-badge ps-badge--muted">{t(psKey('detail.readOnly'))}</span>}
          </div>
          <dl className="ps-hero__meta">
            <div>
              <dt>{t(psKey('detail.websites'))}</dt>
              <dd>
                {websites.length === 0
                  ? t(psKey('detail.noWebsites'))
                  : websites.map((w, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        <SmartLink href={w.url}>{w.label || w.url}</SmartLink>
                      </span>
                    ))}
              </dd>
            </div>
            <div>
              <dt>{t(psKey('detail.entity'))}</dt>
              <dd>{sheet.legalEntity ? t(psKey('entity.' + sheet.legalEntity)) : t(psKey('detail.notSet'))}</dd>
            </div>
            <div>
              <dt>{t(psKey('detail.referent'))}</dt>
              <dd>{sheet.referent ? sheet.referent.name : t(psKey('detail.noReferent'))}</dd>
            </div>
          </dl>
          <small>{t(psKey('detail.updatedAt'), { date: formatDate(sheet.updatedAt) })}</small>
        </div>
      </header>

      <div className="ps-layout">
        <nav className={'ps-toc' + (tocOpen ? ' is-open' : '')} aria-label={t(psKey('toc.aria'))}>
          <button type="button" className="ps-toc__toggle" aria-expanded={tocOpen} onClick={() => setTocOpen((open) => !open)}>
            {t(psKey('toc.title'))}
          </button>
          <ol>
            {SECTION_ORDER.map((id) => (
              <li key={id}>
                <a href={'#' + id} onClick={() => setTocOpen(false)}>
                  {title(id)}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="ps-content">{SECTION_ORDER.map(renderSection)}</div>
      </div>
    </div>
  )
}
