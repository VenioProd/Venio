import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('006-crm-post-demo-rule')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '006']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
