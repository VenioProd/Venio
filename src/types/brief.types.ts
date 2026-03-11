export type BriefEntity = 'VENIO' | 'CREATIO' | 'DECISIO' | 'FORMATIO'
export type BriefPriority = 'P1' | 'P2' | 'P3'
export type BriefStatus = 'A_FAIRE' | 'EN_COURS' | 'EN_REVIEW' | 'VALIDE' | 'LIVRE' | 'NON_VALIDE' | 'A_AMELIORER'

export interface MissionBrief {
  _id: string
  project: { _id: string; name: string } | string
  task: string | null
  destinataire: { _id: string; name: string; email: string } | string
  entity: BriefEntity
  briefPriority: BriefPriority
  deadline: string
  intitule: string
  contexte: string
  livrablesAttendus: string
  formatLivrable: string[]
  ressources: string
  pointsVigilance: string
  pointIntermediaire: string | null
  validationPar: { _id: string; name: string; email: string } | string | null
  statut: BriefStatus
  datesCles: { label: string; date: string }[]
  commentaires: string
  createdBy: { _id: string; name: string; email: string } | string
  createdAt: string
  updatedAt: string
}
