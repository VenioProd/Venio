import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { apiFetch, getToken } from '../../../lib/api'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { STATUS_CONFIG, REPORT_STATUS_CONFIG, formatDate, formatDateTime, formatFileSize, isImage, daysRemaining } from './types'
import type { Intern, ActivityReport } from './types'
import InternKpi from '../../../components/admin/InternKpi'
import InternDocuments from '../../../components/admin/InternDocuments'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'

const InternList = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const { confirm, ConfirmDialog } = useConfirm()
  const [searchParams] = useSearchParams()

  // ── Tabs ──
  const navigate = useNavigate()
  const initialTab = searchParams.get('tab') as 'dashboard' | 'stagiaires' | 'rapports' | 'kpis' | 'documents' | 'mes-rapports' | 'parametres' || (isSuperAdmin ? 'dashboard' : 'mes-rapports')
  const [activeTab, setActiveTab] = useState<'dashboard' | 'stagiaires' | 'rapports' | 'kpis' | 'documents' | 'mes-rapports' | 'parametres'>(initialTab)

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
    name: '', email: '', phone: '', password: '',
    type: 'STAGIAIRE' as 'STAGIAIRE' | 'ALTERNANT',
    poste: '', departement: '', dateDebut: '', dateFin: '',
    tuteur: '', ecole: '', formation: '', notes: '', joursPresence: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] as string[],
  })

  // ── Rapports ──
  const [reports, setReports] = useState<ActivityReport[]>([])
  const [myReports, setMyReports] = useState<ActivityReport[]>([])
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportForm, setReportForm] = useState({ date: new Date().toISOString().split('T')[0], contenu: '', taches: '' })
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
  const [notifRecipients, setNotifRecipients] = useState<{ _id: string; name: string; email: string; role: string }[]>([])
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSuccess, setNotifSuccess] = useState(false)

  // ── Intern identifie ──
  const [myIntern, setMyIntern] = useState<Intern | null>(null)

  // ── Load data ──
  const loadInterns = useCallback(async () => {
    try {
      const data = await apiFetch<Intern[]>('/api/admin/interns')
      setInterns(data)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const loadReports = useCallback(async () => {
    try {
      const data = await apiFetch<ActivityReport[]>('/api/admin/interns/reports/all')
      setReports(data)
    } catch { /* silent */ }
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
    } catch { /* silent */ } finally { setDashboardLoading(false) }
  }, [])

  const loadAdmins = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: { _id: string; name: string; role: string }[] }>('/api/admin/admins')
      setAdmins(data.users || [])
    } catch { /* silent */ }
  }, [])

  const loadNotifSettings = useCallback(async () => {
    try {
      const data = await apiFetch<{ recipients: { _id: string; name: string; email: string; role: string }[] }>('/api/admin/interns/settings/report-notifs')
      setNotifRecipients(data.recipients || [])
    } catch { /* silent */ }
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
    setForm({ name: '', email: '', phone: '', password: '', type: 'STAGIAIRE', poste: '', departement: '', dateDebut: '', dateFin: '', tuteur: '', ecole: '', formation: '', notes: '', joursPresence: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'] })
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
    } finally { setSubmitting(false) }
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
      joursPresence: intern.joursPresence?.length ? intern.joursPresence : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
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
    } finally { setSubmitting(false) }
  }

  const handleStatusChange = async (internId: string, status: string) => {
    try {
      await apiFetch(`/api/admin/interns/${internId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      loadInterns()
    } catch { /* silent */ }
  }

  const handleTypeChange = async (internId: string, type: 'STAGIAIRE' | 'ALTERNANT') => {
    try {
      await apiFetch(`/api/admin/interns/${internId}`, {
        method: 'PATCH',
        body: JSON.stringify({ type }),
      })
      loadInterns()
    } catch { /* silent */ }
  }

  const handleDeleteIntern = async (internId: string) => {
    const ok = await confirm({ message: 'Supprimer definitivement ce stagiaire et tous ses rapports ?', title: 'Suppression', variant: 'danger' })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/interns/${internId}`, { method: 'DELETE' })
      loadInterns()
    } catch { /* silent */ }
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
    } catch { /* silent */ } finally { setSubmitting(false) }
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
    } catch { /* silent */ }
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
    } catch { /* silent */ }
  }

  // ── Render ──
  if (loading) return <div className="portal-container" style={{ padding: '60px 20px', textAlign: 'center', color: '#fff' }}>Chargement...</div>

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
          <div className="confirm-modal confirm-modal--info" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="confirm-modal__header">
              <h2 className="confirm-modal__title">Commentaire pour le stagiaire</h2>
              <button className="confirm-modal__close" onClick={() => setCommentModal(null)} type="button" aria-label="Fermer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
              <button className="confirm-modal__btn confirm-modal__btn--cancel" onClick={() => setCommentModal(null)} type="button">Annuler</button>
              <button className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info" onClick={handleSubmitComment} type="button">Envoyer</button>
            </div>
          </div>
        </div>
      )}

      <div className="ticket-hero">
        <div className="ticket-hero-content">
          <Link to="/admin" className="ticket-back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Retour au dashboard
          </Link>
          <h1 className="ticket-hero-title">Gestion de l'équipe</h1>
        </div>
        <button className="ticket-new-btn" onClick={() => { resetForm(); setShowForm(true) }}>
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
        <>
          {/* Rappels manuels + logs — toujours visible */}
          {!dashboardLoading && (
            <div className="portal-card" style={{ marginTop: 16, marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Rappels de rapport</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 10 }}>Automatique tous les jours à 09h00 sur les jours de présence</span>
                </div>
                {isSuperAdmin && (
                  <button
                    onClick={async () => {
                      setSendingReminders(true)
                      setReminderResult(null)
                      try {
                        const res = await apiFetch<{ recipientsNotified: string[]; details?: any }>('/api/admin/interns/send-reminders', { method: 'POST' })
                        setReminderResult({ sent: res.recipientsNotified?.length || 0, details: res.details })
                        loadDashboard()
                      } catch { /* silent */ } finally { setSendingReminders(false) }
                    }}
                    disabled={sendingReminders}
                    style={{ padding: '7px 16px', borderRadius: 7, background: '#0ea5e9', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: sendingReminders ? 0.6 : 1 }}
                  >
                    {sendingReminders ? 'Envoi...' : 'Envoyer maintenant'}
                  </button>
                )}
              </div>
              {reminderResult && (
                <div style={{ padding: '10px 20px', background: reminderResult.sent > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(255,200,0,0.08)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
                  <span style={{ color: reminderResult.sent > 0 ? '#22c55e' : '#fbbf24', fontWeight: 600 }}>
                    {reminderResult.sent === 0 ? 'Aucun rappel envoyé' : `${reminderResult.sent} rappel(s) envoyé(s)`}
                  </span>
                  {reminderResult.details && (
                    <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 10, fontSize: 11 }}>
                      {reminderResult.details.totalInterns} stagiaire(s) actif(s) · jour: {reminderResult.details.today}
                      {reminderResult.details.errors?.length > 0 && ` · erreurs: ${reminderResult.details.errors.join(', ')}`}
                    </span>
                  )}
                </div>
              )}
              {reminderLogs.length === 0 ? (
                <div style={{ padding: '20px', color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>Aucune activité enregistrée</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Date', 'Statut', 'Rappels envoyés', 'Destinataires'].map((h) => (
                        <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reminderLogs.map((log: any) => (
                      <tr key={log._id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                          {new Date(log.startedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: log.status === 'SUCCESS' ? 'rgba(34,197,94,0.1)' : log.status === 'SKIPPED' ? 'rgba(255,255,255,0.06)' : 'rgba(239,68,68,0.1)', color: log.status === 'SUCCESS' ? '#22c55e' : log.status === 'SKIPPED' ? 'rgba(255,255,255,0.4)' : '#ef4444' }}>
                            {log.status === 'SUCCESS' ? 'Succès' : log.status === 'SKIPPED' ? 'Ignoré' : 'Erreur'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: '#fff', fontWeight: 600 }}>
                          {log.actionsExecuted?.length || 0}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(255,255,255,0.5)', maxWidth: 280 }}>
                          {log.recipientsNotified?.join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {dashboardLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Chargement...</p>
          ) : dashboard.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun membre actif</p>
          ) : (
            <>
            {/* Tableau récap activité */}
            <div className="portal-card" style={{ marginTop: 16, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>Dernières connexions</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Stagiaire', 'Poste', 'Jours présence', 'Dernière connexion', 'Dernier rapport'].map((h) => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.map((item: any) => {
                    const { intern: di, stats: ds } = item
                    const loginAt = (di.userId as any)?.lastLoginAt
                    const daysSinceLogin = loginAt ? Math.floor((Date.now() - new Date(loginAt).getTime()) / 86400000) : null
                    const loginColor = daysSinceLogin === null ? 'rgba(255,255,255,0.3)' : daysSinceLogin === 0 ? '#22c55e' : daysSinceLogin <= 1 ? '#0ea5e9' : daysSinceLogin <= 3 ? '#f59e0b' : '#ef4444'
                    const reportColor = ds.daysSinceLastReport === null ? 'rgba(255,255,255,0.3)' : ds.daysSinceLastReport <= 1 ? '#22c55e' : ds.daysSinceLastReport <= 3 ? '#f59e0b' : '#ef4444'
                    const jours = (di.joursPresence as string[] | undefined) || []
                    const joursAbrev: Record<string, string> = { lundi: 'Lu', mardi: 'Ma', mercredi: 'Me', jeudi: 'Je', vendredi: 'Ve', samedi: 'Sa', dimanche: 'Di' }
                    return (
                      <tr key={di._id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => navigate(`/admin/stagiaires/${di._id}`)}>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ color: '#fff', fontWeight: 500, fontSize: 13 }}>{(di.userId as any)?.name}</span>
                          <span style={{ display: 'inline-block', marginLeft: 7, padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: di.type === 'ALTERNANT' ? 'rgba(168,85,247,0.15)' : 'rgba(14,165,233,0.15)', color: di.type === 'ALTERNANT' ? '#a855f7' : '#0ea5e9' }}>
                            {di.type === 'ALTERNANT' ? 'Alt' : 'St'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{di.poste}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((j) => (
                              <span key={j} style={{ fontSize: 10, fontWeight: 600, padding: '2px 4px', borderRadius: 3, background: jours.includes(j) ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.04)', color: jours.includes(j) ? '#0ea5e9' : 'rgba(255,255,255,0.2)' }}>
                                {joursAbrev[j]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: loginColor }}>
                            {loginAt ? (daysSinceLogin === 0 ? "Aujourd'hui" : daysSinceLogin === 1 ? 'Hier' : `il y a ${daysSinceLogin}j`) : 'Jamais'}
                          </span>
                          {loginAt && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{new Date(loginAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: reportColor }}>
                            {ds.lastActivity ? (ds.daysSinceLastReport === 0 ? "Aujourd'hui" : ds.daysSinceLastReport === 1 ? 'Hier' : `il y a ${ds.daysSinceLastReport}j`) : 'Aucun rapport'}
                          </span>
                          {ds.lastActivity && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{formatDate(ds.lastActivity)}</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Cartes détaillées */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {dashboard.map((item: any) => {
                const { intern: di, stats: ds } = item
                const alertLevel = ds.daysSinceLastReport === null ? 'none' : ds.daysSinceLastReport > 3 ? 'danger' : ds.daysSinceLastReport > 1 ? 'warning' : 'ok'
                const alertColors = { none: 'rgba(255,255,255,0.2)', danger: '#ef4444', warning: '#f59e0b', ok: '#22c55e' }
                const alertColor = alertColors[alertLevel]
                const colors = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899']
                const avatarColor = colors[(di.userId?.name || '').charCodeAt(0) % colors.length]

                return (
                  <div
                    key={di._id}
                    className="portal-card"
                    style={{ cursor: 'pointer', borderLeft: `3px solid ${alertColor}`, transition: 'transform 0.15s' }}
                    onClick={() => navigate(`/admin/stagiaires/${di._id}`)}
                  >
                    <div style={{ padding: '16px 20px' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: avatarColor + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: avatarColor, fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                          {(di.userId?.name || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>{di.userId?.name}</span>
                            <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: di.type === 'ALTERNANT' ? 'rgba(168,85,247,0.15)' : 'rgba(14,165,233,0.15)', color: di.type === 'ALTERNANT' ? '#a855f7' : '#0ea5e9' }}>
                              {di.type === 'ALTERNANT' ? 'Alternant' : 'Stagiaire'}
                            </span>
                          </div>
                          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{di.poste}{di.departement ? ` — ${di.departement}` : ''}</div>
                        </div>
                        {alertLevel === 'danger' && (
                          <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#ef444422', color: '#ef4444' }}>
                            INACTIF {ds.daysSinceLastReport}j
                          </span>
                        )}
                        {alertLevel === 'warning' && (
                          <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#f59e0b22', color: '#f59e0b' }}>
                            {ds.daysSinceLastReport}j sans rapport
                          </span>
                        )}
                      </div>

                      {/* Stats mini */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                        <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 18 }}>{ds.reportsThisWeek}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Cette semaine</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: 18 }}>{ds.validationRate}%</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Validation</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, background: 'rgba(255,255,255,0.03)' }}>
                          <div style={{ color: '#22c55e', fontWeight: 700, fontSize: 18 }}>{ds.totalReports}</div>
                          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Total rapports</div>
                        </div>
                      </div>

                      {/* Barre de progression */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Stage : {ds.progress}%</span>
                          <span style={{ color: ds.daysRemaining <= 7 ? '#ef4444' : ds.daysRemaining <= 30 ? '#f59e0b' : 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                            {ds.daysRemaining > 0 ? `${ds.daysRemaining}j restants` : 'Termine'}
                          </span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                          <div style={{ height: '100%', borderRadius: 2, width: `${ds.progress}%`, background: ds.progress >= 90 ? '#ef4444' : ds.progress >= 70 ? '#f59e0b' : '#0ea5e9', transition: 'width 0.5s' }} />
                        </div>
                      </div>

                      {/* Derniere activite */}
                      <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                        Derniere activite : {ds.lastActivity ? formatDate(ds.lastActivity) : 'Aucune'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            </>
          )}
        </>
      )}

      {/* ═══ TAB: Stagiaires ═══ */}
      {effectiveTab === 'stagiaires' && isAdmin && (
        <>
          {/* Filtres status */}
          <div className="ticket-stats" style={{ marginBottom: 16 }}>
            {['all', 'ACTIF', 'TERMINE', 'ANNULE'].map((s) => {
              const label = s === 'all' ? 'Tous' : STATUS_CONFIG[s]?.label || s
              const color = s === 'all' ? '#8b5cf6' : STATUS_CONFIG[s]?.color || '#fff'
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
              <h3 style={{ margin: '0 0 16px', color: '#0ea5e9' }}>{editingIntern ? 'Modifier' : 'Nouveau'} {form.type === 'ALTERNANT' ? 'alternant' : 'stagiaire'}</h3>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Type *</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'STAGIAIRE' | 'ALTERNANT' })} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', fontSize: 14 }}>
                    <option value="STAGIAIRE">Stagiaire</option>
                    <option value="ALTERNANT">Alternant</option>
                  </select>
                </div>
                <div className="ticket-form-field">
                  <label>Nom complet *</label>
                  <input placeholder="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!!editingIntern} />
                </div>
                <div className="ticket-form-field">
                  <label>Email *</label>
                  <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editingIntern} />
                </div>
              </div>
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Telephone</label>
                  <input placeholder="Telephone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!!editingIntern} />
                </div>
                {!editingIntern ? (
                  <div className="ticket-form-field">
                    <label>Mot de passe</label>
                    <input type="password" placeholder="Defaut: Stage2026!" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                ) : (
                  <div className="ticket-form-field">
                    <label>Poste / Mission *</label>
                    <input placeholder="Poste / Mission" value={form.poste} onChange={(e) => setForm({ ...form, poste: e.target.value })} />
                  </div>
                )}
              </div>
              {!editingIntern && (
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Poste / Mission *</label>
                    <input placeholder="Poste / Mission" value={form.poste} onChange={(e) => setForm({ ...form, poste: e.target.value })} />
                  </div>
                  <div className="ticket-form-field">
                    <label>Departement</label>
                    <input placeholder="Departement" value={form.departement} onChange={(e) => setForm({ ...form, departement: e.target.value })} />
                  </div>
                </div>
              )}
              {editingIntern && (
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Departement</label>
                    <input placeholder="Departement" value={form.departement} onChange={(e) => setForm({ ...form, departement: e.target.value })} />
                  </div>
                  <div className="ticket-form-field">
                    <label>Tuteur</label>
                    <select value={form.tuteur} onChange={(e) => setForm({ ...form, tuteur: e.target.value })}>
                      <option value="">-- Tuteur --</option>
                      {admins.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="ticket-form-row">
                <div className="ticket-form-field">
                  <label>Date de debut *</label>
                  <input type="date" value={form.dateDebut} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} />
                </div>
                <div className="ticket-form-field">
                  <label>Date de fin *</label>
                  <input type="date" value={form.dateFin} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} />
                </div>
              </div>
              {!editingIntern && (
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Tuteur</label>
                    <select value={form.tuteur} onChange={(e) => setForm({ ...form, tuteur: e.target.value })}>
                      <option value="">-- Tuteur --</option>
                      {admins.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div className="ticket-form-field">
                    <label>Ecole / Universite</label>
                    <input placeholder="Ecole / Universite" value={form.ecole} onChange={(e) => setForm({ ...form, ecole: e.target.value })} />
                  </div>
                </div>
              )}
              {editingIntern && (
                <div className="ticket-form-row">
                  <div className="ticket-form-field">
                    <label>Ecole / Universite</label>
                    <input placeholder="Ecole / Universite" value={form.ecole} onChange={(e) => setForm({ ...form, ecole: e.target.value })} />
                  </div>
                  <div className="ticket-form-field">
                    <label>Formation</label>
                    <input placeholder="Formation" value={form.formation} onChange={(e) => setForm({ ...form, formation: e.target.value })} />
                  </div>
                </div>
              )}
              {!editingIntern && (
                <div className="ticket-form-field">
                  <label>Formation</label>
                  <input placeholder="Formation" value={form.formation} onChange={(e) => setForm({ ...form, formation: e.target.value })} />
                </div>
              )}
              <div className="ticket-form-field">
                <label>Notes internes</label>
                <textarea placeholder="Notes internes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="ticket-form-field">
                <label>Jours de présence</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map((jour) => {
                    const checked = form.joursPresence.includes(jour)
                    return (
                      <label key={jour} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '4px 10px', borderRadius: 6, background: checked ? 'rgba(14,165,233,0.15)' : 'rgba(255,255,255,0.04)', border: `1px solid ${checked ? '#0ea5e9' : 'rgba(255,255,255,0.1)'}`, fontSize: 13, color: checked ? '#0ea5e9' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }}>
                        <input type="checkbox" checked={checked} style={{ display: 'none' }} onChange={() => {
                          const next = checked ? form.joursPresence.filter((j) => j !== jour) : [...form.joursPresence, jour]
                          setForm({ ...form, joursPresence: next })
                        }} />
                        {jour.charAt(0).toUpperCase() + jour.slice(1)}
                      </label>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button className="ticket-new-btn" disabled={submitting} onClick={editingIntern ? handleUpdateIntern : handleCreateIntern}>
                  {submitting ? 'En cours...' : editingIntern ? 'Enregistrer' : 'Creer le stagiaire'}
                </button>
                <button className="ticket-back-btn" onClick={resetForm}>Annuler</button>
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
                  <div className="ticket-card-header" onClick={() => setExpandedIntern(expanded ? null : intern._id)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: statusCfg.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: statusCfg.color, fontWeight: 700, fontSize: 14 }}>
                        {intern.userId.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{intern.userId.name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{intern.poste}{intern.departement ? ` — ${intern.departement}` : ''}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        {formatDate(intern.dateDebut)} → {formatDate(intern.dateFin)}
                      </span>
                      {intern.status === 'ACTIF' && (
                        <span style={{ fontSize: 11, color: days <= 7 ? '#ef4444' : days <= 30 ? '#f59e0b' : 'rgba(255,255,255,0.4)' }}>
                          {days > 0 ? `${days}j restants` : 'Termine'}
                        </span>
                      )}
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: intern.type === 'ALTERNANT' ? 'rgba(168,85,247,0.15)' : 'rgba(14,165,233,0.15)', color: intern.type === 'ALTERNANT' ? '#a855f7' : '#0ea5e9' }}>
                        {intern.type === 'ALTERNANT' ? 'Alternant' : 'Stagiaire'}
                      </span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: statusCfg.color + '22', color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                  </div>

                  {expanded && (
                    <div className="ticket-card-body" style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {/* Barre de progression */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Progression du stage</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{progress}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: statusCfg.color, width: `${progress}%`, transition: 'width 0.3s' }} />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 16 }}>
                        <div>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Type</span><br />
                          <select
                            value={intern.type || 'STAGIAIRE'}
                            onChange={(e) => handleTypeChange(intern._id, e.target.value as 'STAGIAIRE' | 'ALTERNANT')}
                            style={{ marginTop: 2, fontSize: 13, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'inherit', cursor: 'pointer' }}
                          >
                            <option value="STAGIAIRE">Stagiaire</option>
                            <option value="ALTERNANT">Alternant</option>
                          </select>
                        </div>
                        <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Email</span><br /><span style={{ color: '#fff', fontSize: 13 }}>{intern.userId.email}</span></div>
                        {intern.userId.phone && <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Telephone</span><br /><span style={{ color: '#fff', fontSize: 13 }}>{intern.userId.phone}</span></div>}
                        <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Derniere connexion</span><br /><span style={{ color: intern.userId.lastLoginAt ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 13 }}>{intern.userId.lastLoginAt ? new Date(intern.userId.lastLoginAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais connecte'}</span></div>
                        {intern.ecole && <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Ecole</span><br /><span style={{ color: '#fff', fontSize: 13 }}>{intern.ecole}</span></div>}
                        {intern.formation && <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Formation</span><br /><span style={{ color: '#fff', fontSize: 13 }}>{intern.formation}</span></div>}
                        {intern.tuteur && <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Tuteur</span><br /><span style={{ color: '#fff', fontSize: 13 }}>{intern.tuteur.name}</span></div>}
                      </div>

                      {intern.notes && (
                        <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(255,255,255,0.03)', marginBottom: 16 }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Notes</span>
                          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{intern.notes}</p>
                        </div>
                      )}

                      {/* Actions admin */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ticket-new-btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => navigate(`/admin/stagiaires/${intern._id}`)}>Voir fiche</button>
                        <button className="ticket-back-btn" onClick={() => handleEditIntern(intern)}>Modifier</button>
                        {intern.status === 'ACTIF' && (
                          <button className="ticket-back-btn" style={{ color: '#64748b' }} onClick={() => handleStatusChange(intern._id, 'TERMINE')}>Marquer termine</button>
                        )}
                        {intern.status === 'ACTIF' && (
                          <button className="ticket-back-btn" style={{ color: '#ef4444' }} onClick={() => handleStatusChange(intern._id, 'ANNULE')}>Annuler</button>
                        )}
                        {intern.status !== 'ACTIF' && (
                          <button className="ticket-back-btn" style={{ color: '#22c55e' }} onClick={() => handleStatusChange(intern._id, 'ACTIF')}>Reactiver</button>
                        )}
                        {isSuperAdmin && (
                          <button className="ticket-back-btn" style={{ color: '#ef4444' }} onClick={() => handleDeleteIntern(intern._id)}>Supprimer</button>
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
      {effectiveTab === 'rapports' && isAdmin && (() => {
        // Regrouper les rapports par personne
        const grouped: Record<string, { name: string; reports: ActivityReport[] }> = {}
        reports.forEach((r) => {
          const uid = r.userId?._id || 'unknown'
          if (!grouped[uid]) grouped[uid] = { name: r.userId?.name || 'Inconnu', reports: [] }
          grouped[uid].reports.push(r)
        })
        const people = Object.entries(grouped).sort((a, b) => a[1].name.localeCompare(b[1].name))
        const colors = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899']
        const getColor = (name: string) => colors[name.charCodeAt(0) % colors.length]

        // Kanban columns
        const kanbanCols: { key: string; label: string; color: string }[] = [
          { key: 'SOUMIS', label: 'Soumis', color: '#0ea5e9' },
          { key: 'BROUILLON', label: 'Brouillon', color: '#f59e0b' },
          { key: 'VALIDE', label: 'Valide', color: '#22c55e' },
        ]

        return (
          <>
            {/* Toggle vue */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 20 }}>
              <button
                onClick={() => setReportView('liste')}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: reportView === 'liste' ? '#0ea5e9' : 'rgba(255,255,255,0.06)',
                  color: reportView === 'liste' ? '#fff' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: -2 }}>
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Liste
              </button>
              <button
                onClick={() => setReportView('kanban')}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: reportView === 'kanban' ? '#0ea5e9' : 'rgba(255,255,255,0.06)',
                  color: reportView === 'kanban' ? '#fff' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.2s',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: -2 }}>
                  <rect x="3" y="3" width="5" height="18" rx="1" /><rect x="10" y="3" width="5" height="12" rx="1" /><rect x="17" y="3" width="5" height="15" rx="1" />
                </svg>
                Kanban
              </button>
            </div>

            {reports.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>Aucun rapport d'activite</p>
            )}

            {/* ── VUE LISTE (par personne) ── */}
            {reportView === 'liste' && (
              <div className="ticket-list">
                {people.map(([uid, { name, reports: personReports }]) => {
                  const validated = personReports.filter((r) => r.status === 'VALIDE').length
                  const total = personReports.length
                  const isPersonExpanded = expandedIntern === `reports-${uid}`
                  const color = getColor(name)

                  return (
                    <div key={uid} style={{ marginBottom: 16 }}>
                      <div
                        className="ticket-card"
                        style={{ borderLeft: `3px solid ${color}`, cursor: 'pointer' }}
                        onClick={() => setExpandedIntern(isPersonExpanded ? null : `reports-${uid}`)}
                      >
                        <div className="ticket-card-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontWeight: 700, fontSize: 14 }}>
                              {name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ color: '#fff', fontWeight: 600 }}>{name}</div>
                              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                                {total} rapport{total > 1 ? 's' : ''} — {validated} valide{validated > 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>
                          <span style={{ color: 'rgba(255,255,255,0.3)', transform: isPersonExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                        </div>
                      </div>

                      {isPersonExpanded && (
                        <div style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {personReports.map((report) => {
                            const expanded = expandedReport === report._id
                            const sCfg = REPORT_STATUS_CONFIG[report.status]
                            return (
                              <div key={report._id} className="ticket-card" style={{ borderLeft: `3px solid ${sCfg.color}` }}>
                                <div className="ticket-card-header" onClick={() => setExpandedReport(expanded ? null : report._id)} style={{ cursor: 'pointer' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                                    <span style={{ color: '#fff', fontWeight: 600 }}>{formatDate(report.date)}</span>
                                    {report.taches.length > 0 && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{report.taches.length} tache(s)</span>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    {report.attachments.length > 0 && (
                                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>📎 {report.attachments.length}</span>
                                    )}
                                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: sCfg.color + '22', color: sCfg.color }}>
                                      {sCfg.label}
                                    </span>
                                    <span style={{ color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                                  </div>
                                </div>
                                {expanded && renderReportBody(report, true)}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── VUE KANBAN (par statut) ── */}
            {reportView === 'kanban' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 20, alignItems: 'flex-start', width: '100%' }}>
                {kanbanCols.map((col) => {
                  const colReports = reports.filter((r) => r.status === col.key)
                  return (
                    <div
                      key={col.key}
                      style={{
                        background: dragOverCol === col.key ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                        borderRadius: 10,
                        border: dragOverCol === col.key ? `1px solid ${col.color}44` : '1px solid rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                        transition: 'background 0.2s, border-color 0.2s',
                      }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key) }}
                      onDragLeave={() => setDragOverCol(null)}
                      onDrop={async (e) => {
                        e.preventDefault()
                        setDragOverCol(null)
                        if (draggedReportId) {
                          const report = reports.find((r) => r._id === draggedReportId)
                          if (report && report.status !== col.key) {
                            await handleValidateReport(draggedReportId, col.key)
                          }
                          setDraggedReportId(null)
                        }
                      }}
                    >
                      {/* Header colonne */}
                      <div style={{ padding: '14px 16px', borderBottom: '2px solid ' + col.color, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: col.color, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.label}</span>
                        <span style={{ background: col.color + '22', color: col.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{colReports.length}</span>
                      </div>

                      {/* Cartes */}
                      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}>
                        {colReports.length === 0 && (
                          <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>Aucun rapport</p>
                        )}
                        {colReports.map((report) => {
                          const expanded = expandedReport === report._id
                          const color = getColor(report.userId?.name || '')
                          return (
                            <div
                              key={report._id}
                              draggable
                              onDragStart={() => setDraggedReportId(report._id)}
                              onDragEnd={() => { setDraggedReportId(null); setDragOverCol(null) }}
                              style={{
                                background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
                                cursor: 'grab', transition: 'border-color 0.2s, opacity 0.2s',
                                opacity: draggedReportId === report._id ? 0.5 : 1,
                              }}
                              onClick={() => setExpandedReport(expanded ? null : report._id)}
                            >
                              <div style={{ padding: '14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                                    {(report.userId?.name || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.userId?.name || 'Inconnu'}</span>
                                </div>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                                  {report.contenu}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{formatDate(report.date)}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {report.attachments.length > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>📎 {report.attachments.length}</span>}
                                    {report.taches.length > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{report.taches.length} tache(s)</span>}
                                  </div>
                                </div>
                                {report.commentaireAdmin && (
                                  <div style={{ marginTop: 6, padding: '4px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.08)', borderLeft: '2px solid #8b5cf6' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{report.commentaireAdmin.length > 60 ? report.commentaireAdmin.slice(0, 60) + '...' : report.commentaireAdmin}</span>
                                  </div>
                                )}
                              </div>
                              {expanded && renderReportBody(report, true)}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )
      })()}

      {/* ═══ TAB: KPIs ═══ */}
      {effectiveTab === 'kpis' && isAdmin && <InternKpi />}

      {/* ═══ TAB: Documents ═══ */}
      {effectiveTab === 'documents' && isAdmin && <InternDocuments />}

      {/* ═══ TAB: Paramètres ═══ */}
      {effectiveTab === 'parametres' && isSuperAdmin && (() => {
        const allAdminUsers = admins.filter((a) => a.role === 'SUPER_ADMIN' || a.role === 'RH' || a.role === 'ADMIN')
        const selectedIds = new Set(notifRecipients.map((r) => r._id))

        const toggle = (id: string) => {
          setNotifRecipients((prev) =>
            prev.find((r) => r._id === id)
              ? prev.filter((r) => r._id !== id)
              : [...prev, admins.find((a) => a._id === id) as any]
          )
        }

        const save = async () => {
          setNotifSaving(true)
          setNotifSuccess(false)
          try {
            await apiFetch('/api/admin/interns/settings/report-notifs', {
              method: 'PATCH',
              body: JSON.stringify({ recipientIds: Array.from(selectedIds) }),
            })
            setNotifSuccess(true)
            setTimeout(() => setNotifSuccess(false), 3000)
          } catch { /* silent */ } finally { setNotifSaving(false) }
        }

        return (
          <div className="portal-card" style={{ maxWidth: 600, marginTop: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Notifications — rapports d'activité</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Choisissez qui reçoit un email et une notification quand un membre soumet un rapport.
              Si aucun destinataire n'est sélectionné, seuls les Super Admins sont notifiés.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {allAdminUsers.map((a) => (
                <label key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 10, background: selectedIds.has(a._id) ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedIds.has(a._id) ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.15s' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a._id)}
                    onChange={() => toggle(a._id)}
                    style={{ accentColor: '#0ea5e9', width: 16, height: 16 }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{a.role === 'SUPER_ADMIN' ? 'Super Admin' : a.role}</span>
                </label>
              ))}
            </div>
            {notifSuccess && <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 12 }}>Enregistré</p>}
            <button className="portal-button" onClick={save} disabled={notifSaving} style={{ alignSelf: 'flex-start' }}>
              {notifSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        )
      })()}

      {/* Mes rapports supprime — page separee /admin/mes-rapports */}
    </div>
  )

  // ── Render report body ──
  function renderReportBody(report: ActivityReport, showAdminActions: boolean) {
    return (
      <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Contenu */}
        <div style={{ marginBottom: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Compte-rendu</span>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '4px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{report.contenu}</p>
        </div>

        {/* Taches */}
        {report.taches.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Taches realisees</span>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {report.taches.map((t, i) => (
                <li key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 4 }}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Pieces jointes */}
        {report.attachments.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Pieces jointes</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {report.attachments.map((f, i) => (
                <a
                  key={i}
                  href={`/api/admin/interns/reports/files/${f.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', color: '#0ea5e9', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {isImage(f.mimetype) ? '🖼️' : '📄'} {f.originalName}
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>({formatFileSize(f.size)})</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Commentaire admin */}
        {report.commentaireAdmin && (
          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(139,92,246,0.08)', marginBottom: 12, borderLeft: '3px solid #8b5cf6' }}>
            <span style={{ color: '#8b5cf6', fontSize: 11, fontWeight: 600 }}>Commentaire admin</span>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '4px 0 0' }}>{report.commentaireAdmin}</p>
          </div>
        )}

        {/* Validation info */}
        {report.status === 'VALIDE' && report.validePar && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
            Valide par {report.validePar.name}{report.valideAt ? ` le ${formatDateTime(report.valideAt)}` : ''}
          </div>
        )}

        {/* Actions admin */}
        {showAdminActions && isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {report.status !== 'VALIDE' && (
              <button className="ticket-new-btn" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => handleValidateReport(report._id, 'VALIDE')}>
                Valider
              </button>
            )}
            {report.status === 'VALIDE' && (
              <button className="ticket-back-btn" style={{ fontSize: 12 }} onClick={() => handleValidateReport(report._id, 'SOUMIS')}>
                Annuler validation
              </button>
            )}
            <button className="ticket-back-btn" style={{ fontSize: 12 }} onClick={() => {
              setCommentText(report.commentaireAdmin || '')
              setCommentModal({ reportId: report._id, status: report.status })
            }}>
              Commenter
            </button>
          </div>
        )}

        {/* Actions stagiaire (supprimer si pas valide) */}
        {!showAdminActions && report.status !== 'VALIDE' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ticket-back-btn" style={{ fontSize: 12, color: '#ef4444' }} onClick={() => handleDeleteReport(report._id)}>
              Supprimer
            </button>
          </div>
        )}
      </div>
    )
  }
}

export default InternList
