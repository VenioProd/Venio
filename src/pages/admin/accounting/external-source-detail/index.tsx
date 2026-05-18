import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AccountingLayout from '../AccountingLayout'
import {
  updateExternalSource,
  deleteExternalSource,
  rotateExternalSourceKey,
} from '../../../../services/accounting'
import type { ExternalSourceStatus, IRotateKeyResult } from '../../../../types/accounting'
import { TABS, type TabId } from './types'
import { STATUS_LABELS, statusBadgeClass } from './helpers'
import { useExternalSource } from './useExternalSource'
import InfoTab from './InfoTab'
import RulesTab from './RulesTab'
import TransactionsTab from './TransactionsTab'
import RotateKeyModal from './RotateKeyModal'

const ExternalSourceDetail = () => {
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
      setSuccess('Modifications enregistrées.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePause() {
    if (!source || !id) return
    const nextStatus: ExternalSourceStatus = source.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    const verb = nextStatus === 'PAUSED' ? 'Mettre en pause' : 'Réactiver'
    if (!confirm(`${verb} la source « ${source.name} » ?`)) return
    try {
      await updateExternalSource(id, { status: nextStatus })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleRotate() {
    if (!id) return
    if (
      !confirm(
        'Régénérer la clé API et le secret webhook ? Les anciennes valeurs seront immédiatement invalidées et le site tiers devra être mis à jour.'
      )
    )
      return
    setError('')
    try {
      const result = await rotateExternalSourceKey(id)
      setRotateResult(result)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDelete() {
    if (!source || !id) return
    if (
      !confirm(
        `Supprimer définitivement la source « ${source.name} » ? Cette action est irréversible. Les écritures déjà publiées seront conservées.`
      )
    )
      return
    try {
      await deleteExternalSource(id)
      navigate('/admin/comptabilite/sources-externes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
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
      <AccountingLayout title="Source externe">
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      </AccountingLayout>
    )
  }

  if (!source) {
    return (
      <AccountingLayout title="Source externe">
        {error && <div className="accounting-message error">{error}</div>}
        <div className="accounting-empty">Source introuvable.</div>
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
          <span
            className={`accounting-badge ${statusBadgeClass(source.status)}`}
            style={{ marginLeft: 8 }}
          >
            {STATUS_LABELS[source.status] || source.status}
          </span>
        </span>
      }
      actions={
        <>
          <Link to="/admin/comptabilite/sources-externes" className="portal-button secondary">
            ← Retour
          </Link>
          <button className="portal-button secondary" onClick={handleTogglePause}>
            {source.status === 'ACTIVE' ? '⏸ Pause' : '▶ Reprendre'}
          </button>
          <button className="portal-button secondary" onClick={handleRotate}>
            🔄 Rotate clé
          </button>
          <button
            className="portal-button"
            style={{
              background: 'rgba(248,113,113,0.12)',
              borderColor: 'rgba(248,113,113,0.5)',
              color: '#fca5a5',
            }}
            onClick={handleDelete}
          >
            🗑 Supprimer
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
          borderRadius: 12,
          background: 'rgba(15,15,20,0.6)',
          border: '1px solid rgba(14,165,233,0.18)',
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 16px',
              border: '1px solid transparent',
              borderRadius: 8,
              background:
                activeTab === t.id
                  ? 'linear-gradient(135deg, rgba(14,165,233,0.25) 0%, rgba(59,130,246,0.18) 100%)'
                  : 'transparent',
              color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.65)',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 500,
              borderColor: activeTab === t.id ? 'rgba(14,165,233,0.5)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {t.label}
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
        <InfoTab
          source={source}
          infoForm={edit}
          setInfoForm={setEdit}
          onSave={handleSaveInfo}
          saving={saving}
        />
      )}

      {activeTab === 'rules' && id && (
        <RulesTab
          sourceId={id}
          onError={setError}
        />
      )}

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
