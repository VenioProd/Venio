import { useState } from 'react'
import { Copy, Hand, KeyRound, UserPlus, UserX } from 'lucide-react'
import {
  inviteTester,
  joinCampaignAsTester,
  revokeTester,
  rotateTesterLink,
  testerLinkUrl,
  type BetaTester,
} from '../../../services/beta'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatRelative } from './helpers'

interface Props {
  campaignId: string
  testers: BetaTester[]
  onChanged: () => void
}

/**
 * Le lien d'un testeur n'est lisible qu'au moment où le serveur le renvoie :
 * il n'est stocké que sous forme d'empreinte. On le garde donc affiché tant
 * que l'admin n'a pas quitté l'écran, en le disant clairement.
 */
export default function TesterPanel({ campaignId, testers, onChanged }: Props) {
  const { t } = useI18n()
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({})
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const alreadyIn = testers.some((tester) => tester.isTeamMember && !tester.revokedAt)

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { tester, token } = await inviteTester(campaignId, { name, email })
      setFreshLinks((current) => ({ ...current, [tester._id]: testerLinkUrl(token) }))
      setName('')
      setEmail('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('beta.testers.inviteFailed'))
    } finally {
      setBusy(false)
    }
  }

  /** Le membre connecté se déclare testeur : rien à saisir, son compte suffit. */
  async function joinMyself() {
    setBusy(true)
    setError(null)
    try {
      const { tester, token } = await joinCampaignAsTester(campaignId)
      setFreshLinks((current) => ({ ...current, [tester._id]: testerLinkUrl(token) }))
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('beta.testers.joinFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="beta-testers">
      <div className="beta-join">
        <button type="button" className="beta-btn" onClick={joinMyself} disabled={busy || alreadyIn}>
          <Hand size={14} aria-hidden /> {alreadyIn ? t('beta.testers.alreadyIn') : t('beta.testers.joinMyself')}
        </button>
        <p className="beta-muted beta-hint">{t('beta.testers.joinHint')}</p>
      </div>

      <form className="beta-invite" onSubmit={invite}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('beta.testers.namePlaceholder')}
          aria-label={t('beta.testers.nameAria')}
          required
        />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('beta.testers.emailPlaceholder')}
          aria-label={t('beta.testers.emailAria')}
          required
        />
        <button type="submit" className="beta-btn beta-btn-primary" disabled={busy || !name || !email}>
          <UserPlus size={14} aria-hidden /> {t('beta.testers.invite')}
        </button>
      </form>
      {error && <p className="beta-error">{error}</p>}

      {testers.length === 0 && <p className="beta-muted">{t('beta.testers.empty')}</p>}

      <ul className="beta-tester-list">
        {testers.map((tester) => (
          <li key={tester._id} className={tester.revokedAt ? 'beta-tester revoked' : 'beta-tester'}>
            <div className="beta-tester-identity">
              <strong>
                {tester.name}
                {tester.isTeamMember && <span className="beta-chip beta-team">{t('beta.testers.teamBadge')}</span>}
              </strong>
              <span className="beta-muted">{tester.email}</span>
            </div>
            <div className="beta-tester-state">
              {tester.revokedAt ? (
                <span className="beta-chip beta-chip-fail">{t('beta.testers.revoked')}</span>
              ) : tester.lastSeenAt ? (
                <span className="beta-muted">
                  {t('beta.testers.seen', { when: formatRelative(tester.lastSeenAt) })}
                </span>
              ) : (
                <span className="beta-chip beta-chip-warn">{t('beta.testers.neverVisited')}</span>
              )}
            </div>
            <div className="beta-tester-actions">
              <button
                type="button"
                className="beta-btn beta-btn-ghost"
                onClick={async () => {
                  const { token } = await rotateTesterLink(tester._id)
                  setFreshLinks((current) => ({ ...current, [tester._id]: testerLinkUrl(token) }))
                  onChanged()
                }}
              >
                <KeyRound size={13} aria-hidden /> {t('beta.testers.newLink')}
              </button>
              {!tester.revokedAt && (
                <button
                  type="button"
                  className="beta-btn beta-btn-ghost"
                  onClick={async () => {
                    if (!window.confirm(t('beta.testers.revokeConfirm', { name: tester.name }))) return
                    await revokeTester(tester._id)
                    onChanged()
                  }}
                >
                  <UserX size={13} aria-hidden /> {t('beta.testers.revoke')}
                </button>
              )}
            </div>

            {freshLinks[tester._id] && (
              <div className="beta-fresh-link">
                <code>{freshLinks[tester._id]}</code>
                <button
                  type="button"
                  className="beta-btn"
                  onClick={() => void navigator.clipboard?.writeText(freshLinks[tester._id]!)}
                >
                  <Copy size={13} aria-hidden /> {t('beta.testers.copy')}
                </button>
                <p className="beta-muted beta-hint">{t('beta.testers.linkOnce')}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
