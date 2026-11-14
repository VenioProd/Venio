import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Headset, User } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import type { TranscriptSegment } from '../../services/callInsights'
import { findOccurrences, formatOffset, indexSegments, type SegmentRanges } from './transcriptText'
import './callInsights.css'

interface TranscriptViewProps {
  segments: TranscriptSegment[]
  /** Citation à surligner (choisie dans le panneau d'analyse). */
  highlight?: string | null
  /** Change à chaque choix d'une citation, pour la remettre en vue même si c'est la même. */
  highlightNonce?: number
  className?: string
}

const QUOTE = 1
const HIT = 2
const ACTIVE = 4

/** Découpe un texte en tronçons de même surlignage. */
function slice(text: string, quote: [number, number][] | undefined, hits: [number, number, boolean][] | undefined) {
  const flags = new Array<number>(text.length).fill(0)
  for (const [start, end] of quote ?? []) for (let i = start; i < end && i < text.length; i++) flags[i] |= QUOTE
  for (const [start, end, active] of hits ?? [])
    for (let i = start; i < end && i < text.length; i++) flags[i] |= HIT | (active ? ACTIVE : 0)
  const parts: { text: string; flag: number }[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.flag === flags[i]) last.text += text[i]
    else parts.push({ text: text[i], flag: flags[i] })
  }
  return parts
}

export default function TranscriptView({
  segments,
  highlight,
  highlightNonce = 0,
  className = '',
}: TranscriptViewProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLOListElement>(null)

  const index = useMemo(() => indexSegments(segments), [segments])
  const quoteRanges: SegmentRanges | null = useMemo(
    () => (highlight ? (findOccurrences(index, highlight)[0] ?? null) : null),
    [index, highlight],
  )
  const hits = useMemo(() => findOccurrences(index, query), [index, query])
  const hitCount = hits.length
  const active = hitCount ? Math.min(cursor, hitCount - 1) : 0

  // Remet en vue la citation choisie, ou l'occurrence active de la recherche.
  const firstQuoteSegment = quoteRanges ? Math.min(...quoteRanges.keys()) : -1
  useEffect(() => {
    if (firstQuoteSegment < 0) return
    root.current?.querySelector(`[data-segment="${firstQuoteSegment}"]`)?.scrollIntoView?.({ block: 'center' })
  }, [firstQuoteSegment, highlightNonce])

  useEffect(() => {
    if (!hitCount) return
    root.current?.querySelector('[data-active-hit="true"]')?.scrollIntoView?.({ block: 'center' })
  }, [active, hitCount, query])

  function move(step: number) {
    if (!hitCount) return
    setCursor((active + step + hitCount) % hitCount)
  }

  const quoteMissing = Boolean(highlight) && !quoteRanges

  return (
    <section className={`ci-transcript ${className}`.trim()} aria-label={t('callInsights.transcript.title')}>
      <div className="ci-transcript-tools" role="search">
        <label className="ci-search">
          <span className="ci-visually-hidden">{t('callInsights.transcript.search')}</span>
          <input
            className="portal-input"
            type="search"
            value={query}
            placeholder={t('callInsights.transcript.searchPlaceholder')}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                move(event.shiftKey ? -1 : 1)
              }
            }}
          />
        </label>
        {query.trim() && (
          <Fragment>
            <span className="ci-search-count" role="status">
              {hitCount
                ? t('callInsights.transcript.hits', { current: active + 1, total: hitCount })
                : t('callInsights.transcript.noHit')}
            </span>
            <button
              type="button"
              className="portal-button secondary ci-icon-button"
              disabled={!hitCount}
              onClick={() => move(-1)}
              aria-label={t('callInsights.transcript.previousHit')}
            >
              ↑
            </button>
            <button
              type="button"
              className="portal-button secondary ci-icon-button"
              disabled={!hitCount}
              onClick={() => move(1)}
              aria-label={t('callInsights.transcript.nextHit')}
            >
              ↓
            </button>
          </Fragment>
        )}
      </div>

      {quoteMissing && (
        <p className="ci-notice" role="status">
          {t('callInsights.transcript.quoteMissing')}
        </p>
      )}

      {quoteRanges && <p className="ci-muted">{t('crmLead.transcript.legend')}</p>}

      {segments.length === 0 ? (
        <p className="ci-muted">{t('callInsights.transcript.empty')}</p>
      ) : (
        <ol className="ci-lines" ref={root}>
          {segments.map((segment, position) => {
            const speakerLabel = t(
              segment.speaker === 'REP' ? 'callInsights.speaker.REP' : 'callInsights.speaker.PROSPECT',
            )
            const segmentHits: [number, number, boolean][] = []
            hits.forEach((occurrence, occurrenceIndex) => {
              for (const [start, end] of occurrence.get(position) ?? [])
                segmentHits.push([start, end, occurrenceIndex === active])
            })
            const parts = slice(segment.text, quoteRanges?.get(position), segmentHits)
            const hasActive = segmentHits.some(([, , isActive]) => isActive)
            return (
              <li
                key={position}
                className={`ci-line ci-line--${segment.speaker === 'REP' ? 'rep' : 'prospect'}`}
                data-segment={position}
                data-active-hit={hasActive ? 'true' : undefined}
              >
                <time className="ci-time" dateTime={`PT${Math.floor(segment.startMs / 1000)}S`}>
                  {formatOffset(segment.startMs)}
                </time>
                <div className="ci-bubble">
                  <p className="ci-line-head">
                    {segment.speaker === 'REP' ? <Headset size={14} aria-hidden /> : <User size={14} aria-hidden />}
                    <strong>{speakerLabel}</strong>
                  </p>
                  <p className="ci-line-text">
                    {parts.map((part, partIndex) =>
                      part.flag === 0 ? (
                        <Fragment key={partIndex}>{part.text}</Fragment>
                      ) : (
                        <mark
                          key={partIndex}
                          className={[
                            part.flag & QUOTE ? 'ci-mark-quote' : '',
                            part.flag & HIT ? 'ci-mark-hit' : '',
                            part.flag & ACTIVE ? 'ci-mark-active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          data-active-hit={part.flag & ACTIVE ? 'true' : undefined}
                        >
                          {part.text}
                        </mark>
                      ),
                    )}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
