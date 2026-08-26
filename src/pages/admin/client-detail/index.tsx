import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { useTabState } from '../../../hooks/useTabState'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import {
  archiveAdminClient,
  createAdminClientContact,
  createAdminClientNote,
  getAdminClient,
  getAdminClientBillingSummary,
  getAdminClientCloud,
  getAdminClientProgress,
  listAdminClientActivities,
  listAdminClientBillingDocuments,
  listAdminClientContacts,
  listAdminClientDeliverables,
  listAdminClientNotes,
  listAdminClientProjects,
  listAdminClientFiles,
  reactivateAdminClient,
  updateAdminClient,
  deleteAdminClientContact,
  deleteAdminClientNote,
} from '../../../services/adminClients'
import type {
  Client,
  Contact,
  ContactDraft,
  Note,
  Activity,
  BillingSummary,
  BillingDocument,
  Deliverable,
  CloudInfo,
} from '../../../types/client.types'
import type { Project } from '../../../types/project.types'
import type { AdminClientFile } from '../../../services/adminClients'
import type { NoteOrActivity } from './types'
import { TABS } from './types'
import OverviewTab from './OverviewTab'
import CloudTab from './CloudTab'
import ProjectsTab from './ProjectsTab'
import DeliverablesTab from './DeliverablesTab'
import ContactsTab from './ContactsTab'
import NotesTab from './NotesTab'
import BillingTab from './BillingTab'
import FilesTab from './FilesTab'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

