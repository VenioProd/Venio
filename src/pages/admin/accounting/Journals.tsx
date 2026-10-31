import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import AccountingLayout from './AccountingLayout'
import { listJournals, createJournal, updateJournal } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { IJournal, JournalType } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'

const TYPES: { value: JournalType; labelKey: MessageKey }[] = [
  { value: 'VENTE', labelKey: 'accAccounts.journalOption.VENTE' },
  { value: 'ACHAT', labelKey: 'accAccounts.journalOption.ACHAT' },
  { value: 'BANQUE', labelKey: 'accAccounts.journalOption.BANQUE' },
  { value: 'CAISSE', labelKey: 'accAccounts.journalOption.CAISSE' },
  { value: 'OD', labelKey: 'accAccounts.journalOption.OD' },
  { value: 'AN', labelKey: 'accAccounts.journalOption.AN' },
]

const TYPE_LABEL_KEYS: Record<JournalType, MessageKey> = {
  VENTE: 'accAccounts.journalType.VENTE',
  ACHAT: 'accAccounts.journalType.ACHAT',
  BANQUE: 'accAccounts.journalType.BANQUE',
  CAISSE: 'accAccounts.journalType.CAISSE',
  OD: 'accAccounts.journalType.OD',
  AN: 'accAccounts.journalType.AN',
}

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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : translate('common.error'))
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
      setError(err instanceof Error ? err.message : translate('common.error'))
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
      title={t('accAccounts.nav.journals')}
      subtitle={t('accAccounts.journals.subtitle')}
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
            {showForm ? t('common.close') : t('accAccounts.journals.newJournal')}
          </button>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {showForm && canManage && (
        <form className="accounting-card" onSubmit={handleSubmit}>
          <h2>{editId ? t('accAccounts.journals.editTitle') : t('accAccounts.journals.newTitle')}</h2>
          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accAccounts.col.code')}</label>
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
              <label>{t('accAccounts.col.label')}</label>
              <input
                className="portal-input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accAccounts.accounts.type')}</label>
              <select
                className="portal-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as JournalType })}
              >
                {TYPES.map((ty) => (
                  <option key={ty.value} value={ty.value}>
                    {t(ty.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="accounting-form-field">
              <label>{t('accAccounts.journals.counterAccountLabel')}</label>
              <input
                className="portal-input"
                value={form.counterAccount}
                onChange={(e) => setForm({ ...form, counterAccount: e.target.value })}
                placeholder="512000"
              />
            </div>
            <div className="accounting-form-field full">
              <label>{t('accAccounts.col.description')}</label>
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
              {t('common.cancel')}
            </button>
            <button type="submit" className="portal-button">
              {editId ? t('common.save') : t('accAccounts.accounts.create')}
            </button>
          </div>
        </form>
      )}

      <section className="accounting-card">
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
        ) : journals.length === 0 ? (
          <div className="accounting-empty">
            {t('accAccounts.journals.empty')}
            <div className="hint">{t('accAccounts.journals.emptyHint')}</div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('accAccounts.col.code')}</th>
                <th>{t('accAccounts.col.label')}</th>
                <th>{t('accAccounts.accounts.type')}</th>
                <th>{t('accAccounts.journals.counterAccount')}</th>
                <th>{t('accAccounts.col.status')}</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {journals.map((j) => (
                <tr key={j._id}>
                  <td className="code">{j.code}</td>
                  <td>{j.label}</td>
                  <td>{TYPE_LABEL_KEYS[j.type] ? t(TYPE_LABEL_KEYS[j.type]) : j.type}</td>
                  <td className="code">{j.counterAccount || '—'}</td>
                  <td>
                    <span className={`accounting-badge ${j.isActive ? 'validated' : 'locked'}`}>
                      {j.isActive ? t('accAccounts.accounts.active') : t('accAccounts.accounts.inactive')}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="accounting-row-actions">
                        <button onClick={() => startEdit(j)}>{t('common.edit')}</button>
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
