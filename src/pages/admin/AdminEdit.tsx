import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getPermissionsForRole, PERMISSIONS } from '../../lib/permissions'
import type { User } from '../../types/auth.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  PDG: 'PDG',
  ADMIN: 'Contributeur',
  RH: 'RH',
  COMMERCIAL: 'Commercial',
  VIEWER: 'Lecture seule',
  STAGIAIRE: 'Stagiaire',
}

const permissionLabels: Record<string, string> = {
  [PERMISSIONS.MANAGE_ADMINS]: 'Gestion des administrateurs',
  [PERMISSIONS.MANAGE_CLIENTS]: 'Gestion des comptes clients',
  [PERMISSIONS.VIEW_CRM]: 'Lecture du CRM',
  [PERMISSIONS.MANAGE_CRM]: 'Gestion du CRM',
  [PERMISSIONS.VIEW_PROJECTS]: 'Lecture des projets',
  [PERMISSIONS.EDIT_PROJECTS]: 'Modification des projets',
  [PERMISSIONS.VIEW_CONTENT]: 'Lecture du contenu',
  [PERMISSIONS.EDIT_CONTENT]: 'Modification du contenu',
  [PERMISSIONS.VIEW_BILLING]: 'Lecture de la facturation',
  [PERMISSIONS.MANAGE_BILLING]: 'Gestion de la facturation',
  [PERMISSIONS.MANAGE_TASKS]: 'Gestion des tâches',
  [PERMISSIONS.VIEW_QUALIOPI]: 'Lecture Qualiopi',
  [PERMISSIONS.MANAGE_QUALIOPI]: 'Gestion Qualiopi',
  [PERMISSIONS.VIEW_TICKETS]: 'Lecture des tickets',
  [PERMISSIONS.CREATE_TICKETS]: 'Creation de tickets',
  [PERMISSIONS.MANAGE_TICKETS]: 'Gestion des tickets',
}

const allPermissions = Object.values(PERMISSIONS)

