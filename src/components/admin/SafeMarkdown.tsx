import type { ReactNode } from 'react'

/**
 * Rendu Markdown SÉCURISÉ pour les fiches projets.
 * - produit uniquement des éléments React (jamais de HTML injecté) ;
 * - tout HTML saisi est affiché comme du texte brut ;
 * - les liens n'acceptent que http(s) et mailto (sinon seul le libellé est affiché).
 */

const TICK = '\x60'

/** Retourne l'URL si elle est http(s) ou mailto, sinon null. */
export function safeLinkUrl(raw: string): string | null {
  const url = raw.trim()
  // eslint-disable-next-line no-control-regex
  if (!url || /[\s\x00-\x1f\x7f]/.test(url)) return null
  if (/^mailto:[^\s]+$/i.test(url)) return url
  if (/^https?:\/\/[^\s/]+/i.test(url)) {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null
    } catch {
      return null
    }
  }
  return null
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch)

/** Inline : code, liens, gras, italique. Le reste est du texte (échappé par React). */
function renderInline(text: string, keyPrefix = 'i', depth = 0): ReactNode[] {
  const nodes: ReactNode[] = []
  let buffer = ''
  let n = 0
  const flush = () => {
    if (buffer) nodes.push(buffer)
    buffer = ''
  }
  const key = () => keyPrefix + '-' + n++
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length && /[\\\x60*_[\]()#>|-]/.test(text[i + 1])) {
      buffer += text[i + 1]
      i += 2
      continue
    }
    if (ch === TICK) {
      const end = text.indexOf(TICK, i + 1)
      if (end > i + 1) {
        flush()
        nodes.push(<code key={key()}>{text.slice(i + 1, end)}</code>)
        i = end + 1
        continue
      }
    }
    if (ch === '[' && depth < 3) {
      const match = /^\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(text.slice(i))
      if (match) {
        flush()
        const url = safeLinkUrl(match[2])
        const inner = renderInline(match[1], keyPrefix + '-l' + n, depth + 1)
        if (url) {
          nodes.push(
            <a key={key()} href={url} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>,
          )
        } else {
          nodes.push(<span key={key()}>{inner}</span>)
        }
        i += match[0].length
        continue
      }
    }
    if (depth < 3 && (text.startsWith('**', i) || text.startsWith('__', i))) {
      const mark = text.slice(i, i + 2)
      const end = text.indexOf(mark, i + 2)
      if (end > i + 2) {
        flush()
        nodes.push(<strong key={key()}>{renderInline(text.slice(i + 2, end), keyPrefix + '-b' + n, depth + 1)}</strong>)
        i = end + 2
        continue
      }
    }
    if (depth < 3 && (ch === '*' || ch === '_') && text[i + 1] !== ch) {
      const startsWord = ch === '*' || !isWordChar(text[i - 1])
      const end = startsWord ? text.indexOf(ch, i + 1) : -1
      if (end > i + 1 && text[i + 1] !== ' ' && (ch === '*' || !isWordChar(text[end + 1]))) {
        flush()
        nodes.push(<em key={key()}>{renderInline(text.slice(i + 1, end), keyPrefix + '-e' + n, depth + 1)}</em>)
        i = end + 1
        continue
      }
    }
    buffer += ch
    i += 1
  }
  flush()
  return nodes
}

const FENCE = /^\s*(\x60{3,}|~{3,})/
const HEADING = /^(#{1,3})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const UL = /^\s*[-*+]\s+(.*)$/
const OL = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|')) row = row.slice(0, -1)
  return row.split('|').map((cell) => cell.trim())
}

function isBlockStart(line: string, next: string | undefined): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    UL.test(line) ||
    OL.test(line) ||
    QUOTE.test(line) ||
    (line.includes('|') && next !== undefined && TABLE_SEP.test(next) && next.includes('-'))
  )
}

function renderBlocks(source: string, keyPrefix: string, depth: number): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let n = 0
  const key = () => keyPrefix + '-' + n++
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1][0]
      const body: string[] = []
      i += 1
      while (i < lines.length && !new RegExp('^\\s*' + (marker === '~' ? '~' : '\x60') + '{3,}\\s*$').test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      i += 1
      out.push(
        <pre key={key()}>
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      const level = heading[1].length
      const content = renderInline(heading[2], keyPrefix + '-h' + n)
      if (level === 1) out.push(<h3 key={key()}>{content}</h3>)
      else if (level === 2) out.push(<h4 key={key()}>{content}</h4>)
      else out.push(<h5 key={key()}>{content}</h5>)
      i += 1
      continue
    }
    if (RULE.test(line)) {
      out.push(<hr key={key()} />)
      i += 1
      continue
    }
    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])![1])
        i += 1
      }
      out.push(
        <blockquote key={key()}>
          {depth < 3 ? renderBlocks(inner.join('\n'), keyPrefix + '-q' + n, depth + 1) : inner.join(' ')}
        </blockquote>,
      )
      continue
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line) && !UL.test(line)
      const matcher = ordered ? OL : UL
      const items: string[] = []
      while (i < lines.length && matcher.test(lines[i])) {
        items.push(matcher.exec(lines[i])![1])
        i += 1
      }
      const rendered = items.map((item, index) => (
        <li key={index}>{renderInline(item, keyPrefix + '-li' + n + '-' + index)}</li>
      ))
      out.push(ordered ? <ol key={key()}>{rendered}</ol> : <ul key={key()}>{rendered}</ul>)
      continue
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      const t = n
      out.push(
        <div key={key()} className="safe-md__table-wrap">
          <table>
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c}>{renderInline(cell, keyPrefix + '-th' + t + '-' + c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, c) => (
                    <td key={c}>{renderInline(row[c] ?? '', keyPrefix + '-td' + t + '-' + r + '-' + c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    const para: string[] = [line]
    i += 1
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) {
      para.push(lines[i])
      i += 1
    }
    const t = n
    out.push(
      <p key={key()}>
        {para.map((text, index) => (
          <span key={index}>
            {index > 0 && <br />}
            {renderInline(text.trim(), keyPrefix + '-p' + t + '-' + index)}
          </span>
        ))}
      </p>,
    )
  }
  return out
}

export interface SafeMarkdownProps {
  source: string
  className?: string
}

export default function SafeMarkdown({ source, className }: SafeMarkdownProps) {
  return <div className={'safe-md' + (className ? ' ' + className : '')}>{renderBlocks(source || '', 'md', 0)}</div>
}
