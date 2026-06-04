import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BentoGrid from '../pages/admin/mon-espace/BentoGrid'
import type { WidgetConfig } from '../types/workspace.types'

const widgets: WidgetConfig[] = [
  { key: 'a', enabled: true, x: 0, y: 0, w: 4, h: 4 },
  { key: 'b', enabled: true, x: 4, y: 0, w: 4, h: 4 },
  { key: 'c', enabled: false, x: 0, y: 4, w: 4, h: 4 },
]

describe('BentoGrid', () => {
  it('rend uniquement les widgets activés', () => {
    render(
      <BentoGrid
        widgets={widgets}
        editing={false}
        onChange={() => {}}
        renderWidget={(key) => <div data-testid={`w-${key}`}>{key}</div>}
      />
    )
    expect(screen.getByTestId('w-a')).toBeInTheDocument()
    expect(screen.getByTestId('w-b')).toBeInTheDocument()
    expect(screen.queryByTestId('w-c')).not.toBeInTheDocument()
  })

  it('en mode édition, le bouton taille fait évoluer w/h et appelle onChange', () => {
    const onChange = vi.fn()
    render(
      <BentoGrid
        widgets={widgets}
        editing={true}
        onChange={onChange}
        renderWidget={(key) => <div>{key}</div>}
      />
    )
    fireEvent.click(screen.getAllByLabelText('Changer la taille')[0])
    expect(onChange).toHaveBeenCalled()
  })
})
