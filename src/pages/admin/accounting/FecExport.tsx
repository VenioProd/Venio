import { useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import { downloadFec, listFiscalYears } from '../../../services/accounting'
import type { IFiscalYear } from '../../../types/accounting'

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR')
  } catch {
    return '—'
  }
}

const FEC_COLUMNS = [
  { code: 'JournalCode', label: 'Code journal (3 caractères)' },
  { code: 'JournalLib', label: 'Libellé du journal' },
  { code: 'EcritureNum', label: "Numéro d'écriture" },
  { code: 'EcritureDate', label: 'Date de comptabilisation (AAAAMMJJ)' },
  { code: 'CompteNum', label: 'Numéro de compte' },
  { code: 'CompteLib', label: 'Libellé du compte' },
  { code: 'CompAuxNum', label: 'Numéro de compte auxiliaire' },
  { code: 'CompAuxLib', label: 'Libellé du compte auxiliaire' },
  { code: 'PieceRef', label: 'Référence de la pièce justificative' },
  { code: 'PieceDate', label: 'Date de la pièce (AAAAMMJJ)' },
  { code: 'EcritureLib', label: "Libellé de l'écriture" },
  { code: 'Debit', label: 'Montant au débit' },
  { code: 'Credit', label: 'Montant au crédit' },
  { code: 'EcritureLet', label: 'Lettrage' },
  { code: 'DateLet', label: 'Date de lettrage (AAAAMMJJ)' },
  { code: 'ValidDate', label: 'Date de validation (AAAAMMJJ)' },
  { code: 'Montantdevise', label: 'Montant en devise' },
  { code: 'Idevise', label: 'Code de la devise' },
]

const FecExport = () => {
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedFy = useMemo(
    () => fiscalYears.find((fy) => fy._id === fiscalYear) || null,
    [fiscalYears, fiscalYear]
  )

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
      setSuccess('Téléchargement du FEC démarré.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const canDownload = !!(fiscalYear || (from && to))

  return (
    <AccountingLayout
      title="Export FEC (Fichier des Écritures Comptables)"
      subtitle="Génération du fichier conforme aux exigences DGFiP en cas de contrôle fiscal"
    >
      {error && <div className="accounting-message error">{error}</div>}
      {success && <div className="accounting-message success">{success}</div>}

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <div className="accounting-message info" style={{ margin: 0 }}>
          Le FEC est obligatoire selon l'article{' '}
          <strong>A.47 A-1 du Livre des procédures fiscales</strong> en cas de contrôle
          fiscal. Format pipe-séparé avec <strong>18 colonnes</strong>, conforme aux
          exigences DGFiP. Il inclut <strong>uniquement</strong> les écritures{' '}
          <span className="accounting-badge validated">VALIDATED</span> ou{' '}
          <span className="accounting-badge locked">LOCKED</span> — les brouillons sont
          automatiquement exclus.
        </div>
      </section>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Paramètres d'export</h2>

        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>Exercice fiscal</label>
            <select
              className="portal-input"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(e.target.value)}
            >
              <option value="">— Aucun (utiliser une période manuelle) —</option>
              {fiscalYears.map((fy) => (
                <option key={fy._id} value={fy._id}>
                  {fy.code || fy.label}
                  {fy.startDate && fy.endDate
                    ? ` (${formatDate(fy.startDate)} → ${formatDate(fy.endDate)})`
                    : ''}
                  {fy.status === 'CLOSED' ? ' — clos' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>Date début (custom)</label>
            <input
              type="date"
              className="portal-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="accounting-form-field">
            <label>Date fin (custom)</label>
            <input
              type="date"
              className="portal-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        {(effectiveFrom || effectiveTo) && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              fontSize: '0.9rem',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            <strong>Période effective :</strong> {formatDate(effectiveFrom)} →{' '}
            {formatDate(effectiveTo)}
            {!from && !to && selectedFy && (
              <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 6 }}>
                (déduite de l'exercice sélectionné)
              </span>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            className="portal-button"
            onClick={handleDownload}
            disabled={loading || !canDownload}
          >
            {loading ? 'Génération…' : '⬇ Télécharger le FEC'}
          </button>
          {!canDownload && (
            <span
              style={{
                marginLeft: 12,
                color: 'rgba(255,255,255,0.55)',
                fontSize: '0.85rem',
              }}
            >
              Sélectionnez un exercice ou définissez une période complète.
            </span>
          )}
        </div>
      </section>

      <section className="accounting-card" style={{ marginBottom: 16 }}>
        <div
          className="accounting-message"
          style={{
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: '#fcd34d',
            margin: 0,
          }}
        >
          <strong>⚠ Avant export :</strong> assurez-vous que toutes les écritures
          significatives de la période sont au statut <strong>VALIDATED</strong> ou{' '}
          <strong>LOCKED</strong>. Les brouillons sont automatiquement exclus du FEC ;
          un export incomplet pourrait être contesté par l'administration en cas de
          contrôle.
        </div>
      </section>

      <section className="accounting-card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>
          Aperçu — Structure du FEC (18 colonnes)
        </h2>
        <p
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.88rem',
            marginTop: 0,
          }}
        >
          Le fichier est un texte UTF-8 séparé par des barres verticales{' '}
          <span className="code">|</span>. Chaque ligne correspond à une ligne
          d'écriture (un débit ou un crédit) — pas à une écriture entière.
        </p>
        <table className="accounting-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Colonne</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {FEC_COLUMNS.map((c, i) => (
              <tr key={c.code}>
                <td className="code">{i + 1}</td>
                <td className="code">{c.code}</td>
                <td>{c.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AccountingLayout>
  )
}

export default FecExport
