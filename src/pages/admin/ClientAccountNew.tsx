import PageHeader from '../../components/admin/ui/PageHeader'
import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import type { ValidationSchema } from '../../hooks/useFormValidation'
import { CRM_SERVICE_TYPES } from '../../lib/formatUtils'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import { type MessageKey } from '../../i18n'
import { createAdminClient } from '../../services/adminClients'
import type { AdminUser } from '../../types/crm.types'
import type { Client } from '../../types/client.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'

type ClientFormField = 'companyName' | 'name' | 'email' | 'password'

const buildClientValidationSchema = (t: (key: MessageKey) => string): ValidationSchema<ClientFormField> => ({
  companyName: [{ type: 'required', message: t('adminAccess.clientNew.companyRequired') }],
  name: [{ type: 'required', message: t('adminAccess.clientNew.contactRequired') }],
  email: [
    { type: 'required', message: t('adminAccess.clientNew.emailRequired') },
    { type: 'email', message: t('adminAccess.clientNew.emailInvalid') },
  ],
  password: [
    { type: 'required', message: t('adminAccess.clientNew.passwordRequired') },
    { type: 'minLength', value: 6, message: t('adminAccess.clientNew.passwordMin') },
  ],
})

const SOURCE_OPTIONS = ['REFERRAL', 'INBOUND', 'OUTBOUND', 'PARTNER', 'AUTRE']

interface ClientForm {
  companyName: string
  serviceType: string
  name: string
  email: string
  password: string
  phone: string
  website: string
  source: string
  ownerAdminId: string
  tagsRaw: string
}

