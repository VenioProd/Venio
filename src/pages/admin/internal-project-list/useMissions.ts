import { useEffect, useRef, useState } from 'react'
import { apiDownload, apiFetch, apiUpload } from '../../../lib/api'
import type { Mission } from './types'

type ViewTab = 'arrow' | 'projects' | 'missions'

interface UseMissionsOptions {
  viewTab: ViewTab
  showToast: (message: string, type: 'success' | 'error') => void
}

export function useMissions({ viewTab, showToast }: UseMissionsOptions) {
  const [missions, setMissions] = useState<Mission[]>([])
  const [missionsLoading, setMissionsLoading] = useState(false)
  const [selectedMission, setSelectedMission] = useState<string | null>(null)
  const [missionStepInputs, setMissionStepInputs] = useState<Record<string, string>>({})
  const [stepAssigneeInputs, setStepAssigneeInputs] = useState<Record<string, string>>({})
  const [deliverableInputs, setDeliverableInputs] = useState<
    Record<string, { title: string; description: string; assignedTo: string }>
  >({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [uploadingMission, setUploadingMission] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [showMissionForm, setShowMissionForm] = useState(false)
  const [missionForm, setMissionForm] = useState({
    projectId: '',
    title: '',
    description: '',
    assignedTo: [] as string[],
    dueDate: '',
  })
  const [savingMission, setSavingMission] = useState(false)

  useEffect(() => {
    if (viewTab !== 'missions' && viewTab !== 'arrow') return
    setMissionsLoading(true)
    apiFetch<{ missions: Mission[] }>('/api/admin/internal-projects/missions')
      .then((d) => setMissions(d.missions || []))
      .catch(() => {})
      .finally(() => setMissionsLoading(false))
  }, [viewTab])

  const handleParticipantUpdate = async (
    missionId: string,
    projectId: string,
    userId: string,
    fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string },
  ) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}/my-progress`,
        {
          method: 'PATCH',
          body: JSON.stringify({ userId, ...fields }),
        },
      )
      setMissions((ms) =>
        ms.map((x) => (x._id === missionId ? { ...data.mission, internalProject: x.internalProject } : x)),
      )
    } catch {
      /* silent */
    }
  }

  const handleStepDescUpdate = async (
    missionId: string,
    projectId: string,
    mission: Mission,
    stepId: string,
    description: string,
  ) => {
    const newSteps = mission.steps.map((s) => (s._id === stepId ? { ...s, description } : s))
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ steps: newSteps }),
        },
      )
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      /* silent */
    }
  }

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!missionForm.projectId) {
      showToast('Sélectionne un projet', 'error')
      return
    }
    if (!missionForm.title.trim()) {
      showToast('Le titre est requis', 'error')
      return
    }
    if (missionForm.assignedTo.length === 0) {
      showToast('Assigne la mission à au moins une personne', 'error')
      return
    }
    setSavingMission(true)
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${missionForm.projectId}/missions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: missionForm.title.trim(),
            description: missionForm.description,
            assignedTo: missionForm.assignedTo,
            dueDate: missionForm.dueDate || null,
          }),
        },
      )
      setMissions((ms) => [data.mission, ...ms])
      setShowMissionForm(false)
      setMissionForm({ projectId: '', title: '', description: '', assignedTo: [], dueDate: '' })
      showToast('Mission créée', 'success')
    } catch (err: any) {
      showToast(err.message || 'Erreur', 'error')
    } finally {
      setSavingMission(false)
    }
  }

  const handleMissionStatusUpdate = async (missionId: string, projectId: string, status: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? { ...x, status: data.mission.status } : x)))
    } catch {
      /* silent */
    }
  }

  const handleMissionToggleStep = async (missionId: string, projectId: string, mission: Mission, stepId: string) => {
    const newSteps = mission.steps.map((s) => (s._id === stepId ? { ...s, done: !s.done } : s))
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ steps: newSteps }),
        },
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      /* silent */
    }
  }

  const handleMissionAddStep = async (
    missionId: string,
    projectId: string,
    mission: Mission,
    title: string,
    assignedTo?: string,
  ) => {
    const newStep: any = { title, done: false }
    if (assignedTo) newStep.assignedTo = assignedTo
    const newSteps = [...mission.steps, newStep]
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ steps: newSteps }),
        },
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
      setMissionStepInputs((s) => ({ ...s, [missionId]: '' }))
      setStepAssigneeInputs((s) => ({ ...s, [missionId]: '' }))
    } catch {
      /* silent */
    }
  }

  const handleMissionFileUpload = async (missionId: string, projectId: string, file: File) => {
    setUploadingMission(missionId)
    const form = new FormData()
    form.append('file', file)
    try {
      const data = await apiUpload<{ mission?: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}/files`,
        form,
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? { ...x, files: data.mission?.files ?? x.files } : x)))
    } catch {
      /* silent */
    } finally {
      setUploadingMission(null)
    }
  }

  const handleMissionFileDelete = async (missionId: string, projectId: string, fileId: string) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}/files/${fileId}`, {
        method: 'DELETE',
      })
      setMissions((m) =>
        m.map((x) => (x._id === missionId ? { ...x, files: x.files.filter((f) => f._id !== fileId) } : x)),
      )
    } catch {
      /* silent */
    }
  }

  const handleMissionFileOpen = async (missionId: string, projectId: string, fileId: string) => {
    try {
      const { blob } = await apiDownload(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}/files/${fileId}`,
      )
      window.open(URL.createObjectURL(blob), '_blank')
    } catch {
      /* silent */
    }
  }

  const handleDeliverableAdd = async (missionId: string, projectId: string, mission: Mission) => {
    const input = deliverableInputs[missionId]
    if (!input?.title?.trim()) return
    const newDeliverable: any = { title: input.title.trim(), description: input.description || '', done: false }
    if (input.assignedTo) newDeliverable.assignedTo = input.assignedTo
    const newDeliverables = [...(mission.deliverables || []), newDeliverable]
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ deliverables: newDeliverables }),
        },
      )
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
      setDeliverableInputs((s) => ({ ...s, [missionId]: { title: '', description: '', assignedTo: '' } }))
    } catch {
      /* silent */
    }
  }

  const handleDeliverableToggle = async (missionId: string, projectId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).map((d) => (d._id === delivId ? { ...d, done: !d.done } : d))
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ deliverables: newDeliverables }),
        },
      )
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      /* silent */
    }
  }

  const handleDeliverableDelete = async (missionId: string, projectId: string, mission: Mission, delivId: string) => {
    const newDeliverables = (mission.deliverables || []).filter((d) => d._id !== delivId)
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ deliverables: newDeliverables }),
        },
      )
      setMissions((ms) => ms.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      /* silent */
    }
  }

  const handleMissionProgressUpdate = async (missionId: string, projectId: string, progress: number) => {
    try {
      await apiFetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ progress }),
      })
      setMissions((ms) => ms.map((x) => (x._id === missionId ? { ...x, progress } : x)))
    } catch {
      /* silent */
    }
  }

  const handleMissionDateUpdate = async (missionId: string, projectId: string, dueDate: string) => {
    try {
      const data = await apiFetch<{ mission: Mission }>(
        `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ dueDate: dueDate || null }),
        },
      )
      setMissions((m) => m.map((x) => (x._id === missionId ? data.mission : x)))
    } catch {
      /* silent */
    }
  }

  return {
    missions,
    setMissions,
    missionsLoading,
    selectedMission,
    setSelectedMission,
    missionStepInputs,
    setMissionStepInputs,
    stepAssigneeInputs,
    setStepAssigneeInputs,
    deliverableInputs,
    setDeliverableInputs,
    expandedStep,
    setExpandedStep,
    uploadingMission,
    fileInputRefs,
    showMissionForm,
    setShowMissionForm,
    missionForm,
    setMissionForm,
    savingMission,
    handleParticipantUpdate,
    handleStepDescUpdate,
    handleCreateMission,
    handleMissionStatusUpdate,
    handleMissionToggleStep,
    handleMissionAddStep,
    handleMissionFileUpload,
    handleMissionFileDelete,
    handleMissionFileOpen,
    handleDeliverableAdd,
    handleDeliverableToggle,
    handleDeliverableDelete,
    handleMissionProgressUpdate,
    handleMissionDateUpdate,
  }
}
