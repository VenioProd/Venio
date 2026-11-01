import { useI18n } from '../../../../context/I18nContext'

/** Pastille « Nouveau » des colonnes et champs apparus avec l'enrichissement du CRM. */
export default function NewBadge() {
  const { t } = useI18n()
  return <span className="rich-new">{t('crmRich.new')}</span>
}
