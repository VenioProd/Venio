import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import GradientMeshBackground from '../components/GradientMeshBackground'

afterEach(() => {
  cleanup()
  document.body.classList.remove('gpu-off')
  vi.unstubAllGlobals()
})

describe('GradientMeshBackground', () => {
  it('uses a static background without animation layers for reduced-motion users', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener,
        removeEventListener,
      }),
    )

    const { container } = render(<GradientMeshBackground />)

    expect(container.querySelector('.reduced-motion-static')).toBeInTheDocument()
    expect(container.querySelector('.gradient-mesh-layer')).not.toBeInTheDocument()
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
