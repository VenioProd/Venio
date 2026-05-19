import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PulseStatus from './PulseStatus'
import type { PulseCheck } from './types'

const checks: PulseCheck[] = [
  { id: 'a', label: 'CA on track', status: 'ok' },
  { id: 'b', label: 'Backup', status: 'bad', detail: '72h' },
  { id: 'c', label: 'Leads', status: 'warn', detail: '2 sans contact' },
]

describe('PulseStatus', () => {
  it('rend une ligne par check', () => {
    render(<PulseStatus checks={checks} />)
    expect(screen.getByText('CA on track')).toBeTruthy()
    expect(screen.getByText('Backup')).toBeTruthy()
    expect(screen.getByText('Leads')).toBeTruthy()
  })

  it('affiche les détails quand fournis', () => {
    render(<PulseStatus checks={checks} />)
    expect(screen.getByText('72h')).toBeTruthy()
    expect(screen.getByText('2 sans contact')).toBeTruthy()
  })

  it('compte les checks par status dans le header', () => {
    render(<PulseStatus checks={checks} />)
    expect(screen.getByText(/3 checks/)).toBeTruthy()
    expect(screen.getByText(/1 ok/)).toBeTruthy()
    expect(screen.getByText(/1 warn/)).toBeTruthy()
    expect(screen.getByText(/1 bad/)).toBeTruthy()
  })

  it('applique la classe de status sur chaque ligne', () => {
    const { container } = render(<PulseStatus checks={checks} />)
    expect(container.querySelectorAll('.dash-pulse__row--ok')).toHaveLength(1)
    expect(container.querySelectorAll('.dash-pulse__row--warn')).toHaveLength(1)
    expect(container.querySelectorAll('.dash-pulse__row--bad')).toHaveLength(1)
  })

  it('gère un état vide', () => {
    render(<PulseStatus checks={[]} />)
    expect(screen.getByText(/0 checks/)).toBeTruthy()
  })
})
