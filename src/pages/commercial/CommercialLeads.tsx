import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import {
  commercialApi,
  formatDate,
  REP_EDITABLE_STATUSES,
  STATUS_LABELS,
  type RepLead,
  type RepLeadInput,
} from '../../services/externalSales'

const EMPTY_LEAD: RepLeadInput = { company: '', contactName: '', contactEmail: '', contactPhone: '', source: '' }

const statusOptions = [
  { value: '', label: 'Tous les statuts' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

export function LeadStatusBadge({ lead }: { lead: Pick<RepLead, 'status' | 'handedOffAt'> }) {
  if (lead.handedOffAt && !['WON', 'LOST'].includes(lead.status)) {
    return <span className="admin-badge status-en-attente">Transmis</span>
  }
  const tone = lead.status === 'WON' ? 'status-termine' : lead.status === 'LOST' ? '' : 'status-en-cours'
  return <span className={`admin-badge ${tone}`}>{STATUS_LABELS[lead.status]}</span>
}

const CommercialLeads = () => {
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

  const exportQuery = new URLSearchParams(
    Object.entries({ search, status }).filter(([, value]) => value) as [string, string][],
  )

  return (
    <>
      <div className="commercial-toolbar">
        <input
          className="portal-input"
          type="search"
          placeholder="Rechercher une entreprise, un contact…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Rechercher"
        />
        <CustomSelect className="commercial-select" value={status} onChange={setStatus} options={statusOptions} />
        <a
          className="portal-button secondary"
          href={`/api/commercial/leads/export${exportQuery.size ? `?${exportQuery}` : ''}`}
          download
        >
          Exporter
        </a>
        <button type="button" className="portal-button" onClick={() => setCreating(!creating)}>
          {creating ? 'Annuler' : 'Nouveau lead'}
        </button>
      </div>

      {creating && (
        <form className="portal-card" onSubmit={handleCreate}>
          <div className="commercial-form-grid">
            <label className="commercial-wide">
              Entreprise *
              <input {...field('company')} required />
            </label>
            <label>
              Contact
              <input {...field('contactName')} />
            </label>
            <label>
              Email
              <input {...field('contactEmail')} type="email" />
            </label>
            <label>
              Téléphone
              <input {...field('contactPhone')} />
            </label>
            <label>
              Source
              <input {...field('source')} placeholder="Réseau, salon, recommandation…" />
            </label>
          </div>
          <div className="admin-button-group" style={{ marginTop: 16 }}>
            <button className="portal-button" type="submit" disabled={saving}>
              {saving ? 'Création…' : 'Créer le lead'}
            </button>
          </div>
        </form>
      )}

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <div className="admin-loading">Chargement…</div>
      ) : leads.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state-text">
            {search || status ? 'Aucun lead ne correspond.' : 'Aucun lead pour l’instant. Créez le premier.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Entreprise</th>
                <th>Statut</th>
                <th>Prochaine action</th>
                <th>Mis à jour</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead._id}>
                  <td>
                    <Link className="commercial-link" to={`/commercial/leads/${lead._id}`}>
                      {lead.company}
                    </Link>
                    {lead.contactName && <div className="commercial-muted">{lead.contactName}</div>}
                  </td>
                  <td>
                    <LeadStatusBadge lead={lead} />
                  </td>
                  <td>{formatDate(lead.nextActionAt)}</td>
                  <td>{formatDate(lead.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="commercial-muted">
        Statuts que vous pouvez poser : {REP_EDITABLE_STATUSES.map((key) => STATUS_LABELS[key]).join(', ')}. La
        proposition et la signature reviennent à l’équipe une fois le dossier transmis.
      </p>
    </>
  )
}

export default CommercialLeads
