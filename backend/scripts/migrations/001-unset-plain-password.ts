import { runMigrationCli } from '../../src/scripts/migrate.js'

if (process.argv[1]?.includes('001-unset-plain-password')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '001']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
