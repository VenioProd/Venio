import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // On sérialise l'exécution des fichiers de tests pour éviter que
    // plusieurs MongoMemoryServer démarrent en parallèle (saturation
    // CPU/mémoire). Plus lent mais déterministe.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 15_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/uploads/**',
      '**/.git/**',
    ],
  },
})
