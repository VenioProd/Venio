import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import FormField from '../../components/FormField'
import { useFormValidation } from '../../hooks/useFormValidation'
import type { ValidationSchema } from '../../hooks/useFormValidation'
import { CRM_SERVICE_TYPES } from '../../lib/formatUtils'
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
  const navigate = useNavigate()
  const [admins, setAdmins] = useState<AdminUser[]>([])
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
      navigate(`/admin/comptes-clients/${data.client._id}`)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur creation compte')
    } finally {
      setLoading(false)
    }
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
              <input
                className="portal-input"
                type="password"
                placeholder="Mot de passe sécurisé"
                value={form.password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: event.target.value })}
                onBlur={() => handleBlur('password')}
              />
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
