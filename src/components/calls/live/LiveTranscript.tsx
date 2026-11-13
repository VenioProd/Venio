import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Radio } from 'lucide-react'
import { useI18n } from '../../../context/I18nContext'
import './liveTranscript.css'

export type LiveSpeaker = 'REP' | 'PROSPECT'
export interface LiveSegment {
  id: string
  speaker: LiveSpeaker
  text: string
  final: boolean
  at: number
}
type Status = 'OFF' | 'WAITING' | 'LIVE' | 'RECONNECTING'

/** Le flux SSE ; injecté dans les tests (jsdom n'a pas d'`EventSource`). */
export type LiveSource = Pick<EventSource, 'addEventListener' | 'close'> & {
  readyState: number
  onerror: ((event: Event) => void) | null
  onopen: ((event: Event) => void) | null
}
export type LiveSourceFactory = (url: string) => LiveSource

const defaultFactory: LiveSourceFactory = (url) => new EventSource(url)
/** Au-delà, l'écran ne garde que les derniers tours (le serveur fait de même). */
const MAX_SEGMENTS = 400

interface Props {
  callId: string
  /** Routeur d'appels de l'écran : `/api/commercial` ou `/api/admin/call-desk`. */
  apiPrefix: string
  /** Opposition du prospect : le texte disparaît tout de suite, sans attendre le serveur. */
  stopped?: boolean
  source?: LiveSourceFactory
}

/**
 * Volet de texte en direct de la barre d'appel : les deux voix, à mesure
 * qu'elles parlent. Rien ne s'affiche si l'appel n'est pas transcrit en direct
 * (le serveur répond 204 et le flux se ferme). Le texte est effacé à la fin de
 * l'appel, à l'opposition, et au démontage : il n'est gardé nulle part.
 */
export default function LiveTranscript({ callId, apiPrefix, stopped = false, source = defaultFactory }: Props) {
  const { t } = useI18n()
  const url = `${apiPrefix}/calls/${encodeURIComponent(callId)}/live`
  // L'état appartient à un flux : un autre appel repart d'un volet vide, sans réinitialisation dans l'effet.
  const [view, setView] = useState<{ url: string; status: Status; segments: LiveSegment[] }>({
    url,
    status: 'WAITING',
    segments: [],
  })
  const { status, segments } = view.url === url ? view : { status: 'WAITING' as Status, segments: [] }
  const [open, setOpen] = useState(true)
  const log = useRef<HTMLOListElement>(null)
  const follow = useRef(true)

  useEffect(() => {
    if (stopped) return
    const stream = source(url)
    const update = (change: (current: { status: Status; segments: LiveSegment[] }) => Partial<typeof view>) =>
      setView((previous) => {
        const current = previous.url === url ? previous : { url, status: 'WAITING' as Status, segments: [] }
        return { ...current, ...change(current) }
      })
    const off = () => {
      stream.close()
      update(() => ({ status: 'OFF', segments: [] }))
    }
    stream.addEventListener('state', (event) => {
      const next = (JSON.parse((event as MessageEvent<string>).data) as { status: string }).status
      if (next === 'ENDED') off()
      else if (next === 'WAITING' || next === 'LIVE') update(() => ({ status: next }))
    })
    stream.addEventListener('segment', (event) => {
      const segment = JSON.parse((event as MessageEvent<string>).data) as LiveSegment
      update((current) => ({
        segments: [...current.segments.filter((item) => item.id !== segment.id), segment]
          .sort((a, b) => a.at - b.at)
          .slice(-MAX_SEGMENTS),
      }))
    })
    stream.addEventListener('clear', () => update(() => ({ segments: [] })))
    // 204 ou 404 : le navigateur ferme le flux et ne se reconnecte pas. Sinon, il reprend seul.
    stream.onerror = () => (stream.readyState === 2 ? off() : update(() => ({ status: 'RECONNECTING' })))
    stream.onopen = () =>
      update((current) => ({ status: current.status === 'RECONNECTING' ? 'WAITING' : current.status }))
    return () => stream.close()
  }, [url, stopped, source])

  // Suit le dernier tour, sauf si le commercial est remonté lire plus haut.
  useLayoutEffect(() => {
    const element = log.current
    if (element && follow.current) element.scrollTop = element.scrollHeight
  }, [segments, open])

  // Opposition : le texte disparaît tout de suite ; le démontage du flux suit.
  if (stopped || status === 'OFF') return null

  return (
    <section className="live-transcript" aria-label={t('liveTranscript.title')}>
      <header className="live-transcript-head">
        <span className="live-transcript-title">
          <Radio size={14} aria-hidden="true" /> {t('liveTranscript.title')}
        </span>
        <span className="live-transcript-status" data-status={status} role="status">
          {status === 'LIVE'
            ? t('liveTranscript.live')
            : status === 'RECONNECTING'
              ? t('liveTranscript.reconnecting')
              : t('liveTranscript.waiting')}
        </span>
        <button
          type="button"
          className="live-transcript-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          <span className="live-transcript-toggle-label">
            {open ? t('liveTranscript.hide') : t('liveTranscript.show')}
          </span>
        </button>
      </header>
      {open && (
        <>
          {segments.length ? (
            <ol
              ref={log}
              className="live-transcript-log"
              // Pas d'annonce à chaque mot : le texte change sans cesse.
              aria-live="off"
              tabIndex={0}
              onScroll={(event) => {
                const element = event.currentTarget
                follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
              }}
            >
              {segments.map((segment) => (
                <li
                  key={segment.id}
                  className="live-transcript-line"
                  data-speaker={segment.speaker}
                  data-final={segment.final}
                >
                  <span className="live-transcript-speaker">
                    {segment.speaker === 'REP' ? t('liveTranscript.rep') : t('liveTranscript.prospect')}
                  </span>
                  <span className="live-transcript-text">{segment.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="live-transcript-empty">{t('liveTranscript.empty')}</p>
          )}
          <p className="live-transcript-note">{t('liveTranscript.note')}</p>
        </>
      )}
    </section>
  )
}
