import { defineConfig } from '@playwright/test'

const connected = process.env.VENIO_E2E_CONNECTED === '1'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: connected ? 'http://localhost:5501' : 'http://127.0.0.1:4173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
  },
  webServer: connected
    ? [
        {
          command: 'backend/node_modules/.bin/tsx backend/src/scripts/devPreviewCommerciauxExternes.ts',
          url: 'http://localhost:3000/api/health',
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: 'npm run dev -- --host localhost --strictPort',
          env: { BROWSER: 'none' },
          url: 'http://localhost:5501',
          reuseExistingServer: false,
          timeout: 30_000,
        },
      ]
    : {
        command: 'npm run preview -- --host 127.0.0.1',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
})
