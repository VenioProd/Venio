import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('014-phone-suppression')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '014']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
