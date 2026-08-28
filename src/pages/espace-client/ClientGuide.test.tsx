import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ClientGuide from './ClientGuide'

function renderGuide() {
  return render(
    <MemoryRouter>
      <ClientGuide />
    </MemoryRouter>,
  )
}

describe('guide de l’espace client', () => {
  it('présente les entrées de navigation que le client va rencontrer', () => {
    renderGuide()
    for (const title of [
      'Votre tableau de bord',
      'Vos projets',
      'Les étapes et vos validations',
      'Vos demandes',
      'Devis, signature et factures',
      'Mes documents',
      'Vos fichiers',
      'Messages et collaborateurs',
      'Votre compte et votre sécurité',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  it('ouvre la section des étapes par défaut et explique le caractère bloquant de la validation', () => {
    renderGuide()
    expect(screen.getByText(/l’étape suivante ne démarre pas/i)).toBeInTheDocument()
  })

  it('déplie une section fermée au clic', () => {
    renderGuide()

    expect(screen.queryByText(/rassemble vos contrats, devis signés/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mes documents/i }))
    expect(screen.getByText(/rassemble vos contrats, devis signés/i)).toBeInTheDocument()
  })
})
