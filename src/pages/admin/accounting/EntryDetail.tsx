import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { getEntry, validateEntry, deleteEntry, listAuditLogForEntity } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { IAccountingEntry, IAccountingLine, IAuditEntry } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatDate, formatDateTime, formatMoney } from '../../../i18n/format'

const EntryDetail = () => {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)

  const [entry, setEntry] = useState<IAccountingEntry | null>(null)
  const [lines, setLines] = useState<IAccountingLine[]>([])
  const [auditEvents, setAuditEvents] = useState<IAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    if (!id) return
    setLoading(true)
    try {
      const r = await getEntry(id)
      setEntry(r.entry)
      setLines(r.lines || [])
      try {
        const auditR = await listAuditLogForEntity('AccountingEntry', id)
        setAuditEvents(auditR.items || auditR.logs || [])
      } catch {
        setAuditEvents([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleValidate() {
    if (!id) return
    if (!confirm(t('accAccounts.entry.confirmValidate'))) return
    try {
      await validateEntry(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm(t('accAccounts.entry.confirmDeleteDraft'))) return
    try {
      await deleteEntry(id)
      navigate('/admin/comptabilite/ecritures')
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  if (loading || !entry) {
    return (
      <AccountingLayout title={t('accAccounts.entry.title')}>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
      </AccountingLayout>
    )
  }

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0)

  return (
    <AccountingLayout
      title={entry.entryNumber}
      subtitle={`${entry.label} — ${formatDate(entry.date)}`}
      actions={
        <>
          <Link to="/admin/comptabilite/ecritures" className="portal-button secondary">
            {t('accAccounts.entry.backToList')}
          </Link>
          {entry.status === 'DRAFT' && canManage && (
            <>
              <button className="portal-button" onClick={handleValidate}>
                {t('accAccounts.entry.validate')}
              </button>
              <button
                className="portal-button secondary"
                onClick={handleDelete}
                style={{ borderColor: 'rgba(248,113,113,0.4)' }}
              >
                {t('accAccounts.entry.deleteDraft')}
              </button>
            </>
          )}
        </>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <h2>{t('accAccounts.entry.details')}</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.number')}</label>
            <div className="code" style={{ fontSize: '1rem' }}>
              {entry.entryNumber}
            </div>
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.journal')}</label>
            <div className="code">{entry.journalCode}</div>
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.date')}</label>
            <div>{formatDate(entry.date)}</div>
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.status')}</label>
            <div>
              <span className={`accounting-badge ${entry.status.toLowerCase()}`}>{entry.status}</span>
            </div>
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.source')}</label>
            <div>
              <span className={`accounting-badge ${entry.source === 'EXTERNAL' ? 'source-external' : 'locked'}`}>
                {entry.source}
              </span>
            </div>
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.piece')}</label>
            <div className="code">{entry.pieceRef || '—'}</div>
          </div>
          <div className="accounting-form-field full">
            <label>{t('accAccounts.col.label')}</label>
            <div>{entry.label}</div>
          </div>
          {entry.notes && (
            <div className="accounting-form-field full">
              <label>{t('accAccounts.col.notes')}</label>
              <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.7)' }}>{entry.notes}</div>
            </div>
          )}
        </div>
      </section>

      <section className="accounting-card">
        <h2>{t('accAccounts.entry.lines')}</h2>
        <table className="accounting-table">
          <thead>
            <tr>
              <th>{t('accAccounts.col.account')}</th>
              <th>{t('accAccounts.col.label')}</th>
              <th className="amount">{t('accAccounts.col.debit')}</th>
              <th className="amount">{t('accAccounts.col.credit')}</th>
              <th>{t('accAccounts.col.reconciliation')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l._id}>
                <td>
                  <span className="code">{l.accountCode}</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>— {l.accountLabel}</span>
                </td>
                <td>{l.label}</td>
                <td className="amount">{formatMoney(Number(l.debit))}</td>
                <td className="amount">{formatMoney(Number(l.credit))}</td>
                <td className="code">{l.lettrage || '—'}</td>
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                style={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  fontSize: '0.78rem',
                  letterSpacing: '0.5px',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                {t('accAccounts.entry.totals')}
              </td>
              <td className="amount" style={{ fontWeight: 700 }}>
                {formatMoney(totalDebit)}
              </td>
              <td className="amount" style={{ fontWeight: 700 }}>
                {formatMoney(totalCredit)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </section>

      {auditEvents.length > 0 && (
        <section className="accounting-card">
          <h2>{t('accAccounts.entry.auditHistory')}</h2>
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('accAccounts.col.date')}</th>
                <th>{t('accAccounts.entry.auditAction')}</th>
                <th>{t('accAccounts.entry.auditActor')}</th>
                <th>{t('accAccounts.col.details')}</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((ev) => (
                <tr key={ev._id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.7)' }}>
                    {formatDateTime(ev.createdAt, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td>
                    <span className="accounting-badge source-external">{ev.action}</span>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {ev.actor?.userEmail || ev.actor?.externalSourceSlug || ev.actor?.type || '—'}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{ev.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </AccountingLayout>
  )
}

export default EntryDetail
