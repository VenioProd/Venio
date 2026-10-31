import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import {
  getAccountingSettings,
  updateAccountingSettings,
  listFiscalYears,
  createFiscalYear,
  closeFiscalYear,
  seedPCG,
  listExternalSources,
  createExternalSource,
  rotateExternalSourceKey,
  deleteExternalSource,
} from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { ICompanySettings, IFiscalYear, IExternalSource, ExternalSourceStatus } from '../../../types/accounting'
import FiscalYearsSection from './settings-sections/FiscalYearsSection'
import { IntegrationsSection } from './settings-sections/integrations-section'
import {
  CreateIntegrationModal,
  RevokeIntegrationModal,
  CredentialsModal,
} from './settings-sections/integrations-modals'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]+$/

interface GeneratedCredentials {
  apiKey: string
  webhookSecret: string
  sourceSlug: string
  sourceName: string
  warning?: string
  context: 'created' | 'rotated'
}

const FISCAL_REGIMES: { value: string; labelKey: MessageKey }[] = [
  { value: 'REEL_NORMAL', labelKey: 'accVat.settings.regimeNormal' },
  { value: 'REEL_SIMPLIFIE', labelKey: 'accVat.settings.regimeSimplified' },
  { value: 'MICRO', labelKey: 'accVat.settings.regimeMicro' },
]

const VAT_PERIODICITIES: { value: string; labelKey: MessageKey }[] = [
  { value: 'MENSUEL', labelKey: 'accVat.settings.periodMonthly' },
  { value: 'TRIMESTRIEL', labelKey: 'accVat.settings.periodQuarterly' },
  { value: 'ANNUEL', labelKey: 'accVat.settings.periodAnnual' },
]

interface NewYearForm {
  code: string
  label: string
  startDate: string
  endDate: string
}

