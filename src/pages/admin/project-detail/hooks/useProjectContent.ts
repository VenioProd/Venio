import { useState, type FormEvent } from 'react'
import { apiDownload, apiFetch, apiUpload } from '../../../../lib/api'
import type { ProjectItem, ProjectSection } from '../../../../types/project.types'

type SectionForm = { title: string; description: string; isVisible: boolean }
type ItemForm = Record<string, string | boolean>

interface UseProjectContentOptions {
  projectId?: string
  canEditContent: boolean
  canViewContent: boolean
  confirm: (options: { message: string; title?: string }) => Promise<boolean>
  ensurePermission: (allowed: boolean, message: string) => boolean
  load: () => Promise<void>
  setError: (error: string) => void
}

const initialSectionForm: SectionForm = { title: '', description: '', isVisible: true }

const initialItemForm: ItemForm = {
  section: '',
  type: 'LIVRABLE',
  title: '',
  description: '',
  url: '',
  content: '',
  isVisible: true,
  isDownloadable: true,
  status: 'EN_ATTENTE',
}

export function useProjectContent({
  projectId,
  canEditContent,
  canViewContent,
  confirm,
  ensurePermission,
  load,
  setError,
}: UseProjectContentOptions) {
  const [sectionForm, setSectionForm] = useState<SectionForm>(initialSectionForm)
  const [itemForm, setItemForm] = useState<ItemForm>(initialItemForm)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleAddSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/sections`, {
        method: 'POST',
        body: JSON.stringify(sectionForm),
      })
      setSectionForm(initialSectionForm)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur ajout section')
    }
  }

  const handleDeleteSection = async (sectionId: string) => {
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    if (!(await confirm({ message: 'Supprimer cette section ?', title: 'Suppression' }))) return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${projectId}/sections/${sectionId}`, { method: 'DELETE' })
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression section')
    }
  }

  const handleToggleSectionVisibility = async (section: ProjectSection) => {
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/sections/${section._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible: !section.isVisible }),
      })
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour section')
    }
  }

  const handleAddItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      const formData = new FormData()
      Object.keys(itemForm).forEach((key) => {
        if (itemForm[key] !== '' && itemForm[key] !== null) {
          formData.append(key, String(itemForm[key]))
        }
      })
      if (selectedFile) formData.append('file', selectedFile)

      await apiUpload(`/api/admin/projects/${projectId}/items`, formData)
      setItemForm(initialItemForm)
      setSelectedFile(null)
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur ajout item')
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    if (!(await confirm({ message: 'Supprimer cet élément ?', title: 'Suppression' }))) return
    setError('')
    try {
      await apiFetch(`/api/admin/projects/${projectId}/items/${itemId}`, { method: 'DELETE' })
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur suppression item')
    }
  }

  const handleToggleItemVisibility = async (item: ProjectItem) => {
    setError('')
    if (!ensurePermission(canEditContent, 'Accès en lecture seule.')) return
    try {
      await apiFetch(`/api/admin/projects/${projectId}/items/${item._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible: !item.isVisible }),
      })
      await load()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur mise à jour item')
    }
  }

  const handleDownloadItem = async (itemId: string, fileName: string) => {
    if (!ensurePermission(canViewContent, 'Accès en lecture seule.')) return
    try {
      const { blob, filename } = await apiDownload(`/api/admin/projects/${projectId}/items/${itemId}/download`)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename ?? fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError((err as Error).message || 'Téléchargement impossible')
    }
  }

  return {
    sectionForm,
    setSectionForm,
    itemForm,
    setItemForm,
    selectedFile,
    setSelectedFile,
    handleAddSection,
    handleDeleteSection,
    handleToggleSectionVisibility,
    handleAddItem,
    handleDeleteItem,
    handleToggleItemVisibility,
    handleDownloadItem,
  }
}
