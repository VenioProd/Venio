// ─── User ───
export type UserRole = 'CLIENT' | 'SUPER_ADMIN' | 'ADMIN' | 'RH' | 'VIEWER'
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'RH' | 'VIEWER'
export type ClientStatus = 'PROSPECT' | 'ACTIF' | 'EN_PAUSE' | 'CLOS' | 'ARCHIVE'
export type OnboardingStatus = 'A_FAIRE' | 'EN_COURS' | 'TERMINE'
export type HealthStatus = 'EXCELLENT' | 'BON' | 'ATTENTION' | 'CRITIQUE'
export type UserSource = 'REFERRAL' | 'INBOUND' | 'OUTBOUND' | 'PARTNER' | 'AUTRE'

// ─── Project ───
export type ProjectStatus = 'EN_COURS' | 'EN_ATTENTE' | 'TERMINE'
export type ProjectPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
export type BillingStatus = 'NON_FACTURE' | 'PARTIEL' | 'FACTURE'

// ─── Task ───
export type TaskStatus = 'A_FAIRE' | 'EN_COURS' | 'EN_REVIEW' | 'TERMINE' | 'VALIDE' | 'NON_VALIDE' | 'A_MODIFIER'
export type TaskPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'

// ─── CRM ───
export type CrmStatus = 'LEAD' | 'QUALIFIED' | 'CONTACTED' | 'DEMO' | 'PROPOSAL' | 'WON' | 'LOST'
export type LeadTemperature = 'FROID' | 'TIEDE' | 'CHAUD' | 'TRES_CHAUD'

// ─── Project Items ───
export type ItemType = 'LIVRABLE' | 'DEVIS' | 'FACTURE' | 'CONTRAT' | 'CAHIER_DES_CHARGES' | 'MAQUETTE' | 'DOCUMENTATION' | 'LIEN' | 'NOTE' | 'AUTRE'
export type ItemStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'VALIDE'
export type DocumentType = 'DEVIS' | 'FACTURE' | 'FICHIER_PROJET'

// ─── Billing ───
export type BillingDocumentType = 'QUOTE' | 'INVOICE'
export type BillingDocumentStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'ACCEPTED' | 'PAID' | 'CANCELLED'

// ─── Activity ───
export type ActivityAction =
  | 'PROJECT_CREATED' | 'PROJECT_UPDATED' | 'PROJECT_ARCHIVED' | 'PROJECT_UNARCHIVED'
  | 'STATUS_CHANGED' | 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_MOVED' | 'TASK_DELETED'
  | 'TASK_COMMENT_ADDED' | 'DOCUMENT_UPLOADED' | 'SECTION_CREATED' | 'SECTION_DELETED'
  | 'ITEM_CREATED' | 'ITEM_DELETED' | 'UPDATE_POSTED' | 'BILLING_CREATED'

// ─── Notification ───
export type NotificationType = 'TASK_ASSIGNED' | 'TASK_UPDATED' | 'PROJECT_UPDATE' | 'DOCUMENT_ADDED' | 'TICKET_CREATED' | 'TICKET_REPLY' | 'INTERNAL_MESSAGE'

// ─── Audit ───
export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'PROFILE_UPDATED'
  | 'TOOL_ACCESS_VIEWED' | 'TOOL_ACCESS_CREATED' | 'TOOL_ACCESS_UPDATED' | 'TOOL_ACCESS_DELETED'
  | 'BRUTE_FORCE_DETECTED' | 'SUSPICIOUS_LOGIN'
  | 'PERMISSION_CHANGED' | 'ACCOUNT_LOCKED' | 'ACCOUNT_UNLOCKED'

// ─── Client Note ───
export type NoteVisibility = 'INTERNE'

// ─── Permission ───
export type Permission =
  | 'manage_admins' | 'manage_clients' | 'view_crm' | 'manage_crm'
  | 'view_messaging' | 'send_messages' | 'manage_channels'
  | 'view_projects' | 'edit_projects' | 'view_content' | 'edit_content'
  | 'view_billing' | 'manage_billing' | 'manage_tasks'
  | 'view_qualiopi' | 'manage_qualiopi'
  | 'view_tickets' | 'create_tickets' | 'manage_tickets'

// ─── CRM Settings ───
export type EscalationAction = 'NOTIFY_MANAGER' | 'REASSIGN' | 'BOTH'

// ─── Qualiopi ───
export type QualiopiStatus = 'A_FAIRE' | 'EN_COURS' | 'FAIT' | 'BLOQUE' | 'NON_CONCERNE'

// ─── Mission Brief ───
export type BriefEntity = 'VENIO' | 'CREATIO' | 'DECISIO' | 'FORMATIO'
export type BriefPriority = 'P1' | 'P2' | 'P3'
export type BriefStatus = 'A_FAIRE' | 'EN_COURS' | 'EN_REVIEW' | 'VALIDE' | 'LIVRE' | 'NON_VALIDE' | 'A_AMELIORER'

// ─── Internal Tickets ───
export type TicketCategory = 'QUESTION' | 'DEMANDE' | 'PROBLEME'
export type TicketPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
export type TicketStatus = 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'

// ─── Internal Messaging ───
export type InternalConversationType = 'CHANNEL' | 'DM' | 'GROUP'
export type InternalConversationVisibility = 'PUBLIC' | 'PRIVATE'
export type InternalConversationRole = 'OWNER' | 'MEMBER'