const AccountingSettings = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const canLock = hasPermission(user, PERMISSIONS.LOCK_ACCOUNTING)

  const [settings, setSettings] = useState<ICompanySettings | null>(null)
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [externalSources, setExternalSources] = useState<IExternalSource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newYear, setNewYear] = useState<NewYearForm>({
    code: '',
    label: '',
    startDate: '',
    endDate: '',
  })

  // Intégrations externes
  const [credentials, setCredentials] = useState<GeneratedCredentials | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<IExternalSource | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const [s, fy, sources] = await Promise.all([
        getAccountingSettings(),
        listFiscalYears(),
        listExternalSources().catch(() => [] as IExternalSource[]),
      ])
      setSettings(s)
      setFiscalYears(fy)
      setExternalSources(sources)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setLoading(false)
    }
  }

  async function reloadExternalSources() {
    try {
      const sources = await listExternalSources()
      setExternalSources(sources)
    } catch {
      // ignore — section facultative
    }
  }

  async function copyToClipboard(value: string, fieldKey: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(fieldKey)
      setTimeout(() => {
        setCopiedField((current) => (current === fieldKey ? null : current))
      }, 1500)
    } catch {
      // ignore
    }
  }

  async function handleCreateIntegration(payload: {
    slug: string
    name: string
    description?: string
    autoValidateAll: boolean
  }): Promise<string | null> {
    try {
      const result = await createExternalSource(payload)
      setCredentials({
        apiKey: result.apiKey,
        webhookSecret: result.webhookSecret,
        sourceSlug: result.source.slug,
        sourceName: result.source.name,
        warning: result.warning,
        context: 'created',
      })
      setCreateOpen(false)
      setSuccess(t('accVat.settings.integrationCreated', { name: result.source.name }))
      await reloadExternalSources()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : t('accVat.settings.createError')
    }
  }

  async function handleRotate(source: IExternalSource) {
    if (!confirm(t('accVat.settings.confirmRotate', { name: source.name }))) return
    setRotatingId(source._id)
    setError('')
    setSuccess('')
    try {
      const result = await rotateExternalSourceKey(source._id)
      setCredentials({
        apiKey: result.apiKey,
        webhookSecret: result.webhookSecret,
        sourceSlug: source.slug,
        sourceName: source.name,
        warning: result.warning,
        context: 'rotated',
      })
      await reloadExternalSources()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.settings.rotateError'))
    } finally {
      setRotatingId(null)
    }
  }

  async function handleRevoke(source: IExternalSource): Promise<string | null> {
    try {
      await deleteExternalSource(source._id)
      setRevokeTarget(null)
      setSuccess(t('accVat.settings.integrationRevoked', { name: source.name }))
      await reloadExternalSources()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : t('accVat.settings.revokeError')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateAccountingSettings({ ...settings, isConfigured: true })
      setSettings(updated)
      setSuccess(t('accVat.settings.saved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleSeed() {
    if (!confirm(t('accVat.settings.confirmSeed'))) return
    setError('')
    setSuccess('')
    try {
      const r = await seedPCG()
      setSuccess(
        t('accVat.settings.seeded', {
          accounts: r.created.accounts,
          journals: r.created.journals,
          vatRates: r.created.vatRates,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  async function handleCreateYear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      await createFiscalYear({
        code: newYear.code,
        label: newYear.label,
        startDate: newYear.startDate,
        endDate: newYear.endDate,
      })
      setNewYear({ code: '', label: '', startDate: '', endDate: '' })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  async function handleClose(id: string) {
    if (!confirm(t('accVat.settings.confirmClose'))) return
    try {
      await closeFiscalYear(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  if (loading || !settings) {
    return (
      <AccountingLayout title={t('accVat.settings.title')}>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accVat.common.loading')}</p>
      </AccountingLayout>
    )
  }

  return (
    <AccountingLayout title={t('accVat.settings.title')} subtitle={t('accVat.settings.subtitle')}>
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <section className="accounting-card">
        <h2>{t('accVat.settings.initHeading')}</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>{t('accVat.settings.initText')}</p>
        <button className="portal-button" onClick={handleSeed} disabled={!canManage} style={{ marginTop: 8 }}>
          {t('accVat.settings.initButton')}
        </button>
      </section>

      <form className="accounting-card" onSubmit={handleSave}>
        <h2>{t('accVat.settings.legalHeading')}</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>{t('accVat.settings.legalName')}</label>
            <input
              className="portal-input"
              value={settings.legalName || ''}
              onChange={(e) => setSettings({ ...settings, legalName: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.legalForm')}</label>
            <input
              className="portal-input"
              value={settings.legalForm || ''}
              onChange={(e) => setSettings({ ...settings, legalForm: e.target.value })}
              placeholder={t('accVat.settings.legalFormPlaceholder')}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>SIRET</label>
            <input
              className="portal-input"
              value={settings.siret || ''}
              onChange={(e) => setSettings({ ...settings, siret: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>SIREN</label>
            <input
              className="portal-input"
              value={settings.siren || ''}
              onChange={(e) => setSettings({ ...settings, siren: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.vatNumber')}</label>
            <input
              className="portal-input"
              value={settings.vatNumber || ''}
              onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })}
              placeholder="FR12345678901"
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.apeNaf')}</label>
            <input
              className="portal-input"
              value={settings.apeNafCode || ''}
              onChange={(e) => setSettings({ ...settings, apeNafCode: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>RCS</label>
            <input
              className="portal-input"
              value={settings.rcs || ''}
              onChange={(e) => setSettings({ ...settings, rcs: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.shareCapital')}</label>
            <input
              type="number"
              className="portal-input"
              value={settings.capitalSocial ?? ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  capitalSocial: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>{t('accVat.settings.addressLine1')}</label>
            <input
              className="portal-input"
              value={settings.address?.line1 || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  address: { ...settings.address, line1: e.target.value },
                })
              }
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.zip')}</label>
            <input
              className="portal-input"
              value={settings.address?.zip || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  address: { ...settings.address, zip: e.target.value },
                })
              }
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.city')}</label>
            <input
              className="portal-input"
              value={settings.address?.city || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  address: { ...settings.address, city: e.target.value },
                })
              }
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.country')}</label>
            <input
              className="portal-input"
              value={settings.address?.country || t('accVat.settings.countryDefault')}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  address: { ...settings.address, country: e.target.value },
                })
              }
              disabled={!canManage}
            />
          </div>
        </div>

        <h2 style={{ marginTop: 28 }}>{t('accVat.settings.taxHeading')}</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>{t('accVat.settings.regime')}</label>
            <select
              className="portal-input"
              value={settings.fiscalRegime || 'REEL_NORMAL'}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  fiscalRegime: e.target.value as ICompanySettings['fiscalRegime'],
                })
              }
              disabled={!canManage}
            >
              {FISCAL_REGIMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.vatPeriodicity')}</label>
            <select
              className="portal-input"
              value={settings.vatPeriodicity || 'MENSUEL'}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  vatPeriodicity: e.target.value as ICompanySettings['vatPeriodicity'],
                })
              }
              disabled={!canManage}
            >
              {VAT_PERIODICITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.fiscalStartMonth')}</label>
            <input
              type="number"
              min="1"
              max="12"
              className="portal-input"
              value={settings.fiscalYearStartMonth || 1}
              onChange={(e) => setSettings({ ...settings, fiscalYearStartMonth: Number(e.target.value) })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accVat.settings.paymentTerms')}</label>
            <input
              type="number"
              min="0"
              className="portal-input"
              value={settings.paymentTermsDays ?? 30}
              onChange={(e) => setSettings({ ...settings, paymentTermsDays: Number(e.target.value) })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>{t('accVat.settings.lateNote')}</label>
            <textarea
              className="portal-input"
              rows={2}
              value={settings.latePaymentRateNote || ''}
              onChange={(e) => setSettings({ ...settings, latePaymentRateNote: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>{t('accVat.settings.legalMentions')}</label>
            <textarea
              className="portal-input"
              rows={3}
              value={settings.legalMentions || ''}
              onChange={(e) => setSettings({ ...settings, legalMentions: e.target.value })}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className="accounting-toolbar" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
          <button type="submit" className="portal-button" disabled={!canManage || saving}>
            {saving ? t('accVat.settings.saving') : t('common.save')}
          </button>
        </div>
      </form>

      <FiscalYearsSection
        fiscalYears={fiscalYears}
        newYear={newYear}
        setNewYear={setNewYear}
        canLock={canLock}
        canManage={canManage}
        onClose={handleClose}
        onCreate={handleCreateYear}
      />

      <IntegrationsSection
        canManage={canManage}
        sources={externalSources}
        rotatingId={rotatingId}
        onOpenCreate={() => setCreateOpen(true)}
        onRotate={handleRotate}
        onRequestRevoke={setRevokeTarget}
      />

      {createOpen && (
        <CreateIntegrationModal
          existingSlugs={externalSources.map((s) => s.slug)}
          onCancel={() => setCreateOpen(false)}
          onSubmit={handleCreateIntegration}
        />
      )}

      {revokeTarget && (
        <RevokeIntegrationModal source={revokeTarget} onCancel={() => setRevokeTarget(null)} onConfirm={handleRevoke} />
      )}

      {credentials && (
        <CredentialsModal
          credentials={credentials}
          copiedField={copiedField}
          onCopy={copyToClipboard}
          onClose={() => setCredentials(null)}
        />
      )}
    </AccountingLayout>
  )
}

export default AccountingSettings
