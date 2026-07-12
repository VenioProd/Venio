import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { apiFetch } from '../../../lib/api'
import InternDocuments from '../../../components/admin/InternDocuments'
import InternKpi from '../../../components/admin/InternKpi'
import '../../espace-client/ClientPortal.css'
import '../AdminPortal.css'
import CommentModal from './CommentModal'
import DashboardTab from './DashboardTab'
import InternsTab from './InternsTab'
import ParametresTab from './ParametresTab'
import ReportsTab from './ReportsTab'
import type { AdminUser } from './types'
import { useInternDashboard } from './useInternDashboard'
import { useInternManagement } from './useInternManagement'
import { useReportManagement } from './useReportManagement'

type TabId = 'dashboard' | 'stagiaires' | 'rapports' | 'kpis' | 'documents' | 'mes-rapports' | 'parametres'

const InternList = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const { confirm, ConfirmDialog } = useConfirm()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialTab = (searchParams.get('tab') as TabId) || (isSuperAdmin ? 'dashboard' : 'mes-rapports')
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedIntern, setExpandedIntern] = useState<string | null>(null)
  const [notifRecipients, setNotifRecipients] = useState<Required<AdminUser>[]>([])
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSuccess, setNotifSuccess] = useState(false)

  const {
    interns,
    loading,
    admins,
    form,
    setForm,
    showForm,
    setShowForm,
    editingIntern,
    submitting,
    resendingCredentials,
    loadInterns,
    loadAdmins,
    resetForm,
    handleCreateIntern,
    handleEditIntern,
    handleUpdateIntern,
    handleStatusChange,
    handleTypeChange,
    handleDeleteIntern,
    handleResendCredentials,
  } = useInternManagement({ confirm })
  const {
    reports,
    reportView,
    setReportView,
    expandedReport,
    setExpandedReport,
    draggedReportId,
    setDraggedReportId,
    dragOverCol,
    setDragOverCol,
    commentModal,
    setCommentModal,
    commentText,
    setCommentText,
    loadReports,
    loadMyReports,
    handleValidateReport,
    handleSubmitComment,
    handleDeleteReport,
  } = useReportManagement({ confirm, isAdmin })
  const {
    dashboard,
    dashboardLoading,
    reminderLogs,
    sendingReminders,
    setSendingReminders,
    reminderResult,
    setReminderResult,
    loadDashboard,
  } = useInternDashboard()

  const loadNotifSettings = useCallback(async () => {
    try {
      const data = await apiFetch<{ recipients: Required<AdminUser>[] }>('/api/admin/interns/settings/report-notifs')
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

  useEffect(() => {
    if (initialTab === 'dashboard' && isAdmin) loadDashboard()
  }, [])

  if (loading) {
    return (
      <div className="portal-container" style={{ padding: '60px 20px', textAlign: 'center', color: '#fff' }}>
        Chargement...
      </div>
    )
  }

  const tabs = [
    { key: 'dashboard', label: 'Tableau de bord', count: dashboard.length },
    { key: 'stagiaires', label: 'Équipe', count: interns.length },
    { key: 'rapports', label: 'Tous les rapports', count: reports.length },
    { key: 'kpis', label: 'KPIs', count: null as number | null },
    { key: 'documents', label: 'Documents', count: null as number | null },
    ...(isSuperAdmin ? [{ key: 'parametres', label: 'Paramètres', count: null as number | null }] : []),
  ]

  return (
    <div className="portal-container">
      {ConfirmDialog}
      {commentModal && (
        <CommentModal
          text={commentText}
          onTextChange={setCommentText}
          onClose={() => setCommentModal(null)}
          onSubmit={handleSubmitComment}
        />
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

      {tabs.length > 1 && (
        <div className="ticket-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`ticket-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key as TabId)}
            >
              {tab.label} {tab.count !== null && <span className="ticket-tab-badge">{tab.count}</span>}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'dashboard' && isAdmin && (
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

      {activeTab === 'stagiaires' && isAdmin && (
        <InternsTab
          admins={admins}
          interns={interns}
          editingIntern={editingIntern}
          form={form}
          setForm={setForm}
          showForm={showForm}
          submitting={submitting}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          expandedIntern={expandedIntern}
          setExpandedIntern={setExpandedIntern}
          isSuperAdmin={isSuperAdmin}
          resendingCredentials={resendingCredentials}
          onCreate={handleCreateIntern}
          onUpdate={handleUpdateIntern}
          onCancelForm={resetForm}
          onEdit={handleEditIntern}
          onStatusChange={handleStatusChange}
          onTypeChange={handleTypeChange}
          onResendCredentials={handleResendCredentials}
          onDelete={handleDeleteIntern}
        />
      )}

      {activeTab === 'rapports' && isAdmin && (
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

      {activeTab === 'kpis' && isAdmin && <InternKpi />}
      {activeTab === 'documents' && isAdmin && <InternDocuments />}
      {activeTab === 'parametres' && isSuperAdmin && (
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
    </div>
  )
}

export default InternList
