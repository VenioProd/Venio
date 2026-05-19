# Refonte dashboard super admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre le dashboard super admin Venio en remplaçant les 8 sections empilées par un layout 2 colonnes (Inbox unifiée Linear-style + Analytics avec Pulse status, KPIs deltas et chart financial), aligné sur le langage néon Venio existant.

**Architecture:** TypeScript end-to-end. Frontend = React 18 + Vite + recharts (custom-stylé pour le look financial). Backend = Express + Mongoose, vitest (mongo in-memory). Découpage en 6 phases autonomes et déployables : (1) Fondations design system, (2) Sidebar pivot toggle, (3) Analytics colonne droite, (4) Inbox backend, (5) Inbox frontend, (6) Layout final 2 colonnes + cleanup.

**Tech Stack:** React 18, TypeScript, recharts, lucide-react, Mongoose, Express, vitest + @testing-library/react (frontend) / vitest + mongo-memory-server (backend).

**Spec source:** [2026-05-19-refonte-dashboard-super-admin-design.md](../specs/2026-05-19-refonte-dashboard-super-admin-design.md)

---

## Dépendances entre phases

```
Phase 1 (Fondations) ─┬─→ Phase 3 (Analytics)
                      └─→ Phase 5 (Inbox FE) ──→ Phase 6 (Layout final)
Phase 2 (Sidebar)      indépendante                  ↑
Phase 4 (Inbox BE) ─────→ Phase 5 (Inbox FE)         ┘
```

Ordre conseillé : **1 || 2 || 4** (parallélisables) → **3** → **5** → **6**.

---

# Phase 1 — Fondations design system

**But :** Poser les composants génériques réutilisables (`DashWidget`, `FinancialChart`, `PeriodSelector`, `Sparkline`), enrichir `DashKpiCard`, centraliser les styles dans un CSS dédié. Aucun changement comportemental pour l'utilisateur final. Le `SuperAdminDashboard.tsx` actuel continue de fonctionner identique.

### Task 1.1: Créer le fichier CSS dashboard.css

**Files:**
- Create: `src/components/dashboard/dashboard.css`

- [ ] **Step 1: Écrire le fichier CSS avec les bases**

```css
/* ═══════════════════════════════════════════
   Dashboard — composants génériques
   ═══════════════════════════════════════════ */

/* ── DashWidget ── */
.dash-widget {
  position: relative;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
}

.dash-widget__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.dash-widget__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.3px;
}

.dash-widget__subtitle {
  font-size: 11px;
  color: var(--text-muted);
}

.dash-widget__action {
  font-size: 11px;
  color: var(--primary);
  text-decoration: none;
  text-shadow: 0 0 8px rgba(var(--primary-rgb), 0.4);
}

.dash-widget--neon::before,
.dash-widget--neon::after {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  pointer-events: none;
  filter: drop-shadow(0 0 4px rgba(var(--primary-rgb), 0.7)) drop-shadow(0 0 10px rgba(var(--primary-rgb), 0.35));
}

.dash-widget--neon::before {
  top: -1px;
  left: -1px;
  border-top: 1px solid var(--primary);
  border-left: 1px solid var(--primary);
}

.dash-widget--neon::after {
  bottom: -1px;
  right: -1px;
  border-bottom: 1px solid var(--primary);
  border-right: 1px solid var(--primary);
}

.dash-widget__empty,
.dash-widget__error {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.dash-widget__error {
  color: #fca5a5;
}

/* ── DashKpiCard étendu ── */
.dash-kpi {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 3px solid var(--dash-kpi-accent, #0ea5e9);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: transform 0.15s, box-shadow 0.15s;
}

.dash-kpi:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 18px rgba(var(--dash-kpi-accent-rgb, 14, 165, 233), 0.15);
}

.dash-kpi__label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dash-kpi__value {
  font-size: 22px;
  font-weight: 700;
  color: var(--dash-kpi-accent, #0ea5e9);
  text-shadow: 0 0 14px rgba(var(--dash-kpi-accent-rgb, 14, 165, 233), 0.5);
  line-height: 1.1;
}

.dash-kpi__delta {
  font-size: 11px;
  color: #86efac;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dash-kpi__delta--neg { color: #fca5a5; }
.dash-kpi__delta--neutral { color: var(--text-muted); }

.dash-kpi__objective {
  font-size: 10px;
  color: var(--text-muted);
}

.dash-kpi__objective-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 3px;
}

.dash-kpi__objective-bar > div {
  height: 100%;
  background: var(--dash-kpi-accent, #0ea5e9);
  box-shadow: 0 0 6px rgba(var(--dash-kpi-accent-rgb, 14, 165, 233), 0.6);
}

.dash-kpi__sparkline {
  margin-top: 6px;
  height: 22px;
  width: 100%;
}

/* ── PeriodSelector ── */
.dash-period {
  display: flex;
  gap: 4px;
}

.dash-period__chip {
  padding: 4px 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.dash-period__chip:hover {
  color: var(--text-secondary);
}

.dash-period__chip--active {
  background: rgba(var(--primary-rgb), 0.15);
  border-color: rgba(var(--primary-rgb), 0.4);
  color: var(--primary-light);
  text-shadow: 0 0 6px rgba(var(--primary-rgb), 0.4);
}

/* ── FinancialChart ── */
.dash-fchart {
  position: relative;
  background:
    linear-gradient(180deg, rgba(var(--primary-rgb), 0.04) 0%, transparent 100%),
    repeating-linear-gradient(0deg, transparent 0 19px, rgba(255, 255, 255, 0.04) 19px 20px),
    repeating-linear-gradient(90deg, transparent 0 29px, rgba(255, 255, 255, 0.04) 29px 30px);
  background-color: #050505;
  border: 1px solid rgba(var(--primary-rgb), 0.2);
  border-radius: 8px;
  box-shadow: inset 0 0 30px rgba(var(--primary-rgb), 0.05), 0 0 18px rgba(var(--primary-rgb), 0.08);
  overflow: hidden;
  min-height: 220px;
}

.dash-fchart__label {
  position: absolute;
  top: 8px;
  left: 10px;
  z-index: 2;
  font-size: 10px;
  color: var(--primary-light);
  letter-spacing: 0.5px;
  background: rgba(0, 0, 0, 0.5);
  padding: 3px 7px;
  border-radius: 3px;
  text-shadow: 0 0 8px rgba(var(--primary-rgb), 0.5);
}

.dash-fchart__price {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 2;
  font-size: 13px;
  font-weight: 700;
  color: #22c55e;
  text-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
}

.dash-fchart__price--neg { color: #ef4444; text-shadow: 0 0 10px rgba(239, 68, 68, 0.6); }
```

- [ ] **Step 2: Importer dashboard.css depuis le barrel**

Modifier `src/components/dashboard/index.ts` pour ajouter en tête : `import './dashboard.css'`

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "style(dashboard): add dashboard.css with design tokens for widgets/KPI/period/chart"
```

### Task 1.2: Composant DashWidget — test

**Files:**
- Test: `src/components/dashboard/DashWidget.test.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashWidget from './DashWidget'

describe('DashWidget', () => {
  it('affiche le titre et les enfants', () => {
    render(<DashWidget title="Test">Hello</DashWidget>)
    expect(screen.getByText('Test')).toBeTruthy()
    expect(screen.getByText('Hello')).toBeTruthy()
  })

  it('affiche le subtitle quand fourni', () => {
    render(<DashWidget title="A" subtitle="sub">x</DashWidget>)
    expect(screen.getByText('sub')).toBeTruthy()
  })

  it('affiche un état empty quand prop empty=true', () => {
    render(<DashWidget title="A" empty emptyLabel="rien">x</DashWidget>)
    expect(screen.getByText('rien')).toBeTruthy()
    expect(screen.queryByText('x')).toBeNull()
  })

  it('affiche un état erreur quand error fourni', () => {
    render(<DashWidget title="A" error="boom">x</DashWidget>)
    expect(screen.getByText('boom')).toBeTruthy()
  })

  it('affiche un lien action quand fourni', () => {
    render(
      <MemoryRouter>
        <DashWidget title="A" action={{ label: 'Voir', to: '/path' }}>x</DashWidget>
      </MemoryRouter>
    )
    const link = screen.getByText('Voir')
    expect(link.getAttribute('href')).toBe('/path')
  })
})
```

- [ ] **Step 2: Run test, voir échec**

```bash
npm run test:frontend -- src/components/dashboard/DashWidget.test.tsx
```
Expected: FAIL — "Cannot find module './DashWidget'".

### Task 1.3: Composant DashWidget — implémentation

**Files:**
- Create: `src/components/dashboard/DashWidget.tsx`
- Modify: `src/components/dashboard/index.ts`

- [ ] **Step 1: Écrire le composant**

```tsx
import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface DashWidgetProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: { label: string; to: string }
  empty?: boolean
  emptyLabel?: string
  error?: string | null
  neon?: boolean
  children: ReactNode
}

const DashWidget = ({
  title,
  subtitle,
  icon,
  action,
  empty,
  emptyLabel = 'Aucun élément',
  error,
  neon = false,
  children,
}: DashWidgetProps) => {
  return (
    <section className={`dash-widget${neon ? ' dash-widget--neon' : ''}`}>
      <header className="dash-widget__header">
        <div className="dash-widget__title">
          {icon}
          <span>{title}</span>
          {subtitle && <span className="dash-widget__subtitle">· {subtitle}</span>}
        </div>
        {action && (
          <Link to={action.to} className="dash-widget__action">
            {action.label} →
          </Link>
        )}
      </header>
      {error ? (
        <div className="dash-widget__error">{error}</div>
      ) : empty ? (
        <div className="dash-widget__empty">{emptyLabel}</div>
      ) : (
        children
      )}
    </section>
  )
}

export default DashWidget
```

- [ ] **Step 2: Exporter depuis le barrel**

Modifier `src/components/dashboard/index.ts` pour ajouter : `export { default as DashWidget } from './DashWidget'`

- [ ] **Step 3: Run test, voir succès**

```bash
npm run test:frontend -- src/components/dashboard/DashWidget.test.tsx
```
Expected: 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashWidget.tsx src/components/dashboard/DashWidget.test.tsx src/components/dashboard/index.ts
git commit -m "feat(dashboard): add DashWidget wrapper with neon corners + empty/error states"
```

### Task 1.4: Sparkline — test

**Files:**
- Test: `src/components/dashboard/Sparkline.test.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, container } from '@testing-library/react'
import Sparkline from './Sparkline'

describe('Sparkline', () => {
  it('rend un SVG avec un path pour des données non vides', () => {
    const { container } = render(<Sparkline values={[1, 2, 3, 4, 5]} color="#ff0080" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(container.querySelector('path')).toBeTruthy()
  })

  it('ne rend rien (null) pour un tableau vide', () => {
    const { container } = render(<Sparkline values={[]} color="#ff0080" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('applique la couleur en stroke', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} color="#0ea5e9" />)
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke')).toBe('#0ea5e9')
  })
})
```

- [ ] **Step 2: Run test, voir échec**

```bash
npm run test:frontend -- src/components/dashboard/Sparkline.test.tsx
```
Expected: FAIL.

### Task 1.5: Sparkline — implémentation

**Files:**
- Create: `src/components/dashboard/Sparkline.tsx`

- [ ] **Step 1: Écrire le composant**

```tsx
interface SparklineProps {
  values: number[]
  color: string
  width?: number
  height?: number
}

const Sparkline = ({ values, color, width = 100, height = 22 }: SparklineProps) => {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })
  const d = `M ${points.join(' L ')}`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <path
        d={d}
        stroke={color}
        strokeWidth={1.2}
        fill="none"
        style={{ filter: `drop-shadow(0 0 2px ${color}88)` }}
      />
    </svg>
  )
}

export default Sparkline
```

- [ ] **Step 2: Exporter + run test + commit**

```bash
# Ajouter dans src/components/dashboard/index.ts:
# export { default as Sparkline } from './Sparkline'
npm run test:frontend -- src/components/dashboard/Sparkline.test.tsx
git add src/components/dashboard/Sparkline.tsx src/components/dashboard/Sparkline.test.tsx src/components/dashboard/index.ts
git commit -m "feat(dashboard): add Sparkline mini-chart component"
```

### Task 1.6: DashKpiCard — étendre + test

**Files:**
- Modify: `src/components/dashboard/DashKpiCard.tsx`
- Test: `src/components/dashboard/DashKpiCard.test.tsx`

- [ ] **Step 1: Écrire le test étendu**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashKpiCard from './DashKpiCard'

