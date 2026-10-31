import { Fragment, type ReactNode } from 'react'

/** Met en gras les passages encadrés par ** dans un message traduit (« **3** urgentes »). */
export function withStrong(text: string): ReactNode {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, index) =>
      index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>,
    )
}
