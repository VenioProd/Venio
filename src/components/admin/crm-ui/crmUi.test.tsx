import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  CrmBanner,
  CrmChip,
  CrmEmpty,
  CrmListRow,
  CrmMomentNav,
  CrmNowBanner,
  CrmPageHead,
  CrmPanelCard,
  CrmPropList,
  CrmSectionHead,
  CrmSidePanel,
  CrmStickyBar,
  CrmSubtabs,
  CrmWithPanel,
} from '.'

describe('composants partagés du CRM', () => {
  it('cartes de moment et sous-onglets : liens, page courante, compteur zéro conservé', () => {
    render(
      <MemoryRouter>
        <CrmMomentNav
          label="Moments"
          moments={[
            { id: 'a', label: 'Aujourd’hui', to: '/a', icon: <svg />, hint: '3 à traiter', current: true },
            { id: 'b', label: 'Suivre', to: '/b', icon: <svg /> },
          ]}
        />
        <CrmSubtabs
          label="Sections"
          tabs={[
            { id: 'x', label: 'Aujourd’hui', to: '/a', count: 0, current: true },
            { id: 'y', label: 'Comptes', to: '/a/y' },
          ]}
          extra={{ label: 'Où est quoi ?', to: '/plan' }}
        />
      </MemoryRouter>,
    )
    const moments = screen.getByRole('navigation', { name: 'Moments' })
    expect(within(moments).getByRole('link', { current: 'page' })).toHaveTextContent('3 à traiter')
    const sections = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(sections).getByRole('link', { name: 'Aujourd’hui 0' })).toHaveAttribute('aria-current', 'page')
    expect(within(sections).getByRole('link', { name: 'Comptes' })).not.toHaveAttribute('aria-current')
    expect(within(sections).getByRole('link', { name: 'Où est quoi ?' })).toHaveAttribute('href', '/plan')
  })

  it('en-têtes, ligne de liste, puces, bandeaux, barre collante et panneau de fiche', () => {
    render(
      <>
        <CrmPageHead kicker="Vendredi" title="Bonjour" lede="11 éléments" actions={<button>Démarrer</button>} />
        <CrmNowBanner
          kicker="À faire maintenant"
          title="Valider l’analyse"
          titleId="now"
          action={<a href="#a">Ouvrir</a>}
        />
        <section className="crm-ui-card crm-ui-card--flush">
          <CrmSectionHead title="En retard" count={3} tone="red" compact level={3} />
          <ul className="crm-ui-list">
            <CrmListRow
              lead="−2 j"
              title={<a href="#l">Garage Lambert</a>}
              meta="Thomas Lambert"
              chips={<CrmChip tone="red">En retard</CrmChip>}
              description="Rappeler au sujet du devis"
              actions={<button>Fait</button>}
            />
          </ul>
        </section>
        <CrmBanner tone="amber" title="Hors plage" role="status">
          Il est 19 h 30 chez lui.
        </CrmBanner>
        <CrmEmpty title="Rien à traiter">La file est vide.</CrmEmpty>
        <CrmWithPanel
          panel={
            <CrmSidePanel label="Fiche">
              <CrmPanelCard title="Fiche" id="fiche">
                <CrmPropList items={[{ label: 'Statut', value: 'Contacté' }]} />
              </CrmPanelCard>
            </CrmSidePanel>
          }
        >
          <CrmStickyBar label="Validation" actions={<button>Valider l’analyse</button>}>
            4 informations traitées
          </CrmStickyBar>
        </CrmWithPanel>
      </>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Bonjour' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Valider l’analyse' })).toHaveClass('crm-ui-now')
    expect(screen.getByRole('heading', { level: 3, name: 'En retard 3' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Garage LambertThomas LambertEn retard')
    expect(screen.getByText('En retard', { selector: '.crm-ui-chip' })).toHaveAttribute('data-tone', 'red')
    expect(screen.getByRole('status')).toHaveTextContent('Hors plage')
    expect(screen.getByRole('region', { name: 'Validation' })).toHaveClass('crm-ui-sticky-bar')
    expect(screen.getByRole('complementary', { name: 'Fiche' })).toBeInTheDocument()
    expect(screen.getByRole('definition')).toHaveTextContent('Contacté')
  })

  it('n’écrit aucun sélecteur hors de son préfixe, pour ne rien changer aux autres hubs', () => {
    const css = readFileSync(resolve(import.meta.dirname, 'crm-ui.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@media[^{]+\{/g, '{')
    const selectors = [...css.matchAll(/([^{}@]+)\{/g)]
      .map((match) => match[1].trim())
      .filter((selector) => selector && !/^(from|to|\d)/.test(selector) && !selector.startsWith('('))
    expect(selectors.length).toBeGreaterThan(50)
    for (const group of selectors)
      for (const selector of group.split(/,(?![^(]*\))/)) expect(selector, selector).toMatch(/\.crm-ui-/)
  })
})
