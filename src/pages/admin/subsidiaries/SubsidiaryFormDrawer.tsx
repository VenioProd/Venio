import { useState, type FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { apiFetch, ApiError } from '../../../lib/api'
import { useToast } from '../../../context/ToastContext'
import type { Subsidiary, SubsidiaryPerson } from '../../../types/subsidiary.types'
import { STATUS_LABELS, HEALTH_LABELS, LINK_TYPE_LABELS } from '../../../types/subsidiary.types'

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
  const { showToast } = useToast()
  const [form, setForm] = useState<FormState>(() => toForm(initial))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const toggleMember = (id: string) =>
    setForm((f) => ({ ...f, team: f.team.includes(id) ? f.team.filter((x) => x !== id) : [...f.team, id] }))

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast('Le nom est requis', 'error')
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
        .map((t) => t.trim())
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
      showToast(initial ? 'Filiale mise à jour' : 'Filiale créée', 'success')
      onSaved(res.subsidiary)
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Erreur lors de l’enregistrement', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="portal-card" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
        {initial ? `Modifier ${initial.name}` : 'Nouvelle filiale'}
      </h2>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="portal-label">Nom *</label>
            <input
              className="portal-input"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ex : Yumi"
            />
          </div>
          <div>
            <label className="portal-label">Secteur</label>
            <input
              className="portal-input"
              value={form.sector}
              onChange={(e) => set('sector', e.target.value)}
              placeholder="Ex : SaaS B2C"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Accroche</label>
            <input
              className="portal-input"
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
              placeholder="Une phrase qui résume la filiale"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Description</label>
            <textarea
              className="portal-input"
              rows={3}
              style={{ resize: 'vertical' }}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Contexte, mission, modèle..."
            />
          </div>
          <div>
            <label className="portal-label">Statut</label>
            <select className="portal-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Santé</label>
            <select className="portal-input" value={form.health} onChange={(e) => set('health', e.target.value)}>
              {Object.entries(HEALTH_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Responsable</label>
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
            <label className="portal-label">Année de création</label>
            <input
              className="portal-input"
              type="number"
              value={form.foundedYear}
              onChange={(e) => set('foundedYear', e.target.value)}
              placeholder="2024"
            />
          </div>
          <div>
            <label className="portal-label">Entité projets liée (auto)</label>
            <select
              className="portal-input"
              value={form.linkedEntity}
              onChange={(e) => set('linkedEntity', e.target.value)}
            >
              <option value="">— Aucune —</option>
              {entities.map((en) => (
                <option key={en} value={en}>
                  {en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="portal-label">Couleur d’accent</label>
            <input
              className="portal-input"
              type="color"
              value={form.accentColor}
              onChange={(e) => set('accentColor', e.target.value)}
              style={{ height: 40, padding: 4 }}
            />
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label className="portal-label">Équipe</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {admins.map((a) => (
                <button
                  type="button"
                  key={a._id}
                  onClick={() => toggleMember(a._id)}
                  className="sub-status-pill"
                  style={{
                    cursor: 'pointer',
                    borderColor: form.team.includes(a._id) ? '#0ea5e9' : 'var(--border-color)',
                    color: form.team.includes(a._id) ? '#7dd3fc' : 'var(--text-secondary)',
                  }}
                >
                  {a.name || a.email}
                </button>
              ))}
            </div>
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Indicateurs (KPI)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div>
            <label className="portal-label">CA / mois (€)</label>
            <input
              className="portal-input"
              type="number"
              value={form.caMtd}
              onChange={(e) => set('caMtd', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Δ CA (%)</label>
            <input
              className="portal-input"
              type="number"
              value={form.caMtdDelta}
              onChange={(e) => set('caMtdDelta', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Marge (%)</label>
            <input
              className="portal-input"
              type="number"
              value={form.margin}
              onChange={(e) => set('margin', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Marge cible (%)</label>
            <input
              className="portal-input"
              type="number"
              value={form.marginTarget}
              onChange={(e) => set('marginTarget', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Trésorerie (€)</label>
            <input
              className="portal-input"
              type="number"
              value={form.treasury}
              onChange={(e) => set('treasury', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Runway (mois)</label>
            <input
              className="portal-input"
              type="number"
              value={form.runwayMonths}
              onChange={(e) => set('runwayMonths', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Effectif</label>
            <input
              className="portal-input"
              type="number"
              value={form.headcount}
              onChange={(e) => set('headcount', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Effectif cible</label>
            <input
              className="portal-input"
              type="number"
              value={form.headcountTarget}
              onChange={(e) => set('headcountTarget', e.target.value)}
            />
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Objectif du trimestre
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label className="portal-label">Libellé</label>
            <input
              className="portal-input"
              value={form.objLabel}
              onChange={(e) => set('objLabel', e.target.value)}
              placeholder="Ex : Utilisateurs payants"
            />
          </div>
          <div>
            <label className="portal-label">Actuel</label>
            <input
              className="portal-input"
              type="number"
              value={form.objCurrent}
              onChange={(e) => set('objCurrent', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Cible</label>
            <input
              className="portal-input"
              type="number"
              value={form.objTarget}
              onChange={(e) => set('objTarget', e.target.value)}
            />
          </div>
          <div>
            <label className="portal-label">Unité</label>
            <input
              className="portal-input"
              value={form.objUnit}
              onChange={(e) => set('objUnit', e.target.value)}
              placeholder="users"
            />
          </div>
        </div>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Dossier — comprendre & suivre l’activité
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="portal-label">Description du produit</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.productDescription}
              onChange={(e) => set('productDescription', e.target.value)}
              placeholder="Ce que fait le produit, ses fonctionnalités clés, son positionnement…"
            />
          </div>
          <div>
            <label className="portal-label">Description du service</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.serviceDescription}
              onChange={(e) => set('serviceDescription', e.target.value)}
              placeholder="Prestations, accompagnement, livrables, modalités…"
            />
          </div>
          <div>
            <label className="portal-label">Business model</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.businessModel}
              onChange={(e) => set('businessModel', e.target.value)}
              placeholder="Sources de revenus, pricing, marges, canaux d’acquisition…"
            />
          </div>
          <div>
            <label className="portal-label">Business plan</label>
            <textarea
              className="portal-input"
              rows={4}
              style={{ resize: 'vertical' }}
              value={form.businessPlan}
              onChange={(e) => set('businessPlan', e.target.value)}
              placeholder="Vision, jalons, projections, besoins de financement…"
            />
          </div>
        </div>

        <h4 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginTop: 16, marginBottom: 8 }}>
          Sections libres
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
                placeholder="Titre de la section (ex : Concurrence, Roadmap, Risques)"
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
              placeholder="Contenu…"
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
          <Plus size={14} /> Ajouter une section
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Liens & accès
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
              {Object.entries(LINK_TYPE_LABELS).map(([v, lbl]) => (
                <option key={v} value={v}>
                  {lbl}
                </option>
              ))}
            </select>
            <input
              className="portal-input"
              style={{ flex: '0 0 130px' }}
              placeholder="Libellé"
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
          <Plus size={14} /> Ajouter un lien
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Infos (clé → valeur)
        </h3>
        {form.infos.map((info, i) => (
          <div className="sub-repeat-row" key={i}>
            <input
              className="portal-input"
              style={{ flex: '0 0 180px' }}
              placeholder="Clé (ex : SIRET, Banque, Stack)"
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
              placeholder="Valeur"
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
          <Plus size={14} /> Ajouter une info
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Contacts
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
                placeholder="Nom"
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
                placeholder="Rôle"
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
                placeholder="Email"
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
                placeholder="Téléphone"
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
          <Plus size={14} /> Ajouter un contact
        </button>

        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 22, marginBottom: 10 }}>
          Alertes
        </h3>
        {form.alerts.map((a, i) => (
          <div className="sub-repeat-row" key={i}>
            <input
              className="portal-input"
              style={{ flex: 1 }}
              placeholder="Description de l’alerte"
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
              <option value="INFO">Info</option>
              <option value="WARNING">Attention</option>
              <option value="CRITICAL">Critique</option>
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
          <Plus size={14} /> Ajouter une alerte
        </button>

        <div style={{ marginTop: 18 }}>
          <label className="portal-label">Tags (séparés par des virgules)</label>
          <input
            className="portal-input"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="produit, b2c, mvp"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button type="submit" className="portal-button" disabled={saving}>
            {saving ? 'Enregistrement...' : initial ? 'Enregistrer' : 'Créer la filiale'}
          </button>
          <button type="button" className="portal-button secondary" onClick={onClose} disabled={saving}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  )
}
