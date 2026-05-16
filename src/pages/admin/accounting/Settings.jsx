import React, { useEffect, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import {
  getAccountingSettings,
  updateAccountingSettings,
  listFiscalYears,
  createFiscalYear,
  closeFiscalYear,
  seedPCG,
} from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'

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

export default function AccountingSettings() {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const canLock = hasPermission(user, PERMISSIONS.LOCK_ACCOUNTING)

  const [settings, setSettings] = useState(null)
  const [fiscalYears, setFiscalYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newYear, setNewYear] = useState({ code: '', label: '', startDate: '', endDate: '' })

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const [s, fy] = await Promise.all([getAccountingSettings(), listFiscalYears()])
      setSettings(s)
      setFiscalYears(fy)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await updateAccountingSettings({ ...settings, isConfigured: true })
      setSettings(updated)
      setSuccess('Paramètres enregistrés.')
    } catch (err) {
      setError(err.message)
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
      setError(err.message)
    }
  }

  async function handleCreateYear(e) {
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
      setError(err.message)
    }
  }

  async function handleClose(id) {
    if (!confirm("Clôturer cet exercice ? Cette opération verrouille toutes les écritures.")) return
    try {
      await closeFiscalYear(id)
      await reload()
    } catch (err) {
      setError(err.message)
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
                setSettings({ ...settings, address: { ...settings.address, line1: e.target.value } })
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
                setSettings({ ...settings, address: { ...settings.address, zip: e.target.value } })
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
                setSettings({ ...settings, address: { ...settings.address, city: e.target.value } })
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
                setSettings({ ...settings, address: { ...settings.address, country: e.target.value } })
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
              onChange={(e) => setSettings({ ...settings, fiscalRegime: e.target.value })}
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
              onChange={(e) => setSettings({ ...settings, vatPeriodicity: e.target.value })}
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
              onChange={(e) => setSettings({ ...settings, paymentTermsDays: Number(e.target.value) })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>Mention pénalités de retard</label>
            <textarea
              className="portal-input"
              rows="2"
              value={settings.latePaymentRateNote || ''}
              onChange={(e) => setSettings({ ...settings, latePaymentRateNote: e.target.value })}
              disabled={!canManage}
            />
          </div>
          <div className="accounting-form-field full">
            <label>Mentions légales additionnelles (facture)</label>
            <textarea
              className="portal-input"
              rows="3"
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
                    <span className={`accounting-badge ${fy.status === 'OUVERT' ? 'draft' : 'locked'}`}>
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
    </AccountingLayout>
  )
}
