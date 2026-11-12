import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import { useI18n } from '../../context/I18nContext'
import {
  commercialApi,
  formatDay,
  REP_EDITABLE_STATUSES,
  STATUS_LABEL_KEYS,
  type RepLead,
  type RepLeadInput,
} from '../../services/externalSales'

const EMPTY_LEAD: RepLeadInput = { company: '', contactName: '', contactEmail: '', contactPhone: '', source: '' }

export function LeadStatusBadge({ lead }: { lead: Pick<RepLead, 'status' | 'handedOffAt'> }) {
  const { t } = useI18n()
  if (lead.handedOffAt && !['WON', 'LOST'].includes(lead.status)) {
    return <span className="admin-badge status-en-attente">{t('commercial.leads.handedOff')}</span>
  }
  const tone = lead.status === 'WON' ? 'status-termine' : lead.status === 'LOST' ? '' : 'status-en-cours'
  return <span className={`admin-badge ${tone}`}>{t(STATUS_LABEL_KEYS[lead.status])}</span>
}

const CommercialLeads = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<RepLead[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<RepLeadInput>(EMPTY_LEAD)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setLeads((await commercialApi.leads({ search, status })).leads)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { lead } = await commercialApi.createLead(form)
      navigate(`/commercial/leads/${lead._id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof RepLeadInput) => ({
    className: 'portal-input',
    value: String(form[key] ?? ''),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }),
  })

  const statusOptions = [
    { value: '', label: t('commercial.leads.allStatuses') },
    ...Object.entries(STATUS_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) })),
  ]
  const exportQuery = new URLSearchParams(
    Object.entries({ search, status }).filter(([, value]) => value) as [string, string][],
  )

  return (
    <>
      <div className="commercial-toolbar">
        <input
          className="portal-input"
          type="search"
          placeholder={t('commercial.leads.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('commercial.leads.searchLabel')}
        />
        <CustomSelect className="commercial-select" value={status} onChange={setStatus} options={statusOptions} />
        <a
          className="portal-button secondary"
          href={`/api/commercial/leads/export${exportQuery.size ? `?${exportQuery}` : ''}`}
          download
        >
          {t('commercial.leads.export')}
        </a>
        <button type="button" className="portal-button" onClick={() => setCreating(!creating)}>
          {creating ? t('commercial.leads.cancel') : t('commercial.leads.new')}
        </button>
      </div>

      {creating && (
        <form className="portal-card" onSubmit={handleCreate}>
          <div className="commercial-form-grid">
            <label className="commercial-wide">
              {t('commercial.field.companyRequired')}
              <input {...field('company')} required />
            </label>
            <label>
              {t('commercial.field.contact')}
              <input {...field('contactName')} />
            </label>
            <label>
              {t('commercial.field.email')}
              <input {...field('contactEmail')} type="email" />
            </label>
            <label>
              {t('commercial.field.phone')}
              <input {...field('contactPhone')} />
            </label>
            <label>
              {t('commercial.field.source')}
              <input {...field('source')} placeholder={t('commercial.field.sourcePlaceholder')} />
            </label>
          </div>
          <div className="admin-button-group" style={{ marginTop: 16 }}>
            <button className="portal-button" type="submit" disabled={saving}>
              {saving ? t('commercial.leads.creating') : t('commercial.leads.create')}
            </button>
          </div>
        </form>
      )}

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">{t('commercial.loading')}</div>
      ) : leads.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state-text">
            {search || status ? t('commercial.leads.noMatch') : t('commercial.leads.empty')}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrapper commercial-leads-list">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('commercial.leads.colCompany')}</th>
                <th>{t('commercial.leads.colStatus')}</th>
                <th>{t('commercial.leads.colNextAction')}</th>
                <th>{t('commercial.leads.colUpdated')}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id}>
                  <td data-label={t('commercial.leads.colCompany')}>
                    <Link className="commercial-link" to={`/commercial/leads/${lead._id}`}>
                      {lead.company}
                    </Link>
                    {lead.contactName && <div className="commercial-muted">{lead.contactName}</div>}
                  </td>
                  <td data-label={t('commercial.leads.colStatus')}>
                    <LeadStatusBadge lead={lead} />
                  </td>
                  <td data-label={t('commercial.leads.colNextAction')}>{formatDay(lead.nextActionAt)}</td>
                  <td className="commercial-lead-updated" data-label={t('commercial.leads.colUpdated')}>
                    {formatDay(lead.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="commercial-muted">
        {t('commercial.leads.statusHint', {
          statuses: REP_EDITABLE_STATUSES.map((key) => t(STATUS_LABEL_KEYS[key])).join(', '),
        })}
      </p>
    </>
  )
}

export default CommercialLeads
