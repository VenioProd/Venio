import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('010-crm-rgpd')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '010']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
