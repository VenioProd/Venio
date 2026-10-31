import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { apiFetch, ApiError } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'
import { useI18n } from '../../../context/I18nContext'
import type { Subsidiary, SubsidiaryPerson } from '../../../types/subsidiary.types'
import { STATUS_LABEL_KEYS, HEALTH_LABEL_KEYS, LINK_TYPE_LABEL_KEYS } from './labels'
import type { SubsidiaryHealth, SubsidiaryLinkType, SubsidiaryStatus } from '../../../types/subsidiary.types'

interface FormState {
  name: string
  tagline: string
  sector: string
  status: string
  health: string
  accentColor: string
  description: string
  lead: string
  foundedYear: string
  linkedEntity: string
  team: string[]
  caMtd: string
  caMtdDelta: string
  margin: string
  marginTarget: string
  treasury: string
  runwayMonths: string
  headcount: string
  headcountTarget: string
  objLabel: string
  objCurrent: string
  objTarget: string
  objUnit: string
  productDescription: string
  serviceDescription: string
  businessModel: string
  businessPlan: string
  sections: { title: string; content: string }[]
  links: { type: string; label: string; url: string }[]
  infos: { label: string; value: string }[]
  contacts: { name: string; role: string; email: string; phone: string; notes: string }[]
  alerts: { label: string; level: string }[]
  tags: string
}

function toForm(s: Subsidiary | null): FormState {
  return {
    name: s?.name ?? '',
    tagline: s?.tagline ?? '',
    sector: s?.sector ?? '',
    status: s?.status ?? 'INCUBATION',
    health: s?.health ?? 'WATCH',
    accentColor: s?.accentColor ?? '#0ea5e9',
    description: s?.description ?? '',
    lead: s?.lead?._id ?? '',
    foundedYear: s?.foundedYear ? String(s.foundedYear) : '',
    linkedEntity: s?.linkedEntity ?? '',
    team: (s?.team ?? []).map((m) => m._id),
    caMtd: String(s?.kpis?.caMtd ?? ''),
    caMtdDelta: String(s?.kpis?.caMtdDelta ?? ''),
    margin: String(s?.kpis?.margin ?? ''),
    marginTarget: String(s?.kpis?.marginTarget ?? ''),
    treasury: String(s?.kpis?.treasury ?? ''),
    runwayMonths: String(s?.kpis?.runwayMonths ?? ''),
    headcount: String(s?.kpis?.headcount ?? ''),
    headcountTarget: String(s?.kpis?.headcountTarget ?? ''),
    objLabel: s?.objective?.label ?? '',
    objCurrent: String(s?.objective?.current ?? ''),
    objTarget: String(s?.objective?.target ?? ''),
    objUnit: s?.objective?.unit ?? '',
    productDescription: s?.productDescription ?? '',
    serviceDescription: s?.serviceDescription ?? '',
    businessModel: s?.businessModel ?? '',
    businessPlan: s?.businessPlan ?? '',
    sections: s?.sections?.length ? s.sections.map((x) => ({ title: x.title, content: x.content })) : [],
    links: s?.links?.length ? s.links.map((l) => ({ type: l.type || 'other', label: l.label, url: l.url })) : [],
    infos: s?.infos?.length ? s.infos.map((x) => ({ label: x.label, value: x.value })) : [],
    contacts: s?.contacts?.length
      ? s.contacts.map((c) => ({ name: c.name, role: c.role, email: c.email, phone: c.phone, notes: c.notes }))
      : [],
    alerts: s?.alerts?.length ? s.alerts.map((a) => ({ label: a.label, level: a.level })) : [],
    tags: (s?.tags ?? []).join(', '),
  }
}

const num = (v: string) => (v.trim() === '' ? 0 : Number(v) || 0)

interface Props {
  initial: Subsidiary | null
  admins: SubsidiaryPerson[]
  entities: string[]
  onSaved: (s: Subsidiary) => void
  onClose: () => void
}