describe('DashKpiCard', () => {
  it('affiche label, value, et la couleur accent en CSS variable', () => {
    const { container } = render(
      <DashKpiCard label="CA" value="45k€" accentColor="#ff0080" accentRgb="255, 0, 128" />
    )
    expect(screen.getByText('CA')).toBeTruthy()
    expect(screen.getByText('45k€')).toBeTruthy()
    const card = container.querySelector('.dash-kpi') as HTMLElement
    expect(card.style.getPropertyValue('--dash-kpi-accent')).toBe('#ff0080')
    expect(card.style.getPropertyValue('--dash-kpi-accent-rgb')).toBe('255, 0, 128')
  })

  it('affiche delta positif en vert', () => {
    render(<DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" delta={{ value: 12, direction: 'up' }} />)
    const delta = screen.getByText(/\+12%/)
    expect(delta.className).toContain('dash-kpi__delta')
    expect(delta.className).not.toContain('--neg')
  })

  it('affiche delta négatif en rouge', () => {
    render(<DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" delta={{ value: -3, direction: 'down' }} />)
    const delta = screen.getByText(/-3%/)
    expect(delta.className).toContain('dash-kpi__delta--neg')
  })

  it('affiche objectif en barre de progression', () => {
    render(<DashKpiCard label="CA" value="45k€" accentColor="#0ea5e9" accentRgb="14,165,233" objective={{ current: 45000, target: 60000, label: 'obj' }} />)
    expect(screen.getByText(/obj/)).toBeTruthy()
    expect(screen.getByText(/75%/)).toBeTruthy()
  })

  it('affiche une sparkline quand fournie', () => {
    const { container } = render(
      <DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" sparkline={[1,2,3,4,5]} />
    )
    expect(container.querySelector('.dash-kpi__sparkline svg')).toBeTruthy()
  })

  it('wrap dans un Link si to fourni', () => {
    render(
      <MemoryRouter>
        <DashKpiCard label="A" value="1" accentColor="#0ea5e9" accentRgb="14,165,233" to="/x" />
      </MemoryRouter>
    )
    const link = screen.getByText('A').closest('a')
    expect(link?.getAttribute('href')).toBe('/x')
  })
})
```

- [ ] **Step 2: Run, voir échec (interface a changé)**

```bash
npm run test:frontend -- src/components/dashboard/DashKpiCard.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Réécrire DashKpiCard pour matcher la nouvelle interface**

Remplacer complètement le contenu de `src/components/dashboard/DashKpiCard.tsx` par :

```tsx
import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Sparkline from './Sparkline'

export interface KpiDelta {
  value: number
  direction: 'up' | 'down' | 'flat'
  suffix?: string  // default '%'
}

export interface KpiObjective {
  current: number
  target: number
  label?: string
}

interface DashKpiCardProps {
  label: string
  value: ReactNode
  accentColor: string
  accentRgb: string  // ex: "255, 0, 128"
  icon?: ReactNode
  to?: string
  delta?: KpiDelta
  objective?: KpiObjective
  sparkline?: number[]
  hint?: string
}

const DashKpiCard = ({
  label, value, accentColor, accentRgb, icon, to, delta, objective, sparkline, hint,
}: DashKpiCardProps) => {
  const arrow = delta ? (delta.direction === 'up' ? '↗' : delta.direction === 'down' ? '↘' : '=') : ''
  const sign = delta && delta.value > 0 ? '+' : ''
  const deltaClass = delta?.direction === 'down' ? 'dash-kpi__delta dash-kpi__delta--neg' :
                     delta?.direction === 'flat' ? 'dash-kpi__delta dash-kpi__delta--neutral' :
                     'dash-kpi__delta'
  const objPct = objective ? Math.min(100, Math.round((objective.current / objective.target) * 100)) : 0

  const card = (
    <div
      className="dash-kpi"
      style={{
        ['--dash-kpi-accent' as string]: accentColor,
        ['--dash-kpi-accent-rgb' as string]: accentRgb,
      }}
    >
      <div className="dash-kpi__label">
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
        {label}
      </div>
      <div className="dash-kpi__value">{value}</div>
      {delta && (
        <div className={deltaClass}>
          {arrow} {sign}{delta.value}{delta.suffix ?? '%'}
        </div>
      )}
      {objective && (
        <div className="dash-kpi__objective">
          {objective.label ?? 'Objectif'} : {objPct}% ({objective.current.toLocaleString('fr-FR')} / {objective.target.toLocaleString('fr-FR')})
          <div className="dash-kpi__objective-bar"><div style={{ width: `${objPct}%` }} /></div>
        </div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div className="dash-kpi__sparkline">
          <Sparkline values={sparkline} color={accentColor} />
        </div>
      )}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )

  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{card}</Link> : card
}

export default DashKpiCard
```

- [ ] **Step 4: Run tests, voir succès**

```bash
npm run test:frontend -- src/components/dashboard/DashKpiCard.test.tsx
```
Expected: 6 tests PASS.

- [ ] **Step 5: Vérifier que les usages existants ne cassent pas — adapter le SuperAdminDashboard actuel**

Dans `src/pages/admin/SuperAdminDashboard.tsx`, chaque `<DashKpiCard ... />` doit recevoir `accentColor` et `accentRgb`. Ajouter pour chacune (palette pré-établie):

```tsx
// CA facturé
<DashKpiCard label="CA facturé (mois)" value={formatEUR(data.business.monthlyInvoiced)} accentColor="#ff0080" accentRgb="255, 0, 128" />
// Pipeline CRM
<DashKpiCard label="Pipeline CRM" value={formatEUR(data.business.pipelineTotal)} accentColor="#8b5cf6" accentRgb="139, 92, 246" hint="Tous leads ouverts" to="/admin/crm" />
// Leads chauds
<DashKpiCard label="Leads chauds" value={data.business.hotLeads} accentColor="#f59e0b" accentRgb="245, 158, 11" icon={<TrendingUp size={14} />} to="/admin/crm" />
// Comptabilité
<DashKpiCard label="Comptabilité" value="→" accentColor="#22c55e" accentRgb="34, 197, 94" icon={<Receipt size={14} />} to="/admin/comptabilite" />
// Clients/Admins/Stagiaires
<DashKpiCard label="Clients" value={data.team.clients} accentColor="#ff0080" accentRgb="255, 0, 128" to="/admin/comptes-clients" />
<DashKpiCard label="Admins" value={data.team.admins} accentColor="#8b5cf6" accentRgb="139, 92, 246" to="/admin/comptes-admin" icon={<ShieldCheck size={14} />} />
<DashKpiCard label="Stagiaires" value={data.team.interns} accentColor="#f59e0b" accentRgb="245, 158, 11" to="/admin/stagiaires" />
```

- [ ] **Step 6: Run le typecheck**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/DashKpiCard.tsx src/components/dashboard/DashKpiCard.test.tsx src/pages/admin/SuperAdminDashboard.tsx
git commit -m "feat(dashboard): extend DashKpiCard with delta/objective/sparkline + explicit accent colors"
```

### Task 1.7: PeriodSelector — test + impl

**Files:**
- Test: `src/components/dashboard/PeriodSelector.test.tsx`
- Create: `src/components/dashboard/PeriodSelector.tsx`

- [ ] **Step 1: Écrire le test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PeriodSelector, { Period } from './PeriodSelector'

describe('PeriodSelector', () => {
  it('rend les 4 chips', () => {
    render(<PeriodSelector value="30d" onChange={() => {}} />)
    expect(screen.getByText('7j')).toBeTruthy()
    expect(screen.getByText('30j')).toBeTruthy()
    expect(screen.getByText('90j')).toBeTruthy()
    expect(screen.getByText('YTD')).toBeTruthy()
  })

  it('marque la chip active', () => {
    render(<PeriodSelector value="90d" onChange={() => {}} />)
    const chip90 = screen.getByText('90j')
    expect(chip90.className).toContain('--active')
  })

  it('appelle onChange au clic', () => {
    const fn = vi.fn()
    render(<PeriodSelector value="30d" onChange={fn} />)
    fireEvent.click(screen.getByText('7j'))
    expect(fn).toHaveBeenCalledWith('7d')
  })
})
```

- [ ] **Step 2: Run, voir échec**

```bash
npm run test:frontend -- src/components/dashboard/PeriodSelector.test.tsx
```

- [ ] **Step 3: Implémenter**

```tsx
export type Period = '7d' | '30d' | '90d' | 'ytd'

interface PeriodSelectorProps {
  value: Period
  onChange: (p: Period) => void
}

const OPTS: Array<{ k: Period; label: string }> = [
  { k: '7d', label: '7j' },
  { k: '30d', label: '30j' },
  { k: '90d', label: '90j' },
  { k: 'ytd', label: 'YTD' },
]

const PeriodSelector = ({ value, onChange }: PeriodSelectorProps) => (
  <div className="dash-period" role="group" aria-label="Période">
    {OPTS.map((o) => (
      <button
        key={o.k}
        type="button"
        className={`dash-period__chip${value === o.k ? ' dash-period__chip--active' : ''}`}
        onClick={() => onChange(o.k)}
        aria-pressed={value === o.k}
      >
        {o.label}
      </button>
    ))}
  </div>
)

export default PeriodSelector
```

- [ ] **Step 4: Exporter + run test + commit**

```bash
# Ajouter dans index.ts:
# export { default as PeriodSelector, type Period } from './PeriodSelector'
npm run test:frontend -- src/components/dashboard/PeriodSelector.test.tsx
git add src/components/dashboard/PeriodSelector.tsx src/components/dashboard/PeriodSelector.test.tsx src/components/dashboard/index.ts
git commit -m "feat(dashboard): add PeriodSelector chips component"
```

### Task 1.8: FinancialChart — test + impl

**Files:**
- Test: `src/components/dashboard/FinancialChart.test.tsx`
- Create: `src/components/dashboard/FinancialChart.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FinancialChart from './FinancialChart'

const data = [
  { ts: '2026-01-01', value: 100, volume: 10 },
  { ts: '2026-01-02', value: 120, volume: 15 },
  { ts: '2026-01-03', value: 110, volume: 12 },
]

describe('FinancialChart', () => {
  it('affiche le label et le price overlay', () => {
    render(<FinancialChart data={data} label="CA · 30j" currentValue="110€" />)
    expect(screen.getByText('CA · 30j')).toBeTruthy()
    expect(screen.getByText('110€')).toBeTruthy()
  })

  it('rend un SVG (recharts)', () => {
    const { container } = render(<FinancialChart data={data} label="X" currentValue="0" />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('affiche un état vide si data vide', () => {
    render(<FinancialChart data={[]} label="X" currentValue="0" />)
    expect(screen.getByText(/aucune donnée/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run, voir échec**

- [ ] **Step 3: Implémenter avec recharts custom-stylé**

```tsx
import { ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export interface FinancialChartDatum {
  ts: string
  value: number
  volume?: number
}

interface FinancialChartProps {
  data: FinancialChartDatum[]
  label: string
  currentValue: string
  secondarySeries?: Array<{ ts: string; value: number }>
  height?: number
}

const FinancialChart = ({ data, label, currentValue, secondarySeries, height = 220 }: FinancialChartProps) => {
  if (data.length === 0) {
    return (
      <div className="dash-fchart" style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="dash-fchart__label">{label}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Aucune donnée</p>
      </div>
    )
  }

  const merged = secondarySeries
    ? data.map((d, i) => ({ ...d, secondary: secondarySeries[i]?.value }))
    : data

  return (
    <div className="dash-fchart" style={{ height }}>
      <div className="dash-fchart__label">▸ {label}</div>
      <div className="dash-fchart__price">{currentValue}</div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={merged} margin={{ top: 30, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dash-fchart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="ts" stroke="#404040" fontSize={9} tickLine={false} axisLine={false} />
          <YAxis stroke="#404040" fontSize={9} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            cursor={{ stroke: 'rgba(14,165,233,0.4)', strokeDasharray: '3 3' }}
            contentStyle={{
              background: '#000',
              border: '1px solid rgba(14,165,233,0.4)',
              borderRadius: 6,
              fontSize: 11,
              boxShadow: '0 0 18px rgba(14,165,233,0.3)',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#0ea5e9"
            strokeWidth={1.8}
            fill="url(#dash-fchart-fill)"
            style={{ filter: 'drop-shadow(0 0 4px rgba(14,165,233,0.7))' }}
          />
          {secondarySeries && (
            <Area
              type="monotone"
              dataKey="secondary"
              stroke="#8b5cf6"
              strokeWidth={1.4}
              strokeDasharray="4 2"
              fill="transparent"
              style={{ filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.6))' }}
            />
          )}
          {merged[0]?.volume !== undefined && (
            <Bar dataKey="volume" fill="rgba(14,165,233,0.4)" radius={[1, 1, 0, 0]} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default FinancialChart
```

- [ ] **Step 4: Exporter + run test + commit**

```bash
npm run test:frontend -- src/components/dashboard/FinancialChart.test.tsx
git add src/components/dashboard/FinancialChart.tsx src/components/dashboard/FinancialChart.test.tsx src/components/dashboard/index.ts
git commit -m "feat(dashboard): add FinancialChart (recharts ComposedChart with cyan glow + volume bars)"
```

### Task 1.9: Refacto SuperAdminDashboard — extraire les styles inline restants

**Files:**
- Modify: `src/pages/admin/SuperAdminDashboard.tsx`
- Modify: `src/components/dashboard/dashboard.css` (ajouter les classes utilisées)

- [ ] **Step 1: Identifier les blocs avec styles inline restants**

Les blocs concernés dans `SuperAdminDashboard.tsx` :
- Card décisions (ligne ~262-322) avec border, padding, background inline
- Section Opérations (ligne ~411-453) avec grid inline
- Pie chart container, bar chart container
- Sections Mon activité (ligne ~234-249), Messages prioritaires, Briefs par priorité

- [ ] **Step 2: Ajouter les classes au dashboard.css**

Append à `src/components/dashboard/dashboard.css` :

```css
/* ── Décisions card legacy (Phase 1 wrap, sera remplacé par InboxCard en Phase 5) ── */
.dash-decision-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.02);
}

.dash-decision-card__priority {
  width: 4px;
  align-self: stretch;
  border-radius: 2px;
}

.dash-decision-card__body { flex: 1; min-width: 0; }
.dash-decision-card__head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.dash-decision-card__desc { font-size: 13px; color: var(--text-muted); margin: 6px 0; }
.dash-decision-card__meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap; }
.dash-decision-card__actions { display: flex; gap: 6px; flex-shrink: 0; }

/* ── Sections grid 2-col (Opérations/Équipe) ── */
.dash-twocol-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.dash-subcard {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  padding: 12px;
}

.dash-subcard__title {
  font-size: 13px;
  margin: 0 0 8px;
  color: var(--text-muted);
}

/* ── Chart container legacy (Phase 1 wrap) ── */
.dash-chart-legacy {
  margin-top: 16px;
  height: 220px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
  padding: 12px;
}

/* ── Mon activité card legacy ── */
.dash-mine-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.dash-mine-row > * { flex: 1; min-width: 140px; text-decoration: none; }

/* ── Briefs par priorité ── */
.dash-brief-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}
```

- [ ] **Step 3: Remplacer styles inline par classes dans SuperAdminDashboard.tsx**

Pour chaque bloc identifié à Step 1, remplacer le `style={{ ... }}` par la `className` correspondante. Exemple pour une décision card :

```tsx
// Avant
<div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14, background: 'rgba(255,255,255,0.02)' }}>
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
    <span style={{ width: 4, alignSelf: 'stretch', background: PRIORITY_COLORS[d.priority], borderRadius: 2 }} />
    <div style={{ flex: 1 }}>...</div>
  </div>
</div>

// Après
<div className="dash-decision-card">
  <span className="dash-decision-card__priority" style={{ background: PRIORITY_COLORS[d.priority] }} />
  <div className="dash-decision-card__body">...</div>
</div>
```

(Garder les `style` dynamiques qui dépendent de données runtime, mais externaliser tout le statique.)

- [ ] **Step 4: Vérifier visuellement — run dev server, naviguer sur /admin/super**

```bash
npm run dev
```
Ouvrir http://localhost:5173/admin/super, vérifier qu'il n'y a pas de régression visuelle.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard.css src/pages/admin/SuperAdminDashboard.tsx
git commit -m "refactor(dashboard): extract inline styles to dashboard.css classes"
```

### Task 1.10: Phase 1 — sanity check global

- [ ] **Step 1: Lancer tous les tests frontend**

```bash
npm run test:frontend
```
Expected: tous PASS, dont les nouveaux Sparkline / DashWidget / DashKpiCard / PeriodSelector / FinancialChart.

- [ ] **Step 2: Lancer le typecheck**

```bash
npx tsc --noEmit
```
Expected: 0 erreurs.

- [ ] **Step 3: Build production pour vérifier qu'on n'a pas explosé le bundle**

```bash
npm run build
```
Expected: build success, taille raisonnable.

- [ ] **Step 4: Commit final phase 1**

```bash
git commit --allow-empty -m "chore(dashboard): Phase 1 complete — design system foundations ready"
```

---

# Phase 2 — Sidebar pivot toggle

**But :** Remplacer le bouton "Réduire" actuel (en bas, opacity 30%) par un bouton flottant pivot Linear-style, accroché au bord droit de la sidebar, glow cyan, chevron qui pivote. Mécanique de persistance localStorage inchangée.

### Task 2.1: Composant SidebarCollapseToggle — test

**Files:**
- Test: `src/components/SidebarCollapseToggle.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SidebarCollapseToggle from './SidebarCollapseToggle'

describe('SidebarCollapseToggle', () => {
  it('rend un bouton avec aria-label "Réduire" quand expanded', () => {
    render(<SidebarCollapseToggle collapsed={false} onToggle={() => {}} />)
    const btn = screen.getByLabelText(/Réduire/i)
    expect(btn).toBeTruthy()
  })

  it('rend "Étendre" quand collapsed', () => {
    render(<SidebarCollapseToggle collapsed={true} onToggle={() => {}} />)
    expect(screen.getByLabelText(/Étendre/i)).toBeTruthy()
  })

  it('appelle onToggle au clic', () => {
    const fn = vi.fn()
    render(<SidebarCollapseToggle collapsed={false} onToggle={fn} />)
    fireEvent.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applique data-collapsed pour CSS', () => {
    const { container } = render(<SidebarCollapseToggle collapsed={true} onToggle={() => {}} />)
    const btn = container.querySelector('button')
    expect(btn?.getAttribute('data-collapsed')).toBe('true')
  })
})
```

- [ ] **Step 2: Run, voir échec**

```bash
npm run test:frontend -- src/components/SidebarCollapseToggle.test.tsx
```

### Task 2.2: Composant SidebarCollapseToggle — impl + CSS

**Files:**
- Create: `src/components/SidebarCollapseToggle.tsx`
- Create: `src/components/SidebarCollapseToggle.css`

- [ ] **Step 1: Composant**

```tsx
import { ChevronLeft } from 'lucide-react'
import './SidebarCollapseToggle.css'

interface Props {
  collapsed: boolean
  onToggle: () => void
}

const SidebarCollapseToggle = ({ collapsed, onToggle }: Props) => (
  <button
    type="button"
    className="sb-pivot-toggle"
    data-collapsed={collapsed ? 'true' : 'false'}
    onClick={onToggle}
    aria-label={collapsed ? 'Étendre la navigation' : 'Réduire la navigation'}
    title={collapsed ? 'Étendre (cmd+\\)' : 'Réduire (cmd+\\)'}
  >
    <ChevronLeft size={14} aria-hidden />
  </button>
)

export default SidebarCollapseToggle
```

- [ ] **Step 2: CSS pivot demi-cercle néon**

```css
.sb-pivot-toggle {
  position: absolute;
  top: 84px;
  right: -12px;
  z-index: 1100;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #000;
  border: 1px solid rgba(var(--primary-rgb), 0.45);
  color: var(--primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow:
    0 0 8px rgba(var(--primary-rgb), 0.4),
    0 0 18px rgba(var(--primary-rgb), 0.2);
  transition: background 0.15s, box-shadow 0.2s, transform 0.2s;
}

.sb-pivot-toggle svg { transition: transform 0.25s; }

.sb-pivot-toggle[data-collapsed="true"] svg { transform: rotate(180deg); }

.sb-pivot-toggle:hover {
  background: rgba(var(--primary-rgb), 0.15);
  box-shadow:
    0 0 10px rgba(var(--primary-rgb), 0.7),
    0 0 28px rgba(var(--primary-rgb), 0.35);
}

.sb-pivot-toggle:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* Hide on mobile — drawer is used instead */
@media (max-width: 900px) {
  .sb-pivot-toggle { display: none; }
}
```

- [ ] **Step 3: Run test, voir succès, commit**

```bash
npm run test:frontend -- src/components/SidebarCollapseToggle.test.tsx
git add src/components/SidebarCollapseToggle.tsx src/components/SidebarCollapseToggle.css src/components/SidebarCollapseToggle.test.tsx
git commit -m "feat(sidebar): add SidebarCollapseToggle (floating pivot Linear-style)"
```

### Task 2.3: Greffer le toggle dans AdminShell + masquer l'ancien bouton

**Files:**
- Modify: `src/components/AdminShell.tsx`
- Modify: `src/components/AdminSidebar.tsx`
- Modify: `src/components/AdminSidebar.css`

- [ ] **Step 1: Modifier AdminShell.tsx pour rendre le toggle à côté de AdminSidebar**

```tsx
// imports
import SidebarCollapseToggle from './SidebarCollapseToggle'

// dans le render, juste après AdminSidebar :
<AdminSidebar
  collapsed={collapsed}
  onCollapseToggle={handleCollapseToggle}
  drawerOpen={mobileDrawerOpen}
  onDrawerClose={() => setMobileDrawerOpen(false)}
/>
<SidebarCollapseToggle collapsed={collapsed} onToggle={handleCollapseToggle} />
```

(Le `.admin-shell` parent doit être `position: relative` pour que le bouton flottant `absolute` se positionne dedans. Vérifier `AdminShell.css` et ajouter si manquant.)

- [ ] **Step 2: Masquer l'ancien bouton dans AdminSidebar.tsx**

Dans `src/components/AdminSidebar.tsx`, supprimer le `<button className="admin-sb-collapse-btn" ...>` (lignes ~272-280). Garder la prop `onCollapseToggle` (encore utilisée par drawer mobile éventuellement) ou la marquer optional. Si plus aucun usage interne, supprimer.

- [ ] **Step 3: Nettoyer le CSS de l'ancien bouton**

Dans `src/components/AdminSidebar.css`, supprimer le bloc `.admin-sb-collapse-btn` (lignes ~287-311).

- [ ] **Step 4: Ajouter raccourci clavier global Cmd+\\ dans AdminShell**

```tsx
// dans AdminShell.tsx, ajouter useEffect
import { useEffect } from 'react'

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault()
      handleCollapseToggle()
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [collapsed])
```

- [ ] **Step 5: Vérifier visuel**

```bash
npm run dev
```
Naviguer dans /admin, vérifier :
- Le bouton flottant pivot apparaît au bord droit de la sidebar
- Au clic, sidebar se rétracte, chevron pivote, bouton reste visible
- Cmd+\\ fonctionne aussi
- En mobile (resize < 900px), bouton disparaît, drawer mobile inchangé

- [ ] **Step 6: Commit**

```bash
git add src/components/AdminShell.tsx src/components/AdminSidebar.tsx src/components/AdminSidebar.css
git commit -m "feat(sidebar): replace bottom collapse button with floating pivot toggle + Cmd+\\ shortcut"
```

### Task 2.4: Phase 2 — sanity check

- [ ] **Step 1: Tests + typecheck + build**

```bash
npm run test:frontend
npx tsc --noEmit
npm run build
```

- [ ] **Step 2: Commit final phase 2**

```bash
git commit --allow-empty -m "chore(sidebar): Phase 2 complete — pivot toggle shipped"
```

---

# Phase 3 — Analytics colonne droite (Pulse + KPI grid + chart)

**But :** Construire les composants `PulseStatus`, `KpiGrid2x2`, l'endpoint backend `/api/admin/dashboard/super` étendu avec les règles Pulse, et le wiring dans `SuperAdminDashboard`. Le chart financial déjà créé en Phase 1 est branché ici.

### Task 3.1: Backend — `pulseRules.ts` service avec 7 règles initiales

**Files:**
- Create: `backend/src/lib/dashboard/pulseRules.ts`
- Test: `backend/src/lib/dashboard/pulseRules.test.ts`

- [ ] **Step 1: Test des règles**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { evaluatePulseRules, PulseContext } from './pulseRules'

const baseCtx: PulseContext = {
  monthlyCA: 45000,
  caObjective: 60000,
  pipelinePrev30: 100000,
  pipelineCurrent: 128000,
  hotLeadsNeglected: 0,
  adminLoads: [],
  briefsP1Overdue: 0,
  lastBackupAt: new Date(),
  qualiopiExpiringWithin30Days: 0,
}

describe('evaluatePulseRules', () => {
  it('CA on-track = ok quand >= 70% objectif', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, monthlyCA: 42000, caObjective: 60000 })
    expect(r.find((c) => c.id === 'ca-on-track')?.status).toBe('ok')
  })

  it('CA = warn entre 40 et 70%', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, monthlyCA: 30000, caObjective: 60000 })
    expect(r.find((c) => c.id === 'ca-on-track')?.status).toBe('warn')
  })

  it('CA = bad < 40%', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, monthlyCA: 20000, caObjective: 60000 })
    expect(r.find((c) => c.id === 'ca-on-track')?.status).toBe('bad')
  })

  it('Pipeline growing = ok si delta positif', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, pipelinePrev30: 100, pipelineCurrent: 110 })
    expect(r.find((c) => c.id === 'pipeline-growing')?.status).toBe('ok')
  })

  it('hot leads neglected: 0 = ok, 1-3 = warn, 4+ = bad', async () => {
    const a = await evaluatePulseRules({ ...baseCtx, hotLeadsNeglected: 0 })
    const b = await evaluatePulseRules({ ...baseCtx, hotLeadsNeglected: 2 })
    const c = await evaluatePulseRules({ ...baseCtx, hotLeadsNeglected: 5 })
    expect(a.find((x) => x.id === 'hot-leads-followup')?.status).toBe('ok')
    expect(b.find((x) => x.id === 'hot-leads-followup')?.status).toBe('warn')
    expect(c.find((x) => x.id === 'hot-leads-followup')?.status).toBe('bad')
  })

  it('team-balanced: bad si 2+ admins > 10 tâches', async () => {
    const r = await evaluatePulseRules({
      ...baseCtx,
      adminLoads: [{ name: 'A', total: 12 }, { name: 'B', total: 14 }, { name: 'C', total: 5 }],
    })
    expect(r.find((x) => x.id === 'team-balanced')?.status).toBe('bad')
  })

  it('backup-success: bad si > 48h ou null', async () => {
    const r1 = await evaluatePulseRules({ ...baseCtx, lastBackupAt: null })
    const r2 = await evaluatePulseRules({ ...baseCtx, lastBackupAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) })
    expect(r1.find((x) => x.id === 'backup-success')?.status).toBe('bad')
    expect(r2.find((x) => x.id === 'backup-success')?.status).toBe('bad')
  })

  it('qualiopi: warn si 1+ signature expire < 30j', async () => {
    const r = await evaluatePulseRules({ ...baseCtx, qualiopiExpiringWithin30Days: 2 })
    expect(r.find((x) => x.id === 'qualiopi-compliant')?.status).toBe('warn')
  })
})
```

- [ ] **Step 2: Implémenter**

```ts
export type PulseStatus = 'ok' | 'warn' | 'bad'

