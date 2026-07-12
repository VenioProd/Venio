import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RELEASE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'COMMERCIAL', 'RH', 'COMPTABLE', 'VIEWER', 'STAGIAIRE']
const args = process.argv.slice(2)
const validated = args.includes('--validated')
const outputIndex = args.indexOf('--output')

if (outputIndex !== -1 && !args[outputIndex + 1]) {
  throw new Error('--output requires a path')
}

function gitValue(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
  } catch {
    return 'unavailable'
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const matrix = JSON.parse(readFileSync(resolve(root, 'rbac-matrix.json'), 'utf8'))
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const outputPath = resolve(
  root,
  outputIndex === -1 ? `artifacts/admin-role-recipe/report-${timestamp}.json` : args[outputIndex + 1],
)

const report = {
  recipe: 'VENIO-104 admin multi-rôles',
  generatedAt: new Date().toISOString(),
  result: validated ? 'PASS' : 'DRAFT',
  resultNote: validated
    ? 'Généré après npm run test:admin-role-recipe dans la même commande de recette.'
    : 'Rapport descriptif uniquement : exécuter npm run recipe:admin-roles pour une attestation PASS.',
  revision: gitValue('rev-parse', 'HEAD'),
  branch: gitValue('branch', '--show-current'),
  roles: RELEASE_ROLES.map((role) => ({
    role,
    permissions: matrix.rolePermissions[role],
    uiPolicy:
      'Navigation calculée depuis rbac-matrix.json et vérifiée par src/lib/__tests__/admin-role-recipe.test.ts.',
  })),
  automatedCoverage: {
    frontend: ['navigation UI autorisée/interdite pour les sept rôles'],
    backend: [
      'login par cookie de session pour chaque rôle',
      'MFA TOTP obligatoire pour SUPER_ADMIN et ADMIN',
      'refus MFA expirée et step-up MFA manquant',
      'permissions CRM, comptabilité, tickets et administration des comptes',
      'scoping CRM et tickets : périmètre propre hors SUPER_ADMIN',
    ],
    fixtures:
      'MongoMemoryServer, utilisateurs, TOTP, leads et tickets synthétiques générés à l’exécution puis supprimés.',
    commands: ['npm run test:admin-role-recipe', 'npm run recipe:admin-roles'],
  },
  productionSmoke: {
    status: 'NOT_EXECUTED',
    reason: 'Aucune autorisation de production contrôlée ni identifiants synthétiques dédiés fournis.',
    requiredPreconditions: [
      'Approbation explicite du responsable de production.',
      'Sept comptes synthétiques isolés, un par rôle, sans réutilisation de comptes réels.',
      'MFA configurée pour SUPER_ADMIN et ADMIN dans le gestionnaire approuvé, sans exporter de secrets.',
      'Fenêtre de test et procédure de nettoyage approuvées.',
    ],
  },
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${outputPath}\n`)