export default function SubsidiaryFormDrawer({ initial, admins, entities, onSaved, onClose }: Props) {
  const { t } = useI18n()
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(() => toForm(initial))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const toggleMember = (id: string) =>
    setForm((f) => ({ ...f, team: f.team.includes(id) ? f.team.filter((x) => x !== id) : [...f.team, id] }))

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast(t('orgs.subsidiary.form.nameRequired'), 'error')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      sector: form.sector.trim(),
      status: form.status,
      health: form.health,
      accentColor: form.accentColor,
      description: form.description.trim(),
      productDescription: form.productDescription.trim(),
      serviceDescription: form.serviceDescription.trim(),
      businessModel: form.businessModel.trim(),
      businessPlan: form.businessPlan.trim(),
      sections: form.sections.filter((x) => x.title.trim() || x.content.trim()),
      lead: form.lead || null,
      foundedYear: form.foundedYear ? num(form.foundedYear) : null,
      linkedEntity: form.linkedEntity,
      team: form.team,
      kpis: {
        caMtd: num(form.caMtd),
        caMtdDelta: num(form.caMtdDelta),
        margin: num(form.margin),
        marginTarget: num(form.marginTarget),
        treasury: num(form.treasury),
        runwayMonths: num(form.runwayMonths),
        headcount: num(form.headcount),
        headcountTarget: num(form.headcountTarget),
      },
      objective: {
        label: form.objLabel.trim(),
        current: num(form.objCurrent),
        target: num(form.objTarget),
        unit: form.objUnit.trim(),
      },
      links: form.links.filter((l) => l.label.trim() && l.url.trim()),
      infos: form.infos.filter((x) => x.label.trim() || x.value.trim()),
      contacts: form.contacts.filter((c) => c.name.trim()),
      alerts: form.alerts.filter((a) => a.label.trim()),
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    }
    try {
      const res = initial
        ? await apiFetch<{ subsidiary: Subsidiary }>(`/api/admin/subsidiaries/${initial._id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiFetch<{ subsidiary: Subsidiary }>('/api/admin/subsidiaries', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
      showToast(initial ? t('orgs.subsidiary.form.updatedToast') : t('orgs.subsidiary.form.createdToast'), 'success')
      onSaved(res.subsidiary)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t('orgs.subsidiary.form.saveError'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="portal-card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        {initial ? t('orgs.subsidiary.form.editTitle', { name: initial.name }) : t('orgs.subsidiary.form.newTitle')}
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.nameLabel')}</label>
            <input
              className="portal-input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={t('orgs.subsidiary.form.namePlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.sectorLabel')}</label>
            <input
              className="portal-input"
              value={form.sector}
              onChange={(e) => set('sector', e.target.value)}
              placeholder={t('orgs.subsidiary.form.sectorPlaceholder')}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('orgs.subsidiary.form.taglineLabel')}</label>
            <input
              className="portal-input"
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
              placeholder={t('orgs.subsidiary.form.taglinePlaceholder')}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('orgs.subsidiary.form.descriptionLabel')}</label>
            <textarea
              className="portal-input"
              rows={3}
              style={{ resize: 'vertical' }}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('orgs.subsidiary.form.descriptionPlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.statusLabel')}</label>
            <select className="portal-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {(Object.keys(STATUS_LABEL_KEYS) as SubsidiaryStatus[]).map((v) => (
                <option key={v} value={v}>
                  {t(STATUS_LABEL_KEYS[v])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.healthLabel')}</label>
            <select className="portal-input" value={form.health} onChange={(e) => set('health', e.target.value)}>
              {(Object.keys(HEALTH_LABEL_KEYS) as SubsidiaryHealth[]).map((v) => (
                <option key={v} value={v}>
                  {t(HEALTH_LABEL_KEYS[v])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.leadLabel')}</label>
            <select className="portal-input" value={form.lead} onChange={(e) => set('lead', e.target.value)}>
              <option value="">—</option>
              {admins.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.foundedLabel')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.foundedYear}
              onChange={(e) => set('foundedYear', e.target.value)}
              placeholder="2024"
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.entityLabel')}</label>
            <select
              className="portal-input"
              value={form.linkedEntity}
              onChange={(e) => set('linkedEntity', e.target.value)}
            >
              <option value="">{t('orgs.subsidiary.form.entityNone')}</option>
              {entities.map((en) => (
                <option key={en} value={en}>
                  {en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.accentLabel')}</label>
            <input
              className="portal-input"
              type="color"
              value={form.accentColor}
              onChange={(e) => set('accentColor', e.target.value)}
              style={{ height: 40, padding: 4 }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">{t('orgs.subsidiary.form.teamLabel')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {admins.map((a) => (
                <button
                  type="button"
                  key={a._id}
                  onClick={() => toggleMember(a._id)}
                  className="sub-status-pill"
                  style={{
                    cursor: 'pointer',
                    borderColor: form.team.includes(a._id) ? 'var(--primary)' : 'var(--border-color)',
                    color: form.team.includes(a._id) ? 'var(--primary)' : 'var(--text-secondary)',
                  }}
                >
                  {a.name || a.email}
                </button>
              ))}
            </div>
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.kpiHeading')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiRevenue')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.caMtd}
              onChange={(e) => set('caMtd', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiRevenueDelta')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.caMtdDelta}
              onChange={(e) => set('caMtdDelta', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiMargin')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.margin}
              onChange={(e) => set('margin', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiMarginTarget')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.marginTarget}
              onChange={(e) => set('marginTarget', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiTreasury')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.treasury}
              onChange={(e) => set('treasury', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiRunway')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.runwayMonths}
              onChange={(e) => set('runwayMonths', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiHeadcount')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.headcount}
              onChange={(e) => set('headcount', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.kpiHeadcountTarget')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.headcountTarget}
              onChange={(e) => set('headcountTarget', e.target.value)}
            />
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.objectiveHeading')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.objLabel')}</label>
            <input
              className="portal-input"
              value={form.objLabel}
              onChange={(e) => set('objLabel', e.target.value)}
              placeholder={t('orgs.subsidiary.form.objLabelPlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.objCurrent')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.objCurrent}
              onChange={(e) => set('objCurrent', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.objTarget')}</label>
            <input
              className="portal-input"
              type="number"
              value={form.objTarget}
              onChange={(e) => set('objTarget', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.objUnit')}</label>
            <input
              className="portal-input"
              value={form.objUnit}
              onChange={(e) => set('objUnit', e.target.value)}
              placeholder="users"
            />
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.dossierHeading')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.productLabel')}</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.productDescription}
              onChange={(e) => set('productDescription', e.target.value)}
              placeholder={t('orgs.subsidiary.form.productPlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.serviceLabel')}</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.serviceDescription}
              onChange={(e) => set('serviceDescription', e.target.value)}
              placeholder={t('orgs.subsidiary.form.servicePlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.businessModelLabel')}</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.businessModel}
              onChange={(e) => set('businessModel', e.target.value)}
              placeholder={t('orgs.subsidiary.form.businessModelPlaceholder')}
            />
          </div>
          <div>
            <label className="portal-label">{t('orgs.subsidiary.form.businessPlanLabel')}</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.businessPlan}
              onChange={(e) => set('businessPlan', e.target.value)}
              placeholder={t('orgs.subsidiary.form.businessPlanPlaceholder')}
            />
          </div>
        </div>

        <h4 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 16, marginBottom: 8 }}>
          {t('orgs.subsidiary.form.sectionsHeading')}
        </h4>
        {form.sections.map((sec, i) => (
          <div
            key={i}
            style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, marginBottom: 10 }}
          >
            <div className="sub-repeat-row" style={{ marginBottom: 8 }}>
              <input
                className="portal-input"
                style={{ flex: 1 }}
                placeholder={t('orgs.subsidiary.form.sectionTitlePlaceholder')}
                value={sec.title}
                onChange={(e) =>
                  set(
                    'sections',
                    form.sections.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                  )
                }
              />
              <button
                type="button"
                className="sub-icon-btn"
                onClick={() =>
                  set(
                    'sections',
                    form.sections.filter((_, j) => j !== i),
                  )
                }
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              placeholder={t('orgs.subsidiary.form.sectionContentPlaceholder')}
              value={sec.content}
              onChange={(e) =>
                set(
                  'sections',
                  form.sections.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="sub-icon-btn"
          onClick={() => set('sections', [...form.sections, { title: '', content: '' }])}
        >
          <Plus size={14} /> {t('orgs.subsidiary.form.addSection')}
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.linksHeading')}
        </h3>
        {form.links.map((l, i) => (
          <div className="sub-repeat-row" key={i}>
            <select
              className="portal-input"
              style={{ flex: '0 0 150px' }}
              value={l.type}
              onChange={(e) =>
                set(
                  'links',
                  form.links.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                )
              }
            >
              {(Object.keys(LINK_TYPE_LABEL_KEYS) as SubsidiaryLinkType[]).map((v) => (
                <option key={v} value={v}>
                  {t(LINK_TYPE_LABEL_KEYS[v])}
                </option>
              ))}
            </select>
            <input
              className="portal-input"
              style={{ flex: '0 0 130px' }}
              placeholder={t('orgs.subsidiary.form.linkLabelPlaceholder')}
              value={l.label}
              onChange={(e) =>
                set(
                  'links',
                  form.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
            />
            <input
              className="portal-input"
              style={{ flex: 1 }}
              placeholder="https://..."
              value={l.url}
              onChange={(e) =>
                set(
                  'links',
                  form.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              className="sub-icon-btn"
              onClick={() =>
                set(
                  'links',
                  form.links.filter((_, j) => j !== i),
                )
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sub-icon-btn"
          onClick={() => set('links', [...form.links, { type: 'repo', label: '', url: '' }])}
        >
          <Plus size={14} /> {t('orgs.subsidiary.form.addLink')}
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.infosHeading')}
        </h3>
        {form.infos.map((info, i) => (
          <div className="sub-repeat-row" key={i}>
            <input
              className="portal-input"
              style={{ flex: '0 0 180px' }}
              placeholder={t('orgs.subsidiary.form.infoKeyPlaceholder')}
              value={info.label}
              onChange={(e) =>
                set(
                  'infos',
                  form.infos.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
            />
            <input
              className="portal-input"
              style={{ flex: 1 }}
              placeholder={t('orgs.subsidiary.form.infoValuePlaceholder')}
              value={info.value}
              onChange={(e) =>
                set(
                  'infos',
                  form.infos.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              className="sub-icon-btn"
              onClick={() =>
                set(
                  'infos',
                  form.infos.filter((_, j) => j !== i),
                )
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sub-icon-btn"
          onClick={() => set('infos', [...form.infos, { label: '', value: '' }])}
        >
          <Plus size={14} /> {t('orgs.subsidiary.form.addInfo')}
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.contactsHeading')}
        </h3>
        {form.contacts.map((c, i) => (
          <div
            key={i}
            style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, marginBottom: 10 }}
          >
            <div className="sub-repeat-row" style={{ marginBottom: 8 }}>
              <input
                className="portal-input"
                style={{ flex: 1 }}
                placeholder={t('orgs.subsidiary.form.contactNamePlaceholder')}
                value={c.name}
                onChange={(e) =>
                  set(
                    'contacts',
                    form.contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                  )
                }
              />
              <input
                className="portal-input"
                style={{ flex: 1 }}
                placeholder={t('orgs.subsidiary.form.contactRolePlaceholder')}
                value={c.role}
                onChange={(e) =>
                  set(
                    'contacts',
                    form.contacts.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)),
                  )
                }
              />
              <button
                type="button"
                className="sub-icon-btn"
                onClick={() =>
                  set(
                    'contacts',
                    form.contacts.filter((_, j) => j !== i),
                  )
                }
              >
                <X size={14} />
              </button>
            </div>
            <div className="sub-repeat-row" style={{ marginBottom: 0 }}>
              <input
                className="portal-input"
                style={{ flex: 1 }}
                placeholder={t('orgs.subsidiary.form.contactEmailPlaceholder')}
                value={c.email}
                onChange={(e) =>
                  set(
                    'contacts',
                    form.contacts.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)),
                  )
                }
              />
              <input
                className="portal-input"
                style={{ flex: 1 }}
                placeholder={t('orgs.subsidiary.form.contactPhonePlaceholder')}
                value={c.phone}
                onChange={(e) =>
                  set(
                    'contacts',
                    form.contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)),
                  )
                }
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="sub-icon-btn"
          onClick={() => set('contacts', [...form.contacts, { name: '', role: '', email: '', phone: '', notes: '' }])}
        >
          <Plus size={14} /> {t('orgs.subsidiary.form.addContact')}
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          {t('orgs.subsidiary.form.alertsHeading')}
        </h3>
        {form.alerts.map((a, i) => (
          <div className="sub-repeat-row" key={i}>
            <input
              className="portal-input"
              style={{ flex: 1 }}
              placeholder={t('orgs.subsidiary.form.alertPlaceholder')}
              value={a.label}
              onChange={(e) =>
                set(
                  'alerts',
                  form.alerts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                )
              }
            />
            <select
              className="portal-input"
              style={{ flex: '0 0 130px' }}
              value={a.level}
              onChange={(e) =>
                set(
                  'alerts',
                  form.alerts.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)),
                )
              }
            >
              <option value="INFO">{t('orgs.subsidiary.form.levelInfo')}</option>
              <option value="WARNING">{t('orgs.subsidiary.form.levelWarning')}</option>
              <option value="CRITICAL">{t('orgs.subsidiary.form.levelCritical')}</option>
            </select>
            <button
              type="button"
              className="sub-icon-btn"
              onClick={() =>
                set(
                  'alerts',
                  form.alerts.filter((_, j) => j !== i),
                )
              }
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sub-icon-btn"
          onClick={() => set('alerts', [...form.alerts, { label: '', level: 'WARNING' }])}
        >
          <Plus size={14} /> {t('orgs.subsidiary.form.addAlert')}
        </button>

        <div style={{ marginTop: 18 }}>
          <label className="portal-label">{t('orgs.subsidiary.form.tagsLabel')}</label>
          <input
            className="portal-input"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="produit, b2c, mvp"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button type="submit" className="portal-button" disabled={saving}>
            {saving
              ? t('orgs.subsidiary.credentials.saving')
              : initial
                ? t('common.save')
                : t('orgs.subsidiary.form.createButton')}
          </button>
          <button type="button" className="portal-button secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  )
}
