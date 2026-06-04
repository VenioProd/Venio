import React, { useEffect, useState } from 'react'
import { Plus, Trash2, ArrowRightCircle, Pin } from 'lucide-react'
import { getNotes, createNote, updateNote, deleteNote, convertIdea } from '../../../../services/workspace'
import type { WorkspaceNote, WorkspaceNoteType } from '../../../../types/workspace.types'

const TITLES: Record<Exclude<WorkspaceNoteType, 'POSTIT'>, string> = {
  NOTE: 'Notes', DRAFT: 'Notebook de brouillons', IDEA: 'Boîte à idées',
}
const PLACEHOLDER: Record<Exclude<WorkspaceNoteType, 'POSTIT'>, string> = {
  NOTE: 'Nouvelle note…', DRAFT: 'Jeter une idée en vrac…', IDEA: 'Une idée à creuser…',
}

export default function NoteCollectionWidget({ noteType }: { noteType: Exclude<WorkspaceNoteType, 'POSTIT'> }) {
  const [notes, setNotes] = useState<WorkspaceNote[]>([])
  const [draft, setDraft] = useState('')

  const load = () => { getNotes(noteType).then(setNotes).catch(() => {}) }
  useEffect(load, [noteType])

  const add = async () => {
    if (!draft.trim()) return
    const created = await createNote({ type: noteType, title: draft.trim(), content: '' })
    setNotes((n) => [created, ...n]); setDraft('')
  }
  const remove = async (id: string) => { await deleteNote(id); setNotes((n) => n.filter((x) => x._id !== id)) }
  const convert = async (id: string) => { await convertIdea(id); load() }
  const togglePin = async (note: WorkspaceNote) => { await updateNote(note._id, { pinned: !note.pinned }); load() }

  return (
    <div className="widget">
      <div className="widget-title">{TITLES[noteType]}<span className="widget-count">{notes.length}</span></div>
      <div className="widget-add">
        <input className="widget-input" placeholder={PLACEHOLDER[noteType]} value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="widget-add__btn" onClick={add} aria-label="Ajouter"><Plus size={16} /></button>
      </div>
      <ul className="widget-list">
        {notes.map((n) => (
          <li key={n._id} className={`widget-note${n.status === 'CONVERTED' ? ' widget-note--done' : ''}`}>
            <span className="widget-note__title">{n.title || n.content.slice(0, 60)}</span>
            <span className="widget-note__actions">
              {noteType === 'NOTE' && (
                <button onClick={() => togglePin(n)} aria-label="Épingler"><Pin size={14} className={n.pinned ? 'pinned' : ''} /></button>
              )}
              {noteType === 'IDEA' && n.status !== 'CONVERTED' && (
                <button onClick={() => convert(n._id)} aria-label="Convertir en tâche"><ArrowRightCircle size={14} /></button>
              )}
              <button onClick={() => remove(n._id)} aria-label="Supprimer"><Trash2 size={14} /></button>
            </span>
          </li>
        ))}
        {notes.length === 0 && <li className="widget-empty">Vide pour l'instant</li>}
      </ul>
    </div>
  )
}
