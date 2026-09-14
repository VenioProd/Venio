import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PublicModal from './PublicModal'

let appRoot: HTMLElement | null = null

/** Reproduit le #root de l'application, que useModalA11y rend inerte. */
function mountAppRoot(): HTMLElement {
  appRoot = document.createElement('div')
  appRoot.id = 'root'
  document.body.appendChild(appRoot)
  return appRoot
}

function renderModal(onClose = vi.fn()) {
  const root = mountAppRoot()
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.textContent = 'Ouvrir la modale'
  root.appendChild(trigger)
  trigger.focus()

  const utils = render(
    <PublicModal title="Réserver 30 minutes" eyebrow="Venio · Rendez-vous" onClose={onClose}>
      <button type="button">Premier champ</button>
      <button type="button">Dernier champ</button>
    </PublicModal>,
  )

  return { ...utils, onClose, trigger, root }
}

afterEach(() => {
  appRoot?.remove()
  appRoot = null
  document.body.style.overflow = ''
})

describe('PublicModal', () => {
  it('rend un dialogue modal nommé par son titre, avec une croix de fermeture nommée', () => {
    renderModal()

    const dialog = screen.getByRole('dialog', { name: 'Réserver 30 minutes' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Réserver 30 minutes' })).toBeInTheDocument()
  })

  it('ferme à la touche Échap, au clic sur le voile et au clic sur la croix', () => {
    const { onClose } = renderModal()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Fermer la fenêtre' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.mouseDown(document.querySelector('.mc-modal-layer')!)
    expect(onClose).toHaveBeenCalledTimes(3)

    // Un clic à l'intérieur de la boîte ne doit rien fermer.
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('se comporte en modale : racine inerte, focus piégé, focus restitué, défilement verrouillé', () => {
    const { unmount, trigger, root } = renderModal()

    expect(root).toHaveAttribute('inert')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre' })).toHaveFocus()

    const last = screen.getByRole('button', { name: 'Dernier champ' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Fermer la fenêtre' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    unmount()
    expect(root).not.toHaveAttribute('inert')
    expect(root).not.toHaveAttribute('aria-hidden')
    expect(document.body.style.overflow).toBe('')
    expect(trigger).toHaveFocus()
  })

  it('donne le focus initial au champ demandé', () => {
    mountAppRoot()
    const Harness = () => {
      const ref = { current: null } as { current: HTMLInputElement | null }
      return (
        <PublicModal title="Être rappelé" onClose={() => {}} initialFocusRef={ref}>
          <input
            aria-label="Téléphone"
            ref={(node) => {
              ref.current = node
            }}
          />
        </PublicModal>
      )
    }
    render(<Harness />)

    expect(screen.getByLabelText('Téléphone')).toHaveFocus()
  })
})
