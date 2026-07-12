import type { Dispatch, SetStateAction } from 'react'
import type { Mission } from './types'
import MissionDeliverables from './MissionDeliverables'
import MissionFilesAndActions from './MissionFilesAndActions'
import MissionParticipants from './MissionParticipants'
import MissionProgress from './MissionProgress'
import MissionSteps from './MissionSteps'

type DeliverableInput = { title: string; description: string; assignedTo: string }

interface MissionDetailProps {
  projectId?: string
  mission: Mission
  isSuperAdmin: boolean
  currentUserId?: string
  onProgressUpdate: (missionId: string, progress: number) => void
  onParticipantUpdate: (
    missionId: string,
    userId: string,
    fields: { progress?: number; status?: string; blocked?: boolean; blockedReason?: string },
  ) => void
  expandedStep: string | null
  setExpandedStep: Dispatch<SetStateAction<string | null>>
  stepInputs: Record<string, string>
  setStepInputs: Dispatch<SetStateAction<Record<string, string>>>
  stepAssigneeInputs: Record<string, string>
  setStepAssigneeInputs: Dispatch<SetStateAction<Record<string, string>>>
  onToggleStep: (missionId: string, mission: Mission, stepId: string) => void
  onAddStep: (missionId: string, mission: Mission, title: string, assignedTo?: string) => void
  onDeleteStep: (missionId: string, mission: Mission, stepId: string) => void
  onStepDescriptionUpdate: (missionId: string, mission: Mission, stepId: string, description: string) => void
  onRequestReview: (missionId: string, stepId: string) => void
  onValidateStep: (missionId: string, stepId: string) => void
  deliverableInputs: Record<string, DeliverableInput>
  setDeliverableInputs: Dispatch<SetStateAction<Record<string, DeliverableInput>>>
  onAddDeliverable: (missionId: string, mission: Mission) => void
  onToggleDeliverable: (missionId: string, mission: Mission, deliverableId: string) => void
  onDeleteDeliverable: (missionId: string, mission: Mission, deliverableId: string) => void
  onFileInputRef: (missionId: string, input: HTMLInputElement | null) => void
  onSelectFile: (missionId: string) => void
  uploadingFile: Record<string, boolean>
  onUploadFile: (missionId: string, file: File) => void
  onDeleteFile: (missionId: string, fileId: string) => void
  onMissionStatusChange: (missionId: string, status: string) => void
  onDeleteMission: (missionId: string) => void
}

export default function MissionDetail({
  projectId,
  mission,
  isSuperAdmin,
  currentUserId,
  onProgressUpdate,
  onParticipantUpdate,
  expandedStep,
  setExpandedStep,
  stepInputs,
  setStepInputs,
  stepAssigneeInputs,
  setStepAssigneeInputs,
  onToggleStep,
  onAddStep,
  onDeleteStep,
  onStepDescriptionUpdate,
  onRequestReview,
  onValidateStep,
  deliverableInputs,
  setDeliverableInputs,
  onAddDeliverable,
  onToggleDeliverable,
  onDeleteDeliverable,
  onFileInputRef,
  onSelectFile,
  uploadingFile,
  onUploadFile,
  onDeleteFile,
  onMissionStatusChange,
  onDeleteMission,
}: MissionDetailProps) {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <MissionProgress mission={mission} isSuperAdmin={isSuperAdmin} onProgressUpdate={onProgressUpdate} />
      <MissionParticipants
        mission={mission}
        isSuperAdmin={isSuperAdmin}
        currentUserId={currentUserId}
        onParticipantUpdate={onParticipantUpdate}
      />
      <MissionSteps
        mission={mission}
        isSuperAdmin={isSuperAdmin}
        expandedStep={expandedStep}
        setExpandedStep={setExpandedStep}
        stepInputs={stepInputs}
        setStepInputs={setStepInputs}
        stepAssigneeInputs={stepAssigneeInputs}
        setStepAssigneeInputs={setStepAssigneeInputs}
        onToggleStep={onToggleStep}
        onAddStep={onAddStep}
        onDeleteStep={onDeleteStep}
        onStepDescriptionUpdate={onStepDescriptionUpdate}
        onRequestReview={onRequestReview}
        onValidateStep={onValidateStep}
      />
      <MissionDeliverables
        mission={mission}
        isSuperAdmin={isSuperAdmin}
        deliverableInputs={deliverableInputs}
        setDeliverableInputs={setDeliverableInputs}
        onAdd={onAddDeliverable}
        onToggle={onToggleDeliverable}
        onDelete={onDeleteDeliverable}
      />
      <MissionFilesAndActions
        projectId={projectId}
        mission={mission}
        isSuperAdmin={isSuperAdmin}
        onFileInputRef={onFileInputRef}
        onSelectFile={onSelectFile}
        uploadingFile={uploadingFile}
        onUpload={onUploadFile}
        onDeleteFile={onDeleteFile}
        onStatusChange={onMissionStatusChange}
        onDeleteMission={onDeleteMission}
      />
    </div>
  )
}
