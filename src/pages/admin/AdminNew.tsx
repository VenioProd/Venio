import React, { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import type { ValidationSchema } from '../../hooks/useFormValidation'
import { getPermissionsForRole, hasPermission, PERMISSIONS } from '../../lib/permissions'
import {
  ACCESS_MODULES,
  INVITABLE_ROLE_GROUPS,
  ROLE_TEXT,
  generatePassword,
  moduleLevel,
  permissionOverrides,
} from '../../lib/teamAccess'
import type { AccessLevel } from '../../lib/teamAccess'
import type { User } from '../../types/auth.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import './AdminInvite.css'

type InviteField = 'name' | 'email' | 'password'
type Translate = ReturnType<typeof useI18n>['t']

interface CreatedMember {
  id: string
  name: string
  email: string
  password: string
  role: string
}

// Miroir de COMMISSION_RATE_BP (backend/src/lib/externalSales.ts) : le taux est
// commun à tous les externes, ce formulaire ne le saisit pas.
const EXTERNAL_COMMISSION_PERCENT = 10

const LEVEL_LABELS: Record<AccessLevel, MessageKey> = {
  none: 'projects.admin.invite.level.none',
  read: 'projects.admin.invite.level.read',
  write: 'projects.admin.invite.level.write',
}

const TOTAL_PERMISSIONS = ACCESS_MODULES.reduce((sum, module) => sum + module.permissions.length, 0)

const buildSchema = (t: Translate): ValidationSchema<InviteField> => ({
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

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

const emptyForm = () => ({ name: '', email: '', title: '', password: generatePassword(), role: 'ADMIN' })

const AdminNew = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [form, setForm] = useState(emptyForm)
  const [isAssociate, setIsAssociate] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<CreatedMember | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const {
    errors: fieldErrors,
    validate,
    validateField,
  } = useFormValidation<InviteField>(useMemo(() => buildSchema(t), [t]))

  const isExternal = form.role === 'COMMERCIAL_EXTERNE'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  // Le serveur n'applique les exceptions de droits que si l'auteur est super admin,
  // et un externe n'a de toute façon aucun droit admin à ajuster.
  const canCustomize = isSuperAdmin && !isExternal
  const canManageExternalSales = hasPermission(user, PERMISSIONS.MANAGE_EXTERNAL_SALES)

  const roleDefaults = useMemo(() => getPermissionsForRole(form.role), [form.role])
  const effective = useMemo(
    () => new Set(customMode && canCustomize ? customPermissions : roleDefaults),
    [customMode, canCustomize, customPermissions, roleDefaults],
  )
  const overrides = useMemo(
    () => permissionOverrides(roleDefaults, customPermissions),
    [roleDefaults, customPermissions],
  )
  const accessibleModules = ACCESS_MODULES.filter((module) => moduleLevel(module, effective) !== 'none').length

  const roleText = ROLE_TEXT[form.role]
  const roleLabel = roleText ? t(roleText.label) : form.role

  // Une erreur affichée disparaît dès que la saisie redevient valide, sans attendre la sortie du champ.
  const changeField = (field: InviteField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (fieldErrors[field]) validateField(field, value)
  }

  const selectRole = (role: string) => {
    setForm((prev) => ({ ...prev, role }))
    if (role !== 'COMMERCIAL') setIsAssociate(false)
    // Les écarts se mesurent contre le rôle : en changer repart des droits du nouveau rôle.
    setCustomPermissions(getPermissionsForRole(role))
  }

  const toggleCustom = (enabled: boolean) => {
    if (enabled) setCustomPermissions([...roleDefaults])
    setCustomMode(enabled)
  }

  const togglePermission = (permission: string) =>
    setCustomPermissions((prev) =>
      prev.includes(permission) ? prev.filter((item) => item !== permission) : [...prev, permission],
    )

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000)
    } catch {
      // Presse-papiers refusé : la valeur reste affichée, elle se copie à la main.
    }
  }

  const loginUrl = `${window.location.origin}/admin/login`

  const sendByEmail = async () => {
    if (!created) return
    setSending(true)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/admins/${created.id}/send-credentials`, {
        method: 'POST',
        body: JSON.stringify({ password: created.password }),
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setEmailError((err as Error).message || t('projects.admin.invite.done.sendError'))
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate(form)) {
      if (!form.name.trim()) nameRef.current?.focus()
      else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) emailRef.current?.focus()
      else passwordRef.current?.focus()
      return
    }
    setError('')
    setLoading(true)
    try {
      const title = form.title.trim()
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        // `title` s'affiche dans l'équipe, `jobTitle` dans la barre latérale et la messagerie.
        title,
        jobTitle: title,
      }
      if (form.role === 'COMMERCIAL' && isAssociate) payload.isAssociate = true
      if (customMode && canCustomize) Object.assign(payload, overrides)
      const data = await apiFetch<{ user: User }>('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setCreated({
        id: data.user._id,
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })
      showToast(t('projects.admin.invite.createdToast', { name: form.name.trim() }), 'success')
    } catch (err: unknown) {
      setError((err as Error).message || t('projects.admin.invite.createError'))
    } finally {
      setLoading(false)
    }
  }

  const inviteAnother = () => {
    setCreated(null)
    setForm(emptyForm())
    setIsAssociate(false)
    setShowPassword(false)
    setCustomMode(false)
    setCustomPermissions([])
    setEmailSent(false)
    setEmailError('')
    setError('')
  }

  const breadcrumb = (current: string) => (
    <nav className="admin-breadcrumb" aria-label="breadcrumb">
      <Link to="/admin">Admin</Link>
      <span>/</span>
      <Link to="/admin/comptes-admin">{t('projects.admin.adminAccounts')}</Link>
      <span>/</span>
      <span>{current}</span>
    </nav>
  )

  if (created) {
    const createdRole = ROLE_TEXT[created.role]
    const invitation = t('projects.admin.credentialsText', {
      email: created.email,
      password: created.password,
      url: loginUrl,
    })
    const nextSteps: string[] = [t('projects.admin.invite.done.nextLogin', { url: loginUrl })]
    if (created.role === 'COMMERCIAL_EXTERNE') {
      nextSteps.push(t('projects.admin.invite.done.nextExternal'))
      if (canManageExternalSales) nextSteps.push(t('projects.admin.invite.done.nextExternalManage'))
    }
    if (created.role === 'STAGIAIRE') nextSteps.push(t('projects.admin.invite.done.nextIntern'))
    nextSteps.push(t('projects.admin.invite.done.nextRights'))

    return (
      <div className="portal-container invite">
        <header className="invite-head">
          {breadcrumb(t('projects.admin.invite.done.crumb'))}
          <h1>{t('projects.admin.invite.done.title', { name: created.name })}</h1>
          <p className="invite-lead">{t('projects.admin.invite.done.lead')}</p>
        </header>

        <div className="invite-done">
          <section className="invite-card" aria-labelledby="invite-credentials">
            <div className="invite-card__head">
              <h2 id="invite-credentials">{t('projects.admin.invite.section.access')}</h2>
              {createdRole && <span className="invite-pill">{t(createdRole.label)}</span>}
            </div>
            <dl className="invite-credentials">
              <div className="invite-credentials__row">
                <dt>{t('projects.admin.email')}</dt>
                <dd>{created.email}</dd>
                <button type="button" className="invite-link" onClick={() => copy('email', created.email)}>
                  {copiedKey === 'email'
                    ? t('projects.admin.invite.done.copied')
                    : t('projects.admin.invite.done.copy')}
                </button>
              </div>
              <div className="invite-credentials__row">
                <dt>{t('projects.admin.password')}</dt>
                <dd>{created.password}</dd>
                <button type="button" className="invite-link" onClick={() => copy('password', created.password)}>
                  {copiedKey === 'password'
                    ? t('projects.admin.invite.done.copied')
                    : t('projects.admin.invite.done.copy')}
                </button>
              </div>
            </dl>
            <div className="invite-actions">
              <button type="button" className="portal-button" onClick={() => copy('all', invitation)}>
                {copiedKey === 'all' ? t('projects.admin.invite.done.copied') : t('projects.admin.invite.done.copyAll')}
              </button>
              <button
                type="button"
                className="portal-button secondary"
                onClick={sendByEmail}
                disabled={sending || emailSent}
              >
                {emailSent
                  ? t('projects.admin.invite.done.sent')
                  : sending
                    ? t('projects.admin.invite.done.sending')
                    : t('projects.admin.invite.done.send')}
              </button>
            </div>
            {emailError && (
              <div className="admin-error" role="alert">
                {emailError}
              </div>
            )}
          </section>

          <section className="invite-card" aria-labelledby="invite-next">
            <div className="invite-card__head">
              <h2 id="invite-next">{t('projects.admin.invite.done.next')}</h2>
            </div>
            <ul className="invite-steps">
              {nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <div className="invite-actions">
              <Link className="portal-button" to={`/admin/comptes-admin/${created.id}`}>
                {t('projects.admin.invite.done.profile')}
              </Link>
              <button type="button" className="portal-button secondary" onClick={inviteAnother}>
                {t('projects.admin.invite.done.another')}
              </button>
              <Link className="portal-button secondary" to="/admin/comptes-admin">
                {t('projects.admin.invite.done.back')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-container invite">
      <header className="invite-head">
        {breadcrumb(t('projects.admin.invite.crumb'))}
        <h1>{t('projects.admin.invite.title')}</h1>
        <p className="invite-lead">{t('projects.admin.invite.lead')}</p>
      </header>

      <div className="invite-layout">
        <form id="invite-form" className="invite-main" onSubmit={handleSubmit} noValidate>
          <section className="invite-card" aria-labelledby="invite-identity">
            <div className="invite-card__head">
              <h2 id="invite-identity">
                <span className="invite-step" aria-hidden="true">
                  1
                </span>
                {t('projects.admin.invite.section.identity')}
              </h2>
              <p>{t('projects.admin.invite.section.identityHint')}</p>
            </div>
            <div className="invite-fields">
              <FormField label={t('projects.admin.fullName')} error={fieldErrors.name} required htmlFor="invite-name">
                <input
                  id="invite-name"
                  ref={nameRef}
                  className="portal-input"
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) => changeField('name', event.target.value)}
                  onBlur={() => validateField('name', form.name)}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
              </FormField>
              <FormField label={t('projects.admin.email')} error={fieldErrors.email} required htmlFor="invite-email">
                <input
                  id="invite-email"
                  ref={emailRef}
                  className="portal-input"
                  type="email"
                  autoComplete="off"
                  placeholder={t('projects.admin.emailPlaceholder')}
                  value={form.email}
                  onChange={(event) => changeField('email', event.target.value)}
                  onBlur={() => validateField('email', form.email)}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
              </FormField>
              <FormField label={t('projects.admin.invite.titleLabel')} htmlFor="invite-title">
                <input
                  id="invite-title"
                  className="portal-input"
                  autoComplete="off"
                  placeholder={t('projects.admin.invite.titlePlaceholder')}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </FormField>
            </div>
          </section>

          <section className="invite-card" aria-labelledby="invite-role">
            <div className="invite-card__head">
              <h2 id="invite-role">
                <span className="invite-step" aria-hidden="true">
                  2
                </span>
                {t('projects.admin.invite.section.role')}
              </h2>
              <p>{t('projects.admin.invite.section.roleHint')}</p>
            </div>
            {INVITABLE_ROLE_GROUPS.map((group) => (
              <fieldset className="invite-roles" key={group.id}>
                <legend>{t(group.label)}</legend>
                <div className="invite-roles__grid">
                  {group.roles.map((role) => {
                    const text = ROLE_TEXT[role]
                    const selected = form.role === role
                    return (
                      <label className="invite-role" data-selected={selected} key={role}>
                        <input
                          type="radio"
                          name="role"
                          value={role}
                          checked={selected}
                          onChange={() => selectRole(role)}
                          aria-labelledby={`invite-role-${role}-name`}
                          aria-describedby={`invite-role-${role}-desc`}
                        />
                        <span className="invite-role__name" id={`invite-role-${role}-name`}>
                          {text ? t(text.label) : role}
                        </span>
                        <span className="invite-role__desc" id={`invite-role-${role}-desc`}>
                          {text ? t(text.description) : ''}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ))}
          </section>

          {form.role === 'COMMERCIAL' && (
            <section className="invite-card" aria-labelledby="invite-specifics">
              <div className="invite-card__head">
                <h2 id="invite-specifics">{t('projects.admin.invite.section.specifics')}</h2>
              </div>
              <label className="invite-check">
                <input
                  type="checkbox"
                  checked={isAssociate}
                  onChange={(event) => setIsAssociate(event.target.checked)}
                />
                <span>
                  <strong>{t('projects.admin.invite.associate.label')}</strong>
                  <small>{t('projects.admin.invite.associate.help')}</small>
                </span>
              </label>
            </section>
          )}

          {form.role === 'STAGIAIRE' && (
            <p className="invite-note" role="note">
              {t('projects.admin.invite.intern.note')}
            </p>
          )}

          {isExternal ? (
            <section className="invite-card" aria-labelledby="invite-external">
              <div className="invite-card__head">
                <h2 id="invite-external">{t('projects.admin.invite.external.title')}</h2>
              </div>
              <ul className="invite-steps">
                <li>{t('projects.admin.invite.external.leads')}</li>
                <li>{t('projects.admin.invite.external.clients')}</li>
                <li>{t('projects.admin.invite.external.handoff')}</li>
                <li>{t('projects.admin.invite.external.noAdmin')}</li>
              </ul>
              <div className="invite-commission">
                <span className="invite-commission__label">{t('projects.admin.invite.external.commission')}</span>
                <span className="invite-commission__rate">
                  {t('projects.admin.invite.external.rate', { rate: EXTERNAL_COMMISSION_PERCENT })}
                </span>
                <p>{t('projects.admin.invite.external.rateBody')}</p>
              </div>
              {canManageExternalSales && (
                <p className="invite-hint">
                  {t('projects.admin.invite.external.manage')}{' '}
                  <Link to="/admin/commerciaux-externes">{t('projects.admin.invite.external.manageLink')}</Link>
                </p>
              )}
            </section>
          ) : (
            <section className="invite-card" aria-labelledby="invite-rights">
              <div className="invite-card__head">
                <h2 id="invite-rights">{t('projects.admin.invite.section.rights')}</h2>
                <p>{t('projects.admin.invite.section.rightsHint')}</p>
              </div>
              {canCustomize && (
                <div className="invite-customize">
                  <label className="invite-check">
                    <input
                      type="checkbox"
                      checked={customMode}
                      onChange={(event) => toggleCustom(event.target.checked)}
                    />
                    <span>
                      <strong>{t('projects.admin.invite.rights.customize')}</strong>
                      <small>{t('projects.admin.invite.rights.customizeHint')}</small>
                    </span>
                  </label>
                  {customMode && (
                    <div className="invite-customize__status" aria-live="polite">
                      <span>
                        {overrides.grantedPermissions.length + overrides.deniedPermissions.length === 0
                          ? t('projects.admin.invite.rights.same')
                          : t('projects.admin.invite.rights.diff', {
                              added: overrides.grantedPermissions.length,
                              removed: overrides.deniedPermissions.length,
                            })}
                      </span>
                      <button
                        type="button"
                        className="invite-link"
                        onClick={() => setCustomPermissions([...roleDefaults])}
                      >
                        {t('projects.admin.invite.rights.reset')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <ul className="invite-modules">
                {ACCESS_MODULES.map((module) => {
                  const level = moduleLevel(module, effective)
                  const held = module.permissions.filter((item) => effective.has(item.permission))
                  return (
                    <li className="invite-module" key={module.id}>
                      <div className="invite-module__head">
                        <span className="invite-module__name">{t(module.label)}</span>
                        <span className="invite-level" data-level={level}>
                          {t(LEVEL_LABELS[level])}
                        </span>
                        <span className="invite-module__count">
                          {t('projects.admin.invite.rights.count', {
                            granted: held.length,
                            total: module.permissions.length,
                          })}
                        </span>
                      </div>
                      {customMode && canCustomize ? (
                        <div className="invite-module__perms">
                          {module.permissions.map((item) => {
                            const checked = effective.has(item.permission)
                            const inRole = roleDefaults.includes(item.permission)
                            return (
                              <label className="invite-perm" key={item.permission}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePermission(item.permission)}
                                />
                                <span>{t(item.label)}</span>
                                {checked !== inRole && (
                                  <em>
                                    {checked
                                      ? t('projects.admin.invite.rights.added')
                                      : t('projects.admin.invite.rights.removed')}
                                  </em>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="invite-module__detail">
                          {held.length > 0
                            ? held.map((item) => t(item.label)).join(' · ')
                            : t('projects.admin.invite.rights.noneGranted')}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <section className="invite-card" aria-labelledby="invite-access">
            <div className="invite-card__head">
              <h2 id="invite-access">
                <span className="invite-step" aria-hidden="true">
                  3
                </span>
                {t('projects.admin.invite.section.access')}
              </h2>
              <p>{t('projects.admin.invite.section.accessHint')}</p>
            </div>
            <FormField
              label={t('projects.admin.password')}
              error={fieldErrors.password}
              required
              htmlFor="invite-password"
            >
              <div className="invite-password">
                <input
                  id="invite-password"
                  ref={passwordRef}
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => changeField('password', event.target.value)}
                  onBlur={() => validateField('password', form.password)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby="invite-password-help"
                />
                <button type="button" className="portal-button secondary" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? t('projects.admin.invite.password.hide') : t('projects.admin.invite.password.show')}
                </button>
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={() => {
                    setForm({ ...form, password: generatePassword() })
                    setShowPassword(true)
                  }}
                >
                  {t('projects.admin.invite.password.generate')}
                </button>
              </div>
              <small id="invite-password-help" className="invite-hint">
                {t('projects.admin.invite.password.help')}
              </small>
            </FormField>
          </section>
        </form>

        <aside className="invite-aside" aria-labelledby="invite-summary">
          <div className="invite-card">
            <h2 id="invite-summary" className="invite-aside__title">
              {t('projects.admin.invite.summary.title')}
            </h2>
            <div className="invite-who">
              <span className="invite-avatar" aria-hidden="true">
                {initials(form.name) || '?'}
              </span>
              <div className="invite-who__text">
                <strong data-empty={!form.name.trim()}>
                  {form.name.trim() || t('projects.admin.invite.summary.namePlaceholder')}
                </strong>
                <span data-empty={!form.email.trim()}>
                  {form.email.trim() || t('projects.admin.invite.summary.emailPlaceholder')}
                </span>
                {form.title.trim() && <span>{form.title.trim()}</span>}
              </div>
            </div>
            <div className="invite-aside__role">
              <span className="invite-pill">{roleLabel}</span>
              {form.role === 'COMMERCIAL' && isAssociate && (
                <span className="invite-pill">{t('projects.admin.invite.associate.label')}</span>
              )}
            </div>
            <p className="invite-aside__desc">{roleText ? t(roleText.description) : ''}</p>
            <p className="invite-aside__access">
              {isExternal
                ? t('projects.admin.invite.summary.accessExternal')
                : t('projects.admin.invite.summary.access', {
                    count: accessibleModules,
                    total: ACCESS_MODULES.length,
                  })}
              {!isExternal && (
                <span>
                  {' '}
                  · {effective.size} / {TOTAL_PERMISSIONS}
                </span>
              )}
            </p>
            {error && (
              <div className="admin-error" role="alert">
                {error}
              </div>
            )}
            <div className="invite-aside__actions">
              <button className="portal-button" type="submit" form="invite-form" disabled={loading}>
                {loading ? t('projects.admin.invite.submitting') : t('projects.admin.invite.submit')}
              </button>
              <Link className="portal-button secondary" to="/admin/comptes-admin">
                {t('projects.admin.cancel')}
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default AdminNew
