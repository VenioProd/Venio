import React from 'react'
import type { PublicSiteAnalyticsData } from './types'

interface PublicSiteSectionProps {
  publicSiteData: PublicSiteAnalyticsData | null
}

/** Bloc site public, repris tel quel de l'ancienne page. */
const PublicSiteSection: React.FC<PublicSiteSectionProps> = ({ publicSiteData }) => (
  <>
    {publicSiteData && (
      <section className="analytics-chart-card" style={{ marginTop: 24, overflowX: 'auto' }}>
        <h3>Site public — conversion mensuelle</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>{publicSiteData.privacy}</p>
        <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Mois</th>
              <th>Vues / objectif</th>
              <th>CTA / objectif</th>
              <th>Formulaires / objectif</th>
              <th>Taux CTA</th>
              <th>Taux formulaire</th>
            </tr>
          </thead>
          <tbody>
            {publicSiteData.months.map((month) => (
              <tr key={month.key}>
                <td>{month.label}</td>
                <td>
                  {month.pageViews} / {publicSiteData.goals.pageViews}
                </td>
                <td>
                  {month.ctaClicks} / {publicSiteData.goals.ctaClicks}
                </td>
                <td>
                  {month.contactForms} / {publicSiteData.goals.contactForms}
                </td>
                <td>{month.ctaRate}%</td>
                <td>{month.formRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    )}
  </>
)

export default PublicSiteSection
