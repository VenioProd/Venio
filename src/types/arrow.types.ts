export type ArrowSchoolStatus =
  | 'A_PROSPECTER'
  | 'CONTACTE'
  | 'REPONSE'
  | 'DEMO_PLANIFIEE'
  | 'DEMO_FAITE'
  | 'PROPOSITION'
  | 'SIGNE'
  | 'NON_INTERESSE'

export type ArrowSchoolType = 'LYCEE' | 'BTS_IUT' | 'UNIVERSITE' | 'ECOLE_SUP' | 'CFA' | 'AUTRE'
export type ArrowTemperature = 'FROID' | 'TIEDE' | 'CHAUD' | 'TRES_CHAUD'

export interface ArrowSchoolAssignee {
  _id: string
  name: string
  email: string
}

export interface ArrowRelance {
  date: string | null
  done: boolean
  note: string
}

export interface ArrowSchool {
  _id: string
  name: string
  schoolType: ArrowSchoolType
  city: string
  region: string
  studentCount: number | null
  emailGeneral: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  status: ArrowSchoolStatus
  temperature: ArrowTemperature
  source: string
  notes: string
  nextActionAt: string | null
  lastContactAt: string | null
  statusChangedAt: string | null
  assignedTo: ArrowSchoolAssignee | null
  createdBy: ArrowSchoolAssignee | null
  relances: ArrowRelance[]
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface ArrowSchoolFormData {
  name: string
  schoolType: string
  city: string
  region: string
  studentCount: string
  emailGeneral: string
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  status: string
  temperature: string
  source: string
  notes: string
  nextActionAt: string
  lastContactAt: string
  assignedTo: string
  relances: ArrowRelance[]
}
