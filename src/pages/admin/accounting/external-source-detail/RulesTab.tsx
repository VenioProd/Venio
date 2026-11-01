import { useCallback, useEffect, useState } from 'react'
import {
  listClassificationRules,
  createClassificationRule,
  updateClassificationRule,
  deleteClassificationRule,
} from '../../../../services/accounting'
import type { ClassificationRulePayload } from '../../../../services/accounting'
import type { IClassificationRule } from '../../../../types/accounting'
import type { RuleForm } from './types'
import { formatDateTime, RULE_TYPE_OPTIONS, EMPTY_RULE, parseTagsInput, tagsToInput } from './helpers'
import { useI18n } from '../../../../context/I18nContext'
import { formatNumber } from '../../../../i18n/format'

interface RulesTabProps {
  sourceId: string
  onError: (msg: string) => void
}

export default function RulesTab({ sourceId, onError }: RulesTabProps) {
  const { t } = useI18n()
  const [rules, setRules] = useState<IClassificationRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [editingRule, setEditingRule] = useState<RuleForm | null>(null)
  const [ruleError, setRuleError] = useState('')
  const [ruleSaving, setRuleSaving] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    conditions: true,
    mapping: true,
  })

  const reloadRules = useCallback(async () => {
    setRulesLoading(true)
    try {
      const list = await listClassificationRules(sourceId)
      setRules(list || [])
    } catch (err) {
      onError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setRulesLoading(false)
    }
  }, [sourceId, onError, t])

  useEffect(() => {
    reloadRules()
  }, [reloadRules])

  function openNewRule() {
    setEditingRule({
      ...EMPTY_RULE,
      conditions: { ...EMPTY_RULE.conditions },
      mapping: { ...EMPTY_RULE.mapping },
    })
    setRuleError('')
  }

  function openEditRule(rule: IClassificationRule) {
    setEditingRule({
      _id: rule._id,
      name: rule.name || '',
      priority: rule.priority ?? 100,
      enabled: rule.enabled !== false,
      conditions: {
        type: rule.conditions?.type || '',
        categoryRegex: rule.conditions?.categoryRegex || '',
        descriptionRegex: rule.conditions?.descriptionRegex || '',
        amountMin: rule.conditions?.amountMin ?? '',
        amountMax: rule.conditions?.amountMax ?? '',
        currency: rule.conditions?.currency || '',
        tagsAll: tagsToInput(rule.conditions?.tagsAll),
        tagsAny: tagsToInput(rule.conditions?.tagsAny),
      },
      mapping: {
        journalCode: rule.mapping?.journalCode || '',
        debitAccount: rule.mapping?.debitAccount || '',
        creditAccount: rule.mapping?.creditAccount || '',
        vatRateValue: rule.mapping?.vatRateValue ?? '',
        useVatFromPayload: !!rule.mapping?.useVatFromPayload,
        labelTemplate: rule.mapping?.labelTemplate || '',
        autoValidate: !!rule.mapping?.autoValidate,
        assignToAuxiliary: !!rule.mapping?.assignToAuxiliary,
      },
    })
    setRuleError('')
  }

  async function handleSaveRule() {
    if (!editingRule) return
    if (!editingRule.name || !editingRule.name.trim()) {
      setRuleError(t('accVat.rules.nameRequired'))
      return
    }
    setRuleSaving(true)
    setRuleError('')
    try {
      const payload: ClassificationRulePayload = {
        name: editingRule.name.trim(),
        priority: Number(editingRule.priority) || 100,
        enabled: !!editingRule.enabled,
        conditions: {
          type: editingRule.conditions.type || undefined,
          categoryRegex: editingRule.conditions.categoryRegex || undefined,
          descriptionRegex: editingRule.conditions.descriptionRegex || undefined,
          amountMin: editingRule.conditions.amountMin !== '' ? Number(editingRule.conditions.amountMin) : undefined,
          amountMax: editingRule.conditions.amountMax !== '' ? Number(editingRule.conditions.amountMax) : undefined,
          currency: editingRule.conditions.currency || undefined,
          tagsAll: parseTagsInput(editingRule.conditions.tagsAll),
          tagsAny: parseTagsInput(editingRule.conditions.tagsAny),
        },
        mapping: {
          journalCode: editingRule.mapping.journalCode || undefined,
          debitAccount: editingRule.mapping.debitAccount || undefined,
          creditAccount: editingRule.mapping.creditAccount || undefined,
          vatRateValue: editingRule.mapping.vatRateValue !== '' ? Number(editingRule.mapping.vatRateValue) : undefined,
          useVatFromPayload: !!editingRule.mapping.useVatFromPayload,
          labelTemplate: editingRule.mapping.labelTemplate || undefined,
          autoValidate: !!editingRule.mapping.autoValidate,
          assignToAuxiliary: !!editingRule.mapping.assignToAuxiliary,
        },
      }
      if (editingRule._id) {
        await updateClassificationRule(sourceId, editingRule._id, payload)
      } else {
        await createClassificationRule(sourceId, payload)
      }
      setEditingRule(null)
      await reloadRules()
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : t('accVat.common.error'))
    } finally {
      setRuleSaving(false)
    }
  }

  async function handleToggleRule(rule: IClassificationRule) {
    try {
      await updateClassificationRule(sourceId, rule._id, { enabled: !rule.enabled })
      await reloadRules()
    } catch (err) {
      onError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  async function handleDeleteRule(rule: IClassificationRule) {
    if (!confirm(t('accVat.rules.confirmDelete', { name: rule.name }))) return
    try {
      await deleteClassificationRule(sourceId, rule._id)
      await reloadRules()
    } catch (err) {
      onError(err instanceof Error ? err.message : t('accVat.common.error'))
    }
  }

  const sortedRules = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  return (
    <section className="accounting-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
            {t('accVat.rules.heading')}
            <span
              style={{
                marginLeft: 10,
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                fontWeight: 400,
              }}
            >
              ({sortedRules.length})
            </span>
          </h2>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
            }}
          >
            {t('accVat.rules.help')}
          </p>
        </div>
        <button className="portal-button" onClick={openNewRule}>
          {t('accVat.rules.new')}
        </button>
      </div>

      {editingRule && (
        <div
          className="accounting-card"
          style={{
            background: 'color-mix(in srgb, var(--primary) 4%, transparent)',
            marginBottom: 16,
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
            {editingRule._id ? t('accVat.rules.editTitle') : t('accVat.rules.newTitle')}
          </h3>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accVat.rules.nameField')}</label>
              <input
                className="portal-input"
                placeholder={t('accVat.rules.namePlaceholder')}
                value={editingRule.name}
                onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.rules.priority')}</label>
              <input
                type="number"
                className="portal-input"
                value={editingRule.priority}
                onChange={(e) => setEditingRule({ ...editingRule, priority: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.88rem' }}>
                <input
                  type="checkbox"
                  checked={editingRule.enabled}
                  onChange={(e) => setEditingRule({ ...editingRule, enabled: e.target.checked })}
                  style={{ marginRight: 8 }}
                />
                {t('accVat.rules.active')}
              </label>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setExpandedSections((s) => ({ ...s, conditions: !s.conditions }))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'color-mix(in srgb, var(--primary) 85%, transparent)',
                fontSize: '0.85rem',
                textTransform: 'none',
                letterSpacing: 'normal',
                padding: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {expandedSections.conditions ? '▼' : '▶'} {t('accVat.rules.conditions')}
            </button>
            {expandedSections.conditions && (
              <div className="accounting-form" style={{ marginTop: 12 }}>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.type')}</label>
                  <select
                    className="portal-input"
                    value={editingRule.conditions.type}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: { ...editingRule.conditions, type: e.target.value },
                      })
                    }
                  >
                    {RULE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.category')}</label>
                  <input
                    className="portal-input"
                    placeholder="^(rental|sale)$"
                    value={editingRule.conditions.categoryRegex}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          categoryRegex: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.description')}</label>
                  <input
                    className="portal-input"
                    placeholder="commission|fees"
                    value={editingRule.conditions.descriptionRegex}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          descriptionRegex: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.amountMin')}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="portal-input"
                    value={editingRule.conditions.amountMin}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          amountMin: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.amountMax')}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="portal-input"
                    value={editingRule.conditions.amountMax}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          amountMax: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.currency')}</label>
                  <input
                    className="portal-input"
                    placeholder="EUR"
                    maxLength={3}
                    value={editingRule.conditions.currency}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          currency: e.target.value.toUpperCase(),
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.tagsAll')}</label>
                  <input
                    className="portal-input"
                    placeholder="foo, bar"
                    value={editingRule.conditions.tagsAll}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          tagsAll: e.target.value,
                        },
                      })
                    }
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t('accVat.rules.commaSeparated')}
                  </span>
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.tagsAny')}</label>
                  <input
                    className="portal-input"
                    placeholder="paid, completed"
                    value={editingRule.conditions.tagsAny}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        conditions: {
                          ...editingRule.conditions,
                          tagsAny: e.target.value,
                        },
                      })
                    }
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t('accVat.rules.commaSeparated')}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setExpandedSections((s) => ({ ...s, mapping: !s.mapping }))}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'color-mix(in srgb, var(--primary) 85%, transparent)',
                fontSize: '0.85rem',
                textTransform: 'none',
                letterSpacing: 'normal',
                padding: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {expandedSections.mapping ? '▼' : '▶'} {t('accVat.rules.mapping')}
            </button>
            {expandedSections.mapping && (
              <div className="accounting-form" style={{ marginTop: 12 }}>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.journalCode')}</label>
                  <input
                    className="portal-input"
                    placeholder="VE"
                    value={editingRule.mapping.journalCode}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        mapping: {
                          ...editingRule.mapping,
                          journalCode: e.target.value.toUpperCase(),
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.debitAccount')}</label>
                  <input
                    className="portal-input"
                    placeholder="411000"
                    value={editingRule.mapping.debitAccount}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        mapping: {
                          ...editingRule.mapping,
                          debitAccount: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.creditAccount')}</label>
                  <input
                    className="portal-input"
                    placeholder="706000"
                    value={editingRule.mapping.creditAccount}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        mapping: {
                          ...editingRule.mapping,
                          creditAccount: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field">
                  <label>{t('accVat.rules.forcedVat')}</label>
                  <input
                    type="number"
                    step="0.01"
                    className="portal-input"
                    placeholder="20"
                    value={editingRule.mapping.vatRateValue}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        mapping: {
                          ...editingRule.mapping,
                          vatRateValue: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="accounting-form-field full">
                  <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={editingRule.mapping.useVatFromPayload}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          mapping: {
                            ...editingRule.mapping,
                            useVatFromPayload: e.target.checked,
                          },
                        })
                      }
                      style={{ marginRight: 8 }}
                    />
                    {t('accVat.rules.useVatPayload')}
                  </label>
                </div>
                <div className="accounting-form-field full">
                  <label>{t('accVat.rules.labelTemplate')}</label>
                  <input
                    className="portal-input"
                    placeholder={t('accVat.rules.labelPlaceholder')}
                    value={editingRule.mapping.labelTemplate}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        mapping: {
                          ...editingRule.mapping,
                          labelTemplate: e.target.value,
                        },
                      })
                    }
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {t('accVat.rules.variables')} <span className="code">{'{description}'}</span>{' '}
                    <span className="code">{'{externalId}'}</span> <span className="code">{'{date}'}</span>
                  </span>
                </div>
                <div className="accounting-form-field">
                  <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={editingRule.mapping.autoValidate}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          mapping: {
                            ...editingRule.mapping,
                            autoValidate: e.target.checked,
                          },
                        })
                      }
                      style={{ marginRight: 8 }}
                    />
                    {t('accVat.rules.autoValidate')}
                  </label>
                </div>
                <div className="accounting-form-field">
                  <label style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '0.88rem' }}>
                    <input
                      type="checkbox"
                      checked={editingRule.mapping.assignToAuxiliary}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          mapping: {
                            ...editingRule.mapping,
                            assignToAuxiliary: e.target.checked,
                          },
                        })
                      }
                      style={{ marginRight: 8 }}
                    />
                    {t('accVat.rules.assignAux')}
                  </label>
                </div>
              </div>
            )}
          </div>

          {ruleError && (
            <div className="accounting-message error" style={{ marginTop: 14 }}>
              {ruleError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="portal-button" onClick={handleSaveRule} disabled={ruleSaving}>
              {ruleSaving
                ? t('accVat.settings.saving')
                : editingRule._id
                  ? t('accVat.rules.update')
                  : t('accVat.src.create')}
            </button>
            <button className="portal-button secondary" onClick={() => setEditingRule(null)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {rulesLoading ? (
        <p style={{ color: 'var(--text-secondary)' }}>{t('accVat.common.loading')}</p>
      ) : sortedRules.length === 0 ? (
        <div className="accounting-empty">
          {t('accVat.rules.empty')}
          <div className="hint">{t('accVat.rules.emptyHint')}</div>
        </div>
      ) : (
        <div className="accounting-table-scroll">
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('accVat.rules.colPriority')}</th>
                <th>{t('accVat.rules.colName')}</th>
                <th>{t('accVat.rules.type')}</th>
                <th>{t('accVat.rules.colMapping')}</th>
                <th className="amount">{t('accVat.rules.colMatches')}</th>
                <th>{t('accVat.rules.colLastMatch')}</th>
                <th>{t('accVat.rules.colState')}</th>
                <th>{t('accVat.src.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((r) => (
                <tr key={r._id} style={r.enabled ? undefined : { opacity: 0.55 }}>
                  <td className="code">{r.priority}</td>
                  <td>{r.name}</td>
                  <td className="code">{r.conditions?.type || '—'}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {r.mapping?.journalCode && <span className="code">{r.mapping.journalCode}</span>}{' '}
                    {r.mapping?.debitAccount && (
                      <>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('accVat.rules.debitShort')}</span>{' '}
                        <span className="code">{r.mapping.debitAccount}</span>{' '}
                      </>
                    )}
                    {r.mapping?.creditAccount && (
                      <>
                        <span style={{ color: 'var(--text-secondary)' }}>{t('accVat.rules.creditShort')}</span>{' '}
                        <span className="code">{r.mapping.creditAccount}</span>
                      </>
                    )}
                  </td>
                  <td className="amount">{formatNumber(Number(r.matchCount || 0))}</td>
                  <td style={{ fontSize: '0.82rem' }}>{formatDateTime(r.lastMatchedAt)}</td>
                  <td>
                    <span className={`accounting-badge ${r.enabled ? 'validated' : 'locked'}`}>
                      {r.enabled ? t('accVat.integ.statusActive') : t('accVat.integ.statusDisabled')}
                    </span>
                  </td>
                  <td>
                    <div className="accounting-row-actions">
                      <button type="button" onClick={() => openEditRule(r)}>
                        {t('accVat.rules.edit')}
                      </button>
                      <button type="button" onClick={() => handleToggleRule(r)}>
                        {r.enabled ? t('accVat.rules.disable') : t('accVat.rules.enable')}
                      </button>
                      <button
                        type="button"
                        disabled
                        title={t('accVat.rules.testSoon')}
                        style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      >
                        {t('accVat.rules.test')}
                      </button>
                      <button type="button" className="danger" onClick={() => handleDeleteRule(r)}>
                        {t('accVat.list.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