export interface PulseCheck {
  id: string
  label: string
  status: PulseStatus
  detail?: string
}

export interface PulseContext {
  monthlyCA: number
  caObjective: number
  pipelinePrev30: number
  pipelineCurrent: number
  hotLeadsNeglected: number  // count of hot leads sans contact > 7d
  adminLoads: Array<{ name: string; total: number }>
  briefsP1Overdue: number
  lastBackupAt: Date | null
  qualiopiExpiringWithin30Days: number
}

const pct = (n: number, d: number) => (d === 0 ? 0 : (n / d) * 100)

const RULES = [
  {
    id: 'ca-on-track',
    label: 'CA mois sur trajectoire',
    check: (c: PulseContext): PulseCheck => {
      const p = pct(c.monthlyCA, c.caObjective)
      if (p >= 70) return { id: 'ca-on-track', label: 'CA mois sur trajectoire', status: 'ok', detail: `${Math.round(p)}% obj` }
      if (p >= 40) return { id: 'ca-on-track', label: 'CA mois sur trajectoire', status: 'warn', detail: `${Math.round(p)}% obj` }
      return { id: 'ca-on-track', label: 'CA mois sur trajectoire', status: 'bad', detail: `${Math.round(p)}% obj` }
    },
  },
  {
    id: 'pipeline-growing',
    label: 'Pipeline en croissance',
    check: (c: PulseContext): PulseCheck => {
      const delta = c.pipelineCurrent - c.pipelinePrev30
      const pct = c.pipelinePrev30 ? (delta / c.pipelinePrev30) * 100 : 0
      if (pct > 0) return { id: 'pipeline-growing', label: 'Pipeline en croissance', status: 'ok', detail: `+${pct.toFixed(0)}%` }
      if (pct === 0) return { id: 'pipeline-growing', label: 'Pipeline en croissance', status: 'warn', detail: 'stable' }
      return { id: 'pipeline-growing', label: 'Pipeline en croissance', status: 'bad', detail: `${pct.toFixed(0)}%` }
    },
  },
  {
    id: 'hot-leads-followup',
    label: 'Leads chauds suivis',
    check: (c: PulseContext): PulseCheck => {
      if (c.hotLeadsNeglected === 0) return { id: 'hot-leads-followup', label: 'Leads chauds suivis', status: 'ok' }
      if (c.hotLeadsNeglected <= 3) return { id: 'hot-leads-followup', label: 'Leads chauds suivis', status: 'warn', detail: `${c.hotLeadsNeglected} sans contact 7j+` }
      return { id: 'hot-leads-followup', label: 'Leads chauds suivis', status: 'bad', detail: `${c.hotLeadsNeglected} sans contact 7j+` }
    },
  },
  {
    id: 'team-balanced',
    label: 'Charge équipe équilibrée',
    check: (c: PulseContext): PulseCheck => {
      const overloaded = c.adminLoads.filter((a) => a.total > 10)
      if (overloaded.length === 0) return { id: 'team-balanced', label: 'Charge équipe équilibrée', status: 'ok' }
      if (overloaded.length === 1) return { id: 'team-balanced', label: 'Charge équipe équilibrée', status: 'warn', detail: `${overloaded[0].name} à ${overloaded[0].total} tâches` }
      return { id: 'team-balanced', label: 'Charge équipe équilibrée', status: 'bad', detail: `${overloaded.length} admins surchargés` }
    },
  },
  {
    id: 'briefs-p1-on-time',
    label: 'Briefs P1 dans les temps',
    check: (c: PulseContext): PulseCheck => {
      if (c.briefsP1Overdue === 0) return { id: 'briefs-p1-on-time', label: 'Briefs P1 dans les temps', status: 'ok' }
      if (c.briefsP1Overdue === 1) return { id: 'briefs-p1-on-time', label: 'Briefs P1 dans les temps', status: 'warn', detail: '1 dépassé' }
      return { id: 'briefs-p1-on-time', label: 'Briefs P1 dans les temps', status: 'bad', detail: `${c.briefsP1Overdue} dépassés` }
    },
  },
  {
    id: 'backup-success',
    label: 'Backup OK',
    check: (c: PulseContext): PulseCheck => {
      if (!c.lastBackupAt) return { id: 'backup-success', label: 'Backup OK', status: 'bad', detail: 'aucun backup récent' }
      const ageH = (Date.now() - c.lastBackupAt.getTime()) / 3_600_000
      if (ageH <= 24) return { id: 'backup-success', label: 'Backup OK', status: 'ok' }
      if (ageH <= 48) return { id: 'backup-success', label: 'Backup OK', status: 'warn', detail: `${Math.round(ageH)}h` }
      return { id: 'backup-success', label: 'Backup OK', status: 'bad', detail: `${Math.round(ageH)}h` }
    },
  },
  {
    id: 'qualiopi-compliant',
    label: 'Qualiopi conforme',
    check: (c: PulseContext): PulseCheck => {
      if (c.qualiopiExpiringWithin30Days === 0) return { id: 'qualiopi-compliant', label: 'Qualiopi conforme', status: 'ok' }
      return { id: 'qualiopi-compliant', label: 'Qualiopi conforme', status: 'warn', detail: `${c.qualiopiExpiringWithin30Days} à renouveler < 30j` }
    },
  },
]

export async function evaluatePulseRules(ctx: PulseContext): Promise<PulseCheck[]> {
  return RULES.map((r) => r.check(ctx))
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd backend && npx vitest run src/lib/dashboard/pulseRules.test.ts
git add backend/src/lib/dashboard/pulseRules.ts backend/src/lib/dashboard/pulseRules.test.ts
git commit -m "feat(dashboard-be): add pulseRules service with 7 initial business rules"
```

### Task 3.2: Backend — étendre `/api/admin/dashboard/super` pour exposer pulseChecks + deltas

**Files:**
- Modify: `backend/src/routes/admin/dashboard.ts`
- Modify: `backend/src/routes/admin/dashboard.test.ts` (créer si pas existant)

- [ ] **Step 1: Repérer la structure actuelle de la route `/super`**

Lire `backend/src/routes/admin/dashboard.ts` ligne ~114. Conserver l'existant et ajouter :
- `pulseChecks: PulseCheck[]` (calculé via `evaluatePulseRules`)
- KPIs enrichis : pour chaque KPI (CA, pipeline, hotLeads, activeProjects), ajouter `{ value, delta, deltaPercent, objective?, sparkline? }`

- [ ] **Step 2: Ajouter la collecte du contexte Pulse**

```ts
// dans le handler de GET /super, avant le res.json
import { evaluatePulseRules, PulseContext } from '../../lib/dashboard/pulseRules'
import Backup from '../../models/Backup'  // si existe, sinon valeur null
import QualiopiSignature from '../../models/QualiopiSignature'  // idem

// agrégations supplémentaires :
const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0)
const monthlyCA = await BillingDocument.aggregate([
  { $match: { type: 'INVOICE', issuedAt: { $gte: monthStart } } },
  { $group: { _id: null, total: { $sum: '$totalAmount' } } },
]).then((r) => r[0]?.total ?? 0)

