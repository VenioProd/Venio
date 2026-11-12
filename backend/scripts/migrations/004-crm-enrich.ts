import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('004-crm-enrich')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '004']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
