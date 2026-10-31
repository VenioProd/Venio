import type { MessageKey } from '../../../i18n'
import type {
  SubsidiaryCredentialCategory,
  SubsidiaryHealth,
  SubsidiaryLinkType,
  SubsidiaryStatus,
} from '../../../types/subsidiary.types'

export const STATUS_LABEL_KEYS = {
  ACTIVE: 'orgs.subsidiary.status.active',
  INCUBATION: 'orgs.subsidiary.status.incubation',
  PAUSE: 'orgs.subsidiary.status.pause',
  ARCHIVED: 'orgs.subsidiary.status.archived',
} as const satisfies Record<SubsidiaryStatus, MessageKey>

export const HEALTH_LABEL_KEYS = {
  GOOD: 'orgs.subsidiary.health.good',
  WATCH: 'orgs.subsidiary.health.watch',
  RISK: 'orgs.subsidiary.health.risk',
} as const satisfies Record<SubsidiaryHealth, MessageKey>

export const LINK_TYPE_LABEL_KEYS = {
  repo: 'orgs.subsidiary.linkType.repo',
  production: 'orgs.subsidiary.linkType.production',
  staging: 'orgs.subsidiary.linkType.staging',
  analytics: 'orgs.subsidiary.linkType.analytics',
  hosting: 'orgs.subsidiary.linkType.hosting',
  dns: 'orgs.subsidiary.linkType.dns',
  ci: 'orgs.subsidiary.linkType.ci',
  design: 'orgs.subsidiary.linkType.design',
  docs: 'orgs.subsidiary.linkType.docs',
  drive: 'orgs.subsidiary.linkType.drive',
  other: 'orgs.subsidiary.linkType.other',
} as const satisfies Record<SubsidiaryLinkType, MessageKey>

export const CREDENTIAL_CATEGORY_LABEL_KEYS = {
  admin: 'orgs.subsidiary.credCategory.admin',
  service: 'orgs.subsidiary.credCategory.service',
  api: 'orgs.subsidiary.credCategory.api',
  db: 'orgs.subsidiary.credCategory.db',
  other: 'orgs.subsidiary.credCategory.other',
} as const satisfies Record<SubsidiaryCredentialCategory, MessageKey>