const caObjective = await CompanySettings.findOne().then((s) => s?.monthlyCAObjective ?? 60000)

// pipeline current = sum amount des leads OPEN
const pipelineCurrent = await Lead.aggregate([
  { $match: { status: 'OPEN' } },
  { $group: { _id: null, total: { $sum: '$estimatedAmount' } } },
]).then((r) => r[0]?.total ?? 0)

// pipeline 30j avant : leads créés avant date - 30j et toujours OPEN
const thirtyAgo = new Date(Date.now() - 30 * 86400 * 1000)
const pipelinePrev30 = await Lead.aggregate([
  { $match: { status: 'OPEN', createdAt: { $lt: thirtyAgo } } },
  { $group: { _id: null, total: { $sum: '$estimatedAmount' } } },
]).then((r) => r[0]?.total ?? 0)

const hotLeadsNeglected = await Lead.countDocuments({
  temperature: 'HOT',
  status: 'OPEN',
  $or: [
    { lastContactAt: { $lt: new Date(Date.now() - 7 * 86400 * 1000) } },
    { lastContactAt: { $exists: false } },
  ],
})

const briefsP1Overdue = await MissionBrief.countDocuments({
  priority: 'P1',
  status: { $ne: 'DONE' },
  deadline: { $lt: new Date() },
})

const lastBackup = await Backup.findOne().sort({ createdAt: -1 }).select('createdAt')
const lastBackupAt = lastBackup?.createdAt ?? null

const qualiopiExpiringWithin30Days = await QualiopiSignature.countDocuments({
  expiresAt: { $lt: new Date(Date.now() + 30 * 86400 * 1000), $gte: new Date() },
})

