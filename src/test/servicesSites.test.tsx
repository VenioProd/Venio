import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SitesPricingTable from '../components/SitesPricingTable'

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('SitesPricingTable', () => {
  it('affiche les 5 noms de paliers', () => {
    wrap(<SitesPricingTable />)
    expect(screen.getByText('Vitrine')).toBeInTheDocument()
    expect(screen.getByText('Essentiel')).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.getByText('E-commerce')).toBeInTheDocument()
    expect(screen.getByText('Plateforme')).toBeInTheDocument()
  })

  it("n'affiche pas le prix mensuel par défaut (sans webmastering)", () => {
    wrap(<SitesPricingTable />)
    expect(screen.queryByText(/mois HT/)).not.toBeInTheDocument()
  })

  it('affiche les prix mensuels après activation du webmastering', () => {
    wrap(<SitesPricingTable />)
    fireEvent.click(screen.getByRole('button', { name: /webmastering/i }))
    expect(screen.getAllByText(/mois HT/).length).toBeGreaterThan(0)
  })

  it('affiche "Hébergement inclus" dans le bloc webmastering après activation', () => {
    wrap(<SitesPricingTable />)
    fireEvent.click(screen.getByRole('button', { name: /webmastering/i }))
    expect(screen.getAllByText(/Hébergement/i).length).toBeGreaterThan(0)
  })

  it('le palier Business porte le badge "Le plus choisi"', () => {
    wrap(<SitesPricingTable />)
    expect(screen.getByText('Le plus choisi')).toBeInTheDocument()
  })

  it('le palier Plateforme affiche "Sur devis" pour la construction', () => {
    wrap(<SitesPricingTable />)
    expect(screen.getAllByText('Sur devis').length).toBeGreaterThan(0)
  })
})
