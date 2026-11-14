import { STATUS_MAP } from './crm-board/constants'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Handshake, Plus } from 'lucide-react'
import CustomSelect from '../../components/admin/CustomSelect'
import {
  CrmBanner,
  CrmEmpty,
  CrmPageHead,
  CrmPanelCard,
  CrmSectionHead,
  CrmSidePanel,
  CrmWithPanel,
} from '../../components/admin/crm-ui'
import { Avatar } from './crm-board/rich/chips'
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
import './crm-board/suivre.css'

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
    <div className="crm-suivre-stack external-sales-page">
      <CrmPageHead
        title={t('shell.hub.crm.partenaires')}
        lede={
          <>
            {t('commercial.admin.ruleBefore', { rate: formatNumber(rateBp / 100) })}{' '}
            <Link className="crm-suivre-lede-link" to="/admin/crm/piloter/reglages">
              {t('commercial.admin.ruleLink')}
            </Link>
            .
          </>
        }
        actions={
          <Link className="crm-ui-btn crm-ui-btn--primary crm-ui-btn--big" to="/admin/comptes-admin/nouveau">
            <Plus aria-hidden="true" />
            {t('commercial.admin.invite')}
          </Link>
        }
      />

      {error && <div className="admin-error">{error}</div>}
      {info && <div className="admin-success">{info}</div>}

      <CrmWithPanel
        panel={
          <CrmSidePanel label={t('crmSuivre.partners.asideAria')}>
            <CrmBanner tone="blue" icon={<Handshake />} title={t('crmSuivre.partners.handoffTitle')}>
              {t('crmSuivre.partners.handoffBody')}
            </CrmBanner>
            <CrmPanelCard title={t('crmSuivre.partners.commissionTitle')} id="partners-commission">
              <p className="crm-suivre-panel-text">
                {t('crmSuivre.partners.commissionBody', { rate: formatNumber(rateBp / 100) })}
              </p>
            </CrmPanelCard>
          </CrmSidePanel>
        }
      >
        {!reps ? (
          <div className="admin-loading">{t('commercial.loading')}</div>
        ) : reps.length === 0 ? (
          <section className="crm-ui-card">
            <CrmEmpty title={t('commercial.admin.empty')} />
          </section>
        ) : (
          <section className="crm-ui-card crm-ui-card--flush" aria-labelledby="partners-team">
            <CrmSectionHead id="partners-team" title={t('crmSuivre.partners.team')} count={reps.length} />
            <div className="crm-suivre-tablewrap">
              <table className="crm-suivre-table">
                <thead>
                  <tr>
                    <th>{t('commercial.admin.colRep')}</th>
                    <th className="is-num">{t('commercial.admin.colLeads')}</th>
                    <th className="is-num">{t('commercial.admin.colHandedOff')}</th>
                    <th className="is-num">{t('commercial.admin.colConversion')}</th>
                    <th className="is-num">{t('commercial.admin.colCollected')}</th>
                    <th className="is-num">{t('commercial.admin.colDue')}</th>
                    <th className="is-num">{t('commercial.admin.colPaid')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reps.map((rep) => (
                    <tr
                      key={rep._id}
                      onClick={() => setSelectedId(rep._id)}
                      className={rep._id === selectedId ? 'is-selected' : undefined}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="crm-suivre-owner">
                          <Avatar name={rep.name} />
                          <button
                            type="button"
                            className="crm-suivre-name"
                            aria-pressed={rep._id === selectedId}
                            onClick={() => setSelectedId(rep._id)}
                          >
                            {rep.name}
                          </button>
                        </span>
                        <div className="crm-suivre-sub">
                          {rep.email}
                          {!rep.isActive && ` · ${t('commercial.admin.inactive')}`}
                        </div>
                      </td>
                      <td className="is-num">{rep.leads}</td>
                      <td className="is-num">{rep.handedOff}</td>
                      <td className="is-num">
                        {formatPercent(rep.conversionRate, { maximumFractionDigits: 0 })}{' '}
                        <span className="crm-suivre-dim">({rep.won})</span>
                      </td>
                      <td className="is-num">{formatCents(rep.collectedHtCents)}</td>
                      <td className="is-num">{formatCents(rep.dueCents)}</td>
                      <td className="is-num">{formatCents(rep.paidCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {detail && (
          <section className="crm-ui-card crm-suivre-detail" aria-label={t('crmSuivre.partners.detailAria')}>
            <div className="crm-suivre-detail__head">
              <h2>{detail.rep.name}</h2>
              <Link className="crm-ui-btn" to={`/admin/comptes-admin/${detail.rep._id}`}>
                {t('commercial.admin.manageAccount')}
              </Link>
            </div>
            <CallLists leads={detail.leads} />
            <div className="crm-suivre-seg" role="group" aria-label={t('crmSuivre.partners.detailAria')}>
              {tabs.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'leads' && (
              <>
                <div className="crm-suivre-toolrow">
                  <CustomSelect
                    className="commercial-select"
                    value={target}
                    onChange={setTarget}
                    options={targetOptions}
                  />
                  <button
                    type="button"
                    className="crm-ui-btn crm-ui-btn--primary"
                    disabled={busy || !target || checkedLeads.length === 0}
                    onClick={() => reassign('selection')}
                  >
                    {t('commercial.admin.reassignSelection', { count: checkedLeads.length })}
                  </button>
                  <button
                    type="button"
                    className="crm-ui-btn"
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
                <div className="crm-suivre-figures">
                  <div>
                    <span>{t('commercial.admin.colCollected')}</span>
                    <b>{formatCents(detail.totals.collectedHtCents)}</b>
                  </div>
                  <div>
                    <span>{t('commercial.admin.colDue')}</span>
                    <b>{formatCents(detail.totals.dueCents)}</b>
                  </div>
                  <div>
                    <span>{t('commercial.admin.colPaid')}</span>
                    <b>{formatCents(detail.totals.paidCents)}</b>
                  </div>
                </div>
                <div className="crm-suivre-toolrow">
                  <button
                    type="button"
                    className="crm-ui-btn crm-ui-btn--primary"
                    disabled={busy || checkedCommissions.length === 0}
                    onClick={() => markPaid('selection')}
                  >
                    {t('commercial.admin.markSelection', { count: checkedCommissions.length })}
                  </button>
                  <button
                    type="button"
                    className="crm-ui-btn"
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
              <ul className="crm-suivre-feed">
                {activity.length === 0 && <li className="crm-suivre-dim">{t('commercial.admin.noActivity')}</li>}
                {activity.map((item) => (
                  <li key={item._id}>
                    <span>
                      <strong>{item.leadId?.company ?? t('commercial.admin.deletedLead')}</strong> · {item.label}
                    </span>
                    <small>
                      {formatDateTime(item.createdAt)}
                      {item.actorId && ` · ${item.actorId.name}`}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </CrmWithPanel>
    </div>
  )
}

/** Listes d'appel du commercial, tirées de ses fiches : nombre de fiches et de fiches transmises au closer. */
function CallLists({ leads }: { leads: ExternalRepLead[] }) {
  const { t } = useI18n()
  const lists = new Map<string, { leads: number; handedOff: number }>()
  for (const lead of leads) {
    const row = lists.get(lead.callList ?? '') ?? { leads: 0, handedOff: 0 }
    row.leads += 1
    if (lead.closingHandoff) row.handedOff += 1
    lists.set(lead.callList ?? '', row)
  }
  // Les listes par nom, les fiches hors liste en dernier.
  const rows = [...lists].sort(([a], [b]) => (a ? (b ? a.localeCompare(b) : -1) : 1))
  return (
    <section aria-labelledby="partners-lists">
      <CrmSectionHead id="partners-lists" title={t('crmSuivre.partners.lists')} count={rows.length} compact level={3} />
      {rows.length === 0 ? (
        <p className="crm-suivre-dim">{t('crmSuivre.partners.noLists')}</p>
      ) : (
        <div className="crm-suivre-tablewrap">
          <table className="crm-suivre-table">
            <thead>
              <tr>
                <th>{t('crmSuivre.partners.listName')}</th>
                <th className="is-num">{t('crmSuivre.partners.listLeads')}</th>
                <th className="is-num">{t('crmSuivre.partners.listHandedOff')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, row]) => (
                <tr key={name || '-'}>
                  <td>{name || <span className="crm-suivre-dim">{t('crmSuivre.partners.noList')}</span>}</td>
                  <td className="is-num">{row.leads}</td>
                  <td className="is-num">{row.handedOff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  if (leads.length === 0) return <p className="crm-suivre-dim">{t('commercial.admin.noLeads')}</p>
  return (
    <div className="crm-suivre-tablewrap">
      <table className="crm-suivre-table">
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
                <Link className="crm-suivre-name" to={`/admin/crm/leads/${lead._id}`}>
                  {lead.company}
                </Link>
                {lead.contactName && <div className="crm-suivre-sub">{lead.contactName}</div>}
              </td>
              <td>
                <span
                  className="crm-ui-chip"
                  style={{ '--crm-ui-tone': STATUS_MAP[lead.status]?.color || 'var(--text-muted)' } as CSSProperties}
                >
                  <span className="crm-ui-dot" aria-hidden="true" />
                  {t(STATUS_LABEL_KEYS[lead.status])}
                </span>
                {lead.closingHandoff && (
                  <div className="crm-suivre-sub">
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
  if (commissions.length === 0) return <p className="crm-suivre-dim">{t('commercial.admin.noCommissions')}</p>
  return (
    <div className="crm-suivre-tablewrap">
      <table className="crm-suivre-table">
        <thead>
          <tr>
            <th aria-label={t('commercial.admin.selection')} />
            <th>{t('commercial.admin.colDate')}</th>
            <th>{t('commercial.admin.colInvoice')}</th>
            <th className="is-num">{t('commercial.admin.colCollected')}</th>
            <th className="is-num">{t('commercial.admin.colAmount')}</th>
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
                <div className="crm-suivre-sub">
                  {line.invoice?.number}
                  {line.kind === 'REFUND' && ` · ${t('commercial.commissions.refund')}`}
                </div>
              </td>
              <td className="is-num">{formatCents(line.baseHtCents)}</td>
              <td className="is-num">{formatCents(line.amountCents)}</td>
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
