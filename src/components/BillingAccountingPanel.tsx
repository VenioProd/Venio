import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { hasPermission, PERMISSIONS } from '../lib/permissions'
import { useAuth } from '../context/AuthContext'
import type { IAccountingEntry } from '../types/accounting'

/**
 * Panneau d'écritures comptables liées à un BillingDocument (facture).
 * - Affiche les écritures VE (vente) et BQ (paiement) générées automatiquement
 * - Bouton "Générer comptabilité" pour forcer la création/regénération (idempotent)
 * - Lien vers la fiche écriture du module Comptabilité
 *
 * Affiché uniquement pour les BillingDocument de type INVOICE.
 */

interface BillingDocument {
  _id: string
  type?: string
}

interface BillingAccountingPanelProps {
  billingDoc: BillingDocument | null | undefined
  compact?: boolean
}

const BillingAccountingPanel = ({ billingDoc, compact = false }: BillingAccountingPanelProps) => {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<IAccountingEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const canViewAccounting = hasPermission(user, PERMISSIONS.VIEW_ACCOUNTING)
  const canManageBilling = hasPermission(user, PERMISSIONS.MANAGE_BILLING)

  if (billingDoc?.type !== 'INVOICE') return null
  if (!canViewAccounting) return null

  async function load() {
    if (!billingDoc?._id) return
    setLoading(true)
    setError('')
    try {
      const r = await apiFetch<{ entries: IAccountingEntry[] }>(
        `/api/admin/billing/${billingDoc._id}/accounting-entries`
      )
      setEntries(r.entries || [])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function toggle() {
    if (!open) await load()
    setOpen(!open)
  }

  async function generate() {
    if (!billingDoc?._id) return
    if (!confirm('Générer (ou régénérer) les écritures comptables pour cette facture ?')) return
    setGenerating(true)
    setError('')
    try {
      await apiFetch(`/api/admin/billing/${billingDoc._id}/generate-accounting`, {
        method: 'POST',
      })
      await load()
      setOpen(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      setError(msg)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 8,
        padding: compact ? '8px 0' : '10px 12px',
        borderTop: '1px dashed rgba(14, 165, 233, 0.18)',
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={toggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(34, 211, 238, 0.85)',
            cursor: 'pointer',
            fontSize: '13px',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {open ? '▾' : '▸'} Écritures comptables
        </button>
        {canManageBilling && (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="portal-button secondary"
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            {generating ? '…' : 'Générer / régénérer'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ color: '#fca5a5', fontSize: '12px', marginTop: 6 }}>{error}</div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>
              Chargement…
            </p>
          ) : entries.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0 }}>
              Aucune écriture comptable pour cette facture. Cliquez sur "Générer".
            </p>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
                marginTop: 4,
              }}
            >
              <thead>
                <tr style={{ color: 'rgba(255,255,255,0.55)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Numéro</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Journal</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: '4px 6px' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id}>
                    <td style={{ padding: '4px 6px' }}>
                      <Link
                        to={`/admin/comptabilite/ecritures/${e._id}`}
                        style={{ color: '#7dd3fc', fontFamily: 'SF Mono, Menlo, monospace' }}
                      >
                        {e.entryNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '4px 6px', color: 'rgba(255,255,255,0.7)' }}>
                      {new Date(e.date).toLocaleDateString('fr-FR')}
                    </td>
                    <td
                      style={{
                        padding: '4px 6px',
                        color: 'rgba(34, 211, 238, 0.9)',
                        fontFamily: 'SF Mono, Menlo, monospace',
                      }}
                    >
                      {e.journalCode}
                    </td>
                    <td
                      style={{
                        padding: '4px 6px',
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {Number(e.totalDebit).toFixed(2)} €
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '999px',
                          color: e.status === 'VALIDATED' ? '#4ade80' : '#fbbf24',
                          background:
                            e.status === 'VALIDATED'
                              ? 'rgba(74,222,128,0.1)'
                              : 'rgba(251,191,36,0.1)',
                          border:
                            '1px solid ' +
                            (e.status === 'VALIDATED'
                              ? 'rgba(74,222,128,0.4)'
                              : 'rgba(251,191,36,0.4)'),
                        }}
                      >
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default BillingAccountingPanel
