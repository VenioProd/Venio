import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('012-project-sheets')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '012']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
