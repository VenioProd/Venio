import React, { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { getNotes, createNote, updateNote, deleteNote } from '../../../../services/workspace'
import type { WorkspaceNote } from '../../../../types/workspace.types'
import { useI18n } from '../../../../context/I18nContext'

const COLORS = ['#fde68a', '#fbcfe8', '#bbf7d0', '#bfdbfe', '#ddd6fe']

export default function PostItWall() {
  const { t } = useI18n()
  const [notes, setNotes] = useState<WorkspaceNote[]>([])

  const load = () => {
    getNotes('POSTIT')
      .then(setNotes)
      .catch(() => {})
  }
  useEffect(load, [])

  const add = async () => {
    const color = COLORS[notes.length % COLORS.length]
    try {
      const created = await createNote({ type: 'POSTIT', content: t('adminAccess.widgets.postitDefault'), color })
      setNotes((n) => [...n, created])
    } catch {
      /* ignore */
    }
  }
  const edit = (id: string, content: string) => {
    updateNote(id, { content }).catch(() => {})
  }
  const remove = async (id: string) => {
    await deleteNote(id)
    setNotes((n) => n.filter((x) => x._id !== id))
  }

  return (
    <div className="widget">
      <div className="widget-title">
        {t('adminAccess.widgets.postitTitle')}
        <button className="widget-add__btn" onClick={add} aria-label={t('adminAccess.widgets.postitAdd')}>
          <Plus size={16} />
        </button>
      </div>
      <div className="postit-wall">
        {notes.map((n) => (
          <div key={n._id} className="postit" style={{ background: n.color || COLORS[0] }}>
            <button
              className="postit__close"
              onClick={() => remove(n._id)}
              aria-label={t('adminAccess.widgets.delete')}
            >
              <X size={12} />
            </button>
            <textarea defaultValue={n.content} onBlur={(e) => edit(n._id, e.target.value)} />
          </div>
        ))}
        {notes.length === 0 && <p className="widget-empty">{t('adminAccess.widgets.postitEmpty')}</p>}
      </div>
    </div>
  )
}
