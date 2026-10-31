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
import type { MessageKey } from '../../../i18n'

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

export const TABS: { id: string; labelKey: MessageKey }[] = [
  { id: 'overview', labelKey: 'adminAccess.clientDetail.tabOverview' },
  { id: 'cloud', labelKey: 'adminAccess.clientDetail.tabCloud' },
  { id: 'projects', labelKey: 'adminAccess.clientDetail.tabProjects' },
  { id: 'deliverables', labelKey: 'adminAccess.clientDetail.tabDeliverables' },
  { id: 'contacts', labelKey: 'adminAccess.clientDetail.tabContacts' },
  { id: 'notes', labelKey: 'adminAccess.clientDetail.tabNotes' },
  { id: 'files', labelKey: 'adminAccess.clientDetail.tabFiles' },
  { id: 'billing', labelKey: 'adminAccess.clientDetail.tabBilling' },
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

export const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  PROSPECT: 'adminAccess.clientDetail.statusProspect',
  ACTIF: 'adminAccess.clientDetail.statusActive',
  EN_PAUSE: 'adminAccess.clientDetail.statusPaused',
  CLOS: 'adminAccess.clientDetail.statusClosed',
  ARCHIVE: 'adminAccess.clientDetail.statusArchived',
}

export const HEALTH_LABEL_KEYS: Record<string, MessageKey> = {
  BON: 'adminAccess.clientDetail.healthGood',
  ATTENTION: 'adminAccess.clientDetail.healthWarning',
  CRITIQUE: 'adminAccess.clientDetail.healthCritical',
}
