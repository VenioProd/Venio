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
            includeDependenciesRecursively: false,
            groups: [
              { name: 'vendor-react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 30 },
              { name: 'vendor-router', test: /node_modules\/(react-router|react-router-dom)\//, priority: 20 },
              { name: 'vendor-charts', test: /node_modules\/recharts\//, priority: 10 },
              { name: 'vendor-realtime', test: /node_modules\/socket.io-client\// },
            ],
          },
        },
      },
    },
    test: {
      // Force NODE_ENV=test dans les workers : avec NODE_ENV=production, React
      // charge son build de production et testing-library échoue
      // (« act(...) is not supported in production builds of React »).
      env: { NODE_ENV: 'test' },
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
