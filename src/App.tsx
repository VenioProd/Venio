import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ToastContainer from './components/ToastContainer'
import ProtectedRoute from './components/ProtectedRoute'
import AdminShell from './components/AdminShell'
import ClientShell from './components/ClientShell'
import { ToastProvider } from './context/ToastContext'
import { NotificationProvider } from './context/NotificationContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import type { ColorAccent } from './context/ThemeContext'
import { I18nProvider } from './context/I18nContext'
import { useAuth } from './context/AuthContext'
import RequirePermission from './components/RequirePermission'
import { ADMIN_ROLES, PERMISSIONS } from './lib/permissions'
import CookieConsent from './components/CookieConsent'
import './App.css'

function ThemeSync() {
  const { user } = useAuth()
  const { setColorAccent } = useTheme()
  useEffect(() => {
    if (user?.colorTheme) setColorAccent(user.colorTheme as ColorAccent)
  }, [user?.colorTheme])
  return null
}

function DashboardByRole() {
  const { user } = useAuth()
  if (user?.role === 'SUPER_ADMIN') return <SuperAdminDashboard />
  return <AdminDashboard />
}

// Lazy-loaded: Site vitrine
const Home = lazy(() => import('./pages/Home'))
const ServicesCommunication = lazy(() => import('./pages/ServicesCommunication'))
const ServicesDeveloppement = lazy(() => import('./pages/ServicesDeveloppement'))
const ServicesConseil = lazy(() => import('./pages/ServicesConseil'))
const PolesPage = lazy(() => import('./pages/PolesPage'))
const Realisations = lazy(() => import('./pages/Realisations'))
const APropos = lazy(() => import('./pages/APropos'))
const Contact = lazy(() => import('./pages/Contact'))
const Legal = lazy(() => import('./pages/Legal'))
const CGU = lazy(() => import('./pages/CGU'))
const CGV = lazy(() => import('./pages/CGV'))
const Confidentialite = lazy(() => import('./pages/Confidentialite'))
const PublicQuestionnaire = lazy(() => import('./pages/PublicQuestionnaire'))
const PublicQuestionnaireBuilder = lazy(() => import('./pages/PublicQuestionnaireBuilder'))

// Lazy-loaded: Espace client
const ClientLogin = lazy(() => import('./pages/espace-client/Login'))
const ClientDashboard = lazy(() => import('./pages/espace-client/Dashboard'))
const ClientProjectDetail = lazy(() => import('./pages/espace-client/ProjectDetail'))
const ClientProfile = lazy(() => import('./pages/espace-client/Profile'))

