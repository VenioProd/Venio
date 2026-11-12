import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SafeMarkdown, { safeLinkUrl } from './SafeMarkdown'

describe('SafeMarkdown', () => {
  it('rend titres, paragraphes, gras, italique et code inline', () => {
    const { container } = render(
      <SafeMarkdown
        source={'# Titre\n## Sous-titre\n### Petit\n\nUn **gras**, un *italique*, un _autre_ et du \x60code\x60.'}
      />,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Titre' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: 'Sous-titre' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 5, name: 'Petit' })).toBeInTheDocument()
    expect(container.querySelector('strong')?.textContent).toBe('gras')
    expect(Array.from(container.querySelectorAll('em')).map((n) => n.textContent)).toEqual(['italique', 'autre'])
    expect(container.querySelector('p code')?.textContent).toBe('code')
  })

  it('rend listes, citations, séparateur et blocs de code', () => {
    const { container } = render(
      <SafeMarkdown
        source={
          '- un\n- deux\n\n1. premier\n2. second\n\n> citation\n\n---\n\n\x60\x60\x60\nligne <b>1</b>\nligne 2\n\x60\x60\x60'
        }
      />,
    )
    expect(screen.getAllByRole('listitem').map((n) => n.textContent)).toEqual(['un', 'deux', 'premier', 'second'])
    expect(container.querySelector('ul')).not.toBeNull()
    expect(container.querySelector('ol')).not.toBeNull()
    expect(container.querySelector('blockquote')?.textContent).toBe('citation')
    expect(container.querySelector('hr')).not.toBeNull()
    expect(container.querySelector('pre code')?.textContent).toBe('ligne <b>1</b>\nligne 2')
  })

  it('rend un tableau à pipes', () => {
    render(<SafeMarkdown source={'| Pack | Prix |\n| --- | --- |\n| Start | 49 € |\n| Pro | 99 € |'} />)
    expect(screen.getAllByRole('columnheader').map((n) => n.textContent)).toEqual(['Pack', 'Prix'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('cell', { name: '99 €' })).toBeInTheDocument()
  })

  it('affiche le HTML et les scripts comme du texte, sans les interpréter', () => {
    const { container } = render(
      <SafeMarkdown source={'<script>alert(1)</script>\n\n<img src=x onerror=alert(1)> et <b>gras</b>'} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.textContent).toContain('<b>gras</b>')
  })

  it('ne rend que les liens http(s) et mailto, en nouvel onglet sécurisé', () => {
    const { container } = render(
      <SafeMarkdown
        source={
          '[ok](https://exemple.test/a) [mail](mailto:a@exemple.test) [mauvais](javascript:alert(1)) [data](data:text/html;base64,AAA) [rel](/admin)'
        }
      />,
    )
    const links = Array.from(container.querySelectorAll('a'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://exemple.test/a', 'mailto:a@exemple.test'])
    for (const a of links.slice(0, 1)) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
    expect(container.innerHTML).not.toContain('javascript:')
    expect(container.textContent).toContain('mauvais')
  })

  it('safeLinkUrl refuse les schémas dangereux', () => {
    expect(safeLinkUrl('javascript:alert(1)')).toBeNull()
    expect(safeLinkUrl('JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeLinkUrl('vbscript:x')).toBeNull()
    expect(safeLinkUrl('https://a.test/ x')).toBeNull()
    expect(safeLinkUrl('https://a.test/x')).toBe('https://a.test/x')
  })

  it('ne casse pas sur une source vide', () => {
    const { container } = render(<SafeMarkdown source="" />)
    expect(container.querySelector('.safe-md')?.childElementCount).toBe(0)
  })
})
