import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import AccountingLayout from './AccountingLayout'
import { listAccounts, createAccount, updateAccount, deactivateAccount } from '../../../services/accounting'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import type { AccountType, IChartOfAccount } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import type { MessageKey } from '../../../i18n'

const TYPES: AccountType[] = ['ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT', 'CAPITAUX', 'SPECIAL']

const TYPE_LABEL_KEYS: Record<AccountType, MessageKey> = {
  ACTIF: 'accAccounts.accountType.ACTIF',
  PASSIF: 'accAccounts.accountType.PASSIF',
  CHARGE: 'accAccounts.accountType.CHARGE',
  PRODUIT: 'accAccounts.accountType.PRODUIT',
  CAPITAUX: 'accAccounts.accountType.CAPITAUX',
  SPECIAL: 'accAccounts.accountType.SPECIAL',
}

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
  const { t } = useI18n()
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
      setError(err instanceof Error ? err.message : translate('common.error'))
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
      setError(err instanceof Error ? err.message : translate('common.error'))
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
    if (!confirm(t('accAccounts.accounts.deactivateConfirm'))) return
    try {
      await deactivateAccount(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  return (
    <AccountingLayout
      title={t('accAccounts.nav.chartOfAccounts')}
      subtitle={t('accAccounts.accounts.subtitle')}
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
            {showForm ? t('common.close') : t('accAccounts.accounts.newAccount')}
          </button>
        )
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      {showForm && canManage && (
        <form className="accounting-card" onSubmit={handleSubmit}>
          <h2>{editId ? t('accAccounts.accounts.editTitle') : t('accAccounts.accounts.newTitle')}</h2>
          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accAccounts.col.code')}</label>
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
              <label>{t('accAccounts.col.label')}</label>
              <input
                className="portal-input"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                required
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accAccounts.accounts.class')}</label>
              <select
                className="portal-input"
                value={form.accountClass}
                onChange={(e) => setForm({ ...form, accountClass: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
                  <option key={c} value={c}>
                    {t('accAccounts.accounts.classN', { n: c })}
                  </option>
                ))}
              </select>
            </div>
            <div className="accounting-form-field">
              <label>{t('accAccounts.accounts.type')}</label>
              <select
                className="portal-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(TYPE_LABEL_KEYS[ty])}
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
                {t('accAccounts.accounts.reconcilable')}
              </label>
            </div>
            <div className="accounting-form-field full">
              <label>{t('accAccounts.accounts.descriptionOptional')}</label>
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
              {t('common.cancel')}
            </button>
            <button type="submit" className="portal-button">
              {editId ? t('common.save') : t('accAccounts.accounts.create')}
            </button>
          </div>
        </form>
      )}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <input
            className="portal-input"
            placeholder={t('accAccounts.accounts.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') reload()
            }}
            style={{ minWidth: 220 }}
          />
          <select className="portal-input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">{t('accAccounts.accounts.allClasses')}</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <option key={c} value={c}>
                {t('accAccounts.accounts.classN', { n: c })}
              </option>
            ))}
          </select>
          <select className="portal-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t('accAccounts.accounts.allTypes')}</option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(TYPE_LABEL_KEYS[ty])}
              </option>
            ))}
          </select>
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{' '}
            {t('accAccounts.accounts.includeInactive')}
          </label>
          <button className="portal-button secondary" onClick={() => reload()}>
            {t('common.search')}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('accAccounts.common.loading')}</p>
        ) : accounts.length === 0 ? (
          <div className="accounting-empty">
            {t('accAccounts.accounts.empty')}
            <div className="hint">{t('accAccounts.accounts.emptyHint')}</div>
          </div>
        ) : (
          <div className="accounting-table-scroll">
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>{t('accAccounts.col.code')}</th>
                  <th>{t('accAccounts.col.label')}</th>
                  <th>{t('accAccounts.accounts.class')}</th>
                  <th>{t('accAccounts.accounts.type')}</th>
                  <th>{t('accAccounts.accounts.reconcilable')}</th>
                  <th>{t('accAccounts.col.status')}</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a._id}>
                    <td className="code">{a.code}</td>
                    <td>{a.label}</td>
                    <td>{a.accountClass}</td>
                    <td>{TYPE_LABEL_KEYS[a.type] ? t(TYPE_LABEL_KEYS[a.type]) : a.type}</td>
                    <td>{a.isLettrable ? t('common.yes') : '—'}</td>
                    <td>
                      <span className={`accounting-badge ${a.isActive ? 'validated' : 'locked'}`}>
                        {a.isActive ? t('accAccounts.accounts.active') : t('accAccounts.accounts.inactive')}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="accounting-row-actions">
                          <button onClick={() => startEdit(a)}>{t('common.edit')}</button>
                          {a.isActive && (
                            <button className="danger" onClick={() => handleDeactivate(a._id)}>
                              {t('accAccounts.accounts.deactivate')}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AccountingLayout>
  )
}

export default ChartOfAccounts
