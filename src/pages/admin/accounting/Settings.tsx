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
import type {
  ICompanySettings,
  IFiscalYear,
  IExternalSource,
  ExternalSourceStatus,
} from '../../../types/accounting'
import FiscalYearsSection from './settings-sections/FiscalYearsSection'

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]+$/

interface GeneratedCredentials {
  apiKey: string
  webhookSecret: string
  sourceSlug: string
  sourceName: string
  warning?: string
  context: 'created' | 'rotated'
}

const FISCAL_REGIMES = [
  { value: 'REEL_NORMAL', label: 'Réel normal (CA3 mensuel/trim.)' },
  { value: 'REEL_SIMPLIFIE', label: 'Réel simplifié (CA12 annuel)' },
  { value: 'MICRO', label: 'Micro-entreprise / franchise TVA' },
]

const VAT_PERIODICITIES = [
  { value: 'MENSUEL', label: 'Mensuelle' },
  { value: 'TRIMESTRIEL', label: 'Trimestrielle' },
  { value: 'ANNUEL', label: 'Annuelle' },
]

interface NewYearForm {
  code: string
  label: string
  startDate: string
  endDate: string
}

const AccountingSettings = () => {
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
      setError(err instanceof Error ? err.message : 'Erreur')
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
      setSuccess(`Intégration « ${result.source.name} » créée.`)
      await reloadExternalSources()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Erreur lors de la création'
    }
  }

  async function handleRotate(source: IExternalSource) {
    if (
      !confirm(
        `Régénérer les clés invalidera l'ancienne immédiatement. « ${source.name} » ne pourra plus pousser tant que les nouvelles clés ne sont pas déployées. Continuer ?`
      )
    )
      return
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
      setError(err instanceof Error ? err.message : 'Erreur lors de la rotation')
    } finally {
      setRotatingId(null)
    }
  }

  async function handleRevoke(source: IExternalSource): Promise<string | null> {
    try {
      await deleteExternalSource(source._id)
      setRevokeTarget(null)
      setSuccess(`Intégration « ${source.name} » révoquée.`)
      await reloadExternalSources()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'Erreur lors de la révocation'
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
      setSuccess('Paramètres enregistrés.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function handleSeed() {
    if (!confirm('Initialiser le plan comptable, les journaux et les taux TVA par défaut ?')) return
    setError('')
    setSuccess('')
    try {
      const r = await seedPCG()
      setSuccess(
        `Initialisé : ${r.created.accounts} comptes, ${r.created.journals} journaux, ${r.created.vatRates} taux TVA.`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
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
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleClose(id: string) {
    if (!confirm("Clôturer cet exercice ? Cette opération verrouille toutes les écritures.")) return
    try {
      await closeFiscalYear(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  if (loading || !settings) {
    return (
      <AccountingLayout title="Paramètres comptables">
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      </AccountingLayout>
    )
  }

  return (
    <AccountingLayout title="Paramètres comptables" subtitle="Société, régime fiscal et exercices">
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <section className="accounting-card">
        <h2>Initialisation</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
          Si vous démarrez, cliquez ci-dessous pour créer le plan comptable agence par défaut (60+ comptes),
          les journaux usuels (VE, AC, BQ, OD, AN) et les taux de TVA standards (20 / 10 / 5,5 / 2,1 / 0 %).
          L'opération est idempotente — vous pouvez la relancer.
        </p>
        <button
          className="portal-button"
          onClick={handleSeed}
          disabled={!canManage}
          style={{ marginTop: 8 }}
        >
          Initialiser PCG / Journaux / TVA
        </button>
      </section>

      <form className="accounting-card" onSubmit={handleSave}>
        <h2>Identité juridique</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>Raison sociale</label>
            <input
              className="portal-input"
              value={settings.legalName || ''}
              onChange={(e) => setSettings({ ...settings, legalName: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>Forme juridique</label>
            <input
              className="portal-input"
              value={settings.legalForm || ''}
              onChange={(e) => setSettings({ ...settings, legalForm: e.target.value })}
              placeholder="SAS, SARL, EURL…"
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
            <label>N° TVA intracom</label>
            <input
              className="portal-input"
              value={settings.vatNumber || ''}
              onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })}
              placeholder="FR12345678901"
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>Code APE/NAF</label>
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
            <label>Capital social (€)</label>
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
            <label>Adresse — ligne 1</label>
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
            <label>Code postal</label>
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
            <label>Ville</label>
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
            <label>Pays</label>
            <input
              className="portal-input"
              value={settings.address?.country || 'France'}
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

        <h2 style={{ marginTop: 28 }}>Régime fiscal & TVA</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>Régime</label>
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
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>Périodicité TVA</label>
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
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>Mois de début d'exercice</label>
            <input
              type="number"
              min="1"
              max="12"
              className="portal-input"
              value={settings.fiscalYearStartMonth || 1}
              onChange={(e) =>
                setSettings({ ...settings, fiscalYearStartMonth: Number(e.target.value) })
              }
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field">
            <label>Délai paiement par défaut (jours)</label>
            <input
              type="number"
              min="0"
              className="portal-input"
              value={settings.paymentTermsDays ?? 30}
              onChange={(e) =>
                setSettings({ ...settings, paymentTermsDays: Number(e.target.value) })
              }
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>Mention pénalités de retard</label>
            <textarea
              className="portal-input"
              rows={2}
              value={settings.latePaymentRateNote || ''}
              onChange={(e) => setSettings({ ...settings, latePaymentRateNote: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>Mentions légales additionnelles (facture)</label>
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
            {saving ? 'Enregistrement…' : 'Enregistrer'}
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
        <RevokeIntegrationModal
          source={revokeTarget}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
        />
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

// ---- Sous-composants Intégrations externes ----

interface IntegrationsSectionProps {
  canManage: boolean
  sources: IExternalSource[]
  rotatingId: string | null
  onOpenCreate: () => void
  onRotate: (source: IExternalSource) => void
  onRequestRevoke: (source: IExternalSource) => void
}

function IntegrationsSection(props: IntegrationsSectionProps) {
  const { canManage, sources, rotatingId, onOpenCreate, onRotate, onRequestRevoke } = props

  return (
    <section className="accounting-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0 }}>Intégrations externes</h2>
        <button
          type="button"
          className="portal-button"
          onClick={onOpenCreate}
          disabled={!canManage}
        >
          + Nouvelle intégration
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '14px 16px',
          background:
            'linear-gradient(135deg, rgba(56,189,248,0.10) 0%, rgba(192,132,252,0.10) 100%)',
          border: '1px solid rgba(125,211,252,0.25)',
          borderRadius: 10,
          fontSize: '0.88rem',
          lineHeight: 1.55,
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        <p style={{ margin: 0 }}>
          Tout service tiers (Stripe, Shopify, Arrow, votre propre back-office…) peut pousser ses
          écritures comptables dans Venio via une API sécurisée. Chaque intégration dispose&nbsp;:
        </p>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div>
            <span style={{ color: '#7dd3fc', fontWeight: 600 }}>🔑 Clé API (X-Api-Key)</span>
            <div style={{ paddingLeft: 22, color: 'rgba(255,255,255,0.7)', fontSize: '0.84rem' }}>
              Identifie le service qui parle. Comme un mot de passe d'application.
            </div>
          </div>
          <div>
            <span style={{ color: '#c084fc', fontWeight: 600 }}>
              ✍️ Secret HMAC (X-Venio-Signature)
            </span>
            <div style={{ paddingLeft: 22, color: 'rgba(255,255,255,0.7)', fontSize: '0.84rem' }}>
              Signature cryptographique sur chaque requête. Empêche les attaques
              «&nbsp;man-in-the-middle&nbsp;» (modification du contenu en transit) et garantit
              l'authenticité de l'émetteur, même si la clé API était compromise.
            </div>
          </div>
        </div>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          📚 Documentation complète&nbsp;:{' '}
          <code
            style={{
              background: 'rgba(15,15,20,0.6)',
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: '0.78rem',
            }}
          >
            docs/accounting/ARROW_INGESTION_API.md
          </code>
        </p>
      </div>

      {sources.length === 0 ? (
        <div className="accounting-empty" style={{ marginTop: 18 }}>
          <div style={{ fontSize: '2rem', opacity: 0.45 }}>🔌</div>
          Aucune intégration configurée.
          <div className="hint">
            Cliquez sur «&nbsp;+ Nouvelle intégration&nbsp;» pour commencer.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {sources.map((source) => (
            <IntegrationCard
              key={source._id}
              source={source}
              canManage={canManage}
              rotating={rotatingId === source._id}
              onRotate={() => onRotate(source)}
              onRequestRevoke={() => onRequestRevoke(source)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface IntegrationCardProps {
  source: IExternalSource
  canManage: boolean
  rotating: boolean
  onRotate: () => void
  onRequestRevoke: () => void
}

function IntegrationCard({
  source,
  canManage,
  rotating,
  onRotate,
  onRequestRevoke,
}: IntegrationCardProps) {
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'rgba(15,15,20,0.55)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.92)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            {source.name}
            <StatusBadge status={source.status} />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: '0.82rem',
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            Slug&nbsp;:{' '}
            <code
              style={{
                fontFamily: "'SF Mono', Menlo, Consolas, monospace",
                background: 'rgba(15,15,20,0.6)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {source.slug}
            </code>
          </div>
          {source.description && (
            <div
              style={{
                marginTop: 6,
                fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              {source.description}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link
            to={`/admin/comptabilite/sources-externes/${source._id}`}
            className="portal-button secondary"
            style={{ textDecoration: 'none' }}
          >
            ⚙️ Configuration détaillée
          </Link>
          <button
            type="button"
            className="portal-button secondary"
            onClick={onRotate}
            disabled={!canManage || rotating}
            title="Génère une nouvelle paire clé / secret et invalide l'ancienne"
          >
            {rotating ? '⏳ Rotation…' : '🔄 Régénérer les clés'}
          </button>
          <button
            type="button"
            className="portal-button"
            onClick={onRequestRevoke}
            disabled={!canManage}
            style={{
              background: 'rgba(220,38,38,0.18)',
              border: '1px solid rgba(220,38,38,0.45)',
              color: '#fecaca',
            }}
            title="Supprime définitivement l'intégration"
          >
            🗑️ Révoquer
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          fontSize: '0.82rem',
        }}
      >
        <StatCell
          label="Préfixe clé"
          value={source.apiKeyPrefix ? `${source.apiKeyPrefix}…` : '—'}
          mono
        />
        <StatCell
          label="Dernier ping"
          value={source.lastSeenAt ? formatRelative(source.lastSeenAt) : 'Jamais'}
          title={source.lastSeenAt ? new Date(source.lastSeenAt).toLocaleString('fr-FR') : undefined}
        />
        <StatCell label="Ingérées" value={String(source.totalIngested ?? 0)} />
        <StatCell label="Rejetées" value={String(source.totalRejected ?? 0)} />
        <StatCell label="Doublons" value={String(source.totalDuplicates ?? 0)} />
      </div>

      {source.lastError && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.35)',
            borderRadius: 8,
            fontSize: '0.78rem',
            color: '#fecaca',
          }}
        >
          ⚠️ Dernière erreur&nbsp;: {source.lastError}
          {source.lastErrorAt && (
            <span style={{ opacity: 0.7, marginLeft: 6 }}>
              ({new Date(source.lastErrorAt).toLocaleString('fr-FR')})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ExternalSourceStatus }) {
  const map: Record<
    ExternalSourceStatus,
    { className: string; label: string; style?: React.CSSProperties }
  > = {
    ACTIVE: { className: 'accounting-badge validated', label: 'Active' },
    PAUSED: {
      className: 'accounting-badge',
      label: 'En pause',
      style: {
        background: 'rgba(251,146,60,0.15)',
        color: '#fdba74',
        border: '1px solid rgba(251,146,60,0.4)',
      },
    },
    DISABLED: {
      className: 'accounting-badge',
      label: 'Désactivée',
      style: {
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.55)',
        border: '1px solid rgba(255,255,255,0.12)',
      },
    },
  }
  const entry = map[status] || map.DISABLED
  return (
    <span
      className={entry.className}
      style={{ fontSize: '0.7rem', ...entry.style }}
      title={`Statut: ${status}`}
    >
      {entry.label}
    </span>
  )
}

function StatCell({
  label,
  value,
  mono,
  title,
}: {
  label: string
  value: string
  mono?: boolean
  title?: string
}) {
  return (
    <div
      title={title}
      style={{
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: '0.68rem',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          color: 'rgba(255,255,255,0.88)',
          fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
          fontSize: mono ? '0.82rem' : '0.88rem',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  if (Number.isNaN(diffMs)) return iso
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return "à l'instant"
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `il y a ${hr} h`
  const day = Math.floor(hr / 24)
  if (day < 30) return `il y a ${day} j`
  return date.toLocaleDateString('fr-FR')
}

// ---- Modal de création ----

interface CreateIntegrationModalProps {
  existingSlugs: string[]
  onCancel: () => void
  onSubmit: (payload: {
    slug: string
    name: string
    description?: string
    autoValidateAll: boolean
  }) => Promise<string | null>
}

function CreateIntegrationModal({
  existingSlugs,
  onCancel,
  onSubmit,
}: CreateIntegrationModalProps) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [autoValidateAll, setAutoValidateAll] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const existingSet = useMemo(() => new Set(existingSlugs), [existingSlugs])

  const slugValid = SLUG_REGEX.test(slug)
  const slugTaken = existingSet.has(slug)
  const slugProblem = slug.length > 0 && !slugValid
  const canSubmit = slugValid && !slugTaken && name.trim().length > 0 && !submitting

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return
    setFormError('')
    setSubmitting(true)
    const err = await onSubmit({
      slug,
      name: name.trim(),
      description: description.trim() || undefined,
      autoValidateAll,
    })
    if (err) {
      setFormError(err)
      setSubmitting(false)
    }
    // Si succès, le parent ferme la modal — pas besoin de reset.
  }

  return (
    <ModalShell title="Nouvelle intégration externe" onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>
            Slug <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            className="portal-input"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="stripe, shopify, ecom-bcg…"
            autoFocus
            required
          />
          <div
            style={{
              marginTop: 4,
              fontSize: '0.78rem',
              color: slugProblem || slugTaken ? '#fca5a5' : 'rgba(255,255,255,0.5)',
            }}
          >
            {slugTaken
              ? '⚠️ Ce slug est déjà utilisé par une autre intégration.'
              : slugProblem
                ? '⚠️ Minuscules, chiffres et tirets uniquement (≥ 2 caractères, doit commencer par lettre ou chiffre).'
                : 'Identifiant unique en minuscules. Ex : stripe, shopify, ecom-bcg.'}
          </div>
        </div>

        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>
            Nom affiché <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            className="portal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stripe, Shopify Store EU…"
            required
          />
        </div>

        <div className="accounting-form-field" style={{ marginBottom: 14 }}>
          <label>Description (optionnel)</label>
          <textarea
            className="portal-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Pousse les charges Stripe (frais, remboursements)…"
          />
        </div>

        <label
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '10px 12px',
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.30)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          <input
            type="checkbox"
            checked={autoValidateAll}
            onChange={(e) => setAutoValidateAll(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <strong style={{ color: '#fde68a' }}>Auto-validation</strong>
            <div
              style={{
                marginTop: 2,
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              Si coché, les écritures sont créées directement en <code>VALIDATED</code>. À
              n'activer que pour les sources de confiance maximale.
            </div>
          </span>
        </label>

        {formError && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'rgba(220,38,38,0.15)',
              border: '1px solid rgba(220,38,38,0.40)',
              borderRadius: 8,
              color: '#fecaca',
              fontSize: '0.85rem',
            }}
          >
            {formError}
          </div>
        )}

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            className="portal-button secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Annuler
          </button>
          <button type="submit" className="portal-button" disabled={!canSubmit}>
            {submitting ? '⏳ Création…' : "Créer l'intégration"}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ---- Modal de révocation ----

interface RevokeIntegrationModalProps {
  source: IExternalSource
  onCancel: () => void
  onConfirm: (source: IExternalSource) => Promise<string | null>
}

function RevokeIntegrationModal({ source, onCancel, onConfirm }: RevokeIntegrationModalProps) {
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const canSubmit = confirmation === source.slug && !submitting

  async function handleConfirm() {
    if (!canSubmit) return
    setFormError('')
    setSubmitting(true)
    const err = await onConfirm(source)
    if (err) {
      setFormError(err)
      setSubmitting(false)
    }
  }

  return (
    <ModalShell title="Révoquer cette intégration ?" onClose={onCancel}>
      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(220,38,38,0.10)',
          border: '1px solid rgba(220,38,38,0.40)',
          borderRadius: 10,
          color: '#fecaca',
          fontSize: '0.88rem',
          lineHeight: 1.55,
        }}
      >
        ⚠️ Cette action est <strong>irréversible</strong>. L'intégration{' '}
        <code
          style={{
            background: 'rgba(15,15,20,0.6)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {source.slug}
        </code>{' '}
        sera supprimée et sa clé API immédiatement invalidée. Les écritures déjà reçues sont
        conservées.
      </div>

      <div className="accounting-form-field" style={{ marginTop: 18 }}>
        <label>
          Pour confirmer, tapez le slug{' '}
          <code
            style={{
              background: 'rgba(15,15,20,0.6)',
              padding: '1px 6px',
              borderRadius: 4,
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            }}
          >
            {source.slug}
          </code>{' '}
          ci-dessous :
        </label>
        <input
          className="portal-input"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={source.slug}
          autoFocus
        />
      </div>

      {formError && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'rgba(220,38,38,0.15)',
            border: '1px solid rgba(220,38,38,0.40)',
            borderRadius: 8,
            color: '#fecaca',
            fontSize: '0.85rem',
          }}
        >
          {formError}
        </div>
      )}

      <div
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          className="portal-button secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Annuler
        </button>
        <button
          type="button"
          className="portal-button"
          onClick={handleConfirm}
          disabled={!canSubmit}
          style={{
            background: canSubmit ? 'rgba(220,38,38,0.85)' : 'rgba(220,38,38,0.35)',
            border: '1px solid rgba(220,38,38,0.55)',
            color: '#fff',
          }}
        >
          {submitting ? '⏳ Révocation…' : 'Révoquer définitivement'}
        </button>
      </div>
    </ModalShell>
  )
}

// ---- Modal Credentials ----

interface CredentialsModalProps {
  credentials: GeneratedCredentials
  copiedField: string | null
  onCopy: (value: string, fieldKey: string) => void
  onClose: () => void
}

function CredentialsModal({ credentials, copiedField, onCopy, onClose }: CredentialsModalProps) {
  const ingestUrl = `https://venio.paris/api/external/${credentials.sourceSlug}/entries`
  const envBlock = [
    `VENIO_API_KEY=${credentials.apiKey}`,
    `VENIO_HMAC_SECRET=${credentials.webhookSecret}`,
    `VENIO_INGEST_URL=${ingestUrl}`,
    'VENIO_API_VERSION=2026-01',
  ].join('\n')

  const title =
    credentials.context === 'rotated'
      ? `🔄 Nouvelles clés pour ${credentials.sourceName}`
      : `🎉 Intégration ${credentials.sourceName} créée`

  return (
    <ModalShell title={title} onClose={onClose} closeOnBackdrop={false} wide>
      <div
        style={{
          fontSize: '0.85rem',
          color: 'rgba(255,255,255,0.65)',
          marginTop: -4,
          marginBottom: 14,
        }}
      >
        Slug&nbsp;:{' '}
        <code
          style={{
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            background: 'rgba(15,15,20,0.6)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {credentials.sourceSlug}
        </code>
      </div>

      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(251,191,36,0.10)',
          border: '1px solid rgba(251,191,36,0.40)',
          borderRadius: 10,
          color: '#fde68a',
          fontSize: '0.88rem',
          lineHeight: 1.5,
        }}
      >
        ⚠️ Ces valeurs ne s'afficheront <strong>PLUS JAMAIS</strong>.
        <br />
        Stocke-les immédiatement dans un gestionnaire de secrets sécurisé.
        {credentials.warning && (
          <div style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.85 }}>
            {credentials.warning}
          </div>
        )}
      </div>

      <SecretField
        label="VENIO_API_KEY"
        value={credentials.apiKey}
        color="#7dd3fc"
        borderColor="rgba(14,165,233,0.35)"
        fieldKey="apiKey"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_HMAC_SECRET"
        value={credentials.webhookSecret}
        color="#c084fc"
        borderColor="rgba(192,132,252,0.35)"
        fieldKey="webhookSecret"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_INGEST_URL"
        value={ingestUrl}
        color="#86efac"
        borderColor="rgba(134,239,172,0.35)"
        fieldKey="ingestUrl"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <div style={{ marginTop: 22 }}>
        <div
          style={{
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'rgba(255,255,255,0.55)',
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Variables à coller dans le .env du service</span>
          <button
            type="button"
            className="portal-button secondary"
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            onClick={() => onCopy(envBlock, 'envBlock')}
          >
            {copiedField === 'envBlock' ? '✓ Copié' : '📋 Tout copier'}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            background: 'rgba(15,15,20,0.85)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.88)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {envBlock}
        </pre>
      </div>

      <div
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button type="button" className="portal-button" onClick={onClose}>
          ✅ J'ai bien noté les credentials → Fermer
        </button>
      </div>
    </ModalShell>
  )
}

interface SecretFieldProps {
  label: string
  value: string
  color: string
  borderColor: string
  fieldKey: string
  copiedField: string | null
  onCopy: (value: string, fieldKey: string) => void
}

function SecretField({
  label,
  value,
  color,
  borderColor,
  fieldKey,
  copiedField,
  onCopy,
}: SecretFieldProps) {
  return (
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
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: '1 1 280px',
            padding: '12px 14px',
            background: 'rgba(15,15,20,0.85)',
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.86rem',
            color,
            wordBreak: 'break-all',
            userSelect: 'all',
            minWidth: 0,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          className="portal-button secondary"
          onClick={() => onCopy(value, fieldKey)}
          style={{ whiteSpace: 'nowrap' }}
        >
          {copiedField === fieldKey ? '✓ Copié' : '📋 Copier'}
        </button>
      </div>
    </div>
  )
}

// ---- Modal shell générique ----

interface ModalShellProps {
  title: string
  onClose: () => void
  closeOnBackdrop?: boolean
  wide?: boolean
  children: React.ReactNode
}

function ModalShell({
  title,
  onClose,
  closeOnBackdrop = true,
  wide = false,
  children,
}: ModalShellProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (closeOnBackdrop) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        className="accounting-card"
        style={{
          maxWidth: wide ? 600 : 520,
          width: '100%',
          maxHeight: '92vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export default AccountingSettings
