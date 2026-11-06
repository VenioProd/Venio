import { useI18n } from '../../context/I18nContext'
import { passwordIssue, passwordStrength } from '../../lib/passwordPolicy'

interface Props {
  password: string
  identity?: { email?: string | null; name?: string | null }
}

const COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#16a34a']

/** Jauge de robustesse et premier manquement à la politique de mot de passe. */
export default function PasswordStrengthMeter({ password, identity }: Props) {
  const { t } = useI18n()
  if (!password) return null
  const score = passwordStrength(password, identity)
  const issue = passwordIssue(password, identity)
  const level = t(`security.strength.${score}` as 'security.strength.0')
  return (
    <div className="password-strength" data-score={score}>
      <div
        role="meter"
        aria-label={t('security.strength.label', { level })}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        style={{ display: 'flex', gap: 4, marginTop: 6 }}
      >
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: index < score ? COLORS[score] : 'var(--border, rgba(127,127,127,0.3))',
            }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, margin: '4px 0 0', color: score === 0 ? COLORS[0] : 'var(--text-muted)' }}>
        {t('security.strength.label', { level })}
        {issue ? ` — ${t(`security.issue.${issue}` as 'security.issue.tooShort')}` : ''}
      </p>
    </div>
  )
}
