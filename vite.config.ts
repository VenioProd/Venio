/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      port: 5501,
      host: '0.0.0.0',
      open: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      // Preserve the browser baseline used before the Vite 8 migration.
      target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name(id) {
                  if (id.includes('node_modules/react-router-dom')) return 'vendor-router'
                  if (id.includes('node_modules/react-dom')) return 'vendor-react'
                  if (id.includes('node_modules/react/')) return 'vendor-react'
                  if (id.includes('node_modules/recharts')) return 'vendor-charts'
                  if (id.includes('node_modules/socket.io-client')) return 'vendor-realtime'
                  return null
                },
              },
            ],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.claude/**',
        '**/.superpowers/**',
        '**/dist/**',
        '**/backend/**',
        '**/e2e/**',
      ],
    },
  }
})
