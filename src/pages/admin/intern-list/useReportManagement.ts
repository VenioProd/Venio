import { useCallback, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '../../../lib/api'
import type { ActivityReport, Intern } from './types'

interface ConfirmOptions {
  message: string
  title: string
  variant: 'danger'
}

interface UseReportManagementOptions {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  isAdmin: boolean
}

export function useReportManagement({ confirm, isAdmin }: UseReportManagementOptions) {
  const [reports, setReports] = useState<ActivityReport[]>([])
  const [myReports, setMyReports] = useState<ActivityReport[]>([])
  const [myIntern, setMyIntern] = useState<Intern | null>(null)
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportForm, setReportForm] = useState({
    date: new Date().toISOString().split('T')[0],
    contenu: '',
    taches: '',
  })
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const reportFileRef = useRef<HTMLInputElement>(null)
  const [expandedReport, setExpandedReport] = useState<string | null>(null)
  const [reportView, setReportView] = useState<'liste' | 'kanban'>('liste')
  const [draggedReportId, setDraggedReportId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [commentModal, setCommentModal] = useState<{ reportId: string; status: string } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)

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
      setMyIntern({} as Intern)
    } catch {
      setMyIntern(null)
    }
  }, [])

  const handleCreateReport = useCallback(async () => {
    if (!reportForm.contenu) return
    setSubmittingReport(true)
    try {
      const formData = new FormData()
      formData.append('date', reportForm.date)
      formData.append('contenu', reportForm.contenu)
      if (reportForm.taches) {
        formData.append('taches', JSON.stringify(reportForm.taches.split('\n').filter((task) => task.trim())))
      }
      reportFiles.forEach((file) => formData.append('files', file))
      await apiUpload('/api/admin/interns/reports', formData)
      setReportForm({ date: new Date().toISOString().split('T')[0], contenu: '', taches: '' })
      setReportFiles([])
      setShowReportForm(false)
      loadMyReports()
      if (isAdmin) loadReports()
    } catch {
      /* silent */
    } finally {
      setSubmittingReport(false)
    }
  }, [isAdmin, loadMyReports, loadReports, reportFiles, reportForm])

  const handleValidateReport = useCallback(
    async (reportId: string, status: string, commentaire?: string) => {
      try {
        const formData = new FormData()
        formData.append('status', status)
        if (commentaire !== undefined) formData.append('commentaireAdmin', commentaire)
        await apiUpload(`/api/admin/interns/reports/${reportId}`, formData, { method: 'PATCH' })
        loadReports()
      } catch {
        /* silent */
      }
    },
    [loadReports],
  )

  const handleSubmitComment = useCallback(async () => {
    if (!commentModal) return
    await handleValidateReport(commentModal.reportId, commentModal.status, commentText)
    setCommentModal(null)
    setCommentText('')
  }, [commentModal, commentText, handleValidateReport])

  const handleDeleteReport = useCallback(
    async (reportId: string) => {
      const ok = await confirm({ message: 'Supprimer ce rapport ?', title: 'Suppression', variant: 'danger' })
      if (!ok) return
      try {
        await apiFetch(`/api/admin/interns/reports/${reportId}`, { method: 'DELETE' })
        loadMyReports()
        if (isAdmin) loadReports()
      } catch {
        /* silent */
      }
    },
    [confirm, isAdmin, loadMyReports, loadReports],
  )

  return {
    reports,
    myReports,
    myIntern,
    showReportForm,
    setShowReportForm,
    reportForm,
    setReportForm,
    reportFiles,
    setReportFiles,
    reportFileRef,
    expandedReport,
    setExpandedReport,
    reportView,
    setReportView,
    draggedReportId,
    setDraggedReportId,
    dragOverCol,
    setDragOverCol,
    commentModal,
    setCommentModal,
    commentText,
    setCommentText,
    submittingReport,
    loadReports,
    loadMyReports,
    handleCreateReport,
    handleValidateReport,
    handleSubmitComment,
    handleDeleteReport,
  }
}
