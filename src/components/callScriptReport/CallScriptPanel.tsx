import { useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { listCallScripts, type CallScriptText } from '../../services/callScripts'
import './callScripts.css'

const COLLAPSED_KEY = 'venio.callScriptPanel.collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Texte du script choisi pour l'appel en cours, repliable (le choix de replier
 * est gardé dans le navigateur). `apiPrefix` : routeur du poste d'appel de
 * l'espace (`desk.apiPrefix`) ; `tag` : étiquette choisie. Rien n'est affiché
 * sans étiquette, sans texte rédigé pour elle, ni si la lecture échoue : un
 * appel ne doit pas être gêné par ce panneau.
 */
export default function CallScriptPanel({ apiPrefix, tag }: { apiPrefix: string; tag: string }) {
  const { t } = useI18n()
  const headId = useId()
  const bodyId = useId()
  const [script, setScript] = useState<CallScriptText | null>(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    let active = true
    listCallScripts(apiPrefix)
      .then((list) => active && setScript(list.find((item) => item.tag === tag) ?? null))
      .catch(() => active && setScript(null))
    return () => {
      active = false
    }
  }, [apiPrefix, tag])

  if (!tag || script?.tag !== tag || script.body === null) return null

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    } catch {
      // Préférence d'affichage seulement : le panneau marche sans.
    }
  }

  return (
    <section className="cs-panel" aria-labelledby={headId}>
      <button
        id={headId}
        type="button"
        className="cs-panel-head"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <ChevronDown size={16} aria-hidden="true" className="cs-chevron" />
        <span className="cs-panel-tag">{t('crmScripts.panel.title', { tag })}</span>
        <span className="cs-panel-title">{script.title}</span>
      </button>
      <div id={bodyId} hidden={collapsed} className="cs-body" tabIndex={0}>
        {script.body}
      </div>
    </section>
  )
}
