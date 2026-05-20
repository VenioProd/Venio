// ─── User ───
export type UserRole = 'CLIENT' | 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'RH' | 'COMMERCIAL' | 'COMPTABLE' | 'VIEWER' | 'STAGIAIRE' | 'AGENT'
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'RH' | 'COMMERCIAL' | 'COMPTABLE' | 'VIEWER' | 'STAGIAIRE'
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
export type NotificationType =
  | 'TASK_ASSIGNED' | 'TASK_UPDATED'
  | 'PROJECT_UPDATE'
  | 'DOCUMENT_ADDED'
  | 'TICKET_CREATED' | 'TICKET_REPLY' | 'TICKET_STATUS_CHANGED' | 'TICKET_ASSIGNED'
  | 'INTERNAL_MESSAGE'
  | 'DECISION_SUBMITTED' | 'DECISION_APPROVED' | 'DECISION_REJECTED'
  // Stagiaires
  | 'INTERN_CREATED' | 'INTERN_REPORT_SUBMITTED' | 'INTERN_REPORT_UPDATED'
  | 'INTERN_CONVENTION_ADDED' | 'INTERN_CREDENTIALS_SENT'
  // Projets internes
  | 'INTERNAL_PROJECT_CREATED' | 'INTERNAL_MISSION_ASSIGNED'
  | 'INTERNAL_MISSION_REVIEW_REQUESTED' | 'INTERNAL_MISSION_VALIDATED'
  | 'INTERNAL_MISSION_FILE_ADDED'
  // Billing
  | 'BILLING_QUOTE_CREATED' | 'BILLING_INVOICE_CREATED'
  | 'BILLING_DOCUMENT_SENT' | 'BILLING_DOCUMENT_PAID'
  // CRM
  | 'CRM_LEAD_CREATED' | 'CRM_LEAD_ASSIGNED'
  | 'CRM_LEAD_STATUS_CHANGED' | 'CRM_LEAD_CONVERTED'
  // Dev workspace
  | 'DEV_ISSUE_ASSIGNED' | 'DEV_ISSUE_STATUS_CHANGED'
  // Qualiopi
  | 'QUALIOPI_INDICATOR_UPDATED' | 'QUALIOPI_QUESTIONNAIRE_RECEIVED'
  // Clients
  | 'CLIENT_CREATED' | 'CLIENT_NOTE_ADDED'
  // Project items
  | 'PROJECT_ITEM_CREATED' | 'PROJECT_ITEM_VALIDATED'
  // Resources / Tool access
  | 'TOOL_ACCESS_GRANTED' | 'RESOURCE_REQUESTED'
  // Security / Admin
  | 'ADMIN_CREATED' | 'ADMIN_ROLE_CHANGED' | 'ADMIN_PERMISSIONS_CHANGED'
  | 'TWO_FACTOR_ENABLED' | 'TWO_FACTOR_DISABLED'
  | 'AGENT_TOKEN_CREATED' | 'AGENT_TOKEN_REVOKED'
  // Briefs (mission briefs)
  | 'BRIEF_ASSIGNED' | 'BRIEF_STATUS_CHANGED'

// ─── Audit ───
export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'PROFILE_UPDATED'
  | 'TOOL_ACCESS_VIEWED' | 'TOOL_ACCESS_CREATED' | 'TOOL_ACCESS_UPDATED' | 'TOOL_ACCESS_DELETED'
  | 'BRUTE_FORCE_DETECTED' | 'SUSPICIOUS_LOGIN'
  | 'PERMISSION_CHANGED' | 'ACCOUNT_LOCKED' | 'ACCOUNT_UNLOCKED'
  // ── Comptabilité ──
  | 'ACCOUNTING_ENTRY_CREATE' | 'ACCOUNTING_ENTRY_UPDATE'
  | 'ACCOUNTING_ENTRY_VALIDATE' | 'ACCOUNTING_ENTRY_LOCK'
  | 'ACCOUNTING_ENTRY_DELETE' | 'ACCOUNTING_ENTRY_RESTORE'
  | 'FISCAL_YEAR_CLOSE' | 'FISCAL_YEAR_REOPEN'
  | 'VAT_DECLARATION_CREATE' | 'VAT_DECLARATION_SUBMIT' | 'VAT_DECLARATION_DELETE'
  | 'FEC_EXPORT'
  | 'LETTRAGE_APPLY' | 'LETTRAGE_REMOVE'
  | 'CHART_OF_ACCOUNTS_SEED' | 'CHART_OF_ACCOUNTS_DEACTIVATE'
  | 'BILLING_TO_ENTRY' | 'PAYMENT_TO_ENTRY'
  | 'EXTERNAL_SOURCE_CREATE' | 'EXTERNAL_SOURCE_UPDATE'
  | 'EXTERNAL_SOURCE_DELETE' | 'EXTERNAL_SOURCE_ROTATE'
  // ── API Agent (Bearer + scopes) ──
  | 'AGENT_TOKEN_CREATE' | 'AGENT_TOKEN_UPDATE' | 'AGENT_TOKEN_REVOKE'
  | 'AGENT_AUTH_SUCCESS' | 'AGENT_AUTH_FAIL' | 'AGENT_API_MUTATION'

// ─── Agent (API Bearer + scopes) ───
export type AgentTokenStatus = 'ACTIVE' | 'REVOKED'

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
  // ── Comptabilité ──
  | 'view_accounting' | 'manage_accounting' | 'lock_accounting'
  | 'view_vat' | 'manage_vat' | 'export_fec'
  | 'manage_external_sources'
  // ── Dev workspace (suivi développement, type Linear) ──
  | 'view_dev' | 'manage_dev'

// ─── Accounting ───
export type AccountType = 'ACTIF' | 'PASSIF' | 'CHARGE' | 'PRODUIT' | 'CAPITAUX' | 'SPECIAL'
export type JournalType = 'VENTE' | 'ACHAT' | 'BANQUE' | 'CAISSE' | 'OD' | 'AN'
export type FiscalRegime = 'REEL_NORMAL' | 'REEL_SIMPLIFIE' | 'MICRO'
export type VatPeriodicity = 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL'
export type VatRateCode = 'NORMAL' | 'INTERMEDIAIRE' | 'REDUIT' | 'SUPER_REDUIT' | 'EXONERE'
export type FiscalYearStatus = 'OUVERT' | 'CLOTURE'
export type AccountingEntryStatus = 'DRAFT' | 'VALIDATED' | 'LOCKED'
export type AccountingEntrySource = 'MANUAL' | 'BILLING' | 'PAYMENT' | 'EXTERNAL' | 'AN' | 'SYSTEM'
export type VatDeclarationType = 'CA3' | 'CA12'
export type VatDeclarationStatus = 'DRAFT' | 'SUBMITTED'
export type ExternalSourceStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED'
export type ExternalTransactionStatus =
  | 'RECEIVED' | 'CLASSIFIED' | 'POSTED' | 'REJECTED' | 'DUPLICATE' | 'AWAITING_REVIEW'

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
