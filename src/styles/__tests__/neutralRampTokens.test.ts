import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/**
 * L'ancienne palette « slate » (#0f172a … #f8fafc) était recopiée en dur dans
 * 26 feuilles de style, ce qui figeait ces zones sur le thème sombre. Elle est
 * désormais promue en rampe neutre : --ink-* (texte), --surface-* (fonds),
 * --line-* (filets), définie une seule fois dans theme.css pour chaque thème.
 */
const SLATE = /#(?:f8fafc|f1f5f9|e2e8f0|cbd5e1|94a3b8|64748b|475569|334155|1e293b|0f172a)\b/i

const RAMP = [
  '--ink-strong',
  '--ink-body',
  '--ink-soft',
  '--ink-dim',
  '--ink-faint',
  '--ink-ghost',
  '--ink-whisper',
  '--surface-sunken',
  '--surface-raised',
  '--surface-strong',
  '--line-faint',
  '--line-soft',
  '--line-strong',
  '--line-vivid',
]

/** Contextes à couleur volontairement fixe, indépendants du thème. */
const ALLOWED = [
  'src/styles/theme.css', // site de définition de la rampe + accent « slate »
  'src/pages/admin/mon-espace/MonEspace.css', // texte sur post-it jaune
  'src/pages/admin/AdminPortal.css', // pastille de toggle, toujours claire
]

describe('rampe neutre', () => {
  it('définit les 14 tokens dans les deux thèmes', () => {
    const css = read('src/styles/theme.css')
    for (const theme of ['dark', 'light']) {
      const block = css.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`))?.[1]
      expect(block, `[data-theme="${theme}"] est introuvable`).toBeTruthy()
      for (const token of RAMP) {
        expect(block, `[data-theme="${theme}"] doit définir ${token}`).toContain(`${token}:`)
      }
    }
  })

  it('miroir strict : aucune valeur partagée entre dark et light hors --ink-faint', () => {
    const css = read('src/styles/theme.css')
    const valuesFor = (theme: string) => {
      const block = css.match(new RegExp(`\\[data-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`))![1]
      return Object.fromEntries(RAMP.map((t) => [t, block.match(new RegExp(`${t}:\\s*([^;]+);`))![1].trim()]))
    }
    const dark = valuesFor('dark')
    const light = valuesFor('light')
    for (const token of RAMP) {
      if (token === '--ink-faint') continue // pivot central de la rampe, identique des deux côtés
      expect(dark[token], `${token} doit différer entre dark et light`).not.toBe(light[token])
    }
  })

  it('ne laisse aucune couleur slate en dur dans les feuilles de style', () => {
    const files = execSync(
      `grep -rlE '#(f8fafc|f1f5f9|e2e8f0|cbd5e1|94a3b8|64748b|475569|334155|1e293b|0f172a)' --include='*.css' src`,
      { encoding: 'utf8', cwd: root },
    )
      .trim()
      .split('\n')
      .filter(Boolean)

    expect(files.filter((f) => !ALLOWED.includes(f))).toEqual([])
  })

  it('ne réintroduit pas de slate dans les styles inline des composants', () => {
    // Les tables sémantiques (STATUS_COLORS, PRIORITY_COLORS…) restent en dur :
    // ce sont des données de statut, pas la hiérarchie neutre de l'interface.
    // Seuls les attributs `style={{ … }}` du JSX sont contrôlés ici.
    const files = execSync(`grep -rl 'style={{' --include='*.tsx' src`, { encoding: 'utf8', cwd: root })
      .trim()
      .split('\n')
      .filter(Boolean)

    const hits: string[] = []
    for (const file of files) {
      const source = read(file)
      for (const match of source.matchAll(/style=\{\{[^}]*\}\}/g)) {
        // Seules les valeurs littérales sont contrôlées : `prop: '#xxxxxx'`.
        // Les repli d'une table sémantique (`MAP[k] || '#64748b'`) restent en
        // hexadécimal car le code leur concatène un canal alpha (`${c}28`),
        // ce qu'un var() ne permet pas.
        const literal = /[A-Za-z]+:\s*'(#[0-9a-fA-F]{6})'/g
        for (const decl of match[0].matchAll(literal)) {
          if (SLATE.test(decl[1])) hits.push(`${file} :: ${decl[0]}`)
        }
      }
    }

    expect(hits, `styles inline à tokeniser :\n${hits.join('\n')}`).toEqual([])
  })

  it('garde SLATE cohérent avec la rampe', () => {
    expect(SLATE.test('#94a3b8')).toBe(true)
  })
})
