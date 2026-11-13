import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LiveTranscript, { type LiveSource } from './LiveTranscript'

/** Faux flux SSE : l'écran s'y abonne, le test émet. */
function fakeSource() {
  const handlers = new Map<string, (event: MessageEvent<string>) => void>()
  const opened: string[] = []
  const stream: LiveSource & { closed: boolean } = {
    readyState: 1,
    closed: false,
    onerror: null,
    onopen: null,
    addEventListener: ((type: string, handler: (event: MessageEvent<string>) => void) =>
      handlers.set(type, handler)) as LiveSource['addEventListener'],
    close() {
      this.closed = true
    },
  }
  const emit = (type: string, data: unknown) =>
    act(() => handlers.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) })))
  return {
    stream,
    opened,
    emit,
    factory: (url: string) => {
      opened.push(url)
      return stream
    },
  }
}

describe('LiveTranscript', () => {
  it('affiche les deux voix, complète un tour par son identifiant, efface le texte à la fin', () => {
    const fake = fakeSource()
    const { container } = render(<LiveTranscript callId="c1" apiPrefix="/api/admin/call-desk" source={fake.factory} />)
    expect(fake.opened).toEqual(['/api/admin/call-desk/calls/c1/live'])
    fake.emit('state', { status: 'LIVE' })
    fake.emit('segment', { id: 'PROSPECT-0', speaker: 'PROSPECT', text: 'Oui bonjour', final: false, at: 900 })
    fake.emit('segment', { id: 'REP-0', speaker: 'REP', text: 'Anna de Venio', final: true, at: 100 })
    fake.emit('segment', { id: 'PROSPECT-0', speaker: 'PROSPECT', text: 'Oui, bonjour.', final: true, at: 900 })

    const lines = [...container.querySelectorAll('.live-transcript-line')].map((line) => line.textContent)
    expect(lines).toEqual(['VousAnna de Venio', 'ProspectOui, bonjour.'])
    expect(screen.getByRole('status')).toHaveTextContent('En direct')

    fake.emit('clear', {})
    expect(container.querySelectorAll('.live-transcript-line')).toHaveLength(0)
    fake.emit('state', { status: 'ENDED' })
    expect(container.firstChild).toBeNull()
    expect(fake.stream.closed).toBe(true)
  })

  it('rien quand l’appel n’est pas transcrit en direct (204), ni après une opposition', () => {
    const fake = fakeSource()
    const view = render(<LiveTranscript callId="c1" apiPrefix="/api/commercial" source={fake.factory} />)
    fake.emit('segment', { id: 'REP-0', speaker: 'REP', text: 'Bonjour', final: true, at: 0 })
    fake.stream.readyState = 2
    act(() => fake.stream.onerror?.(new Event('error')))
    expect(view.container.firstChild).toBeNull()

    const other = fakeSource()
    view.rerender(<LiveTranscript callId="c2" apiPrefix="/api/commercial" source={other.factory} />)
    other.emit('segment', { id: 'REP-0', speaker: 'REP', text: 'Je note', final: true, at: 0 })
    expect(screen.getByText('Je note')).toBeInTheDocument()
    view.rerender(<LiveTranscript callId="c2" apiPrefix="/api/commercial" source={other.factory} stopped />)
    expect(view.container.firstChild).toBeNull()
    expect(other.stream.closed).toBe(true)
  })
})
