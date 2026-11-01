import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import { useState } from 'react'
import AdminHub from './AdminHub'
import ProjectsPortfolio from '../projects-portfolio/ProjectsPortfolio'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const GestionBoard = lazy(() => import('../GestionBoard'))
const InternalProjectList = lazy(() => import('../InternalProjectList'))
const SubsidiaryList = lazy(() => import('../SubsidiaryList'))
const TemplateList = lazy(() => import('../TemplateList'))

function ClientsPanel() {
  const [view, setView] = useState<'portfolio' | 'tasks'>('portfolio')
  return (
    <>
      <div className="pf-switch" role="group" aria-label="Affichage des projets clients">
        <button type="button" aria-pressed={view === 'portfolio'} onClick={() => setView('portfolio')}>
          Portefeuille
        </button>
        <button type="button" aria-pressed={view === 'tasks'} onClick={() => setView('tasks')}>
          Tâches (tableau, kanban, Gantt)
        </button>
      </div>
      {view === 'portfolio' ? <ProjectsPortfolio /> : <GestionBoard />}
    </>
  )
}

export default function ProjetsHub() {
  return (
    <AdminHub
      definition={ADMIN_HUBS.projets}
      panels={{
        clients: <ClientsPanel />,
        internes: <InternalProjectList />,
        plateformes: <SubsidiaryList />,
        modeles: <TemplateList />,
      }}
    />
  )
}
