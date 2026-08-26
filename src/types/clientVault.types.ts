export type ClientVaultDocumentType = 'DEVIS' | 'FACTURE' | 'CONTRAT' | 'LIVRABLE' | 'FICHIER_PROJET'
export type ClientVaultSource = 'BILLING' | 'PROJECT_ITEM' | 'DOCUMENT'

export interface ClientVaultDocument {
  id: string
  source: ClientVaultSource
  type: ClientVaultDocumentType
  title: string
  project: { id: string; name: string }
  date: string
  size: number | null
  mimeType: string | null
  downloadUrl: string
}

export type ClientActionItemType = 'DEVIS_A_SIGNER' | 'FACTURE_A_PAYER' | 'ETAPE_A_VALIDER' | 'DEMANDE_A_CONFIRMER'

export interface ClientActionItem {
  type: ClientActionItemType
  title: string
  detail: string
  project: { id: string; name: string }
  link: string
  dueAt: string | null
  amount: number | null
  createdAt: string
}

export type ClientUploadCategory = 'LOGO' | 'TEXTE' | 'PHOTO' | 'BRIEF' | 'AUTRE'

export interface ClientUploadFile {
  id: string
  project: string | null
  category: ClientUploadCategory
  note: string
  originalName: string
  mimeType: string
  size: number
  createdAt: string
  downloadedByAdminAt: string | null
}
