import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('007-crm-lead-entity')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '007']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
