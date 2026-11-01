import { useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AccountingLayout from '../AccountingLayout'
import { updateExternalSource, deleteExternalSource, rotateExternalSourceKey } from '../../../../services/accounting'
import type { ExternalSourceStatus, IRotateKeyResult } from '../../../../types/accounting'
import { TABS, type TabId } from './types'
import { STATUS_LABEL_KEYS, statusBadgeClass } from './helpers'
import { useExternalSource } from './useExternalSource'
import InfoTab from './InfoTab'
import RulesTab from './RulesTab'
import TransactionsTab from './TransactionsTab'
import RotateKeyModal from './RotateKeyModal'

const ExternalSourceDetail = () => {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<TabId>('info')
  const [saving, setSaving] = useState(false)
  const [rotateResult, setRotateResult] = useState<IRotateKeyResult | null>(null)
  const [copyState, setCopyState] = useState<{ key: boolean; secret: boolean }>({
    key: false,
    secret: false,
  })

  const {
    source,
    loading,
    error,
    setError,
    success,
    setSuccess,
    edit,
    setEdit,
    reload,
    transactions,
    txTotal,
    txLoading,
    txFilters,
    setTxFilters,
    reloadTransactions,
  } = useExternalSource(id)

  async function handleSaveInfo() {
    if (!edit || !id) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const payload = {
        description: edit.description || undefined,
        autoValidateAll: !!edit.autoValidateAll,
        rateLimitPerMin: Number(edit.rateLimitPerMin) || 60,
        defaultJournalCode: edit.defaultJournalCode || undefined,
        defaultCustomerAccount: edit.defaultCustomerAccount || undefined,
        defaultRevenueAccount: edit.defaultRevenueAccount || undefined,
        defaultExpenseAccount: edit.defaultExpenseAccount || undefined,
        defaultBankAccount: edit.defaultBankAccount || undefined,
      }
      const updated = await updateExternalSource(id, payload)
      setEdit({
        description: updated.description || '',
        autoValidateAll: !!updated.autoValidateAll,
        rateLimitPerMin: updated.rateLimitPerMin || 60,
        defaultJournalCode: updated.defaultJournalCode || '',
        defaultCustomerAccount: updated.defaultCustomerAccount || '',
        defaultRevenueAccount: updated.defaultRevenueAccount || '',
        defaultExpenseAccount: updated.defaultExpenseAccount || '',
        defaultBankAccount: updated.defaultBankAccount || '',
      })
      setSuccess(t('accVat.esd.saved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePause() {
    if (!source || !id) return
    const nextStatus: ExternalSourceStatus = source.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    const confirmKey = nextStatus === 'PAUSED' ? 'accVat.src.confirmPause' : 'accVat.src.confirmResume'
    if (!confirm(t(confirmKey, { name: source.name }))) return
    try {
      await updateExternalSource(id, { status: nextStatus })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  async function handleRotate() {
    if (!id) return
    if (!confirm(t('accVat.esd.confirmRotate'))) return
    setError('')
    try {
      const result = await rotateExternalSourceKey(id)
      setRotateResult(result)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  async function handleDelete() {
    if (!source || !id) return
    if (!confirm(t('accVat.esd.confirmDelete', { name: source.name }))) return
    try {
      await deleteExternalSource(id)
      navigate('/admin/comptabilite/sources-externes')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  async function copyToClipboard(text: string, key: 'key' | 'secret') {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState((s) => ({ ...s, [key]: true }))
      setTimeout(() => setCopyState((s) => ({ ...s, [key]: false })), 1500)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <AccountingLayout title={t('accVat.esd.pageTitle')}>
        <p style={{ color: 'var(--text-secondary)' }}>{t('accVat.common.loading')}</p>
      </AccountingLayout>
    )
  }

  if (!source) {
    return (
      <AccountingLayout title={t('accVat.esd.pageTitle')}>
        {error && <div className="accounting-message error">{error}</div>}
        <div className="accounting-empty">{t('accVat.esd.notFound')}</div>
      </AccountingLayout>
    )
  }

  return (
    <AccountingLayout
      title={source.name}
      subtitle={
        <span>
          <span className="code" style={{ fontSize: '0.9rem' }}>
            {source.slug}
          </span>{' '}
          <span className={`accounting-badge ${statusBadgeClass(source.status)}`} style={{ marginLeft: 8 }}>
            {STATUS_LABEL_KEYS[source.status] ? t(STATUS_LABEL_KEYS[source.status]) : source.status}
          </span>
        </span>
      }
      actions={
        <>
          <Link to="/admin/comptabilite/sources-externes" className="portal-button secondary">
            {t('accVat.esd.back')}
          </Link>
          <button className="portal-button secondary" onClick={handleTogglePause}>
            {source.status === 'ACTIVE' ? t('accVat.esd.pause') : t('accVat.esd.resume')}
          </button>
          <button className="portal-button secondary" onClick={handleRotate}>
            🔄 {t('accVat.esd.rotate')}
          </button>
          <button
            className="portal-button"
            style={{
              background: 'color-mix(in srgb, var(--critical) 12%, transparent)',
              borderColor: 'color-mix(in srgb, var(--critical) 50%, transparent)',
              color: 'var(--critical)',
            }}
            onClick={handleDelete}
          >
            🗑 {t('accVat.esd.delete')}
          </button>
        </>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <nav
        style={{
          display: 'flex',
          gap: 4,
          padding: 6,
          borderRadius: 'var(--r-lg)',
          background: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
          border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              border: '1px solid transparent',
              borderRadius: 'var(--r-md)',
              background:
                activeTab === tab.id
                  ? 'linear-gradient(135deg, color-mix(in srgb, var(--primary) 25%, transparent) 0%, color-mix(in srgb, var(--primary) 18%, transparent) 100%)'
                  : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 500,
              borderColor: activeTab === tab.id ? 'color-mix(in srgb, var(--primary) 50%, transparent)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      {rotateResult && (
        <RotateKeyModal
          apiKey={rotateResult.apiKey}
          webhookSecret={rotateResult.webhookSecret}
          warning={rotateResult.warning}
          copyState={copyState}
          onCopy={copyToClipboard}
          onClose={() => setRotateResult(null)}
        />
      )}

      {activeTab === 'info' && edit && (
        <InfoTab source={source} infoForm={edit} setInfoForm={setEdit} onSave={handleSaveInfo} saving={saving} />
      )}

      {activeTab === 'rules' && id && <RulesTab sourceId={id} onError={setError} />}

      {activeTab === 'tx' && (
        <TransactionsTab
          transactions={transactions}
          txTotal={txTotal}
          filters={txFilters}
          setFilters={setTxFilters}
          loading={txLoading}
          onReload={reloadTransactions}
          onError={setError}
        />
      )}
    </AccountingLayout>
  )
}

export default ExternalSourceDetail
