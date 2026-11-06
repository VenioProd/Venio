// Domaines privés (admin, espace client, bêta) : chargés à la demande, voir loadLazyMessages().
import accAccounts from './accAccounts'
import accProjects from './accProjects'
import accVat from './accVat'
import adminAccess from './adminAccess'
import adminOps from './adminOps'
import adminTech from './adminTech'
import beta from './beta'
import bulk from './bulk'
import changeReq from './changeReq'
import commercial from './commercial'
import client from './client'
import compA from './compA'
import compB from './compB'
import crm from './crm'
import devA from './devA'
import devB from './devB'
import eduA from './eduA'
import eduB from './eduB'
import eduC from './eduC'
import eduD from './eduD'
import home from './home'
import intern from './intern'
import orgs from './orgs'
import projA from './projA'
import projB from './projB'
import projects from './projects'
import crmAuto from './crmAuto'
import crmRich from './crmRich'
import crmPrivacy from './crmPrivacy'
import crmSuppression from './crmSuppression'
import portfolio from './portfolio'

const messages = {
  ...accAccounts,
  ...accProjects,
  ...accVat,
  ...adminAccess,
  ...adminOps,
  ...adminTech,
  ...beta,
  ...bulk,
  ...changeReq,
  ...commercial,
  ...client,
  ...compA,
  ...compB,
  ...crm,
  ...devA,
  ...devB,
  ...eduA,
  ...eduB,
  ...eduC,
  ...eduD,
  ...home,
  ...intern,
  ...orgs,
  ...projA,
  ...projB,
  ...projects,
  ...crmAuto,
  ...crmRich,
  ...crmPrivacy,
  ...crmSuppression,
  ...portfolio,
}

export default messages
