import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ToastContainer from './components/ToastContainer'
import ProtectedRoute from './components/ProtectedRoute'
import { ToastProvider } from './context/ToastContext'
import { NotificationProvider } from './context/NotificationContext'
import { ThemeProvider } from './context/ThemeContext'
import { I18nProvider } from './context/I18nContext'
import RequirePermission from './components/RequirePermission'
import { ADMIN_ROLES, PERMISSIONS } from './lib/permissions'
import CookieConsent from './components/CookieConsent'
import './App.css'

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
const AdminGuide = lazy(() => import('./pages/admin/AdminGuide'))
const ClientGuide = lazy(() => import('./pages/espace-client/ClientGuide'))
const InternList = lazy(() => import('./pages/admin/InternList'))
const InternDetail = lazy(() => import('./pages/admin/InternDetail'))
const MyReports = lazy(() => import('./pages/admin/MyReports'))
const EmailComposer = lazy(() => import('./pages/admin/EmailComposer'))
const SearchModal = lazy(() => import('./components/admin/SearchModal'))
const InternalProjectList = lazy(() => import('./pages/admin/InternalProjectList'))
const InternalProjectDetail = lazy(() => import('./pages/admin/InternalProjectDetail'))
const Resources = lazy(() => import('./pages/admin/Resources'))
const ArrowProspection = lazy(() => import('./pages/admin/ArrowProspection'))

function ProjectsRedirect() {
  const { id } = useParams()
  const location = useLocation()
  return <Navigate to={`/admin/projets/${id}${location.search}`} replace />
}

function App() {
  const location = useLocation()
  const isPublicQuestionnaire = location.pathname.startsWith('/questionnaire/')

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
    <NotificationProvider>
    <ToastProvider>
      {!isPublicQuestionnaire && <Navbar />}
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
              <ClientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/espace-client/guide"
          element={
            <ProtectedRoute role="CLIENT" redirectTo="/espace-client/login">
              <ClientGuide />
            </ProtectedRoute>
          }
        />
        <Route
          path="/espace-client/profil"
          element={
            <ProtectedRoute role="CLIENT" redirectTo="/espace-client/login">
              <ClientProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/espace-client/projets/:id"
          element={
            <ProtectedRoute role="CLIENT" redirectTo="/espace-client/login">
              <ClientProjectDetail />
            </ProtectedRoute>
          }
        />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/profil"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <AdminProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-clients"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountList />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-clients/nouveau"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountNew />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-clients/:userId"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-admin"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminList />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-admin/nouveau"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminNew />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-admin/:userId"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminEdit />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projets/nouveau"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.EDIT_PROJECTS} redirectTo="/admin">
                <ProjectForm />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projets/:id"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <AdminProjectDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        {/* Redirects: /admin/projects/* → /admin/projets/* */}
        <Route path="/admin/projects/:id" element={<ProjectsRedirect />} />
        <Route path="/admin/projects" element={<Navigate to="/admin/gestion" replace />} />

        <Route
          path="/admin/analytics"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <Analytics />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/calendrier"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <Calendar />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/templates"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.EDIT_PROJECTS} redirectTo="/admin">
                <TemplateList />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/crm"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_CRM} redirectTo="/admin">
                <CrmBoard />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AuditLog />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/qualiopi"
          element={
            <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
              <QualiopiBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/tickets"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <TicketList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/acces-outils"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <ToolAccessList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/gestion"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <GestionBoard />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/stagiaires"
          element={
            <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
              <InternList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/stagiaires/:id"
          element={
            <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
              <InternDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projets-internes"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <InternalProjectList />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projets-internes/:id"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <InternalProjectDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/ressources"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <Resources />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/arrow-prospection"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <ArrowProspection />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/mes-rapports"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <MyReports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/guide"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <AdminGuide />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/emails"
          element={
            <ProtectedRoute role={['SUPER_ADMIN', 'RH']} redirectTo="/admin/login">
              <EmailComposer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/crm/settings"
          element={
            <ProtectedRoute role={[...ADMIN_ROLES]} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CRM} redirectTo="/admin/crm">
                <CrmSettings />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
      {!isPublicQuestionnaire && <Footer />}
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
