import type { IExternalSource } from '../../../../types/accounting'
import type { InfoForm } from './types'
import { formatDateTime } from './helpers'
import { useI18n } from '../../../../context/I18nContext'
import { formatNumber } from '../../../../i18n/format'

interface InfoTabProps {
  source: IExternalSource
  infoForm: InfoForm
  setInfoForm: (f: InfoForm) => void
  onSave: () => void
  saving: boolean
}

export default function InfoTab({ source, infoForm, setInfoForm, onSave, saving }: InfoTabProps) {
  const { t } = useI18n()
  return (
    <>
      <div className="accounting-kpi-grid">
        <div className="accounting-kpi">
          <div className="label">{t('accVat.esd.totalReceived')}</div>
          <div className="value">{formatNumber(Number(source.totalIngested || 0))}</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accVat.integ.rejected')}</div>
          <div className="value" style={{ color: source.totalRejected ? '#f87171' : undefined }}>
            {formatNumber(Number(source.totalRejected || 0))}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accVat.integ.duplicates')}</div>
          <div className="value" style={{ color: source.totalDuplicates ? '#fbbf24' : undefined }}>
            {formatNumber(Number(source.totalDuplicates || 0))}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accVat.src.colLastActivity')}</div>
          <div className="value" style={{ fontSize: '0.95rem' }}>
            {formatDateTime(source.lastSeenAt)}
          </div>
        </div>
      </div>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accVat.esd.infoHeading')}</h2>

        <div className="accounting-form">
          <div className="accounting-form-field full">
            <label>{t('accVat.src.description')}</label>
            <textarea
              className="portal-input"
              rows={2}
              value={infoForm.description}
              onChange={(e) => setInfoForm({ ...infoForm, description: e.target.value })}
            />
          </div>
          <div className="accounting-form-field full">
            <label
              style={{
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: '0.88rem',
              }}
            >
              <input
                type="checkbox"
                checked={infoForm.autoValidateAll}
                onChange={(e) => setInfoForm({ ...infoForm, autoValidateAll: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              {t('accVat.src.autoValidateLabel')}
            </label>
            <span
              style={{
                fontSize: '0.74rem',
                color: 'rgba(251,191,36,0.85)',
                marginTop: 2,
              }}
            >
              ⚠ {t('accVat.esd.autoValidateWarning')}
            </span>
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.src.rateLimit')}</label>
            <input
              type="number"
              min="1"
              className="portal-input"
              value={infoForm.rateLimitPerMin}
              onChange={(e) => setInfoForm({ ...infoForm, rateLimitPerMin: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.src.defaultJournal')}</label>
            <input
              className="portal-input"
              value={infoForm.defaultJournalCode}
              onChange={(e) => setInfoForm({ ...infoForm, defaultJournalCode: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.src.customerAccount')}</label>
            <input
              className="portal-input"
              value={infoForm.defaultCustomerAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultCustomerAccount: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.src.revenueAccount')}</label>
            <input
              className="portal-input"
              value={infoForm.defaultRevenueAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultRevenueAccount: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.src.expenseAccount')}</label>
            <input
              className="portal-input"
              value={infoForm.defaultExpenseAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultExpenseAccount: e.target.value })}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.src.bankAccount')}</label>
            <input
              className="portal-input"
              value={infoForm.defaultBankAccount}
              onChange={(e) => setInfoForm({ ...infoForm, defaultBankAccount: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="portal-button" onClick={onSave} disabled={saving}>
            {saving ? t('accVat.settings.saving') : t('accVat.esd.save')}
          </button>
        </div>
      </section>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{t('accVat.esd.endpoints')}</h2>
        <p
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: '0.85rem',
            marginTop: 0,
          }}
        >
          {t('accVat.esd.slugUseA')} <span className="code">{source.slug}</span> {t('accVat.esd.slugUseB')}
        </p>

        <div
          style={{
            background: 'rgba(15,15,20,0.7)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.8,
          }}
        >
          <div>
            <span style={{ color: '#4ade80' }}>POST</span> https://venio.paris/api/external/
            {source.slug}/entries
          </div>
          <div>
            <span style={{ color: 'var(--primary)' }}>GET&nbsp;</span> https://venio.paris/api/external/
            {source.slug}/entries/{'{externalId}'}
          </div>
          <div>
            <span style={{ color: 'var(--primary)' }}>GET&nbsp;</span> https://venio.paris/api/external/
            {source.slug}/entries?from=&to=
          </div>
          <div>
            <span style={{ color: 'var(--primary)' }}>GET&nbsp;</span> https://venio.paris/api/external/
            {source.slug}/ping
          </div>
        </div>

        <h3
          style={{
            margin: '20px 0 10px 0',
            fontSize: '0.85rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'rgba(14, 165, 233, 0.85)',
          }}
        >
          {t('accVat.esd.headersHeading')}
        </h3>
        <table className="accounting-table">
          <thead>
            <tr>
              <th>{t('accVat.esd.colHeader')}</th>
              <th>{t('accVat.esd.colDescription')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="code">X-Api-Key</td>
              <td>{t('accVat.esd.hdrApiKey', { prefix: source.apiKeyPrefix || '—' })}</td>
            </tr>
            <tr>
              <td className="code">X-Venio-Signature</td>
              <td>{t('accVat.esd.hdrSignature')}</td>
            </tr>
            <tr>
              <td className="code">X-Venio-Timestamp</td>
              <td>{t('accVat.esd.hdrTimestamp')}</td>
            </tr>
            <tr>
              <td className="code">Idempotency-Key</td>
              <td>{t('accVat.esd.hdrIdempotency')}</td>
            </tr>
          </tbody>
        </table>

        {source.rotatedAt && (
          <p
            style={{
              marginTop: 14,
              fontSize: '0.78rem',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            {t('accVat.esd.lastRotation', { date: formatDateTime(source.rotatedAt) })}
          </p>
        )}
      </section>
    </>
  )
}
