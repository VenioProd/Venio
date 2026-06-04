import React, { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { getNotes, createNote, updateNote, deleteNote } from '../../../../services/workspace'
import type { WorkspaceNote } from '../../../../types/workspace.types'

const COLORS = ['#fde68a', '#fbcfe8', '#bbf7d0', '#bfdbfe', '#ddd6fe']

export default function PostItWall() {
  const [notes, setNotes] = useState<WorkspaceNote[]>([])

  const load = () => { getNotes('POSTIT').then(setNotes).catch(() => {}) }
  useEffect(load, [])

  const add = async () => {
    const color = COLORS[notes.length % COLORS.length]
    const created = await createNote({ type: 'POSTIT', content: 'Nouveau pense-bête', color })
    setNotes((n) => [...n, created])
  }
  const edit = async (id: string, content: string) => { await updateNote(id, { content }) }
  const remove = async (id: string) => { await deleteNote(id); setNotes((n) => n.filter((x) => x._id !== id)) }

  return (
    <div className="widget">
      <div className="widget-title">Mur de post-it<button className="widget-add__btn" onClick={add} aria-label="Ajouter un post-it"><Plus size={16} /></button></div>
      <div className="postit-wall">
        {notes.map((n) => (
          <div key={n._id} className="postit" style={{ background: n.color || COLORS[0] }}>
            <button className="postit__close" onClick={() => remove(n._id)} aria-label="Supprimer"><X size={12} /></button>
            <textarea defaultValue={n.content} onBlur={(e) => edit(n._id, e.target.value)} />
          </div>
        ))}
        {notes.length === 0 && <p className="widget-empty">Aucun post-it</p>}
      </div>
    </div>
  )
}
