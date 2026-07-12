import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState, type ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import InternsTab from './InternsTab'
import { createEmptyInternForm, type Intern, type InternFormData } from './types'

const interns: Intern[] = [
  {
    _id: 'intern-active',
    userId: { _id: 'user-active', name: 'Ada Lovelace', email: 'ada@example.test' },
    type: 'STAGIAIRE',
    poste: 'Développeuse',
    departement: 'Produit',
    dateDebut: '2026-01-01T00:00:00.000Z',
    dateFin: '2026-12-31T00:00:00.000Z',
    tuteur: null,
    ecole: '',
    formation: '',
    notes: '',
    joursPresence: ['lundi'],
    status: 'ACTIF',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    _id: 'intern-completed',
    userId: { _id: 'user-completed', name: 'Grace Hopper', email: 'grace@example.test' },
    type: 'ALTERNANT',
    poste: 'Ingénieure',
    departement: 'Tech',
    dateDebut: '2025-01-01T00:00:00.000Z',
    dateFin: '2025-12-31T00:00:00.000Z',
    tuteur: null,
    ecole: '',
    formation: '',
    notes: '',
    joursPresence: ['mardi'],
    status: 'TERMINE',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
]

function renderTab(overrides: Partial<ComponentProps<typeof InternsTab>> = {}) {
  const callbacks = {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onCancelForm: vi.fn(),
    onEdit: vi.fn(),
    onStatusChange: vi.fn(),
    onTypeChange: vi.fn(),
    onResendCredentials: vi.fn(),
    onDelete: vi.fn(),
  }
  function TestTab() {
    const [form, setForm] = useState<InternFormData>(createEmptyInternForm())
    const [filterStatus, setFilterStatus] = useState('all')
    const [expandedIntern, setExpandedIntern] = useState<string | null>(null)
    return (
      <InternsTab
        admins={[]}
        interns={interns}
        editingIntern={null}
        form={form}
        setForm={setForm}
        showForm={false}
        submitting={false}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        expandedIntern={expandedIntern}
        setExpandedIntern={setExpandedIntern}
        isSuperAdmin={false}
        resendingCredentials={null}
        {...callbacks}
        {...overrides}
      />
    )
  }
  render(
    <MemoryRouter>
      <TestTab />
    </MemoryRouter>,
  )
  return callbacks
}

describe('InternsTab', () => {
  it('filters members and keeps the type update action on the expanded card', () => {
    const { onTypeChange } = renderTab()

    fireEvent.click(screen.getByRole('button', { name: /1 Termine/ }))
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Grace Hopper'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'STAGIAIRE' } })
    expect(onTypeChange).toHaveBeenCalledWith('intern-completed', 'STAGIAIRE')
  })

  it('keeps destructive and credential actions reserved for super-admins', () => {
    const memberActions = renderTab()
    fireEvent.click(screen.getByText('Ada Lovelace'))
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Renvoyer identifiants' })).not.toBeInTheDocument()

    cleanup()
    const adminActions = renderTab({ isSuperAdmin: true })
    fireEvent.click(screen.getByText('Ada Lovelace'))
    fireEvent.click(screen.getByRole('button', { name: 'Renvoyer identifiants' }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(memberActions.onDelete).not.toHaveBeenCalled()
    expect(adminActions.onResendCredentials).toHaveBeenCalledWith('intern-active')
    expect(adminActions.onDelete).toHaveBeenCalledWith('intern-active')
  })
})
