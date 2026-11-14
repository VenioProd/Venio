import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '../../../context/I18nContext'
import { SETTINGS_GROUPS, settingsSectionLabelKey, settingsSectionPath, type SettingsSectionId } from './sections'
import './crmSettingsNav.css'

/**
 * Navigation des sections : liste de liens à gauche, un menu au-dessus du
 * contenu sous 1100 px (la feuille de style bascule de l'un à l'autre).
 */
export default function SettingsNav({ current }: { current: SettingsSectionId }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <>
      <div className="crm-set-jump">
        <label className="crm-ui-sr-only" htmlFor="crm-set-jump">
          {t('crmPilot.set.jump')}
        </label>
        <select
          id="crm-set-jump"
          value={current}
          onChange={(event) => navigate(settingsSectionPath(event.target.value as SettingsSectionId))}
        >
          {SETTINGS_GROUPS.map((group) => (
            <optgroup key={group.id} label={t(group.labelKey)}>
              {group.sections.map((id) => (
                <option key={id} value={id}>
                  {t(settingsSectionLabelKey(id))}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <nav className="crm-set-nav" aria-label={t('crmPilot.set.navAria')}>
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.id} className="crm-set-nav__group">
            <h3>{t(group.labelKey)}</h3>
            {group.sections.map((id) => (
              <Link key={id} to={settingsSectionPath(id)} aria-current={id === current ? 'page' : undefined}>
                {t(settingsSectionLabelKey(id))}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </>
  )
}