const ClientAccountDetail = () => {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { userId } = useParams<{ userId: string }>()

  const [activeTab, setActiveTab] = useTabState('overview')
  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [progress, setProgress] = useState<{ progressPercent?: number } | null>(null)
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null)
  const [billingDocuments, setBillingDocuments] = useState<BillingDocument[]>([])
  const [cloudInfo, setCloudInfo] = useState<CloudInfo | null>(null)
  const [files, setFiles] = useState<AdminClientFile[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>('')
  const [saving, setSaving] = useState<boolean>(false)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [impersonating, setImpersonating] = useState(false)
  const [resettingClient, setResettingClient] = useState(false)

  const [contactDraft, setContactDraft] = useState<ContactDraft>({ firstName: '', lastName: '', email: '', phone: '' })
  const [noteDraft, setNoteDraft] = useState<string>('')

  const canArchive = user?.role === 'SUPER_ADMIN'

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
    let pwd = ''
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    return pwd
  }

  const handleResetClientPassword = async () => {
    const newPwd = generatePassword()
    setResetting(true)
    setEmailSent(false)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/clients/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPwd }),
      })
      setGeneratedPassword(newPwd)
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur reinitialisation')
    } finally {
      setResetting(false)
    }
  }

  const handleCopyClientCredentials = async () => {
    if (!client || !generatedPassword) return
    const text = `Identifiants de connexion Venio\n\nEmail : ${client.email}\nMot de passe : ${generatedPassword}\n\nConnexion : ${window.location.origin}/login`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSendClientEmail = async () => {
    if (!generatedPassword) return
    setSending(true)
    setEmailError('')
    try {
      await apiFetch(`/api/admin/clients/${userId}/send-credentials`, {
        method: 'POST',
        body: JSON.stringify({ password: generatedPassword }),
      })
      setEmailSent(true)
    } catch (err: unknown) {
      setEmailError((err as Error).message || "Erreur lors de l'envoi")
    } finally {
      setSending(false)
    }
  }

  const handleImpersonateClient = async () => {
    setImpersonating(true)
    try {
      await apiFetch(`/api/admin/admins/impersonate/${userId}`, {
        method: 'POST',
      })
      window.location.assign('/espace-client')
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur', 'error')
    } finally {
      setImpersonating(false)
    }
  }

  const handleResetLinkClient = async () => {
    setResettingClient(true)
    try {
      const data = await apiFetch<{ resetUrl: string }>(`/api/admin/admins/${userId}/reset-link`, { method: 'POST' })
      await navigator.clipboard.writeText(data.resetUrl)
      showToast('Lien de reinitialisation copie dans le presse-papiers', 'success')
    } catch (err: unknown) {
      showToast((err as Error).message || 'Erreur', 'error')
    } finally {
      setResettingClient(false)
    }
  }

  const loadAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [
        clientRes,
        projectsRes,
        progressRes,
        deliverablesRes,
        contactsRes,
        notesRes,
        activitiesRes,
        billingSummaryRes,
        billingDocumentsRes,
        cloudRes,
        filesRes,
      ] = (await Promise.all([
        getAdminClient(userId!),
        listAdminClientProjects(userId!),
        getAdminClientProgress(userId!),
        listAdminClientDeliverables(userId!),
        listAdminClientContacts(userId!),
        listAdminClientNotes(userId!),
        listAdminClientActivities(userId!),
        getAdminClientBillingSummary(userId!).catch(() => ({ summary: null })),
        listAdminClientBillingDocuments(userId!).catch(() => ({ documents: [] })),
        getAdminClientCloud(userId!).catch(() => ({ cloud: null })),
        listAdminClientFiles(userId!).catch(() => ({ files: [] })),
      ])) as [
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
      ]

      setClient((clientRes.client as Client) || null)
      setProjects((projectsRes.projects as Project[]) || [])
      setProgress((progressRes as { progressPercent?: number }) || null)
      setDeliverables((deliverablesRes.deliverables as Deliverable[]) || [])
      setContacts((contactsRes.contacts as Contact[]) || [])
      setNotes((notesRes.notes as Note[]) || [])
      setActivities((activitiesRes.activities as Activity[]) || [])
      setBillingSummary((billingSummaryRes.summary as BillingSummary) || null)
      setBillingDocuments((billingDocumentsRes.documents as BillingDocument[]) || [])
      setCloudInfo((cloudRes.cloud as CloudInfo) || null)
      setFiles((filesRes.files as AdminClientFile[]) || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur chargement compte')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [userId])

  const notesAndActivities = useMemo<NoteOrActivity[]>(() => {
    const fromNotes: NoteOrActivity[] = notes.map((note) => ({
      _id: `note-${note._id}`,
      createdAt: note.createdAt,
      label: note.content,
      type: 'NOTE',
      actor: note.createdBy?.name || 'Admin',
      pinned: Boolean(note.pinned),
      rawId: note._id,
    }))

    const fromActivities: NoteOrActivity[] = activities.map((activity) => ({
      _id: `activity-${activity._id}`,
      createdAt: activity.createdAt,
      label: activity.label,
      type: activity.type,
      actor: activity.actorId?.name || 'System',
      pinned: false,
      rawId: activity._id,
    }))

    return [...fromNotes, ...fromActivities].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [notes, activities])

  const saveClientPatch = async (patch: Record<string, unknown>) => {
    setSaving(true)
    setError('')
    try {
      const data = (await updateAdminClient(userId!, patch)) as Record<string, unknown>
      setClient(data.client as Client)
      showToast('Modifications enregistrees', 'success')
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour')
      showToast('Erreur lors de la mise a jour', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveToggle = async () => {
    if (!canArchive) return
    setSaving(true)
    setError('')
    try {
      const data = (
        client?.status === 'ARCHIVE' ? await reactivateAdminClient(userId!) : await archiveAdminClient(userId!)
      ) as Record<string, unknown>
      setClient(data.client as Client)
      await loadAll()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur archivage')
    } finally {
      setSaving(false)
    }
  }

  const addContact = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!contactDraft.firstName.trim()) return
    setSaving(true)
    setError('')
    try {
      await createAdminClientContact(userId!, { ...contactDraft, isMain: contacts.length === 0 })
      setContactDraft({ firstName: '', lastName: '', email: '', phone: '' })
      const data = (await listAdminClientContacts(userId!)) as Record<string, unknown>
      setContacts((data.contacts as Contact[]) || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur ajout contact')
    } finally {
      setSaving(false)
    }
  }

  const removeContact = async (contactId: string) => {
    setSaving(true)
    setError('')
    try {
      await deleteAdminClientContact(userId!, contactId)
      setContacts((current) => current.filter((contact) => contact._id !== contactId))
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression contact')
    } finally {
      setSaving(false)
    }
  }

  const addNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!noteDraft.trim()) return
    setSaving(true)
    setError('')
    try {
      await createAdminClientNote(userId!, { content: noteDraft.trim() })
      setNoteDraft('')
      const [notesRes, activitiesRes] = (await Promise.all([
        listAdminClientNotes(userId!),
        listAdminClientActivities(userId!),
      ])) as [Record<string, unknown>, Record<string, unknown>]
      setNotes((notesRes.notes as Note[]) || [])
      setActivities((activitiesRes.activities as Activity[]) || [])
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur ajout note')
    } finally {
      setSaving(false)
    }
  }

  const removeNote = async (noteId: string) => {
    setSaving(true)
    setError('')
    try {
      await deleteAdminClientNote(userId!, noteId)
      setNotes((current) => current.filter((note) => note._id !== noteId))
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression note')
    } finally {
      setSaving(false)
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
          <span style={{ color: 'var(--text-primary)' }}>{client?.companyName || client?.name || 'Chargement...'}</span>
        </div>

        {client && (
          <div className="admin-header" style={{ marginBottom: 16 }}>
            <div>
              <h1 style={{ marginBottom: 8 }}>{client.companyName || client.name || 'Société non renseignée'}</h1>
              {client.serviceType && (
                <p style={{ color: 'var(--text-primary)', margin: '0 0 4px 0', fontWeight: 600 }}>
                  Service : {client.serviceType}
                </p>
              )}
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Contact : {client.name}</p>
              <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{client.email}</p>
            </div>
            <div className="admin-actions">
              <Link
                className="portal-button portal-action-link"
                to={`/admin/projets/nouveau?clientId=${userId}`}
                title="Ajouter un projet"
              >
                <span className="portal-action-icon" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    stroke="currentColor"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="16" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </span>
                <span className="portal-action-label">Ajouter un projet</span>
              </Link>
              {canArchive && (
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={handleArchiveToggle}
                  disabled={saving}
                >
                  {client.status === 'ARCHIVE' ? 'Réactiver' : 'Archiver'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="admin-tabs" style={{ marginTop: 20 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="admin-error" style={{ marginTop: 24 }}>
          {error}
        </div>
      )}

      <div className="portal-card" style={{ marginTop: 24 }}>
        {loading ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Chargement...</p>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewTab
                client={client}
                setClient={setClient}
                progress={progress}
                projects={projects}
                deliverables={deliverables}
                billingSummary={billingSummary}
                saveClientPatch={saveClientPatch}
              />
            )}

            {activeTab === 'cloud' && <CloudTab cloudInfo={cloudInfo} />}

            {activeTab === 'projects' && <ProjectsTab projects={projects} />}

            {activeTab === 'deliverables' && <DeliverablesTab deliverables={deliverables} />}

            {activeTab === 'contacts' && (
              <ContactsTab
                contacts={contacts}
                contactDraft={contactDraft}
                setContactDraft={setContactDraft}
                addContact={addContact}
                removeContact={removeContact}
                saving={saving}
              />
            )}

            {activeTab === 'notes' && (
              <NotesTab
                notesAndActivities={notesAndActivities}
                noteDraft={noteDraft}
                setNoteDraft={setNoteDraft}
                addNote={addNote}
                removeNote={removeNote}
                saving={saving}
              />
            )}

            {activeTab === 'files' && <FilesTab files={files} clientId={userId!} />}

            {activeTab === 'billing' && (
              <BillingTab billingSummary={billingSummary} billingDocuments={billingDocuments} />
            )}
          </>
        )}
      </div>

      <div className="portal-card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16 }}>Identifiants de connexion</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          Generez un nouveau mot de passe pour ce client. Vous pourrez ensuite le copier ou l'envoyer par email.
        </p>

        {generatedPassword ? (
          <>
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
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Email</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>
                  {client?.email}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nouveau mot de passe</span>
                <span style={{ color: 'var(--primary)', fontWeight: 600, fontFamily: 'monospace', fontSize: 14 }}>
                  {generatedPassword}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                className="portal-button"
                type="button"
                onClick={handleCopyClientCredentials}
                style={{ flex: 1, minWidth: 160 }}
              >
                {copied ? 'Copie !' : 'Copier les identifiants'}
              </button>
              <button
                className="portal-button secondary"
                type="button"
                onClick={handleSendClientEmail}
                disabled={sending || emailSent}
                style={{ flex: 1, minWidth: 160 }}
              >
                {emailSent ? 'Email envoye !' : sending ? 'Envoi...' : 'Envoyer par email'}
              </button>
              <button
                className="portal-button secondary"
                type="button"
                onClick={handleResetClientPassword}
                disabled={resetting}
                style={{ flex: 1, minWidth: 160 }}
              >
                {resetting ? 'Generation...' : 'Regenerer'}
              </button>
            </div>
            {emailError && (
              <div className="admin-error" style={{ marginTop: 12 }}>
                {emailError}
              </div>
            )}
          </>
        ) : (
          <button className="portal-button" type="button" onClick={handleResetClientPassword} disabled={resetting}>
            {resetting ? 'Generation...' : 'Generer un nouveau mot de passe'}
          </button>
        )}
        {user?.role === 'SUPER_ADMIN' && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
            <button
              className="portal-button secondary"
              type="button"
              onClick={handleImpersonateClient}
              disabled={impersonating}
              style={{ width: '100%' }}
            >
              {impersonating ? 'Connexion...' : 'Se connecter en tant que ce client'}
            </button>
            <button
              className="portal-button secondary"
              type="button"
              onClick={handleResetLinkClient}
              disabled={resettingClient}
              style={{ width: '100%', marginTop: 8 }}
            >
              {resettingClient ? 'Generation...' : 'Copier lien reinitialisation mdp'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientAccountDetail
