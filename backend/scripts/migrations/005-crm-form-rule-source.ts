import { runMigrationCli } from '../../src/scripts/migrate.js'
export { FORM_RULE_KEY, FORM_SOURCE, addFormSourceToRule } from '../../src/lib/migrations.js'

if (process.argv[1]?.includes('005-crm-form-rule-source')) {
  runMigrationCli([process.argv.includes('--apply') ? '--apply' : '--dry-run', '005']).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
