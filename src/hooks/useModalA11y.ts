import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
  )
}

/**
 * Makes a portal dialog behave like a modal without relying on a UI library:
 * the application root becomes inert, focus stays in the dialog, and the
 * element that opened it regains focus when it closes.
 */
export function useModalA11y(
  active: boolean,
  dialogRef: RefObject<HTMLElement>,
  initialFocusRef?: RefObject<HTMLElement>,
) {
  useEffect(() => {
    if (!active) return
    const dialog = dialogRef.current
    if (!dialog) return
    const appRoot = document.getElementById('root')
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const hadInert = appRoot?.hasAttribute('inert') ?? false
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden')

    if (appRoot) {
      appRoot.setAttribute('inert', '')
      appRoot.setAttribute('aria-hidden', 'true')
    }

    ;(initialFocusRef?.current || getFocusable(dialog)[0] || dialog).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const focusable = getFocusable(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (appRoot) {
        if (!hadInert) appRoot.removeAttribute('inert')
        if (previousAriaHidden == null) appRoot.removeAttribute('aria-hidden')
        else appRoot.setAttribute('aria-hidden', previousAriaHidden)
      }
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [active, dialogRef, initialFocusRef])
}
