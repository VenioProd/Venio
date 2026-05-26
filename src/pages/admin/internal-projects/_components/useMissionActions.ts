import { useCallback, useState } from 'react'
import { apiFetch, getToken } from '@/lib/api'
import type { Mission } from './constants'

interface Options {
  setMissions: React.Dispatch<React.SetStateAction<Mission[]>>
  setMissionStepInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setStepAssigneeInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setDeliverableInputs: React.Dispatch<
    React.SetStateAction<
      Record<string, { title: string; description: string; assignedTo: string }>
    >
  >
  deliverableInputs: Record<string, { title: string; description: string; assignedTo: string }>
}

// Mission-related API call handlers. Extracted from InternalProjectList to
// keep the page component focused on layout & state wiring. The hook also
// owns the `uploadingMission` state since it's only used in tandem with the
// `handleMissionFileUpload` callback.
export function useMissionActions({
  setMissions,
  setMissionStepInputs,
  setStepAssigneeInputs,
  setDeliverableInputs,
  deliverableInputs,
}: Options) {
  const [uploadingMission, setUploadingMission] = useState<string | null>(null)

  const handleParticipantUpdate = useCallback(
    async (
      missionId: string,
      projectId: string,
      userId: string,
      fields: {
        progress?: number
        status?: string
        blocked?: boolean
        blockedReason?: string
      },
    ) => {
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}/my-progress`,
          { method: 'PATCH', body: JSON.stringify({ userId, ...fields }) },
        )
        setMissions(ms =>
          ms.map(x =>
            x._id === missionId ? { ...data.mission, internalProject: x.internalProject } : x,
          ),
        )
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleStepDescUpdate = useCallback(
    async (
      missionId: string,
      projectId: string,
      mission: Mission,
      stepId: string,
      description: string,
    ) => {
      const newSteps = mission.steps.map(s => (s._id === stepId ? { ...s, description } : s))
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ steps: newSteps }) },
        )
        setMissions(ms => ms.map(x => (x._id === missionId ? data.mission : x)))
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleMissionStatusUpdate = useCallback(
    async (missionId: string, projectId: string, status: string) => {
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ status }) },
        )
        setMissions(m =>
          m.map(x => (x._id === missionId ? { ...x, status: data.mission.status } : x)),
        )
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleMissionToggleStep = useCallback(
    async (missionId: string, projectId: string, mission: Mission, stepId: string) => {
      const newSteps = mission.steps.map(s => (s._id === stepId ? { ...s, done: !s.done } : s))
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ steps: newSteps }) },
        )
        setMissions(m => m.map(x => (x._id === missionId ? data.mission : x)))
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleMissionAddStep = useCallback(
    async (
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
          { method: 'PATCH', body: JSON.stringify({ steps: newSteps }) },
        )
        setMissions(m => m.map(x => (x._id === missionId ? data.mission : x)))
        setMissionStepInputs(s => ({ ...s, [missionId]: '' }))
        setStepAssigneeInputs(s => ({ ...s, [missionId]: '' }))
      } catch {
        /* silent */
      }
    },
    [setMissions, setMissionStepInputs, setStepAssigneeInputs],
  )

  const handleMissionFileUpload = useCallback(
    async (missionId: string, projectId: string, file: File) => {
      setUploadingMission(missionId)
      const token = getToken() || ''
      const formData = new FormData()
      formData.append('file', file)
      try {
        const res = await fetch(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}/files`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData },
        )
        const data = await res.json()
        setMissions(m =>
          m.map(x =>
            x._id === missionId ? { ...x, files: data.mission?.files ?? x.files } : x,
          ),
        )
      } catch {
        /* silent */
      } finally {
        setUploadingMission(null)
      }
    },
    [setMissions],
  )

  const handleMissionFileDelete = useCallback(
    async (missionId: string, projectId: string, fileId: string) => {
      try {
        await apiFetch(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}/files/${fileId}`,
          { method: 'DELETE' },
        )
        setMissions(m =>
          m.map(x =>
            x._id === missionId ? { ...x, files: x.files.filter(f => f._id !== fileId) } : x,
          ),
        )
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleMissionFileOpen = useCallback(
    async (missionId: string, projectId: string, fileId: string) => {
      const token = getToken() || ''
      try {
        const res = await fetch(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}/files/${fileId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const blob = await res.blob()
        window.open(URL.createObjectURL(blob), '_blank')
      } catch {
        /* silent */
      }
    },
    [],
  )

  const handleDeliverableAdd = useCallback(
    async (missionId: string, projectId: string, mission: Mission) => {
      const input = deliverableInputs[missionId]
      if (!input?.title?.trim()) return
      const newDeliverable: any = {
        title: input.title.trim(),
        description: input.description || '',
        done: false,
      }
      if (input.assignedTo) newDeliverable.assignedTo = input.assignedTo
      const newDeliverables = [...(mission.deliverables || []), newDeliverable]
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }) },
        )
        setMissions(ms => ms.map(x => (x._id === missionId ? data.mission : x)))
        setDeliverableInputs(s => ({
          ...s,
          [missionId]: { title: '', description: '', assignedTo: '' },
        }))
      } catch {
        /* silent */
      }
    },
    [setMissions, deliverableInputs, setDeliverableInputs],
  )

  const handleDeliverableToggle = useCallback(
    async (missionId: string, projectId: string, mission: Mission, delivId: string) => {
      const newDeliverables = (mission.deliverables || []).map(d =>
        d._id === delivId ? { ...d, done: !d.done } : d,
      )
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }) },
        )
        setMissions(ms => ms.map(x => (x._id === missionId ? data.mission : x)))
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleDeliverableDelete = useCallback(
    async (missionId: string, projectId: string, mission: Mission, delivId: string) => {
      const newDeliverables = (mission.deliverables || []).filter(d => d._id !== delivId)
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ deliverables: newDeliverables }) },
        )
        setMissions(ms => ms.map(x => (x._id === missionId ? data.mission : x)))
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleMissionProgressUpdate = useCallback(
    async (missionId: string, projectId: string, progress: number) => {
      try {
        await apiFetch(`/api/admin/internal-projects/${projectId}/missions/${missionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ progress }),
        })
        setMissions(ms => ms.map(x => (x._id === missionId ? { ...x, progress } : x)))
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  const handleMissionDateUpdate = useCallback(
    async (missionId: string, projectId: string, dueDate: string) => {
      try {
        const data = await apiFetch<{ mission: Mission }>(
          `/api/admin/internal-projects/${projectId}/missions/${missionId}`,
          { method: 'PATCH', body: JSON.stringify({ dueDate: dueDate || null }) },
        )
        setMissions(m => m.map(x => (x._id === missionId ? data.mission : x)))
      } catch {
        /* silent */
      }
    },
    [setMissions],
  )

  return {
    uploadingMission,
    handleParticipantUpdate,
    handleStepDescUpdate,
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
