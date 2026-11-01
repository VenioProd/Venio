import { lazyWithRetry as lazy } from '../../../lib/lazyWithRetry'
import { useState } from 'react'
import AdminHub from './AdminHub'
import ProjectsPortfolio from '../projects-portfolio/ProjectsPortfolio'
import { useI18n } from '../../../context/I18nContext'
import { ADMIN_HUBS } from '../../../lib/adminHubs'

const GestionBoard = lazy(() => import('../GestionBoard'))
const InternalProjectList = lazy(() => import('../InternalProjectList'))
const SubsidiaryList = lazy(() => import('../SubsidiaryList'))
const TemplateList = lazy(() => import('../TemplateList'))

function ClientsPanel() {
  const { t } = useI18n()
  const [view, setView] = useState<'portfolio' | 'tasks'>('portfolio')
  return (
    <>
      <div className="pf-switch" role="group" aria-label={t('shell.hub.projets.viewAria')}>
        <button type="button" aria-pressed={view === 'portfolio'} onClick={() => setView('portfolio')}>
          {t('shell.hub.projets.viewPortfolio')}
        </button>
        <button type="button" aria-pressed={view === 'tasks'} onClick={() => setView('tasks')}>
          {t('shell.hub.projets.viewTasks')}
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