const ClientAccountNew = () => {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useI18n()
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<ClientForm>({
    companyName: '',
    serviceType: '',
    name: '',
    email: '',
    password: '',
    phone: '',
    website: '',
    source: 'AUTRE',
    ownerAdminId: '',
    tagsRaw: '',
  })
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [createdClient, setCreatedClient] = useState<{
    id: string
    name: string
    email: string
    password: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const {
    errors: fieldErrors,
    validate,
    validateField,
  } = useFormValidation<ClientFormField>(useMemo(() => buildClientValidationSchema(t), [t]))

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const data = await apiFetch<{ users?: AdminUser[] }>('/api/admin/admins')
        setAdmins(data.users || [])
      } catch {
        setAdmins([])
      }
    }
    loadAdmins()
  }, [])

  const handleCopyCredentials = async () => {
    if (!createdClient) return
    const text = t('adminAccess.clientNew.credentialsText', {
      email: createdClient.email,
      password: createdClient.password,
      url: `${window.location.origin}/login`,
    })
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleBlur = (field: ClientFormField) => {
    validateField(field, form[field])
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate(form)) return
    setError('')
    setLoading(true)
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        companyName: form.companyName,
        serviceType: form.serviceType,
        phone: form.phone,
        website: form.website,
        source: form.source,
        ownerAdminId: form.ownerAdminId || null,
        tags: form.tagsRaw
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      }
      const data = (await createAdminClient(payload)) as { client: Client }
      setCreatedClient({ id: data.client._id, name: form.name, email: form.email, password: form.password })
      showToast(t('adminAccess.clientNew.createdToast'), 'success')
    } catch (err: unknown) {
      setError((err as Error).message || t('adminAccess.clientNew.createFailed'))
      showToast(t('adminAccess.clientNew.createFailedToast'), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (createdClient) {
    return (
      <div className="portal-container pilotage-page client-new-page">
        <PageHeader
          eyebrow={t('adminOps.pilotage.zone.commercial')}
          title={t('adminAccess.clientNew.createdTitle')}
          actions={
            <Link className="portal-button secondary" to="/admin/crm/suivre/comptes">
              {t('adminAccess.clientNew.breadcrumbList')}
            </Link>
          }
        />

        <div className="portal-card" style={{ marginTop: 24 }}>
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
              {t('adminAccess.clientNew.createdIntroBefore')}{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{createdClient.name}</strong>{' '}
              {t('adminAccess.clientNew.createdIntroAfter')}
            </p>

            <div
              style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--r-md)',
                padding: 20,
                border: '1px solid var(--border-color)',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('adminAccess.clientNew.email')}</span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                  }}
                >
                  {createdClient.email}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('adminAccess.clientNew.password')}</span>
                <span
                  style={{
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                  }}
                >
                  {createdClient.password}
                </span>
              </div>
            </div>

            <button className="portal-button" type="button" onClick={handleCopyCredentials} style={{ width: '100%' }}>
              {copied ? t('adminAccess.clientNew.copied') : t('adminAccess.clientNew.copyCredentials')}
            </button>

            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <Link
                className="portal-button"
                to={`/admin/comptes-clients/${createdClient.id}`}
                style={{ textAlign: 'center', flex: 1 }}
              >
                {t('adminAccess.clientNew.viewProfile')}
              </Link>
              <Link
                className="portal-button secondary"
                to="/admin/crm/suivre/comptes"
                style={{ textAlign: 'center', flex: 1 }}
              >
                {t('adminAccess.clientNew.backToList')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-container pilotage-page client-new-page">
      <PageHeader
        eyebrow={t('adminOps.pilotage.zone.commercial')}
        title={t('adminAccess.clientNew.title')}
        actions={
          <Link className="portal-button secondary" to="/admin/crm/suivre/comptes">
            {t('adminAccess.clientNew.breadcrumbList')}
          </Link>
        }
      />

      <div className="portal-card" style={{ marginTop: 24 }}>
        <form className="portal-list" onSubmit={handleSubmit}>
          <div className="portal-grid">
            <FormField label={t('adminAccess.clientNew.companyLabel')} error={fieldErrors.companyName} required>
              <input
                className="portal-input"
                placeholder={t('adminAccess.clientNew.companyPlaceholder')}
                value={form.companyName}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, companyName: event.target.value })
                }
                onBlur={() => handleBlur('companyName')}
              />
            </FormField>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                {t('adminAccess.clientNew.serviceLabel')}
              </label>
              <CustomSelect
                className="portal-input"
                value={form.serviceType}
                onChange={(v) => setForm({ ...form, serviceType: v })}
                options={[{ value: '', label: '—' }, ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: s }))]}
              />
            </div>
            <FormField label={t('adminAccess.clientNew.contactLabel')} error={fieldErrors.name} required>
              <input
                className="portal-input"
                placeholder={t('adminAccess.clientNew.contactPlaceholder')}
                value={form.name}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, name: event.target.value })
                }
                onBlur={() => handleBlur('name')}
              />
            </FormField>
            <FormField label={t('adminAccess.clientNew.email')} error={fieldErrors.email} required>
              <input
                className="portal-input"
                type="email"
                placeholder={t('adminAccess.clientNew.emailPlaceholder')}
                value={form.email}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, email: event.target.value })
                }
                onBlur={() => handleBlur('email')}
              />
            </FormField>
            <FormField label={t('adminAccess.clientNew.password')} error={fieldErrors.password} required>
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('adminAccess.clientNew.passwordPlaceholder')}
                  value={form.password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, password: event.target.value })
                  }
                  onBlur={() => handleBlur('password')}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontSize: 18,
                  }}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </FormField>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                {t('adminAccess.clientNew.phone')}
              </label>
              <input
                className="portal-input"
                placeholder="+33 ..."
                value={form.phone}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, phone: event.target.value })
                }
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                {t('adminAccess.clientNew.website')}
              </label>
              <input
                className="portal-input"
                placeholder="https://..."
                value={form.website}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, website: event.target.value })
                }
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                {t('adminAccess.clientNew.source')}
              </label>
              <CustomSelect
                className="portal-input"
                value={form.source}
                onChange={(v) => setForm({ ...form, source: v })}
                options={SOURCE_OPTIONS.map((s) => ({ value: s, label: s }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                {t('adminAccess.clientNew.owner')}
              </label>
              <CustomSelect
                className="portal-input"
                value={form.ownerAdminId}
                onChange={(v) => setForm({ ...form, ownerAdminId: v })}
                options={[
                  { value: '', label: t('adminAccess.clientNew.unassigned') },
                  ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` })),
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>
                {t('adminAccess.clientNew.tagsLabel')}
              </label>
              <input
                className="portal-input"
                placeholder={t('adminAccess.clientNew.tagsPlaceholder')}
                value={form.tagsRaw}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, tagsRaw: event.target.value })
                }
              />
            </div>
          </div>

          {error && <div className="admin-error">{error}</div>}
          <div className="admin-button-group">
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? t('adminAccess.clientNew.creating') : t('adminAccess.clientNew.create')}
            </button>
            <Link className="portal-button secondary" to="/admin/crm/suivre/comptes">
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ClientAccountNew
