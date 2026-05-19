import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { uploadMessageAttachments } from '../../../services/messaging'
import type { MessagingUser } from '../../../types/messaging.types'

interface MessageComposerProps {
  conversationId: string | null
  users: MessagingUser[]
  onSend: (content: string) => Promise<void>
  onUploaded: () => Promise<void>
  onTyping: (isTyping: boolean) => void
}

const QUICK_EMOJIS = ['😀', '😅', '😂', '😍', '😎', '🤔', '👍', '🙏', '🔥', '🚀', '🎉', '❤️']

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
  const [mentionQuery, setMentionQuery] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredMentionUsers = mentionQuery
    ? users.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : users.slice(0, 8)

  const disabled = !conversationId || sending
  const canSend = !!conversationId && !sending && (content.trim().length > 0 || files.length > 0)

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
  }, [content])

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
      console.error('[MessageComposer] submit error:', err)
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
            {filteredMentionUsers.length === 0 ? (
              <p>Aucun utilisateur</p>
            ) : (
              filteredMentionUsers.map((user) => (
                <button
                  key={user._id}
                  type="button"
                  onClick={() => {
                    const textarea = textareaRef.current
                    const cursor = textarea?.selectionStart ?? content.length
                    const before = content.slice(0, cursor)
                    const after = content.slice(cursor)
                    const match = before.match(/@([^\s]*)$/)
                    const newBefore = match
                      ? before.slice(0, before.length - match[0].length)
                      : before
                    const mention = `@[${user.name}](${user._id}) `
                    setContent(newBefore + mention + after)
                    setMentionOpen(false)
                    setMentionQuery('')
                    requestAnimationFrame(() => {
                      if (textarea) {
                        const pos = (newBefore + mention).length
                        textarea.focus()
                        textarea.setSelectionRange(pos, pos)
                      }
                    })
                  }}
                >
                  <strong>{user.name}</strong>
                  <span>{user.role}</span>
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
            const val = event.target.value
            setContent(val)
            onTyping(true)
            if (typingTimeout.current) clearTimeout(typingTimeout.current)
            typingTimeout.current = setTimeout(() => onTyping(false), 1200)
            // Autocomplete @ : détecte @mot avant le curseur
            const cursor = event.target.selectionStart ?? val.length
            const before = val.slice(0, cursor)
            const match = before.match(/@([^\s]*)$/)
            if (match) {
              setMentionQuery(match[1])
              setMentionOpen(true)
              setEmojiOpen(false)
            } else {
              setMentionOpen(false)
              setMentionQuery('')
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMentionOpen(false)
              setEmojiOpen(false)
            }
            if (event.key === 'Enter' && !event.shiftKey && !mentionOpen) {
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
