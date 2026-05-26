import type { FormEvent } from 'react'
import type { IFiscalYear } from '../../../../types/accounting'

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

export default function FiscalYearsSection({ fiscalYears, newYear, setNewYear, canLock, canManage, onClose, onCreate }: Props) {
  return (
    <section className="accounting-card">
      <h2>Exercices comptables</h2>
      {fiscalYears.length === 0 ? (
        <div className="accounting-empty">
          Aucun exercice défini.
          <div className="hint">Un exercice par année calendaire sera créé automatiquement à la première écriture.</div>
        </div>
      ) : (
        <table className="accounting-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Libellé</th>
              <th>Période</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fiscalYears.map((fy) => (
              <tr key={fy._id}>
                <td className="code">{fy.code}</td>
                <td>{fy.label}</td>
                <td>
                  {new Date(fy.startDate).toLocaleDateString('fr-FR')} →{' '}
                  {new Date(fy.endDate).toLocaleDateString('fr-FR')}
                </td>
                <td>
                  <span className={`accounting-badge ${fy.status === 'OUVERT' ? 'draft' : 'locked'}`}>{fy.status}</span>
                </td>
                <td>
                  {fy.status === 'OUVERT' && canLock && (
                    <div className="accounting-row-actions">
                      <button className="danger" onClick={() => onClose(fy._id)}>
                        Clôturer
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
          <h2 style={{ fontSize: '1rem' }}>Créer un exercice manuellement</h2>
          <div className="accounting-form">
            <div className="accounting-form-field">
              <label>Code</label>
              <input
                className="portal-input"
                value={newYear.code}
                onChange={(e) => setNewYear({ ...newYear, code: e.target.value })}
                placeholder="FY-2026"
              />
            </div>
            <div className="accounting-form-field">
              <label>Libellé</label>
              <input
                className="portal-input"
                value={newYear.label}
                onChange={(e) => setNewYear({ ...newYear, label: e.target.value })}
                placeholder="Exercice 2026"
              />
            </div>
            <div className="accounting-form-field">
              <label>Début</label>
              <input
                type="date"
                className="portal-input"
                value={newYear.startDate}
                onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })}
              />
            </div>
            <div className="accounting-form-field">
              <label>Fin</label>
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
              Créer
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
