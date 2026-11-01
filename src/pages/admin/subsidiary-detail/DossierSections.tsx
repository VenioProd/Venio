import { Link } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import { formatMoney, formatDate } from '../../../i18n/format'
import type { Subsidiary, SubsidiaryCrmLead } from '../../../types/subsidiary.types'
import SectionEditor, { Fields, RowsEditor, dossierKey, type Field } from './SectionEditor'
import LegacyResources from './LegacyResources'

export const SECTION_IDS = [
  'presentation',
  'features',
  'pricing',
  'clients',
  'prospects',
  'competitors',
  'pitch',
  'pilotage',
  'dev',
  'resources',
] as const
const f = (key: string, max = 4000): Field => ({ key, label: key, max })
const money = (amount: number | null | undefined) => (amount == null ? '—' : formatMoney(amount, 'EUR'))
export default function DossierSections({
  sub,
  save,
  onChange,
  devProjects,
  leadProjects,
}: {
  sub: Subsidiary
  save: (patch: Record<string, any>) => Promise<void>
  onChange: (patch: Partial<Subsidiary>) => void
  devProjects: { _id: string; key: string; name: string }[]
  leadProjects: string[]
}) {
  const { t } = useI18n()
  const tr = (key: string) => t(dossierKey(key))
  const enumLabel = (key: string) => tr(`enum.${key}`)
  function rowEditor(key: string, fields: Field[], empty: Record<string, any>) {
    return (draft: Record<string, any>, setDraft: (value: Record<string, any>) => void) => (
      <RowsEditor
        rows={draft[key] || []}
        fields={fields}
        empty={empty}
        onChange={(rows) => setDraft({ ...draft, [key]: rows })}
      />
    )
  }
  function crmRows(leads: SubsidiaryCrmLead[], signed: boolean) {
    return leads.length ? (
      <div className="dossier-crm-list">
        {leads.map((lead) => (
          <article key={lead._id}>
            <div>
              <Link to={lead.href}>{lead.company}</Link>
              <p>{lead.contactName || '—'}</p>
              {lead.clientHref && (
                <Link to={lead.clientHref}>
                  {tr('clientAccount')} · {lead.clientAccountId?.name || lead.clientAccountId?.email}
                </Link>
              )}
            </div>
            <div>
              <strong className="dossier-money">{money(lead.budget)}</strong>
              <p>{lead.serviceType}</p>
            </div>
            <div>
              {signed ? (
                <>
                  <small>{tr('signedAt')}</small>
                  <p>{lead.signedAt ? formatDate(lead.signedAt) : '—'}</p>
                </>
              ) : (
                <>
                  <span className="dossier-chip">{enumLabel(lead.status || 'LEAD')}</span>
                  <p>{lead.leadTemperature && enumLabel(lead.leadTemperature)}</p>
                  <small>{tr('nextAction')}</small>
                  <p>{lead.nextActionAt ? formatDate(lead.nextActionAt) : '—'}</p>
                  <small>{tr('owner')}</small>
                  <p>{lead.assignedTo?.name || lead.assignedTo?.email || '—'}</p>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    ) : (
      <p className="dossier-empty">{tr(sub.leadProject ? 'noLeads' : 'connectCrm')}</p>
    )
  }
  const featuresByCategory = (sub.features || []).reduce<Record<string, NonNullable<Subsidiary['features']>>>(
    (acc, feature) => {
      const key = feature.category || tr('uncategorized')
      ;(acc[key] ||= []).push(feature)
      return acc
    },
    {},
  )
  return (
    <>
      <SectionEditor
        id="presentation"
        title={tr('presentation')}
        initial={{
          description: sub.description,
          target: sub.target || '',
          valueProposition: sub.valueProposition || '',
        }}
        save={save}
        editor={(draft, set) => (
          <Fields
            value={draft}
            fields={[f('description', 12000), f('target', 6000), f('valueProposition', 6000)]}
            onChange={set}
          />
        )}
      >
        {[
          ['description', sub.description],
          ['target', sub.target],
          ['valueProposition', sub.valueProposition],
        ].map(([label, value]) => (
          <div key={label}>
            <h3>{tr(label!)}</h3>
            <p className="dossier-prose">{value || tr('empty')}</p>
          </div>
        ))}
      </SectionEditor>
      <SectionEditor
        id="features"
        title={tr('features')}
        initial={{ features: sub.features || [] }}
        save={save}
        emptyLabel={tr('firstFeature')}
        editor={rowEditor(
          'features',
          [
            f('name', 160),
            f('description'),
            { ...f('status'), options: ['LIVE', 'BETA', 'EN_COURS', 'PREVUE'] },
            f('category', 120),
          ],
          { name: '', description: '', status: 'PREVUE', category: '' },
        )}
      >
        {!!sub.features?.length &&
          Object.entries(featuresByCategory).map(([category, features]) => (
            <div key={category}>
              <h3 className="dossier-eyebrow">{category}</h3>
              <div className="dossier-card-grid">
                {features.map((feature, i) => (
                  <article className="dossier-mini-card" key={i}>
                    <span className={`dossier-chip ${feature.status}`}>{enumLabel(feature.status)}</span>
                    <h3>{feature.name}</h3>
                    <p>{feature.description}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
      </SectionEditor>
      <SectionEditor
        id="pricing"
        title={tr('pricing')}
        initial={{ pricing: sub.pricing || [] }}
        save={save}
        editor={rowEditor(
          'pricing',
          [
            f('label', 160),
            { ...f('kind'), options: ['ABONNEMENT', 'ONBOARDING', 'SETUP', 'OPTION', 'LICENCE', 'AUTRE'] },
            { ...f('amount'), type: 'number' },
            { ...f('period'), options: ['MOIS', 'AN', 'UNIQUE', 'PAR_UTILISATEUR_MOIS'] },
            f('notes'),
          ],
          { label: '', kind: 'ABONNEMENT', amount: 0, period: 'MOIS', notes: '' },
        )}
      >
        {!!sub.pricing?.length && (
          <div className="dossier-card-grid">
            {sub.pricing.map((price, i) => (
              <article key={i} className="dossier-mini-card">
                <span className="dossier-eyebrow">{enumLabel(price.kind)}</span>
                <h3>{price.label}</h3>
                <p>
                  <strong className="dossier-money price">{money(price.amount)}</strong>{' '}
                  <small>
                    {tr('exTax')} · {enumLabel(price.period)}
                  </small>
                </p>
                <p>{price.notes}</p>
              </article>
            ))}
          </div>
        )}
      </SectionEditor>
      <SectionEditor
        id="clients"
        title={tr('clients')}
        initial={{ leadProject: sub.leadProject || '' }}
        save={save}
        editor={(draft, set) => (
          <Fields value={draft} fields={[{ ...f('leadProject'), options: ['', ...leadProjects] }]} onChange={set} />
        )}
      >
        {crmRows(sub.signedClients || [], true)}
      </SectionEditor>
      <SectionEditor
        id="prospects"
        title={tr('prospects')}
        initial={{ leadProject: sub.leadProject || '' }}
        save={save}
        editor={(draft, set) => (
          <Fields value={draft} fields={[{ ...f('leadProject'), options: ['', ...leadProjects] }]} onChange={set} />
        )}
      >
        {crmRows(sub.hotProspects || [], false)}
        {sub.leadProject && (
          <Link className="dossier-button" to={`/admin/crm?project=${encodeURIComponent(sub.leadProject)}`}>
            {tr('seeCrm')}
          </Link>
        )}
      </SectionEditor>
      <SectionEditor
        id="competitors"
        title={tr('competitors')}
        initial={{ competitors: sub.competitors || [] }}
        save={save}
        editor={rowEditor(
          'competitors',
          [
            f('name', 160),
            { ...f('url'), type: 'url' },
            f('positioning'),
            f('pricingNote', 2000),
            f('strengths'),
            f('weaknesses'),
          ],
          { name: '', url: '', positioning: '', pricingNote: '', strengths: '', weaknesses: '' },
        )}
      >
        {!!sub.competitors?.length && (
          <table className="dossier-table">
            <thead>
              <tr>
                {['name', 'positioning', 'pricingNote', 'strengths', 'weaknesses'].map((key) => (
                  <th key={key}>{tr(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sub.competitors.map((competitor, i) => (
                <tr key={i}>
                  {['name', 'positioning', 'pricingNote', 'strengths', 'weaknesses'].map((key) => (
                    <td key={key} data-label={tr(key)}>
                      {key === 'name' && competitor.url ? (
                        <a href={competitor.url} target="_blank" rel="noopener noreferrer">
                          {competitor.name} ↗
                        </a>
                      ) : (
                        competitor[key as keyof typeof competitor] || '—'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionEditor>
      <SectionEditor
        id="pitch"
        title={tr('pitch')}
        initial={{ salesPitch: sub.salesPitch || '', objections: sub.objections || [] }}
        save={save}
        editor={(draft, set) => (
          <>
            <Fields fields={[f('salesPitch', 6000)]} value={draft} onChange={set} />
            {rowEditor('objections', [f('question', 1000), f('answer', 6000)], { question: '', answer: '' })(
              draft,
              set,
            )}
          </>
        )}
      >
        {(sub.salesPitch || !!sub.objections?.length) && (
          <>
            <p className="dossier-prose">{sub.salesPitch}</p>
            {sub.objections?.map((item, i) => (
              <details key={i}>
                <summary>{item.question}</summary>
                <p className="dossier-prose">{item.answer}</p>
              </details>
            ))}
          </>
        )}
      </SectionEditor>
      <SectionEditor
        id="pilotage"
        title={tr('pilotage')}
        initial={{ pilotage: sub.pilotage || { goals: [], scorecard: [], decisions: [], cadence: [] } }}
        save={save}
        editor={(draft, set) => (
          <>
            {['goals', 'scorecard', 'decisions', 'cadence'].map((key) => (
              <div key={key}>
                <h3>{tr(key)}</h3>
                <RowsEditor
                  fields={[f('value')]}
                  empty={{ value: '' }}
                  rows={(draft.pilotage[key] || []).map((value: string) => ({ value }))}
                  onChange={(rows) => set({ pilotage: { ...draft.pilotage, [key]: rows.map((row) => row.value) } })}
                />
              </div>
            ))}
          </>
        )}
      >
        <div className="dossier-card-grid">
          {(['goals', 'scorecard', 'decisions', 'cadence'] as const).map((key) => (
            <div key={key}>
              <h3>{tr(key)}</h3>
              {sub.pilotage?.[key]?.length ? (
                <ul>
                  {sub.pilotage[key].map((value, i) => (
                    <li key={i}>{value}</li>
                  ))}
                </ul>
              ) : (
                <p className="dossier-empty">{tr('empty')}</p>
              )}
            </div>
          ))}
        </div>
      </SectionEditor>
      <SectionEditor
        id="dev"
        title={tr('dev')}
        initial={{ devProject: sub.devProject || '' }}
        save={(patch) => save({ devProject: patch.devProject || null })}
        editor={(draft, set) => (
          <label>
            {tr('devProject')}
            <select value={draft.devProject} onChange={(e) => set({ devProject: e.target.value })}>
              <option value="">{tr('none')}</option>
              {devProjects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.key} · {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
      >
        {sub.devSummary && (
          <>
            <Link className="dossier-button" to={sub.devSummary.href}>
              {sub.devSummary.key} · {sub.devSummary.name} ↗
            </Link>
            <div className="dossier-metrics">
              {(['open', 'inProgress', 'done'] as const).map((key) => (
                <div key={key}>
                  <span>{tr(key)}</span>
                  <strong>{sub.devSummary!.counts[key]}</strong>
                </div>
              ))}
            </div>
            {sub.devSummary.issues.map((issue) => (
              <p key={issue._id}>
                <Link to={issue.href}>
                  <code>{issue.identifier}</code> · {issue.title}
                </Link>{' '}
                <span className="dossier-chip">{enumLabel(issue.status)}</span>
              </p>
            ))}
          </>
        )}
      </SectionEditor>
      <SectionEditor
        id="resources"
        title={tr('resources')}
        initial={Object.fromEntries(
          [
            'productDescription',
            'serviceDescription',
            'businessModel',
            'businessPlan',
            'sections',
            'contacts',
            'infos',
            'links',
            'alerts',
          ].map((key) => [key, sub[key as keyof Subsidiary]]),
        )}
        save={save}
        editor={(draft, set) => (
          <>
            <Fields
              value={draft}
              onChange={set}
              fields={[
                f('productDescription', 12000),
                f('serviceDescription', 12000),
                f('businessModel', 12000),
                f('businessPlan', 12000),
              ]}
            />
            {[
              { key: 'sections', fields: [f('title'), f('content')], empty: { title: '', content: '' } },
              {
                key: 'contacts',
                fields: [f('name'), f('role'), f('email'), f('phone'), f('notes')],
                empty: { name: '', role: '', email: '', phone: '', notes: '' },
              },
              { key: 'infos', fields: [f('label'), f('value')], empty: { label: '', value: '' } },
              {
                key: 'links',
                fields: [
                  f('label'),
                  { ...f('url'), type: 'url' as const },
                  {
                    ...f('type'),
                    options: [
                      'repo',
                      'production',
                      'staging',
                      'analytics',
                      'hosting',
                      'dns',
                      'ci',
                      'design',
                      'docs',
                      'drive',
                      'other',
                    ],
                  },
                ],
                empty: { type: 'other', label: '', url: '' },
              },
              {
                key: 'alerts',
                fields: [f('label'), { ...f('level'), options: ['INFO', 'WARNING', 'CRITICAL'] }],
                empty: { label: '', level: 'INFO' },
              },
            ].map((group) => (
              <div key={group.key}>
                <h3>{tr(group.key)}</h3>
                {rowEditor(group.key, group.fields, group.empty)(draft, set)}
              </div>
            ))}
          </>
        )}
      >
        <LegacyResources sub={sub} onChange={onChange} />
      </SectionEditor>
    </>
  )
}
