import type { ProjectSheet, ProjectSheetListItem, ProjectSheetMeta } from '../../../types/projectSheet.types'

/** Données de test des fiches projets (aucun secret réel). */
export function makeSheet(overrides: Partial<ProjectSheet> = {}): ProjectSheet {
  return {
    _id: 'sheet1',
    slug: 'arrow',
    name: 'Arrow',
    logoUrl: '',
    accentColor: '#3366ff',
    status: 'ACTIVE',
    reviewStatus: 'DRAFT',
    archived: false,
    oneLiner: 'Le CRM des organismes de formation.',
    websites: [{ label: 'Site', url: 'https://arrow.example.test' }],
    legalEntity: 'ARROW',
    leadProject: 'ARROW',
    links: [{ type: 'repo', label: 'Code', url: 'https://git.example.test/arrow' }],
    referent: { _id: 'u1', name: 'Raphael', email: 'r@example.test' },
    team: [{ user: { _id: 'u2', name: 'Camille', email: 'c@example.test', role: 'ADMIN' }, role: 'Produit' }],
    devProject: { _id: 'dp1', key: 'ARW', name: 'Arrow dev', href: '/admin/dev/projects/dp1' },
    subsidiaryHref: null,
    whatWeDo: 'Nous aidons **les CFA** à suivre leurs apprentis.',
    audience: '',
    positioning: '',
    brandVoice: '',
    offers: '| Pack | Prix |\n| --- | --- |\n| Start | 49 € |',
    keyFigures: '',
    stack: 'React et Node.',
    roadmap: '',
    decisions: '',
    prospectFaq: '',
    glossary: '',
    demoAccesses: [
      { _id: 'd1', url: 'https://demo.example.test', role: 'Directeur', username: 'demo-dir', notes: 'Données fictives', hasPassword: true },
    ],
    crm: { entity: 'ARROW', leadProject: 'ARROW', openLeads: 4, wonLeads: 2, href: '/admin/crm?project=ARROW' },
    history: [{ at: '2026-11-01T10:00:00.000Z', by: { _id: 'u1', name: 'Raphael' }, fields: ['positioning', 'status'], summary: 'Mise à jour' }],
    canEdit: true,
    canReveal: true,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

export function makeListItem(overrides: Partial<ProjectSheetListItem> = {}): ProjectSheetListItem {
  return {
    _id: 'sheet1',
    slug: 'arrow',
    name: 'Arrow',
    logoUrl: '',
    accentColor: '#3366ff',
    status: 'ACTIVE',
    reviewStatus: 'DRAFT',
    archived: false,
    oneLiner: 'Le CRM des organismes de formation.',
    legalEntity: 'ARROW',
    referent: { _id: 'u1', name: 'Raphael' },
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  }
}

export const META: ProjectSheetMeta = {
  statuses: ['ACTIVE', 'LAUNCHING', 'PAUSED'],
  reviewStatuses: ['DRAFT', 'TO_COMPLETE', 'VALIDATED'],
  entities: ['VENIO', 'CREATIO', 'DECISIO', 'FORMATIO', 'ARROW'],
  leadProjects: ['ARROW'],
  linkTypes: ['repo', 'app', 'docs', 'nextcloud', 'design', 'other'],
  sectionKeys: ['whatWeDo'],
  canEdit: true,
  canReveal: true,
  members: [
    { _id: 'u1', name: 'Raphael', email: 'r@example.test', role: 'SUPER_ADMIN' },
    { _id: 'u2', name: 'Camille', email: 'c@example.test', role: 'ADMIN' },
  ],
  devProjects: [{ _id: 'dp1', key: 'ARW', name: 'Arrow dev' }],
}
