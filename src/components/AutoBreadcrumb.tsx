import { useLocation, Link } from 'react-router-dom'
import './Breadcrumb.css'

/**
 * Auto-generated breadcrumb based on URL pathname (parses `/admin/...` segments).
 * Wraps the same look-and-feel as the original source breadcrumb. Coexists with
 * the props-based `Breadcrumb` already shipped on the target — we avoid clobbering
 * the existing API by exposing a dedicated component for the admin shell.
 */

interface SegmentMapping {
  label: string
  to: string | null
}

const SEGMENT_LABELS: Record<string, SegmentMapping> = {
  admin: { label: 'Admin', to: '/admin' },
  'comptes-clients': { label: 'Clients', to: '/admin/comptes-clients' },
  'comptes-admin': { label: 'Admins', to: '/admin/comptes-admin' },
  projets: { label: 'Projets', to: null },
  crm: { label: 'CRM', to: '/admin/crm' },
  comptabilite: { label: 'Comptabilité', to: '/admin/comptabilite' },
  ecritures: { label: 'Écritures', to: '/admin/comptabilite/ecritures' },
  'grand-livre': { label: 'Grand livre', to: '/admin/comptabilite/grand-livre' },
  balance: { label: 'Balance', to: '/admin/comptabilite/balance' },
  bilan: { label: 'Bilan', to: '/admin/comptabilite/bilan' },
  resultat: { label: 'Compte de résultat', to: '/admin/comptabilite/resultat' },
  lettrage: { label: 'Lettrage', to: '/admin/comptabilite/lettrage' },
  tva: { label: 'TVA', to: '/admin/comptabilite/tva' },
  fec: { label: 'FEC', to: '/admin/comptabilite/fec' },
  'plan-comptable': { label: 'Plan comptable', to: '/admin/comptabilite/plan-comptable' },
  journaux: { label: 'Journaux', to: '/admin/comptabilite/journaux' },
  parametres: { label: 'Paramètres', to: '/admin/comptabilite/parametres' },
  audit: { label: 'Audit', to: '/admin/comptabilite/audit' },
  'sources-externes': { label: 'Sources externes', to: '/admin/comptabilite/sources-externes' },
  'file-attente': { label: "File d'attente", to: '/admin/comptabilite/file-attente' },
  nouveau: { label: 'Nouveau', to: null },
  nouvelle: { label: 'Nouvelle', to: null },
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
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  if (segments.length === 0 || segments[0] !== 'admin') return null

  const crumbs: BreadcrumbItem[] = []
  let path = ''
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    path += `/${seg}`

    if (isObjectIdLike(seg) || isNumericId(seg)) {
      crumbs.push({ label: 'Détail', to: null })
      continue
    }

    const mapping = SEGMENT_LABELS[seg]
    if (mapping) {
      crumbs.push({ label: mapping.label, to: mapping.to || path })
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
    <nav className="breadcrumb" aria-label="Fil d'Ariane">
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
                <span className={`breadcrumb-current${isLast ? ' is-last' : ''}`}>
                  {c.label}
                </span>
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
