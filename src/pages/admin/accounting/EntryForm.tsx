import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { listJournals, listAccounts, createEntry } from '../../../services/accounting'
import type { IChartOfAccount, IJournal } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatMoney } from '../../../i18n/format'

interface LineInput {
  account: string
  label: string
  debit: string
  credit: string
}

interface EntryFormState {
  journal: string
  date: string
  label: string
  pieceRef: string
  notes: string
  lines: LineInput[]
}

function emptyLine(): LineInput {
  return { account: '', label: '', debit: '', credit: '' }
}

const EntryForm = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [journals, setJournals] = useState<IJournal[]>([])
  const [accounts, setAccounts] = useState<IChartOfAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const todayISO = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState<EntryFormState>({
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
      .catch((err: Error) => setError(err.message))
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

  function updateLine(idx: number, patch: Partial<LineInput>) {
    const newLines = form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    setForm({ ...form, lines: newLines })
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, emptyLine()] })
  }

  function removeLine(idx: number) {
    if (form.lines.length <= 2) return
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) })
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>, validate = false) {
    e.preventDefault()
    setError('')
    if (!totals.balanced) {
      setError(t('accAccounts.entryForm.unbalanced'))
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
        status: (validate ? 'VALIDATED' : 'DRAFT') as 'DRAFT' | 'VALIDATED',
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
      setError(err instanceof Error ? err.message : translate('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AccountingLayout title={t('accAccounts.entryForm.title')}>
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
      </AccountingLayout>
    )
  }

  return (
    <AccountingLayout title={t('accAccounts.entryForm.title')} subtitle={t('accAccounts.entryForm.subtitle')}>
      {error && <div className="accounting-message error">{error}</div>}

      <form className="accounting-card" onSubmit={(e) => handleSubmit(e, false)}>
        <h2>{t('accAccounts.entryForm.header')}</h2>
        <div className="accounting-form">
          <div className="accounting-form-field">
            <label>{t('accAccounts.col.journal')}</label>
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
            <label>{t('accAccounts.col.date')}</label>
            <input
              type="date"
              className="portal-input"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </div>
          <div className="accounting-form-field">
            <label>{t('accAccounts.entryForm.pieceRef')}</label>
            <input
              className="portal-input"
              value={form.pieceRef}
              onChange={(e) => setForm({ ...form, pieceRef: e.target.value })}
              placeholder="FAC-2026-001"
            />
          </div>
          <div className="accounting-form-field full">
            <label>{t('accAccounts.col.label')}</label>
            <input
              className="portal-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </div>
        </div>

        <h2 style={{ marginTop: 24 }}>{t('accAccounts.entry.lines')}</h2>
        <table className="accounting-lines-table">
          <thead>
            <tr>
              <th style={{ width: 200 }}>{t('accAccounts.col.account')}</th>
              <th>{t('accAccounts.entryForm.lineLabel')}</th>
              <th style={{ width: 140 }}>{t('accAccounts.col.debit')}</th>
              <th style={{ width: 140 }}>{t('accAccounts.col.credit')}</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {form.lines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <select value={line.account} onChange={(e) => updateLine(idx, { account: e.target.value })} required>
                    <option value="">{t('accAccounts.entryForm.accountPlaceholder')}</option>
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
                      updateLine(idx, {
                        debit: e.target.value,
                        credit: e.target.value ? '' : line.credit,
                      })
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
                      updateLine(idx, {
                        credit: e.target.value,
                        debit: e.target.value ? '' : line.debit,
                      })
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
                      title={t('accAccounts.entryForm.removeLine')}
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
            {t('accAccounts.entryForm.addLine')}
          </button>
        </div>

        <div className={`accounting-totals ${totals.balanced ? 'balanced' : 'unbalanced'}`}>
          <div>
            <span className="label">{t('accAccounts.entryForm.totalDebit')}</span>{' '}
            <span className="value">{formatMoney(totals.debit)}</span>
          </div>
          <div>
            <span className="label">{t('accAccounts.entryForm.totalCredit')}</span>{' '}
            <span className="value">{formatMoney(totals.credit)}</span>
          </div>
          <div>
            <span className="label">{t('accAccounts.entryForm.balance')}</span>{' '}
            <span className="value">{formatMoney(totals.debit - totals.credit)}</span>
          </div>
        </div>

        <div className="accounting-form-field full" style={{ marginTop: 16 }}>
          <label>{t('accAccounts.entryForm.internalNotes')}</label>
          <textarea
            className="portal-input"
            rows={2}
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
            {t('common.cancel')}
          </button>
          <button type="submit" className="portal-button secondary" disabled={saving}>
            {t('accAccounts.entryForm.saveDraft')}
          </button>
          <button
            type="button"
            className="portal-button"
            disabled={saving || !totals.balanced}
            onClick={(e) => handleSubmit(e, true)}
          >
            {t('accAccounts.entryForm.saveAndValidate')}
          </button>
        </div>
      </form>
    </AccountingLayout>
  )
}

export default EntryForm