const AdminEdit = () => {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()
  const [admin, setAdmin] = useState<User | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<{ name: string; title: string; role: string; password: string }>({ name: '', title: '', role: 'ADMIN', password: '' })
  const [customMode, setCustomMode] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<string[]>([])
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [savedPassword, setSavedPassword] = useState<string | null>(null)
  const [copiedCreds, setCopiedCreds] = useState(false)

  // Stagiaire
  const [isStagiaire, setIsStagiaire] = useState(false)
  const [internForm, setInternForm] = useState({
    type: 'STAGIAIRE' as 'STAGIAIRE' | 'ALTERNANT', poste: '', departement: '', dateDebut: '', dateFin: '', tuteur: '', ecole: '', formation: '', joursPresence: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] as string[], inclureEquipe: true,
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
        setForm({ name: u.name || '', title: (u as any).title || '', role: u.role || 'ADMIN', password: '' })
        // Initialize custom permissions from server
        if (Array.isArray((u as any).customPermissions) && (u as any).customPermissions.length > 0) {
          setCustomMode(true)
          setCustomPermissions((u as any).customPermissions)
        }
        // Check stagiaire
        const hasStagiaireTag = (u as any).tags?.includes('STAGIAIRE')
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
                joursPresence: intern.joursPresence?.length ? intern.joursPresence : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
                inclureEquipe: intern.inclureEquipe !== false,
              })
            }
          } catch { /* silent */ }
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Erreur chargement admin')
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
    setCustomPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: Record<string, unknown> = { name: form.name, title: form.title, role: form.role }
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
      showToast('Modifications enregistrees', 'success')
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour admin')
      showToast('Erreur lors de la mise a jour', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!admin && !error) {
    return (
      <div className="portal-container">
        <div className="admin-loading">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <Link to="/admin/comptes-admin">Comptes admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{admin?.name || 'Administrateur'}</span>
        </div>
        <div className="admin-header">
          <div>
            <h1 style={{ marginBottom: '8px' }}>{admin?.name || 'Administrateur'}</h1>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              {admin?.email} · {(admin as any)?.title || roleLabels[admin?.role || ''] || admin?.role}
              {(admin as any)?.tags?.includes('STAGIAIRE') && (
                <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.4)', color: '#38bdf8' }}>Stagiaire</span>
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
              Le mot de passe de <strong style={{ color: 'var(--text-primary)' }}>{admin.name}</strong> a ete mis a jour. Voici les nouveaux identifiants :
            </p>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 20, border: '1px solid var(--border-color)', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Email</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>{admin.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Mot de passe</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>{savedPassword}</span>
              </div>
            </div>
            <button
              className="portal-button"
              type="button"
              style={{ width: '100%' }}
              onClick={async () => {
                const text = `Identifiants de connexion Venio\n\nEmail : ${admin.email}\nMot de passe : ${savedPassword}\n\nConnexion : ${window.location.origin}/admin/login`
                await navigator.clipboard.writeText(text)
                setCopiedCreds(true)
                setTimeout(() => setCopiedCreds(false), 2500)
              }}
            >
              {copiedCreds ? 'Copie !' : 'Copier les identifiants'}
            </button>
          </div>
        </div>
      )}

      <div className="portal-card" style={{ marginTop: 24 }}>
        <form className="portal-list" onSubmit={handleSubmit}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Nom complet
            </label>
            <input
              className="portal-input"
              placeholder="Nom complet"
              value={form.name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Titre / Fonction <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(optionnel — ex: PDG, Directeur...)</span>
            </label>
            <input
              className="portal-input"
              placeholder="Ex : PDG, Directeur commercial..."
              value={form.title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              Rôle
            </label>
            <CustomSelect
              className="portal-input"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              options={[
                ...(admin?.role === 'SUPER_ADMIN' ? [{ value: 'SUPER_ADMIN', label: 'Super admin' }] : []),
                { value: 'PDG', label: 'PDG' },
                { value: 'ADMIN', label: 'Contributeur' },
                { value: 'RH', label: 'RH' },
                { value: 'COMMERCIAL', label: 'Commercial' },
                { value: 'VIEWER', label: 'Lecture seule' },
                { value: 'STAGIAIRE', label: 'Stagiaire' },
              ]}
            />
          </div>
          {isSuperAdmin && form.role !== 'SUPER_ADMIN' && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={customMode} onChange={handleToggleCustom} />
                Personnaliser les droits
              </label>
              {customMode ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Droits personnalisés
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {allPermissions.map((perm) => (
                      <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={customPermissions.includes(perm)}
                          onChange={() => handlePermToggle(perm)}
                        />
                        {permissionLabels[perm] || perm}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Droits par défaut du rôle
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13 }}>
                    {roleDefaults.map((perm) => (
                      <li key={perm}>{permissionLabels[perm] || perm}</li>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
                  <input type="checkbox" checked={isStagiaire} onChange={(e) => setIsStagiaire(e.target.checked)} />
                  <span style={{ fontWeight: 600 }}>Membre de l'équipe (stage / alternance)</span>
                </label>
                {isStagiaire && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['STAGIAIRE', 'ALTERNANT'] as const).map((t) => (
                      <span key={t} onClick={() => setInternForm({ ...internForm, type: t })} style={{ cursor: 'pointer', padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, background: internForm.type === t ? (t === 'ALTERNANT' ? 'rgba(168,85,247,0.15)' : 'rgba(14,165,233,0.15)') : 'rgba(255,255,255,0.05)', border: `1px solid ${internForm.type === t ? (t === 'ALTERNANT' ? '#a855f7' : '#0ea5e9') : 'rgba(255,255,255,0.1)'}`, color: internForm.type === t ? (t === 'ALTERNANT' ? '#a855f7' : '#0ea5e9') : 'rgba(255,255,255,0.4)', userSelect: 'none' }}>
                        {t === 'STAGIAIRE' ? 'Stagiaire' : 'Alternant'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {isStagiaire && (
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 16, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Poste / Mission</label>
                      <input className="portal-input" placeholder="Ex: Commercial, Communication..." value={internForm.poste} onChange={(e) => setInternForm({ ...internForm, poste: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Departement</label>
                      <input className="portal-input" placeholder="Departement" value={internForm.departement} onChange={(e) => setInternForm({ ...internForm, departement: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Date de debut</label>
                      <input className="portal-input" type="date" value={internForm.dateDebut} onChange={(e) => setInternForm({ ...internForm, dateDebut: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Date de fin</label>
                      <input className="portal-input" type="date" value={internForm.dateFin} onChange={(e) => setInternForm({ ...internForm, dateFin: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Tuteur</label>
                      <select className="portal-input" value={internForm.tuteur} onChange={(e) => setInternForm({ ...internForm, tuteur: e.target.value })}>
                        <option value="">— Aucun —</option>
                        {admins.filter((a) => a._id !== userId).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Ecole / Universite</label>
                      <input className="portal-input" placeholder="Ecole" value={internForm.ecole} onChange={(e) => setInternForm({ ...internForm, ecole: e.target.value })} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>Formation</label>
                      <input className="portal-input" placeholder="Formation" value={internForm.formation} onChange={(e) => setInternForm({ ...internForm, formation: e.target.value })} />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--text-muted)' }}>Jours de présence</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((jour) => {
                          const checked = internForm.joursPresence.includes(jour)
                          return (
                            <span key={jour} onClick={() => {
                              const next = checked ? internForm.joursPresence.filter((j) => j !== jour) : [...internForm.joursPresence, jour]
                              setInternForm({ ...internForm, joursPresence: next })
                            }} style={{ cursor: 'pointer', padding: '5px 12px', borderRadius: 6, background: checked ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${checked ? '#0ea5e9' : 'rgba(255,255,255,0.1)'}`, fontSize: 13, color: checked ? '#0ea5e9' : 'rgba(255,255,255,0.5)', userSelect: 'none', transition: 'all 0.15s' }}>
                              {jour.charAt(0).toUpperCase() + jour.slice(1)}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label onClick={() => setInternForm({ ...internForm, inclureEquipe: !internForm.inclureEquipe })} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                        <div style={{ width: 36, height: 20, borderRadius: 10, background: internForm.inclureEquipe ? '#0ea5e9' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: 2, left: internForm.inclureEquipe ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                        </div>
                        <span style={{ fontSize: 13, color: internForm.inclureEquipe ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                          Inclure dans la gestion équipe
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
              Nouveau mot de passe (optionnel)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="portal-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Laisser vide pour ne pas changer"
                value={form.password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: event.target.value })}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          <div className="admin-button-group">
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? 'Mise à jour...' : 'Enregistrer'}
            </button>
            <button className="portal-button secondary" type="button" onClick={() => navigate('/admin/comptes-admin')}>
              Retour
            </button>
          </div>
        </form>
      </div>

    </div>
  )
}

export default AdminEdit
