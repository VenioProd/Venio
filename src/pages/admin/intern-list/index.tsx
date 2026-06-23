import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import {
  STATUS_CONFIG,
  REPORT_STATUS_CONFIG,
  formatDate,
  formatDateTime,
  formatFileSize,
  isImage,
  daysRemaining,
} from './types'
import type { Intern, ActivityReport } from './types'
import InternKpi from '../../../components/admin/InternKpi'
import InternDocuments from '../../../components/admin/InternDocuments'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import ParametresTab from './ParametresTab'
import ReportBody from './ReportBody'
import DashboardTab from './DashboardTab'
import ReportsTab from './ReportsTab'

const InternList = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const { confirm, ConfirmDialog } = useConfirm()
  const [searchParams] = useSearchParams()

  // ── Tabs ──
  const navigate = useNavigate()
  const initialTab =
    (searchParams.get('tab') as
      | 'dashboard'
      | 'stagiaires'
      | 'rapports'
      | 'kpis'
      | 'documents'
      | 'mes-rapports'
      | 'parametres') || (isSuperAdmin ? 'dashboard' : 'mes-rapports')
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'stagiaires' | 'rapports' | 'kpis' | 'documents' | 'mes-rapports' | 'parametres'
  >(initialTab)

  // ── Stagiaires ──
  const [interns, setInterns] = useState<Intern[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingIntern, setEditingIntern] = useState<Intern | null>(null)
  const [expandedIntern, setExpandedIntern] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [submitting, setSubmitting] = useState(false)

  // ── Modal commentaire ──
  const [commentModal, setCommentModal] = useState<{ reportId: string; status: string } | null>(null)
  const [commentText, setCommentText] = useState('')

  // ── Vue rapports : liste ou kanban ──
  const [reportView, setReportView] = useState<'liste' | 'kanban'>('liste')
  const [draggedReportId, setDraggedReportId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    type: 'STAGIAIRE' as 'STAGIAIRE' | 'ALTERNANT',
    poste: '',
    departement: '',
    dateDebut: '',
    dateFin: '',
    tuteur: '',
    ecole: '',
    formation: '',
    notes: '',
    joursPresence: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] as string[],
  })

  // ── Rapports ──
  const [reports, setReports] = useState<ActivityReport[]>([])
  const [myReports, setMyReports] = useState<ActivityReport[]>([])
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportForm, setReportForm] = useState({
    date: new Date().toISOString().split('T')[0],
    contenu: '',
    taches: '',
  })
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const reportFileRef = useRef<HTMLInputElement>(null)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)

  // ── Dashboard ──
  const [dashboard, setDashboard] = useState<any[]>([])
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [reminderLogs, setReminderLogs] = useState<any[]>([])
  const [sendingReminders, setSendingReminders] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ sent: number; details?: any } | null>(null)

  // ── Admins pour tuteur ──
  const [admins, setAdmins] = useState<{ _id: string; name: string; role: string }[]>([])

  // ── Paramètres notifs rapports ──
  const [notifRecipients, setNotifRecipients] = useState<{ _id: string; name: string; email: string; role: string }[]>(
    [],
  )
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSuccess, setNotifSuccess] = useState(false)

  // ── Intern identifie ──
  const [myIntern, setMyIntern] = useState<Intern | null>(null)

  // ── Load data ──
  const loadInterns = useCallback(async () => {
    try {
      const data = await apiFetch<Intern[]>('/api/admin/interns')
      setInterns(data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [])

  const loadReports = useCallback(async () => {
    try {
      const data = await apiFetch<ActivityReport[]>('/api/admin/interns/reports/all')
      setReports(data)
    } catch {
      /* silent */
    }
  }, [])

  const loadMyReports = useCallback(async () => {
    try {
      const data = await apiFetch<ActivityReport[]>('/api/admin/interns/reports/mine')
      setMyReports(data)
      setMyIntern({} as Intern) // marque qu'on est stagiaire
    } catch {
      setMyIntern(null)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true)
    try {
      const [data, logsResult] = await Promise.allSettled([
        apiFetch<any[]>('/api/admin/interns/dashboard'),
        apiFetch<{ logs: any[] }>('/api/admin/interns/reminder-logs'),
      ])
      if (data.status === 'fulfilled') setDashboard(data.value)
      if (logsResult.status === 'fulfilled') setReminderLogs(logsResult.value.logs || [])
    } catch {
      /* silent */
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  const loadAdmins = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: { _id: string; name: string; role: string }[] }>('/api/admin/admins')
      setAdmins(data.users || [])
    } catch {
      /* silent */
    }
  }, [])

  const loadNotifSettings = useCallback(async () => {
    try {
      const data = await apiFetch<{ recipients: { _id: string; name: string; email: string; role: string }[] }>(
        '/api/admin/interns/settings/report-notifs',
      )
      setNotifRecipients(data.recipients || [])
    } catch {
      /* silent */
    }
  }, [])

  useEffect(() => {
    loadInterns()
    loadAdmins()
    loadMyReports()
    if (isSuperAdmin) loadNotifSettings()
  }, [])

  useEffect(() => {
    if (activeTab === 'rapports' && isAdmin) loadReports()
    if (activeTab === 'dashboard' && isAdmin) loadDashboard()
  }, [activeTab])

  // Charger le dashboard au mount si c'est l'onglet par defaut
  useEffect(() => {
    if (initialTab === 'dashboard' && isAdmin) loadDashboard()
  }, [])

  // ── Filtered interns ──
  const filteredInterns = interns.filter((i) => filterStatus === 'all' || i.status === filterStatus)

  // ── Intern CRUD ──
  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      phone: '',
      password: '',
      type: 'STAGIAIRE',
      poste: '',
      departement: '',
      dateDebut: '',
      dateFin: '',
      tuteur: '',
      ecole: '',
      formation: '',
      notes: '',
      joursPresence: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
    })
    setEditingIntern(null)
    setShowForm(false)
  }

  const handleCreateIntern = async () => {
    if (!form.name || !form.email || !form.poste || !form.dateDebut || !form.dateFin) return
    setSubmitting(true)
    try {
      await apiFetch('/api/admin/interns', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          tuteur: form.tuteur || undefined,
        }),
      })
      resetForm()
      loadInterns()
    } catch (err: any) {
      alert(err.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditIntern = (intern: Intern) => {
    setEditingIntern(intern)
    setForm({
      name: intern.userId.name,
      email: intern.userId.email,
      phone: intern.userId.phone || '',
      password: '',
      type: intern.type || 'STAGIAIRE',
      poste: intern.poste,
      departement: intern.departement,
      dateDebut: intern.dateDebut.split('T')[0],
      dateFin: intern.dateFin.split('T')[0],
      tuteur: intern.tuteur?._id || '',
      ecole: intern.ecole,
      formation: intern.formation,
      notes: intern.notes,
      joursPresence: intern.joursPresence?.length
        ? intern.joursPresence
        : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
    })
    setShowForm(true)
  }

  const handleUpdateIntern = async () => {
    if (!editingIntern) return
    setSubmitting(true)
    try {
      await apiFetch(`/api/admin/interns/${editingIntern._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          poste: form.poste,
          departement: form.departement,
          dateDebut: form.dateDebut,
          dateFin: form.dateFin,
          tuteur: form.tuteur || null,
          ecole: form.ecole,
          formation: form.formation,
          notes: form.notes,
          joursPresence: form.joursPresence,
        }),
      })
      resetForm()
      loadInterns()
    } catch (err: any) {
      alert(err.message || 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStatusChange = async (internId: string, status: string) => {
    try {
      await apiFetch(`/api/admin/interns/${internId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      loadInterns()
    } catch {
      /* silent */
    }
  }

  const handleTypeChange = async (internId: string, type: 'STAGIAIRE' | 'ALTERNANT') => {
    setInterns((prev) => prev.map((i) => (i._id === internId ? { ...i, type } : i)))
    try {
      await apiFetch(`/api/admin/interns/${internId}`, {
        method: 'PATCH',
        body: JSON.stringify({ type }),
      })
    } catch {
      loadInterns() // revert on error
    }
  }

  const handleDeleteIntern = async (internId: string) => {
    const ok = await confirm({
      message: 'Supprimer definitivement ce stagiaire et tous ses rapports ?',
      title: 'Suppression',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/${internId}`, { method: 'DELETE' })
      loadInterns()
    } catch {
      /* silent */
    }
  }

  const [resendingCredentials, setResendingCredentials] = useState<string | null>(null)
  const handleResendCredentials = async (internId: string) => {
    setResendingCredentials(internId)
    try {
      await apiFetch(`/api/admin/interns/${internId}/resend-credentials`, { method: 'POST' })
      alert('Nouveaux identifiants envoyes par email')
    } catch (err: unknown) {
      alert((err as Error).message || "Erreur lors de l'envoi")
    } finally {
      setResendingCredentials(null)
    }
  }

  // ── Report CRUD ──
  const handleCreateReport = async () => {
    if (!reportForm.contenu) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('date', reportForm.date)
      fd.append('contenu', reportForm.contenu)
      if (reportForm.taches) {
        const tachesArr = reportForm.taches.split('\n').filter((t) => t.trim())
        fd.append('taches', JSON.stringify(tachesArr))
      }
      reportFiles.forEach((f) => fd.append('files', f))

      await fetch('/api/admin/interns/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })

      setReportForm({ date: new Date().toISOString().split('T')[0], contenu: '', taches: '' })
      setReportFiles([])
      setShowReportForm(false)
      loadMyReports()
      if (isAdmin) loadReports()
    } catch {
      /* silent */
    } finally {
      setSubmitting(false)
    }
  }

  const handleValidateReport = async (reportId: string, status: string, commentaire?: string) => {
    try {
      const fd = new FormData()
      fd.append('status', status)
      if (commentaire !== undefined) fd.append('commentaireAdmin', commentaire)
      await fetch(`/api/admin/interns/reports/${reportId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      loadReports()
    } catch {
      /* silent */
    }
  }

  const handleSubmitComment = async () => {
    if (!commentModal) return
    await handleValidateReport(commentModal.reportId, commentModal.status, commentText)
    setCommentModal(null)
    setCommentText('')
  }

  const handleDeleteReport = async (reportId: string) => {
    const ok = await confirm({ message: 'Supprimer ce rapport ?', title: 'Suppression', variant: 'danger' })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/reports/${reportId}`, { method: 'DELETE' })
      loadMyReports()
      if (isAdmin) loadReports()
    } catch {
      /* silent */
    }
  }

  // ── Render ──
  if (loading)
    return (
      <div className="portal-container" style={{ padding: '60px 20px', textAlign: 'center', color: '#fff' }}>
        Chargement...
      </div>
    )

  const tabs = [
    { key: 'dashboard', label: 'Tableau de bord', count: dashboard.length },
    { key: 'stagiaires', label: 'Équipe', count: interns.length },
    { key: 'rapports', label: 'Tous les rapports', count: reports.length },
    { key: 'kpis', label: 'KPIs', count: null as number | null },
    { key: 'documents', label: 'Documents', count: null as number | null },
    ...(isSuperAdmin ? [{ key: 'parametres', label: 'Paramètres', count: null as number | null }] : []),
  ]

  const effectiveTab = activeTab

  return (
    <div className="portal-container">
      {ConfirmDialog}

      {/* Modal commentaire */}
      {commentModal && (
        <div className="confirm-modal-overlay" onClick={() => setCommentModal(null)}>
          <div
            className="confirm-modal confirm-modal--info"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirm-modal__header">
              <h2 className="confirm-modal__title">Commentaire pour le stagiaire</h2>
              <button
                className="confirm-modal__close"
                onClick={() => setCommentModal(null)}
                type="button"
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="confirm-modal__body">
              <div className="ticket-form-field">
                <label>Votre commentaire</label>
                <textarea
                  rows={4}
                  placeholder="Ecrivez votre retour sur le rapport..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="confirm-modal__footer">
              <button
                className="confirm-modal__btn confirm-modal__btn--cancel"
                onClick={() => setCommentModal(null)}
                type="button"
              >
                Annuler
              </button>
              <button
                className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
                onClick={handleSubmitComment}
                type="button"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="ticket-hero">
        <div className="ticket-hero-content">
          <Link to="/admin" className="ticket-back-btn">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour au dashboard
          </Link>
          <h1 className="ticket-hero-title">Gestion de l'équipe</h1>
        </div>
        <button
          className="ticket-new-btn"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          + Nouveau membre
        </button>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="ticket-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`ticket-tab ${effectiveTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key as any)}
            >
              {t.label} {t.count !== null && <span className="ticket-tab-badge">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ═══ TAB: Tableau de bord ═══ */}
      {effectiveTab === 'dashboard' && isAdmin && (
        <DashboardTab
          dashboard={dashboard}
          dashboardLoading={dashboardLoading}
          reminderResult={reminderResult}
          setReminderResult={setReminderResult}
          sendingReminders={sendingReminders}
          setSendingReminders={setSendingReminders}
          reminderLogs={reminderLogs}
          interns={interns}
          isSuperAdmin={isSuperAdmin}
          loadDashboard={loadDashboard}
          navigate={navigate}
        />
      )}

      {/* ═══ TAB: Stagiaires ═══ */}
      {effectiveTab === 'stagiaires' && isAdmin && (
        <>
          {/* Filtres status */}
          <div className="ticket-stats" style={{ marginBottom: 16 }}>
            {['all', 'ACTIF', 'TERMINE', 'ANNULE'].map((s) => {
              const label = s === 'all' ? 'Tous' : STATUS_CONFIG[s]?.label || s
              const color = s === 'all' ? 'var(--primary)' : STATUS_CONFIG[s]?.color || '#fff'
              const count = s === 'all' ? interns.length : interns.filter((i) => i.status === s).length
              return (
                <button
                  key={s}
                  className={`ticket-stat-card ${filterStatus === s ? 'active' : ''}`}
                  style={{ borderColor: filterStatus === s ? color : 'transparent' }}
                  onClick={() => setFilterStatus(s)}
                >
                  <span style={{ color, fontWeight: 700, fontSize: 22 }}>{count}</span>{' '}
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{label}</span>
                </button>
              )
            })}
          </div>

          {/* Formulaire creation/edition */}
          {showForm && (
            <div className="portal-card" style={{ marginTop: 16, marginBottom: 20 }}>
              <div className="ticket-form">
                <h3 style={{ margin: '0 0 16px', color: 'var(--primary)' }}>
                  {editingIntern ? 'Modifier' : 'Nouveau'} {form.type === 'ALTERNANT' ? 'alternant' : 'stagiaire'}
                </h3>
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Type *</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as 'STAGIAIRE' | 'ALTERNANT' })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'inherit',
                        fontSize: 14,
                      }}
                    >
                      <option value="STAGIAIRE">Stagiaire</option>
                      <option value="ALTERNANT">Alternant</option>
                    </select>
                  </div>
                  <div className="ticket-form-field">
                    <label>Nom complet *</label>
                    <input
                      placeholder="Nom complet"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={!!editingIntern}
                    />
                  </div>
                  <div className="ticket-form-field">
                    <label>Email *</label>
                    <input
                      type="email"
                      placeholder="Email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      disabled={!!editingIntern}
                    />
                  </div>
                </div>
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Telephone</label>
                    <input
                      placeholder="Telephone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      disabled={!!editingIntern}
                    />
                  </div>
                  {!editingIntern ? (
                    <div className="ticket-form-field">
                      <label>Mot de passe</label>
                      <input
                        type="password"
                        placeholder="Defaut: Stage2026!"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                      />
                    </div>
                  ) : (
                    <div className="ticket-form-field">
                      <label>Poste / Mission *</label>
                      <input
                        placeholder="Poste / Mission"
                        value={form.poste}
                        onChange={(e) => setForm({ ...form, poste: e.target.value })}
                      />
                    </div>
                  )}
                </div>
                {!editingIntern && (
                  <div className="ticket-form-row">
                    <div className="ticket-form-field">
                      <label>Poste / Mission *</label>
                      <input
                        placeholder="Poste / Mission"
                        value={form.poste}
                        onChange={(e) => setForm({ ...form, poste: e.target.value })}
                      />
                    </div>
                    <div className="ticket-form-field">
                      <label>Departement</label>
                      <input
                        placeholder="Departement"
                        value={form.departement}
                        onChange={(e) => setForm({ ...form, departement: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {editingIntern && (
                  <div className="ticket-form-row">
                    <div className="ticket-form-field">
                      <label>Departement</label>
                      <input
                        placeholder="Departement"
                        value={form.departement}
                        onChange={(e) => setForm({ ...form, departement: e.target.value })}
                      />
                    </div>
                    <div className="ticket-form-field">
                      <label>Tuteur</label>
                      <select value={form.tuteur} onChange={(e) => setForm({ ...form, tuteur: e.target.value })}>
                        <option value="">-- Tuteur --</option>
                        {admins.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Date de debut *</label>
                    <input
                      type="date"
                      value={form.dateDebut}
                      onChange={(e) => setForm({ ...form, dateDebut: e.target.value })}
                    />
                  </div>
                  <div className="ticket-form-field">
                    <label>Date de fin *</label>
                    <input
                      type="date"
                      value={form.dateFin}
                      onChange={(e) => setForm({ ...form, dateFin: e.target.value })}
                    />
                  </div>
                </div>
                {!editingIntern && (
                  <div className="ticket-form-row">
                    <div className="ticket-form-field">
                      <label>Tuteur</label>
                      <select value={form.tuteur} onChange={(e) => setForm({ ...form, tuteur: e.target.value })}>
                        <option value="">-- Tuteur --</option>
                        {admins.map((a) => (
                          <option key={a._id} value={a._id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ticket-form-field">
                      <label>Ecole / Universite</label>
                      <input
                        placeholder="Ecole / Universite"
                        value={form.ecole}
                        onChange={(e) => setForm({ ...form, ecole: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {editingIntern && (
                  <div className="ticket-form-row">
                    <div className="ticket-form-field">
                      <label>Ecole / Universite</label>
                      <input
                        placeholder="Ecole / Universite"
                        value={form.ecole}
                        onChange={(e) => setForm({ ...form, ecole: e.target.value })}
                      />
                    </div>
                    <div className="ticket-form-field">
                      <label>Formation</label>
                      <input
                        placeholder="Formation"
                        value={form.formation}
                        onChange={(e) => setForm({ ...form, formation: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {!editingIntern && (
                  <div className="ticket-form-field">
                    <label>Formation</label>
                    <input
                      placeholder="Formation"
                      value={form.formation}
                      onChange={(e) => setForm({ ...form, formation: e.target.value })}
                    />
                  </div>
                )}
                <div className="ticket-form-field">
                  <label>Notes internes</label>
                  <textarea
                    placeholder="Notes internes"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="ticket-form-field">
                  <label>Jours de présence</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((jour) => {
                      const checked = form.joursPresence.includes(jour)
                      return (
                        <label
                          key={jour}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            cursor: 'pointer',
                            padding: '4px 10px',
                            borderRadius: 6,
                            background: checked ? 'rgba(14, 165, 233, 0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${checked ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                            fontSize: 13,
                            color: checked ? 'var(--primary)' : 'rgba(255,255,255,0.6)',
                            transition: 'all 0.15s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            style={{ display: 'none' }}
                            onChange={() => {
                              const next = checked
                                ? form.joursPresence.filter((j) => j !== jour)
                                : [...form.joursPresence, jour]
                              setForm({ ...form, joursPresence: next })
                            }}
                          />
                          {jour.charAt(0).toUpperCase() + jour.slice(1)}
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button
                    className="ticket-new-btn"
                    disabled={submitting}
                    onClick={editingIntern ? handleUpdateIntern : handleCreateIntern}
                  >
                    {submitting ? 'En cours...' : editingIntern ? 'Enregistrer' : 'Creer le stagiaire'}
                  </button>
                  <button className="ticket-back-btn" onClick={resetForm}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Liste stagiaires */}
          <div className="ticket-list">
            {filteredInterns.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun membre</p>
            )}
            {filteredInterns.map((intern) => {
              const expanded = expandedIntern === intern._id
              const statusCfg = STATUS_CONFIG[intern.status]
              const days = daysRemaining(intern.dateFin)
              const progress = (() => {
                const total = new Date(intern.dateFin).getTime() - new Date(intern.dateDebut).getTime()
                const elapsed = Date.now() - new Date(intern.dateDebut).getTime()
                return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)))
              })()

              return (
                <div key={intern._id} className="ticket-card" style={{ borderLeft: `3px solid ${statusCfg.color}` }}>
                  <div
                    className="ticket-card-header"
                    onClick={() => setExpandedIntern(expanded ? null : intern._id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: statusCfg.color + '22',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: statusCfg.color,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        {intern.userId.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{intern.userId.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                          {intern.poste}
                          {intern.departement ? ` — ${intern.departement}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        {formatDate(intern.dateDebut)} → {formatDate(intern.dateFin)}
                      </span>
                      {intern.status === 'ACTIF' && (
                        <span
                          style={{
                            fontSize: 11,
                            color: days <= 7 ? '#ef4444' : days <= 30 ? '#f59e0b' : 'rgba(255,255,255,0.4)',
                          }}
                        >
                          {days > 0 ? `${days}j restants` : 'Termine'}
                        </span>
                      )}
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background:
                            intern.type === 'ALTERNANT' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(155,155,155,0.15)',
                          color: intern.type === 'ALTERNANT' ? 'var(--primary)' : '#9b9b9b',
                        }}
                      >
                        {intern.type === 'ALTERNANT' ? 'Alternant' : 'Stagiaire'}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: statusCfg.color + '22',
                          color: statusCfg.color,
                        }}
                      >
                        {statusCfg.label}
                      </span>
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.3)',
                          transform: expanded ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s',
                        }}
                      >
                        ▼
                      </span>
                    </div>
                  </div>

                  {expanded && (
                    <div
                      className="ticket-card-body"
                      style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      {/* Barre de progression */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Progression du stage</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{progress}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                          <div
                            style={{
                              height: '100%',
                              borderRadius: 3,
                              background: statusCfg.color,
                              width: `${progress}%`,
                              transition: 'width 0.3s',
                            }}
                          />
                        </div>
                      </div>

                      <div
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16 }}
                      >
                        <div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Type</span>
                          <br />
                          <select
                            value={intern.type || 'STAGIAIRE'}
                            onChange={(e) => handleTypeChange(intern._id, e.target.value as 'STAGIAIRE' | 'ALTERNANT')}
                            style={{
                              marginTop: 2,
                              fontSize: 13,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              color: 'inherit',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="STAGIAIRE">Stagiaire</option>
                            <option value="ALTERNANT">Alternant</option>
                          </select>
                        </div>
                        <div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Email</span>
                          <br />
                          <span style={{ color: '#fff', fontSize: 13 }}>{intern.userId.email}</span>
                        </div>
                        {intern.userId.phone && (
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Telephone</span>
                            <br />
                            <span style={{ color: '#fff', fontSize: 13 }}>{intern.userId.phone}</span>
                          </div>
                        )}
                        <div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Derniere connexion</span>
                          <br />
                          <span
                            style={{
                              color: intern.userId.lastLoginAt ? '#fff' : 'rgba(255,255,255,0.3)',
                              fontSize: 13,
                            }}
                          >
                            {intern.userId.lastLoginAt
                              ? new Date(intern.userId.lastLoginAt).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Jamais connecte'}
                          </span>
                        </div>
                        {intern.ecole && (
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Ecole</span>
                            <br />
                            <span style={{ color: '#fff', fontSize: 13 }}>{intern.ecole}</span>
                          </div>
                        )}
                        {intern.formation && (
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Formation</span>
                            <br />
                            <span style={{ color: '#fff', fontSize: 13 }}>{intern.formation}</span>
                          </div>
                        )}
                        {intern.tuteur && (
                          <div>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Tuteur</span>
                            <br />
                            <span style={{ color: '#fff', fontSize: 13 }}>{intern.tuteur.name}</span>
                          </div>
                        )}
                      </div>

                      {intern.notes && (
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: 6,
                            background: 'rgba(255,255,255,0.03)',
                            marginBottom: 16,
                          }}
                        >
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Notes</span>
                          <p
                            style={{
                              color: 'rgba(255,255,255,0.7)',
                              fontSize: 13,
                              margin: '4px 0 0',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {intern.notes}
                          </p>
                        </div>
                      )}

                      {/* Actions admin */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="ticket-new-btn"
                          style={{ fontSize: 12, padding: '6px 14px' }}
                          onClick={() => navigate(`/admin/stagiaires/${intern._id}`)}
                        >
                          Voir fiche
                        </button>
                        <button className="ticket-back-btn" onClick={() => handleEditIntern(intern)}>
                          Modifier
                        </button>
                        {intern.status === 'ACTIF' && (
                          <button
                            className="ticket-back-btn"
                            style={{ color: '#64748b' }}
                            onClick={() => handleStatusChange(intern._id, 'TERMINE')}
                          >
                            Marquer termine
                          </button>
                        )}
                        {intern.status === 'ACTIF' && (
                          <button
                            className="ticket-back-btn"
                            style={{ color: '#ef4444' }}
                            onClick={() => handleStatusChange(intern._id, 'ANNULE')}
                          >
                            Annuler
                          </button>
                        )}
                        {intern.status !== 'ACTIF' && (
                          <button
                            className="ticket-back-btn"
                            style={{ color: '#22c55e' }}
                            onClick={() => handleStatusChange(intern._id, 'ACTIF')}
                          >
                            Reactiver
                          </button>
                        )}
                        {isSuperAdmin && (
                          <>
                            <button
                              className="ticket-back-btn"
                              style={{ color: 'var(--primary)' }}
                              onClick={() => handleResendCredentials(intern._id)}
                              disabled={resendingCredentials === intern._id}
                            >
                              {resendingCredentials === intern._id ? 'Envoi...' : 'Renvoyer identifiants'}
                            </button>
                            <button
                              className="ticket-back-btn"
                              style={{ color: '#ef4444' }}
                              onClick={() => handleDeleteIntern(intern._id)}
                            >
                              Supprimer
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ═══ TAB: Tous les rapports (admin) ═══ */}
      {effectiveTab === 'rapports' && isAdmin && (
        <ReportsTab
          reports={reports}
          reportView={reportView}
          setReportView={setReportView}
          expandedReport={expandedReport}
          setExpandedReport={setExpandedReport}
          draggedReportId={draggedReportId}
          setDraggedReportId={setDraggedReportId}
          dragOverCol={dragOverCol}
          setDragOverCol={setDragOverCol}
          expandedIntern={expandedIntern}
          setExpandedIntern={setExpandedIntern}
          isAdmin={isAdmin}
          handleValidateReport={handleValidateReport}
          handleDeleteReport={handleDeleteReport}
          setCommentText={setCommentText}
          setCommentModal={setCommentModal}
        />
      )}

      {/* ═══ TAB: KPIs ═══ */}
      {effectiveTab === 'kpis' && isAdmin && <InternKpi />}

      {/* ═══ TAB: Documents ═══ */}
      {effectiveTab === 'documents' && isAdmin && <InternDocuments />}

      {/* ═══ TAB: Paramètres ═══ */}
      {effectiveTab === 'parametres' && isSuperAdmin && (
        <ParametresTab
          admins={admins}
          notifRecipients={notifRecipients}
          setNotifRecipients={setNotifRecipients}
          notifSaving={notifSaving}
          setNotifSaving={setNotifSaving}
          notifSuccess={notifSuccess}
          setNotifSuccess={setNotifSuccess}
        />
      )}

      {/* Mes rapports supprime — page separee /admin/mes-rapports */}
    </div>
  )

  // ── Render report body ──
}

export default InternList
