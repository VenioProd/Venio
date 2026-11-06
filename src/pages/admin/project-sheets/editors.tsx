import { useI18n } from '../../../context/I18nContext'
import SafeMarkdown from '../../../components/admin/SafeMarkdown'
import {
  PROJECT_SHEET_ENTITIES,
  PROJECT_SHEET_LINK_TYPES,
  PROJECT_SHEET_REVIEW_STATUSES,
  PROJECT_SHEET_STATUSES,
  type ProjectSheet,
  type ProjectSheetLink,
  type ProjectSheetMeta,
  type ProjectSheetWebsite,
} from '../../../types/projectSheet.types'
import { psKey } from './shared'

export function SecretWarning() {
  const { t } = useI18n()
  return (
    <p className="ps-warning" role="note">
      {t(psKey('edit.secretWarning'))}
    </p>
  )
}

/** Éditeur Markdown : zone de texte + aperçu rendu par SafeMarkdown. */
export function MarkdownEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <div className="ps-md-editor">
      <SecretWarning />
      <label>
        {t(psKey('edit.textLabel'), { section: label })}
        <textarea rows={12} value={value} maxLength={20000} onChange={(e) => onChange(e.target.value)} />
      </label>
      <small>{t(psKey('edit.markdownHelp'))}</small>
      <div className="ps-preview" aria-label={t(psKey('edit.preview'))}>
        <h3>{t(psKey('edit.preview'))}</h3>
        {value.trim() ? <SafeMarkdown source={value} /> : <p className="ps-empty">{t(psKey('edit.previewEmpty'))}</p>}
      </div>
    </div>
  )
}

export function OneLinerEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  return (
    <div>
      <SecretWarning />
      <label>
        {t(psKey('form.oneLiner'))}
        <textarea rows={3} maxLength={300} value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <small>{value.length}/300</small>
    </div>
  )
}

export interface IdentityDraft {
  name: string
  logoUrl: string
  accentColor: string
  status: string
  reviewStatus: string
  websites: ProjectSheetWebsite[]
  legalEntity: string
  leadProject: string
  archived: boolean
}

export function identityDraft(sheet: ProjectSheet): IdentityDraft {
  return {
    name: sheet.name,
    logoUrl: sheet.logoUrl || '',
    accentColor: sheet.accentColor || '',
    status: sheet.status,
    reviewStatus: sheet.reviewStatus,
    websites: sheet.websites.map((w) => ({ ...w })),
    legalEntity: sheet.legalEntity || '',
    leadProject: sheet.leadProject || '',
    archived: sheet.archived,
  }
}

