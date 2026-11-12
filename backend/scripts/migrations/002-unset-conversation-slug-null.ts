import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('002-unset-conversation-slug-null')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '002']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
