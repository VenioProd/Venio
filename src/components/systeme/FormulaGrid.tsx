import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { FormulaThumb, type FormulaKind } from '../graphics'
import type { MessageKey } from '../../i18n'
import './systeme.css'

const formulas: { kind: FormulaKind; color: string }[] = [
  { kind: 'vitrine', color: '#a78bfa' },
  { kind: 'essentiel', color: '#38bdf8' },
  { kind: 'business', color: '#5eead4' },
  { kind: 'boutique', color: '#fbbf24' },
  { kind: 'mesure', color: '#34d399' },
]

export default function FormulaGrid() {
  const { t } = useI18n()
  return (
    <div className="sy-formulas">
      <div className="sy-formulas__head sy-rv">
        <h3>{t('pubHome.sys.formsTitle')}</h3>
        <Link to="/services/sites">
          {t('pubHome.sys.formsLink')}{' '}
          <span className="sy-arr" aria-hidden="true">
            →
          </span>
        </Link>
      </div>
      <div className="sy-formulas__grid">
        {formulas.map(({ kind, color }, index) => {
          const n = index + 1
          return (
            <Link
              key={kind}
              className={`sy-formula sy-glass sy-rv${kind === 'business' ? ' sy-formula--featured' : ''}`}
              style={{ '--c': color, '--d': index, '--vn-accent': color } as CSSProperties}
              to={`/contact?besoin=${kind === 'mesure' ? 'outil' : 'site'}&formule=${kind}`}
            >
              <div className="sy-formula__art">
                <FormulaThumb kind={kind} active={kind === 'business'} />
                <div className="sy-formula__includes">
                  <ul>
                    {[1, 2, 3].map((item) => (
                      <li key={item}>{t(`pubHome.home.tier${n}Incl${item}` as MessageKey)}</li>
                    ))}
                  </ul>
                  <span>
                    {t('pubHome.sys.formulaCta')} <span aria-hidden="true">↗</span>
                  </span>
                </div>
              </div>
              <span className="sy-formula__name">
                <b>{t(`pubHome.home.tier${n}Name` as MessageKey)}</b>
                <small aria-hidden="true">0{n}</small>
              </span>
              <span className="sy-formula__tag">
                {t(n === 1 ? 'pubHome.home.tier1Tag' : (`pubHome.sys.formula${n}Tag` as MessageKey))}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
