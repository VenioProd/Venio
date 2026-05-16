import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import {
  getEntry,
  validateEntry,
  deleteEntry,
  listAuditLogForEntity,
} from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type {
  IAccountingEntry,
  IAccountingLine,
  IAuditEntry,
} from '../../../types/accounting'

const EntryDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)

  const [entry, setEntry] = useState<IAccountingEntry | null>(null)
  const [lines, setLines] = useState<IAccountingLine[]>([])
  const [auditEvents, setAuditEvents] = useState<IAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function reload() {
    if (!id) return
    setLoading(true)
    try {
      const r = await getEntry(id)
      setEntry(r.entry)
      setLines(r.lines || [])
      try {
        const auditR = await listAuditLogForEntity('AccountingEntry', id)
        setAuditEvents(auditR.items || auditR.logs || [])
      } catch {
        setAuditEvents([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleValidate() {
    if (!id) return
    if (!confirm('Valider cette écriture ? Elle deviendra non modifiable.')) return
    try {
      await validateEntry(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Supprimer ce brouillon ?')) return
    try {
      await deleteEntry(id)
      navigate('/admin/comptabilite/ecritures')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  if (loading || !entry) {
    return (
      <AccountingLayout title="Écriture">
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      </AccountingLayout>
    )
  }

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0)

  return (
    <AccountingLayout
      title={entry.entryNumber}
      subtitle={`${entry.label} — ${new Date(entry.date).toLocaleDateString('fr-FR')}`}
      actions={
        <>
          <Link to="/admin/comptabilite/ecritures" className="portal-button secondary">
            ← Liste
          </Link>
          {entry.status === 'DRAFT' && canManage && (
            <>
              <button className="portal-button" onClick={handleValidate}>
                Valider
              </button>
              <button
                className="portal-button secondary"
                onClick={handleDelete}
                style={{ borderColor: 'rgba(248,113,113,0.4)' }}
              >
                Supprimer brouillon
              </button>
            </>
          )}
        </>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <h2>Détails</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>Numéro</label>
            <div className="code" style={{ fontSize: '1rem' }}>
              {entry.entryNumber}
            </div>
          </div>
          <div className="accounting-form-field">
            <label>Journal</label>
            <div className="code">{entry.journalCode}</div>
          </div>
          <div className="accounting-form-field">
            <label>Date</label>
            <div>{new Date(entry.date).toLocaleDateString('fr-FR')}</div>
          </div>
          <div className="accounting-form-field">
            <label>Statut</label>
            <div>
              <span className={`accounting-badge ${entry.status.toLowerCase()}`}>
                {entry.status}
              </span>
            </div>
          </div>
          <div className="accounting-form-field">
            <label>Source</label>
            <div>
              <span
                className={`accounting-badge ${
                  entry.source === 'EXTERNAL' ? 'source-external' : 'locked'
                }`}
              >
                {entry.source}
              </span>
            </div>
          </div>
          <div className="accounting-form-field">
            <label>Pièce</label>
            <div className="code">{entry.pieceRef || '—'}</div>
          </div>
          <div className="accounting-form-field full">
            <label>Libellé</label>
            <div>{entry.label}</div>
          </div>
          {entry.notes && (
            <div className="accounting-form-field full">
              <label>Notes</label>
              <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.7)' }}>
                {entry.notes}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="accounting-card">
        <h2>Lignes</h2>
        <table className="accounting-table">
          <thead>
            <tr>
              <th>Compte</th>
              <th>Libellé</th>
              <th className="amount">Débit</th>
              <th className="amount">Crédit</th>
              <th>Lettrage</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l._id}>
                <td>
                  <span className="code">{l.accountCode}</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>— {l.accountLabel}</span>
                </td>
                <td>{l.label}</td>
                <td className="amount">{Number(l.debit).toFixed(2)} €</td>
                <td className="amount">{Number(l.credit).toFixed(2)} €</td>
                <td className="code">{l.lettrage || '—'}</td>
              </tr>
            ))}
            <tr>
              <td
                colSpan={2}
                style={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  fontSize: '0.78rem',
                  letterSpacing: '0.5px',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                Totaux
              </td>
              <td className="amount" style={{ fontWeight: 700 }}>
                {totalDebit.toFixed(2)} €
              </td>
              <td className="amount" style={{ fontWeight: 700 }}>
                {totalCredit.toFixed(2)} €
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </section>

      {auditEvents.length > 0 && (
        <section className="accounting-card">
          <h2>Historique d'audit</h2>
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Acteur</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((ev) => (
                <tr key={ev._id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.7)' }}>
                    {new Date(ev.createdAt).toLocaleString('fr-FR')}
                  </td>
                  <td>
                    <span className="accounting-badge source-external">{ev.action}</span>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {ev.actor?.userEmail || ev.actor?.externalSourceSlug || ev.actor?.type || '—'}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{ev.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </AccountingLayout>
  )
}

export default EntryDetail
