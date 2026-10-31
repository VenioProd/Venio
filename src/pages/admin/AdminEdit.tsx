import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import { getPermissionsForRole, PERMISSIONS } from '../../lib/permissions'
import type { User, AdminRole } from '../../types/auth.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const ROLE_LABEL_KEYS: Record<string, MessageKey> = {
  SUPER_ADMIN: 'projects.admin.role.superAdmin',
  PDG: 'projects.admin.role.pdg',
  ADMIN: 'projects.admin.role.contributor',
  RH: 'projects.admin.role.hr',
  COMMERCIAL: 'projects.admin.role.sales',
  VIEWER: 'projects.admin.role.viewer',
  STAGIAIRE: 'projects.admin.role.intern',
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
}

const DAY_LABEL_KEYS: Record<string, MessageKey> = {
  lundi: 'projects.admin.day.lundi',
  mardi: 'projects.admin.day.mardi',
  mercredi: 'projects.admin.day.mercredi',
  jeudi: 'projects.admin.day.jeudi',
  vendredi: 'projects.admin.day.vendredi',
  samedi: 'projects.admin.day.samedi',
  dimanche: 'projects.admin.day.dimanche',
}

const allPermissions = Object.values(PERMISSIONS)

const AdminEdit = () => {
  const { t } = useI18n()
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const [admin, setAdmin] = useState<User | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<{
    name: string
    title: string
    role: string
    password: string
    isAssociate: boolean
  }>({
    name: '',
    title: '',
    role: 'ADMIN',
    isAssociate: false,
    password: '',
  })
  const [customMode, setCustomMode] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [savedPassword, setSavedPassword] = useState<string | null>(null)
  const [copiedCreds, setCopiedCreds] = useState(false)

  // Stagiaire
  const [isStagiaire, setIsStagiaire] = useState(false)
  const [internForm, setInternForm] = useState({
    type: 'STAGIAIRE' as 'STAGIAIRE' | 'ALTERNANT',
    poste: '',
    departement: '',
    dateDebut: '',
    dateFin: '',
    tuteur: '',
    ecole: '',
    formation: '',
    joursPresence: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] as string[],
    inclureEquipe: true,
  })
  const [admins, setAdmins] = useState<{ _id: string; name: string }[]>([])

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
  const roleDefaults = useMemo(() => getPermissionsForRole(form.role), [form.role])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch<{ user: User }>(`/api/admin/admins/${userId}`)
        const u = data.user
        setAdmin(u)
        setForm({
          name: u.name || '',
          title: u.title || '',
          role: u.role || 'ADMIN',
          password: '',
          isAssociate: u.isAssociate ?? false,
        })
        // Initialize custom permissions from server
        if (Array.isArray(u.customPermissions) && u.customPermissions.length > 0) {
          setCustomMode(true)
          setCustomPermissions(u.customPermissions)
        }
        // Check stagiaire
        const hasStagiaireTag = u.tags?.includes('STAGIAIRE')
        setIsStagiaire(!!hasStagiaireTag)
        if (hasStagiaireTag) {
          try {
            const interns = await apiFetch<any[]>('/api/admin/interns')
            const intern = interns.find((i: any) => i.userId?._id === userId || i.userId === userId)
            if (intern) {
              setInternForm({
                poste: intern.poste || '',
                departement: intern.departement || '',
                dateDebut: intern.dateDebut ? intern.dateDebut.split('T')[0] : '',
                dateFin: intern.dateFin ? intern.dateFin.split('T')[0] : '',
                tuteur: intern.tuteur?._id || '',
                ecole: intern.ecole || '',
                formation: intern.formation || '',
                type: intern.type || 'STAGIAIRE',
                joursPresence: intern.joursPresence?.length
                  ? intern.joursPresence
                  : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
                inclureEquipe: intern.inclureEquipe !== false,
              })
            }
          } catch {
            /* silent */
          }
        }
      } catch (err: unknown) {
        setError((err as Error).message || t('projects.admin.loadError'))
      }
    }
    load()
    // Load admins for tuteur select
    apiFetch<{ users: { _id: string; name: string }[] }>('/api/admin/admins')
      .then((d) => setAdmins(d.users || []))
      .catch(() => {})
  }, [userId])

  const handleToggleCustom = () => {
    if (!customMode) {
      setCustomPermissions([...roleDefaults])
    }
    setCustomMode(!customMode)
  }

  const handlePermToggle = (perm: string) => {
    setCustomPermissions((prev) => (prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        title: form.title,
        role: form.role,
        isAssociate: form.isAssociate,
      }
      if (form.password) {
        payload.password = form.password
      }
      if (isSuperAdmin && form.role !== 'SUPER_ADMIN') {
        payload.customPermissions = customMode ? customPermissions : null
      }
      // Stagiaire
      if (isSuperAdmin) {
        payload.markAsStagiaire = isStagiaire
        if (isStagiaire) {
          payload.internInfo = {
            poste: internForm.poste || undefined,
            departement: internForm.departement || undefined,
            dateDebut: internForm.dateDebut || undefined,
            dateFin: internForm.dateFin || undefined,
            tuteur: internForm.tuteur || undefined,
            ecole: internForm.ecole || undefined,
            formation: internForm.formation || undefined,
            type: internForm.type,
            joursPresence: internForm.joursPresence,
            inclureEquipe: internForm.inclureEquipe,
          }
        }
      }
      const data = await apiFetch<{ user: User }>(`/api/admin/admins/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setAdmin(data.user)
      if (form.password) {
        setSavedPassword(form.password)
      }
      setForm((prev) => ({ ...prev, password: '' }))
      showToast(t('projects.admin.savedToast'), 'success')
    } catch (err: unknown) {
      setError((err as Error).message || t('projects.admin.updateError'))
      showToast(t('projects.admin.updateToastError'), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!admin && !error) {
    return (
      <div className="portal-container">
        <div className="admin-loading">{t('common.loading')}</div>
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
          <span style={{ color: 'var(--text-primary)' }}>{admin?.name || t('projects.admin.administrator')}</span>
        </div>
        <div className="admin-header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>{admin?.name || t('projects.admin.administrator')}</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              {admin?.email} ·{' '}
              {admin?.title ||
                (admin?.role && ROLE_LABEL_KEYS[admin.role] ? t(ROLE_LABEL_KEYS[admin.role]) : admin?.role)}
              {admin?.tags?.includes('STAGIAIRE') && (
                <span
                  style={{
                    marginLeft: 8,
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(14, 165, 233, 0.12)',
                    border: '1px solid rgba(14, 165, 233, 0.4)',
                    color: 'var(--primary)',
                  }}
                >
                  {t('projects.admin.internBadge')}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      {savedPassword && admin && (
        <div className="portal-card" style={{ marginTop: 24 }}>
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 14 }}>
              {t('projects.admin.passwordUpdated', { name: admin.name })}
            </p>
            <div
              style={{
                background: 'var(--bg-tertiary)',
                borderRadius: 10,
                padding: 20,
                border: '1px solid var(--border-color)',
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('projects.admin.email')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>
                  {admin.email}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('projects.admin.password')}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>
                  {savedPassword}
                </span>
              </div>
            </div>
            <button
              className="portal-button"
              type="button"
              style={{ width: '100%' }}
              onClick={async () => {
                const text = t('projects.admin.credentialsText', {
                  email: admin.email,
                  password: savedPassword,
                  url: `${window.location.origin}/admin/login`,
                })
                await navigator.clipboard.writeText(text)
                setCopiedCreds(true)
                setTimeout(() => setCopiedCreds(false), 2500)
              }}
            >
              {copiedCreds ? t('projects.admin.copied') : t('projects.admin.copyCredentials')}
            </button>
          </div>
        </div>
      )}

      <div className="portal-card" style={{ marginTop: 24 }}>
        <form className="portal-list" onSubmit={handleSubmit}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.admin.fullName')}
            </label>
            <input
              className="portal-input"
              placeholder={t('projects.admin.fullName')}
              value={form.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.admin.titleLabel')}{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('projects.admin.titleHint')}</span>
            </label>
            <input
              className="portal-input"
              placeholder={t('projects.admin.titlePlaceholder')}
              value={form.title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.admin.roleLabel')}
            </label>
            <CustomSelect
              className="portal-input"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={[
                ...(admin?.role === 'SUPER_ADMIN'
                  ? [{ value: 'SUPER_ADMIN', label: t('projects.admin.role.superAdmin') }]
                  : []),
                { value: 'PDG', label: t('projects.admin.role.pdg') },
                { value: 'ADMIN', label: t('projects.admin.role.contributor') },
                { value: 'RH', label: t('projects.admin.role.hr') },
                { value: 'COMMERCIAL', label: t('projects.admin.role.sales') },
                { value: 'VIEWER', label: t('projects.admin.role.viewer') },
                { value: 'STAGIAIRE', label: t('projects.admin.role.intern') },
              ]}
            />
          </div>
          <div>
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
              <input
                type="checkbox"
                checked={form.isAssociate}
                onChange={(e) => setForm({ ...form, isAssociate: e.target.checked })}
              />
              {t('projects.admin.associate')}
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
              {t('projects.admin.associateHelp')}
            </p>
          </div>
          {isSuperAdmin && form.role !== 'SUPER_ADMIN' && (
            <div>
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
              {customMode ? (
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
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    {t('projects.admin.defaultPerms')}
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13 }}>
                    {roleDefaults.map((perm) => (
                      <li key={perm}>{PERMISSION_LABEL_KEYS[perm] ? t(PERMISSION_LABEL_KEYS[perm]) : perm}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {/* Section Stagiaire */}
          {isSuperAdmin && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    fontSize: 14,
                    color: 'var(--text-primary)',
                  }}
                >
                  <input type="checkbox" checked={isStagiaire} onChange={(e) => setIsStagiaire(e.target.checked)} />
                  <span style={{ fontWeight: 600 }}>{t('projects.admin.teamMember')}</span>
                </label>
                {isStagiaire && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['STAGIAIRE', 'ALTERNANT'] as const).map((kind) => (
                      <span
                        key={kind}
                        onClick={() => setInternForm({ ...internForm, type: kind })}
                        style={{
                          cursor: 'pointer',
                          padding: '3px 10px',
                          borderRadius: 5,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            internForm.type === kind
                              ? kind === 'ALTERNANT'
                                ? 'rgba(155,155,155,0.15)'
                                : 'rgba(14, 165, 233, 0.15)'
                              : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${internForm.type === kind ? (kind === 'ALTERNANT' ? '#9b9b9b' : '#0ea5e9') : 'rgba(255,255,255,0.1)'}`,
                          color:
                            internForm.type === kind
                              ? kind === 'ALTERNANT'
                                ? '#9b9b9b'
                                : '#0ea5e9'
                              : 'rgba(255,255,255,0.4)',
                          userSelect: 'none',
                        }}
                      >
                        {kind === 'STAGIAIRE' ? t('projects.admin.typeIntern') : t('projects.admin.typeApprentice')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {isStagiaire && (
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    borderRadius: 10,
                    padding: 16,
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.position')}
                      </label>
                      <input
                        className="portal-input"
                        placeholder={t('projects.admin.positionPlaceholder')}
                        value={internForm.poste}
                        onChange={(e) => setInternForm({ ...internForm, poste: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.department')}
                      </label>
                      <input
                        className="portal-input"
                        placeholder={t('projects.admin.department')}
                        value={internForm.departement}
                        onChange={(e) => setInternForm({ ...internForm, departement: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.startDate')}
                      </label>
                      <input
                        className="portal-input"
                        type="date"
                        value={internForm.dateDebut}
                        onChange={(e) => setInternForm({ ...internForm, dateDebut: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.endDate')}
                      </label>
                      <input
                        className="portal-input"
                        type="date"
                        value={internForm.dateFin}
                        onChange={(e) => setInternForm({ ...internForm, dateFin: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.tutor')}
                      </label>
                      <select
                        className="portal-input"
                        value={internForm.tuteur}
                        onChange={(e) => setInternForm({ ...internForm, tuteur: e.target.value })}
                      >
                        <option value="">{t('projects.admin.noneOption')}</option>
                        {admins
                          .filter((a) => a._id !== userId)
                          .map((a) => (
                            <option key={a._id} value={a._id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.school')}
                      </label>
                      <input
                        className="portal-input"
                        placeholder={t('projects.admin.schoolPlaceholder')}
                        value={internForm.ecole}
                        onChange={(e) => setInternForm({ ...internForm, ecole: e.target.value })}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.training')}
                      </label>
                      <input
                        className="portal-input"
                        placeholder={t('projects.admin.training')}
                        value={internForm.formation}
                        onChange={(e) => setInternForm({ ...internForm, formation: e.target.value })}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('projects.admin.presenceDays')}
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((jour) => {
                          const checked = internForm.joursPresence.includes(jour)
                          return (
                            <span
                              key={jour}
                              onClick={() => {
                                const next = checked
                                  ? internForm.joursPresence.filter((j) => j !== jour)
                                  : [...internForm.joursPresence, jour]
                                setInternForm({ ...internForm, joursPresence: next })
                              }}
                              style={{
                                cursor: 'pointer',
                                padding: '5px 12px',
                                borderRadius: 6,
                                background: checked ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${checked ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                                fontSize: 13,
                                color: checked ? 'var(--primary)' : 'rgba(255,255,255,0.5)',
                                userSelect: 'none',
                                transition: 'all 0.15s',
                              }}
                            >
                              {DAY_LABEL_KEYS[jour] ? t(DAY_LABEL_KEYS[jour]) : jour}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label
                        onClick={() => setInternForm({ ...internForm, inclureEquipe: !internForm.inclureEquipe })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 20,
                            borderRadius: 10,
                            background: internForm.inclureEquipe ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                            position: 'relative',
                            transition: 'background 0.2s',
                            flexShrink: 0,
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: 2,
                              left: internForm.inclureEquipe ? 18 : 2,
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              background: '#fff',
                              transition: 'left 0.2s',
                            }}
                          />
                        </div>
                        <span
                          style={{ fontSize: 13, color: internForm.inclureEquipe ? '#fff' : 'rgba(255,255,255,0.4)' }}
                        >
                          {t('projects.admin.includeInTeam')}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              {t('projects.admin.newPassword')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPassword ? 'text' : 'password'}
                placeholder={t('projects.admin.keepPasswordPlaceholder')}
                value={form.password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, password: event.target.value })
                }
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
          </div>
          <div className="admin-button-group">
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? t('projects.admin.updating') : t('projects.admin.save')}
            </button>
            <button className="portal-button secondary" type="button" onClick={() => navigate('/admin/comptes-admin')}>
              {t('projects.admin.back')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminEdit
