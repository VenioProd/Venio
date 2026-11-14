import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import CrmSequences from '../sequences'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { canAdministerCrm } from '../../../../lib/crmAccess'
import { CrmPageHead, CrmSubtabs } from '../../../../components/admin/crm-ui'
import type { MessageKey } from '../../../../i18n'
import Dialog from './Dialog'
import RuleBuilder from './RuleBuilder'
import RulesPanel from './RulesPanel'
import RunsJournal, { type JournalFilter } from './RunsJournal'
import TemplatesGrid from './TemplatesGrid'
import { createRule, deleteRule, fetchRules, fetchRuns, setRuleStatus } from './api'
import { draftFromRule, emptyDraft, type CrmRule, type CrmRuleRun, type RuleDraft } from './types'
import './automations.css'

type Section = 'regles' | 'sequences' | 'journal' | 'modeles'
/** Ordre de la maquette : les règles, leurs modèles, les séquences, puis la trace de ce qui s'est exécuté. */
const SECTIONS: Array<{ key: Section; labelKey: MessageKey }> = [
  { key: 'regles', labelKey: 'crmPilot.auto.section.regles' },
  { key: 'modeles', labelKey: 'crmPilot.auto.section.modeles' },
  { key: 'sequences', labelKey: 'crmPilot.auto.section.sequences' },
  { key: 'journal', labelKey: 'crmPilot.auto.section.journal' },
]