// Lazy-loaded: Admin
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const SuperAdminDashboard = lazy(() => import('./pages/admin/SuperAdminDashboard'))
const ClientAccountList = lazy(() => import('./pages/admin/ClientAccountList'))
const ClientAccountNew = lazy(() => import('./pages/admin/ClientAccountNew'))
const ClientAccountDetail = lazy(() => import('./pages/admin/client-detail'))
const AdminList = lazy(() => import('./pages/admin/AdminList'))
const AdminNew = lazy(() => import('./pages/admin/AdminNew'))
const AdminEdit = lazy(() => import('./pages/admin/AdminEdit'))
const ProjectForm = lazy(() => import('./pages/admin/project-form'))
const AdminProjectDetail = lazy(() => import('./pages/admin/ProjectDetail'))
const CrmBoard = lazy(() => import('./pages/admin/CrmBoard'))
const CrmSettings = lazy(() => import('./pages/admin/crm-settings'))
const TemplateList = lazy(() => import('./pages/admin/TemplateList'))
const Analytics = lazy(() => import('./pages/admin/Analytics'))
const Calendar = lazy(() => import('./pages/admin/Calendar'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog'))
const AdminProfile = lazy(() => import('./pages/admin/AdminProfile'))
const QualiopiBoard = lazy(() => import('./pages/admin/QualiopiBoard'))
const TicketList = lazy(() => import('./pages/admin/TicketList'))
const GestionBoard = lazy(() => import('./pages/admin/GestionBoard'))
const ToolAccessList = lazy(() => import('./pages/admin/ToolAccessList'))
const Messaging = lazy(() => import('./pages/admin/Messaging'))
const AdminGuide = lazy(() => import('./pages/admin/AdminGuide'))
const ClientGuide = lazy(() => import('./pages/espace-client/ClientGuide'))
const InternList = lazy(() => import('./pages/admin/InternList'))
const InternDetail = lazy(() => import('./pages/admin/InternDetail'))
const MyReports = lazy(() => import('./pages/admin/MyReports'))
const EmailComposer = lazy(() => import('./pages/admin/EmailComposer'))
const DecisionsList = lazy(() => import('./pages/admin/DecisionsList'))
const SearchModal = lazy(() => import('./components/admin/SearchModal'))
const InternalProjectList = lazy(() => import('./pages/admin/InternalProjectList'))
const InternalProjectDetail = lazy(() => import('./pages/admin/InternalProjectDetail'))
const Resources = lazy(() => import('./pages/admin/Resources'))
const ArrowProspection = lazy(() => import('./pages/admin/ArrowProspection'))
const AgentTokensList = lazy(() => import('./pages/admin/AgentTokensList'))
const DevWorkspace = lazy(() => import('./pages/admin/dev-workspace'))
const SystemHealth = lazy(() => import('./pages/admin/SystemHealth'))
const ActivityCenter = lazy(() => import('./pages/admin/ActivityCenter'))

// Lazy-loaded: Comptabilité (sous-section admin)
const AccountingDashboard = lazy(() => import('./pages/admin/accounting/AccountingDashboard'))
const AccountingSettings = lazy(() => import('./pages/admin/accounting/Settings'))
const ChartOfAccounts = lazy(() => import('./pages/admin/accounting/ChartOfAccounts'))
const AccountingJournals = lazy(() => import('./pages/admin/accounting/Journals'))
const AccountingEntries = lazy(() => import('./pages/admin/accounting/Entries'))
const AccountingEntryForm = lazy(() => import('./pages/admin/accounting/EntryForm'))
const AccountingEntryDetail = lazy(() => import('./pages/admin/accounting/EntryDetail'))
const GeneralLedger = lazy(() => import('./pages/admin/accounting/GeneralLedger'))
const TrialBalance = lazy(() => import('./pages/admin/accounting/TrialBalance'))
const BalanceSheet = lazy(() => import('./pages/admin/accounting/BalanceSheet'))
const IncomeStatement = lazy(() => import('./pages/admin/accounting/IncomeStatement'))
const VatDeclarations = lazy(() => import('./pages/admin/accounting/VatDeclarations'))
const VatDeclarationDetail = lazy(() => import('./pages/admin/accounting/VatDeclarationDetail'))
const FecExport = lazy(() => import('./pages/admin/accounting/FecExport'))
const Lettrage = lazy(() => import('./pages/admin/accounting/Lettrage'))
const ExternalSources = lazy(() => import('./pages/admin/accounting/ExternalSources'))
const ExternalSourceDetail = lazy(() => import('./pages/admin/accounting/ExternalSourceDetail'))
const DraftQueue = lazy(() => import('./pages/admin/accounting/DraftQueue'))
const AccountingAuditLog = lazy(() => import('./pages/admin/accounting/AccountingAuditLog'))

function ProjectsRedirect() {
  const { id } = useParams()
  const location = useLocation()
  return <Navigate to={`/admin/projets/${id}${location.search}`} replace />
}

function App() {
  const location = useLocation()
  const isPublicQuestionnaire = location.pathname.startsWith('/questionnaire/')
  const isAdminArea = location.pathname.startsWith('/admin') && location.pathname !== '/admin/login'
  const isPortal = location.pathname.startsWith('/admin') || location.pathname.startsWith('/espace-client')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    document.body.classList.add('gpu-off')
    localStorage.setItem('gpu-mode', 'false')
    return () => {
      document.body.classList.remove('gpu-off')
    }
  }, [])

  return (
    <I18nProvider>
    <ThemeProvider>
    <ThemeSync />
    <NotificationProvider>
    <ToastProvider>
      {!isPublicQuestionnaire && !isPortal && <Navbar />}
      <Suspense fallback={null}>
      <Routes>
        {/* Site vitrine */}
        <Route path="/" element={<Home />} />
        <Route path="/services/communication" element={<ServicesCommunication />} />
        <Route path="/services/developpement" element={<ServicesDeveloppement />} />
        <Route path="/services/conseil" element={<ServicesConseil />} />
        <Route path="/poles" element={<PolesPage />} />
        <Route path="/realisations" element={<Realisations />} />
        <Route path="/a-propos" element={<APropos />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/cgu" element={<CGU />} />
        <Route path="/cgv" element={<CGV />} />
        <Route path="/confidentialite" element={<Confidentialite />} />
        <Route path="/questionnaire/creer/:token" element={<PublicQuestionnaireBuilder />} />
        <Route path="/questionnaire/:token" element={<PublicQuestionnaire />} />

        {/* Espace client */}
        <Route path="/espace-client/login" element={<ClientLogin />} />
        <Route
          path="/espace-client"
          element={
            <ProtectedRoute role="CLIENT" redirectTo="/espace-client/login">
              <ClientShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<ClientDashboard />} />
          <Route path="guide" element={<ClientGuide />} />
          <Route path="profil" element={<ClientProfile />} />
          <Route path="projets/:id" element={<ClientProjectDetail />} />
        </Route>

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <AdminShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardByRole />} />
          <Route path="decisions" element={<DecisionsList />} />
          <Route path="mon-espace" element={<AdminDashboard />} />
          <Route path="profil" element={<AdminProfile />} />

          {/* Clients */}
          <Route
            path="comptes-clients"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountList />
              </RequirePermission>
            }
          />
          <Route
            path="comptes-clients/nouveau"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountNew />
              </RequirePermission>
            }
          />
          <Route
            path="comptes-clients/:userId"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountDetail />
              </RequirePermission>
            }
          />

          {/* Admins */}
          <Route
            path="comptes-admin"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminList />
              </RequirePermission>
            }
          />
          <Route
            path="comptes-admin/nouveau"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminNew />
              </RequirePermission>
            }
          />
          <Route
            path="comptes-admin/:userId"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminEdit />
              </RequirePermission>
            }
          />

          {/* Agents API (tokens PAT pour Kuro et intégrations externes) */}
          <Route
            path="agents"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AgentTokensList />
              </RequirePermission>
            }
          />

          {/* System health & activity center */}
          <Route
            path="health"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <SystemHealth />
              </RequirePermission>
            }
          />
          <Route
            path="centre-activite"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <ActivityCenter />
              </RequirePermission>
            }
          />

          {/* Projets */}
          <Route
            path="projets/nouveau"
            element={
              <RequirePermission permission={PERMISSIONS.EDIT_PROJECTS} redirectTo="/admin">
                <ProjectForm />
              </RequirePermission>
            }
          />
          <Route
            path="projets/:id"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <AdminProjectDetail />
              </RequirePermission>
            }
          />
          {/* Redirects: /admin/projects/* → /admin/projets/* */}
          <Route path="projects/:id" element={<ProjectsRedirect />} />
          <Route path="projects" element={<Navigate to="/admin/gestion" replace />} />

          <Route
            path="analytics"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <Analytics />
              </RequirePermission>
            }
          />
          <Route
            path="calendrier"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <Calendar />
              </RequirePermission>
            }
          />
          <Route
            path="templates"
            element={
              <RequirePermission permission={PERMISSIONS.EDIT_PROJECTS} redirectTo="/admin">
                <TemplateList />
              </RequirePermission>
            }
          />
          <Route
            path="crm"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_CRM} redirectTo="/admin">
                <CrmBoard />
              </RequirePermission>
            }
          />
          <Route
            path="crm/settings"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_CRM} redirectTo="/admin/crm">
                <CrmSettings />
              </RequirePermission>
            }
          />
          <Route
            path="audit"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AuditLog />
              </RequirePermission>
            }
          />
          <Route
            path="qualiopi"
            element={
              <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
                <QualiopiBoard />
              </ProtectedRoute>
            }
          />
          <Route
            path="tickets"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_TICKETS} redirectTo="/admin">
                <TicketList />
              </RequirePermission>
            }
          />
          <Route
            path="dev"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_DEV} redirectTo="/admin">
                <DevWorkspace />
              </RequirePermission>
            }
          />
          <Route
            path="dev/issues/:issueId"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_DEV} redirectTo="/admin">
                <DevWorkspace />
              </RequirePermission>
            }
          />
          <Route
            path="dev/projects/:projectId"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_DEV} redirectTo="/admin">
                <DevWorkspace />
              </RequirePermission>
            }
          />
          <Route
            path="acces-outils"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <ToolAccessList />
              </RequirePermission>
            }
          />
          <Route
            path="gestion"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <GestionBoard />
              </RequirePermission>
            }
          />
          <Route
            path="messages"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_MESSAGING} redirectTo="/admin">
                <Messaging />
              </RequirePermission>
            }
          />
          <Route
            path="stagiaires"
            element={
              <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
                <InternList />
              </ProtectedRoute>
            }
          />
          <Route
            path="stagiaires/:id"
            element={
              <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
                <InternDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="projets-internes"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <InternalProjectList />
              </RequirePermission>
            }
          />
          <Route
            path="projets-internes/:id"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <InternalProjectDetail />
              </RequirePermission>
            }
          />
          <Route
            path="ressources"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_CONTENT} redirectTo="/admin">
                <Resources />
              </RequirePermission>
            }
          />
          <Route
            path="arrow-prospection"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_CRM} redirectTo="/admin">
                <ArrowProspection />
              </RequirePermission>
            }
          />
          <Route
            path="mes-rapports"
            element={
              // TODO: permission dédiée si besoin
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <MyReports />
              </RequirePermission>
            }
          />
          {/* Intentionnellement non protégé: accessible à tout admin authentifié (ProtectedRoute parent suffit) */}
          <Route path="guide" element={<AdminGuide />} />
          <Route
            path="emails"
            element={
              <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
                <EmailComposer />
              </ProtectedRoute>
            }
          />

          {/* Comptabilité */}
          <Route
            path="comptabilite"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingDashboard />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/parametres"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin/comptabilite">
                <AccountingSettings />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/plan-comptable"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <ChartOfAccounts />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/journaux"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingJournals />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/ecritures"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingEntries />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/ecritures/nouvelle"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin/comptabilite">
                <AccountingEntryForm />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/ecritures/:id"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingEntryDetail />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/grand-livre"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <GeneralLedger />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/balance"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <TrialBalance />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/bilan"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <BalanceSheet />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/resultat"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <IncomeStatement />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/tva"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_VAT} redirectTo="/admin">
                <VatDeclarations />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/tva/:id"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_VAT} redirectTo="/admin">
                <VatDeclarationDetail />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/fec"
            element={
              <RequirePermission permission={PERMISSIONS.EXPORT_FEC} redirectTo="/admin">
                <FecExport />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/lettrage"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <Lettrage />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/sources-externes"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_EXTERNAL_SOURCES} redirectTo="/admin">
                <ExternalSources />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/sources-externes/:id"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_EXTERNAL_SOURCES} redirectTo="/admin">
                <ExternalSourceDetail />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/file-attente"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <DraftQueue />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/audit"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingAuditLog />
              </RequirePermission>
            }
          />
        </Route>
      </Routes>
      </Suspense>
      {!isPublicQuestionnaire && !isPortal && <Footer />}
      <CookieConsent />
      <ToastContainer />
      <Suspense fallback={null}>
        <SearchModal />
      </Suspense>
    </ToastProvider>
    </NotificationProvider>
    </ThemeProvider>
    </I18nProvider>
  )
}

export default App
