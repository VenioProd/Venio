import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import type { ValidationSchema } from '../../hooks/useFormValidation'
import { ADMIN_ROLES, getPermissionsForRole, PERMISSIONS } from '../../lib/permissions'
import type { User } from '../../types/auth.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

type AdminFormField = 'name' | 'email' | 'password'
type Translate = ReturnType<typeof useI18n>['t']

const buildAdminValidationSchema = (t: Translate): ValidationSchema<AdminFormField> => ({
  name: [{ type: 'required', message: t('projects.admin.val.nameRequired') }],
  email: [
    { type: 'required', message: t('projects.admin.val.emailRequired') },
    { type: 'email', message: t('projects.admin.val.emailInvalid') },
  ],
  password: [
    { type: 'required', message: t('projects.admin.val.passwordRequired') },
    { type: 'minLength', value: 6, message: t('projects.admin.val.passwordMin') },
  ],
})

const ROLE_META_KEYS: Record<string, { label: MessageKey; description: MessageKey }> = {
  SUPER_ADMIN: { label: 'projects.admin.role.superAdmin', description: 'projects.admin.roleDesc.superAdmin' },
  ADMIN: { label: 'projects.admin.role.contributor', description: 'projects.admin.roleDesc.contributor' },
  RH: { label: 'projects.admin.role.hr', description: 'projects.admin.roleDesc.hr' },
  VIEWER: { label: 'projects.admin.role.viewer', description: 'projects.admin.roleDesc.viewer' },
  PDG: { label: 'projects.admin.role.pdg', description: 'projects.admin.roleDesc.pdg' },
  COMMERCIAL: { label: 'projects.admin.role.sales', description: 'projects.admin.roleDesc.sales' },
  STAGIAIRE: { label: 'projects.admin.role.intern', description: 'projects.admin.roleDesc.intern' },
  COMMERCIAL_EXTERNE: {
    label: 'projects.admin.role.externalSales',
    description: 'projects.admin.roleDesc.externalSales',
  },
}

const PERMISSION_LABEL_KEYS: Record<string, MessageKey> = {
  [PERMISSIONS.MANAGE_ADMINS]: 'projects.admin.perm.manageAdmins',
  [PERMISSIONS.MANAGE_CLIENTS]: 'projects.admin.perm.manageClients',
  [PERMISSIONS.VIEW_CRM]: 'projects.admin.perm.viewCrm',
  [PERMISSIONS.MANAGE_CRM]: 'projects.admin.perm.manageCrm',
  [PERMISSIONS.VIEW_PROJECTS]: 'projects.admin.perm.viewProjects',
  [PERMISSIONS.EDIT_PROJECTS]: 'projects.admin.perm.editProjects',
  [PERMISSIONS.VIEW_CONTENT]: 'projects.admin.perm.viewContent',
  [PERMISSIONS.EDIT_CONTENT]: 'projects.admin.perm.editContent',
  [PERMISSIONS.UPLOAD_PROJECT_DOCUMENTS]: 'projects.admin.perm.uploadDocs',
  [PERMISSIONS.VIEW_BILLING]: 'projects.admin.perm.viewBilling',
  [PERMISSIONS.MANAGE_BILLING]: 'projects.admin.perm.manageBilling',
  [PERMISSIONS.MANAGE_TASKS]: 'projects.admin.perm.manageTasks',
  [PERMISSIONS.VIEW_QUALIOPI]: 'projects.admin.perm.viewQualiopi',
  [PERMISSIONS.MANAGE_QUALIOPI]: 'projects.admin.perm.manageQualiopi',
  [PERMISSIONS.VIEW_TICKETS]: 'projects.admin.perm.viewTickets',
  [PERMISSIONS.CREATE_TICKETS]: 'projects.admin.perm.createTickets',
  [PERMISSIONS.MANAGE_TICKETS]: 'projects.admin.perm.manageTickets',
  [PERMISSIONS.MANAGE_EXTERNAL_SALES]: 'projects.admin.perm.manageExternalSales',
}

const allPermissions = Object.values(PERMISSIONS)

