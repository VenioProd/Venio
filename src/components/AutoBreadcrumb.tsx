import { useLocation, Link } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import { ADMIN_HUBS } from '../lib/adminHubs'
import { CRM_HOME_PATH, CRM_MOMENTS, CRM_PLAN_PATH, resolveCrmTab } from '../lib/crmNavigation'
import './Breadcrumb.css'

/**
 * Auto-generated breadcrumb based on URL pathname (parses `/admin/...` segments).
 * Mapping centralisé des slugs vers leur libellé traduit. Les segments inconnus
 * sont auto-capitalisés. Les identifiants (Mongo ObjectId ou numériques) sont
 * remplacés par "Détail" sans lien.
 */

interface SegmentMapping {
  labelKey: MessageKey
  to: string | null
}

const SEGMENT_LABELS: Record<string, SegmentMapping> = {
  admin: { labelKey: 'shell.breadcrumb.admin', to: '/admin' },
  'mon-espace': { labelKey: 'shell.entry.home', to: '/admin/mon-espace' },
  dashboard: { labelKey: 'shell.navItem.dashboard', to: '/admin/dashboard' },
  'centre-activite': { labelKey: 'shell.navItem.activityCenter', to: '/admin/centre-activite' },
  messages: { labelKey: 'shell.navItem.messages', to: '/admin/messages' },
  'demandes-clients': { labelKey: 'shell.entry.requests', to: '/admin/demandes-clients' },
  'commerciaux-externes': { labelKey: 'shell.navItem.externalSales', to: '/admin/commerciaux-externes' },
  dev: { labelKey: 'shell.entry.dev', to: '/admin/dev' },
  beta: { labelKey: 'shell.navItem.beta', to: '/admin/beta' },
  education: { labelKey: 'shell.navItem.education', to: '/admin/education' },
  health: { labelKey: 'shell.entry.system', to: '/admin/health' },
  decisions: { labelKey: 'shell.navItem.decisions', to: '/admin/decisions' },
  agents: { labelKey: 'shell.navItem.agents', to: '/admin/agents' },
  webhooks: { labelKey: 'shell.navItem.webhooks', to: '/admin/webhooks' },
  filiales: { labelKey: 'shell.navItem.subsidiaries', to: '/admin/filiales' },
  fiches: { labelKey: 'shell.breadcrumb.projectSheets', to: '/admin/projets/fiches' },
  'comptes-clients': { labelKey: 'shell.breadcrumb.clientAccounts', to: '/admin/comptes-clients' },
  'comptes-admin': { labelKey: 'shell.breadcrumb.adminAccounts', to: '/admin/comptes-admin' },
  crm: { labelKey: 'shell.breadcrumb.crm', to: CRM_HOME_PATH },
  comptabilite: { labelKey: 'shell.breadcrumb.accounting', to: '/admin/comptabilite' },
  ecritures: { labelKey: 'shell.breadcrumb.entries', to: '/admin/comptabilite/ecritures' },
  'grand-livre': { labelKey: 'shell.breadcrumb.generalLedger', to: '/admin/comptabilite/grand-livre' },
  balance: { labelKey: 'shell.breadcrumb.trialBalance', to: '/admin/comptabilite/balance' },
  bilan: { labelKey: 'shell.breadcrumb.balanceSheet', to: '/admin/comptabilite/bilan' },
  resultat: { labelKey: 'shell.breadcrumb.incomeStatement', to: '/admin/comptabilite/resultat' },
  tva: { labelKey: 'shell.breadcrumb.vat', to: '/admin/comptabilite/tva' },
  fec: { labelKey: 'shell.breadcrumb.fec', to: '/admin/comptabilite/fec' },
  lettrage: { labelKey: 'shell.breadcrumb.reconciliation', to: '/admin/comptabilite/lettrage' },
  'plan-comptable': { labelKey: 'shell.breadcrumb.chartOfAccounts', to: '/admin/comptabilite/plan-comptable' },
  beneficiaires: { labelKey: 'shell.breadcrumb.beneficiaries', to: '/admin/comptabilite/beneficiaires' },
  'modeles-repartition': {
    labelKey: 'shell.breadcrumb.allocationTemplates',
    to: '/admin/comptabilite/modeles-repartition',
  },
  'mon-releve': { labelKey: 'shell.breadcrumb.myStatement', to: '/admin/mon-releve' },
  journaux: { labelKey: 'shell.breadcrumb.journals', to: '/admin/comptabilite/journaux' },
  parametres: { labelKey: 'shell.breadcrumb.settings', to: null },
  settings: { labelKey: 'shell.breadcrumb.settings', to: null },
  'sources-externes': { labelKey: 'shell.breadcrumb.externalSources', to: '/admin/comptabilite/sources-externes' },
  'file-attente': { labelKey: 'shell.breadcrumb.queue', to: '/admin/comptabilite/file-attente' },
  audit: { labelKey: 'shell.breadcrumb.audit', to: null },
  projets: { labelKey: 'shell.breadcrumb.projects', to: null },
  gestion: { labelKey: 'shell.navItem.projects', to: '/admin/gestion' },
  qualiopi: { labelKey: 'shell.breadcrumb.qualiopi', to: '/admin/qualiopi' },
  tickets: { labelKey: 'shell.breadcrumb.tickets', to: '/admin/tickets' },
  stagiaires: { labelKey: 'shell.breadcrumb.team', to: '/admin/stagiaires' },
  'projets-internes': { labelKey: 'shell.breadcrumb.internalProjects', to: '/admin/projets-internes' },
  ressources: { labelKey: 'shell.breadcrumb.resources', to: '/admin/ressources' },
  'acces-outils': { labelKey: 'shell.breadcrumb.toolAccess', to: '/admin/acces-outils' },
  'mes-rapports': { labelKey: 'shell.breadcrumb.myReports', to: '/admin/mes-rapports' },
  analytics: { labelKey: 'shell.breadcrumb.analytics', to: '/admin/analytics' },
  calendrier: { labelKey: 'shell.breadcrumb.calendar', to: '/admin/calendrier' },
  templates: { labelKey: 'shell.breadcrumb.templates', to: '/admin/templates' },
  emails: { labelKey: 'shell.breadcrumb.emails', to: '/admin/emails' },
  guide: { labelKey: 'shell.breadcrumb.guide', to: '/admin/guide' },
  profil: { labelKey: 'shell.breadcrumb.profile', to: '/admin/profil' },
  nouveau: { labelKey: 'shell.breadcrumb.newMasculine', to: null },
  nouvelle: { labelKey: 'shell.breadcrumb.newFeminine', to: null },
}

