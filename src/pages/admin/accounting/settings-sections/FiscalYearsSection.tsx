import type { FormEvent } from 'react'
import type { IFiscalYear } from '../../../../types/accounting'
import { useI18n } from '../../../../context/I18nContext'
import { formatDate } from '../../../../i18n/format'
import type { MessageKey } from '../../../../i18n'

const STATUS_KEYS: Record<string, MessageKey> = {
  OUVERT: 'accVat.fiscal.statusOpen',
  CLOTURE: 'accVat.fiscal.statusClosed',
  CLOSED: 'accVat.fiscal.statusClosedAlt',
}

interface NewYearForm {
  code: string
  label: string
  startDate: string
  endDate: string
}

interface Props {
  fiscalYears: IFiscalYear[]
  newYear: NewYearForm
  setNewYear: (v: NewYearForm) => void
  canLock: boolean
  canManage: boolean
  onClose: (id: string) => void
  onCreate: (e: FormEvent<HTMLFormElement>) => void
}

export default function FiscalYearsSection({
  fiscalYears,
  newYear,
  setNewYear,
  canLock,
  canManage,
  onClose,
  onCreate,
}: Props) {
  const { t } = useI18n()
  return (
    <section className="accounting-card">
      <h2>{t('accVat.fiscal.heading')}</h2>
      {fiscalYears.length === 0 ? (
        <div className="accounting-empty">
          {t('accVat.fiscal.empty')}
          <div className="hint">{t('accVat.fiscal.emptyHint')}</div>
        </div>
      ) : (
        <table className="accounting-table">
          <thead>
            <tr>
              <th>{t('accVat.fiscal.colCode')}</th>
              <th>{t('accVat.fiscal.colLabel')}</th>
              <th>{t('accVat.fiscal.colPeriod')}</th>
              <th>{t('accVat.fiscal.colStatus')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fiscalYears.map((fy) => (
              <tr key={fy._id}>
                <td className="code">{fy.code}</td>
                <td>{fy.label}</td>
                <td>
                  {formatDate(fy.startDate)} → {formatDate(fy.endDate)}
                </td>
                <td>
                  <span className={`accounting-badge ${fy.status === 'OUVERT' ? 'draft' : 'locked'}`}>
                    {STATUS_KEYS[fy.status] ? t(STATUS_KEYS[fy.status]) : fy.status}
                  </span>
                </td>
                <td>
                  {fy.status === 'OUVERT' && canLock && (
                    <div className="accounting-row-actions">
                      <button className="danger" onClick={() => onClose(fy._id)}>
                        {t('accVat.fiscal.close')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && (
        <form onSubmit={onCreate} style={{ marginTop: 20 }}>
          <h2 style={{ fontSize: '1rem' }}>{t('accVat.fiscal.createHeading')}</h2>
          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>{t('accVat.fiscal.colCode')}</label>
              <input
                className="portal-input"
                value={newYear.code}
                onChange={(e) => setNewYear({ ...newYear, code: e.target.value })}
                placeholder="FY-2026"
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.fiscal.colLabel')}</label>
              <input
                className="portal-input"
                value={newYear.label}
                onChange={(e) => setNewYear({ ...newYear, label: e.target.value })}
                placeholder={t('accVat.fiscal.labelPlaceholder')}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.fiscal.start')}</label>
              <input
                type="date"
                className="portal-input"
                value={newYear.startDate}
                onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>{t('accVat.fiscal.end')}</label>
              <input
                type="date"
                className="portal-input"
                value={newYear.endDate}
                onChange={(e) => setNewYear({ ...newYear, endDate: e.target.value })}
              />
            </div>
          </div>
          <div className="accounting-toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="submit" className="portal-button">
              {t('accVat.fiscal.create')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
