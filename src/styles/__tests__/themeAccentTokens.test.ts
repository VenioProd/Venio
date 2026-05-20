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
      const selector = accent === 'dark' || accent === 'light'
        ? `[data-theme="${accent}"]`
        : `[data-accent="${accent}"]`
      const block = themeCss.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*{([\\s\\S]*?)}`))?.[1]

      expect(block, `${selector} is missing`).toBeTruthy()
      for (const token of requiredTokens) {
        expect(block, `${selector} should define ${token}`).toContain(token)
      }
    }
  })

  it('keeps shared UI accent surfaces free of hardcoded Venio blue values', () => {
    const paths = [
      'src/components/Hero.css',
      'src/components/Navbar.css',
      'src/components/Footer.css',
      'src/components/CTA.css',
      'src/components/NeonDivider.css',
      'src/components/NeonCorners.css',
      'src/components/Breadcrumb.css',
      'src/components/MathCaptcha.css',
      'src/components/ServicesCore.css',
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
    const hardcodedAccentBlue = /#(?:0ea5e9|7dd3fc|0284c7|38bdf8|22d3ee)\b|rgba?\(\s*(?:14\s*,\s*165\s*,\s*233|34\s*,\s*211\s*,\s*238|125\s*,\s*211\s*,\s*252)/i

    for (const path of paths) {
      const matches = readSource(path).match(hardcodedAccentBlue)
      expect(matches, `${path} contains ${matches?.[0]}`).toBeNull()
    }
  })
})
