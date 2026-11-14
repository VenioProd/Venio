import type { CSSProperties } from 'react'
import { AlertTriangle, Handshake, ShieldAlert, Sparkles, Voicemail } from 'lucide-react'
import { CrmChip, type CrmTone } from '../../../../components/admin/crm-ui'
import { useI18n } from '../../../../context/I18nContext'
import type { Lead } from '../../../../types/crm.types'
import { STATUS_MAP, TEMPERATURE_MAP } from '../constants'
import '../suivre.css'

const DAY = 86_400_000

const HEAT_TONE: Record<string, CrmTone> = { FROID: 'grey', TIEDE: 'blue', CHAUD: 'orange', TRES_CHAUD: 'red' }

/** Puce de statut du pipeline : pastille à la couleur de l'étape. */
export function StatusChip({ status }: { status: string }) {
  const { t } = useI18n()
  const info = STATUS_MAP[status]
  return (
    <span className="crm-ui-chip" style={{ '--crm-ui-tone': info?.color ?? 'var(--text-muted)' } as CSSProperties}>
      <span className="crm-ui-dot" aria-hidden="true" />
      {info ? t(info.labelKey) : status}
    </span>
  )
}

/** Chaleur du lead ; un tiret quand elle n'est pas renseignée. */
export function HeatChip({ lead }: { lead: Pick<Lead, 'leadTemperature'> }) {
  const { t } = useI18n()
  const option = TEMPERATURE_MAP[lead.leadTemperature || '']
  if (!option) return <span className="crm-suivre-dim">—</span>
  return (
    <CrmChip tone={HEAT_TONE[option.key] ?? 'grey'} dot>
      {t(option.labelKey)}
    </CrmChip>
  )
}

/** Relance dont la date est passée : « Relance en retard de 2 jours ». */
export function LateChip({ nextActionAt, now, short = false }: { nextActionAt: string; now: Date; short?: boolean }) {
  const { t } = useI18n()
  const days = Math.floor((now.getTime() - new Date(nextActionAt).getTime()) / DAY)
  const label = short
    ? t('crmSuivre.chip.lateShort')
    : days >= 1
      ? t('crmSuivre.chip.lateDays', { count: days })
      : t('crmSuivre.chip.late')
  return (
    <CrmChip tone="red" icon={<AlertTriangle size={13} />}>
      {label}
    </CrmChip>
  )
}

/** Fiche retenue après une opposition détectée sur un appel. */
export function HoldChip({ short = false }: { short?: boolean }) {
  const { t } = useI18n()
  return (
    <CrmChip tone="red" icon={<ShieldAlert size={13} />}>
      {t(short ? 'crmSuivre.chip.holdShort' : 'crmSuivre.chip.hold')}
    </CrmChip>
  )
}

/** Fiche transmise au closer par un commercial externe. */
export function HandoffChip() {
  const { t } = useI18n()
  return (
    <CrmChip tone="blue" icon={<Handshake size={13} />}>
      {t('crmSuivre.chip.handoff')}
    </CrmChip>
  )
}

/** Analyse d'appel prête, que l'utilisateur peut valider. */
export function AnalysisChip() {
  const { t } = useI18n()
  return (
    <CrmChip tone="amber" icon={<Sparkles size={13} />}>
      {t('crmSuivre.chip.analysis')}
    </CrmChip>
  )
}

/** Dernier résultat d'appel : le répondeur. */
export function VoicemailChip() {
  const { t } = useI18n()
  return (
    <CrmChip tone="red" icon={<Voicemail size={13} />}>
      {t('crmSuivre.chip.voicemail')}
    </CrmChip>
  )
}

const initialsOf = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')

/** Pastille d'initiales : l'avatar des responsables de la maquette. */
export function Avatar({ name }: { name: string }) {
  return (
    <span className="crm-suivre-avatar" aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}

/** Responsable : avatar et nom. */
export function OwnerCell({ name }: { name: string }) {
  return (
    <span className="crm-suivre-owner" title={name}>
      <Avatar name={name} />
      <span className="crm-suivre-owner__name">{name}</span>
    </span>
  )
}
