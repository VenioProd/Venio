import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { uploadMessageAttachments } from '../../../services/messaging'
import { getEmojiSuggestions, type EmojiSuggestion } from '../../../lib/emojiShortcodes'
import type { MessagingUser } from '../../../types/messaging.types'

interface MessageComposerProps {
  conversationId: string | null
  users: MessagingUser[]
  onSend: (content: string) => Promise<void>
  onUploaded: () => Promise<void>
  onTyping: (isTyping: boolean) => void
}

const QUICK_EMOJIS = ['😀', '😅', '😂', '😍', '😎', '🤔', '👍', '🙏', '🔥', '🚀', '🎉', '❤️']

type InlineSuggestType = 'emoji' | 'mention'

interface InlineSuggestState {
  type: InlineSuggestType
  query: string
  start: number
  end: number
}

/**
 * Détecte si la position du curseur est au sein d'un trigger `:xxx` ou `@xxx`
 * (préfixé par début de texte ou espace). Ignore les mentions déjà formatées
 * `@[Nom](id)` pour éviter de réouvrir le popover dessus.
 */
function detectInlineTrigger(text: string, cursor: number): InlineSuggestState | null {
  const before = text.slice(0, cursor)

  // Emoji : `:abc` (lettres, chiffres, _ + -). Précédé d'un break ou début de chaîne.
  const emojiMatch = before.match(/(?:^|\s)(:([a-z0-9_+-]*))$/i)
  if (emojiMatch) {
    const token = emojiMatch[1]
    return {
      type: 'emoji',
      query: emojiMatch[2],
      start: cursor - token.length,
      end: cursor,
    }
  }

  // Mention : `@xxx` où xxx accepte lettres / accents / apostrophe / tiret / espace.
  // On exclut volontairement les `[` qui font partie du format final `@[Nom](id)`.
  const mentionMatch = before.match(/(?:^|\s)(@([A-Za-zÀ-ſ][\wÀ-ſ'\- ]{0,30})?)$/)
  if (mentionMatch) {
    const token = mentionMatch[1]
    return {
      type: 'mention',
      query: (mentionMatch[2] || '').trim(),
      start: cursor - token.length,
      end: cursor,
    }
  }

  return null
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const units = ['o', 'Ko', 'Mo', 'Go']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`
}

export default function MessageComposer({ conversationId, users, onSend, onUploaded, onTyping }: MessageComposerProps) {
  const { showToast } = useToast()
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [inlineSuggest, setInlineSuggest] = useState<InlineSuggestState | null>(null)
  const [suggestIndex, setSuggestIndex] = useState(0)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const emojiSuggestions = useMemo<EmojiSuggestion[]>(
    () => (inlineSuggest?.type === 'emoji' ? getEmojiSuggestions(inlineSuggest.query) : []),
    [inlineSuggest]
  )

  const mentionSuggestions = useMemo<MessagingUser[]>(() => {
    if (inlineSuggest?.type !== 'mention') return []
    const q = inlineSuggest.query.toLowerCase()
    const filtered = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users
    return filtered.slice(0, 8)
  }, [inlineSuggest, users])

  const suggestionCount = inlineSuggest?.type === 'emoji' ? emojiSuggestions.length : mentionSuggestions.length

  useEffect(() => {
    setSuggestIndex(0)
  }, [inlineSuggest?.type, inlineSuggest?.query])

  const disabled = !conversationId || sending
  const canSend = !!conversationId && !sending && (content.trim().length > 0 || files.length > 0)

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
  }, [content])

  // Sur iOS Safari, quand le clavier virtuel s'ouvre, le visualViewport rétrécit
  // mais le layout fixed reste collé au bas du *document* — donc le composer
  // peut se retrouver caché sous le clavier. On suit visualViewport et on pousse
  // le composer vers le haut de l'overlay clavier.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const root = document.documentElement
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--messaging-kb-offset', `${offset}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.removeProperty('--messaging-kb-offset')
    }
  }, [])

  const submit = async () => {
    if (!conversationId || sending) return
    const trimmed = content.trim()
    if (!trimmed && files.length === 0) return
    setSending(true)
    try {
      if (files.length > 0) {
        await uploadMessageAttachments(conversationId, trimmed || 'Pièce jointe', files)
        await onUploaded()
      } else {
        await onSend(trimmed)
      }
      setContent('')
      setFiles([])
      setMentionOpen(false)
      setEmojiOpen(false)
      onTyping(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'envoi'
      showToast(msg, 'error')
    } finally {
      setSending(false)
    }
  }

  const insertAtCursor = (value: string) => {
    const textarea = textareaRef.current
    if (!textarea) {
      setContent((previous) => previous + value)
      return
    }
    const start = textarea.selectionStart ?? content.length
    const end = textarea.selectionEnd ?? content.length
    const next = content.slice(0, start) + value + content.slice(end)
    setContent(next)
    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + value.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  /**
   * Remplace le token de trigger (`:xxx` ou `@xxx`) par le résultat sélectionné
   * et repositionne le curseur juste après l'insertion.
   */
  const applyInlineSuggestion = useCallback(
    (replacement: string) => {
      const trigger = inlineSuggest
      if (!trigger) return
      const next = content.slice(0, trigger.start) + replacement + content.slice(trigger.end)
      setContent(next)
      setInlineSuggest(null)
      const newCursor = trigger.start + replacement.length
      requestAnimationFrame(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(newCursor, newCursor)
      })
    },
    [content, inlineSuggest]
  )

  const selectSuggestion = useCallback(
    (index: number) => {
      if (!inlineSuggest) return
      if (inlineSuggest.type === 'emoji') {
        const suggestion = emojiSuggestions[index]
        if (suggestion) applyInlineSuggestion(`${suggestion.emoji} `)
      } else {
        const user = mentionSuggestions[index]
        if (user) applyInlineSuggestion(`@[${user.name}](${user._id}) `)
      }
    },
    [inlineSuggest, emojiSuggestions, mentionSuggestions, applyInlineSuggestion]
  )

  const refreshTrigger = useCallback(
    (text: string, cursor: number) => {
      const next = detectInlineTrigger(text, cursor)
      setInlineSuggest(next)
    },
    []
  )

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return
    setFiles((previous) => [...previous, ...Array.from(newFiles)].slice(0, 5))
  }

  const removeFile = (target: File) => {
    setFiles((previous) => previous.filter((file) => file !== target))
  }

  return (
    <div className="messaging-composer" data-disabled={disabled || undefined}>
      {files.length > 0 && (
        <ul className="messaging-composer-files">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              <span className="messaging-composer-file-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span className="messaging-composer-file-info">
                <span className="messaging-composer-file-name">{file.name}</span>
                <span className="messaging-composer-file-size">{formatFileSize(file.size)}</span>
              </span>
              <button
                type="button"
                className="messaging-composer-file-remove"
                onClick={() => removeFile(file)}
                aria-label={`Retirer ${file.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {mentionOpen && (
        <div className="messaging-composer-popover">
          <header>Mentionner</header>
          <div className="messaging-composer-popover-list">
            {users.length === 0 ? (
              <p>Aucun utilisateur</p>
            ) : (
              users.slice(0, 20).map((user) => (
                <button
                  key={user._id}
                  type="button"
                  onClick={() => {
                    insertAtCursor(`@[${user.name}](${user._id}) `)
                    setMentionOpen(false)
                  }}
                >
                  <strong>{user.name}</strong>
                  <span>{user.jobTitle || user.role}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {emojiOpen && (
        <div className="messaging-composer-popover">
          <header>Emoji</header>
          <div className="messaging-composer-emojis">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  insertAtCursor(emoji)
                  setEmojiOpen(false)
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {inlineSuggest && suggestionCount > 0 && (
        <div className="messaging-composer-inline-suggest" role="listbox" aria-label={inlineSuggest.type === 'emoji' ? 'Suggestions emoji' : 'Suggestions de mention'}>
          {inlineSuggest.type === 'emoji'
            ? emojiSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion.shortcode}
                  type="button"
                  role="option"
                  aria-selected={index === suggestIndex}
                  className={`messaging-composer-inline-item ${index === suggestIndex ? 'active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectSuggestion(index)
                  }}
                  onMouseEnter={() => setSuggestIndex(index)}
                >
                  <span className="messaging-composer-inline-emoji">{suggestion.emoji}</span>
                  <span className="messaging-composer-inline-label">:{suggestion.shortcode}:</span>
                </button>
              ))
            : mentionSuggestions.map((user, index) => (
                <button
                  key={user._id}
                  type="button"
                  role="option"
                  aria-selected={index === suggestIndex}
                  className={`messaging-composer-inline-item ${index === suggestIndex ? 'active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectSuggestion(index)
                  }}
                  onMouseEnter={() => setSuggestIndex(index)}
                >
                  <span className="messaging-composer-inline-avatar" aria-hidden="true">
                    {user.name.split(/\s+/).filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="messaging-composer-inline-body">
                    <strong>{user.name}</strong>
                    <small>{user.jobTitle || user.role}</small>
                  </span>
                </button>
              ))}
        </div>
      )}

      <div className="messaging-composer-row">
        <div className="messaging-composer-tools">
          <label className="messaging-composer-tool" title="Joindre un fichier">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.4 18.21a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <input
              type="file"
              multiple
              disabled={disabled}
              onChange={(event) => {
                addFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            className={`messaging-composer-tool ${emojiOpen ? 'active' : ''}`}
            onClick={() => {
              setEmojiOpen((value) => !value)
              setMentionOpen(false)
            }}
            disabled={disabled}
            aria-label="Insérer un emoji"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <button
            type="button"
            className={`messaging-composer-tool ${mentionOpen ? 'active' : ''}`}
            onClick={() => {
              setMentionOpen((value) => !value)
              setEmojiOpen(false)
            }}
            disabled={disabled}
            aria-label="Mentionner un utilisateur"
          >
            <span className="messaging-composer-tool-text">@</span>
          </button>
        </div>

        <textarea
          ref={textareaRef}
          value={content}
          disabled={disabled}
          placeholder={conversationId ? 'Écrire un message…' : 'Sélectionnez une conversation pour écrire'}
          rows={1}
          onChange={(event) => {
            const value = event.target.value
            setContent(value)
            refreshTrigger(value, event.target.selectionStart ?? value.length)
            onTyping(true)
            if (typingTimeout.current) clearTimeout(typingTimeout.current)
            typingTimeout.current = setTimeout(() => onTyping(false), 1200)
          }}
          onSelect={(event) => {
            const target = event.currentTarget
            refreshTrigger(target.value, target.selectionStart ?? target.value.length)
          }}
          onBlur={() => {
            // Petit délai pour laisser le clic sur un item de la liste passer avant fermeture
            setTimeout(() => setInlineSuggest(null), 120)
          }}
          onKeyDown={(event) => {
            // Autocomplete inline a la priorité sur Enter / flèches
            if (inlineSuggest && suggestionCount > 0) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSuggestIndex((i) => (i + 1) % suggestionCount)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSuggestIndex((i) => (i - 1 + suggestionCount) % suggestionCount)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                selectSuggestion(suggestIndex)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setInlineSuggest(null)
                return
              }
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />

        <button
          type="button"
          className="messaging-composer-send"
          onClick={submit}
          disabled={!canSend}
          aria-label="Envoyer le message"
        >
          {sending ? (
            <span className="messaging-spinner messaging-spinner-sm" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <p className="messaging-composer-hint">
        <span>Entrée pour envoyer · Maj + Entrée pour aller à la ligne</span>
        {files.length > 0 && <span>{files.length}/5 pièce(s) jointe(s)</span>}
      </p>
    </div>
  )
}
