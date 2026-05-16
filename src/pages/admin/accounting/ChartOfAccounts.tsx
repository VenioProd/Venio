import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import AccountingLayout from './AccountingLayout'
import {
  listAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
} from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { AccountType, IChartOfAccount } from '../../../types/accounting'

const TYPES: AccountType[] = ['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT', 'CAPITAUX', 'SPECIAL']

interface AccountForm {
  code: string
  label: string
  accountClass: number
  type: AccountType
  isLettrable: boolean
  description: string
}

const EMPTY_FORM: AccountForm = {
  code: '',
  label: '',
  accountClass: 6,
  type: 'CHARGE',
  isLettrable: false,
  description: '',
}

const ChartOfAccounts = () => {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)

  const [accounts, setAccounts] = useState<IChartOfAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const data = await listAccounts({
        search: search || undefined,
        accountClass: classFilter || undefined,
        type: typeFilter || undefined,
        active: showInactive ? undefined : true,
      })
      setAccounts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classFilter, typeFilter, showInactive])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        await updateAccount(editId, form)
      } else {
        await createAccount(form)
      }
      setForm(EMPTY_FORM)
      setEditId(null)
      setShowForm(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  function startEdit(account: IChartOfAccount) {
    setEditId(account._id)
    setForm({
      code: account.code,
      label: account.label,
      accountClass: account.accountClass,
      type: account.type,
      isLettrable: account.isLettrable,
      description: account.description || '',
    })
    setShowForm(true)
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Désactiver ce compte ? (soft delete — réversible)')) return
    try {
      await deactivateAccount(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  return (
    <AccountingLayout
      title="Plan comptable"
      subtitle="Comptes du PCG utilisés par votre comptabilité"
      actions={
        canManage && (
          <button
            className="portal-button"
            onClick={() => {
              setForm(EMPTY_FORM)
              setEditId(null)
              setShowForm(!showForm)
            }}
          >
            {showForm ? 'Fermer' : '✚ Nouveau compte'}
          </button>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {showForm && canManage && (
        <form className="accounting-card" onSubmit={handleSubmit}>
          <h2>{editId ? 'Modifier le compte' : 'Nouveau compte'}</h2>
          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Code</label>
              <input
                className="portal-input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="411000"
                required
                disabled={Boolean(editId)}
              />
            </div>
            <div className="accounting-form-field" style={{ gridColumn: 'span 2' }}>
              <label>Libellé</label>
              <input
                className="portal-input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>
            <div className="accounting-form-field">
              <label>Classe</label>
              <select
                className="portal-input"
                value={form.accountClass}
                onChange={(e) => setForm({ ...form, accountClass: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
                  <option key={c} value={c}>
                    Classe {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="accounting-form-field">
              <label>Type</label>
              <select
                className="portal-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="accounting-form-field">
              <label>
                <input
                  type="checkbox"
                  checked={form.isLettrable}
                  onChange={(e) => setForm({ ...form, isLettrable: e.target.checked })}
                />{' '}
                Lettrable
              </label>
            </div>
            <div className="accounting-form-field full">
              <label>Description (optionnel)</label>
              <input
                className="portal-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="accounting-toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="portal-button secondary"
              onClick={() => {
                setShowForm(false)
                setEditId(null)
                setForm(EMPTY_FORM)
              }}
            >
              Annuler
            </button>
            <button type="submit" className="portal-button">
              {editId ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <input
            className="portal-input"
            placeholder="Rechercher un code ou libellé…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') reload()
            }}
            style={{ minWidth: 220 }}
          />
          <select
            className="portal-input"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="">Toutes les classes</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <option key={c} value={c}>
                Classe {c}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">Tous types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />{' '}
            Inclure inactifs
          </label>
          <button className="portal-button secondary" onClick={() => reload()}>
            Rechercher
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : accounts.length === 0 ? (
          <div className="accounting-empty">
            Aucun compte trouvé.
            <div className="hint">Allez dans Paramètres → "Initialiser PCG" pour démarrer.</div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Classe</th>
                <th>Type</th>
                <th>Lettrable</th>
                <th>Statut</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a._id}>
                  <td className="code">{a.code}</td>
                  <td>{a.label}</td>
                  <td>{a.accountClass}</td>
                  <td>{a.type}</td>
                  <td>{a.isLettrable ? 'Oui' : '—'}</td>
                  <td>
                    <span className={`accounting-badge ${a.isActive ? 'validated' : 'locked'}`}>
                      {a.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="accounting-row-actions">
                        <button onClick={() => startEdit(a)}>Modifier</button>
                        {a.isActive && (
                          <button className="danger" onClick={() => handleDeactivate(a._id)}>
                            Désactiver
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AccountingLayout>
  )
}

export default ChartOfAccounts