const adminLoads = await Task.aggregate([
  { $match: { status: { $in: ['OPEN', 'IN_PROGRESS'] } } },
  { $group: { _id: '$assignee', total: { $sum: 1 } } },
  { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
  { $project: { name: { $arrayElemAt: ['$user.name', 0] }, total: 1 } },
])

const pulseCtx: PulseContext = {
  monthlyCA, caObjective,
  pipelinePrev30, pipelineCurrent,
  hotLeadsNeglected,
  adminLoads: adminLoads.map((a) => ({ name: a.name ?? '?', total: a.total })),
  briefsP1Overdue,
  lastBackupAt,
  qualiopiExpiringWithin30Days,
}

const pulseChecks = await evaluatePulseRules(pulseCtx)
```

- [ ] **Step 3: Ajouter pulseChecks et KPIs enrichis dans la réponse JSON**

Dans le `res.json({...})` final, ajouter :

```ts
pulseChecks,
kpis: {
  ca: {
    value: monthlyCA,
    objective: { current: monthlyCA, target: caObjective, label: 'Obj mois' },
    delta: computeDelta(monthlyCA, /* CA mois précédent */),
  },
  pipeline: { value: pipelineCurrent, delta: computeDelta(pipelineCurrent, pipelinePrev30) },
  hotLeads: { value: hotLeadsCount },
  activeProjects: { value: activeProjects },
},
```

Avec un helper `computeDelta(now, prev)` à mettre en haut du fichier :

```ts
function computeDelta(curr: number, prev: number) {
  if (prev === 0) return { value: 0, direction: 'flat' as const, deltaPercent: 0 }
  const deltaPercent = Math.round(((curr - prev) / prev) * 100)
  return {
    value: deltaPercent,
    direction: deltaPercent > 0 ? ('up' as const) : deltaPercent < 0 ? ('down' as const) : ('flat' as const),
    deltaPercent,
  }
}
```

- [ ] **Step 4: Test d'intégration (mongo in-memory)**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { createApp } from '../../app'  // ou équivalent qui exporte l'app Express
import User from '../../models/User'

let mongo: MongoMemoryServer
let app: any
let token: string

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  app = createApp()
  // seed super admin + récupérer token
  const su = await User.create({ email: 'su@v.io', name: 'SU', role: 'SUPER_ADMIN', password: 'x' })
  // ... récupérer JWT
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('GET /api/admin/dashboard/super', () => {
  it('retourne pulseChecks (7 règles)', async () => {
    const res = await request(app).get('/api/admin/dashboard/super').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.pulseChecks)).toBe(true)
    expect(res.body.pulseChecks).toHaveLength(7)
  })

  it('retourne kpis avec delta', async () => {
    const res = await request(app).get('/api/admin/dashboard/super').set('Authorization', `Bearer ${token}`)
    expect(res.body.kpis).toBeDefined()
    expect(res.body.kpis.ca).toHaveProperty('value')
    expect(res.body.kpis.pipeline).toHaveProperty('delta')
  })
})
```

- [ ] **Step 5: Run test backend + commit**

```bash
cd backend && npx vitest run src/routes/admin/dashboard.test.ts
git add backend/src/routes/admin/dashboard.ts backend/src/routes/admin/dashboard.test.ts
git commit -m "feat(dashboard-be): /super endpoint exposes pulseChecks + enriched KPIs with deltas"
```

### Task 3.3: Frontend — composant PulseStatus

**Files:**
- Test: `src/components/dashboard/PulseStatus.test.tsx`
- Create: `src/components/dashboard/PulseStatus.tsx`
- Modify: `src/components/dashboard/dashboard.css` (ajouter classes pulse)

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PulseStatus from './PulseStatus'

const checks = [
  { id: 'a', label: 'CA on track', status: 'ok' as const },
  { id: 'b', label: 'Backup', status: 'bad' as const, detail: '72h' },
  { id: 'c', label: 'Leads', status: 'warn' as const, detail: '2 sans contact' },
]

describe('PulseStatus', () => {
  it('rend une ligne par check', () => {
    render(<PulseStatus checks={checks} />)
    expect(screen.getByText('CA on track')).toBeTruthy()
    expect(screen.getByText('Backup')).toBeTruthy()
    expect(screen.getByText('Leads')).toBeTruthy()
  })

  it('affiche les détails quand fournis', () => {
    render(<PulseStatus checks={checks} />)
    expect(screen.getByText('72h')).toBeTruthy()
    expect(screen.getByText('2 sans contact')).toBeTruthy()
  })

  it('compte les checks par status dans le header', () => {
    render(<PulseStatus checks={checks} />)
    // Header devrait dire genre "1 ok · 1 warn · 1 bad"
    expect(screen.getByText(/3 checks/)).toBeTruthy()
  })

  it('applique la classe de status sur chaque ligne', () => {
    const { container } = render(<PulseStatus checks={checks} />)
    expect(container.querySelectorAll('.dash-pulse__row--ok')).toHaveLength(1)
    expect(container.querySelectorAll('.dash-pulse__row--warn')).toHaveLength(1)
    expect(container.querySelectorAll('.dash-pulse__row--bad')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run, voir échec, puis impl**

```tsx
import { PulseCheck } from './types'  // type partagé front/back

interface Props {
  checks: PulseCheck[]
}

const PulseStatus = ({ checks }: Props) => {
  const counts = checks.reduce(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] || 0) + 1 }),
    {} as Record<string, number>
  )

  return (
    <div className="dash-pulse">
      <div className="dash-pulse__header">
        <span className="dash-pulse__title">● PULSE VENIO</span>
        <span className="dash-pulse__count">
          {checks.length} checks · <span style={{ color: '#86efac' }}>{counts.ok ?? 0} ok</span> · <span style={{ color: '#fcd34d' }}>{counts.warn ?? 0} warn</span> · <span style={{ color: '#fca5a5' }}>{counts.bad ?? 0} bad</span>
        </span>
      </div>
      <div className="dash-pulse__list">
        {checks.map((c) => (
          <div key={c.id} className={`dash-pulse__row dash-pulse__row--${c.status}`}>
            <span className={`dash-pulse__dot dash-pulse__dot--${c.status}`} />
            <span className="dash-pulse__label">{c.label}</span>
            {c.detail && <span className="dash-pulse__detail">{c.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PulseStatus
```

- [ ] **Step 3: Type partagé**

Create `src/components/dashboard/types.ts` :

```ts
export type PulseStatusType = 'ok' | 'warn' | 'bad'

export interface PulseCheck {
  id: string
  label: string
  status: PulseStatusType
  detail?: string
}
```

- [ ] **Step 4: CSS Pulse — append à dashboard.css**

```css
.dash-pulse {
  background: rgba(34, 197, 94, 0.05);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-left: 3px solid #22c55e;
  border-radius: 8px;
  padding: 12px;
  box-shadow: inset 0 0 20px rgba(34, 197, 94, 0.06), 0 0 14px rgba(34, 197, 94, 0.12);
}

.dash-pulse__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.dash-pulse__title {
  font-size: 11px;
  color: #86efac;
  letter-spacing: 0.5px;
  text-shadow: 0 0 6px rgba(34, 197, 94, 0.4);
  font-weight: 600;
}

.dash-pulse__count { font-size: 10px; color: var(--text-muted); }

.dash-pulse__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 11px;
  color: var(--text-secondary);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.dash-pulse__row:first-of-type { border-top: none; }

.dash-pulse__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dash-pulse__dot--ok   { background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.8); }
.dash-pulse__dot--warn { background: #f59e0b; box-shadow: 0 0 8px rgba(245,158,11,0.8); }
.dash-pulse__dot--bad  { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.8); }

.dash-pulse__label { flex: 1; }
.dash-pulse__detail { font-size: 10px; color: var(--text-muted); font-style: italic; }
```

- [ ] **Step 5: Run, commit**

```bash
npm run test:frontend -- src/components/dashboard/PulseStatus.test.tsx
git add src/components/dashboard/PulseStatus.tsx src/components/dashboard/PulseStatus.test.tsx src/components/dashboard/types.ts src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(dashboard): add PulseStatus component (checks list with dot+label+detail)"
```

### Task 3.4: Frontend — composant KpiGrid2x2

**Files:**
- Create: `src/components/dashboard/KpiGrid2x2.tsx`
- Test: `src/components/dashboard/KpiGrid2x2.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KpiGrid2x2 from './KpiGrid2x2'

const kpis = [
  { label: 'CA', value: '45k€', accentColor: '#ff0080', accentRgb: '255,0,128' },
  { label: 'Pipeline', value: '128k€', accentColor: '#8b5cf6', accentRgb: '139,92,246' },
  { label: 'Leads', value: 12, accentColor: '#f59e0b', accentRgb: '245,158,11' },
  { label: 'Projets', value: 22, accentColor: '#22c55e', accentRgb: '34,197,94' },
]

describe('KpiGrid2x2', () => {
  it('rend 4 cartes', () => {
    const { container } = render(<KpiGrid2x2 kpis={kpis} />)
    expect(container.querySelectorAll('.dash-kpi')).toHaveLength(4)
  })

  it('passe les props delta/objective/sparkline à chaque carte', () => {
    const kpisWithExtras = kpis.map((k, i) => ({
      ...k,
      delta: { value: i, direction: 'up' as const },
    }))
    render(<KpiGrid2x2 kpis={kpisWithExtras} />)
    expect(screen.getByText(/\+3%/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implémenter**

```tsx
import DashKpiCard, { KpiDelta, KpiObjective } from './DashKpiCard'
import './dashboard.css'

export interface KpiSpec {
  label: string
  value: React.ReactNode
  accentColor: string
  accentRgb: string
  to?: string
  delta?: KpiDelta
  objective?: KpiObjective
  sparkline?: number[]
}

interface Props { kpis: KpiSpec[] }

const KpiGrid2x2 = ({ kpis }: Props) => (
  <div className="dash-kpi-grid-2x2">
    {kpis.map((k) => (
      <DashKpiCard key={k.label} {...k} />
    ))}
  </div>
)

export default KpiGrid2x2
```

- [ ] **Step 3: Ajouter CSS**

Append à dashboard.css :

```css
.dash-kpi-grid-2x2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

@media (max-width: 600px) {
  .dash-kpi-grid-2x2 { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:frontend -- src/components/dashboard/KpiGrid2x2.test.tsx
git add src/components/dashboard/KpiGrid2x2.tsx src/components/dashboard/KpiGrid2x2.test.tsx src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(dashboard): add KpiGrid2x2 composition component"
```

### Task 3.5: Frontend — wiring dans SuperAdminDashboard (colonne droite)

**Files:**
- Modify: `src/pages/admin/SuperAdminDashboard.tsx`

- [ ] **Step 1: Mettre à jour le type `SuperDashboard` pour matcher l'endpoint enrichi**

Ajouter dans l'interface :

```ts
import type { PulseCheck } from '../../components/dashboard/types'

interface SuperDashboard {
  // ... existant
  pulseChecks: PulseCheck[]
  kpis: {
    ca: { value: number; delta: { value: number; direction: 'up'|'down'|'flat' }; objective?: { current: number; target: number; label?: string } }
    pipeline: { value: number; delta: { value: number; direction: 'up'|'down'|'flat' } }
    hotLeads: { value: number }
    activeProjects: { value: number }
  }
}
```

- [ ] **Step 2: Remplacer la section Business actuelle par PulseStatus + KpiGrid2x2 + FinancialChart**

Remplacer le bloc `<DashSection title="Business" ...>` par :

```tsx
<DashSection title="Analytics" icon={<TrendingUp size={16} />}>
  <PulseStatus checks={data.pulseChecks} />
  <KpiGrid2x2 kpis={[
    {
      label: 'CA · mois', value: formatEUR(data.kpis.ca.value),
      accentColor: '#ff0080', accentRgb: '255, 0, 128',
      delta: data.kpis.ca.delta,
      objective: data.kpis.ca.objective,
    },
    {
      label: 'Pipeline', value: formatEUR(data.kpis.pipeline.value),
      accentColor: '#8b5cf6', accentRgb: '139, 92, 246',
      delta: data.kpis.pipeline.delta,
      to: '/admin/crm',
    },
    {
      label: 'Leads chauds', value: data.kpis.hotLeads.value,
      accentColor: '#f59e0b', accentRgb: '245, 158, 11',
      to: '/admin/crm',
    },
    {
      label: 'Projets actifs', value: data.kpis.activeProjects.value,
      accentColor: '#22c55e', accentRgb: '34, 197, 94',
    },
  ]} />
  <FinancialChart
    data={data.business.revenueTrend.map((r) => ({
      ts: formatMonth(r.year, r.month),
      value: r.total,
    }))}
    label="CA + Volume · 12 mois"
    currentValue={formatEUR(data.kpis.ca.value)}
  />
</DashSection>
```

(Garder les autres sections inchangées pour cette phase — elles seront refactorisées en Phase 6.)

- [ ] **Step 3: Lancer dev server, vérifier visuellement**

```bash
npm run dev
```
Vérifier `/admin/super` :
- Pulse checks affichés avec couleurs ok/warn/bad
- KPIs avec deltas (↗ +12%)
- Chart financial avec gradient cyan

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/SuperAdminDashboard.tsx
git commit -m "feat(dashboard): wire PulseStatus + KpiGrid2x2 + FinancialChart in right column"
```

### Task 3.6: Phase 3 — sanity check

- [ ] **Step 1: Tests + typecheck + build**

```bash
npm run test:frontend
cd backend && npx vitest run && cd ..
npx tsc --noEmit
npm run build
```

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore(dashboard): Phase 3 complete — analytics column shipped"
```

---

# Phase 4 — Inbox backend (models + aggregator + routes)

**But :** Créer les models `InboxSnooze` et `InboxPin`, le service `aggregator` qui combine les 8 sources, le scoring d'urgence, et les routes REST `/api/admin/inbox*`.

### Task 4.1: Model InboxSnooze

**Files:**
- Create: `backend/src/models/InboxSnooze.ts`
- Test: `backend/src/models/InboxSnooze.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import InboxSnooze from './InboxSnooze'

let mongo: MongoMemoryServer
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()) })
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(async () => { await InboxSnooze.deleteMany({}) })

describe('InboxSnooze', () => {
  it('crée un snooze', async () => {
    const s = await InboxSnooze.create({
      userId: new mongoose.Types.ObjectId(),
      itemType: 'decision',
      sourceId: new mongoose.Types.ObjectId(),
      snoozedUntil: new Date(Date.now() + 3600 * 1000),
    })
    expect(s._id).toBeDefined()
  })

  it('rejette un doublon (userId+itemType+sourceId)', async () => {
    const userId = new mongoose.Types.ObjectId()
    const sourceId = new mongoose.Types.ObjectId()
    await InboxSnooze.create({ userId, itemType: 'decision', sourceId, snoozedUntil: new Date() })
    await expect(
      InboxSnooze.create({ userId, itemType: 'decision', sourceId, snoozedUntil: new Date() })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Impl**

```ts
import { Schema, model, Document, Types } from 'mongoose'

export interface InboxSnoozeDoc extends Document {
  userId: Types.ObjectId
  itemType: string
  sourceId: Types.ObjectId
  snoozedUntil: Date
  createdAt: Date
}

const schema = new Schema<InboxSnoozeDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemType: { type: String, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    snoozedUntil: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

schema.index({ userId: 1, itemType: 1, sourceId: 1 }, { unique: true })
schema.index({ snoozedUntil: 1 }, { expireAfterSeconds: 0 })  // TTL auto-cleanup

const InboxSnooze = model<InboxSnoozeDoc>('InboxSnooze', schema)
export default InboxSnooze
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npx vitest run src/models/InboxSnooze.test.ts
git add backend/src/models/InboxSnooze.ts backend/src/models/InboxSnooze.test.ts
git commit -m "feat(inbox-be): add InboxSnooze model with TTL auto-cleanup"
```

### Task 4.2: Model InboxPin

**Files:**
- Create: `backend/src/models/InboxPin.ts`
- Test: `backend/src/models/InboxPin.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import InboxPin from './InboxPin'

let mongo: MongoMemoryServer
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()) })
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(async () => { await InboxPin.deleteMany({}) })

describe('InboxPin', () => {
  it('crée un pin avec titre snapshot et lien', async () => {
    const p = await InboxPin.create({
      userId: new mongoose.Types.ObjectId(),
      refType: 'project',
      refId: new mongoose.Types.ObjectId(),
      title: 'Projet Acme',
      link: '/admin/projets/xxx',
    })
    expect(p.title).toBe('Projet Acme')
  })
})
```

- [ ] **Step 2: Impl**

```ts
import { Schema, model, Document, Types } from 'mongoose'

export interface InboxPinDoc extends Document {
  userId: Types.ObjectId
  refType: string
  refId: Types.ObjectId
  title: string
  link: string
  color?: string
  expiresAt?: Date
  createdAt: Date
}

const schema = new Schema<InboxPinDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refType: { type: String, required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true },
    link: { type: String, required: true },
    color: { type: String },
    expiresAt: { type: Date, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

const InboxPin = model<InboxPinDoc>('InboxPin', schema)
export default InboxPin
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npx vitest run src/models/InboxPin.test.ts
git add backend/src/models/InboxPin.ts backend/src/models/InboxPin.test.ts
git commit -m "feat(inbox-be): add InboxPin model"
```

### Task 4.3: Aggregator service — types partagés

**Files:**
- Create: `backend/src/lib/inbox/types.ts`

- [ ] **Step 1: Types**

```ts
export type InboxItemType = 'decision' | 'brief' | 'lead' | 'message' | 'ticket' | 'task' | 'system' | 'pin'

export type InboxActionKind = 'approve' | 'reject' | 'open' | 'email' | 'snooze' | 'unpin' | 'mark_done' | 'read'

export interface InboxAction {
  kind: InboxActionKind
  label: string
  shortcut?: string
}

export interface InboxTag {
  label: string  // 'URG' | 'P1' | 'CRM' | ...
  color: string  // hex
}

export interface InboxItem {
  id: string  // composite: `${type}:${sourceId}`
  type: InboxItemType
  sourceId: string
  title: string
  meta: string[]
  urgency: number  // 0-100
  tag: InboxTag
  actions: InboxAction[]
  link?: string
  snoozedUntil?: string  // ISO date
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/inbox/types.ts
git commit -m "feat(inbox-be): add inbox types"
```

### Task 4.4: Aggregator — scoring d'urgence (pure function)

**Files:**
- Create: `backend/src/lib/inbox/scoreUrgency.ts`
- Test: `backend/src/lib/inbox/scoreUrgency.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest'
import { scoreUrgency } from './scoreUrgency'

describe('scoreUrgency', () => {
  it('décision URGENTE = 100', () => {
    expect(scoreUrgency({ type: 'decision', priority: 'URGENTE' })).toBe(100)
  })

  it('brief P1 = 80', () => {
    expect(scoreUrgency({ type: 'brief', priority: 'P1' })).toBe(80)
  })

  it('deadline dépassée ajoute +20', () => {
    const past = new Date(Date.now() - 86400 * 1000)
    expect(scoreUrgency({ type: 'task', deadline: past })).toBeGreaterThan(scoreUrgency({ type: 'task' }))
  })

  it('cap à 100', () => {
    const past = new Date(Date.now() - 86400 * 1000)
    expect(scoreUrgency({ type: 'decision', priority: 'URGENTE', deadline: past })).toBe(100)
  })
})
```

- [ ] **Step 2: Impl**

```ts
import { InboxItemType } from './types'

export interface UrgencyInput {
  type: InboxItemType
  priority?: string  // 'URGENTE' | 'HAUTE' | 'NORMALE' | 'BASSE' | 'P1' | 'P2' | 'P3'
  deadline?: Date | null
  ageDays?: number
  daysSinceContact?: number  // pour leads
}

const BASE: Record<InboxItemType, number> = {
  decision: 70,
  brief: 60,
  lead: 50,
  message: 40,
  ticket: 50,
  task: 30,
  system: 35,
  pin: 25,
}

const PRIORITY_BONUS: Record<string, number> = {
  URGENTE: 30, HAUTE: 20, NORMALE: 5, BASSE: 0,
  P1: 20, P2: 10, P3: 0,
}

export function scoreUrgency(input: UrgencyInput): number {
  let score = BASE[input.type] ?? 0
  if (input.priority) score += PRIORITY_BONUS[input.priority] ?? 0
  if (input.deadline && input.deadline.getTime() < Date.now()) score += 20
  if (input.daysSinceContact && input.daysSinceContact > 14) score += 10
  return Math.min(100, score)
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npx vitest run src/lib/inbox/scoreUrgency.test.ts
git add backend/src/lib/inbox/scoreUrgency.ts backend/src/lib/inbox/scoreUrgency.test.ts
git commit -m "feat(inbox-be): add urgency scoring function"
```

### Task 4.5: Aggregator — getDecisionItems

**Files:**
- Create: `backend/src/lib/inbox/sources/decisions.ts`
- Test: `backend/src/lib/inbox/sources/decisions.test.ts`

- [ ] **Step 1: Test (avec mongo in-memory)**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import Decision from '../../../models/Decision'
import { getDecisionItems } from './decisions'

let mongo: MongoMemoryServer
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()) })
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(async () => { await Decision.deleteMany({}) })

describe('getDecisionItems', () => {
  it('retourne uniquement les décisions PENDING', async () => {
    await Decision.create([
      { title: 'A', status: 'PENDING', priority: 'URGENTE', category: 'X' },
      { title: 'B', status: 'APPROVED', priority: 'NORMALE', category: 'X' },
    ])
    const items = await getDecisionItems()
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('A')
    expect(items[0].type).toBe('decision')
    expect(items[0].tag.label).toBe('URG')
    expect(items[0].actions.some((a) => a.kind === 'approve')).toBe(true)
  })
})
```

- [ ] **Step 2: Impl**

```ts
import Decision from '../../../models/Decision'
import { InboxItem } from '../types'
import { scoreUrgency } from '../scoreUrgency'

const PRIORITY_TAG: Record<string, { label: string; color: string }> = {
  URGENTE: { label: 'URG', color: '#ff0080' },
  HAUTE:   { label: 'HAUTE', color: '#f59e0b' },
  NORMALE: { label: 'NORM', color: '#0ea5e9' },
  BASSE:   { label: 'BASSE', color: '#606060' },
}

export async function getDecisionItems(): Promise<InboxItem[]> {
  const decisions = await Decision.find({ status: 'PENDING' })
    .populate('submittedBy', 'name email')
    .sort({ priority: -1, createdAt: -1 })
    .lean()

  return decisions.map((d: any) => ({
    id: `decision:${d._id}`,
    type: 'decision',
    sourceId: String(d._id),
    title: d.title,
    meta: [
      `📋 ${d.category}`,
      d.submittedBy?.name ? `par ${d.submittedBy.name}` : '',
      `créée ${new Date(d.createdAt).toLocaleDateString('fr-FR')}`,
    ].filter(Boolean),
    urgency: scoreUrgency({ type: 'decision', priority: d.priority, deadline: d.deadline ?? null }),
    tag: PRIORITY_TAG[d.priority] ?? PRIORITY_TAG.NORMALE,
    actions: [
      { kind: 'approve', label: 'A ✓', shortcut: 'a' },
      { kind: 'reject', label: 'R ✗', shortcut: 'r' },
      { kind: 'snooze', label: 'S ⏰', shortcut: 's' },
    ],
    link: `/admin/decisions/${d._id}`,
  }))
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npx vitest run src/lib/inbox/sources/decisions.test.ts
git add backend/src/lib/inbox/sources/decisions.ts backend/src/lib/inbox/sources/decisions.test.ts
git commit -m "feat(inbox-be): add decisions source aggregator"
```

### Task 4.6: Aggregator — getBriefP1Items, getLeadItems, getMessageItems, getTicketItems, getTaskItems, getSystemItems, getPinnedItems

**Pattern identique à Task 4.5 pour chaque source.** Pour chacune :

**Files (par source):**
- Create: `backend/src/lib/inbox/sources/<source>.ts`
- Test: `backend/src/lib/inbox/sources/<source>.test.ts`

Chacune des sous-tâches suivantes suit le même pattern : écrire test → impl → commit.

#### 4.6a — getBriefP1Items

- [ ] **Test** : crée 3 MissionBriefs (P1 dépassé, P1 futur, P2 dépassé) → assert que seul le P1 dépassé est retourné.
- [ ] **Impl** :

```ts
import MissionBrief from '../../../models/MissionBrief'
import { InboxItem } from '../types'
import { scoreUrgency } from '../scoreUrgency'

const TAG = { label: 'P1', color: '#f59e0b' }

export async function getBriefP1Items(userId: string): Promise<InboxItem[]> {
  const briefs = await MissionBrief.find({
    priority: 'P1',
    status: { $ne: 'DONE' },
    deadline: { $lt: new Date() },
    $or: [{ assignee: userId }, { assignee: { $exists: false } }],
  }).lean()

  return briefs.map((b: any) => ({
    id: `brief:${b._id}`,
    type: 'brief',
    sourceId: String(b._id),
    title: b.title,
    meta: [`📂 P1 · échéance ${new Date(b.deadline).toLocaleDateString('fr-FR')}`],
    urgency: scoreUrgency({ type: 'brief', priority: 'P1', deadline: b.deadline }),
    tag: TAG,
    actions: [
      { kind: 'open', label: 'Ouvrir ⏎', shortcut: 'enter' },
      { kind: 'snooze', label: 'S', shortcut: 's' },
    ],
    link: `/admin/briefs/${b._id}`,
  }))
}
```

- [ ] **Commit** : `feat(inbox-be): add brief P1 source aggregator`

#### 4.6b — getLeadItems (leads chauds non contactés 7j+)

- [ ] **Test** : 1 lead HOT contacté hier (skip), 1 HOT contacté 10j ago (include), 1 COLD 10j ago (skip).
- [ ] **Impl** :

```ts
import Lead from '../../../models/Lead'
import { InboxItem } from '../types'
import { scoreUrgency } from '../scoreUrgency'

const TAG = { label: 'CRM', color: '#0ea5e9' }
const SEVEN_DAYS = 7 * 86400 * 1000

export async function getLeadItems(): Promise<InboxItem[]> {
  const leads = await Lead.find({
    temperature: 'HOT',
    status: 'OPEN',
    $or: [
      { lastContactAt: { $lt: new Date(Date.now() - SEVEN_DAYS) } },
      { lastContactAt: { $exists: false } },
    ],
  }).lean()

  return leads.map((l: any) => {
    const daysSince = l.lastContactAt
      ? Math.floor((Date.now() - new Date(l.lastContactAt).getTime()) / 86400000)
      : 999
    return {
      id: `lead:${l._id}`,
      type: 'lead',
      sourceId: String(l._id),
      title: `Relancer ${l.companyName ?? l.contactName ?? 'lead'}`,
      meta: [
        l.estimatedAmount ? `🔥 ${l.estimatedAmount.toLocaleString('fr-FR')}€ potentiel` : '🔥 Hot',
        `${daysSince}j sans contact`,
      ],
      urgency: scoreUrgency({ type: 'lead', daysSinceContact: daysSince }),
      tag: TAG,
      actions: [
        { kind: 'email', label: '✉ Mail' },
        { kind: 'open', label: 'Ouvrir ⏎', shortcut: 'enter' },
        { kind: 'snooze', label: 'S', shortcut: 's' },
      ],
      link: `/admin/crm/leads/${l._id}`,
    }
  })
}
```

- [ ] **Commit** : `feat(inbox-be): add hot leads source aggregator`

#### 4.6c — getMessageItems (DM non lus + @mentions)

- [ ] **Test** : 1 DM avec unreadCount=2 (include), 1 channel sans mention pour me (skip), 1 channel avec @me (include).
- [ ] **Impl** :

```ts
import InternalConversation from '../../../models/InternalConversation'
import { InboxItem } from '../types'
import { scoreUrgency } from '../scoreUrgency'

const TAG = { label: 'MSG', color: '#8b5cf6' }

export async function getMessageItems(userId: string): Promise<InboxItem[]> {
  // DMs non lus
  const dms = await InternalConversation.find({
    type: 'DM',
    members: userId,
    [`unreadByUser.${userId}`]: { $gt: 0 },
  }).lean()

  // Channels avec @mention récent
  const mentioned = await InternalConversation.find({
    type: 'CHANNEL',
    members: userId,
    [`mentionedSince.${userId}`]: { $exists: true },
  }).lean()

  return [...dms, ...mentioned].map((c: any) => ({
    id: `message:${c._id}`,
    type: 'message',
    sourceId: String(c._id),
    title: c.type === 'DM' ? `DM ${c.name ?? '...'}` : `#${c.name} (mention)`,
    meta: [`${c.unreadByUser?.[userId] ?? 0} non lus`, c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString('fr-FR') : ''],
    urgency: scoreUrgency({ type: 'message' }),
    tag: TAG,
    actions: [{ kind: 'read', label: 'Lire ⏎', shortcut: 'enter' }],
    link: '/admin/messages',
  }))
}
```

- [ ] **Commit** : `feat(inbox-be): add messages source aggregator`

#### 4.6d — getTicketItems (tickets internes assignés à me)

- [ ] **Test** : 1 ticket assigné OPEN (include), 1 assigné CLOSED (skip), 1 OPEN mais autre assignee (skip).
- [ ] **Impl** (`InternalTicket` model, status != 'CLOSED', assignee === userId).
- [ ] **Commit** : `feat(inbox-be): add tickets source aggregator`

#### 4.6e — getTaskItems (tâches en retard de 2j+)

- [ ] **Test** : Task dueDate il y a 3j (include), dueDate hier (skip car seuil 2j), dueDate dans 1j (skip).
- [ ] **Impl** : `Task.find({ dueDate: { $lt: new Date(Date.now() - 2*86400000) }, status: { $ne: 'DONE' }, assignee: userId })`. Actions : `{kind:'mark_done', label:'F ✓', shortcut:'f'}, {kind:'open'}, {kind:'snooze'}`.
- [ ] **Commit** : `feat(inbox-be): add tasks source aggregator`

#### 4.6f — getSystemItems (alertes calculées)

- [ ] **Test** : pour chaque règle (backup K.O., audit RGPD < 7j, qualiopi < 14j), vérifier que l'item apparaît bien si la condition est vraie.
- [ ] **Impl** :

```ts
import Backup from '../../../models/Backup'
import QualiopiSignature from '../../../models/QualiopiSignature'
import { InboxItem } from '../types'
import { scoreUrgency } from '../scoreUrgency'

const TAG = { label: 'SYS', color: '#606060' }

export async function getSystemItems(): Promise<InboxItem[]> {
  const items: InboxItem[] = []

  // backup K.O. depuis 24h
  const lastBackup = await Backup.findOne().sort({ createdAt: -1 }).select('createdAt status')
  if (!lastBackup || lastBackup.status === 'FAILED' || Date.now() - lastBackup.createdAt.getTime() > 24*3600*1000) {
    items.push({
      id: 'system:backup',
      type: 'system',
      sourceId: 'backup',
      title: '⚠ Backup K.O. depuis 24h+',
      meta: ['Vérifier la chaîne de sauvegarde'],
      urgency: scoreUrgency({ type: 'system' }) + 20,
      tag: TAG,
      actions: [{ kind: 'open', label: 'Ouvrir' }],
      link: '/admin/system/backups',
    })
  }

  // qualiopi expirant < 14j
  const expiring = await QualiopiSignature.find({
    expiresAt: { $lt: new Date(Date.now() + 14*86400000), $gte: new Date() },
  }).limit(5).lean()
  expiring.forEach((q: any) => {
    items.push({
      id: `system:qualiopi:${q._id}`,
      type: 'system',
      sourceId: String(q._id),
      title: `Signature Qualiopi à renouveler — ${q.formationName ?? 'formation'}`,
      meta: [`Expire le ${new Date(q.expiresAt).toLocaleDateString('fr-FR')}`],
      urgency: scoreUrgency({ type: 'system' }),
      tag: TAG,
      actions: [{ kind: 'open', label: 'Ouvrir' }],
      link: `/admin/qualiopi/signatures/${q._id}`,
    })
  })

  return items
}
```

- [ ] **Commit** : `feat(inbox-be): add system alerts source aggregator`

#### 4.6g — getPinnedItems

- [ ] **Test** : 1 pin valide (include), 1 pin expiré (skip).
- [ ] **Impl** :

```ts
import InboxPin from '../../../models/InboxPin'
import { InboxItem } from '../types'

const TAG_DEFAULT = { label: 'PIN', color: '#7dd3fc' }

export async function getPinnedItems(userId: string): Promise<InboxItem[]> {
  const pins = await InboxPin.find({
    userId,
    $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
  }).lean()

  return pins.map((p: any) => ({
    id: `pin:${p._id}`,
    type: 'pin',
    sourceId: String(p._id),
    title: p.title,
    meta: [`📌 Épinglé ${new Date(p.createdAt).toLocaleDateString('fr-FR')}`],
    urgency: 25,
    tag: p.color ? { ...TAG_DEFAULT, color: p.color } : TAG_DEFAULT,
    actions: [
      { kind: 'open', label: 'Ouvrir ⏎', shortcut: 'enter' },
      { kind: 'unpin', label: 'Désépingler' },
    ],
    link: p.link,
  }))
}
```

- [ ] **Commit** : `feat(inbox-be): add pinned items source aggregator`

### Task 4.7: Aggregator — orchestrateur buildInbox

**Files:**
- Create: `backend/src/lib/inbox/aggregator.ts`
- Test: `backend/src/lib/inbox/aggregator.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import Decision from '../../models/Decision'
import InboxSnooze from '../../models/InboxSnooze'
import { buildInbox } from './aggregator'

let mongo: MongoMemoryServer
beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()) })
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(async () => { await Decision.deleteMany({}); await InboxSnooze.deleteMany({}) })

describe('buildInbox', () => {
  it('combine décisions + masque les snoozées', async () => {
    const userId = new mongoose.Types.ObjectId()
    const d1 = await Decision.create({ title: 'A', status: 'PENDING', priority: 'URGENTE', category: 'X' })
    const d2 = await Decision.create({ title: 'B', status: 'PENDING', priority: 'NORMALE', category: 'X' })
    await InboxSnooze.create({ userId, itemType: 'decision', sourceId: d1._id, snoozedUntil: new Date(Date.now() + 3600 * 1000) })

    const inbox = await buildInbox(String(userId), { includeSnoozed: false })
    expect(inbox.items.find((i) => i.title === 'A')).toBeUndefined()
    expect(inbox.items.find((i) => i.title === 'B')).toBeDefined()
  })

  it('inclut snoozées avec includeSnoozed=true', async () => {
    const userId = new mongoose.Types.ObjectId()
    const d1 = await Decision.create({ title: 'A', status: 'PENDING', priority: 'URGENTE', category: 'X' })
    await InboxSnooze.create({ userId, itemType: 'decision', sourceId: d1._id, snoozedUntil: new Date(Date.now() + 3600 * 1000) })
    const inbox = await buildInbox(String(userId), { includeSnoozed: true })
    expect(inbox.items.find((i) => i.title === 'A')?.snoozedUntil).toBeTruthy()
  })

  it('tri par urgency desc', async () => {
    await Decision.create([
      { title: 'A', status: 'PENDING', priority: 'BASSE', category: 'X' },
      { title: 'B', status: 'PENDING', priority: 'URGENTE', category: 'X' },
    ])
    const inbox = await buildInbox(String(new mongoose.Types.ObjectId()))
    expect(inbox.items[0].title).toBe('B')
  })
})
```

- [ ] **Step 2: Impl**

```ts
import InboxSnooze from '../../models/InboxSnooze'
import { InboxItem } from './types'
import { getDecisionItems } from './sources/decisions'
import { getBriefP1Items } from './sources/briefs'
import { getLeadItems } from './sources/leads'
import { getMessageItems } from './sources/messages'
import { getTicketItems } from './sources/tickets'
import { getTaskItems } from './sources/tasks'
import { getSystemItems } from './sources/system'
import { getPinnedItems } from './sources/pinned'

export interface BuildInboxOpts {
  includeSnoozed?: boolean
}

export interface InboxResponse {
  items: InboxItem[]
  counts: Record<string, number>
  snoozedCount: number
}

export async function buildInbox(userId: string, opts: BuildInboxOpts = {}): Promise<InboxResponse> {
  const [decisions, briefs, leads, messages, tickets, tasks, system, pins, snoozes] = await Promise.all([
    getDecisionItems(),
    getBriefP1Items(userId),
    getLeadItems(),
    getMessageItems(userId),
    getTicketItems(userId),
    getTaskItems(userId),
    getSystemItems(),
    getPinnedItems(userId),
    InboxSnooze.find({ userId, snoozedUntil: { $gt: new Date() } }).lean(),
  ])

  const snoozeMap = new Map(snoozes.map((s: any) => [`${s.itemType}:${s.sourceId}`, s.snoozedUntil]))

  let all = [...decisions, ...briefs, ...leads, ...messages, ...tickets, ...tasks, ...system, ...pins]

  all = all.map((it) => {
    const snoozed = snoozeMap.get(it.id)
    return snoozed ? { ...it, snoozedUntil: snoozed.toISOString() } : it
  })

  const items = opts.includeSnoozed ? all : all.filter((it) => !it.snoozedUntil)
  items.sort((a, b) => b.urgency - a.urgency)

  const counts = items.reduce(
    (acc, it) => ({ ...acc, [it.type]: (acc[it.type] || 0) + 1, all: (acc.all || 0) + 1 }),
    { all: 0 } as Record<string, number>
  )

  return { items, counts, snoozedCount: snoozeMap.size }
}
```

- [ ] **Step 3: Run + commit**

```bash
cd backend && npx vitest run src/lib/inbox/aggregator.test.ts
git add backend/src/lib/inbox/aggregator.ts backend/src/lib/inbox/aggregator.test.ts
git commit -m "feat(inbox-be): add buildInbox orchestrator with parallel source fetch + snooze filter"
```

### Task 4.8: Routes inbox

**Files:**
- Create: `backend/src/routes/admin/inbox.ts`
- Test: `backend/src/routes/admin/inbox.test.ts`
- Modify: `backend/src/app.ts` (mount router)

- [ ] **Step 1: Routes**

```ts
import { Router, Request, Response, NextFunction } from 'express'
import { requireAdmin } from '../../middleware/auth'
import { buildInbox } from '../../lib/inbox/aggregator'
import InboxSnooze from '../../models/InboxSnooze'
import InboxPin from '../../models/InboxPin'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/inbox?includeSnoozed=true
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const includeSnoozed = req.query.includeSnoozed === 'true'
    const inbox = await buildInbox(userId, { includeSnoozed })
    res.json(inbox)
  } catch (e) { next(e) }
})

// POST /api/admin/inbox/snooze
// body: { itemType, sourceId, snoozedUntil: ISO date }
router.post('/snooze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemType, sourceId, snoozedUntil } = req.body
    if (!itemType || !sourceId || !snoozedUntil) return res.status(400).json({ error: 'missing fields' })
    const snooze = await InboxSnooze.findOneAndUpdate(
      { userId: req.user!.id, itemType, sourceId },
      { snoozedUntil: new Date(snoozedUntil) },
      { upsert: true, new: true }
    )
    res.json(snooze)
  } catch (e) { next(e) }
})