const AdminNew = () => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<{ name: string; email: string; password: string; role: string }>({
    name: '',
    email: '',
    password: '',
    role: 'ADMIN',
  })
  const [customMode, setCustomMode] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [createdUser, setCreatedUser] = useState<{ id: string; name: string; email: string; password: string } | null>(
    null,
  )
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')
  const {
    errors: fieldErrors,
    validate,
    validateField,
  } = useFormValidation<AdminFormField>(useMemo(() => buildAdminValidationSchema(t), [t]))

  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  const availableRoles = useMemo(() => {
    return [...ADMIN_ROLES.filter((role) => role !== 'SUPER_ADMIN' || isSuperAdmin), 'COMMERCIAL_EXTERNE']
  }, [isSuperAdmin])
  // L'externe n'a aucun droit admin : son espace est fixe, rien à personnaliser.
  const isExternal = form.role === 'COMMERCIAL_EXTERNE'

  const roleDefaults = useMemo(() => getPermissionsForRole(form.role), [form.role])

  // Reset custom permissions to role defaults when role changes or custom mode toggles
  const handleToggleCustom = () => {
    if (!customMode) {
      setCustomPermissions([...roleDefaults])
    }
    setCustomMode(!customMode)
  }

  const handlePermToggle = (perm: string) => {
    setCustomPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]))
  }

  const selectedPermissions = useMemo(() => {
    if (form.role === 'SUPER_ADMIN') {
      return [t('projects.admin.perm.all')]
    }
    const perms = customMode ? customPermissions : roleDefaults
    return perms.map((permission) =>
      PERMISSION_LABEL_KEYS[permission] ? t(PERMISSION_LABEL_KEYS[permission]) : permission,
    )
  }, [form.role, customMode, customPermissions, roleDefaults, t])

  const missingPermissions = useMemo(() => {
    if (form.role === 'SUPER_ADMIN') {
      return []
    }
    const activePerms = new Set(customMode ? customPermissions : roleDefaults)
    return allPermissions
      .filter((permission) => !activePerms.has(permission))
      .map((permission) => (PERMISSION_LABEL_KEYS[permission] ? t(PERMISSION_LABEL_KEYS[permission]) : permission))
  }, [form.role, customMode, customPermissions, roleDefaults, t])

  const handleCopyCredentials = async () => {
    if (!createdUser) return
    const text = t('projects.admin.credentialsText', {
      email: createdUser.email,
      password: createdUser.password,
      url: `${window.location.origin}/admin/login`,
    })
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSendEmail = async () => {
    if (!createdUser) return
    setSending(true)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/admins/${createdUser.id}/send-credentials`, {
        method: 'POST',
        body: JSON.stringify({ password: createdUser.password }),
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setEmailError((err as Error).message || t('projects.admin.sendError'))
    } finally {
      setSending(false)
    }
  }

  const handleBlur = (field: AdminFormField) => {
    validateField(field, form[field])
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate(form)) return
    setError('')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { ...form }
      if (customMode && form.role !== 'SUPER_ADMIN' && !isExternal) {
        payload.customPermissions = customPermissions
      }
      const data = await apiFetch<{ user: User }>('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setCreatedUser({ id: data.user._id, name: form.name, email: form.email, password: form.password })
      showToast(t('projects.admin.createdToast'), 'success')
    } catch (err: unknown) {
      setError((err as Error).message || t('projects.admin.createError'))
    } finally {
      setLoading(false)
    }
  }

  if (createdUser) {
    return (
      <div className="portal-container">
        <div className="portal-card">
          <div className="admin-breadcrumb">
            <Link to="/admin">Admin</Link>
            <span>/</span>
            <Link to="/admin/comptes-admin">{t('projects.admin.adminAccounts')}</Link>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>{t('projects.admin.createdCrumb')}</span>
          </div>
          <h1>{t('projects.admin.createdTitle')}</h1>
        </div>

        <div className="portal-card" style={{ marginTop: 24 }}>
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
              {t('projects.admin.createdIntro', { name: createdUser.name })} {t('projects.admin.createdIntroSuffix')}
            </p>

            <div
              style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 10,
                padding: 20,
                border: '1px solid var(--border-color)',
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('projects.admin.email')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>
                  {createdUser.email}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('projects.admin.password')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>
                  {createdUser.password}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="portal-button"
                type="button"
                onClick={handleCopyCredentials}
                style={{ flex: 1, minWidth: 180 }}
              >
                {copied ? t('projects.admin.copied') : t('projects.admin.copyCredentials')}
              </button>

              <button
                className="portal-button secondary"
                type="button"
                onClick={handleSendEmail}
                disabled={sending || emailSent}
                style={{ flex: 1, minWidth: 180 }}
              >
                {emailSent
                  ? t('projects.admin.emailSent')
                  : sending
                    ? t('projects.admin.sending')
                    : t('projects.admin.sendByEmail')}
              </button>
            </div>

            {emailError && (
              <div className="admin-error" style={{ marginTop: 12 }}>
                {emailError}
              </div>
            )}

            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <Link
                className="portal-button"
                to={`/admin/comptes-admin/${createdUser.id}`}
                style={{ textAlign: 'center', flex: 1 }}
              >
                {t('projects.admin.viewProfile')}
              </Link>
              <Link
                className="portal-button secondary"
                to="/admin/comptes-admin"
                style={{ textAlign: 'center', flex: 1 }}
              >
                {t('projects.admin.backToList')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <Link to="/admin/comptes-admin">{t('projects.admin.adminAccounts')}</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{t('projects.admin.newCrumb')}</span>
        </div>
        <h1>{t('projects.admin.newTitle')}</h1>
      </div>

      <div className="portal-card" style={{ marginTop: 24 }}>
        <form className="portal-list" onSubmit={handleSubmit}>
          <FormField label={t('projects.admin.fullName')} error={fieldErrors.name} required>
            <input
              className="portal-input"
              placeholder={t('projects.admin.fullName')}
              value={form.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: event.target.value })}
              onBlur={() => handleBlur('name')}
            />
          </FormField>
          <FormField label={t('projects.admin.email')} error={fieldErrors.email} required>
            <input
              className="portal-input"
              type="email"
              placeholder={t('projects.admin.emailPlaceholder')}
              value={form.email}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: event.target.value })}
              onBlur={() => handleBlur('email')}
            />
          </FormField>
          <FormField label={t('projects.admin.password')} error={fieldErrors.password} required>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('projects.admin.securePasswordPlaceholder')}
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
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.admin.roleLabel')}
            </label>
            <CustomSelect
              className="portal-input"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={availableRoles.map((role) => ({
                value: role,
                label: ROLE_META_KEYS[role] ? t(ROLE_META_KEYS[role].label) : role,
              }))}
            />
            <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 13 }}>
              {ROLE_META_KEYS[form.role] ? t(ROLE_META_KEYS[form.role].description) : t('projects.admin.selectRole')}
            </p>
            {isSuperAdmin && form.role !== 'SUPER_ADMIN' && !isExternal && (
              <div style={{ marginTop: 12 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                  }}
                >
                  <input type="checkbox" checked={customMode} onChange={handleToggleCustom} />
                  {t('projects.admin.customizePerms')}
                </label>
              </div>
            )}
            {isExternal ? null : customMode && form.role !== 'SUPER_ADMIN' ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('projects.admin.customPerms')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  {allPermissions.map((perm) => (
                    <label
                      key={perm}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 13,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={customPermissions.includes(perm)}
                        onChange={() => handlePermToggle(perm)}
                      />
                      {PERMISSION_LABEL_KEYS[perm] ? t(PERMISSION_LABEL_KEYS[perm]) : perm}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    {t('projects.admin.grantedPerms')}
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13 }}>
                    {selectedPermissions.map((permission) => (
                      <li key={permission}>{permission}</li>
                    ))}
                  </ul>
                </div>
                {missingPermissions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                      {t('projects.admin.missingPerms')}
                    </div>
                    <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-muted)', fontSize: 13 }}>
                      {missingPermissions.map((permission) => (
                        <li key={permission}>{permission}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
          {error && <div className="admin-error">{error}</div>}
          <div className="admin-button-group">
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? t('projects.admin.creating') : t('projects.admin.createAccount')}
            </button>
            <Link className="portal-button secondary" to="/admin/comptes-admin">
              {t('projects.admin.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminNew
