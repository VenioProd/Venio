import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listAuditLog } from '../../../services/accounting'
import type { IAuditEntry } from '../../../types/accounting'

function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('fr-FR')
  } catch {
    return String(d)
  }
}

const ACTION_LABELS: Record<string, string> = {
  ENTRY_CREATE: 'Création écriture',
  ENTRY_UPDATE: 'Modification écriture',
  ENTRY_VALIDATE: 'Validation écriture',
  ENTRY_LOCK: 'Verrouillage écriture',
  ENTRY_DELETE: 'Suppression écriture',
  ENTRY_RESTORE: 'Restauration écriture',
  FISCAL_YEAR_CLOSE: 'Clôture exercice',
  FISCAL_YEAR_REOPEN: 'Réouverture exercice',
  EXTERNAL_SOURCE_CREATE: 'Création source externe',
  EXTERNAL_SOURCE_UPDATE: 'Modification source externe',
  EXTERNAL_SOURCE_DELETE: 'Suppression source externe',
  EXTERNAL_SOURCE_ROTATE: 'Rotation clé source externe',
  VAT_DECLARATION_CREATE: 'Création déclaration TVA',
  VAT_DECLARATION_SUBMIT: 'Soumission déclaration TVA',
  VAT_DECLARATION_DELETE: 'Suppression déclaration TVA',
  FEC_EXPORT: 'Export FEC',
  LETTRAGE_APPLY: 'Application lettrage',
  LETTRAGE_REMOVE: 'Suppression lettrage',
  CHART_OF_ACCOUNTS_SEED: 'Initialisation plan comptable',
  CHART_OF_ACCOUNTS_DEACTIVATE: 'Désactivation compte',
  BILLING_TO_ENTRY: 'Génération écriture vente (facturation)',
  PAYMENT_TO_ENTRY: 'Génération écriture paiement (facturation)',
}

const ACTOR_LABELS: Record<string, string> = {
  USER: 'Utilisateur',
  SYSTEM: 'Système',
  EXTERNAL: 'Source externe',
}

function actionBadgeClass(action: string): string {
  if (action.includes('DELETE') || action.includes('REMOVE')) return 'draft'
  if (action.includes('LOCK')) return 'locked'
  if (action.includes('CREATE')) return 'validated'
  return 'source-external'
}

function entityLink(entry: IAuditEntry): string | null {
  if (!entry.entityId) return null
  if (entry.entityType === 'AccountingEntry') return `/admin/comptabilite/ecritures/${entry.entityId}`
  if (entry.entityType === 'ExternalSource') return `/admin/comptabilite/sources-externes/${entry.entityId}`
  if (entry.entityType === 'VatDeclaration') return `/admin/comptabilite/tva/${entry.entityId}`
  return null
}

interface AuditFilters {
  action: string
  entityType: string
  from: string
  to: string
  page: number
  limit: number
}

const AccountingAuditLog = () => {
  const [items, setItems] = useState<IAuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<AuditFilters>({
    action: '',
    entityType: '',
    from: '',
    to: '',
    page: 1,
    limit: 50,
  })

  const [selected, setSelected] = useState<IAuditEntry | null>(null)

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const r = await listAuditLog(filters)
      setItems(r.items || r.logs || [])
      setTotal(r.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.action, filters.entityType, filters.page])

  const totalPages = Math.max(1, Math.ceil(total / filters.limit))

  return (
    <AccountingLayout
      title="Journal d'audit"
      subtitle="Historique de toutes les opérations comptables sensibles (10 ans de conservation)"
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
          >
            <option value="">Toutes actions</option>
            {Object.keys(ACTION_LABELS).map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value, page: 1 })}
          >
            <option value="">Tous types d'entité</option>
            <option value="AccountingEntry">Écriture</option>
            <option value="FiscalYear">Exercice</option>
            <option value="ExternalSource">Source externe</option>
            <option value="VatDeclaration">Déclaration TVA</option>
            <option value="ChartOfAccount">Compte</option>
            <option value="AccountingLine">Lettrage</option>
            <option value="BillingDocument">Facturation</option>
          </select>
          <input
            type="date"
            className="portal-input"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
          <input
            type="date"
            className="portal-input"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
          <button className="portal-button secondary" onClick={() => reload()}>
            Filtrer
          </button>
          <div className="accounting-toolbar-right">
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>
              {total} événement{total > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : items.length === 0 ? (
          <div className="accounting-empty">Aucun événement d'audit pour ces filtres.</div>
        ) : (
          <>
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Entité</th>
                  <th>Référence</th>
                  <th>Acteur</th>
                  <th>Résumé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e._id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.7)' }}>
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td>
                      <span className={`accounting-badge ${actionBadgeClass(e.action)}`}>
                        {ACTION_LABELS[e.action] || e.action}
                      </span>
                    </td>
                    <td style={{ color: 'rgba(14, 165, 233, 0.85)', fontSize: '0.85rem' }}>{e.entityType}</td>
                    <td>
                      {(() => {
                        const link = entityLink(e)
                        const label = e.entityRef || e.entityId || '—'
                        return link ? (
                          <Link to={link} className="code" style={{ color: 'var(--primary)' }}>
                            {label}
                          </Link>
                        ) : (
                          <span className="code">{label}</span>
                        )
                      })()}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                          {e.actor?.type ? ACTOR_LABELS[e.actor.type] || e.actor.type : '—'}
                        </span>
                        {e.actor?.userEmail && (
                          <div style={{ color: 'rgba(255,255,255,0.85)' }}>{e.actor.userEmail}</div>
                        )}
                        {e.actor?.externalSourceSlug && (
                          <div className="code" style={{ color: '#c084fc' }}>
                            {e.actor.externalSourceSlug}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{e.summary || '—'}</td>
                    <td>
                      <div className="accounting-row-actions">
                        <button onClick={() => setSelected(e)}>Détail</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="accounting-pagination">
                <button
                  className="portal-button secondary"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                >
                  ← Précédent
                </button>
                <span style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.6)' }}>
                  Page {filters.page} / {totalPages}
                </span>
                <button
                  className="portal-button secondary"
                  disabled={filters.page >= totalPages}
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                >
                  Suivant →
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="accounting-card"
            style={{ maxWidth: 800, width: '100%', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{ACTION_LABELS[selected.action] || selected.action}</h2>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem' }}>
                {formatDateTime(selected.createdAt)} — {selected.entityType}
                {selected.entityRef && ` (${selected.entityRef})`}
              </span>
            </div>

            {selected.summary && <p style={{ color: 'rgba(255,255,255,0.85)' }}>{selected.summary}</p>}

            {selected.diff && selected.diff.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.9rem', marginTop: 16 }}>Champs modifiés</h3>
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>Champ</th>
                      <th>Avant</th>
                      <th>Après</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.diff.map((d, idx) => (
                      <tr key={idx}>
                        <td className="code">{d.field}</td>
                        <td style={{ color: '#fca5a5' }}>{JSON.stringify(d.before)}</td>
                        <td style={{ color: '#86efac' }}>{JSON.stringify(d.after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {selected.metadata && (
              <>
                <h3 style={{ fontSize: '0.9rem', marginTop: 16 }}>Métadonnées</h3>
                <pre
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    overflow: 'auto',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </>
            )}

            <div className="accounting-toolbar" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="portal-button" onClick={() => setSelected(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountingLayout>
  )
}

export default AccountingAuditLog
