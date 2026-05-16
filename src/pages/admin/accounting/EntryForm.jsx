import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import {
  listJournals,
  listAccounts,
  createEntry,
} from '../../../services/accounting'

function emptyLine() {
  return { account: '', label: '', debit: '', credit: '' }
}

export default function EntryForm() {
  const navigate = useNavigate()
  const [journals, setJournals] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const todayISO = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    journal: 'OD',
    date: todayISO,
    label: '',
    pieceRef: '',
    notes: '',
    lines: [emptyLine(), emptyLine()],
  })

  useEffect(() => {
    Promise.all([listJournals(), listAccounts({ active: true })])
      .then(([j, a]) => {
        setJournals(j)
        setAccounts(a)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const totals = useMemo(() => {
    let debit = 0
    let credit = 0
    for (const line of form.lines) {
      debit += Number(line.debit) || 0
      credit += Number(line.credit) || 0
    }
    debit = Math.round(debit * 100) / 100
    credit = Math.round(credit * 100) / 100
    return { debit, credit, balanced: Math.abs(debit - credit) < 0.005 && debit > 0 }
  }, [form.lines])

  function updateLine(idx, patch) {
    const newLines = form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    setForm({ ...form, lines: newLines })
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, emptyLine()] })
  }

  function removeLine(idx) {
    if (form.lines.length <= 2) return
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) })
  }

  async function handleSubmit(e, validate = false) {
    e.preventDefault()
    setError('')
    if (!totals.balanced) {
      setError('L’écriture doit être équilibrée (débit = crédit) et non nulle.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        journal: form.journal,
        date: form.date,
        label: form.label,
        pieceRef: form.pieceRef,
        notes: form.notes,
        status: validate ? 'VALIDATED' : 'DRAFT',
        lines: form.lines
          .filter((l) => (Number(l.debit) || 0) + (Number(l.credit) || 0) > 0)
          .map((l) => ({
            account: l.account,
            label: l.label,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
          })),
      }
      const r = await createEntry(payload)
      navigate(`/admin/comptabilite/ecritures/${r.entry._id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AccountingLayout title="Nouvelle écriture">
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      </AccountingLayout>
    )
  }

  return (
    <AccountingLayout title="Nouvelle écriture" subtitle="Saisie manuelle (double partie)">
      {error && <div className="accounting-message error">{error}</div>}

      <form className="accounting-card" onSubmit={(e) => handleSubmit(e, false)}>
        <h2>Entête</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>Journal</label>
            <select
              className="portal-input"
              value={form.journal}
              onChange={(e) => setForm({ ...form, journal: e.target.value })}
              required
            >
              {journals.map((j) => (
                <option key={j._id} value={j.code}>
                  {j.code} — {j.label}
                </option>
              ))}
            </select>
          </div>
          <div className="accounting-form-field">
            <label>Date</label>
            <input
              type="date"
              className="portal-input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="accounting-form-field">
            <label>Référence pièce</label>
            <input
              className="portal-input"
              value={form.pieceRef}
              onChange={(e) => setForm({ ...form, pieceRef: e.target.value })}
              placeholder="FAC-2026-001"
            />
          </div>
          <div className="accounting-form-field full">
            <label>Libellé</label>
            <input
              className="portal-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </div>
        </div>

        <h2 style={{ marginTop: 24 }}>Lignes</h2>
        <table className="accounting-lines-table">
          <thead>
            <tr>
              <th style={{ width: 200 }}>Compte</th>
              <th>Libellé ligne</th>
              <th style={{ width: 140 }}>Débit</th>
              <th style={{ width: 140 }}>Crédit</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {form.lines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <select
                    value={line.account}
                    onChange={(e) => updateLine(idx, { account: e.target.value })}
                    required
                  >
                    <option value="">— compte —</option>
                    {accounts.map((a) => (
                      <option key={a._id} value={a.code}>
                        {a.code} — {a.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={line.label}
                    onChange={(e) => updateLine(idx, { label: e.target.value })}
                    placeholder={form.label}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.debit}
                    onChange={(e) =>
                      updateLine(idx, { debit: e.target.value, credit: e.target.value ? '' : line.credit })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.credit}
                    onChange={(e) =>
                      updateLine(idx, { credit: e.target.value, debit: e.target.value ? '' : line.debit })
                    }
                  />
                </td>
                <td>
                  {form.lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(248,113,113,0.7)',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                      }}
                      title="Supprimer la ligne"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="accounting-toolbar" style={{ marginTop: 8 }}>
          <button type="button" className="portal-button secondary" onClick={addLine}>
            ✚ Ajouter une ligne
          </button>
        </div>

        <div className={`accounting-totals ${totals.balanced ? 'balanced' : 'unbalanced'}`}>
          <div>
            <span className="label">Total débit</span> <span className="value">{totals.debit.toFixed(2)} €</span>
          </div>
          <div>
            <span className="label">Total crédit</span>{' '}
            <span className="value">{totals.credit.toFixed(2)} €</span>
          </div>
          <div>
            <span className="label">Solde</span>{' '}
            <span className="value">{(totals.debit - totals.credit).toFixed(2)} €</span>
          </div>
        </div>

        <div className="accounting-form-field full" style={{ marginTop: 16 }}>
          <label>Notes (internes)</label>
          <textarea
            className="portal-input"
            rows="2"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <div className="accounting-toolbar" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="portal-button secondary"
            onClick={() => navigate('/admin/comptabilite/ecritures')}
          >
            Annuler
          </button>
          <button type="submit" className="portal-button secondary" disabled={saving}>
            Enregistrer brouillon
          </button>
          <button
            type="button"
            className="portal-button"
            disabled={saving || !totals.balanced}
            onClick={(e) => handleSubmit(e, true)}
          >
            Enregistrer & valider
          </button>
        </div>
      </form>
    </AccountingLayout>
  )
}
