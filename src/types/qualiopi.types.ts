export type QualiopiStatus = 'A_FAIRE' | 'EN_COURS' | 'FAIT' | 'BLOQUE' | 'NON_CONCERNE'

export interface QualiopiFile {
  _id: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  uploadedAt: string
}

export interface QualiopiSubElement {
  _id: string
  title: string
  status: QualiopiStatus
  assignee: { _id: string; name: string; email: string } | null
  dueDate: string | null
  files: QualiopiFile[]
  notes: string
  order: number
}

export interface QualiopiIndicator {
  _id: string
  number: number
  title: string
  status: QualiopiStatus
  assignee: { _id: string; name: string; email: string } | null
  startDate: string | null
  endDate: string | null
  subElements: QualiopiSubElement[]
  files: QualiopiFile[]
  order: number
}

export interface QualiopiCriterion {
  _id: string
  number: number
  title: string
  objective: string
  indicators: QualiopiIndicator[]
  createdAt: string
  updatedAt: string
}