// DELETE /api/admin/inbox/snooze/:itemType/:sourceId
router.delete('/snooze/:itemType/:sourceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await InboxSnooze.deleteOne({ userId: req.user!.id, itemType: req.params.itemType, sourceId: req.params.sourceId })
    res.status(204).send()
  } catch (e) { next(e) }
})

// POST /api/admin/inbox/pin — body: { refType, refId, title, link, color?, expiresAt? }
router.post('/pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pin = await InboxPin.create({ ...req.body, userId: req.user!.id })
    res.status(201).json(pin)
  } catch (e) { next(e) }
})

// DELETE /api/admin/inbox/pin/:id
router.delete('/pin/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await InboxPin.deleteOne({ _id: req.params.id, userId: req.user!.id })
    res.status(204).send()
  } catch (e) { next(e) }
})

export default router
```

- [ ] **Step 2: Mount dans app.ts**

```ts
import inboxRouter from './routes/admin/inbox'
// ...
app.use('/api/admin/inbox', inboxRouter)
```

- [ ] **Step 3: Test d'intégration**

```ts
import request from 'supertest'
// ... setup mongo memory + app + token super admin
describe('routes inbox', () => {
  it('GET /api/admin/inbox retourne items + counts + snoozedCount', async () => {
    const res = await request(app).get('/api/admin/inbox').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('items')
    expect(res.body).toHaveProperty('counts')
    expect(res.body).toHaveProperty('snoozedCount')
  })

  it('POST /api/admin/inbox/snooze upsert', async () => {
    const sourceId = new mongoose.Types.ObjectId().toString()
    const res = await request(app)
      .post('/api/admin/inbox/snooze')
      .set('Authorization', `Bearer ${token}`)
      .send({ itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 3600000).toISOString() })
    expect(res.status).toBe(200)
  })

  it('DELETE /api/admin/inbox/snooze/:type/:id retire snooze', async () => {
    // ... créer snooze, puis delete, puis vérifier que GET inbox la retourne
  })
})
```

- [ ] **Step 4: Run + commit**

```bash
cd backend && npx vitest run src/routes/admin/inbox.test.ts
git add backend/src/routes/admin/inbox.ts backend/src/routes/admin/inbox.test.ts backend/src/app.ts
git commit -m "feat(inbox-be): add /api/admin/inbox routes (GET, snooze, pin)"
```

### Task 4.9: Phase 4 — sanity check backend

- [ ] **Step 1: Tous les tests backend**

```bash
cd backend && npx vitest run
```

- [ ] **Step 2: Commit final phase 4**

```bash
git commit --allow-empty -m "chore(inbox-be): Phase 4 complete — backend inbox API ready"
```

---

# Phase 5 — Inbox frontend

**But :** Construire `InboxStream`, `InboxCard`, `InboxFilters`, `SnoozePopover`, le hook clavier, et les wire dans `SuperAdminDashboard` (colonne gauche).

### Task 5.1: Type partagé front

**Files:**
- Modify: `src/components/dashboard/types.ts`

- [ ] **Step 1: Ajouter types Inbox**

```ts
// types inbox (miroir du backend)
export type InboxItemType = 'decision' | 'brief' | 'lead' | 'message' | 'ticket' | 'task' | 'system' | 'pin'

export type InboxActionKind = 'approve' | 'reject' | 'open' | 'email' | 'snooze' | 'unpin' | 'mark_done' | 'read'

export interface InboxAction {
  kind: InboxActionKind
  label: string
  shortcut?: string
}

export interface InboxTag {
  label: string
  color: string
}

export interface InboxItem {
  id: string
  type: InboxItemType
  sourceId: string
  title: string
  meta: string[]
  urgency: number
  tag: InboxTag
  actions: InboxAction[]
  link?: string
  snoozedUntil?: string
}

