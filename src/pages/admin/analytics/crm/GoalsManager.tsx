import React, { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { createGoal, deleteGoal, fetchGoals, updateGoal } from '../../../../services/pilotage'
import type { CrmGoal } from '../../../../types/pilotage.types'
import type { AdminUser } from '../../../../types/crm.types'
import { CRM_ENTITIES } from '../../crm-board/constants'
import { currentParisMonth, formatEuro, formatMonth, shiftMonth } from './constants'

interface GoalsManagerProps {
  /** Premier mois et nombre de mois affichés par la prévision. */
  from: string
  months: number
  admins: AdminUser[]
  /** Appelé après toute modification, pour recalculer la prévision. */
  onChanged: () => void
}

/** Gestion des objectifs mensuels : réservée aux administrateurs du CRM (le serveur le refuse aux autres). */
const GoalsManager: React.FC<GoalsManagerProps> = ({ from, months, admins, onChanged }) => {
  const { t } = useI18n()
  const [goals, setGoals] = useState<CrmGoal[]>([])
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(from || currentParisMonth())
  const [entity, setEntity] = useState('')
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [wonCount, setWonCount] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { amount: string; wonCount: string }>>({})

  const load = useCallback(async () => {
    try {
      setGoals(await fetchGoals({ from, to: shiftMonth(from, months - 1) }))
      setError('')
    } catch (err) {
      setError((err as Error).message || t('adminTech.forecast.goalsError'))
    }
  }, [from, months, t])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action()
      setError('')
      await load()
      onChanged()
    } catch (err) {
      setError((err as Error).message || t('adminTech.forecast.goalsError'))
    }
  }

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    void run(async () => {
      await createGoal({
        period,
        entity: entity || null,
        userId: userId || null,
        amountTarget: Number(amount) || 0,
        wonCountTarget: Number(wonCount) || 0,
      })
      setAmount('')
      setWonCount('')
    })
  }

  const userName = (id: string | null) => (id ? (admins.find((admin) => admin._id === id)?.name ?? id) : t('adminTech.forecast.goalTeam'))
  const entityName = (key: string | null) => {
    const option = CRM_ENTITIES.find((candidate) => candidate.key === key)
    return option ? t(option.labelKey) : t('adminTech.forecast.goalAllGroup')
  }

  return (
    <div className="forecast-goals">
      <h4 className="pilotage-subtitle">{t('adminTech.forecast.goalsTitle')}</h4>
      <p className="pilotage-subtext">{t('adminTech.forecast.goalsSubtext')}</p>
      {error && <div className="admin-error">{error}</div>}

      <form className="forecast-goal-form" onSubmit={add}>
        <label>
          <span>{t('adminTech.forecast.goalPeriod')}</span>
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
        </label>
        <label>
          <span>{t('adminTech.forecast.goalEntity')}</span>
          <select value={entity} onChange={(event) => setEntity(event.target.value)}>
            <option value="">{t('adminTech.forecast.goalAllGroup')}</option>
            {CRM_ENTITIES.map((option) => (
              <option key={option.key} value={option.key}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('adminTech.forecast.goalUser')}</span>
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">{t('adminTech.forecast.goalTeam')}</option>
            {admins.map((admin) => (
              <option key={admin._id} value={admin._id}>
                {admin.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('adminTech.forecast.goalAmount')}</span>
          <input type="number" min="0" step="100" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label>
          <span>{t('adminTech.forecast.goalWonCount')}</span>
          <input type="number" min="0" step="1" value={wonCount} onChange={(event) => setWonCount(event.target.value)} />
        </label>
        <button type="submit" className="btn-primary">
          {t('adminTech.forecast.goalAdd')}
        </button>
      </form>

      {goals.length === 0 ? (
        <p className="pilotage-empty">{t('adminTech.forecast.goalEmpty')}</p>
      ) : (
        <table className="pilotage-table">
          <thead>
            <tr>
              <th>{t('adminTech.forecast.goalPeriod')}</th>
              <th>{t('adminTech.forecast.goalEntity')}</th>
              <th>{t('adminTech.forecast.goalUser')}</th>
              <th>{t('adminTech.forecast.goalAmount')}</th>
              <th>{t('adminTech.forecast.goalWonCount')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => {
              const draft = drafts[goal._id] ?? { amount: String(goal.amountTarget), wonCount: String(goal.wonCountTarget) }
              const setDraft = (patch: Partial<typeof draft>) => setDrafts((prev) => ({ ...prev, [goal._id]: { ...draft, ...patch } }))
              return (
                <tr key={goal._id}>
                  <td>{formatMonth(goal.period)}</td>
                  <td>{entityName(goal.entity)}</td>
                  <td>{userName(goal.userId)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      aria-label={t('adminTech.forecast.goalAmount') + ' ' + goal.period}
                      value={draft.amount}
                      onChange={(event) => setDraft({ amount: event.target.value })}
                    />
                    <span className="pilotage-money-sub"> {formatEuro(goal.amountTarget)}</span>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      aria-label={t('adminTech.forecast.goalWonCount') + ' ' + goal.period}
                      value={draft.wonCount}
                      onChange={(event) => setDraft({ wonCount: event.target.value })}
                    />
                  </td>
                  <td className="forecast-goal-actions">
                    <button
                      type="button"
                      onClick={() =>
                        void run(() =>
                          updateGoal(goal._id, { amountTarget: Number(draft.amount) || 0, wonCountTarget: Number(draft.wonCount) || 0 }),
                        )
                      }
                    >
                      {t('adminTech.forecast.goalSave')}
                    </button>
                    <button type="button" onClick={() => void run(() => deleteGoal(goal._id))}>
                      {t('adminTech.forecast.goalDelete')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default GoalsManager
