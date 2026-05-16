import { useEffect, useState } from 'react'
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
} from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type {
  ICompanySettings,
  IFiscalYear,
  IExternalSource,
} from '../../../types/accounting'

const ARROW_SLUG = 'arrow-corp'

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
  const [arrowLoading, setArrowLoading] = useState(false)
  const [credentials, setCredentials] = useState<GeneratedCredentials | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const arrowSource = externalSources.find((s) => s.slug === ARROW_SLUG) || null

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

  async function handleGenerateArrow() {
    if (arrowSource) return
    setArrowLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await createExternalSource({
        slug: ARROW_SLUG,
        name: 'Arrow Corp',
        description: 'Intégration Arrow (pousser les écritures comptables)',
        autoValidateAll: false,
      })
      setCredentials({
        apiKey: result.apiKey,
        webhookSecret: result.webhookSecret,
        sourceSlug: result.source.slug,
        sourceName: result.source.name,
        warning: result.warning,
        context: 'created',
      })
      await reloadExternalSources()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création')
    } finally {
      setArrowLoading(false)
    }
  }

  async function handleRotateArrow() {
    if (!arrowSource) return
    if (
      !confirm(
        "Régénérer les clés invalidera l'ancienne immédiatement. Arrow ne pourra plus pousser tant que les nouvelles clés ne sont pas déployées. Continuer ?"
      )
    )
      return
    setArrowLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await rotateExternalSourceKey(arrowSource._id)
      setCredentials({
        apiKey: result.apiKey,
        webhookSecret: result.webhookSecret,
        sourceSlug: arrowSource.slug,
        sourceName: arrowSource.name,
        warning: result.warning,
        context: 'rotated',
      })
      await reloadExternalSources()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la rotation')
    } finally {
      setArrowLoading(false)
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

      <section className="accounting-card">
        <h2>Exercices comptables</h2>
        {fiscalYears.length === 0 ? (
          <div className="accounting-empty">
            Aucun exercice défini.
            <div className="hint">
              Un exercice par année calendaire sera créé automatiquement à la première écriture.
            </div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Période</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fiscalYears.map((fy) => (
                <tr key={fy._id}>
                  <td className="code">{fy.code}</td>
                  <td>{fy.label}</td>
                  <td>
                    {new Date(fy.startDate).toLocaleDateString('fr-FR')} →{' '}
                    {new Date(fy.endDate).toLocaleDateString('fr-FR')}
                  </td>
                  <td>
                    <span
                      className={`accounting-badge ${fy.status === 'OUVERT' ? 'draft' : 'locked'}`}
                    >
                      {fy.status}
                    </span>
                  </td>
                  <td>
                    {fy.status === 'OUVERT' && canLock && (
                      <div className="accounting-row-actions">
                        <button className="danger" onClick={() => handleClose(fy._id)}>
                          Clôturer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {canManage && (
          <form onSubmit={handleCreateYear} style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: '1rem' }}>Créer un exercice manuellement</h2>
            <div className="accounting-form">
              <div className="accounting-form-field">
                <label>Code</label>
                <input
                  className="portal-input"
                  value={newYear.code}
                  onChange={(e) => setNewYear({ ...newYear, code: e.target.value })}
                  placeholder="FY-2026"
                />
              </div>
              <div className="accounting-form-field">
                <label>Libellé</label>
                <input
                  className="portal-input"
                  value={newYear.label}
                  onChange={(e) => setNewYear({ ...newYear, label: e.target.value })}
                  placeholder="Exercice 2026"
                />
              </div>
              <div className="accounting-form-field">
                <label>Début</label>
                <input
                  type="date"
                  className="portal-input"
                  value={newYear.startDate}
                  onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })}
                />
              </div>
              <div className="accounting-form-field">
                <label>Fin</label>
                <input
                  type="date"
                  className="portal-input"
                  value={newYear.endDate}
                  onChange={(e) => setNewYear({ ...newYear, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="accounting-toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="submit" className="portal-button">
                Créer
              </button>
            </div>
          </form>
        )}
      </section>

      {renderIntegrationsSection({
        canManage,
        arrowSource,
        arrowLoading,
        onGenerate: handleGenerateArrow,
        onRotate: handleRotateArrow,
      })}

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
  arrowSource: IExternalSource | null
  arrowLoading: boolean
  onGenerate: () => void
  onRotate: () => void
}

function renderIntegrationsSection(props: IntegrationsSectionProps) {
  const { canManage, arrowSource, arrowLoading, onGenerate, onRotate } = props

  return (
    <section className="accounting-card">
      <h2>Intégrations externes (Arrow, e-commerce, …)</h2>

      <div
        style={{
          marginTop: 8,
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
          Les sites tiers (ex&nbsp;: Arrow) peuvent pousser leurs écritures comptables directement
          dans Venio via une API sécurisée. Chaque source dispose&nbsp;:
        </p>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div>
            <span style={{ color: '#7dd3fc', fontWeight: 600 }}>🔑 Clé API (X-Api-Key)</span>
            <div style={{ paddingLeft: 22, color: 'rgba(255,255,255,0.7)', fontSize: '0.84rem' }}>
              Identifie le site qui parle. Comme un mot de passe d'application.
            </div>
          </div>
          <div>
            <span style={{ color: '#c084fc', fontWeight: 600 }}>
              ✍️ Secret HMAC (X-Venio-Signature)
            </span>
            <div style={{ paddingLeft: 22, color: 'rgba(255,255,255,0.7)', fontSize: '0.84rem' }}>
              Signature cryptographique sur chaque requête. Empêche les attaques
              «&nbsp;man-in-the-middle&nbsp;» (modification du contenu en transit) et garantit que
              c'est bien Arrow qui envoie, même si la clé API était compromise.
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

      {/* Carte Arrow Corp */}
      <div
        style={{
          marginTop: 18,
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
          <div style={{ minWidth: 0 }}>
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
              Arrow Corp
              {arrowSource ? (
                <span
                  className="accounting-badge validated"
                  style={{ fontSize: '0.7rem' }}
                  title={`Statut: ${arrowSource.status}`}
                >
                  Active
                </span>
              ) : (
                <span
                  className="accounting-badge"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.65)',
                    fontSize: '0.7rem',
                  }}
                >
                  Non configurée
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              Slug&nbsp;: <code>{ARROW_SLUG}</code>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!arrowSource ? (
              <button
                type="button"
                className="portal-button"
                onClick={onGenerate}
                disabled={!canManage || arrowLoading}
              >
                {arrowLoading ? '⏳ Génération…' : '⚡ Générer la source Arrow'}
              </button>
            ) : (
              <>
                <Link
                  to={`/admin/comptabilite/sources-externes/${arrowSource._id}`}
                  className="portal-button secondary"
                  style={{ textDecoration: 'none' }}
                >
                  ⚙️ Configuration détaillée
                </Link>
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={onRotate}
                  disabled={!canManage || arrowLoading}
                  title="Génère une nouvelle paire clé / secret et invalide l'ancienne"
                >
                  {arrowLoading ? '⏳ Rotation…' : '🔄 Régénérer les clés'}
                </button>
              </>
            )}
          </div>
        </div>

        {arrowSource && (
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
              value={arrowSource.apiKeyPrefix ? `${arrowSource.apiKeyPrefix}…` : '—'}
              mono
            />
            <StatCell
              label="Dernier ping"
              value={
                arrowSource.lastSeenAt
                  ? new Date(arrowSource.lastSeenAt).toLocaleString('fr-FR')
                  : 'Jamais'
              }
            />
            <StatCell label="Ingérées" value={String(arrowSource.totalIngested ?? 0)} />
            <StatCell label="Rejetées" value={String(arrowSource.totalRejected ?? 0)} />
            <StatCell label="Doublons" value={String(arrowSource.totalDuplicates ?? 0)} />
          </div>
        )}

        {arrowSource?.lastError && (
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
            ⚠ Dernière erreur&nbsp;: {arrowSource.lastError}
            {arrowSource.lastErrorAt && (
              <span style={{ opacity: 0.7, marginLeft: 6 }}>
                ({new Date(arrowSource.lastErrorAt).toLocaleString('fr-FR')})
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Link
          to="/admin/comptabilite/sources-externes"
          className="portal-button secondary"
          style={{ textDecoration: 'none' }}
        >
          Gérer toutes les sources externes →
        </Link>
      </div>
    </section>
  )
}

function StatCell({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
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
      ? '🔄 Nouvelles clés générées'
      : '🎉 Source créée avec succès !'

  return (
    <div
      role="dialog"
      aria-modal="true"
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
      // Pas de fermeture au clic extérieur — l'utilisateur doit confirmer avoir noté
    >
      <div
        className="accounting-card"
        style={{
          maxWidth: 600,
          width: '100%',
          maxHeight: '92vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{title}</h2>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.65)',
            marginTop: -4,
            marginBottom: 14,
          }}
        >
          Source&nbsp;: <strong>{credentials.sourceName}</strong>{' '}
          <code style={{ opacity: 0.7 }}>({credentials.sourceSlug})</code>
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
          label="URL d'ingestion"
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
            <span>Variables à coller dans Arrow .env</span>
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
      </div>
    </div>
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

export default AccountingSettings
