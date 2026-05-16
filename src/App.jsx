import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import ServicesCommunication from './pages/ServicesCommunication'
import ServicesDeveloppement from './pages/ServicesDeveloppement'
import ServicesConseil from './pages/ServicesConseil'
import PolesPage from './pages/PolesPage'
import Realisations from './pages/Realisations'
import APropos from './pages/APropos'
import Contact from './pages/Contact'
import Legal from './pages/Legal'
import CGU from './pages/CGU'
import ClientLogin from './pages/espace-client/Login'
import ClientDashboard from './pages/espace-client/Dashboard'
import ClientProjectDetail from './pages/espace-client/ProjectDetail'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import ClientAccountList from './pages/admin/ClientAccountList'
import ClientAccountNew from './pages/admin/ClientAccountNew'
import ClientAccountDetail from './pages/admin/ClientAccountDetail'
import AdminList from './pages/admin/AdminList'
import AdminNew from './pages/admin/AdminNew'
import AdminEdit from './pages/admin/AdminEdit'
import ProjectForm from './pages/admin/ProjectForm'
import AdminProjectDetail from './pages/admin/ProjectDetail'
import CrmBoard from './pages/admin/CrmBoard'
import AccountingDashboard from './pages/admin/accounting/AccountingDashboard'
import AccountingSettings from './pages/admin/accounting/Settings'
import AccountingChartOfAccounts from './pages/admin/accounting/ChartOfAccounts'
import AccountingJournals from './pages/admin/accounting/Journals'
import AccountingEntries from './pages/admin/accounting/Entries'
import AccountingEntryForm from './pages/admin/accounting/EntryForm'
import AccountingEntryDetail from './pages/admin/accounting/EntryDetail'
import AccountingGeneralLedger from './pages/admin/accounting/GeneralLedger'
import AccountingTrialBalance from './pages/admin/accounting/TrialBalance'
import AccountingBalanceSheet from './pages/admin/accounting/BalanceSheet'
import AccountingIncomeStatement from './pages/admin/accounting/IncomeStatement'
import AccountingVatDeclarations from './pages/admin/accounting/VatDeclarations'
import AccountingVatDeclarationDetail from './pages/admin/accounting/VatDeclarationDetail'
import AccountingFecExport from './pages/admin/accounting/FecExport'
import AccountingLettrage from './pages/admin/accounting/Lettrage'
import AccountingExternalSources from './pages/admin/accounting/ExternalSources'
import AccountingExternalSourceDetail from './pages/admin/accounting/ExternalSourceDetail'
import AccountingDraftQueue from './pages/admin/accounting/DraftQueue'
import AccountingAuditLog from './pages/admin/accounting/AuditLog'
import RequirePermission from './components/RequirePermission'
import { ADMIN_ROLES, PERMISSIONS } from './lib/permissions'
import './App.css'

function App() {
  useEffect(() => {
    document.body.classList.add('gpu-off')
    localStorage.setItem('gpu-mode', 'false')
    return () => {
      document.body.classList.remove('gpu-off')
    }
  }, [])

  return (
    <>
      <Navbar />
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
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-clients"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountList />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-clients/nouveau"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountNew />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-clients/:userId"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_CLIENTS} redirectTo="/admin">
                <ClientAccountDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-admin"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminList />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-admin/nouveau"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminNew />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptes-admin/:userId"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ADMINS} redirectTo="/admin">
                <AdminEdit />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projets/nouveau"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.EDIT_PROJECTS} redirectTo="/admin">
                <ProjectForm />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/projets/:id"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_PROJECTS} redirectTo="/admin">
                <AdminProjectDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/crm"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_CRM} redirectTo="/admin">
                <CrmBoard />
              </RequirePermission>
            </ProtectedRoute>
          }
        />

        {/* Comptabilité */}
        <Route
          path="/admin/comptabilite"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingDashboard />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/parametres"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingSettings />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/plan-comptable"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingChartOfAccounts />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/journaux"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingJournals />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/ecritures"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingEntries />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/ecritures/nouvelle"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <AccountingEntryForm />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/ecritures/:id"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingEntryDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/grand-livre"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingGeneralLedger />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/balance"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingTrialBalance />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/bilan"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingBalanceSheet />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/resultat"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingIncomeStatement />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/tva"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_VAT} redirectTo="/admin">
                <AccountingVatDeclarations />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/tva/:id"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_VAT} redirectTo="/admin">
                <AccountingVatDeclarationDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/fec"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.EXPORT_FEC} redirectTo="/admin">
                <AccountingFecExport />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/lettrage"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <AccountingLettrage />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/sources-externes"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_EXTERNAL_SOURCES} redirectTo="/admin">
                <AccountingExternalSources />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/sources-externes/:id"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_EXTERNAL_SOURCES} redirectTo="/admin">
                <AccountingExternalSourceDetail />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/file-attente"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <AccountingDraftQueue />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/comptabilite/audit"
          element={
            <ProtectedRoute role={ADMIN_ROLES} redirectTo="/admin/login">
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingAuditLog />
              </RequirePermission>
            </ProtectedRoute>
          }
        />
      </Routes>
      <Footer />
    </>
  )
}

export default App
