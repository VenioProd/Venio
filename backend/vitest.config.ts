import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    // Force NODE_ENV=test dans les workers, même si l'environnement hôte
    // exporte NODE_ENV=production (CI, shell de déploiement) : sinon les
    // gardes « production » du code applicatif changent le comportement testé.
    env: { NODE_ENV: 'test' },
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/helpers/listenLoopback.ts'],
    // On sérialise l'exécution des fichiers de tests pour éviter que
    // plusieurs MongoMemoryServer démarrent en parallèle (saturation
    // CPU/mémoire). Plus lent mais déterministe.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/uploads/**', '**/.git/**'],
  },
})
