import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import AccountingLayout from './AccountingLayout'
import { downloadFec, listFiscalYears } from '../../../services/accounting'
import type { IFiscalYear } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'
import { formatDate as formatDateIntl } from '../../../i18n/format'

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  return formatDateIntl(d) || '—'
}

/** Renders `**bold**` segments and `{slot}` placeholders of a translated sentence. */
function renderRich(text: string, slots: Record<string, ReactNode> = {}): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\{\w+\})/).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    const slot = /^\{(\w+)\}$/.exec(part)
    if (slot && slot[1] in slots) return <Fragment key={i}>{slots[slot[1]]}</Fragment>
    return part
  })
}

const FEC_COLUMNS: { code: string; labelKey: MessageKey }[] = [
  { code: 'JournalCode', labelKey: 'accAccounts.fec.col.JournalCode' },
  { code: 'JournalLib', labelKey: 'accAccounts.fec.col.JournalLib' },
  { code: 'EcritureNum', labelKey: 'accAccounts.fec.col.EcritureNum' },
  { code: 'EcritureDate', labelKey: 'accAccounts.fec.col.EcritureDate' },
  { code: 'CompteNum', labelKey: 'accAccounts.fec.col.CompteNum' },
  { code: 'CompteLib', labelKey: 'accAccounts.fec.col.CompteLib' },
  { code: 'CompAuxNum', labelKey: 'accAccounts.fec.col.CompAuxNum' },
  { code: 'CompAuxLib', labelKey: 'accAccounts.fec.col.CompAuxLib' },
  { code: 'PieceRef', labelKey: 'accAccounts.fec.col.PieceRef' },
  { code: 'PieceDate', labelKey: 'accAccounts.fec.col.PieceDate' },
  { code: 'EcritureLib', labelKey: 'accAccounts.fec.col.EcritureLib' },
  { code: 'Debit', labelKey: 'accAccounts.fec.col.Debit' },
  { code: 'Credit', labelKey: 'accAccounts.fec.col.Credit' },
  { code: 'EcritureLet', labelKey: 'accAccounts.fec.col.EcritureLet' },
  { code: 'DateLet', labelKey: 'accAccounts.fec.col.DateLet' },
  { code: 'ValidDate', labelKey: 'accAccounts.fec.col.ValidDate' },
  { code: 'Montantdevise', labelKey: 'accAccounts.fec.col.Montantdevise' },
  { code: 'Idevise', labelKey: 'accAccounts.fec.col.Idevise' },
]

const FecExport = () => {
  const { t } = useI18n()
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [fiscalYear, setFiscalYear] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const f = await listFiscalYears()
        if (!cancelled) setFiscalYears(f || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : translate('common.error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedFy = useMemo(() => fiscalYears.find((fy) => fy._id === fiscalYear) || null, [fiscalYears, fiscalYear])

  const effectiveFrom = from || (selectedFy ? selectedFy.startDate : '')
  const effectiveTo = to || (selectedFy ? selectedFy.endDate : '')

  async function handleDownload() {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await downloadFec({
        from: from || undefined,
        to: to || undefined,
        fiscalYear: fiscalYear || undefined,
      })
      setSuccess(t('accAccounts.fec.downloadStarted'))
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const canDownload = !!(fiscalYear || (from && to))

  return (
    <AccountingLayout title={t('accAccounts.fec.title')} subtitle={t('accAccounts.fec.subtitle')}>
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <div className="accounting-message info" style={{ margin: 0 }}>
          {renderRich(t('accAccounts.fec.info'), {
            validated: <span className="accounting-badge validated">VALIDATED</span>,
            locked: <span className="accounting-badge locked">LOCKED</span>,
          })}
        </div>
      </section>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accAccounts.fec.settingsTitle')}</h2>

        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>{t('accAccounts.fec.fiscalYearLabel')}</label>
            <select className="portal-input" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)}>
              <option value="">{t('accAccounts.fec.noFiscalYear')}</option>
              {fiscalYears.map((fy) => (
                <option key={fy._id} value={fy._id}>
                  {fy.code || fy.label}
                  {fy.startDate && fy.endDate ? ` (${formatDate(fy.startDate)} → ${formatDate(fy.endDate)})` : ''}
                  {fy.status === 'CLOSED' ? t('accAccounts.fec.closedSuffix') : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.fec.customStart')}</label>
            <input type="date" className="portal-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.fec.customEnd')}</label>
            <input type="date" className="portal-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {(effectiveFrom || effectiveTo) && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 'var(--r-md)',
              background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
              fontSize: '0.9rem',
              color: 'var(--text-primary)',
            }}
          >
            <strong>{t('accAccounts.fec.effectivePeriod')}</strong> {formatDate(effectiveFrom)} →{' '}
            {formatDate(effectiveTo)}
            {!from && !to && selectedFy && (
              <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                {t('accAccounts.fec.derivedFromYear')}
              </span>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="portal-button" onClick={handleDownload} disabled={loading || !canDownload}>
            {loading ? t('accAccounts.fec.generating') : t('accAccounts.fec.download')}
          </button>
          {!canDownload && (
            <span
              style={{
                marginLeft: 12,
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
              }}
            >
              {t('accAccounts.fec.selectPeriod')}
            </span>
          )}
        </div>
      </section>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <div
          className="accounting-message"
          style={{
            background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 35%, transparent)',
            color: 'var(--warning)',
            margin: 0,
          }}
        >
          {renderRich(t('accAccounts.fec.warning'))}
        </div>
      </section>

      <section className="accounting-card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accAccounts.fec.previewTitle')}</h2>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            marginTop: 0,
          }}
        >
          {renderRich(t('accAccounts.fec.previewText'), { pipe: <span className="code">|</span> })}
        </p>
        <div className="accounting-table-scroll">
          <table className="accounting-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>{t('accAccounts.fec.colColumn')}</th>
                <th>{t('accAccounts.col.description')}</th>
              </tr>
            </thead>
            <tbody>
              {FEC_COLUMNS.map((c, i) => (
                <tr key={c.code}>
                  <td className="code">{i + 1}</td>
                  <td className="code">{c.code}</td>
                  <td>{t(c.labelKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AccountingLayout>
  )
}

export default FecExport