const HUB_LABELS: Record<string, MessageKey> = Object.fromEntries([
  ...Object.entries(ADMIN_HUBS).flatMap(([id, hub]) => [
    ...hub.tabs.map((tab) => [tab.to, tab.labelKey]),
    [`/admin/${id}`, hub.titleKey],
  ]),
  ...CRM_MOMENTS.map((moment) => [moment.to, moment.labelKey]),
  [CRM_PLAN_PATH, 'shell.crm.plan'],
])

/** Liens de miettes qui ne pointent pas sur leur propre chemin. */
const CRUMB_TARGETS: Record<string, string> = {
  // `/admin/crm` redirige vers le pipeline (anciens liens) : la miette « CRM » mène à son accueil.
  '/admin/crm': CRM_HOME_PATH,
}

/**
 * La fiche d'un lead se range sous l'onglet qui l'a ouverte (pipeline par
 * défaut, file de travail avec `from=queue|semaine|filer`).
 */
function crumbSegments(pathname: string, search: string): string[] {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] === 'admin' && segments[1] === 'crm' && segments[2] === 'leads' && segments.length > 3) {
    const tab = resolveCrmTab(pathname, search)
    if (tab) return [...tab.to.split('/').filter(Boolean), ...segments.slice(3)]
  }
  return segments
}

function isObjectIdLike(segment: string): boolean {
  return /^[a-f0-9]{24}$/i.test(segment)
}

function isNumericId(segment: string): boolean {
  return /^\d+$/.test(segment)
}

interface BreadcrumbItem {
  label: string
  to: string | null
}

export interface AutoBreadcrumbProps {
  extra?: BreadcrumbItem[]
}

const AutoBreadcrumb = ({ extra = [] }: AutoBreadcrumbProps) => {
  const { t } = useI18n()
  const location = useLocation()
  const segments = crumbSegments(location.pathname, location.search)

  if (segments.length === 0 || segments[0] !== 'admin') return null

  // L'accueil possède aussi un titre dans la nouvelle topbar.
  if (segments.length === 1 && extra.length === 0) segments.push('mon-espace')

  const crumbs: BreadcrumbItem[] = []
  let path = ''
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    path += `/${seg}`

    if (isObjectIdLike(seg) || isNumericId(seg)) {
      crumbs.push({ label: t('shell.breadcrumb.detail'), to: null })
      continue
    }

    const hubLabel = HUB_LABELS[path]
    const mapping = SEGMENT_LABELS[seg]
    if (hubLabel) {
      crumbs.push({ label: t(hubLabel), to: CRUMB_TARGETS[path] ?? path })
    } else if (mapping) {
      crumbs.push({ label: t(mapping.labelKey), to: mapping.to || path })
    } else {
      crumbs.push({
        label: seg.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        to: path,
      })
    }
  }

  for (const e of extra) crumbs.push(e)

  if (crumbs.length === 0) return null

  return (
    <nav className="breadcrumb" aria-label={t('shell.breadcrumb.ariaLabel')}>
      <ol className="breadcrumb-list">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={`${c.label}-${i}`} className="breadcrumb-item">
              {!isLast && c.to ? (
                <Link to={c.to} className="breadcrumb-link">
                  {c.label}
                </Link>
              ) : (
                <span className={`breadcrumb-current${isLast ? ' is-last' : ''}`}>{c.label}</span>
              )}
              {!isLast && (
                <span className="breadcrumb-sep" aria-hidden>
                  /
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default AutoBreadcrumb
