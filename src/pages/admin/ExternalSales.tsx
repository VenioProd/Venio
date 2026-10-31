import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import CustomSelect from '../../components/admin/CustomSelect'
import { useI18n } from '../../context/I18nContext'
import { formatDateTime, formatNumber, formatPercent } from '../../i18n/format'
import {
  externalSalesAdminApi,
  formatCents,
  formatDay,
  STATUS_LABEL_KEYS,
  type ExternalRepActivity,
  type ExternalRepCommission,
  type ExternalRepLead,
  type ExternalRepRow,
} from '../../services/externalSales'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import '../commercial/CommercialSpace.css'

type Tab = 'leads' | 'commissions' | 'journal'
type RepDetail = Awaited<ReturnType<typeof externalSalesAdminApi.rep>>
// Valeur du destinataire « l'équipe » : distincte de l'absence de choix.
const TEAM = 'TEAM'

/** Pilotage des commerciaux externes : tableau, fiches, commissions, journal. */
const ExternalSales = () => {
  const { t } = useI18n()
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
      return t('commercial.admin.reassigned', { count: moved })
    })

  const markPaid = (scope: 'selection' | 'all') =>
    run(async () => {
      const { paid } = await externalSalesAdminApi.markPaid(
        scope === 'all' ? { rep: selectedId! } : { ids: checkedCommissions },
      )
      return t('commercial.admin.marked', { count: paid })
    })

  const targetOptions = [
    { value: '', label: t('commercial.admin.chooseTarget') },
    { value: TEAM, label: t('commercial.admin.toTeam') },
    ...(reps ?? [])
      .filter((rep) => rep._id !== selectedId && rep.isActive)
      .map((rep) => ({ value: rep._id, label: rep.name })),
  ]
  const tabs: [Tab, string][] = [
    ['leads', t('commercial.admin.tabLeads', { count: detail?.leads.length ?? 0 })],
    ['commissions', t('commercial.admin.tabCommissions')],
    ['journal', t('commercial.admin.tabJournal')],
  ]

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">{t('commercial.admin.breadcrumb')}</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{t('commercial.admin.title')}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>{t('commercial.admin.title')}</h1>
          <Link className="portal-button" to="/admin/comptes-admin/nouveau">
            {t('commercial.admin.invite')}
          </Link>
        </div>
        <p className="commercial-muted">
          {t('commercial.admin.ruleBefore', { rate: formatNumber(rateBp / 100) })}{' '}
          <Link className="commercial-link" to="/admin/crm/settings">
            {t('commercial.admin.ruleLink')}
          </Link>
          .
        </p>
      </div>

      {error && <div className="admin-error">{error}</div>}
      {info && <div className="admin-success">{info}</div>}

      {!reps ? (
        <div className="admin-loading">{t('commercial.loading')}</div>
      ) : reps.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state-text">{t('commercial.admin.empty')}</p>
        </div>
      ) : (
        <div className="admin-table-wrapper" style={{ marginTop: 24 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('commercial.admin.colRep')}</th>
                <th className="commercial-amount">{t('commercial.admin.colLeads')}</th>
                <th className="commercial-amount">{t('commercial.admin.colHandedOff')}</th>
                <th className="commercial-amount">{t('commercial.admin.colConversion')}</th>
                <th className="commercial-amount">{t('commercial.admin.colCollected')}</th>
                <th className="commercial-amount">{t('commercial.admin.colDue')}</th>
                <th className="commercial-amount">{t('commercial.admin.colPaid')}</th>
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
                      {!rep.isActive && ` · ${t('commercial.admin.inactive')}`}
                    </div>
                  </td>
                  <td className="commercial-amount">{rep.leads}</td>
                  <td className="commercial-amount">{rep.handedOff}</td>
                  <td className="commercial-amount">
                    {formatPercent(rep.conversionRate, { maximumFractionDigits: 0 })}{' '}
                    <span className="commercial-muted">({rep.won})</span>
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
              {t('commercial.admin.manageAccount')}
            </Link>
          </div>
          <div className="admin-tabs">
            {tabs.map(([key, label]) => (
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
                  {t('commercial.admin.reassignSelection', { count: checkedLeads.length })}
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={busy || !target || detail.leads.length === 0}
                  onClick={() => {
                    const question = t('commercial.admin.reassignAllConfirm', {
                      count: detail.leads.length,
                      name: detail.rep.name,
                    })
                    if (window.confirm(question)) reassign('all')
                  }}
                >
                  {t('commercial.admin.reassignAll')}
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
                  <span className="commercial-muted">{t('commercial.admin.colCollected')}</span>
                  <span className="commercial-stat-value">{formatCents(detail.totals.collectedHtCents)}</span>
                </div>
                <div className="commercial-stat">
                  <span className="commercial-muted">{t('commercial.admin.colDue')}</span>
                  <span className="commercial-stat-value">{formatCents(detail.totals.dueCents)}</span>
                </div>
                <div className="commercial-stat">
                  <span className="commercial-muted">{t('commercial.admin.colPaid')}</span>
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
                  {t('commercial.admin.markSelection', { count: checkedCommissions.length })}
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  disabled={busy || detail.totals.dueCents === 0}
                  onClick={() => {
                    const question = t('commercial.admin.markAllConfirm', {
                      amount: formatCents(detail.totals.dueCents),
                    })
                    if (window.confirm(question)) markPaid('all')
                  }}
                >
                  {t('commercial.admin.markAll')}
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
              {activity.length === 0 && <li className="commercial-muted">{t('commercial.admin.noActivity')}</li>}
              {activity.map((item) => (
                <li key={item._id}>
                  <strong>{item.leadId?.company ?? t('commercial.admin.deletedLead')}</strong> · {item.label}
                  <small>
                    {formatDateTime(item.createdAt)}
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
  const { t } = useI18n()
  if (leads.length === 0) return <p className="commercial-muted">{t('commercial.admin.noLeads')}</p>
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th aria-label={t('commercial.admin.selection')} />
            <th>{t('commercial.admin.colCompany')}</th>
            <th>{t('commercial.admin.colStatus')}</th>
            <th>{t('commercial.admin.colOwner')}</th>
            <th>{t('commercial.admin.colUpdated')}</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead._id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={t('commercial.admin.selectLead', { company: lead.company })}
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
                {t(STATUS_LABEL_KEYS[lead.status])}
                {lead.closingHandoff && (
                  <div className="commercial-muted">
                    {t('commercial.admin.handedOffOn', { date: formatDay(lead.closingHandoff.at) })}
                  </div>
                )}
              </td>
              <td>{lead.assignedTo?.name ?? '—'}</td>
              <td>{formatDay(lead.updatedAt)}</td>
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
  const { t } = useI18n()
  if (commissions.length === 0) return <p className="commercial-muted">{t('commercial.admin.noCommissions')}</p>
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th aria-label={t('commercial.admin.selection')} />
            <th>{t('commercial.admin.colDate')}</th>
            <th>{t('commercial.admin.colInvoice')}</th>
            <th className="commercial-amount">{t('commercial.admin.colCollected')}</th>
            <th className="commercial-amount">{t('commercial.admin.colAmount')}</th>
            <th>{t('commercial.admin.colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {commissions.map((line) => (
            <tr key={line._id}>
              <td>
                {line.status === 'DUE' && (
                  <input
                    type="checkbox"
                    aria-label={t('commercial.admin.selectCommission')}
                    checked={checked.includes(line._id)}
                    onChange={() => onToggle(line._id)}
                  />
                )}
              </td>
              <td>{formatDay(line.receivedAt)}</td>
              <td>
                {line.client?.companyName || line.client?.name}
                <div className="commercial-muted">
                  {line.invoice?.number}
                  {line.kind === 'REFUND' && ` · ${t('commercial.commissions.refund')}`}
                </div>
              </td>
              <td className="commercial-amount">{formatCents(line.baseHtCents)}</td>
              <td className="commercial-amount">{formatCents(line.amountCents)}</td>
              <td>
                {line.status === 'PAID'
                  ? line.paidBy
                    ? t('commercial.admin.paidBy', { date: formatDay(line.paidAt), name: line.paidBy.name })
                    : t('commercial.admin.paidOn', { date: formatDay(line.paidAt) })
                  : t('commercial.admin.due')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ExternalSales
