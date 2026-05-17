import { useRef, useState } from 'react'
import { uploadMessageAttachments } from '../../../services/messaging'
import type { MessagingUser } from '../../../types/messaging.types'

interface MessageComposerProps {
  conversationId: string | null
  users: MessagingUser[]
  onSend: (content: string) => Promise<void>
  onUploaded: () => Promise<void>
  onTyping: (isTyping: boolean) => void
}

export default function MessageComposer({ conversationId, users, onSend, onUploaded, onTyping }: MessageComposerProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      onTyping(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="messaging-composer">
      <div className="messaging-composer-tools">
        <select
          value=""
          onChange={(event) => {
            const user = users.find((item) => item._id === event.target.value)
            if (user) setContent((prev) => `${prev}@[${user.name}](${user._id}) `)
          }}
          aria-label="Mentionner un utilisateur"
        >
          <option value="">Mentionner...</option>
          {users.map((user) => (
            <option key={user._id} value={user._id}>{user.name}</option>
          ))}
        </select>
        <label className="messaging-file-button">
          Joindre
          <input
            type="file"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))}
          />
        </label>
        {files.length > 0 && <span>{files.length} fichier(s)</span>}
      </div>
      <div className="messaging-composer-row">
        <textarea
          value={content}
          disabled={!conversationId || sending}
          placeholder="Écrire un message interne..."
          rows={2}
          onChange={(event) => {
            setContent(event.target.value)
            onTyping(true)
            if (typingTimeout.current) clearTimeout(typingTimeout.current)
            typingTimeout.current = setTimeout(() => onTyping(false), 1200)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button type="button" onClick={submit} disabled={!conversationId || sending || (!content.trim() && files.length === 0)}>
          Envoyer
        </button>
      </div>
    </div>
  )
}
