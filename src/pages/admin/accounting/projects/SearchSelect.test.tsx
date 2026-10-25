import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import SearchSelect from './SearchSelect'

it('filtre sans casse ni accents, sélectionne au clavier et conserve une référence inconnue', () => {
  const onChange = vi.fn()
  const options = [
    { value: 'client-1', label: 'Élodie', hint: 'Société Boréale' },
    { value: 'client-2', label: 'Martin', hint: 'martin@example.test' },
  ]
  const { rerender } = render(
    <SearchSelect label="Client payeur" value="" options={options} onChange={onChange} required disabled={false} />,
  )
  const input = screen.getByRole('combobox', { name: 'Client payeur' }) as HTMLInputElement
  expect(input).toBeRequired()
  expect(input.checkValidity()).toBe(false)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: 'ELO' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  expect(screen.getByRole('option')).toHaveTextContent('Élodie')
  expect(input.checkValidity()).toBe(false)
  fireEvent.change(input, { target: { value: 'BOREALE' } })
  expect(screen.getAllByRole('option')).toHaveLength(1)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option').id)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledExactlyOnceWith('client-1')
  expect(input).toHaveAttribute('aria-expanded', 'false')
  rerender(
    <SearchSelect
      label="Client payeur"
      value="client-1"
      options={options}
      onChange={onChange}
      required
      disabled={false}
    />,
  )
  expect(input).toHaveValue('Élodie')
  expect(input.checkValidity()).toBe(true)
  fireEvent.focus(input)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id)
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input).toHaveValue('Élodie')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  fireEvent.click(input)
  fireEvent.click(screen.getByRole('option', { name: /Martin/ }))
  expect(onChange).toHaveBeenLastCalledWith('client-2')
  rerender(
    <SearchSelect label="Client payeur" value="supprime" options={options} onChange={onChange} required disabled />,
  )
  expect(input).toHaveValue('Référence introuvable')
  expect(input).toBeDisabled()
})
