import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashWidget from './DashWidget'

describe('DashWidget', () => {
  it('affiche le titre et les enfants', () => {
    render(<DashWidget title="Test">Hello</DashWidget>)
    expect(screen.getByText('Test')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('affiche le subtitle quand fourni', () => {
    render(<DashWidget title="A" subtitle="sub">x</DashWidget>)
    expect(screen.getByText('sub')).toBeTruthy()
  })

  it('affiche un état empty quand prop empty=true', () => {
    render(<DashWidget title="A" empty emptyLabel="rien">x</DashWidget>)
    expect(screen.getByText('rien')).toBeTruthy()
    expect(screen.queryByText('x')).toBeNull()
  })

  it('affiche un état erreur quand error fourni', () => {
    render(<DashWidget title="A" error="boom">x</DashWidget>)
    expect(screen.getByText('boom')).toBeTruthy()
  })

  it('affiche un lien action quand fourni', () => {
    render(
      <MemoryRouter>
        <DashWidget title="A" action={{ label: 'Voir', to: '/path' }}>x</DashWidget>
      </MemoryRouter>
    )
    const link = screen.getByText('Voir')
    expect(link.getAttribute('href')).toBe('/path')
  })
})
