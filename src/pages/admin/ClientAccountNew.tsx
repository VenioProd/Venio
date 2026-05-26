import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import type { ValidationSchema } from '../../hooks/useFormValidation'
import { CRM_SERVICE_TYPES } from '../../lib/formatUtils'
import { useToast } from '../../context/ToastContext'
import { createAdminClient } from '../../services/adminClients'
import type { AdminUser } from '../../types/crm.types'
import type { Client } from '../../types/client.types'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'

type ClientFormField = 'companyName' | 'name' | 'email' | 'password'

const clientValidationSchema: ValidationSchema<ClientFormField> = {
  companyName: [{ type: 'required', message: 'Le nom de la société est requis.' }],
  name: [{ type: 'required', message: 'Le nom du contact est requis.' }],
  email: [
    { type: 'required', message: "L'email est requis." },
    { type: 'email', message: 'Adresse email invalide.' },
  ],
  password: [
    { type: 'required', message: 'Le mot de passe est requis.' },
    { type: 'minLength', value: 6, message: 'Minimum 6 caractères.' },
  ],
}

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

  const { showToast } = useToast()
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
  const [createdClient, setCreatedClient] = useState<{ id: string; name: string; email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const { errors: fieldErrors, validate, validateField } = useFormValidation<ClientFormField>(clientValidationSchema)

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
    const text = `Identifiants de connexion Venio\n\nEmail : ${createdClient.email}\nMot de passe : ${createdClient.password}\n\nConnexion : ${window.location.origin}/login`
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
      const data = await createAdminClient(payload) as { client: Client }
      setCreatedClient({ id: data.client._id, name: form.name, email: form.email, password: form.password })
      showToast('Compte client cree avec succes', 'success')
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur creation compte')
      showToast('Erreur lors de la creation', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (createdClient) {
    return (
      <div className="portal-container">
        <div className="portal-card">
          <div className="admin-breadcrumb">
            <Link to="/admin">Admin</Link>
            <span>/</span>
            <Link to="/admin/comptes-clients">Comptes clients</Link>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)' }}>Compte cree</span>
          </div>
          <h1>Compte client cree avec succes</h1>
        </div>

        <div className="portal-card" style={{ marginTop: 24 }}>
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, fontSize: 14 }}>
              Le compte de <strong style={{ color: 'var(--text-primary)' }}>{createdClient.name}</strong> a ete cree. Voici ses identifiants de connexion :
            </p>

            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 10, padding: 20, border: '1px solid var(--border-color)', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Email</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>{createdClient.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Mot de passe</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>{createdClient.password}</span>
              </div>
            </div>

            <button
              className="portal-button"
              type="button"
              onClick={handleCopyCredentials}
              style={{ width: '100%' }}
            >
              {copied ? 'Copie !' : 'Copier les identifiants'}
            </button>

            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <Link className="portal-button" to={`/admin/comptes-clients/${createdClient.id}`} style={{ textAlign: 'center', flex: 1 }}>
                Voir le profil
              </Link>
              <Link className="portal-button secondary" to="/admin/comptes-clients" style={{ textAlign: 'center', flex: 1 }}>
                Retour a la liste
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
          <Link to="/admin/comptes-clients">Comptes clients</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Nouveau compte</span>
        </div>
        <h1>Nouveau compte client</h1>
      </div>

      <div className="portal-card" style={{ marginTop: 24 }}>
        <form className="portal-list" onSubmit={handleSubmit}>
          <div className="portal-grid">
            <FormField label="Société (nom de l'entreprise)" error={fieldErrors.companyName} required>
              <input
                className="portal-input"
                placeholder="Nom de la société"
                value={form.companyName}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, companyName: event.target.value })}
                onBlur={() => handleBlur('companyName')}
              />
            </FormField>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>Service (pour lequel le client paie)</label>
              <CustomSelect className="portal-input" value={form.serviceType} onChange={(v) => setForm({ ...form, serviceType: v })} options={[{ value: '', label: '—' }, ...CRM_SERVICE_TYPES.map((s) => ({ value: s, label: s }))]} />
            </div>
            <FormField label="Nom du contact" error={fieldErrors.name} required>
              <input
                className="portal-input"
                placeholder="Nom complet"
                value={form.name}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, name: event.target.value })}
                onBlur={() => handleBlur('name')}
              />
            </FormField>
            <FormField label="Email" error={fieldErrors.email} required>
              <input
                className="portal-input"
                type="email"
                placeholder="email@exemple.com"
                value={form.email}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: event.target.value })}
                onBlur={() => handleBlur('email')}
              />
            </FormField>
            <FormField label="Mot de passe" error={fieldErrors.password} required>
              <div style={{ position: 'relative' }}>
                <input
                  className="portal-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mot de passe sécurisé"
                  value={form.password}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: event.target.value })}
                  onBlur={() => handleBlur('password')}
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
            </FormField>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>Téléphone</label>
              <input
                className="portal-input"
                placeholder="+33 ..."
                value={form.phone}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, phone: event.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>Site web</label>
              <input
                className="portal-input"
                placeholder="https://..."
                value={form.website}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, website: event.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>Source</label>
              <CustomSelect className="portal-input" value={form.source} onChange={(v) => setForm({ ...form, source: v })} options={SOURCE_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>Owner interne</label>
              <CustomSelect className="portal-input" value={form.ownerAdminId} onChange={(v) => setForm({ ...form, ownerAdminId: v })} options={[{ value: '', label: 'Non assigné' }, ...admins.map((a) => ({ value: a._id, label: `${a.name} (${a.role})` }))]} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: 'var(--text-secondary)' }}>Tags (séparés par des virgules)</label>
              <input
                className="portal-input"
                placeholder="premium, urgent, saas"
                value={form.tagsRaw}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, tagsRaw: event.target.value })}
              />
            </div>
          </div>

          {error && <div className="admin-error">{error}</div>}
          <div className="admin-button-group">
            <button className="portal-button" type="submit" disabled={loading}>
              {loading ? 'Création...' : 'Créer le compte'}
            </button>
            <Link className="portal-button secondary" to="/admin/comptes-clients">
              Annuler
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ClientAccountNew
