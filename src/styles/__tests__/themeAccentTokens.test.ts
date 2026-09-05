import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

const readSource = (path: string) => readFileSync(join(root, path), 'utf8')

describe('theme accent tokens', () => {
  it('defines reusable RGB and surface variables for every selectable accent', () => {
    const themeCss = readSource('src/styles/theme.css')
    const accents = [
      'dark',
      'light',
      'violet',
      'emerald',
      'amber',
      'rose',
      'coral',
      'yellow',
      'indigo',
      'teal',
      'fuchsia',
      'lime',
      'slate',
    ]
    const requiredTokens = [
      '--primary-rgb',
      '--primary-light-rgb',
      '--primary-dark-rgb',
      '--accent-soft',
      '--accent-medium',
      '--accent-border',
      '--accent-border-strong',
      '--accent-glow-soft',
      '--accent-glow',
      '--accent-glow-strong',
      '--accent-surface',
      '--accent-surface-strong',
      '--accent-ring',
    ]

    for (const accent of accents) {
      // Prettier normalise les quotes des sélecteurs d'attribut : on accepte les deux.
      const attr = accent === 'dark' || accent === 'light' ? 'data-theme' : 'data-accent'
      const selector = `[${attr}="${accent}"]`
      const block = themeCss.match(new RegExp(`\\[${attr}=['"]${accent}['"]\\]\\s*{([\\s\\S]*?)}`))?.[1]

      expect(block, `${selector} is missing`).toBeTruthy()
      for (const token of requiredTokens) {
        expect(block, `${selector} should define ${token}`).toContain(token)
      }
    }
  })

  it('keeps shared UI accent surfaces free of hardcoded Venio blue values', () => {
    const paths = [
      'src/styles/theme-monolithe.css',
      'src/styles/portail.css',
      'src/styles/monolithe-home.css',
      'src/styles/monolithe-sites.css',
      'src/components/Navbar.css',
      'src/components/Footer.css',
      'src/components/CTA.css',
      'src/components/NeonDivider.css',
      'src/components/NeonCorners.css',
      'src/components/Breadcrumb.css',
      'src/components/MathCaptcha.css',
      'src/components/ClientSidebar.css',
      'src/components/AdminSidebar.css',
      'src/components/AdminShell.css',
      'src/components/PushPermissionPrompt.css',
      'src/pages/Contact.css',
      'src/pages/APropos.css',
      'src/pages/PolesPage.css',
      'src/pages/Legal.css',
      'src/pages/CGU.css',
      'src/pages/espace-client/ClientPortal.css',
    ]
    const hardcodedAccentBlue =
      /#(?:0ea5e9|7dd3fc|0284c7|38bdf8|22d3ee)\b|rgba?\(\s*(?:14\s*,\s*165\s*,\s*233|34\s*,\s*211\s*,\s*238|125\s*,\s*211\s*,\s*252)/i

    for (const path of paths) {
      const matches = readSource(path).match(hardcodedAccentBlue)
      expect(matches, `${path} contains ${matches?.[0]}`).toBeNull()
    }
  })
  it('keeps non-blue dark accent themes from repainting browser-level backgrounds', () => {
    const themeCss = readSource('src/styles/theme.css')
    const neutralBackgroundTokens = [
      '--admin-shell-bg-glow-1: rgba(255, 255, 255',
      '--client-shell-bg-glow-1: rgba(255, 255, 255',
      '--ambient-mesh-primary: rgba(255, 255, 255',
      '--ambient-mesh-layer-1: rgba(255, 255, 255',
    ]

    expect(themeCss).toMatch(/\[data-theme=['"]dark['"]\]\[data-accent=['"]violet['"]\]/)
    for (const token of neutralBackgroundTokens) {
      expect(themeCss, 'non-blue accents should neutralize ' + token).toContain(token)
    }

    const shellFiles = [
      'src/components/AdminShell.css',
      'src/components/ClientShell.css',
      'src/components/GradientMeshBackground.css',
    ]

    for (const path of shellFiles) {
      const source = readSource(path)
      expect(source, path + ' should use neutralizable background tokens').not.toMatch(
        /radial-gradient\([^)]*rgba\(var\(--primary(?:-light|-dark)?-rgb\)/,
      )
    }
  })
})
