import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import {
  getExternalSource,
  updateExternalSource,
  deleteExternalSource,
  rotateExternalSourceKey,
  listClassificationRules,
  createClassificationRule,
  updateClassificationRule,
  deleteClassificationRule,
  listExternalTransactions,
  replayExternalTransaction,
} from '../../../services/accounting'

const EUR_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

function formatEur(n) {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return EUR_FORMATTER.format(value)
}

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR')
  } catch {
    return '—'
  }
}

function formatDateTime(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('fr-FR')
  } catch {
    return '—'
  }
}

const STATUS_LABELS = {
  ACTIVE: 'Active',
  PAUSED: 'En pause',
  DISABLED: 'Désactivée',
}

function statusBadgeClass(status) {
  if (status === 'ACTIVE') return 'validated'
  if (status === 'PAUSED') return 'draft'
  return 'locked'
}

const TRANSACTION_STATUSES = [
  { value: '', label: 'Tous statuts' },
  { value: 'RECEIVED', label: 'Reçue' },
  { value: 'CLASSIFIED', label: 'Classifiée' },
  { value: 'POSTED', label: 'Publiée' },
  { value: 'AWAITING_REVIEW', label: 'Revue à faire' },
  { value: 'REJECTED', label: 'Rejetée' },
  { value: 'DUPLICATE', label: 'Doublon' },
]

function txStatusClass(status) {
  if (status === 'POSTED') return 'validated'
  if (status === 'REJECTED') return 'draft'
  if (status === 'AWAITING_REVIEW') return 'draft'
  if (status === 'DUPLICATE') return 'locked'
  return 'locked'
}

const RULE_TYPE_OPTIONS = [
  { value: '', label: 'Tout type' },
  { value: 'SALE', label: 'Vente (SALE)' },
  { value: 'REFUND', label: 'Remboursement (REFUND)' },
  { value: 'EXPENSE', label: 'Dépense (EXPENSE)' },
  { value: 'FEE', label: 'Frais (FEE)' },
  { value: 'PAYMENT', label: 'Paiement (PAYMENT)' },
  { value: 'TRANSFER', label: 'Transfert (TRANSFER)' },
  { value: 'ADJUSTMENT', label: 'Ajustement (ADJUSTMENT)' },
]

const EMPTY_RULE = {
  name: '',
  priority: 100,
  enabled: true,
  conditions: {
    type: '',
    categoryRegex: '',
    descriptionRegex: '',
    amountMin: '',
    amountMax: '',
    currency: '',
    tagsAll: '',
    tagsAny: '',
  },
  mapping: {
    journalCode: '',
    debitAccount: '',
    creditAccount: '',
    vatRateValue: '',
    useVatFromPayload: false,
    labelTemplate: '',
    autoValidate: false,
    assignToAuxiliary: false,
  },
}

