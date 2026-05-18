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

interface RulesTabProps {
  sourceId: string
  onError: (msg: string) => void
}

export default function RulesTab({ sourceId, onError }: RulesTabProps) {
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
      onError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setRulesLoading(false)
    }
  }, [sourceId, onError])

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
      setRuleError('Le nom de la règle est obligatoire.')
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
          amountMin:
            editingRule.conditions.amountMin !== ''
              ? Number(editingRule.conditions.amountMin)
              : undefined,
          amountMax:
            editingRule.conditions.amountMax !== ''
              ? Number(editingRule.conditions.amountMax)
              : undefined,
          currency: editingRule.conditions.currency || undefined,
          tagsAll: parseTagsInput(editingRule.conditions.tagsAll),
          tagsAny: parseTagsInput(editingRule.conditions.tagsAny),
        },
        mapping: {
          journalCode: editingRule.mapping.journalCode || undefined,
          debitAccount: editingRule.mapping.debitAccount || undefined,
          creditAccount: editingRule.mapping.creditAccount || undefined,
          vatRateValue:
            editingRule.mapping.vatRateValue !== ''
              ? Number(editingRule.mapping.vatRateValue)
              : undefined,
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
      setRuleError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setRuleSaving(false)
    }
  }

  async function handleToggleRule(rule: IClassificationRule) {
    try {
      await updateClassificationRule(sourceId, rule._id, { enabled: !rule.enabled })
      await reloadRules()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  async function handleDeleteRule(rule: IClassificationRule) {
    if (!confirm(`Supprimer la règle « ${rule.name} » ?`)) return
    try {
      await deleteClassificationRule(sourceId, rule._id)
      await reloadRules()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur')
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
            Règles de classification
            <span
              style={{
                marginLeft: 10,
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.55)',
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
              color: 'rgba(255,255,255,0.55)',
            }}
          >
            Les règles sont évaluées par priorité décroissante. La première qui matche
            s'applique.
          </p>
        </div>
        <button className="portal-button" onClick={openNewRule}>
          ✚ Nouvelle règle
        </button>
      </div>

      {editingRule && (
        <div
          className="accounting-card"
          style={{
            background: 'rgba(14,165,233,0.04)',
            marginBottom: 16,
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
            {editingRule._id ? 'Modifier la règle' : 'Nouvelle règle'}
          </h3>

          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Nom *</label>
              <input
                className="portal-input"
                placeholder="Ex: Ventes Arrow standard"
                value={editingRule.name}
                onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Priorité</label>
              <input
                type="number"
                className="portal-input"
                value={editingRule.priority}
                onChange={(e) =>
                  setEditingRule({ ...editingRule, priority: e.target.value })
                }
              />
            </div>
            <div className="accounting-form-field">
              <label
                style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}
              >
                <input
                  type="checkbox"
                  checked={editingRule.enabled}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, enabled: e.target.checked })
                  }
                  style={{ marginRight: 8 }}
                />
                Règle active
              </label>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              onClick={() =>
                setExpandedSections((s) => ({ ...s, conditions: !s.conditions }))
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(34,211,238,0.85)',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {expandedSections.conditions ? '▼' : '▶'} Conditions
            </button>
            {expandedSections.conditions && (
              <div className="accounting-form" style={{ marginTop: 12 }}>
                <div className="accounting-form-field">
                  <label>Type</label>
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
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="accounting-form-field">
                  <label>Catégorie (regex)</label>
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
                  <label>Description (regex)</label>
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
                  <label>Montant min</label>
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
                  <label>Montant max</label>
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
                  <label>Devise</label>
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
                  <label>Tags requis (tous)</label>
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
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                    Séparés par des virgules
                  </span>
                </div>
                <div className="accounting-form-field">
                  <label>Tags requis (un seul suffit)</label>
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
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                    Séparés par des virgules
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 20 }}>
            <button
              type="button"
              onClick={() =>
                setExpandedSections((s) => ({ ...s, mapping: !s.mapping }))
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(34,211,238,0.85)',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: 0,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {expandedSections.mapping ? '▼' : '▶'} Mapping comptable
            </button>
            {expandedSections.mapping && (
              <div className="accounting-form" style={{ marginTop: 12 }}>
                <div className="accounting-form-field">
                  <label>Code journal</label>
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
                  <label>Compte débit</label>
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
                  <label>Compte crédit</label>
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
                  <label>Taux de TVA forcé (%)</label>
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
                  <label
                    style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}
                  >
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
                    Utiliser le taux de TVA du payload (sinon utilise le taux ci-dessus)
                  </label>
                </div>
                <div className="accounting-form-field full">
                  <label>Modèle de libellé</label>
                  <input
                    className="portal-input"
                    placeholder="Vente Arrow {description}"
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
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>
                    Variables disponibles : <span className="code">{'{description}'}</span>{' '}
                    <span className="code">{'{externalId}'}</span>{' '}
                    <span className="code">{'{date}'}</span>
                  </span>
                </div>
                <div className="accounting-form-field">
                  <label
                    style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}
                  >
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
                    Auto-valider l'écriture
                  </label>
                </div>
                <div className="accounting-form-field">
                  <label
                    style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.88rem' }}
                  >
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
                    Affecter au compte auxiliaire
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
                ? 'Enregistrement…'
                : editingRule._id
                ? '✓ Mettre à jour'
                : '✚ Créer'}
            </button>
            <button
              className="portal-button secondary"
              onClick={() => setEditingRule(null)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {rulesLoading ? (
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      ) : sortedRules.length === 0 ? (
        <div className="accounting-empty">
          Aucune règle de classification.
          <div className="hint">
            Sans règle, les écritures utilisent les mappings par défaut de la source.
          </div>
        </div>
      ) : (
        <table className="accounting-table">
          <thead>
            <tr>
              <th>Priorité</th>
              <th>Nom</th>
              <th>Type</th>
              <th>Mapping</th>
              <th className="amount">Matches</th>
              <th>Dernier match</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRules.map((r) => (
              <tr key={r._id} style={r.enabled ? undefined : { opacity: 0.55 }}>
                <td className="code">{r.priority}</td>
                <td>{r.name}</td>
                <td className="code">{r.conditions?.type || '—'}</td>
                <td style={{ fontSize: '0.82rem' }}>
                  {r.mapping?.journalCode && (
                    <span className="code">{r.mapping.journalCode}</span>
                  )}{' '}
                  {r.mapping?.debitAccount && (
                    <>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Db</span>{' '}
                      <span className="code">{r.mapping.debitAccount}</span>{' '}
                    </>
                  )}
                  {r.mapping?.creditAccount && (
                    <>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Cr</span>{' '}
                      <span className="code">{r.mapping.creditAccount}</span>
                    </>
                  )}
                </td>
                <td className="amount">
                  {Number(r.matchCount || 0).toLocaleString('fr-FR')}
                </td>
                <td style={{ fontSize: '0.82rem' }}>{formatDateTime(r.lastMatchedAt)}</td>
                <td>
                  <span className={`accounting-badge ${r.enabled ? 'validated' : 'locked'}`}>
                    {r.enabled ? 'Active' : 'Désactivée'}
                  </span>
                </td>
                <td>
                  <div className="accounting-row-actions">
                    <button type="button" onClick={() => openEditRule(r)}>
                      Éditer
                    </button>
                    <button type="button" onClick={() => handleToggleRule(r)}>
                      {r.enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Bientôt disponible"
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                    >
                      Tester
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => handleDeleteRule(r)}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
