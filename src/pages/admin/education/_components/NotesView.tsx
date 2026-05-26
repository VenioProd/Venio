import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  type EducationClass,
  type EducationNote,
  type EducationTemplate,
  type NoteBlock,
} from '@/services/education'
import { NoteEditor } from '../NoteEditor'
import { NoteSaveIndicator, buildBacklinks, makeBlockId, type NoteSaveState } from './shared'

interface Props {
  classes: EducationClass[]
  fixedLink?: { type: 'class' | 'session' | 'assignment' | 'student'; refId: string }
  templates?: EducationTemplate[]
  onTemplatesChanged?: () => void
}

export default function NotesView({
  classes,
  fixedLink,
  templates,
  onTemplatesChanged: _onTemplatesChanged,
}: Props) {
  const [notes, setNotes] = useState<EducationNote[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeNote, setActiveNote] = useState<EducationNote | null>(null)
  const [savingTimer, setSavingTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [saveState, setSaveState] = useState<NoteSaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await listNotes(
        fixedLink ? { linkType: fixedLink.type, linkId: fixedLink.refId } : {},
      )
      setNotes(r.notes)
      setLoadError(null)
      if (!activeId && r.notes.length > 0) {
        setActiveId(r.notes[0]._id)
        setActiveNote(r.notes[0])
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger les notes')
    }
  }, [fixedLink, activeId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!activeId) {
      setActiveNote(null)
      return
    }
    const found = notes.find(n => n._id === activeId)
    if (found) setActiveNote(found)
  }, [activeId, notes])

  const persist = useCallback(
    (next: EducationNote) => {
      setActiveNote(next)
      if (savingTimer) clearTimeout(savingTimer)
      setSaveState('saving')
      setErrorMessage(null)
      const t = setTimeout(async () => {
        try {
          await updateNote(next._id, {
            title: next.title,
            blocks: next.blocks,
            pinned: next.pinned,
            archived: next.archived,
          })
          setSaveState('saved')
          // Rafraîchir en arrière-plan sans écraser le contenu actif déjà à jour.
          const r = await listNotes(
            fixedLink ? { linkType: fixedLink.type, linkId: fixedLink.refId } : {},
          )
          setNotes(r.notes)
          // Retour idle après 1.5s pour ne pas polluer l'UI.
          setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
        } catch (err) {
          setSaveState('error')
          setErrorMessage(err instanceof Error ? err.message : 'Erreur de sauvegarde de la note')
        }
      }, 600)
      setSavingTimer(t)
    },
    [savingTimer, fixedLink],
  )

  async function newNote() {
    try {
      const r = await createNote({
        title: 'Nouvelle note',
        blocks: [
          { id: makeBlockId(), type: 'paragraph', text: '', checked: false, level: 1, meta: {} },
        ],
        links: fixedLink ? [fixedLink] : [],
      })
      await refresh()
      setActiveId(r.note._id)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Impossible de créer la note')
    }
  }

  return (
    <div>
      {!fixedLink && (
        <div className="edu-row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h1 className="edu-h1" style={{ margin: 0 }}>
            Notes
          </h1>
          <div className="edu-row" style={{ gap: 8 }}>
            <NoteSaveIndicator state={saveState} />
            <button className="edu-btn" onClick={newNote}>
              <Plus size={14} /> Nouvelle note
            </button>
          </div>
        </div>
      )}
      {fixedLink && (
        <div className="edu-row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <strong>
            {notes.length} note{notes.length > 1 ? 's' : ''}
          </strong>
          <div className="edu-row" style={{ gap: 8 }}>
            <NoteSaveIndicator state={saveState} />
            <button className="edu-btn" onClick={newNote}>
              <Plus size={14} /> Nouvelle note
            </button>
          </div>
        </div>
      )}
      {(errorMessage || loadError) && (
        <div className="edu-banner-error" role="alert" style={{ marginBottom: 12 }}>
          {errorMessage || loadError}
          <button
            className="edu-btn ghost"
            style={{ marginLeft: 12 }}
            onClick={() => {
              setErrorMessage(null)
              setLoadError(null)
              refresh()
            }}
          >
            Réessayer
          </button>
        </div>
      )}
      <div className="edu-notes-layout">
        <div className="edu-notes-list">
          {notes.length === 0 ? (
            <div className="edu-empty edu-empty-compact">
              <div className="edu-empty-icon">📝</div>
              <div>Aucune note encore.</div>
              <div className="edu-empty-sub">Crée ta première note pour ce contexte.</div>
              <button className="edu-btn" style={{ marginTop: 10 }} onClick={newNote}>
                <Plus size={13} /> Première note
              </button>
            </div>
          ) : (
            notes.map(n => (
              <div
                key={n._id}
                className={`edu-note-list-item ${activeId === n._id ? 'active' : ''}`}
                onClick={() => setActiveId(n._id)}
              >
                <div className="edu-note-list-title">
                  {n.pinned && <span className="edu-note-list-pin">📌</span>}
                  {n.title || 'Sans titre'}
                </div>
                <div className="edu-note-list-preview">
                  {n.markdown.replace(/[#>*`\-]/g, '').slice(0, 80) || '—'}
                </div>
                {n.links.length > 0 && (
                  <div className="edu-note-list-links">
                    {n.links.length} lien{n.links.length > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="edu-note-editor">
          {!activeNote ? (
            <div className="edu-empty">
              <div className="edu-empty-icon">✍️</div>
              <div>Sélectionne ou crée une note.</div>
              <div className="edu-empty-sub">
                Tape « / » dans un bloc pour les commandes Notion.
              </div>
            </div>
          ) : (
            <NoteEditor
              note={activeNote}
              onChange={persist}
              templates={templates}
              backlinks={buildBacklinks(activeNote, classes)}
              onApplyTemplate={t => {
                const tplBlocks = Array.isArray((t.body as { blocks?: NoteBlock[] }).blocks)
                  ? ((t.body as { blocks: NoteBlock[] }).blocks).map(b => ({
                      ...b,
                      id: makeBlockId(),
                    }))
                  : []
                if (tplBlocks.length === 0) return
                persist({ ...activeNote, blocks: [...activeNote.blocks, ...tplBlocks] })
              }}
              onDelete={async () => {
                if (!confirm('Supprimer cette note ?')) return
                try {
                  await deleteNote(activeNote._id)
                  setActiveId(null)
                  refresh()
                } catch (err) {
                  setErrorMessage(
                    err instanceof Error ? err.message : 'Impossible de supprimer la note',
                  )
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
