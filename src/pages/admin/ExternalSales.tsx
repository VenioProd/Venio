import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import {
  externalSalesAdminApi,
  formatCents,
  formatDate,
  STATUS_LABELS,
  type ExternalRepActivity,
  type ExternalRepCommission,
  type ExternalRepLead,
  type ExternalRepRow,
} from '../../services/externalSales'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import '../commercial/CommercialSpace.css'

type Tab = 'leads' | 'commissions' | 'journal'
// Valeur du destinataire « l'équipe » : distincte de l'absence de choix.
const TEAM = 'TEAM'
type RepDetail = Awaited<ReturnType<typeof externalSalesAdminApi.rep>>

/** Pilotage des commerciaux externes : tableau, fiches, commissions, journal. */
const ExternalSales = () => {
  const [reps, setReps] = useState<ExternalRepRow[] | null>(null)
  const [rateBp, setRateBp] = useState(1000)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RepDetail | null>(null)
  const [activity, setActivity] = useState<ExternalRepActivity[]>([])
  const [tab, setTab] = useState<Tab>('leads')
  const [checkedLeads, setCheckedLeads] = useState<string[]>([])
  const [checkedCommissions, setCheckedCommissions] = useState<string[]>([])
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const loadBoard = useCallback(async () => {
    try {
      const data = await externalSalesAdminApi.reps()
      setReps(data.reps)
      setRateBp(data.rateBp)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const loadRep = useCallback(async (id: string) => {
    const [repData, activityData] = await Promise.all([
      externalSalesAdminApi.rep(id),
      externalSalesAdminApi.activity(id),
    ])
    setDetail(repData)
    setActivity(activityData.activities)
    setCheckedLeads([])
    setCheckedCommissions([])
  }, [])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  useEffect(() => {
    if (selectedId) loadRep(selectedId).catch((err: Error) => setError(err.message))
  }, [selectedId, loadRep])

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      setInfo(await action())
      await loadBoard()
      if (selectedId) await loadRep(selectedId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id]

  const reassign = (scope: 'selection' | 'all') =>
    run(async () => {
      const toRep = target === TEAM ? null : target
      const { moved } = await externalSalesAdminApi.reassign(
        scope === 'all' ? { fromRep: selectedId!, toRep } : { leadIds: checkedLeads, toRep },
      )
      return `${moved} fiche(s) réattribuée(s)`
    })

  const markPaid = (scope: 'selection' | 'all') =>
    run(async () => {
      const { paid } = await externalSalesAdminApi.markPaid(
        scope === 'all' ? { rep: selectedId! } : { ids: checkedCommissions },
      )
      return `${paid} commission(s) marquée(s) versée(s)`
    })

  const targetOptions = [
    { value: '', label: 'Choisir le destinataire…' },
    { value: TEAM, label: "Rendre à l'équipe" },
    ...(reps ?? [])
      .filter((rep) => rep._id !== selectedId && rep.isActive)
      .map((rep) => ({ value: rep._id, label: rep.name })),
  ]

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Commerciaux externes</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>Commerciaux externes</h1>
          <Link className="portal-button" to="/admin/comptes-admin/nouveau">
            Inviter un commercial
          </Link>
        </div>
        <p className="commercial-muted">
          Commission de {rateBp / 100} % sur le HT encaissé des clients issus de leurs leads. Le closer qui reçoit les
          dossiers se règle dans{' '}
          <Link className="commercial-link" to="/admin/crm/settings">
            les paramètres CRM
          </Link>
          .
        </p>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {info && <div className="admin-success">{info}</div>}

      {!reps ? (
        <div className="admin-loading">Chargement…</div>
      ) : reps.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state-text">Aucun commercial externe pour l’instant.</p>
        </div>
      ) : (
        <div className="admin-table-wrapper" style={{ marginTop: 24 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Commercial</th>
                <th className="commercial-amount">Leads</th>
                <th className="commercial-amount">Transmis</th>
                <th className="commercial-amount">Conversion</th>
                <th className="commercial-amount">Encaissé HT</th>
                <th className="commercial-amount">Dû</th>
                <th className="commercial-amount">Versé</th>
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => (
                <tr
                  key={rep._id}
                  onClick={() => setSelectedId(rep._id)}
                  style={{
                    cursor: 'pointer',
                    outline: rep._id === selectedId ? '1px solid var(--accent-border-strong)' : 'none',
                  }}
                >
                  <td>
                    <button type="button" className="commercial-link" onClick={() => setSelectedId(rep._id)}>
                      {rep.name}
                    </button>
                    <div className="commercial-muted">
                      {rep.email}
                      {!rep.isActive && ' · désactivé'}
                    </div>
                  </td>
                  <td className="commercial-amount">{rep.leads}</td>
                  <td className="commercial-amount">{rep.handedOff}</td>
                  <td className="commercial-amount">
                    {Math.round(rep.conversionRate * 100)} % <span className="commercial-muted">({rep.won})</span>
                  </td>
                  <td className="commercial-amount">{formatCents(rep.collectedHtCents)}</td>
                  <td className="commercial-amount">{formatCents(rep.dueCents)}</td>
                  <td className="commercial-amount">{formatCents(rep.paidCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="portal-card" style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>{detail.rep.name}</h2>
            <Link className="portal-button secondary" to={`/admin/comptes-admin/${detail.rep._id}`}>
              Gérer le compte
            </Link>
          </div>
          <div className="admin-tabs">
            {(
              [
                ['leads', `Fiches (${detail.leads.length})`],
                ['commissions', 'Commissions'],
                ['journal', 'Journal'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`admin-tab${tab === key ? ' active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'leads' && (
            <>
              <div className="commercial-toolbar">
                <CustomSelect
                  className="commercial-select"
                  value={target}
                  onChange={setTarget}
                  options={targetOptions}
                />
                <button
                  type="button"
                  className="portal-button"
                  disabled={busy || !target || checkedLeads.length === 0}
                  onClick={() => reassign('selection')}
                >
                  Réattribuer la sélection ({checkedLeads.length})
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={busy || !target || detail.leads.length === 0}
                  onClick={() => {
                    if (window.confirm(`Réattribuer les ${detail.leads.length} fiches de ${detail.rep.name} ?`)) {
                      reassign('all')
                    }
                  }}
                >
                  Tout réattribuer
                </button>
              </div>
              <LeadsTable
                leads={detail.leads}
                checked={checkedLeads}
                onToggle={(id) => setCheckedLeads(toggle(checkedLeads, id))}
              />
            </>
          )}

          {tab === 'commissions' && (
            <>
              <div className="commercial-stats">
                <div className="commercial-stat">
                  <span className="commercial-muted">Encaissé HT</span>
                  <span className="commercial-stat-value">{formatCents(detail.totals.collectedHtCents)}</span>
                </div>
                <div className="commercial-stat">
                  <span className="commercial-muted">Dû</span>
                  <span className="commercial-stat-value">{formatCents(detail.totals.dueCents)}</span>
                </div>
                <div className="commercial-stat">
                  <span className="commercial-muted">Versé</span>
                  <span className="commercial-stat-value">{formatCents(detail.totals.paidCents)}</span>
                </div>
              </div>
              <div className="commercial-toolbar">
                <button
                  type="button"
                  className="portal-button"
                  disabled={busy || checkedCommissions.length === 0}
                  onClick={() => markPaid('selection')}
                >
                  Marquer la sélection versée ({checkedCommissions.length})
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={busy || detail.totals.dueCents === 0}
                  onClick={() => {
                    if (window.confirm(`Marquer versé tout le dû (${formatCents(detail.totals.dueCents)}) ?`)) {
                      markPaid('all')
                    }
                  }}
                >
                  Tout le dû est versé
                </button>
              </div>
              <CommissionsTable
                commissions={detail.commissions}
                checked={checkedCommissions}
                onToggle={(id) => setCheckedCommissions(toggle(checkedCommissions, id))}
              />
            </>
          )}

          {tab === 'journal' && (
            <ul className="commercial-timeline">
              {activity.length === 0 && <li className="commercial-muted">Aucune activité.</li>}
              {activity.map((item) => (
                <li key={item._id}>
                  <strong>{item.leadId?.company ?? 'Fiche supprimée'}</strong> · {item.label}
                  <small>
                    {new Date(item.createdAt).toLocaleString('fr-FR')}
                    {item.actorId && ` · ${item.actorId.name}`}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function LeadsTable({
  leads,
  checked,
  onToggle,
}: {
  leads: ExternalRepLead[]
  checked: string[]
  onToggle: (id: string) => void
}) {
  if (leads.length === 0) return <p className="commercial-muted">Aucune fiche.</p>
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th aria-label="Sélection" />
            <th>Entreprise</th>
            <th>Statut</th>
            <th>Suivi par</th>
            <th>Mis à jour</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead._id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Sélectionner ${lead.company}`}
                  checked={checked.includes(lead._id)}
                  onChange={() => onToggle(lead._id)}
                />
              </td>
              <td>
                <Link className="commercial-link" to={`/admin/crm/leads/${lead._id}`}>
                  {lead.company}
                </Link>
                {lead.contactName && <div className="commercial-muted">{lead.contactName}</div>}
              </td>
              <td>
                {STATUS_LABELS[lead.status]}
                {lead.closingHandoff && (
                  <div className="commercial-muted">Transmis le {formatDate(lead.closingHandoff.at)}</div>
                )}
              </td>
              <td>{lead.assignedTo?.name ?? '—'}</td>
              <td>{formatDate(lead.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CommissionsTable({
  commissions,
  checked,
  onToggle,
}: {
  commissions: ExternalRepCommission[]
  checked: string[]
  onToggle: (id: string) => void
}) {
  if (commissions.length === 0) return <p className="commercial-muted">Aucune commission.</p>
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th aria-label="Sélection" />
            <th>Date</th>
            <th>Client · facture</th>
            <th className="commercial-amount">Encaissé HT</th>
            <th className="commercial-amount">Commission</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((line) => (
            <tr key={line._id}>
              <td>
                {line.status === 'DUE' && (
                  <input
                    type="checkbox"
                    aria-label="Sélectionner la commission"
                    checked={checked.includes(line._id)}
                    onChange={() => onToggle(line._id)}
                  />
                )}
              </td>
              <td>{formatDate(line.receivedAt)}</td>
              <td>
                {line.client?.companyName || line.client?.name}
                <div className="commercial-muted">
                  {line.invoice?.number}
                  {line.kind === 'REFUND' && ' · remboursement'}
                </div>
              </td>
              <td className="commercial-amount">{formatCents(line.baseHtCents)}</td>
              <td className="commercial-amount">{formatCents(line.amountCents)}</td>
              <td>
                {line.status === 'PAID'
                  ? `Versée le ${formatDate(line.paidAt)}${line.paidBy ? ` par ${line.paidBy.name}` : ''}`
                  : 'Due'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ExternalSales
