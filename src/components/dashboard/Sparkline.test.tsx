import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Sparkline from './Sparkline'

describe('Sparkline', () => {
  it('rend un SVG avec un path pour des données non vides', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4, 5]} color="#ff0080" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('ne rend rien (null) pour un tableau vide', () => {
    const { container } = render(<Sparkline values={[]} color="#ff0080" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('applique la couleur en stroke', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="#0ea5e9" />)
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('#0ea5e9')
  })
})
