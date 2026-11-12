import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CustomSelect from '../components/admin/CustomSelect'

it('parcourt les options au clavier, sélectionne et annule sans perdre le focus', () => {
  const onChange = vi.fn()
  render(
    <CustomSelect
      value="a"
      onChange={onChange}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Bravo' },
        { value: 'c', label: 'Charlie' },
      ]}
    />,
  )
  const trigger = screen.getByRole('combobox')
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const bravo = screen.getByRole('option', { name: 'Bravo' })
  expect(trigger).toHaveAttribute('aria-activedescendant', bravo.id)
  fireEvent.keyDown(trigger, { key: 'c' })
  expect(trigger).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Charlie' }).id)
  fireEvent.keyDown(trigger, { key: 'ArrowUp' })
  fireEvent.keyDown(trigger, { key: 'Enter' })
  expect(onChange).toHaveBeenCalledExactlyOnceWith('b')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(trigger).toHaveFocus()
  fireEvent.keyDown(trigger, { key: 'Enter' })
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(trigger)
  expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(trigger, { key: 'Tab' })
  expect(screen.queryByRole('listbox')).toBeNull()
})
