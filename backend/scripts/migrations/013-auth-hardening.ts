import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('013-auth-hardening')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '013']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
