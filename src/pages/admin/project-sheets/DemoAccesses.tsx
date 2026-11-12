import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import type { ProjectSheetDemoAccess } from '../../../types/projectSheet.types'
import { API_BASE, apiErrorInfo, psKey, safeHttpUrl } from './shared'

interface Props {
  sheetId: string
  accesses: ProjectSheetDemoAccess[]
  canEdit: boolean
  canReveal: boolean
  onChange: (accesses: ProjectSheetDemoAccess[]) => void
}

interface Form {
  id: string | null
  url: string
  role: string
  username: string
  password: string
  notes: string
}

const EMPTY: Form = { id: null, url: '', role: '', username: '', password: '', notes: '' }

/**
 * Accès démo. Le mot de passe n'est jamais fourni par la liste : il n'est récupéré
 * (reveal) que sur clic, gardé uniquement en état local et oublié au démontage.
 */
export default function DemoAccesses({ sheetId, accesses, canEdit, canReveal, onChange }: Props) {
  const { t } = useI18n()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      // Re-masque tout au démontage.
      setRevealed({})
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  async function fetchPassword(accessId: string): Promise<string> {
    const res = await apiFetch<{ password: string }>(
      API_BASE + '/' + sheetId + '/demo-accesses/' + accessId + '/reveal',
      { method: 'POST' },
    )
    return res.password
  }

  async function toggle(accessId: string) {
    setError('')
    if (revealed[accessId] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[accessId]
        return next
      })
      return
    }
    try {
      const password = await fetchPassword(accessId)
      setRevealed((prev) => ({ ...prev, [accessId]: password }))
    } catch {
      setError(t(psKey('demo.revealError')))
    }
  }

  async function copy(accessId: string) {
    setError('')
    try {
      const password = await fetchPassword(accessId)
      await navigator.clipboard.writeText(password)
      setCopied(accessId)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(null), 2500)
    } catch {
      setError(t(psKey('demo.copyError')))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setFormError('')
    const body: Record<string, string> = {
      url: form.url.trim(),
      role: form.role.trim(),
      username: form.username.trim(),
      notes: form.notes,
    }
    // Mot de passe vide en modification = inchangé : on ne l'envoie pas.
    if (form.password || !form.id) body.password = form.password
    try {
      const base = API_BASE + '/' + sheetId + '/demo-accesses'
      const res = await apiFetch<{ demoAccesses: ProjectSheetDemoAccess[] }>(form.id ? base + '/' + form.id : base, {
        method: form.id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      if (form.id) {
        const editedId = form.id
        setRevealed((prev) => {
          const next = { ...prev }
          delete next[editedId]
          return next
        })
      }
      onChange(res.demoAccesses ?? [])
      setForm(null)
    } catch (err) {
      setFormError(apiErrorInfo(err).message || t(psKey('demo.saveError')))
    } finally {
      setBusy(false)
    }
  }

  async function remove(accessId: string) {
    if (!window.confirm(t(psKey('demo.confirmDelete')))) return
    setError('')
    try {
      const res = await apiFetch<{ demoAccesses: ProjectSheetDemoAccess[] }>(
        API_BASE + '/' + sheetId + '/demo-accesses/' + accessId,
        { method: 'DELETE' },
      )
      setRevealed((prev) => {
        const next = { ...prev }
        delete next[accessId]
        return next
      })
      onChange(res.demoAccesses ?? [])
    } catch (err) {
      setError(apiErrorInfo(err).message || t(psKey('demo.deleteError')))
    }
  }

  return (
    <div className="ps-demo">
      <p className="ps-warning ps-warning--strong" role="note">
        {t(psKey('demo.warning'))}
      </p>
      {error && (
        <p role="alert" className="ps-error">
          {error}
        </p>
      )}
      {accesses.length === 0 ? (
        <p className="ps-empty">{t(psKey('demo.empty'))}</p>
      ) : (
        <ul className="ps-demo__list">
          {accesses.map((access) => {
            const password = revealed[access._id]
            const url = safeHttpUrl(access.url)
            return (
              <li key={access._id} className="ps-demo__item">
                <dl>
                  <div>
                    <dt>{t(psKey('demo.url'))}</dt>
                    <dd>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {access.url}
                        </a>
                      ) : (
                        access.url
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t(psKey('demo.role'))}</dt>
                    <dd>{access.role}</dd>
                  </div>
                  <div>
                    <dt>{t(psKey('demo.username'))}</dt>
                    <dd>
                      <code>{access.username}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>{t(psKey('demo.password'))}</dt>
                    <dd>
                      {!access.hasPassword ? (
                        <span className="ps-empty">{t(psKey('demo.noPassword'))}</span>
                      ) : password !== undefined ? (
                        <code data-testid="demo-password">{password}</code>
                      ) : (
                        <span>{t(psKey('demo.masked'))}</span>
                      )}
                    </dd>
                  </div>
                  {access.notes && (
                    <div>
                      <dt>{t(psKey('demo.notes'))}</dt>
                      <dd className="ps-demo__notes">{access.notes}</dd>
                    </div>
                  )}
                </dl>
                <div className="ps-actions">
                  {canReveal && access.hasPassword && (
                    <>
                      <button
                        type="button"
                        className="ps-btn"
                        aria-label={t(psKey(password !== undefined ? 'demo.hideAria' : 'demo.showAria'), {
                          role: access.role,
                        })}
                        onClick={() => toggle(access._id)}
                      >
                        {t(psKey(password !== undefined ? 'demo.hide' : 'demo.show'))}
                      </button>
                      <button
                        type="button"
                        className="ps-btn"
                        aria-label={t(psKey('demo.copyAria'), { role: access.role })}
                        onClick={() => copy(access._id)}
                      >
                        {t(psKey('demo.copy'))}
                      </button>
                      {copied === access._id && (
                        <span role="status" className="ps-copied">
                          {t(psKey('demo.copied'))}
                        </span>
                      )}
                    </>
                  )}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="ps-btn"
                        onClick={() => {
                          setFormError('')
                          setForm({
                            id: access._id,
                            url: access.url,
                            role: access.role,
                            username: access.username,
                            password: '',
                            notes: access.notes || '',
                          })
                        }}
                      >
                        {t(psKey('demo.edit'))}
                      </button>
                      <button type="button" className="ps-btn ps-btn--danger" onClick={() => remove(access._id)}>
                        {t(psKey('demo.delete'))}
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && !form && (
        <button
          type="button"
          className="ps-btn"
          onClick={() => {
            setFormError('')
            setForm({ ...EMPTY })
          }}
        >
          + {t(psKey('demo.add'))}
        </button>
      )}
      {canEdit && form && (
        <form className="ps-form" onSubmit={submit}>
          <p className="ps-warning" role="note">
            {t(psKey('edit.secretWarning'))}
          </p>
          <fieldset disabled={busy} className="ps-fields">
            <label>
              {t(psKey('demo.url'))}
              <input
                type="url"
                value={form.url}
                maxLength={2000}
                required
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </label>
            <label>
              {t(psKey('demo.role'))}
              <input
                value={form.role}
                maxLength={120}
                required
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </label>
            <label>
              {t(psKey('demo.username'))}
              <input
                value={form.username}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </label>
            <label>
              {t(psKey('demo.password'))}
              <input
                type="password"
                value={form.password}
                maxLength={200}
                autoComplete="new-password"
                placeholder={form.id ? t(psKey('demo.keepPlaceholder')) : ''}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label>
              {t(psKey('demo.notes'))}
              <textarea
                rows={3}
                value={form.notes}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </fieldset>
          {formError && (
            <p role="alert" className="ps-error">
              {formError}
            </p>
          )}
          <div className="ps-actions">
            <button type="submit" className="ps-btn ps-btn--primary" disabled={busy}>
              {t(psKey('demo.save'))}
            </button>
            <button type="button" className="ps-btn" disabled={busy} onClick={() => setForm(null)}>
              {t(psKey('demo.cancel'))}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
