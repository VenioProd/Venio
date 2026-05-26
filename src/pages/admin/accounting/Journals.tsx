import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import AccountingLayout from './AccountingLayout'
import { listJournals, createJournal, updateJournal } from '@/services/accounting'
import { useAuth } from '@/context/AuthContext'
import { hasPermission, PERMISSIONS } from '@/lib/permissions'
import type { IJournal, JournalType } from '@/types/accounting'

const TYPES: { value: JournalType; label: string }[] = [
  { value: 'VENTE', label: 'Ventes' },
  { value: 'ACHAT', label: 'Achats' },
  { value: 'BANQUE', label: 'Banque' },
  { value: 'CAISSE', label: 'Caisse' },
  { value: 'OD', label: 'Opérations diverses' },
  { value: 'AN', label: 'À-nouveaux' },
]

interface JournalForm {
  code: string
  label: string
  type: JournalType
  counterAccount: string
  description: string
  isActive: boolean
}

const EMPTY: JournalForm = {
  code: '',
  label: '',
  type: 'OD',
  counterAccount: '',
  description: '',
  isActive: true,
}

const Journals = () => {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)

  const [journals, setJournals] = useState<IJournal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<JournalForm>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      setJournals(await listJournals())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    try {
      if (editId) {
        await updateJournal(editId, form)
      } else {
        await createJournal(form)
      }
      setForm(EMPTY)
      setEditId(null)
      setShowForm(false)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  function startEdit(j: IJournal) {
    setEditId(j._id)
    setForm({
      code: j.code,
      label: j.label,
      type: j.type,
      counterAccount: j.counterAccount || '',
      description: j.description || '',
      isActive: j.isActive,
    })
    setShowForm(true)
  }

  return (
    <AccountingLayout
      title="Journaux"
      subtitle="Journaux comptables (VE, AC, BQ, OD, AN…)"
      actions={
        canManage && (
          <button
            className="portal-button"
            onClick={() => {
              setForm(EMPTY)
              setEditId(null)
              setShowForm(!showForm)
            }}
          >
            {showForm ? 'Fermer' : '✚ Nouveau journal'}
          </button>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {showForm && canManage && (
        <form className="accounting-card" onSubmit={handleSubmit}>
          <h2>{editId ? 'Modifier le journal' : 'Nouveau journal'}</h2>
          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Code</label>
              <input
                className="portal-input"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="VE"
                required
                maxLength={5}
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
              <label>Type</label>
              <select
                className="portal-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as JournalType })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="accounting-form-field">
              <label>Compte de contrepartie (BQ/CA)</label>
              <input
                className="portal-input"
                value={form.counterAccount}
                onChange={(e) => setForm({ ...form, counterAccount: e.target.value })}
                placeholder="512000"
              />
            </div>
            <div className="accounting-form-field full">
              <label>Description</label>
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
                setForm(EMPTY)
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
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : journals.length === 0 ? (
          <div className="accounting-empty">
            Aucun journal défini.
            <div className="hint">Allez dans Paramètres pour initialiser les journaux par défaut.</div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Type</th>
                <th>Contrepartie</th>
                <th>Statut</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {journals.map((j) => (
                <tr key={j._id}>
                  <td className="code">{j.code}</td>
                  <td>{j.label}</td>
                  <td>{j.type}</td>
                  <td className="code">{j.counterAccount || '—'}</td>
                  <td>
                    <span className={`accounting-badge ${j.isActive ? 'validated' : 'locked'}`}>
                      {j.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="accounting-row-actions">
                        <button onClick={() => startEdit(j)}>Modifier</button>
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

export default Journals
