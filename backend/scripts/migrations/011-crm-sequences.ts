import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('011-crm-sequences')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '011']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