function parseTagsInput(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function tagsToInput(tags) {
  if (!Array.isArray(tags)) return ''
  return tags.join(', ')
}

const TABS = [
  { id: 'info', label: 'Informations & mappings' },
  { id: 'rules', label: 'Règles de classification' },
  { id: 'tx', label: 'Historique des transactions' },
]

export default function ExternalSourceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('info')

  // Form state pour les infos / mappings
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)

  // Rotation
  const [rotateResult, setRotateResult] = useState(null)
  const [copyState, setCopyState] = useState({ key: false, secret: false })

  // Rules
  const [rules, setRules] = useState([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [ruleError, setRuleError] = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    conditions: true,
    mapping: true,
  })

  // Transactions
  const [transactions, setTransactions] = useState([])
  const [txTotal, setTxTotal] = useState(0)
  const [txLoading, setTxLoading] = useState(false)
  const [txFilters, setTxFilters] = useState({
    status: '',
    externalId: '',
    from: '',
    to: '',
    page: 1,
    limit: 50,
  })
  const [txDetail, setTxDetail] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const s = await getExternalSource(id)
      setSource(s)
      setEdit({
        description: s.description || '',
        autoValidateAll: !!s.autoValidateAll,
        rateLimitPerMin: s.rateLimitPerMin || 60,
        defaultJournalCode: s.defaultJournalCode || '',
        defaultCustomerAccount: s.defaultCustomerAccount || '',
        defaultRevenueAccount: s.defaultRevenueAccount || '',
        defaultExpenseAccount: s.defaultExpenseAccount || '',
        defaultBankAccount: s.defaultBankAccount || '',
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    reload()
  }, [reload])

  const reloadRules = useCallback(async () => {
    if (!id) return
    setRulesLoading(true)
    try {
      const list = await listClassificationRules(id)
      setRules(list || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setRulesLoading(false)
    }
  }, [id])

  const reloadTransactions = useCallback(async () => {
    if (!source) return
    setTxLoading(true)
    try {
      const r = await listExternalTransactions({
        sourceSlug: source.slug,
        status: txFilters.status || undefined,
        externalId: txFilters.externalId || undefined,
        from: txFilters.from || undefined,
        to: txFilters.to || undefined,
        page: txFilters.page,
        limit: txFilters.limit,
      })
      setTransactions(r.transactions || [])
      setTxTotal(r.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setTxLoading(false)
    }
  }, [source, txFilters])

  useEffect(() => {
    if (activeTab === 'rules') reloadRules()
  }, [activeTab, reloadRules])

  useEffect(() => {
    if (activeTab === 'tx') reloadTransactions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, txFilters.status, txFilters.page])

  async function handleSaveInfo() {
    if (!edit) return
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
      setSource(updated)
      setSuccess('Modifications enregistrées.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePause() {
    if (!source) return
    const nextStatus = source.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    const verb = nextStatus === 'PAUSED' ? 'Mettre en pause' : 'Réactiver'
    if (!confirm(`${verb} la source « ${source.name} » ?`)) return
    try {
      const updated = await updateExternalSource(id, { status: nextStatus })
      setSource(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRotate() {
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
      // Refresh
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete() {
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
      setError(err.message)
    }
  }

  async function copyToClipboard(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState((s) => ({ ...s, [key]: true }))
      setTimeout(() => setCopyState((s) => ({ ...s, [key]: false })), 1500)
    } catch {
      // ignore
    }
  }

  // ---- Rules ----

  function openNewRule() {
    setEditingRule({ ...EMPTY_RULE, conditions: { ...EMPTY_RULE.conditions }, mapping: { ...EMPTY_RULE.mapping } })
    setRuleError('')
  }

  function openEditRule(rule) {
    setEditingRule({
      _id: rule._id,
      name: rule.name || '',
      priority: rule.priority ?? 100,
      enabled: rule.enabled !== false,
      conditions: {
        type: rule.conditions?.type || '',
        categoryRegex: rule.conditions?.categoryRegex || '',
        descriptionRegex: rule.conditions?.descriptionRegex || '',
        amountMin: rule.conditions?.amountMin ?? '',
        amountMax: rule.conditions?.amountMax ?? '',
        currency: rule.conditions?.currency || '',
        tagsAll: tagsToInput(rule.conditions?.tagsAll),
        tagsAny: tagsToInput(rule.conditions?.tagsAny),
      },
      mapping: {
        journalCode: rule.mapping?.journalCode || '',
        debitAccount: rule.mapping?.debitAccount || '',
        creditAccount: rule.mapping?.creditAccount || '',
        vatRateValue: rule.mapping?.vatRateValue ?? '',
        useVatFromPayload: !!rule.mapping?.useVatFromPayload,
        labelTemplate: rule.mapping?.labelTemplate || '',
        autoValidate: !!rule.mapping?.autoValidate,
        assignToAuxiliary: !!rule.mapping?.assignToAuxiliary,
      },
    })
    setRuleError('')
  }

  async function handleSaveRule() {
    if (!editingRule) return
    if (!editingRule.name || !editingRule.name.trim()) {
      setRuleError('Le nom de la règle est obligatoire.')
      return
    }
    setRuleSaving(true)
    setRuleError('')
    try {
      const payload = {
        name: editingRule.name.trim(),
        priority: Number(editingRule.priority) || 100,
        enabled: !!editingRule.enabled,
        conditions: {
          type: editingRule.conditions.type || undefined,
          categoryRegex: editingRule.conditions.categoryRegex || undefined,
          descriptionRegex: editingRule.conditions.descriptionRegex || undefined,
          amountMin:
            editingRule.conditions.amountMin !== ''
              ? Number(editingRule.conditions.amountMin)
              : undefined,
          amountMax:
            editingRule.conditions.amountMax !== ''
              ? Number(editingRule.conditions.amountMax)
              : undefined,
          currency: editingRule.conditions.currency || undefined,
          tagsAll: parseTagsInput(editingRule.conditions.tagsAll),
          tagsAny: parseTagsInput(editingRule.conditions.tagsAny),
        },
        mapping: {
          journalCode: editingRule.mapping.journalCode || undefined,
          debitAccount: editingRule.mapping.debitAccount || undefined,
          creditAccount: editingRule.mapping.creditAccount || undefined,
          vatRateValue:
            editingRule.mapping.vatRateValue !== ''
              ? Number(editingRule.mapping.vatRateValue)
              : undefined,
          useVatFromPayload: !!editingRule.mapping.useVatFromPayload,
          labelTemplate: editingRule.mapping.labelTemplate || undefined,
          autoValidate: !!editingRule.mapping.autoValidate,
          assignToAuxiliary: !!editingRule.mapping.assignToAuxiliary,
        },
      }
      if (editingRule._id) {
        await updateClassificationRule(id, editingRule._id, payload)
      } else {
        await createClassificationRule(id, payload)
      }
      setEditingRule(null)
      await reloadRules()
    } catch (err) {
      setRuleError(err.message)
    } finally {
      setRuleSaving(false)
    }
  }

  async function handleToggleRule(rule) {
    try {
      await updateClassificationRule(id, rule._id, { enabled: !rule.enabled })
      await reloadRules()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteRule(rule) {
    if (!confirm(`Supprimer la règle « ${rule.name} » ?`)) return
    try {
      await deleteClassificationRule(id, rule._id)
      await reloadRules()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleReplay(tx) {
    if (!confirm(`Rejouer la transaction ${tx.externalId} ?`)) return
    try {
      await replayExternalTransaction(tx._id)
      await reloadTransactions()
    } catch (err) {
      setError(err.message)
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

  const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0))
  const txTotalPages = Math.max(1, Math.ceil(txTotal / txFilters.limit))

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

      {/* Tabs */}
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
              borderColor:
                activeTab === t.id ? 'rgba(14,165,233,0.5)' : 'transparent',
              transition: 'all 0.2s ease',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Modale de rotation */}
      {rotateResult && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="accounting-card"
            style={{
              maxWidth: 720,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
              Nouvelle clé API et nouveau secret
            </h2>

            <div
              className="accounting-message"
              style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.4)',
                color: '#fde68a',
              }}
            >
              ⚠ L'ancienne clé est invalidée. Ces nouvelles valeurs ne seront PLUS jamais
              affichées. Mettez à jour la configuration du site tiers immédiatement.
              {rotateResult.warning && (
                <div style={{ marginTop: 6, fontSize: '0.82rem', opacity: 0.85 }}>
                  {rotateResult.warning}
                </div>
              )}
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 6,
                }}
              >
                Clé API
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(14,165,233,0.35)',
                  borderRadius: 10,
                  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                  fontSize: '0.92rem',
                  color: '#7dd3fc',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {rotateResult.apiKey}
              </div>
              <button
                type="button"
                className="portal-button secondary"
                style={{ marginTop: 8 }}
                onClick={() => copyToClipboard(rotateResult.apiKey, 'key')}
              >
                {copyState.key ? '✓ Copié' : '📋 Copier la clé'}
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'rgba(255,255,255,0.55)',
                  marginBottom: 6,
                }}
              >
                Secret de signature webhook
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(192,132,252,0.35)',
                  borderRadius: 10,
                  fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                  fontSize: '0.92rem',
                  color: '#c084fc',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}
              >
                {rotateResult.webhookSecret}
              </div>
              <button
                type="button"
                className="portal-button secondary"
                style={{ marginTop: 8 }}
                onClick={() => copyToClipboard(rotateResult.webhookSecret, 'secret')}
              >
                {copyState.secret ? '✓ Copié' : '📋 Copier le secret'}
              </button>
            </div>

            <div
              style={{
                marginTop: 24,
                display: 'flex',
                gap: 10,
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="portal-button"
                onClick={() => setRotateResult(null)}
              >
                J'ai bien noté → Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Tab : Informations ---- */}
      {activeTab === 'info' && edit && (
        <>
          <div className="accounting-kpi-grid">
            <div className="accounting-kpi">
              <div className="label">Total reçu</div>
              <div className="value">
                {Number(source.totalIngested || 0).toLocaleString('fr-FR')}
              </div>
            </div>
            <div className="accounting-kpi">
              <div className="label">Rejetées</div>
              <div
                className="value"
                style={{ color: source.totalRejected ? '#f87171' : undefined }}
              >
                {Number(source.totalRejected || 0).toLocaleString('fr-FR')}
              </div>
            </div>
            <div className="accounting-kpi">
              <div className="label">Doublons</div>
              <div
                className="value"
                style={{ color: source.totalDuplicates ? '#fbbf24' : undefined }}
              >
                {Number(source.totalDuplicates || 0).toLocaleString('fr-FR')}
              </div>
            </div>
            <div className="accounting-kpi">
              <div className="label">Dernière activité</div>
              <div className="value" style={{ fontSize: '0.95rem' }}>
                {formatDateTime(source.lastSeenAt)}
              </div>
            </div>
          </div>

          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Informations & mappings</h2>

            <div className="accounting-form">
              <div className="accounting-form-field full">
                <label>Description</label>
                <textarea
                  className="portal-input"
                  rows={2}
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
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
                    checked={edit.autoValidateAll}
                    onChange={(e) =>
                      setEdit({ ...edit, autoValidateAll: e.target.checked })
                    }
                    style={{ marginRight: 8 }}
                  />
                  Auto-valider toutes les écritures de cette source
                </label>
                <span
                  style={{
                    fontSize: '0.74rem',
                    color: 'rgba(251,191,36,0.85)',
                    marginTop: 2,
                  }}
                >
                  ⚠ Si activé, toutes les écritures arrivent validées sans revue manuelle.
                </span>
              </div>
              <div className="accounting-form-field">
                <label>Rate limit (req/min)</label>
                <input
                  type="number"
                  min="1"
                  className="portal-input"
                  value={edit.rateLimitPerMin}
                  onChange={(e) =>
                    setEdit({ ...edit, rateLimitPerMin: e.target.value })
                  }
                />
              </div>
              <div className="accounting-form-field">
                <label>Journal par défaut</label>
                <input
                  className="portal-input"
                  value={edit.defaultJournalCode}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      defaultJournalCode: e.target.value.toUpperCase(),
                    })
                  }
                />
              </div>
              <div className="accounting-form-field">
                <label>Compte client</label>
                <input
                  className="portal-input"
                  value={edit.defaultCustomerAccount}
                  onChange={(e) =>
                    setEdit({ ...edit, defaultCustomerAccount: e.target.value })
                  }
                />
              </div>
              <div className="accounting-form-field">
                <label>Compte produit</label>
                <input
                  className="portal-input"
                  value={edit.defaultRevenueAccount}
                  onChange={(e) =>
                    setEdit({ ...edit, defaultRevenueAccount: e.target.value })
                  }
                />
              </div>
              <div className="accounting-form-field">
                <label>Compte charge</label>
                <input
                  className="portal-input"
                  value={edit.defaultExpenseAccount}
                  onChange={(e) =>
                    setEdit({ ...edit, defaultExpenseAccount: e.target.value })
                  }
                />
              </div>
              <div className="accounting-form-field">
                <label>Compte banque</label>
                <input
                  className="portal-input"
                  value={edit.defaultBankAccount}
                  onChange={(e) =>
                    setEdit({ ...edit, defaultBankAccount: e.target.value })
                  }
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                className="portal-button"
                onClick={handleSaveInfo}
                disabled={saving}
              >
                {saving ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </section>

          <section className="accounting-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Endpoints API</h2>
            <p
              style={{
                color: 'rgba(255,255,255,0.65)',
                fontSize: '0.85rem',
                marginTop: 0,
              }}
            >
              Le site tiers doit utiliser le slug{' '}
              <span className="code">{source.slug}</span> dans toutes les URL.
            </p>

            <div
              style={{
                background: 'rgba(15,15,20,0.7)',
                border: '1px solid rgba(14,165,233,0.2)',
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
                <span style={{ color: '#7dd3fc' }}>GET&nbsp;</span> https://venio.paris/api/external/
                {source.slug}/entries/{'{externalId}'}
              </div>
              <div>
                <span style={{ color: '#7dd3fc' }}>GET&nbsp;</span> https://venio.paris/api/external/
                {source.slug}/entries?from=&to=
              </div>
              <div>
                <span style={{ color: '#7dd3fc' }}>GET&nbsp;</span> https://venio.paris/api/external/
                {source.slug}/ping
              </div>
            </div>

            <h3
              style={{
                margin: '20px 0 10px 0',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'rgba(34,211,238,0.85)',
              }}
            >
              Headers requis
            </h3>
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>Header</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="code">X-Api-Key</td>
                  <td>Clé API de la source (préfixe actuel : {source.apiKeyPrefix || '—'}…)</td>
                </tr>
                <tr>
                  <td className="code">X-Venio-Signature</td>
                  <td>HMAC-SHA256 du body brut, signé avec le secret webhook</td>
                </tr>
                <tr>
                  <td className="code">X-Venio-Timestamp</td>
                  <td>Timestamp Unix (s) inclus dans le calcul de la signature (anti-replay)</td>
                </tr>
                <tr>
                  <td className="code">Idempotency-Key</td>
                  <td>Identifiant unique de la requête côté tiers (anti-doublon)</td>
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
                Dernière rotation de clé : {formatDateTime(source.rotatedAt)}
              </p>
            )}
          </section>
        </>
      )}

      {/* ---- Tab : Rules ---- */}
      {activeTab === 'rules' && (
        <section className="accounting-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                Règles de classification
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: '0.85rem',
                    color: 'rgba(255,255,255,0.55)',
                    fontWeight: 400,
                  }}
                >
                  ({sortedRules.length})
                </span>
              </h2>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '0.82rem',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                Les règles sont évaluées par priorité décroissante. La première qui matche
                s'applique.
              </p>
            </div>
            <button className="portal-button" onClick={openNewRule}>
              ✚ Nouvelle règle
            </button>
          </div>

          {editingRule && (
            <div
              className="accounting-card"
              style={{
                background: 'rgba(14,165,233,0.04)',
                marginBottom: 16,
              }}
            >
              <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
                {editingRule._id ? 'Modifier la règle' : 'Nouvelle règle'}
              </h3>

              <div className="accounting-form">
                <div className="accounting-form-field">
                  <label>Nom *</label>
                  <input
                    className="portal-input"
                    placeholder="Ex: Ventes Arrow standard"
                    value={editingRule.name}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, name: e.target.value })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>Priorité</label>
                  <input
                    type="number"
                    className="portal-input"
                    value={editingRule.priority}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, priority: e.target.value })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={editingRule.enabled}
                      onChange={(e) =>
                        setEditingRule({ ...editingRule, enabled: e.target.checked })
                      }
                      style={{ marginRight: 8 }}
                    />
                    Règle active
                  </label>
                </div>
              </div>

              {/* Conditions collapsible */}
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSections((s) => ({ ...s, conditions: !s.conditions }))
                  }
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(34,211,238,0.85)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: 0,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {expandedSections.conditions ? '▼' : '▶'} Conditions
                </button>
                {expandedSections.conditions && (
                  <div className="accounting-form" style={{ marginTop: 12 }}>
                    <div className="accounting-form-field">
                      <label>Type</label>
                      <select
                        className="portal-input"
                        value={editingRule.conditions.type}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: { ...editingRule.conditions, type: e.target.value },
                          })
                        }
                      >
                        {RULE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="accounting-form-field">
                      <label>Catégorie (regex)</label>
                      <input
                        className="portal-input"
                        placeholder="^(rental|sale)$"
                        value={editingRule.conditions.categoryRegex}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              categoryRegex: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Description (regex)</label>
                      <input
                        className="portal-input"
                        placeholder="commission|fees"
                        value={editingRule.conditions.descriptionRegex}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              descriptionRegex: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Montant min</label>
                      <input
                        type="number"
                        step="0.01"
                        className="portal-input"
                        value={editingRule.conditions.amountMin}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              amountMin: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Montant max</label>
                      <input
                        type="number"
                        step="0.01"
                        className="portal-input"
                        value={editingRule.conditions.amountMax}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              amountMax: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Devise</label>
                      <input
                        className="portal-input"
                        placeholder="EUR"
                        maxLength={3}
                        value={editingRule.conditions.currency}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              currency: e.target.value.toUpperCase(),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Tags requis (tous)</label>
                      <input
                        className="portal-input"
                        placeholder="foo, bar"
                        value={editingRule.conditions.tagsAll}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              tagsAll: e.target.value,
                            },
                          })
                        }
                      />
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                        Séparés par des virgules
                      </span>
                    </div>
                    <div className="accounting-form-field">
                      <label>Tags requis (un seul suffit)</label>
                      <input
                        className="portal-input"
                        placeholder="paid, completed"
                        value={editingRule.conditions.tagsAny}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            conditions: {
                              ...editingRule.conditions,
                              tagsAny: e.target.value,
                            },
                          })
                        }
                      />
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                        Séparés par des virgules
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Mapping collapsible */}
              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedSections((s) => ({ ...s, mapping: !s.mapping }))
                  }
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(34,211,238,0.85)',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    padding: 0,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {expandedSections.mapping ? '▼' : '▶'} Mapping comptable
                </button>
                {expandedSections.mapping && (
                  <div className="accounting-form" style={{ marginTop: 12 }}>
                    <div className="accounting-form-field">
                      <label>Code journal</label>
                      <input
                        className="portal-input"
                        placeholder="VE"
                        value={editingRule.mapping.journalCode}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            mapping: {
                              ...editingRule.mapping,
                              journalCode: e.target.value.toUpperCase(),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Compte débit</label>
                      <input
                        className="portal-input"
                        placeholder="411000"
                        value={editingRule.mapping.debitAccount}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            mapping: {
                              ...editingRule.mapping,
                              debitAccount: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Compte crédit</label>
                      <input
                        className="portal-input"
                        placeholder="706000"
                        value={editingRule.mapping.creditAccount}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            mapping: {
                              ...editingRule.mapping,
                              creditAccount: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field">
                      <label>Taux de TVA forcé (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="portal-input"
                        placeholder="20"
                        value={editingRule.mapping.vatRateValue}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            mapping: {
                              ...editingRule.mapping,
                              vatRateValue: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="accounting-form-field full">
                      <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}>
                        <input
                          type="checkbox"
                          checked={editingRule.mapping.useVatFromPayload}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              mapping: {
                                ...editingRule.mapping,
                                useVatFromPayload: e.target.checked,
                              },
                            })
                          }
                          style={{ marginRight: 8 }}
                        />
                        Utiliser le taux de TVA du payload (sinon utilise le taux ci-dessus)
                      </label>
                    </div>
                    <div className="accounting-form-field full">
                      <label>Modèle de libellé</label>
                      <input
                        className="portal-input"
                        placeholder="Vente Arrow {description}"
                        value={editingRule.mapping.labelTemplate}
                        onChange={(e) =>
                          setEditingRule({
                            ...editingRule,
                            mapping: {
                              ...editingRule.mapping,
                              labelTemplate: e.target.value,
                            },
                          })
                        }
                      />
                      <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                        Variables disponibles : <span className="code">{'{description}'}</span>{' '}
                        <span className="code">{'{externalId}'}</span>{' '}
                        <span className="code">{'{date}'}</span>
                      </span>
                    </div>
                    <div className="accounting-form-field">
                      <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}>
                        <input
                          type="checkbox"
                          checked={editingRule.mapping.autoValidate}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              mapping: {
                                ...editingRule.mapping,
                                autoValidate: e.target.checked,
                              },
                            })
                          }
                          style={{ marginRight: 8 }}
                        />
                        Auto-valider l'écriture
                      </label>
                    </div>
                    <div className="accounting-form-field">
                      <label style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}>
                        <input
                          type="checkbox"
                          checked={editingRule.mapping.assignToAuxiliary}
                          onChange={(e) =>
                            setEditingRule({
                              ...editingRule,
                              mapping: {
                                ...editingRule.mapping,
                                assignToAuxiliary: e.target.checked,
                              },
                            })
                          }
                          style={{ marginRight: 8 }}
                        />
                        Affecter au compte auxiliaire
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {ruleError && (
                <div className="accounting-message error" style={{ marginTop: 14 }}>
                  {ruleError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  className="portal-button"
                  onClick={handleSaveRule}
                  disabled={ruleSaving}
                >
                  {ruleSaving ? 'Enregistrement…' : editingRule._id ? '✓ Mettre à jour' : '✚ Créer'}
                </button>
                <button
                  className="portal-button secondary"
                  onClick={() => setEditingRule(null)}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {rulesLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
          ) : sortedRules.length === 0 ? (
            <div className="accounting-empty">
              Aucune règle de classification.
              <div className="hint">
                Sans règle, les écritures utilisent les mappings par défaut de la source.
              </div>
            </div>
          ) : (
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>Priorité</th>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Mapping</th>
                  <th className="amount">Matches</th>
                  <th>Dernier match</th>
                  <th>État</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRules.map((r) => (
                  <tr key={r._id} style={r.enabled ? undefined : { opacity: 0.55 }}>
                    <td className="code">{r.priority}</td>
                    <td>{r.name}</td>
                    <td className="code">{r.conditions?.type || '—'}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {r.mapping?.journalCode && (
                        <span className="code">{r.mapping.journalCode}</span>
                      )}{' '}
                      {r.mapping?.debitAccount && (
                        <>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Db</span>{' '}
                          <span className="code">{r.mapping.debitAccount}</span>{' '}
                        </>
                      )}
                      {r.mapping?.creditAccount && (
                        <>
                          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Cr</span>{' '}
                          <span className="code">{r.mapping.creditAccount}</span>
                        </>
                      )}
                    </td>
                    <td className="amount">
                      {Number(r.matchCount || 0).toLocaleString('fr-FR')}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{formatDateTime(r.lastMatchedAt)}</td>
                    <td>
                      <span
                        className={`accounting-badge ${r.enabled ? 'validated' : 'locked'}`}
                      >
                        {r.enabled ? 'Active' : 'Désactivée'}
                      </span>
                    </td>
                    <td>
                      <div className="accounting-row-actions">
                        <button type="button" onClick={() => openEditRule(r)}>
                          Éditer
                        </button>
                        <button type="button" onClick={() => handleToggleRule(r)}>
                          {r.enabled ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          type="button"
                          disabled
                          title="Bientôt disponible"
                          style={{ opacity: 0.5, cursor: 'not-allowed' }}
                        >
                          Tester
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleDeleteRule(r)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* ---- Tab : Transactions ---- */}
      {activeTab === 'tx' && (
        <section className="accounting-card">
          <div className="accounting-toolbar">
            <select
              className="portal-input"
              value={txFilters.status}
              onChange={(e) =>
                setTxFilters({ ...txFilters, status: e.target.value, page: 1 })
              }
            >
              {TRANSACTION_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="portal-input"
              placeholder="External ID…"
              value={txFilters.externalId}
              onChange={(e) =>
                setTxFilters({ ...txFilters, externalId: e.target.value })
              }
              onKeyDown={(e) => e.key === 'Enter' && reloadTransactions()}
            />
            <input
              type="date"
              className="portal-input"
              value={txFilters.from}
              onChange={(e) => setTxFilters({ ...txFilters, from: e.target.value })}
            />
            <input
              type="date"
              className="portal-input"
              value={txFilters.to}
              onChange={(e) => setTxFilters({ ...txFilters, to: e.target.value })}
            />
            <button
              className="portal-button secondary"
              onClick={() => reloadTransactions()}
            >
              Filtrer
            </button>
          </div>

          {txLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
          ) : transactions.length === 0 ? (
            <div className="accounting-empty">
              Aucune transaction reçue pour ces filtres.
            </div>
          ) : (
            <>
              <table className="accounting-table">
                <thead>
                  <tr>
                    <th>Reçue le</th>
                    <th>External ID</th>
                    <th>Statut</th>
                    <th>Auto-validée</th>
                    <th>Écriture liée</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t._id}>
                      <td style={{ fontSize: '0.82rem' }}>{formatDateTime(t.receivedAt)}</td>
                      <td className="code">{t.externalId || '—'}</td>
                      <td>
                        <span className={`accounting-badge ${txStatusClass(t.status)}`}>
                          {t.status}
                        </span>
                        {t.errorReason && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: '#fca5a5',
                              marginTop: 2,
                            }}
                          >
                            {t.errorReason}
                          </div>
                        )}
                      </td>
                      <td>
                        {t.autoValidated ? (
                          <span className="accounting-badge validated">Oui</span>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {t.generatedEntry ? (
                          <Link
                            to={`/admin/comptabilite/ecritures/${
                              typeof t.generatedEntry === 'object'
                                ? t.generatedEntry._id
                                : t.generatedEntry
                            }`}
                            className="code"
                          >
                            Voir →
                          </Link>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="accounting-row-actions">
                          <button type="button" onClick={() => setTxDetail(t)}>
                            Détail
                          </button>
                          {(t.status === 'REJECTED' ||
                            t.status === 'AWAITING_REVIEW') && (
                            <button type="button" onClick={() => handleReplay(t)}>
                              Rejouer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {txTotalPages > 1 && (
                <div className="accounting-pagination">
                  <button
                    className="portal-button secondary"
                    disabled={txFilters.page <= 1}
                    onClick={() =>
                      setTxFilters({ ...txFilters, page: txFilters.page - 1 })
                    }
                  >
                    ← Précédent
                  </button>
                  <span
                    style={{
                      alignSelf: 'center',
                      color: 'rgba(255,255,255,0.6)',
                    }}
                  >
                    Page {txFilters.page} / {txTotalPages} ({txTotal} total)
                  </span>
                  <button
                    className="portal-button secondary"
                    disabled={txFilters.page >= txTotalPages}
                    onClick={() =>
                      setTxFilters({ ...txFilters, page: txFilters.page + 1 })
                    }
                  >
                    Suivant →
                  </button>
                </div>
              )}
            </>
          )}

          {txDetail && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 16,
                backdropFilter: 'blur(6px)',
              }}
              onClick={() => setTxDetail(null)}
            >
              <div
                className="accounting-card"
                style={{
                  maxWidth: 920,
                  width: '100%',
                  maxHeight: '90vh',
                  overflow: 'auto',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                      Transaction <span className="code">{txDetail.externalId}</span>
                    </h2>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        color: 'rgba(255,255,255,0.55)',
                        marginTop: 4,
                      }}
                    >
                      Reçue le {formatDateTime(txDetail.receivedAt)} ·{' '}
                      <span className={`accounting-badge ${txStatusClass(txDetail.status)}`}>
                        {txDetail.status}
                      </span>
                      {txDetail.signatureVerified === false && (
                        <span
                          className="accounting-badge draft"
                          style={{ marginLeft: 8 }}
                        >
                          ⚠ Signature non vérifiée
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="portal-button secondary"
                    onClick={() => setTxDetail(null)}
                  >
                    Fermer
                  </button>
                </div>

                {txDetail.errorReason && (
                  <div className="accounting-message error" style={{ marginTop: 14 }}>
                    {txDetail.errorReason}
                  </div>
                )}

                {txDetail.matchedRule && (
                  <div className="accounting-message info" style={{ marginTop: 14 }}>
                    Règle matchée :{' '}
                    <strong>
                      {typeof txDetail.matchedRule === 'object'
                        ? txDetail.matchedRule.name
                        : txDetail.matchedRule}
                    </strong>
                  </div>
                )}

                <div style={{ marginTop: 18 }}>
                  <h3
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'rgba(34,211,238,0.85)',
                    }}
                  >
                    Payload brut reçu
                  </h3>
                  <pre
                    style={{
                      background: 'rgba(15,15,20,0.85)',
                      border: '1px solid rgba(14,165,233,0.2)',
                      borderRadius: 10,
                      padding: 14,
                      fontSize: '0.78rem',
                      color: 'rgba(255,255,255,0.85)',
                      overflow: 'auto',
                      maxHeight: 280,
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(txDetail.rawPayload || {}, null, 2)}
                  </pre>
                </div>

                <div style={{ marginTop: 18 }}>
                  <h3
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'rgba(192,132,252,0.85)',
                    }}
                  >
                    Payload normalisé
                  </h3>
                  <pre
                    style={{
                      background: 'rgba(15,15,20,0.85)',
                      border: '1px solid rgba(192,132,252,0.2)',
                      borderRadius: 10,
                      padding: 14,
                      fontSize: '0.78rem',
                      color: 'rgba(255,255,255,0.85)',
                      overflow: 'auto',
                      maxHeight: 280,
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(txDetail.normalizedPayload || {}, null, 2)}
                  </pre>
                </div>

                {txDetail.generatedEntry && (
                  <div style={{ marginTop: 18 }}>
                    <h3
                      style={{
                        margin: '0 0 8px 0',
                        fontSize: '0.85rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'rgba(74,222,128,0.85)',
                      }}
                    >
                      Écriture comptable
                    </h3>
                    <Link
                      to={`/admin/comptabilite/ecritures/${
                        typeof txDetail.generatedEntry === 'object'
                          ? txDetail.generatedEntry._id
                          : txDetail.generatedEntry
                      }`}
                      className="portal-button secondary"
                    >
                      Voir l'écriture →
                    </Link>
                  </div>
                )}

                <div
                  style={{
                    marginTop: 18,
                    fontSize: '0.78rem',
                    color: 'rgba(255,255,255,0.45)',
                  }}
                >
                  IP : {txDetail.requestIp || '—'} · UA :{' '}
                  {txDetail.requestUserAgent || '—'} · Idempotency :{' '}
                  <span className="code">{txDetail.idempotencyKey || '—'}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </AccountingLayout>
  )
}
