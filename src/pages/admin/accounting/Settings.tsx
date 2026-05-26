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
import { IntegrationsSection } from './settings-sections/integrations-section'
import { CreateIntegrationModal, RevokeIntegrationModal, CredentialsModal } from './settings-sections/integrations-modals'

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


export default AccountingSettings
