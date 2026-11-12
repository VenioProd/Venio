import { runMigrationCli } from '../../src/scripts/migrate.js'
export { migrateCrmRevenue } from '../../src/lib/crmGoalsMigration.js'
export type { CrmRevenueMigrationResult } from '../../src/lib/crmGoalsMigration.js'

if (process.argv[1]?.includes('009-crm-revenue')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '009']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
