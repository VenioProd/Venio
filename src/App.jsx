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
import AdminShell from './components/AdminShell'
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
              <AdminShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />

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

          <Route
            path="crm"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_CRM} redirectTo="/admin">
                <CrmBoard />
              </RequirePermission>
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
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingSettings />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/plan-comptable"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingChartOfAccounts />
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
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
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
                <AccountingGeneralLedger />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/balance"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingTrialBalance />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/bilan"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingBalanceSheet />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/resultat"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_ACCOUNTING} redirectTo="/admin">
                <AccountingIncomeStatement />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/tva"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_VAT} redirectTo="/admin">
                <AccountingVatDeclarations />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/tva/:id"
            element={
              <RequirePermission permission={PERMISSIONS.VIEW_VAT} redirectTo="/admin">
                <AccountingVatDeclarationDetail />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/fec"
            element={
              <RequirePermission permission={PERMISSIONS.EXPORT_FEC} redirectTo="/admin">
                <AccountingFecExport />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/lettrage"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <AccountingLettrage />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/sources-externes"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_EXTERNAL_SOURCES} redirectTo="/admin">
                <AccountingExternalSources />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/sources-externes/:id"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_EXTERNAL_SOURCES} redirectTo="/admin">
                <AccountingExternalSourceDetail />
              </RequirePermission>
            }
          />
          <Route
            path="comptabilite/file-attente"
            element={
              <RequirePermission permission={PERMISSIONS.MANAGE_ACCOUNTING} redirectTo="/admin">
                <AccountingDraftQueue />
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
      <Footer />
    </>
  )
}

export default App
