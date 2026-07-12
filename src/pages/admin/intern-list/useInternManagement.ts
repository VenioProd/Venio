import { useCallback, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { createEmptyInternForm, internFormFromIntern, type AdminUser, type Intern, type InternFormData } from './types'

interface ConfirmOptions {
  message: string
  title: string
  variant: 'danger'
}

interface UseInternManagementOptions {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export function useInternManagement({ confirm }: UseInternManagementOptions) {
  const [interns, setInterns] = useState<Intern[]>([])
  const [loading, setLoading] = useState(true)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [form, setForm] = useState<InternFormData>(createEmptyInternForm)
  const [showForm, setShowForm] = useState(false)
  const [editingIntern, setEditingIntern] = useState<Intern | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resendingCredentials, setResendingCredentials] = useState<string | null>(null)

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

  const loadAdmins = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: AdminUser[] }>('/api/admin/admins')
      setAdmins(data.users || [])
    } catch {
      /* silent */
    }
  }, [])

  const resetForm = useCallback(() => {
    setForm(createEmptyInternForm())
    setEditingIntern(null)
    setShowForm(false)
  }, [])

  const handleCreateIntern = useCallback(async () => {
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }, [form, loadInterns, resetForm])

  const handleEditIntern = useCallback((intern: Intern) => {
    setEditingIntern(intern)
    setForm(internFormFromIntern(intern))
    setShowForm(true)
  }, [])

  const handleUpdateIntern = useCallback(async () => {
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }, [editingIntern, form, loadInterns, resetForm])

  const handleStatusChange = useCallback(
    async (internId: string, status: string) => {
      try {
        await apiFetch(`/api/admin/interns/${internId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        })
        loadInterns()
      } catch {
        /* silent */
      }
    },
    [loadInterns],
  )

  const handleTypeChange = useCallback(
    async (internId: string, type: 'STAGIAIRE' | 'ALTERNANT') => {
      setInterns((previous) => previous.map((intern) => (intern._id === internId ? { ...intern, type } : intern)))
      try {
        await apiFetch(`/api/admin/interns/${internId}`, {
          method: 'PATCH',
          body: JSON.stringify({ type }),
        })
      } catch {
        loadInterns()
      }
    },
    [loadInterns],
  )

  const handleDeleteIntern = useCallback(
    async (internId: string) => {
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
    },
    [confirm, loadInterns],
  )

  const handleResendCredentials = useCallback(async (internId: string) => {
    setResendingCredentials(internId)
    try {
      await apiFetch(`/api/admin/interns/${internId}/resend-credentials`, { method: 'POST' })
      alert('Nouveaux identifiants envoyes par email')
    } catch (err: unknown) {
      alert((err as Error).message || "Erreur lors de l'envoi")
    } finally {
      setResendingCredentials(null)
    }
  }, [])

  return {
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
  }
}
