export type { IUserAddress, IUser } from './user.js'

export type {
  IProjectDeadline,
  IProjectBudget,
  IProjectBilling,
  IProject,
  IProjectMember,
  IProjectInvitation,
  IProjectSection,
  IProjectItemFile,
  IProjectItem,
  ITemplateSection,
  ITemplateTask,
  ITemplateBudget,
  IProjectTemplate,
  IProjectUpdate,
} from './project.js'

export type { ITaskAttachment, ITask, ITaskComment } from './task.js'

export type { ILead, ILeadActivity } from './lead.js'

export type { IBillingLine, IBillingDocument } from './billing.js'

export type {
  QuoteProposalStatus,
  QuoteQuestionType,
  IQuoteQuestion,
  IQuoteAnswer,
  IQuoteLine,
  IQuoteSignature,
  IQuoteSpecification,
  IQuoteProposal,
} from './quote.js'

export type { IClientActivity, IClientContact, IClientNote, IScoringWeights, ICrmSettings } from './crm.js'

export type { IBriefDateCle, IMissionBrief } from './brief.js'

export type {
  IQualiopiSubElement,
  IQualiopiIndicator,
  IQualiopiCriterion,
  IQualiopiQuestion,
  IQualiopiAnswer,
  IQualiopiQuestionnaireResponse,
  IQualiopiQuestionnaire,
} from './qualiopi.js'

export type { ISequence, IActivityLog, IAuditLog, IDocument, IMessage, INotification } from './common.js'

export type {
  IAddress,
  IIban,
  ICompanySettings,
  IFiscalYear,
  IAuxiliaryRef,
  IChartOfAccount,
  IJournal,
  IVatRate,
  ISourceRef,
  IAccountingEntry,
  IAccountingLine,
  IVatLine,
  IVatRateBreakdown,
  IVatDeclaration,
  IExternalSource,
  IExternalTransaction,
  IRuleConditions,
  IRuleMapping,
  IClassificationRule,
} from './accounting.js'

export type { IAgentToken, IAgentIdempotencyKey } from './agent.js'

export type {
  IInternalConversation,
  IInternalConversationMember,
  IInternalMessageAttachment,
  IInternalMessageReaction,
  IInternalMessage,
} from './messaging.js'

export type {
  PersonalTaskStatus,
  PersonalTaskPriority,
  WorkspaceNoteType,
  WorkspaceNoteStatus,
  IWorkspaceWidget,
  IWorkspaceShortcut,
  IWorkspaceLayout,
  IPersonalTask,
  IWorkspaceNote,
} from './workspace.js'