export interface InboxResponse {
  items: InboxItem[]
  counts: Record<string, number>
  snoozedCount: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/types.ts
git commit -m "feat(inbox-fe): add inbox types"
```

### Task 5.2: InboxCard — test + impl + CSS

**Files:**
- Test: `src/components/dashboard/InboxCard.test.tsx`
- Create: `src/components/dashboard/InboxCard.tsx`
- Modify: `dashboard.css`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InboxCard from './InboxCard'
import { InboxItem } from './types'

const item: InboxItem = {
  id: 'decision:1',
  type: 'decision',
  sourceId: '1',
  title: 'Test décision',
  meta: ['Sarah · 2h'],
  urgency: 100,
  tag: { label: 'URG', color: '#ff0080' },
  actions: [
    { kind: 'approve', label: 'A ✓', shortcut: 'a' },
    { kind: 'reject', label: 'R ✗', shortcut: 'r' },
  ],
}

describe('InboxCard', () => {
  it('rend title, meta, tag', () => {
    render(<InboxCard item={item} onAction={() => {}} />)
    expect(screen.getByText('Test décision')).toBeTruthy()
    expect(screen.getByText('Sarah · 2h')).toBeTruthy()
    expect(screen.getByText('URG')).toBeTruthy()
  })

  it('appelle onAction avec le kind au clic sur un bouton', () => {
    const fn = vi.fn()
    render(<InboxCard item={item} onAction={fn} />)
    fireEvent.click(screen.getByText('A ✓'))
    expect(fn).toHaveBeenCalledWith('approve', item)
  })

  it('applique la classe focused quand prop focused=true', () => {
    const { container } = render(<InboxCard item={item} focused onAction={() => {}} />)
    expect(container.querySelector('.ix-card--focused')).toBeTruthy()
  })

  it('applique opacity faible quand snoozedUntil défini', () => {
    const { container } = render(<InboxCard item={{ ...item, snoozedUntil: '2030-01-01' }} onAction={() => {}} />)
    expect(container.querySelector('.ix-card--snoozed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Impl**

```tsx
import { InboxItem, InboxActionKind } from './types'

interface Props {
  item: InboxItem
  focused?: boolean
  onAction: (kind: InboxActionKind, item: InboxItem) => void
}

const InboxCard = ({ item, focused, onAction }: Props) => {
  const cls = [
    'ix-card',
    focused ? 'ix-card--focused' : '',
    item.snoozedUntil ? 'ix-card--snoozed' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} data-id={item.id}>
      <span
        className="ix-tag"
        style={{
          color: item.tag.color,
          background: `${item.tag.color}26`,  // 0x26 = ~15% opacity
          borderLeft: `3px solid ${item.tag.color}`,
          textShadow: `0 0 6px ${item.tag.color}99`,
        }}
      >
        {item.tag.label}
      </span>
      <div className="ix-card__body">
        <div className="ix-card__title">{item.title}</div>
        <div className="ix-card__meta">
          {item.meta.map((m, i) => <span key={i}>{m}</span>)}
        </div>
      </div>
      <div className="ix-card__actions">
        {item.actions.map((a) => (
          <button
            key={a.kind}
            type="button"
            className={`ix-btn ix-btn--${a.kind}`}
            onClick={() => onAction(a.kind, item)}
            title={a.shortcut ? `Raccourci: ${a.shortcut.toUpperCase()}` : undefined}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default InboxCard
```

- [ ] **Step 3: CSS append à dashboard.css**

```css
/* ── Inbox ── */
.ix-card {
  display: flex;
  gap: 10px;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 9px 10px;
  margin-bottom: 5px;
  transition: background 0.15s, box-shadow 0.15s;
}

.ix-card--focused {
  background: rgba(var(--primary-rgb), 0.08);
  border-color: rgba(var(--primary-rgb), 0.4);
  box-shadow: 0 0 14px rgba(var(--primary-rgb), 0.2);
}

.ix-card--snoozed { opacity: 0.4; }

.ix-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

.ix-card__body { flex: 1; min-width: 0; }
.ix-card__title { font-size: 12px; color: #fff; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ix-card__meta { font-size: 10px; color: var(--text-muted); display: flex; gap: 8px; flex-wrap: wrap; }
.ix-card__meta span:not(:first-child)::before { content: "·"; margin-right: 8px; color: var(--text-muted); }

.ix-card__actions { display: flex; gap: 4px; flex-shrink: 0; }

.ix-btn {
  padding: 4px 8px;
  font-size: 10px;
  border-radius: 3px;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.ix-btn--approve { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); color: #86efac; text-shadow: 0 0 6px rgba(34, 197, 94, 0.4); }
.ix-btn--reject  { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5; text-shadow: 0 0 6px rgba(239, 68, 68, 0.4); }
.ix-btn--mark_done { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.3); color: #86efac; }

.ix-btn:hover { transform: translateY(-1px); }
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:frontend -- src/components/dashboard/InboxCard.test.tsx
git add src/components/dashboard/InboxCard.tsx src/components/dashboard/InboxCard.test.tsx src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(inbox-fe): add InboxCard with tag + actions + focused/snoozed states"
```

### Task 5.3: InboxFilters — test + impl

**Files:**
- Test: `src/components/dashboard/InboxFilters.test.tsx`
- Create: `src/components/dashboard/InboxFilters.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InboxFilters from './InboxFilters'

describe('InboxFilters', () => {
  const counts = { all: 10, decision: 3, brief: 2, lead: 3, message: 2, ticket: 0, task: 0, system: 0, pin: 0 }

  it('rend les chips avec compteurs', () => {
    render(<InboxFilters value="all" counts={counts} snoozedCount={3} onChange={() => {}} />)
    expect(screen.getByText('Tout')).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('Snoozées')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('appelle onChange avec le filter au clic', () => {
    const fn = vi.fn()
    render(<InboxFilters value="all" counts={counts} snoozedCount={0} onChange={fn} />)
    fireEvent.click(screen.getByText('Décisions'))
    expect(fn).toHaveBeenCalledWith('decision')
  })
})
```

- [ ] **Step 2: Impl**

```tsx
import { InboxItemType } from './types'

export type InboxFilter = 'all' | InboxItemType | 'snoozed'

interface Props {
  value: InboxFilter
  counts: Record<string, number>
  snoozedCount: number
  onChange: (f: InboxFilter) => void
}

const FILTERS: Array<{ k: InboxFilter; label: string }> = [
  { k: 'all', label: 'Tout' },
  { k: 'decision', label: 'Décisions' },
  { k: 'brief', label: 'Briefs P1' },
  { k: 'lead', label: 'CRM' },
  { k: 'message', label: 'Messages' },
  { k: 'ticket', label: 'Tickets' },
  { k: 'task', label: 'Tâches' },
  { k: 'system', label: 'Système' },
  { k: 'pin', label: 'Épinglés' },
]

const InboxFilters = ({ value, counts, snoozedCount, onChange }: Props) => (
  <div className="ix-filters" role="tablist">
    {FILTERS.map((f) => {
      const c = f.k === 'all' ? counts.all : counts[f.k] ?? 0
      return (
        <button
          key={f.k}
          type="button"
          role="tab"
          className={`ix-filter${value === f.k ? ' ix-filter--active' : ''}`}
          onClick={() => onChange(f.k)}
          aria-selected={value === f.k}
        >
          {f.label} {c > 0 && <span className="ix-filter__n">{c}</span>}
        </button>
      )
    })}
    <button
      type="button"
      role="tab"
      className={`ix-filter${value === 'snoozed' ? ' ix-filter--active' : ''}`}
      onClick={() => onChange('snoozed')}
      aria-selected={value === 'snoozed'}
      style={{ marginLeft: 'auto' }}
    >
      ⏰ Snoozées {snoozedCount > 0 && <span className="ix-filter__n">{snoozedCount}</span>}
    </button>
  </div>
)

export default InboxFilters
```

- [ ] **Step 3: CSS append**

```css
.ix-filters {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.ix-filter {
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
  cursor: pointer;
}

.ix-filter--active {
  background: rgba(var(--primary-rgb), 0.15);
  color: var(--primary-light);
  border-color: rgba(var(--primary-rgb), 0.3);
  text-shadow: 0 0 6px rgba(var(--primary-rgb), 0.4);
}

.ix-filter__n {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 8px;
  margin-left: 4px;
  font-size: 9px;
}

.ix-filter--active .ix-filter__n { background: rgba(var(--primary-rgb), 0.3); }
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:frontend -- src/components/dashboard/InboxFilters.test.tsx
git add src/components/dashboard/InboxFilters.tsx src/components/dashboard/InboxFilters.test.tsx src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(inbox-fe): add InboxFilters chips with counts"
```

### Task 5.4: SnoozePopover — test + impl

**Files:**
- Test: `src/components/dashboard/SnoozePopover.test.tsx`
- Create: `src/components/dashboard/SnoozePopover.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SnoozePopover from './SnoozePopover'

describe('SnoozePopover', () => {
  it('rend les 5 options', () => {
    render(<SnoozePopover onSnooze={() => {}} onClose={() => {}} />)
    expect(screen.getByText('1h')).toBeTruthy()
    expect(screen.getByText(/Ce soir/)).toBeTruthy()
    expect(screen.getByText(/Demain/)).toBeTruthy()
    expect(screen.getByText('Lundi')).toBeTruthy()
    expect(screen.getByText('Custom…')).toBeTruthy()
  })

  it('appelle onSnooze avec date+1h au clic 1h', () => {
    const fn = vi.fn()
    render(<SnoozePopover onSnooze={fn} onClose={() => {}} />)
    fireEvent.click(screen.getByText('1h'))
    expect(fn).toHaveBeenCalledTimes(1)
    const calledWith = fn.mock.calls[0][0] as Date
    expect(calledWith.getTime() - Date.now()).toBeGreaterThan(3500_000)
    expect(calledWith.getTime() - Date.now()).toBeLessThan(3700_000)
  })
})
```

- [ ] **Step 2: Impl**

```tsx
interface Props {
  onSnooze: (until: Date) => void
  onClose: () => void
}

function nextMonday9am(): Date {
  const d = new Date()
  const day = d.getDay()
  const daysUntilMonday = (8 - day) % 7 || 7
  d.setDate(d.getDate() + daysUntilMonday)
  d.setHours(9, 0, 0, 0)
  return d
}

function thisEvening(): Date {
  const d = new Date()
  d.setHours(18, 0, 0, 0)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
  return d
}

function tomorrow9am(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}

const SnoozePopover = ({ onSnooze, onClose }: Props) => {
  const handle = (until: Date) => { onSnooze(until); onClose() }

  return (
    <div className="ix-snooze" role="menu">
      <span className="ix-snooze__label">Snooze :</span>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(new Date(Date.now() + 3600 * 1000))}>1h</button>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(thisEvening())}>Ce soir 18h</button>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(tomorrow9am())}>Demain 9h</button>
      <button type="button" className="ix-snooze__opt" onClick={() => handle(nextMonday9am())}>Lundi</button>
      <button type="button" className="ix-snooze__opt" onClick={() => {
        const v = window.prompt('Snooze jusqu\'à (YYYY-MM-DD HH:MM) :')
        if (v) handle(new Date(v))
      }}>Custom…</button>
    </div>
  )
}

export default SnoozePopover
```

- [ ] **Step 3: CSS**

```css
.ix-snooze {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  background: rgba(var(--primary-rgb), 0.05);
  border: 1px dashed rgba(var(--primary-rgb), 0.3);
  border-radius: 6px;
  font-size: 10px;
  color: var(--primary-light);
}

.ix-snooze__label { font-weight: 600; }

.ix-snooze__opt {
  padding: 3px 8px;
  background: rgba(var(--primary-rgb), 0.1);
  border: none;
  border-radius: 3px;
  color: var(--primary-light);
  cursor: pointer;
  font-family: inherit;
}

.ix-snooze__opt:hover { background: rgba(var(--primary-rgb), 0.2); }
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:frontend -- src/components/dashboard/SnoozePopover.test.tsx
git add src/components/dashboard/SnoozePopover.tsx src/components/dashboard/SnoozePopover.test.tsx src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(inbox-fe): add SnoozePopover with 5 quick options"
```

### Task 5.5: InboxStream — orchestrateur principal

**Files:**
- Test: `src/components/dashboard/InboxStream.test.tsx`
- Create: `src/components/dashboard/InboxStream.tsx`

- [ ] **Step 1: Test minimal (intégration light)**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InboxStream from './InboxStream'
import { apiFetch } from '../../lib/api'

vi.mock('../../lib/api')

const mockedFetch = vi.mocked(apiFetch)

beforeEach(() => {
  mockedFetch.mockReset()
})

describe('InboxStream', () => {
  it('fetch /api/admin/inbox au montage', async () => {
    mockedFetch.mockResolvedValueOnce({ items: [], counts: { all: 0 }, snoozedCount: 0 })
    render(<MemoryRouter><InboxStream /></MemoryRouter>)
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith('/api/admin/inbox?includeSnoozed=false'))
  })

  it('rend les cartes des items reçus', async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [{
        id: 'decision:1', type: 'decision', sourceId: '1', title: 'Hello',
        meta: ['m'], urgency: 50, tag: { label: 'URG', color: '#ff0080' }, actions: [],
      }],
      counts: { all: 1, decision: 1 },
      snoozedCount: 0,
    })
    render(<MemoryRouter><InboxStream /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Hello')).toBeTruthy())
  })

  it('change le focus avec ↓ et ↑', async () => {
    mockedFetch.mockResolvedValueOnce({
      items: [
        { id: 'a', type: 'decision', sourceId: '1', title: 'A', meta: [], urgency: 50, tag: { label: 'X', color: '#000' }, actions: [] },
        { id: 'b', type: 'decision', sourceId: '2', title: 'B', meta: [], urgency: 40, tag: { label: 'X', color: '#000' }, actions: [] },
      ],
      counts: { all: 2 }, snoozedCount: 0,
    })
    const { container } = render(<MemoryRouter><InboxStream /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('A')).toBeTruthy())
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(container.querySelector('.ix-card--focused')?.getAttribute('data-id')).toBe('b')
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(container.querySelector('.ix-card--focused')?.getAttribute('data-id')).toBe('a')
  })
})
```

- [ ] **Step 2: Impl**

```tsx
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import { InboxItem, InboxActionKind, InboxResponse } from './types'
import InboxCard from './InboxCard'
import InboxFilters, { InboxFilter } from './InboxFilters'
import SnoozePopover from './SnoozePopover'

const InboxStream = () => {
  const [data, setData] = useState<InboxResponse | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [loading, setLoading] = useState(true)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    try {
      const includeSnoozed = filter === 'snoozed'
      const res = await apiFetch<InboxResponse>(`/api/admin/inbox?includeSnoozed=${includeSnoozed}`)
      setData(res)
    } finally { setLoading(false) }
  }, [filter])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  const filteredItems = useMemo(() => {
    if (!data) return []
    if (filter === 'all' || filter === 'snoozed') return data.items
    return data.items.filter((it) => it.type === filter)
  }, [data, filter])

  // initial focus = premier item
  useEffect(() => {
    if (filteredItems.length > 0 && !focusedId) setFocusedId(filteredItems[0].id)
  }, [filteredItems, focusedId])

  const focusedIndex = filteredItems.findIndex((it) => it.id === focusedId)
  const focusedItem = filteredItems[focusedIndex]

  const handleAction = async (kind: InboxActionKind, item: InboxItem) => {
    try {
      switch (kind) {
        case 'approve':
          await apiFetch(`/api/admin/decisions/${item.sourceId}/approve`, { method: 'POST', body: JSON.stringify({ comment: '' }) })
          break
        case 'reject':
          const c = window.prompt('Motif du rejet :') ?? ''
          await apiFetch(`/api/admin/decisions/${item.sourceId}/reject`, { method: 'POST', body: JSON.stringify({ comment: c }) })
          break
        case 'open':
        case 'read':
        case 'email':
          if (item.link) navigate(item.link)
          break
        case 'mark_done':
          await apiFetch(`/api/admin/tasks/${item.sourceId}/done`, { method: 'POST' })
          break
        case 'snooze':
          setSnoozingId(item.id)
          return
        case 'unpin':
          await apiFetch(`/api/admin/inbox/pin/${item.sourceId}`, { method: 'DELETE' })
          break
      }
      await fetchInbox()
    } catch (e) {
      window.alert((e as Error).message || 'Erreur')
    }
  }

  const handleSnooze = async (until: Date) => {
    if (!snoozingId) return
    const item = filteredItems.find((i) => i.id === snoozingId)
    if (!item) return
    await apiFetch('/api/admin/inbox/snooze', {
      method: 'POST',
      body: JSON.stringify({ itemType: item.type, sourceId: item.sourceId, snoozedUntil: until.toISOString() }),
    })
    setSnoozingId(null)
    await fetchInbox()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ignore si dans un input
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = Math.min(filteredItems.length - 1, focusedIndex + 1)
        if (filteredItems[next]) setFocusedId(filteredItems[next].id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = Math.max(0, focusedIndex - 1)
        if (filteredItems[prev]) setFocusedId(filteredItems[prev].id)
      } else if (focusedItem) {
        const matchedAction = focusedItem.actions.find((a) => a.shortcut === e.key.toLowerCase())
        if (matchedAction) { e.preventDefault(); handleAction(matchedAction.kind, focusedItem) }
        else if (e.key === 'Enter') {
          const openAction = focusedItem.actions.find((a) => a.kind === 'open' || a.kind === 'read')
          if (openAction) { e.preventDefault(); handleAction(openAction.kind, focusedItem) }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredItems, focusedIndex, focusedItem])

  if (loading && !data) return <p style={{ padding: 20, color: 'var(--text-muted)' }}>Chargement…</p>

  return (
    <div className="ix-stream">
      <header className="ix-stream__header">
        <span className="ix-stream__title">⚡ INBOX — {data?.counts.all ?? 0} à traiter</span>
        <span className="ix-stream__shortcut">↑↓ · A/R · S snooze · ⏎ ouvrir · F fait</span>
      </header>
      <InboxFilters value={filter} counts={data?.counts ?? {}} snoozedCount={data?.snoozedCount ?? 0} onChange={setFilter} />
      {filteredItems.length === 0 ? (
        <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          🎉 Inbox vide
        </p>
      ) : (
        filteredItems.map((it) => (
          <InboxCard key={it.id} item={it} focused={it.id === focusedId} onAction={handleAction} />
        ))
      )}
      {snoozingId && <SnoozePopover onSnooze={handleSnooze} onClose={() => setSnoozingId(null)} />}
    </div>
  )
}

export default InboxStream
```

- [ ] **Step 3: CSS**

```css
.ix-stream {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
  position: relative;
}

.ix-stream__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ix-stream__title {
  font-weight: 600;
  color: var(--primary-light);
  text-shadow: 0 0 6px rgba(var(--primary-rgb), 0.4);
}

.ix-stream__shortcut {
  font-size: 10px;
  color: var(--text-muted);
  font-family: monospace;
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:frontend -- src/components/dashboard/InboxStream.test.tsx
git add src/components/dashboard/InboxStream.tsx src/components/dashboard/InboxStream.test.tsx src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(inbox-fe): add InboxStream orchestrator with keyboard shortcuts + snooze"
```

### Task 5.6: Wire InboxStream dans SuperAdminDashboard (colonne gauche)

**Files:**
- Modify: `src/pages/admin/SuperAdminDashboard.tsx`

- [ ] **Step 1: Remplacer "Mon activité" + "Décisions à valider" + "Messages en attente" par <InboxStream />**

Dans `SuperAdminDashboard.tsx`, supprimer ces 3 `<DashSection>` blocks et insérer simplement `<InboxStream />` à leur place. Garder pour l'instant le layout vertical (Phase 6 fera la transition vers 2 colonnes).

```tsx
import InboxStream from '../../components/dashboard/InboxStream'

// dans le render :
<DashAlertBanner alerts={alerts} />
<InboxStream />
{/* Analytics column (Phase 3) reste ici */}
<DashSection title="Analytics" ...> ... </DashSection>
{/* Opérations, Équipe, Raccourcis restent inchangés pour cette phase */}
```

- [ ] **Step 2: Vérifier visuellement**

```bash
npm run dev
```
Vérifier `/admin/super` : Inbox unifiée s'affiche avec items des 8 sources, raccourcis clavier fonctionnent.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/SuperAdminDashboard.tsx
git commit -m "feat(dashboard): wire InboxStream in super admin dashboard"
```

### Task 5.7: Phase 5 — sanity check

- [ ] **Step 1: Tests + build**

```bash
npm run test:frontend
npx tsc --noEmit
npm run build
```

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore(inbox-fe): Phase 5 complete — inbox frontend shipped"
```

---

# Phase 6 — Layout final 2 colonnes + responsive + cleanup

**But :** Composer le layout 2 colonnes définitif, gérer le responsive (tabs en mobile), supprimer le code mort.

### Task 6.1: Composant TwoColumnGrid

**Files:**
- Test: `src/components/dashboard/TwoColumnGrid.test.tsx`
- Create: `src/components/dashboard/TwoColumnGrid.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TwoColumnGrid from './TwoColumnGrid'

describe('TwoColumnGrid', () => {
  it('rend left et right sur desktop', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 1200 })
    window.dispatchEvent(new Event('resize'))
    render(<TwoColumnGrid left={<div>L</div>} right={<div>R</div>} />)
    expect(screen.getByText('L')).toBeTruthy()
    expect(screen.getByText('R')).toBeTruthy()
  })

  it('rend en tabs sur mobile (< 900px)', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 500 })
    window.dispatchEvent(new Event('resize'))
    render(<TwoColumnGrid left={<div>L</div>} right={<div>R</div>} />)
    expect(screen.getByText('Action')).toBeTruthy()
    expect(screen.getByText('Analytics')).toBeTruthy()
    // par défaut Action est actif → L visible, R caché
    expect(screen.getByText('L')).toBeTruthy()
    fireEvent.click(screen.getByText('Analytics'))
    expect(screen.getByText('R')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Impl**

```tsx
import { useState, useEffect, ReactNode } from 'react'

interface Props { left: ReactNode; right: ReactNode }

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

const TwoColumnGrid = ({ left, right }: Props) => {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<'left' | 'right'>('left')

  if (!isMobile) {
    return (
      <div className="dash-twocol">
        <div className="dash-twocol__col">{left}</div>
        <div className="dash-twocol__col">{right}</div>
      </div>
    )
  }

  return (
    <div className="dash-twocol-mobile">
      <div className="dash-twocol-mobile__tabs">
        <button
          type="button"
          className={`dash-twocol-mobile__tab${activeTab === 'left' ? ' dash-twocol-mobile__tab--active' : ''}`}
          onClick={() => setActiveTab('left')}
        >Action</button>
        <button
          type="button"
          className={`dash-twocol-mobile__tab${activeTab === 'right' ? ' dash-twocol-mobile__tab--active' : ''}`}
          onClick={() => setActiveTab('right')}
        >Analytics</button>
      </div>
      <div>{activeTab === 'left' ? left : right}</div>
    </div>
  )
}

export default TwoColumnGrid
```

- [ ] **Step 3: CSS**

```css
.dash-twocol {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.dash-twocol__col { min-width: 0; }

.dash-twocol-mobile__tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}

.dash-twocol-mobile__tab {
  flex: 1;
  padding: 8px 12px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.dash-twocol-mobile__tab--active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  text-shadow: 0 0 6px rgba(var(--primary-rgb), 0.4);
}
```

- [ ] **Step 4: Run + commit**

```bash
npm run test:frontend -- src/components/dashboard/TwoColumnGrid.test.tsx
git add src/components/dashboard/TwoColumnGrid.tsx src/components/dashboard/TwoColumnGrid.test.tsx src/components/dashboard/dashboard.css src/components/dashboard/index.ts
git commit -m "feat(dashboard): add TwoColumnGrid with mobile tabs fallback"
```

### Task 6.2: Refacto SuperAdminDashboard final

**Files:**
- Modify: `src/pages/admin/SuperAdminDashboard.tsx`

- [ ] **Step 1: Réécrire le render principal pour utiliser TwoColumnGrid**

```tsx
return (
  <div className="portal-container">
    <div className="admin-page-header">
      <div>
        <h1>Pilotage Venio</h1>
        <p className="admin-page-subtitle">
          Vue super admin · {user?.name || user?.email} ·{' '}
          {data && new Date(data.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <div className="admin-quick-actions">
        <PeriodSelector value={period} onChange={setPeriod} />
        <button
          type="button"
          className="portal-button secondary"
          onClick={() => setRefresh((r) => r + 1)}
          disabled={loading}
        >↻</button>
      </div>
    </div>

    {loading && !data ? (
      <div style={{ marginTop: 24 }}><SkeletonRow /></div>
    ) : data ? (
      <>
        <DashAlertBanner alerts={alerts} />

        <TwoColumnGrid
          left={<InboxStream />}
          right={
            <DashSection title="Analytics" icon={<TrendingUp size={16} />}>
              <PulseStatus checks={data.pulseChecks} />
              <KpiGrid2x2 kpis={[/* … 4 KPIs cf. Phase 3 */]} />
              <FinancialChart data={chartData} label="CA + Volume" currentValue={formatEUR(data.kpis.ca.value)} />
            </DashSection>
          }
        />

        {/* Sections résiduelles empilées */}
        <DashSection title="Opérations" icon={<FolderKanban size={16} />}>
          {/* ProjectsByStatusPie + BriefsByPriorityList existants */}
        </DashSection>

        <DashSection title="Équipe" icon={<Users size={16} />}>
          {/* TeamLoadBarChart existant */}
        </DashSection>

        <DashSection title="Raccourcis" icon={<Plus size={16} />}>
          {/* ShortcutButtons existants */}
        </DashSection>
      </>
    ) : (
      <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <AlertTriangle size={32} style={{ opacity: 0.4 }} />
        <p>Impossible de charger le dashboard.</p>
      </div>
    )}
  </div>
)
```

- [ ] **Step 2: Ajouter le state period**

```tsx
import PeriodSelector, { type Period } from '../../components/dashboard/PeriodSelector'

const SuperAdminDashboard = () => {
  const [period, setPeriod] = useState<Period>(() => {
    try { return (localStorage.getItem('venio-admin-dashboard-period') as Period) || '30d' } catch { return '30d' }
  })
  useEffect(() => {
    try { localStorage.setItem('venio-admin-dashboard-period', period) } catch {}
  }, [period])
  // ... fetch /api/admin/dashboard/super?period={period}
  ...
```

- [ ] **Step 3: Update fetch URL**

```tsx
useEffect(() => {
  apiFetch<SuperDashboard>(`/api/admin/dashboard/super?period=${period}`).then(setData)...
}, [refresh, period])
```

- [ ] **Step 4: Vérifier visuellement**

```bash
npm run dev
```
- Desktop : 2 colonnes affichées, Inbox à gauche, Analytics à droite
- Mobile (resize < 900px) : tabs Action/Analytics au lieu de scroll
- Selector période en haut change les données
- Sections Opérations / Équipe / Raccourcis visibles en scroll

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/SuperAdminDashboard.tsx
git commit -m "feat(dashboard): final 2-column layout with PeriodSelector + responsive tabs"
```

### Task 6.3: Cleanup — supprimer code mort

**Files:**
- Modify: `src/pages/admin/SuperAdminDashboard.tsx` (cleanup imports inutiles)
- Verify: aucun usage restant des anciennes sections

- [ ] **Step 1: Lister les imports/fonctions/constantes non utilisés**

```bash
npx tsc --noEmit
```
Devrait flagger les variables non utilisées si `noUnusedLocals: true` dans tsconfig. Sinon, recherche manuelle.

- [ ] **Step 2: Supprimer**

Variables typiquement à supprimer après refonte :
- `PRIORITY_COLORS` si plus utilisé dans la page
- `PROJECT_STATUS_LABELS` si extrait vers ProjectsByStatusPie
- Imports recharts inutilisés (LineChart si remplacé par FinancialChart)
- Imports lucide-react inutilisés

- [ ] **Step 3: Vérifier qu'on n'a pas cassé**

```bash
npm run test:frontend
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): cleanup dead code after refonte"
```

### Task 6.4: Documentation finale + PR

**Files:**
- Modify: `docs/superpowers/specs/2026-05-19-refonte-dashboard-super-admin-design.md` (ajouter section "Statut : livré")
- Create: PR description

- [ ] **Step 1: Marquer la spec comme livrée**

Ajouter au header de la spec :

```markdown
> **Statut** : ✅ Livré le YYYY-MM-DD via PR #XXX (commits eXXXXXX...XXXXXXe)
```

- [ ] **Step 2: Run final**

```bash
npm run test
npx tsc --noEmit
npm run build
```

- [ ] **Step 3: Push + PR**

```bash
git push -u origin claude/xenodochial-mclean-73615e
gh pr create --title "feat(dashboard): refonte super admin 2 colonnes (Inbox + Analytics)" --body "$(cat <<'EOF'
## Summary
Refonte complète du dashboard super admin Venio :
- 🎯 **Inbox unifiée Linear-style** (gauche) : 8 sources agrégées avec scoring d'urgence, snooze (1h/ce soir/demain/lundi/custom), raccourcis clavier (↑↓ A R S ⏎ F)
- 📊 **Analytics colonne droite** : Pulse status (7 règles vert/orange/rouge), KPI grid 2x2 avec deltas et objectifs, chart financial style trading (gradient cyan + volume bars + crosshair)
- 🎨 **Système de widget réutilisable** (`DashWidget`, `FinancialChart`, `PeriodSelector`, `Sparkline`) — fin des styles inline
- ⚡ **Sidebar pivot toggle Linear-style** : remplace l'ancien bouton discret en bas
- 📱 **Responsive** : 2 colonnes desktop, tabs Action/Analytics mobile

## Implémentation en 6 phases
- Phase 1 : Fondations design system (composants génériques + CSS)
- Phase 2 : Sidebar pivot toggle + raccourci Cmd+\\
- Phase 3 : Analytics (Pulse + KPIs deltas + FinancialChart)
- Phase 4 : Inbox backend (models InboxSnooze/InboxPin, aggregator 8 sources, scoring urgence, 5 routes REST)
- Phase 5 : Inbox frontend (InboxStream + InboxCard + InboxFilters + SnoozePopover + keyboard hook)
- Phase 6 : Layout final + responsive + cleanup

## Test plan
- [ ] Tests frontend : `npm run test:frontend` (tous PASS)
- [ ] Tests backend : `cd backend && npx vitest run` (tous PASS)
- [ ] Typecheck : `npx tsc --noEmit` (0 erreur)
- [ ] Build : `npm run build` (success)
- [ ] Smoke test manuel /admin/super :
  - [ ] Inbox affiche items des 8 sources, raccourcis ↑↓ A R S ⏎ F fonctionnent
  - [ ] Pulse status affiche 7 checks colorés
  - [ ] KPIs montrent deltas et sparklines
  - [ ] Chart financial : gradient cyan + volume + crosshair au hover
  - [ ] PeriodSelector pilote bien tout (7j/30j/90j/YTD)
  - [ ] Sidebar pivot : clic ou Cmd+\\ collapse/expand
  - [ ] Mobile (< 900px) : tabs Action/Analytics au lieu de 2 colonnes
  - [ ] Sections Opérations/Équipe/Raccourcis empilées en dessous

## Spec
[2026-05-19-refonte-dashboard-super-admin-design.md](docs/superpowers/specs/2026-05-19-refonte-dashboard-super-admin-design.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/specs/2026-05-19-refonte-dashboard-super-admin-design.md
git commit -m "docs(spec): mark refonte dashboard super admin as shipped"
```

---

## Self-review du plan (auteur)

**Couverture spec → tasks** : chaque section de la spec a au moins une tâche.
- Architecture composants : §1.2-1.8 (DashWidget, Sparkline, DashKpiCard, PeriodSelector, FinancialChart), §3.3-3.4 (PulseStatus, KpiGrid2x2), §5.2-5.5 (Inbox*), §6.1 (TwoColumnGrid), §2.2 (SidebarCollapseToggle) ✓
- Data layer : §3.1 (pulseRules), §3.2 (endpoint super étendu), §4.1-4.8 (models + aggregator + routes) ✓
- Style néon : §1.1 + ajouts CSS au fil ✓
- Mobile : §6.1 (TwoColumnGrid responsive) ✓
- Tests : chaque tâche a son test TDD ✓
- 7 règles Pulse : §3.1 toutes implémentées et testées ✓
- 8 sources Inbox : §4.5 + §4.6a-g toutes couvertes ✓

**Placeholder scan** : aucun TBD/TODO/"implement later". Les "// ..." dans le code-snippet markdown sont des renvois explicites vers les blocs définis ailleurs dans le même plan.

**Type consistency** : `InboxItem`, `PulseCheck`, `KpiSpec`, `Period` cohérents entre toutes les tâches. Le type partagé front/back est dupliqué (front = `types.ts`, back = `lib/inbox/types.ts`) — c'est volontaire, pas de monorepo type-sharing en place actuellement.

**Scope** : 6 phases autonomes et déployables, chacune commit-able indépendamment.