interface BuilderState {
  rule: CrmRule | null
  draft: RuleDraft
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export default function CrmAutomations({ onPendingCount }: { onPendingCount?: (count: number) => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  // Réservé SUPER_ADMIN / ADMIN : miroir de la règle serveur (administersCrm).
  const canAdminister = canAdministerCrm(user)
  const [rules, setRules] = useState<CrmRule[]>([])
  const [recent, setRecent] = useState<CrmRuleRun[]>([])
  const [recentTotal, setRecentTotal] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const section = SECTIONS.find((item) => item.key === params.get('section'))?.key ?? 'regles'
  const setSection = (value: Section) =>
    setParams(
      (current) => {
        current.set('section', value)
        return current
      },
      { replace: true },
    )
  // Chaque section est un lien (`?section=`) qui garde les autres paramètres de l'adresse.
  const sectionLink = (value: Section) => {
    const next = new URLSearchParams(params)
    next.set('section', value)
    return `${location.pathname}?${next.toString()}`
  }
  const [filter, setFilter] = useState<JournalFilter>('all')
  const [version, setVersion] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [builder, setBuilder] = useState<BuilderState | null>(null)
  const [toDelete, setToDelete] = useState<CrmRule | null>(null)
  const [message, setMessage] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [list, page, pend] = await Promise.all([
        fetchRules(),
        fetchRuns({ pageSize: 50 }),
        fetchRuns({ status: 'PENDING', pageSize: 1 }),
      ])
      setRules(list)
      setRecent(page.items ?? [])
      setRecentTotal(page.total ?? 0)
      setPending(pend.total ?? 0)
      onPendingCount?.(pend.total ?? 0)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorText(e, t('crmAuto.loadError')))
    } finally {
      setLoading(false)
    }
  }, [t, onPendingCount])

  useEffect(() => {
    void reload()
  }, [reload])

  const refreshAll = useCallback(() => {
    void reload()
    setVersion((v) => v + 1)
  }, [reload])

  const notify = (text: string) => {
    setProblem(null)
    setMessage(text)
  }

  const toggle = async (rule: CrmRule) => {
    if (!canAdminister) return
    setBusyId(rule._id)
    setProblem(null)
    try {
      const updated = await setRuleStatus(rule._id, rule.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')
      setRules((list) => list.map((r) => (r._id === rule._id ? { ...r, ...updated } : r)))
      notify(updated.status === 'ACTIVE' ? t('crmAuto.ruleActivated') : t('crmAuto.rulePaused'))
    } catch (e) {
      setProblem(errorText(e, t('crmAuto.statusChangeError')))
    } finally {
      setBusyId(null)
    }
  }

  const duplicate = async (rule: CrmRule) => {
    if (!canAdminister) return
    setBusyId(rule._id)
    setProblem(null)
    try {
      const copy = await createRule(draftFromRule(rule, true))
      await reload()
      notify(t('crmAuto.duplicated'))
      setBuilder({ rule: copy, draft: draftFromRule(copy) })
    } catch (e) {
      setProblem(errorText(e, t('crmAuto.duplicateError')))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete || !canAdminister) return
    const rule = toDelete
    setToDelete(null)
    setBusyId(rule._id)
    try {
      await deleteRule(rule._id)
      setRules((list) => list.filter((r) => r._id !== rule._id))
      notify(t('crmAuto.deleted'))
    } catch (e) {
      setProblem(errorText(e, t('crmAuto.deleteError')))
    } finally {
      setBusyId(null)
    }
  }

  const kpis = useMemo(() => {
    const active = rules.filter((r) => r.status === 'ACTIVE').length
    const systemActive = rules.filter((r) => r.status === 'ACTIVE' && r.system).length
    const totals = rules.reduce(
      (acc, r) => ({
        runs: acc.runs + (r.stats?.runs ?? 0),
        ok: acc.ok + (r.stats?.ok ?? 0),
        errors: acc.errors + (r.stats?.errors ?? 0),
      }),
      { runs: 0, ok: 0, errors: 0 },
    )
    const judged = totals.ok + totals.errors
    const tasks = recent.reduce(
      (n, run) => n + run.steps.filter((s) => s.action === 'CREATE_TASK' && s.status === 'OK').length,
      0,
    )
    return [
      {
        label: t('crmAuto.kpi.activeRules'),
        value: `${active}/${rules.length}`,
        hint: t('crmAuto.kpi.systemHint', { count: systemActive }),
      },
      { label: t('crmAuto.kpi.runs'), value: String(totals.runs), hint: t('crmAuto.kpi.runsHint') },
      {
        label: t('crmAuto.kpi.successRate'),
        value: judged > 0 ? `${Math.round((totals.ok / judged) * 100)} %` : '—',
        hint: t('crmAuto.kpi.errorsHint', { count: totals.errors }),
      },
      {
        label: t('crmAuto.kpi.tasks'),
        value: String(tasks),
        hint: t('crmAuto.kpi.tasksHint', { count: recent.length }),
      },
      {
        label: t('crmAuto.kpi.toApprove'),
        value: String(pending),
        hint: pending > 0 ? t('crmAuto.kpi.pendingHint') : t('crmAuto.kpi.nothingPending'),
      },
    ]
  }, [rules, recent, pending, t])

  const applyTemplate = (template: { draft: RuleDraft }) =>
    canAdminister && setBuilder({ rule: null, draft: template.draft })

  return (
    <div className="crm-auto">
      <CrmPageHead
        title={t('crmPilot.auto.title')}
        lede={t('crmPilot.auto.lede')}
        actions={
          <button
            type="button"
            id="crm-auto-new"
            className="crm-ui-btn crm-ui-btn--primary"
            disabled={!canAdminister}
            title={canAdminister ? undefined : t('crmAuto.adminOnly')}
            onClick={() => setBuilder({ rule: null, draft: emptyDraft() })}
          >
            {t('crmAuto.newRule')}
          </button>
        }
      />
      <p className="crm-auto-sr" role="status" aria-live="polite">
        {message}
      </p>

      <section className="crm-auto-kpis" aria-label={t('crmAuto.kpi.aria')}>
        {kpis.map((k) => (
          <div className="crm-auto-kpi crm-auto-glass" key={k.label}>
            <small>{k.label}</small>
            <b>{loading ? '…' : k.value}</b>
            <em>{loading ? ' ' : k.hint}</em>
          </div>
        ))}
      </section>

      {!canAdminister && (
        <div className="crm-auto-notice" role="note">
          <span>{t('crmAuto.readOnly')}</span>
        </div>
      )}
      {loadError && (
        <div className="crm-auto-notice crm-auto-notice--err" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            className="portal-button secondary crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
            onClick={() => void reload()}
          >
            {t('crmAuto.retry')}
          </button>
        </div>
      )}
      {problem && (
        <div className="crm-auto-notice crm-auto-notice--err" role="alert">
          <span>{problem}</span>
        </div>
      )}
      {pending > 0 && (
        <div className="crm-auto-notice">
          <span>{t('crmAuto.pendingNotice', { count: pending })}</span>
          <button
            type="button"
            className="portal-button secondary crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
            onClick={() => {
              setFilter('PENDING')
              setSection('journal')
            }}
          >
            {t('crmAuto.review')}
          </button>
        </div>
      )}

      <CrmSubtabs
        label={t('crmPilot.auto.sectionsAria')}
        tabs={SECTIONS.map((item) => ({
          id: item.key,
          label: t(item.labelKey),
          to: sectionLink(item.key),
          count: item.key === 'regles' && !loading ? rules.length : undefined,
          current: section === item.key,
        }))}
      />

      <div id="crm-auto-panel-regles" hidden={section !== 'regles'}>
        {section === 'regles' &&
          (loading ? (
            <p className="crm-auto-empty crm-auto-glass" role="status">
              {t('crmAuto.loadingRules')}
            </p>
          ) : (
            <RulesPanel
              rules={rules}
              canAdminister={canAdminister}
              busyId={busyId}
              onToggle={(r) => void toggle(r)}
              onEdit={(r) => setBuilder({ rule: r, draft: draftFromRule(r) })}
              onDuplicate={(r) => void duplicate(r)}
              onDelete={setToDelete}
              onSimulated={() => {
                notify(t('crmAuto.simRecorded'))
                refreshAll()
              }}
              onNew={() => setBuilder({ rule: null, draft: emptyDraft() })}
            />
          ))}
      </div>
      <div id="crm-auto-panel-sequences" hidden={section !== 'sequences'}>
        {section === 'sequences' && <CrmSequences />}
      </div>
      <div id="crm-auto-panel-journal" hidden={section !== 'journal'}>
        {section === 'journal' && (
          <RunsJournal
            canAdminister={canAdminister}
            filter={filter}
            onFilterChange={setFilter}
            version={version}
            onChanged={(text) => {
              notify(text)
              refreshAll()
            }}
            onError={(text) => setProblem(text)}
          />
        )}
      </div>
      <div id="crm-auto-panel-modeles" hidden={section !== 'modeles'}>
        {section === 'modeles' && <TemplatesGrid canAdminister={canAdminister} onUse={applyTemplate} />}
      </div>
      {recentTotal > 0 && section === 'regles' && (
        <p className="crm-auto-note">{t('crmAuto.runsNote', { count: recentTotal })}</p>
      )}

      {builder && canAdminister && (
        <RuleBuilder
          rule={builder.rule}
          draft={builder.draft}
          onClose={() => setBuilder(null)}
          onSaved={(text) => {
            setBuilder(null)
            notify(text)
            setSection('regles')
            void reload()
          }}
        />
      )}
      {toDelete && canAdminister && (
        <Dialog titleId="crm-auto-del-t" onClose={() => setToDelete(null)}>
          <h3 id="crm-auto-del-t">{t('crmAuto.deleteTitle')}</h3>
          <p>{t('crmAuto.deleteBody', { name: toDelete.name })}</p>
          <div className="crm-auto-row">
            <button
              type="button"
              className="portal-button secondary crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
              onClick={() => setToDelete(null)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="portal-button secondary crm-auto-btn crm-auto-btn--danger crm-auto-btn--sm"
              onClick={() => void confirmDelete()}
            >
              {t('common.delete')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