export function IdentityEditor({
  draft,
  onChange,
  meta,
}: {
  draft: IdentityDraft
  onChange: (draft: IdentityDraft) => void
  meta: ProjectSheetMeta | null
}) {
  const { t } = useI18n()
  const set = <K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) => onChange({ ...draft, [key]: value })
  const entities = meta?.entities ?? PROJECT_SHEET_ENTITIES
  const leadProjects = meta?.leadProjects ?? []
  return (
    <div className="ps-fields">
      <label>
        {t(psKey('form.name'))}
        <input value={draft.name} maxLength={120} onChange={(e) => set('name', e.target.value)} required />
      </label>
      <label>
        {t(psKey('form.logoUrl'))}
        <input type="url" value={draft.logoUrl} maxLength={2000} onChange={(e) => set('logoUrl', e.target.value)} />
      </label>
      <label>
        {t(psKey('form.accentColor'))}
        <input value={draft.accentColor} maxLength={9} onChange={(e) => set('accentColor', e.target.value)} />
      </label>
      <label>
        {t(psKey('form.status'))}
        <select value={draft.status} onChange={(e) => set('status', e.target.value)}>
          {(meta?.statuses ?? PROJECT_SHEET_STATUSES).map((s) => (
            <option key={s} value={s}>
              {t(psKey('status.' + s))}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t(psKey('form.reviewStatus'))}
        <select value={draft.reviewStatus} onChange={(e) => set('reviewStatus', e.target.value)}>
          {(meta?.reviewStatuses ?? PROJECT_SHEET_REVIEW_STATUSES).map((s) => (
            <option key={s} value={s}>
              {t(psKey('review.' + s))}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t(psKey('form.legalEntity'))}
        <select value={draft.legalEntity} onChange={(e) => set('legalEntity', e.target.value)}>
          <option value="">{t(psKey('form.none'))}</option>
          {entities.map((s) => (
            <option key={s} value={s}>
              {t(psKey('entity.' + s))}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t(psKey('form.leadProject'))}
        <select value={draft.leadProject} onChange={(e) => set('leadProject', e.target.value)}>
          <option value="">{t(psKey('form.none'))}</option>
          {leadProjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="ps-check">
        <input type="checkbox" checked={draft.archived} onChange={(e) => set('archived', e.target.checked)} />
        {t(psKey('form.archived'))}
      </label>
      <fieldset className="ps-rows">
        <legend>{t(psKey('form.websites'))}</legend>
        {draft.websites.map((site, i) => (
          <div className="ps-row" key={i}>
            <input
              aria-label={t(psKey('form.websiteLabel'))}
              placeholder={t(psKey('form.websiteLabel'))}
              value={site.label}
              maxLength={80}
              onChange={(e) => set('websites', draft.websites.map((w, j) => (j === i ? { ...w, label: e.target.value } : w)))}
            />
            <input
              type="url"
              aria-label={t(psKey('form.websiteUrl'))}
              placeholder={t(psKey('form.websiteUrl'))}
              value={site.url}
              maxLength={2000}
              onChange={(e) => set('websites', draft.websites.map((w, j) => (j === i ? { ...w, url: e.target.value } : w)))}
            />
            <button type="button" className="ps-btn" onClick={() => set('websites', draft.websites.filter((_, j) => j !== i))}>
              {t(psKey('form.remove'))}
            </button>
          </div>
        ))}
        <button type="button" className="ps-btn" onClick={() => set('websites', [...draft.websites, { label: '', url: '' }])}>
          {t(psKey('form.addWebsite'))}
        </button>
      </fieldset>
    </div>
  )
}

export function identityPatch(d: IdentityDraft): Record<string, unknown> {
  return {
    name: d.name.trim(),
    logoUrl: d.logoUrl.trim(),
    accentColor: d.accentColor.trim(),
    status: d.status,
    reviewStatus: d.reviewStatus,
    websites: d.websites.filter((w) => w.url.trim()).map((w) => ({ label: w.label.trim(), url: w.url.trim() })),
    legalEntity: d.legalEntity,
    leadProject: d.leadProject,
    archived: d.archived,
  }
}

export interface LinksDraft {
  links: ProjectSheetLink[]
  devProject: string
}

export function LinksEditor({
  draft,
  onChange,
  meta,
}: {
  draft: LinksDraft
  onChange: (draft: LinksDraft) => void
  meta: ProjectSheetMeta | null
}) {
  const { t } = useI18n()
  const types = meta?.linkTypes ?? PROJECT_SHEET_LINK_TYPES
  const setLinks = (links: ProjectSheetLink[]) => onChange({ ...draft, links })
  return (
    <div className="ps-fields">
      <SecretWarning />
      <fieldset className="ps-rows">
        <legend>{t(psKey('section.links'))}</legend>
        {draft.links.map((link, i) => (
          <div className="ps-row" key={i}>
            <select
              aria-label={t(psKey('form.linkType'))}
              value={link.type}
              onChange={(e) => setLinks(draft.links.map((l, j) => (j === i ? { ...l, type: e.target.value as ProjectSheetLink['type'] } : l)))}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {t(psKey('linkType.' + type))}
                </option>
              ))}
            </select>
            <input
              aria-label={t(psKey('form.linkLabel'))}
              placeholder={t(psKey('form.linkLabel'))}
              value={link.label}
              maxLength={80}
              onChange={(e) => setLinks(draft.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
            />
            <input
              type="url"
              aria-label={t(psKey('form.linkUrl'))}
              placeholder={t(psKey('form.linkUrl'))}
              value={link.url}
              maxLength={2000}
              onChange={(e) => setLinks(draft.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
            />
            <button type="button" className="ps-btn" onClick={() => setLinks(draft.links.filter((_, j) => j !== i))}>
              {t(psKey('form.remove'))}
            </button>
          </div>
        ))}
        <button type="button" className="ps-btn" onClick={() => setLinks([...draft.links, { type: 'other', label: '', url: '' }])}>
          {t(psKey('form.addLink'))}
        </button>
      </fieldset>
      <label>
        {t(psKey('form.devProject'))}
        <select value={draft.devProject} onChange={(e) => onChange({ ...draft, devProject: e.target.value })}>
          <option value="">{t(psKey('form.none'))}</option>
          {(meta?.devProjects ?? []).map((p) => (
            <option key={p._id} value={p._id}>
              {p.key} — {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export interface TeamDraft {
  referent: string
  team: { user: string; role: string }[]
}

export function TeamEditor({
  draft,
  onChange,
  meta,
}: {
  draft: TeamDraft
  onChange: (draft: TeamDraft) => void
  meta: ProjectSheetMeta | null
}) {
  const { t } = useI18n()
  const members = meta?.members
  if (!members) return <p role="status">{t(psKey('form.metaLoading'))}</p>
  const setTeam = (team: TeamDraft['team']) => onChange({ ...draft, team })
  return (
    <div className="ps-fields">
      <label>
        {t(psKey('form.referent'))}
        <select value={draft.referent} onChange={(e) => onChange({ ...draft, referent: e.target.value })}>
          <option value="">{t(psKey('form.none'))}</option>
          {members.map((m) => (
            <option key={m._id} value={m._id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="ps-rows">
        <legend>{t(psKey('team.members'))}</legend>
        {draft.team.map((row, i) => (
          <div className="ps-row" key={i}>
            <select
              aria-label={t(psKey('form.teamUser'))}
              value={row.user}
              onChange={(e) => setTeam(draft.team.map((r, j) => (j === i ? { ...r, user: e.target.value } : r)))}
            >
              <option value="">{t(psKey('form.none'))}</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              aria-label={t(psKey('form.teamRole'))}
              placeholder={t(psKey('form.teamRole'))}
              value={row.role}
              maxLength={120}
              onChange={(e) => setTeam(draft.team.map((r, j) => (j === i ? { ...r, role: e.target.value } : r)))}
            />
            <button type="button" className="ps-btn" onClick={() => setTeam(draft.team.filter((_, j) => j !== i))}>
              {t(psKey('form.remove'))}
            </button>
          </div>
        ))}
        <button type="button" className="ps-btn" onClick={() => setTeam([...draft.team, { user: '', role: '' }])}>
          {t(psKey('form.addMember'))}
        </button>
      </fieldset>
    </div>
  )
}
