import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('003-notes-to-interactions')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '003']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
