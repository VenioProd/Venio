import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import allowlist from './portal-style-allowlist.json'

/**
 * Garde-fou de la charte Portail.
 *
 * Spec : docs/superpowers/specs/2026-09-05-charte-pages-privees-design.md
 *
 * Trois règles mécaniques, vérifiées sur les feuilles de style du portail :
 *   1. aucune capitale forcée (`text-transform: uppercase`) ;
 *   2. aucun angle vif (`border-radius: 0`) ;
 *   3. aucune couleur hexadécimale hors palette, et aucune police hors jetons.
 *
 * `portal-style-allowlist.json` liste les fichiers pas encore migrés. Il se vide
 * lot après lot. Un fichier qui passe toutes les règles doit en sortir : le test
 * échoue tant qu'il y reste, pour que la liste ne puisse que décroître.
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** Les 36 feuilles couvertes par la charte. */
export const PORTAL_STYLESHEETS = [
  'src/components/AdminCommandPalette.css',
  'src/components/AdminShell.css',
  'src/components/AdminSidebar.css',
  'src/components/ClientShell.css',
  'src/components/ClientSidebar.css',
  'src/components/admin/InteractionTimeline/InteractionTimeline.css',
  'src/components/admin/RevenueChain.css',
  'src/components/dashboard/dashboard.css',
  'src/pages/admin/AdminPortal.css',
  'src/pages/admin/Messaging.css',
  'src/pages/admin/Subsidiaries.css',
  'src/pages/admin/accounting/AccountingPortal.css',
  'src/pages/admin/analytics/crm/PilotageSection.css',
  'src/pages/admin/beta/Beta.css',
  'src/pages/admin/dev-workspace/AgentLaunchControl.css',
  'src/pages/admin/dev-workspace/CommandPalette.css',
  'src/pages/admin/dev-workspace/DevProjectCockpit.css',
  'src/pages/admin/dev-workspace/DevWorkspace.css',
  'src/pages/admin/dev-workspace/RecommendationsPanel.css',
  'src/pages/admin/dev-workspace/ReviewQueue.css',
  'src/pages/admin/education/CorrectionMode.css',
  'src/pages/admin/education/EducationWorkspace.css',
  'src/pages/admin/education/SessionLiveMode.css',
  'src/pages/admin/mon-espace/MonEspace.css',
  'src/pages/beta/BetaTester.css',
  'src/pages/espace-client/ClientPortal.css',
  'src/styles/activity-timeline.css',
  'src/styles/analytics.css',
  'src/styles/calendar.css',
  'src/styles/file-dropzone.css',
  'src/styles/gestion.css',
  'src/styles/notifications.css',
  'src/styles/portail.css',
  'src/styles/project-chat.css',
  'src/styles/search-modal.css',
  'src/styles/task-board.css',
] as const

/** Palette de la section 4 de la spec. Seuls hexadécimaux tolérés. */
const PALETTE = new Set(
  [
    '#0a0c0f',
    '#141a20',
    '#1b242c',
    '#202a33',
    '#e8eef3',
    '#9daab3',
    '#7b8894',
    '#06202b',
    '#7fdba0',
    '#f7c268',
    '#f4a06a',
    '#ff8a8a',
  ].map((h) => h.toLowerCase()),
)

/** `portail.css` déclare la palette : c'est le seul site de définition. */
const DEFINITION_FILE = 'src/styles/portail.css'

/** Retire les data-URI (SVG inline) où les couleurs sont inévitables. */
const stripDataUris = (css: string) => css.replace(/url\((['"]?)data:[^)]*\1\)/gi, 'url()')

interface Violation {
  rule: string
  sample: string
}

function violations(path: string): Violation[] {
  const css = stripDataUris(read(path))
  const found: Violation[] = []

  const upper = css.match(/text-transform:\s*uppercase/i)
  if (upper) found.push({ rule: 'capitale forcée', sample: upper[0] })

  const sharp = css.match(/border-radius:\s*0(?![.\d])/i)
  if (sharp) found.push({ rule: 'angle vif', sample: sharp[0] })

  // Les rayons viennent de l'échelle, pas de valeurs en dur. `50%` et les
  // pourcentages restent autorisés pour les avatars et les pastilles, et la
  // valeur de repli d'un `var(--r-*, …)` ne compte pas : elle sert aux
  // feuilles partagées avec le site public, qui n'a pas ces jetons.
  const offScale = [...css.matchAll(/border-radius:([^;}]*)/gi)]
    .map((m) => ({ raw: m[0], value: m[1].replace(/var\([^)]*\)/g, '') }))
    .find((d) => /\b\d+(?:\.\d+)?(?:px|rem|em)\b/.test(d.value))
  if (offScale) found.push({ rule: 'rayon hors échelle', sample: offScale.raw.trim() })

  const tracking = css.match(/letter-spacing:\s*0*\.\d+em/i)
  if (tracking) found.push({ rule: 'interlettrage positif', sample: tracking[0] })

  if (path !== DEFINITION_FILE) {
    const hex = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()).find((h) => !PALETTE.has(h))
    if (hex) found.push({ rule: 'couleur hors palette', sample: hex })

    const font = [...css.matchAll(/font-family:\s*([^;}]+)/gi)]
      .map((m) => m[1].trim())
      .find((v) => !/^(var\(--font-(heading|body|mono)\)|inherit)$/.test(v))
    if (font) found.push({ rule: 'police hors jetons', sample: font })
  }

  return found
}

describe('charte portail — contrat de style', () => {
  it('lists only stylesheets that exist', () => {
    for (const path of PORTAL_STYLESHEETS) {
      expect(existsSync(join(root, path)), `${path} est listé mais absent`).toBe(true)
    }
  })

  it('holds the contract on every migrated stylesheet', () => {
    const migrated = PORTAL_STYLESHEETS.filter((p) => !allowlist.includes(p))
    expect(migrated.length, 'aucune feuille migrée : le lot 0 pose au moins portail.css').toBeGreaterThan(0)

    for (const path of migrated) {
      const found = violations(path)
      expect(found, `${path} : ${found.map((v) => `${v.rule} (${v.sample})`).join(', ')}`).toEqual([])
    }
  })

  it('keeps the allowlist shrinking', () => {
    for (const path of allowlist) {
      expect(
        (PORTAL_STYLESHEETS as readonly string[]).includes(path),
        `${path} est dans la liste d'exceptions mais pas dans la charte`,
      ).toBe(true)
      expect(
        violations(path).length,
        `${path} respecte déjà le contrat : le retirer de portal-style-allowlist.json`,
      ).toBeGreaterThan(0)
    }
  })
})
