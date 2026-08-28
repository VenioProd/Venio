import type {
  Client,
  Contact,
  ContactDraft,
  BillingSummary,
  BillingDocument,
  Deliverable,
  CloudInfo,
} from '../../../types/client.types'
import type { Project } from '../../../types/project.types'
import type { AdminClientFile } from '../../../services/adminClients'

export interface OverviewTabProps {
  client: Client | null
  setClient: React.Dispatch<React.SetStateAction<Client | null>>
  progress: { progressPercent?: number } | null
  projects: Project[]
  deliverables: Deliverable[]
  billingSummary: BillingSummary | null
  saveClientPatch: (patch: Record<string, unknown>) => Promise<void>
}

export interface CloudTabProps {
  cloudInfo: CloudInfo | null
}

export interface ProjectsTabProps {
  projects: Project[]
}

export interface DeliverablesTabProps {
  deliverables: Deliverable[]
}

export interface ContactsTabProps {
  contacts: Contact[]
  contactDraft: ContactDraft
  setContactDraft: React.Dispatch<React.SetStateAction<ContactDraft>>
  addContact: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  removeContact: (contactId: string) => Promise<void>
  saving: boolean
}

export interface BillingTabProps {
  billingSummary: BillingSummary | null
  billingDocuments: BillingDocument[]
}

export interface FilesTabProps {
  files: AdminClientFile[]
  clientId: string
}

export const TABS = [
  { id: 'overview', label: "Vue d'ensemble" },
  { id: 'cloud', label: 'Cloud' },
  { id: 'projects', label: 'Projets' },
  { id: 'deliverables', label: 'Livrables' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'notes', label: 'Échanges' },
  { id: 'files', label: 'Fichiers reçus' },
  { id: 'billing', label: 'Facturation' },
]

export const FOLDER_ICONS: Record<string, string> = {
  Contrats: '📄',
  Devis: '📋',
  Factures: '🧾',
  Livrables: '📦',
  Communication: '💬',
  Briefs: '📝',
  Assets: '🎨',
}

export const STATUS_OPTIONS = ['PROSPECT', 'ACTIF', 'EN_PAUSE', 'CLOS', 'ARCHIVE']
export const HEALTH_OPTIONS = ['BON', 'ATTENTION', 'CRITIQUE']
