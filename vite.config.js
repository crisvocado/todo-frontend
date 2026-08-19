import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { port: 3010 },
  test: {
    environment: 'jsdom',
    globals: true,
    env: {
      VITE_LOGCORE_ENABLED: 'true',
      VITE_LOGCORE_URL: 'https://logcore.example.com',
      VITE_LOGCORE_KEY: 'test-key',
    },
  },
})
