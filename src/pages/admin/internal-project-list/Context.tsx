/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext } from 'react'
import type { Project, Mission, Member } from './types'

export interface InternalProjectListCtx {
  viewTab: 'arrow' | 'projects' | 'missions'
  setViewTab: (v: 'arrow' | 'projects' | 'missions') => void
  projects: Project[]
  filtered: Project[]
  loading: boolean
  filterStatus: string
  setFilterStatus: (v: string) => void
  filterEntity: string
  setFilterEntity: (v: string) => void
  setDeleteTarget: (id: string | null) => void
  setEditTarget: (p: Project | null) => void
  setForm: any
  setShowForm: (v: boolean) => void
  missions: Mission[]
  missionsLoading: boolean
  setSelectedMission: (id: string | null) => void
  setShowMissionForm: (v: boolean) => void
  setMissionForm: any
  arrowPilotage: any
  arrowScorecardStates: Record<number, boolean>
  setArrowScorecardStates: any
  openArrowSectionEditor: (s: any) => void
  arrowActiveProjects: Project[]
  arrowMissions: Mission[]
  arrowCompletedMissions: Mission[]
  arrowBlockedMissions: Mission[]
  arrowUpcomingMissions: Mission[]
  arrowAverageProgress: number
  arrowMissionsByStatus: any[]
  arrowDecisions: any[]
  arrowCadence: any[]
  selectedMission: string | null
  handleMissionStatusUpdate: any
  handleMissionProgressUpdate: any
  handleMissionFileUpload: any
  fileInputRefs: { current: Record<string, HTMLInputElement | null> }
  uploadingMission: string | null
  user: { _id?: string } | null
  isSuperAdmin: boolean
  isAdminRole: boolean
  admins: Member[]
  navigate: (path: string) => void
  formatDateTime: (d: string) => string
}

const Context = createContext<InternalProjectListCtx | null>(null)
export const InternalProjectListProvider = Context.Provider

export function useInternalProjectListCtx() {
  const v = useContext(Context)
  if (!v) throw new Error('useInternalProjectListCtx must be used within InternalProjectListProvider')
  return v
}
